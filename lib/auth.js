import jwt from "jsonwebtoken";
import pool from "./db.js";

const COOKIE = "session";

export function signSession(user) {
  return jwt.sign({ uid: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
}

export function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

export function getSession(req) {
  const raw = req.headers.cookie || "";
  const part = raw.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE + "="));
  if (!part) return null;
  try {
    return jwt.verify(part.slice(COOKIE.length + 1), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function loadUserById(id) {
  const q = await pool.query(
    `SELECT id, employee_id, name, email, phone, role FROM users WHERE id = $1 AND is_active = TRUE`,
    [id]
  );
  const u = q.rows[0];
  if (!u) return null;
  const s = await pool.query(`SELECT store_id FROM user_stores WHERE user_id = $1`, [id]);
  return {
    id: u.id,
    employeeId: u.employee_id,
    name: u.name,
    email: u.email || "",
    phone: u.phone || undefined,
    role: u.role,
    assignedStoreIds: s.rows.map((r) => r.store_id),
  };
}