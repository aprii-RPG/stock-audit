// api/photo.js   ->   /api/photo?id=<audit item id>
// Checks login + role, then sends the browser to a short-lived private R2 link.
// The link you put in sheets/exports (/api/photo?id=...) never expires.
import pool from "../lib/db.js";
import { requireUser } from "../lib/auth.js";
import { signedGetUrl, r2Configured } from "../lib/r2.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req, res, ["auditor", "back office", "admin"]);
    if (!user) return;
    if (!r2Configured()) return res.status(500).json({ error: "Photo storage is not set up yet." });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "id is required." });

    const q = await pool.query(`SELECT audit_id, photo_url FROM audit_items WHERE id = $1`, [id]);
    const row = q.rows[0];
    if (!row || !row.photo_url) return res.status(404).json({ error: "Photo not found." });

    if (user.role === "auditor") {
      const ok = await pool.query(
        `SELECT 1 FROM audit_assignments WHERE audit_id = $1 AND user_id = $2`,
        [row.audit_id, user.id]
      );
      if (!ok.rows[0]) return res.status(403).json({ error: "Not allowed." });
    }

    const url = await signedGetUrl(row.photo_url, 120);
    res.setHeader("Cache-Control", "private, no-store");
    res.writeHead(302, { Location: url });
    return res.end();
  } catch (e) {
    console.error("photo error", e);
    return res.status(500).json({ error: "Server error" });
  }
}