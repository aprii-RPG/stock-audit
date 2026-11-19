import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";
import { deleteObject } from "../lib/r2.js";

const SELECT_AUDIT = `
  SELECT a.*, to_char(a.audit_date,'YYYY-MM-DD') AS audit_date_text, s.name AS store_name
  FROM audits a JOIN stores s ON s.id = a.store_id`;

function shape(r, assigns) {
  const mine = assigns.filter((x) => x.audit_id === r.id);
  return {
    id: r.id, name: r.name, storeId: r.store_id, storeName: r.store_name, type: r.type,
    date: r.audit_date_text, status: r.status,
    assignedAuditorIds: mine.filter((x) => x.assign_role === "auditor").map((x) => x.user_id),
    assignedBackOfficeIds: mine.filter((x) => x.assign_role === "back office").map((x) => x.user_id),
    snapshotLockedAt: r.snapshot_locked_at
      ? new Date(r.snapshot_locked_at).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        })
      : "",
    cutoffBillNo: r.cutoff_bill_no || "",
    notes: r.notes || undefined,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

async function loadAudits(whereSql, params) {
  const q = await pool.query(`${SELECT_AUDIT} ${whereSql} ORDER BY a.created_at DESC`, params);
  if (q.rows.length === 0) return [];
  const ids = q.rows.map((r) => r.id);
  const as = await pool.query(
    `SELECT audit_id, user_id, assign_role FROM audit_assignments WHERE audit_id = ANY($1)`, [ids]);
  return q.rows.map((r) => shape(r, as.rows));
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const user = await requireUser(req, res);
      if (!user) return;
      const params = [];
      const where = [];
      const storeId = req.query.storeId;
      if (storeId && storeId !== "ALL") { params.push(storeId); where.push(`a.store_id = $${params.length}`); }
      if (user.role === "auditor") {
        params.push(user.id);
        where.push(`a.id IN (SELECT audit_id FROM audit_assignments WHERE user_id = $${params.length})`);
      }
      const audits = await loadAudits(where.length ? `WHERE ${where.join(" AND ")}` : "", params);
      return res.status(200).json({ audits });
    }

    if (req.method === "POST") {
      const user = await requireUser(req, res, ["admin", "back office"]);
      if (!user) return;
      const b = req.body || {};
      if (!b.storeId || !b.type || !b.date) {
        return res.status(400).json({ error: "Store, type and date are required." });
      }
      const auditors = Array.isArray(b.assignedAuditorIds) ? b.assignedAuditorIds : [];
      const backs = Array.isArray(b.assignedBackOfficeIds) ? b.assignedBackOfficeIds : [];
      if (
        b.productSelectionType === "category" &&
        (!Array.isArray(b.categoryValues) ||
          b.categoryValues.length === 0 ||
          b.categoryValues.length > 27 ||
          b.categoryValues.some((category) => typeof category !== "string" || !category.trim()) ||
          new Set(b.categoryValues).size !== b.categoryValues.length)
      ) {
        return res.status(400).json({ error: "Select one or more valid product categories." });
      }
      if (
        b.productSelectionType === "category" &&
        (!Number.isInteger(b.productLimit) || b.productLimit < 1 || b.productLimit > 1000000)
      ) {
        return res.status(400).json({ error: "For category audits, productLimit must be an integer from 1 to 1,000,000." });
      }
      const st = await pool.query(`SELECT id, name FROM stores WHERE id = $1`, [b.storeId]);
      if (!st.rows[0]) return res.status(404).json({ error: "Store not found." });
      const store = st.rows[0];
      const id = `AUD-${Date.now()}`;
      const name = `${store.name.split(" ")[0].toUpperCase()} / ${b.type} / ${b.date}`;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO audits (id, name, store_id, type, audit_date, status, snapshot_locked_at, cutoff_bill_no, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,'in_progress',now(),$6,$7,$8)`,
          [id, name, store.id, b.type, b.date, b.cutoffBillNo || "N/A", b.notes || null, user.id]);
        for (const uid of auditors) {
          await client.query(`INSERT INTO audit_assignments (audit_id, user_id, assign_role) VALUES ($1,$2,'auditor') ON CONFLICT DO NOTHING`, [id, uid]);
        }
        for (const uid of backs) {
          await client.query(`INSERT INTO audit_assignments (audit_id, user_id, assign_role) VALUES ($1,$2,'back office') ON CONFLICT DO NOTHING`, [id, uid]);
        }
        const params = [id, store.id];
        let extra = "";
        if (b.productSelectionType === "category") {
          params.push(b.categoryValues);
          extra = " AND p.category = ANY($3::text[])";
        }
        else if (b.productSelectionType === "company" && b.filterValue) { params.push(b.filterValue); extra = " AND p.company = $3"; }
        if (b.productSelectionType === "category") {
          params.push(b.productLimit);
          extra += ` ORDER BY p.code LIMIT $${params.length}`;
        }
        const ins = await client.query(
          `INSERT INTO audit_items (id, audit_id, product_id, bin, snapshot_qty)
           SELECT 'ITM-' || $1::text || '-' || (ROW_NUMBER() OVER (ORDER BY p.code))::text, $1::text, p.id, sp.default_bin, sp.system_qty
           FROM store_products sp JOIN products p ON p.id = sp.product_id
           WHERE sp.store_id = $2${extra}`, params);
        if (ins.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "No products found for this store and filter." });
        }
        await logAction(client, user, {
          action: "AUDIT_CREATED", auditId: id, auditName: name,
          details: `Audit ${name} created with ${ins.rowCount} products.`,
        });
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      const [audit] = await loadAudits("WHERE a.id = $1", [id]);
      return res.status(201).json({ audit });
    }

    if (req.method === "PATCH") {
      const user = await requireUser(req, res, ["admin", "back office"]);
      if (!user) return;
      const b = req.body || {};
      const validTypes = [
        "QUARTERLY FULL AUDIT",
        "MONTHLY CYCLE COUNT",
        "HIGH-VALUE NARCOTICS",
        "SPOT RECOUNT",
      ];
      const isValidDate =
        typeof b.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
        !Number.isNaN(Date.parse(`${b.date}T00:00:00Z`)) &&
        new Date(`${b.date}T00:00:00Z`).toISOString().slice(0, 10) === b.date;
      if (
        typeof b.auditId !== "string" ||
        !b.auditId.trim() ||
        !validTypes.includes(b.type) ||
        !isValidDate ||
        !Array.isArray(b.assignedAuditorIds) ||
        b.assignedAuditorIds.length === 0 ||
        !b.assignedAuditorIds.every((id) => typeof id === "string" && id.trim()) ||
        !Array.isArray(b.assignedBackOfficeIds) ||
        !b.assignedBackOfficeIds.every((id) => typeof id === "string" && id.trim()) ||
        (b.notes !== undefined && typeof b.notes !== "string")
      ) {
        return res.status(400).json({ error: "Valid planner details and at least one auditor are required." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT a.id, a.name, a.status, a.store_id, s.name AS store_name
           FROM audits a JOIN stores s ON s.id = a.store_id
           WHERE a.id = $1 FOR UPDATE`,
          [b.auditId]
        );
        const audit = result.rows[0];
        if (!audit) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Audit planner not found." });
        }
        if (audit.status !== "in_progress") {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Only an in-progress audit planner can be updated." });
        }

        const name = `${audit.store_name.split(" ")[0].toUpperCase()} / ${b.type} / ${b.date}`;
        await client.query(
          `UPDATE audits SET name = $2, type = $3, audit_date = $4, notes = $5 WHERE id = $1`,
          [b.auditId, name, b.type, b.date, b.notes || null]
        );
        await client.query(`DELETE FROM audit_assignments WHERE audit_id = $1`, [b.auditId]);
        for (const uid of [...new Set(b.assignedAuditorIds)]) {
          await client.query(
            `INSERT INTO audit_assignments (audit_id, user_id, assign_role) VALUES ($1,$2,'auditor')`,
            [b.auditId, uid]
          );
        }
        for (const uid of [...new Set(b.assignedBackOfficeIds)]) {
          await client.query(
            `INSERT INTO audit_assignments (audit_id, user_id, assign_role) VALUES ($1,$2,'back office')`,
            [b.auditId, uid]
          );
        }
        await logAction(client, user, {
          action: "AUDIT_UPDATED",
          auditId: b.auditId,
          auditName: name,
          details: `In-progress audit planner ${name} updated by ${user.name}.`,
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      const [updated] = await loadAudits("WHERE a.id = $1", [b.auditId]);
      return res.status(200).json({ audit: updated });
    }

    if (req.method === "DELETE") {
      const user = await requireUser(req, res, ["admin", "back office"]);
      if (!user) return;
      const { auditId } = req.body || {};
      if (typeof auditId !== "string" || !auditId.trim()) {
        return res.status(400).json({ error: "auditId is required." });
      }

      const client = await pool.connect();
      let photoKeys = [];
      try {
        await client.query("BEGIN");
        const auditResult = await client.query(
          `SELECT id, name FROM audits WHERE id = $1 FOR UPDATE`,
          [auditId]
        );
        const audit = auditResult.rows[0];
        if (!audit) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Audit planner not found." });
        }

        const photos = await client.query(
          `SELECT photo_url FROM audit_items WHERE audit_id = $1 AND photo_url IS NOT NULL`,
          [auditId]
        );
        photoKeys = photos.rows.map((row) => row.photo_url);

        const deletedItems = await client.query(
          `DELETE FROM audit_items WHERE audit_id = $1`,
          [auditId]
        );
        const deletedAssignments = await client.query(
          `DELETE FROM audit_assignments WHERE audit_id = $1`,
          [auditId]
        );
        await logAction(client, user, {
          action: "AUDIT_DELETED",
          auditName: audit.name,
          details: `Audit ${audit.name} and its ${deletedItems.rowCount} product records and ${deletedAssignments.rowCount} assignments were deleted by ${user.name}.`,
        });
        await client.query(`DELETE FROM audits WHERE id = $1`, [auditId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      await Promise.all(photoKeys.map((key) => deleteObject(key)));
      return res.status(200).json({ deleted: true, auditId });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}