import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";

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
      ? new Date(r.snapshot_locked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
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
        if (b.productSelectionType === "category" && b.filterValue) { params.push(b.filterValue); extra = " AND p.category = $3"; }
        else if (b.productSelectionType === "company" && b.filterValue) { params.push(b.filterValue); extra = " AND p.company = $3"; }
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

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}