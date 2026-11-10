// api/photo-upload.js
// Receives ONE compressed JPEG (base64) -> stores it in Cloudflare R2 -> saves details in audit_items
import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";
import { ITEM_SELECT, toAuditItem } from "../lib/mappers.js";
import { BUCKET, putJpeg, deleteObject, r2Configured } from "../lib/r2.js";

const MAX_BYTES = 3_500_000; // Vercel allows about 4.5 MB per request including base64 overhead

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const validNum = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req, res, ["auditor", "back office", "admin"]);
    if (!user) return;
    if (!r2Configured() || !BUCKET) {
      return res.status(500).json({ error: "Photo storage is not set up yet." });
    }

    const { auditId, productId, photoDataUrl, source, gps } = req.body || {};
    if (!auditId || !productId || typeof photoDataUrl !== "string") {
      return res.status(400).json({ error: "auditId, productId and photo are required." });
    }
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(photoDataUrl);
    if (!m) return res.status(400).json({ error: "Photo must be a JPEG." });
    const buf = Buffer.from(m[1], "base64");
    if (buf.length < 2000 || buf[0] !== 0xff || buf[1] !== 0xd8) {
      return res.status(400).json({ error: "This does not look like a valid photo." });
    }
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({ error: "Photo is too large. Please retake." });
    }
    const src = source === "gallery" ? "gallery" : "camera";

    if (user.role === "auditor") {
      const ok = await pool.query(
        `SELECT 1 FROM audit_assignments WHERE audit_id = $1 AND user_id = $2`,
        [auditId, user.id]
      );
      if (!ok.rows[0]) return res.status(403).json({ error: "Not allowed." });
    }

    const q = await pool.query(
      `SELECT i.id, i.photo_url, p.name AS product_name,
              a.status AS audit_status, to_char(a.audit_date,'YYYY-MM-DD') AS audit_date,
              s.latitude, s.longitude
         FROM audit_items i
         JOIN audits a ON a.id = i.audit_id
         JOIN stores s ON s.id = a.store_id
         JOIN products p ON p.id = i.product_id
        WHERE i.audit_id = $1 AND i.product_id = $2`,
      [auditId, productId]
    );
    const row = q.rows[0];
    if (!row) return res.status(404).json({ error: "Audit item not found." });
    if (row.audit_status !== "in_progress") {
      return res.status(400).json({ error: "This audit is not open." });
    }

    // location + time are worked out HERE on the server (the phone cannot fake them)
    let lat = null, lng = null, accuracy = null, distance = null;
    if (src === "camera" && gps && validNum(gps.lat, -90, 90) && validNum(gps.lng, -180, 180)) {
      lat = gps.lat;
      lng = gps.lng;
      accuracy = validNum(gps.accuracy, 0, 100000) ? Math.round(gps.accuracy) : null;
      const sLat = Number(row.latitude), sLng = Number(row.longitude);
      if (row.latitude !== null && row.longitude !== null && (sLat !== 0 || sLng !== 0)) {
        distance = distanceMeters(lat, lng, sLat, sLng);
      }
    }
    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const withinWindow = src === "camera" && todayIST === row.audit_date;

    const key = `audits/${auditId}/${row.id}-${Date.now()}.jpg`;
    await putJpeg(key, buf);

    await pool.query(
      `UPDATE audit_items SET
         photo_url = $3, photo_source = $4, photo_captured_at = now(),
         photo_gps_lat = $5, photo_gps_lng = $6, photo_gps_accuracy = $7,
         photo_distance_from_store_m = $8, photo_within_window = $9,
         photo_status = 'pending', photo_reject_reason = NULL
       WHERE audit_id = $1 AND product_id = $2`,
      [auditId, productId, key, src, lat, lng, accuracy, distance, withinWindow]
    );
    if (row.photo_url && row.photo_url !== key) await deleteObject(row.photo_url);

    await logAction(pool, user, {
      action: "PHOTO_UPLOADED",
      details: `Photo (${src}) uploaded for ${row.product_name}. Distance: ${
        distance === null ? "unknown" : distance + "m"
      }`,
      auditId,
      productId,
      productName: row.product_name,
    });

    const out = await pool.query(`${ITEM_SELECT} WHERE i.audit_id = $1 AND i.product_id = $2`, [
      auditId,
      productId,
    ]);
    return res.status(200).json({ item: toAuditItem(out.rows[0], user.role === "auditor") });
  } catch (e) {
    console.error("photo-upload error", e);
    return res.status(500).json({ error: "Server error" });
  }
}