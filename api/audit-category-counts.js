import pool from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req, res, ["admin", "back office"]);
    if (!user) return;

    const { storeId, categories } = req.body || {};
    if (
      typeof storeId !== "string" ||
      !storeId.trim() ||
      !Array.isArray(categories) ||
      categories.length === 0 ||
      categories.length > 27 ||
      categories.some((category) => typeof category !== "string" || !category.trim())
    ) {
      return res.status(400).json({ error: "Store and one or more valid categories are required." });
    }

    const result = await pool.query(
      `SELECT COUNT(DISTINCT sp.product_id)::int AS total
         FROM store_products sp
         JOIN products p ON p.id = sp.product_id
        WHERE sp.store_id = $1 AND p.category = ANY($2::text[])`,
      [storeId, categories]
    );
    return res.status(200).json({ total: result.rows[0].total });
  } catch (error) {
    console.error("audit-category-counts error", error);
    return res.status(500).json({ error: "Could not load category product count." });
  }
}
