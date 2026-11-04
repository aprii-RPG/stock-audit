// api/sync-stores.js
// Google Sheet "Store" tab -> stores table (id = store_code for new stores)
import crypto from "crypto";
import pool from "../lib/db.js";
import { logAction } from "../lib/auth.js";

const MAX_STORES = 200;

/*function keyOk(req) {
  const given = String(req.headers["x-sync-key"] || "");
  const expected = String(process.env.SYNC_API_KEY || "");
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}*/
function keyCheck(req) {
  const given = String(req.headers["x-sync-key"] || "").trim();
  const expected = String(process.env.SYNC_API_KEY || "").trim();
  if (!expected) return "Server pe SYNC_API_KEY set nahi hai";
  if (given.length !== expected.length)
    return `Key length alag hai (sheet: ${given.length}, server: ${expected.length})`;
  const same = crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  return same ? null : "Key match nahi hui";
}

const s = (v) => (v === null || v === undefined ? "" : String(v).trim());
const numOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const x = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
};
const intOrNull = (v) => {
  const x = numOrNull(v);
  return x === null ? null : Math.round(x);
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!keyOk(req)) return res.status(401).json({ error: "Bad sync key" });

  const { stores } = req.body || {};
  if (!Array.isArray(stores) || stores.length === 0) {
    return res.status(400).json({ error: "stores array is required" });
  }
  if (stores.length > MAX_STORES) {
    return res.status(400).json({ error: `Max ${MAX_STORES} stores per request` });
  }

  const byCode = new Map();
  let skipped = 0;
  for (const r of stores) {
    const code = s(r.store_code);
    const name = s(r.name);
    if (!code || !name) { skipped++; continue; }
    byCode.set(code, {
      code,
      name,
      city: s(r.city),
      address: s(r.address),
      lat: numOrNull(r.latitude),
      lng: numOrNull(r.longitude),
      radius: intOrNull(r.geofence_radius_m),
      manager: s(r.manager_name),
      phone: s(r.contact_phone),
    });
  }
  const items = [...byCode.values()];
  if (items.length === 0) return res.status(400).json({ error: "No valid rows (store_code and name needed)" });
  const col = (k) => items.map((i) => i[k]);
  const params = [
    col("code"), col("name"), col("city"), col("address"),
    col("lat"), col("lng"), col("radius"), col("manager"), col("phone"),
  ];
  const unnest = `unnest($1::text[], $2::text[], $3::text[], $4::text[],
                          $5::double precision[], $6::double precision[], $7::int[],
                          $8::text[], $9::text[])
                  AS v(code, name, city, address, lat, lng, radius, manager, phone)`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // update existing stores (blank lat/lng/radius in sheet will NOT wipe DB values)
    await client.query(
      `UPDATE stores st
          SET name = v.name, city = v.city, address = v.address,
              latitude = COALESCE(v.lat, st.latitude),
              longitude = COALESCE(v.lng, st.longitude),
              geofence_radius_m = COALESCE(v.radius, st.geofence_radius_m),
              manager_name = v.manager, contact_phone = v.phone,
              is_active = TRUE
         FROM ${unnest}
        WHERE st.code = v.code`,
      params
    );

    // insert new stores
    await client.query(
      `INSERT INTO stores (id, code, name, address, city, latitude, longitude,
                           geofence_radius_m, manager_name, contact_phone, is_active)
       SELECT v.code, v.code, v.name, v.address, v.city, v.lat, v.lng,
              COALESCE(v.radius,
                       (SELECT default_geofence_radius_m FROM system_settings ORDER BY id LIMIT 1),
                       100),
              v.manager, v.phone, TRUE
         FROM ${unnest}
        WHERE NOT EXISTS (SELECT 1 FROM stores x WHERE x.code = v.code OR x.id = v.code)`,
      params
    );

    await logAction(client, { id: null, name: "Google Sheet sync", role: "system" }, {
      action: "SHEET_SYNC_STORES",
      details: `${items.length} stores synced`,
    });

    await client.query("COMMIT");
    return res.status(200).json({ ok: true, synced: items.length, skipped });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("sync-stores error", e);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
}