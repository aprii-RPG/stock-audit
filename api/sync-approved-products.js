import pool from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

const SHEETS_WEB_APP_URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let syncingWithGoogle = false;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!["admin", "back office"].includes(String(user.role).trim().toLowerCase())) {
      return res.status(403).json({ error: "Only admin and back-office users can sync approved products." });
    }

    const webAppUrl = process.env.GOOGLE_SHEETS_WEB_APP_URL;
    const syncSecret = process.env.GOOGLE_SHEETS_SYNC_SECRET;
    if (!webAppUrl || !SHEETS_WEB_APP_URL_PATTERN.test(webAppUrl) || !syncSecret) {
      return res.status(503).json({
        error: "Google Sheets sync is not configured. Set GOOGLE_SHEETS_WEB_APP_URL and GOOGLE_SHEETS_SYNC_SECRET.",
      });
    }

    const result = await pool.query(
      `SELECT i.id AS item_id, i.audit_id, a.name AS audit_name,
              to_char(a.audit_date, 'YYYY-MM-DD') AS audit_date,
              s.code AS branch_code, s.name AS branch_name,
              p.code AS product_code, p.name AS product_name, p.pack, p.company,
              i.bin, i.snapshot_qty, i.sales_after_cutoff, i.returns_after_cutoff,
              i.purchases_after_cutoff, i.physical_count,
              (COALESCE(i.snapshot_qty, 0) - COALESCE(i.sales_after_cutoff, 0)
                + COALESCE(i.returns_after_cutoff, 0) + COALESCE(i.purchases_after_cutoff, 0))
                AS expected_count,
              CASE WHEN i.physical_count IS NOT NULL THEN
                i.physical_count -
                  (COALESCE(i.snapshot_qty, 0) - COALESCE(i.sales_after_cutoff, 0)
                    + COALESCE(i.returns_after_cutoff, 0) + COALESCE(i.purchases_after_cutoff, 0))
              END AS variance_units,
              p.unit_price AS unit_price_inr,
              CASE WHEN i.physical_count IS NOT NULL THEN
                ABS(i.physical_count -
                  (COALESCE(i.snapshot_qty, 0) - COALESCE(i.sales_after_cutoff, 0)
                    + COALESCE(i.returns_after_cutoff, 0) + COALESCE(i.purchases_after_cutoff, 0)))
                  * p.unit_price
              END AS variance_value_inr,
              i.difference_reason, i.difference_reason_note,
              i.approved_by_name, i.approved_at
         FROM audit_items i
         JOIN audits a ON a.id = i.audit_id
         JOIN stores s ON s.id = a.store_id
         JOIN products p ON p.id = i.product_id
        WHERE i.status = 'approved'
        ORDER BY a.audit_date DESC, s.name, p.name`
    );

    syncingWithGoogle = true;
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync_approved_products",
        secret: syncSecret,
        items: result.rows,
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      throw new Error("Google Sheets returned an unexpected response. Check the Apps Script deployment.");
    }
    if (!response.ok || responseData.success !== true) {
      throw new Error(responseData.error || `Google Sheets sync failed (${response.status}).`);
    }

    return res.status(200).json({ syncedCount: responseData.syncedCount });
  } catch (error) {
    console.error("sync-approved-products error", error);
    return res.status(502).json({
      error: syncingWithGoogle && error instanceof Error
        ? error.message
        : "Could not load approved products or sync them to Google Sheets.",
    });
  }
}
