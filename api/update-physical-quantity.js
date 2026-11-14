import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";
import { ITEM_SELECT, toAuditItem } from "../lib/mappers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let client;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!["admin", "back office"].includes(String(user.role).trim().toLowerCase())) {
      return res.status(403).json({ error: "Only admin and back-office users can edit physical quantities." });
    }

    const { itemId } = req.body || {};
    const rawCount = req.body?.physicalCount;
    const count = rawCount;
    if (typeof itemId !== "string" || !itemId.trim()) {
      return res.status(400).json({ error: "itemId is required." });
    }
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0 || count > 1000000) {
      return res.status(400).json({ error: "Enter a valid physical quantity." });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT i.id, i.audit_id, i.product_id, i.physical_count,
              a.name AS audit_name, a.status AS audit_status, p.name AS product_name
         FROM audit_items i
         JOIN audits a ON a.id = i.audit_id
         JOIN products p ON p.id = i.product_id
        WHERE i.id = $1
        FOR UPDATE OF i, a`,
      [itemId]
    );
    const item = result.rows[0];
    if (!item) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Audit item not found." });
    }

    const oldCount = item.physical_count === null ? null : Number(item.physical_count);
    if (oldCount === count) {
      const current = await client.query(`${ITEM_SELECT} WHERE i.id = $1`, [itemId]);
      await client.query("COMMIT");
      return res.status(200).json({ item: toAuditItem(current.rows[0], false), changed: false });
    }

    await client.query(
      `UPDATE audit_items
          SET physical_count = $2,
              count_saved_at = now(),
              status = 'awaiting_approval',
              approved_by_user_id = NULL,
              approved_by_name = NULL,
              approved_at = NULL,
              approval_tier = NULL
        WHERE id = $1`,
      [itemId, count]
    );

    if (item.audit_status === "completed") {
      await client.query(
        `UPDATE audits SET status = 'under_review', completed_at = NULL WHERE id = $1`,
        [item.audit_id]
      );
    }

    await logAction(client, user, {
      action: "PHYSICAL_QUANTITY_UPDATED",
      details: `Physical quantity changed from ${oldCount ?? "blank"} to ${count} by ${user.name}; approval reset to awaiting approval.`,
      auditId: item.audit_id,
      auditName: item.audit_name,
      productId: item.product_id,
      productName: item.product_name,
    });

    const updated = await client.query(`${ITEM_SELECT} WHERE i.id = $1`, [itemId]);
    await client.query("COMMIT");
    return res.status(200).json({ item: toAuditItem(updated.rows[0], false), changed: true });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("update-physical-quantity error", error);
    return res.status(500).json({ error: "Could not update the physical quantity." });
  } finally {
    client?.release();
  }
}
