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
const STORE_MANAGER_THRESHOLD = 100;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let client;
  try {
    const user = await requireUser(req, res, ["back office", "admin"]);
    if (!user) return;

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
              i.purchases_after_cutoff, i.physical_count, i.erp_adjustment_no,
              p.name AS product_name, p.unit_price, a.name AS audit_name
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

    const hasCount = item.physical_count !== null && item.physical_count !== undefined;
    const expectedQty =
      (Number(item.snapshot_qty) || 0) -
      (Number(item.sales_after_cutoff) || 0) +
      (Number(item.returns_after_cutoff) || 0) +
      (Number(item.purchases_after_cutoff) || 0);
    const difference = hasCount ? Number(item.physical_count) - expectedQty : 0;
    const differenceValue = Math.round(Math.abs(difference) * (Number(item.unit_price) || 0) * 100) / 100;
    const approvalTier =
      differenceValue > STORE_MANAGER_THRESHOLD ? "head_office" : "store_manager";
    const adjustmentNo =
      difference !== 0 && !item.erp_adjustment_no
        ? `ADJ-${Math.floor(100000 + Math.random() * 900000)}`
        : null;

    await client.query(
      `UPDATE audit_items SET
         status = 'approved',
         difference_reason = $3,
         difference_reason_note = $4,
         approved_by_user_id = $5,
         approved_by_name = $6,
         approved_at = now(),
         photo_status = 'approved',
         approval_tier = $7,
         erp_adjustment_no = COALESCE(erp_adjustment_no, $8),
         erp_adjustment_posted_at = CASE
           WHEN $8::text IS NOT NULL AND erp_adjustment_posted_at IS NULL THEN now()
           ELSE erp_adjustment_posted_at
         END
       WHERE audit_id = $1 AND product_id = $2`,
      [
        auditId,
        productId,
        reason,
        cleanReasonNote,
        user.id,
        user.name,
        approvalTier,
        adjustmentNo,
      ]
    );

    await logAction(client, user, {
      action: "PRODUCT_APPROVED",
      details: `Approved by ${user.name}. Difference: ${difference} (${differenceValue.toFixed(2)}). Reason: ${reason}`,
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
