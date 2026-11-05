import pool from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const requester = await requireUser(req, res, ["admin", "back office"]);
    if (!requester) return;

    const result = await pool.query(
      `SELECT u.id, u.employee_id, u.name, u.email, u.phone, u.role,
              COALESCE(array_agg(us.store_id) FILTER (WHERE us.store_id IS NOT NULL), '{}') AS assigned_store_ids
       FROM users u
       LEFT JOIN user_stores us ON us.user_id = u.id
       WHERE u.is_active = TRUE
       GROUP BY u.id
       ORDER BY u.name`
    );

    const users = result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      name: row.name,
      email: row.email || "",
      phone: row.phone || undefined,
      role: row.role,
      assignedStoreIds: row.assigned_store_ids,
    }));

    return res.status(200).json({ users });
  } catch (error) {
    console.error("users error", error);
    return res.status(500).json({ error: "Server error" });
  }
}
