import pool from "../lib/db.js";

export default async function handler(req, res) {
  try {
    const r = await pool.query("SELECT COUNT(*) FROM branches");
    res.status(200).json({ ok: true, branches: r.rows[0].count });
  } catch (e) {
    res.status(500).json({ ok: false, error: "DB connection failed" });
  }
}