import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";
import { ITEM_SELECT, toAuditItem } from "../lib/mappers.js";

const VALID_REASONS = new Set([
  "expired",
  "damaged",
  "theft_loss",
  "wrong_billing",
  "purchase_not_entered",
  "return_not_entered",
  "wrong_batch",
  "none",
]);
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let client;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!["admin", "back office"].includes(String(user.role).trim().toLowerCase())) {
      return res.status(403).json({ error: "Only admin and back-office users can approve products." });
    }

    const { auditId, productId, reason = "none", reasonNote } = req.body || {};
    if (!auditId || !productId) {
      return res.status(400).json({ error: "auditId and productId are required." });
    }
    if (!VALID_REASONS.has(reason)) {
      return res.status(400).json({ error: "Invalid difference reason." });
    }
    if (reasonNote !== undefined && typeof reasonNote !== "string") {
      return res.status(400).json({ error: "Reason note must be text." });
    }
    const cleanReasonNote = typeof reasonNote === "string" ? reasonNote.trim().slice(0, 500) : null;

    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT i.id, i.snapshot_qty, i.sales_after_cutoff, i.returns_after_cutoff,
              i.purchases_after_cutoff, i.physical_count, p.name AS product_name,
              a.name AS audit_name
         FROM audit_items i
         JOIN audits a ON a.id = i.audit_id
         JOIN products p ON p.id = i.product_id
        WHERE i.audit_id = $1 AND i.product_id = $2
        FOR UPDATE OF i`,
      [auditId, productId]
    );
    const item = result.rows[0];
    if (!item) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Audit item not found." });
    }

    const updatedStatus = await client.query(
      `UPDATE audit_items SET
         status = 'approved',
         difference_reason = $3,
         approved_by_name = $4,
         approved_at = now(),
         photo_status = 'approved'
       WHERE audit_id = $1 AND product_id = $2
       RETURNING id, status`,
      [auditId, productId, reason, user.name]
    );
    if (updatedStatus.rowCount !== 1 || updatedStatus.rows[0].status !== "approved") {
      throw new Error("Approval did not update the audit item status.");
    }

    await logAction(client, user, {
      action: "PRODUCT_APPROVED",
      details: `Product approved by ${user.name}. Reason: ${reason}${
        cleanReasonNote ? `. Note: ${cleanReasonNote}` : ""
      }`,
      auditId,
      auditName: item.audit_name,
      productId,
      productName: item.product_name,
    });

    const updated = await client.query(
      `${ITEM_SELECT} WHERE i.audit_id = $1 AND i.product_id = $2`,
      [auditId, productId]
    );
    await client.query("COMMIT");
    return res.status(200).json({ item: toAuditItem(updated.rows[0], false) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("approve-product error", error);
    return res.status(500).json({ error: "Could not approve this audit item." });
  } finally {
    client?.release();
  }
}
