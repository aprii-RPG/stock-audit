import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";
import { ITEM_SELECT, toAuditItem } from "../lib/mappers.js";
import { deleteObject } from "../lib/r2.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let client;
  try {
    const user = await requireUser(req, res, ["admin", "back office"]);
    if (!user) return;

    const { auditId, productId, recountAssigneeId, note } = req.body || {};
    if (
      typeof auditId !== "string" ||
      !auditId.trim() ||
      typeof productId !== "string" ||
      !productId.trim() ||
      typeof recountAssigneeId !== "string" ||
      !recountAssigneeId.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return res.status(400).json({ error: "Audit, product, recount auditor, and valid note are required." });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT i.id, i.audit_id, i.product_id, i.status AS item_status,
              i.counted_by_user_id, i.physical_count, i.photo_url,
              a.name AS audit_name, a.status AS audit_status, a.store_id,
              p.name AS product_name
         FROM audit_items i
         JOIN audits a ON a.id = i.audit_id
         JOIN products p ON p.id = i.product_id
        WHERE i.audit_id = $1 AND i.product_id = $2
        FOR UPDATE OF i, a`,
      [auditId, productId]
    );
    const item = result.rows[0];
    if (!item) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Audit product was not found." });
    }
    if (item.audit_status !== "in_progress") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Products can only be sent for recount while the audit is in progress." });
    }
    if (item.physical_count === null) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This product has no submitted count to recount." });
    }
    if (item.status === "recount") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This product is already awaiting recount." });
    }

    const assigneeResult = await client.query(
      `SELECT id, name, role FROM users WHERE id = $1 AND is_active = TRUE`,
      [recountAssigneeId]
    );
    const assignee = assigneeResult.rows[0];
    if (!assignee || assignee.role !== "auditor") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Select an active field auditor for the recount." });
    }
    const recountNote = (note || "Recount requested for a previously exact-match product.").trim().slice(0, 500);
    await client.query(
      `UPDATE audit_items
          SET status = 'recount',
              recount_assigned_to_id = $3,
              recount_note = $4,
              approved_by_user_id = NULL,
              approved_by_name = NULL,
              approved_at = NULL,
              approval_tier = NULL,
              photo_url = NULL,
              photo_source = NULL,
              photo_captured_at = NULL,
              photo_gps_lat = NULL,
              photo_gps_lng = NULL,
              photo_gps_accuracy = NULL,
              photo_distance_from_store_m = NULL,
              photo_within_window = NULL,
              photo_status = 'none',
              photo_reject_reason = NULL
        WHERE audit_id = $1 AND product_id = $2`,
      [auditId, productId, recountAssigneeId, recountNote]
    );
    await client.query(
      `INSERT INTO audit_assignments (audit_id, user_id, assign_role)
       VALUES ($1, $2, 'auditor')
       ON CONFLICT DO NOTHING`,
      [auditId, recountAssigneeId]
    );
    await logAction(client, user, {
      action: "RECOUNT_DISPATCHED",
      auditId,
      auditName: item.audit_name,
      productId,
      productName: item.product_name,
      details: `Exact-match product ${item.product_name} was sent for recount to ${assignee.name}.`,
    });

    const updated = await client.query(`${ITEM_SELECT} WHERE i.id = $1`, [item.id]);
    await client.query("COMMIT");
    if (item.photo_url) await deleteObject(item.photo_url);
    return res.status(200).json({ item: toAuditItem(updated.rows[0], false) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("recount dispatch error", error);
    return res.status(500).json({ error: "Could not dispatch product for recount." });
  } finally {
    client?.release();
  }
}
