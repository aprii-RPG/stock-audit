import pool from "../lib/db.js";
import { requireUser } from "../lib/auth.js";
import { toProduct } from "../lib/mappers.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const storeId = req.query.storeId;
    if (storeId && user.role === "auditor" && !user.assignedStoreIds.includes(storeId)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const q = storeId
      ? await pool.query(
          `SELECT p.*, sp.default_bin, sp.current_batch, sp.expiry
           FROM store_products sp JOIN products p ON p.id = sp.product_id
           WHERE sp.store_id = $1 ORDER BY p.name`, [storeId])
      : await pool.query(
          `SELECT p.*, NULL::text AS default_bin, NULL::text AS current_batch, NULL::text AS expiry
           FROM products p ORDER BY p.name`);
    return res.status(200).json({ products: q.rows.map(toProduct) });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}