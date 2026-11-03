import bcrypt from "bcryptjs";
import pool from "../lib/db.js";
import { signSession, setSessionCookie, loadUserById } from "../lib/auth.js";

const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  const { loginId, password, storeId } = req.body || {};
  if (!loginId || !password) {
    return res.status(400).json({ success: false, error: "Enter Login ID and password." });
  }

  try {
    const q = await pool.query(
      `SELECT id, password_hash FROM users
       WHERE is_active = TRUE AND (LOWER(employee_id) = LOWER($1) OR LOWER(email) = LOWER($1))`,
      [String(loginId).trim()]
    );
    const row = q.rows[0];
    const ok = await bcrypt.compare(String(password), row ? row.password_hash : DUMMY_HASH);

    if (!row || !ok) {
      await pool.query(`INSERT INTO audit_logs (action, details) VALUES ('LOGIN_FAILED', $1)`, [`Login ID: ${String(loginId).slice(0, 50)}`]);
      return res.status(401).json({ success: false, error: "Invalid Login ID or Password." });
    }

    const user = await loadUserById(row.id);
    if (user.role === "auditor" && storeId && !user.assignedStoreIds.includes(storeId)) {
      return res.status(403).json({ success: false, error: "Branch Access Denied: you are not assigned to this branch." });
    }

    setSessionCookie(res, signSession(user));
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, user_role, action, details) VALUES ($1, $2, $3, 'LOGIN', 'Logged in')`,
      [user.id, user.name, user.role]
    );
    return res.status(200).json({ success: true, user });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Server error. Try again." });
  }
}