import pool from "../lib/db.js";
import { requireUser } from "../lib/auth.js";
import { ITEM_SELECT, toAuditItem } from "../lib/mappers.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const auditId = req.query.auditId;
    if (!auditId) return res.status(400).json({ error: "auditId is required." });
    if (user.role === "auditor") {
      const ok = await pool.query(
        `SELECT 1 FROM audit_assignments WHERE audit_id = $1 AND user_id = $2`, [auditId, user.id]);
      if (!ok.rows[0]) return res.status(403).json({ error: "Not allowed." });
    }
    const q = await pool.query(`${ITEM_SELECT} WHERE i.audit_id = $1 ORDER BY p.name`, [auditId]);
    const hide = user.role === "auditor";
    return res.status(200).json({ items: q.rows.map((r) => toAuditItem(r, hide)) });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}