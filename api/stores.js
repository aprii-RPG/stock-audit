import pool from "../lib/db.js";
import { getSession, loadUserById } from "../lib/auth.js";

const shape = (r, full) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  city: r.city || "",
  address: full ? r.address || "" : "",
  latitude: full ? r.latitude || 0 : 0,
  longitude: full ? r.longitude || 0 : 0,
  geofenceRadiusMeters: full ? r.geofence_radius_m : 0,
  managerName: full ? r.manager_name || "" : "",
  contactPhone: full ? r.contact_phone || "" : "",
});

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const sess = getSession(req);
    const user = sess ? await loadUserById(sess.uid) : null;
    const q = await pool.query(`SELECT * FROM stores WHERE is_active = TRUE ORDER BY name`);
    let rows = q.rows;
    if (user && user.role === "auditor") {
      rows = rows.filter((r) => user.assignedStoreIds.includes(r.id));
    }
    return res.status(200).json({ stores: rows.map((r) => shape(r, !!user)) });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}