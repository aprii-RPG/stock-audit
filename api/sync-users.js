// api/sync-users.js
// Google Sheet "Users" tab -> users + user_stores (passwords are hashed here, never stored as plain text)
import crypto from "crypto";
import bcrypt from "bcryptjs";
import pool from "../lib/db.js";
import { logAction } from "../lib/auth.js";

const MAX_USERS = 30; // bcrypt is slow, so the sheet sends users in small chunks

// Left side = what can be written in the sheet's "role" column (lowercase).
// Right side = the value stored in the database.
// Check your DB with:  SELECT DISTINCT role FROM users;  and change the right side if needed.
const ROLE_MAP = {
  "admin": "admin",
  "back office": "back office",
  "backoffice": "back office",
  "auditor": "auditor",
};
const roleKey = (v) => String(v || "").toLowerCase().replace(/[\s_-]+/g, " ").trim();

function keyOk(req) {
  const given = String(req.headers["x-sync-key"] || "").trim();
  const expected = String(process.env.SYNC_API_KEY || "").trim();
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const s = (v) => (v === null || v === undefined ? "" : String(v).trim());

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!keyOk(req)) return res.status(401).json({ error: "Bad sync key" });

  const { users } = req.body || {};
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: "users array is required" });
  }
  if (users.length > MAX_USERS) {
    return res.status(400).json({ error: `Max ${MAX_USERS} users per request` });
  }

  const skipped = [];
  const warnings = [];
  let created = 0;
  let updated = 0;

  const client = await pool.connect();
  try {
    const sq = await client.query(`SELECT id, code FROM stores WHERE is_active = TRUE`);
    const storeByKey = new Map();
    for (const r of sq.rows) {
      storeByKey.set(s(r.code).toUpperCase(), r.id);
      storeByKey.set(s(r.id).toUpperCase(), r.id);
    }

    await client.query("BEGIN");

    for (const u of users) {
      const empId = s(u.employee_id);
      const name = s(u.name);
      const role = ROLE_MAP[roleKey(u.role)];
      const password = s(u.password);
      const email = s(u.email) || null;
      const phone = s(u.phone) || null;

      if (!empId || !name) {
        skipped.push({ employee_id: empId || "(blank)", reason: "employee_id ya name khaali hai" });
        continue;
      }
      if (!role) {
        skipped.push({ employee_id: empId, reason: `role samajh nahi aaya: "${s(u.role)}"` });
        continue;
      }

      const ex = await client.query(`SELECT id FROM users WHERE employee_id = $1 LIMIT 1`, [empId]);
      let userId;

      if (ex.rows[0]) {
        userId = ex.rows[0].id;
        if (password) {
          const hash = await bcrypt.hash(password, 10);
          await client.query(
            `UPDATE users SET name=$2, email=$3, phone=$4, role=$5, password_hash=$6, is_active=TRUE WHERE id=$1`,
            [userId, name, email, phone, role, hash]
          );
        } else {
          await client.query(
            `UPDATE users SET name=$2, email=$3, phone=$4, role=$5, is_active=TRUE WHERE id=$1`,
            [userId, name, email, phone, role]
          );
        }
        updated++;
      } else {
        if (!password) {
          skipped.push({ employee_id: empId, reason: "naye user ke liye password chahiye" });
          continue;
        }
        userId = empId;
        const hash = await bcrypt.hash(password, 10);
        await client.query(
          `INSERT INTO users (id, employee_id, name, email, phone, role, password_hash, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
          [userId, empId, name, email, phone, role, hash]
        );
        created++;
      }

      // assigned stores (comma separated store codes)
      await client.query(`DELETE FROM user_stores WHERE user_id = $1`, [userId]);
      const codes = s(u.store_codes).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
      const storeIds = new Set();
      for (const c of codes) {
        const sid = storeByKey.get(c.toUpperCase());
        if (sid) storeIds.add(sid);
        else warnings.push(`${empId}: store "${c}" database mein nahi mila`);
      }
      for (const sid of storeIds) {
        await client.query(`INSERT INTO user_stores (user_id, store_id) VALUES ($1,$2)`, [userId, sid]);
      }
    }

    await logAction(client, { id: null, name: "Google Sheet sync", role: "system" }, {
      action: "SHEET_SYNC_USERS",
      details: `${created} created, ${updated} updated, ${skipped.length} skipped`,
    });

    await client.query("COMMIT");
    return res.status(200).json({ ok: true, created, updated, skipped, warnings });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("sync-users error", e);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
}