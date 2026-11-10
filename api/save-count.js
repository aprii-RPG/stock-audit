// api/save-count.js
import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";
import { ITEM_SELECT, toAuditItem } from "../lib/mappers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req, res, ["auditor", "back office", "admin"]);
    if (!user) return;

    const { auditId, productId, binName } = req.body || {};
    const count = Number(req.body?.physicalCount);
    if (!auditId || !productId) {
      return res.status(400).json({ error: "auditId and productId are required." });
    }
    if (!Number.isFinite(count) || count < 0 || count > 1000000) {
      return res.status(400).json({ error: "Enter a valid count." });
    }
    const bin = typeof binName === "string" ? binName.trim().slice(0, 40) : null;

    if (user.role === "auditor") {
      const ok = await pool.query(
        `SELECT 1 FROM audit_assignments WHERE audit_id = $1 AND user_id = $2`,
        [auditId, user.id]
      );
      if (!ok.rows[0]) return res.status(403).json({ error: "Not allowed." });
    }

    const q = await pool.query(
      `SELECT i.*, p.name AS product_name, p.unit_price, a.status AS audit_status
         FROM audit_items i
         JOIN audits a ON a.id = i.audit_id
         JOIN products p ON p.id = i.product_id
        WHERE i.audit_id = $1 AND i.product_id = $2`,
      [auditId, productId]
    );
    const row = q.rows[0];
    if (!row) return res.status(404).json({ error: "Audit item not found." });
    if (row.audit_status !== "in_progress") {
      return res.status(400).json({ error: "This audit is not open for counting." });
    }
    if (row.status === "approved" || row.status === "skipped") {
      return res.status(400).json({ error: "This product is already approved or skipped." });
    }

    // auto-approve rule (same as the app): small difference AND photo already approved
    const st = await pool.query(
      `SELECT auto_approve_tolerance_units AS units, auto_approve_tolerance_value AS val
         FROM system_settings ORDER BY id LIMIT 1`
    );
    const tolUnits = Number(st.rows[0]?.units ?? 1);
    const tolValue = Number(st.rows[0]?.val ?? 15);

    const expected =
      (Number(row.snapshot_qty) || 0) -
      (Number(row.sales_after_cutoff) || 0) +
      (Number(row.returns_after_cutoff) || 0) +
      (Number(row.purchases_after_cutoff) || 0);
    const diff = count - expected;
    const diffValue = Math.abs(diff) * (Number(row.unit_price) || 0);
    const autoApproved =
      Math.abs(diff) <= tolUnits && diffValue <= tolValue && row.photo_status === "approved";

    const wasRecount = row.status === "recount";
    await pool.query(
      `UPDATE audit_items SET
         physical_count = $3::numeric,
         count_saved_at = now(),
         counted_by_user_id = $4,
         bin = COALESCE($5::text, bin),
         status = $6,
         recount_count = CASE WHEN $7::boolean THEN $3::numeric ELSE recount_count END,
         recounted_by_user_id = CASE WHEN $7::boolean THEN $4 ELSE recounted_by_user_id END,
         approved_by_name = CASE WHEN $8::boolean THEN 'Auto-Tolerance Engine' ELSE approved_by_name END,
         approved_at = CASE WHEN $8::boolean THEN now() ELSE approved_at END,
         approval_tier = CASE WHEN $8::boolean THEN 'auto_tolerance' ELSE approval_tier END
       WHERE audit_id = $1 AND product_id = $2`,
      [
        auditId,
        productId,
        count,
        user.id,
        bin && bin.length ? bin : null,
        autoApproved ? "approved" : "awaiting_approval",
        wasRecount,
        autoApproved,
      ]
    );

    await logAction(pool, user, {
      action: "COUNT_SAVED",
      details: `Count ${count} saved for ${row.product_name}. Status: ${
        autoApproved ? "approved" : "awaiting_approval"
      }`,
      auditId,
      productId,
      productName: row.product_name,
    });

    const out = await pool.query(`${ITEM_SELECT} WHERE i.audit_id = $1 AND i.product_id = $2`, [
      auditId,
      productId,
    ]);
    return res.status(200).json({
      item: toAuditItem(out.rows[0], user.role === "auditor"),
      autoApproved,
    });
  } catch (e) {
    console.error("save-count error", e);
    return res.status(500).json({ error: "Server error" });
  }
}