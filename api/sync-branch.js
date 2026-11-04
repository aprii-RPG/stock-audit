// api/sync-branch.js
// Google Sheet (Apps Script) -> products + store_products
import crypto from "crypto";
import pool from "../lib/db.js";
import { logAction } from "../lib/auth.js";

const MAX_ROWS = 1000;

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
const n = (v) => {
  const x = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const bad = keyCheck(req);
if (bad) return res.status(401).json({ error: bad });

  const { storeCode, rows } = req.body || {};
  if (!storeCode || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "storeCode and rows are required" });
  }
  if (rows.length > MAX_ROWS) {
    return res.status(400).json({ error: `Max ${MAX_ROWS} rows per request` });
  }

  // Clean + dedupe by item_code (last row wins)
  const byCode = new Map();
  let skipped = 0;
  let duplicates = 0;
  for (const r of rows) {
    const code = s(r.item_code);
    if (!code) { skipped++; continue; }
    if (byCode.has(code)) duplicates++;
    byCode.set(code, {
      code,
      name: s(r.product_name),
      qty: n(r.system_stock),
      bin: s(r.rack_number),
      price: n(r.unit_price),
      barcode: s(r.barcode),
      pack: s(r.pack),
      company: s(r.company),
      category: s(r.category),
      batch: s(r.batch),
      expiry: s(r.expiry),
    });
  }
  const items = [...byCode.values()];
  const col = (k) => items.map((i) => i[k]);

  const client = await pool.connect();
  try {
    const st = await client.query(
      `SELECT id FROM stores WHERE (code = $1 OR id = $1) AND is_active = TRUE LIMIT 1`,
      [s(storeCode)]
    );
    if (!st.rows[0]) {
      return res.status(404).json({ error: `Store not found: ${storeCode}` });
    }
    const storeId = st.rows[0].id;

    await client.query("BEGIN");

    // 1) update existing products
    await client.query(
      `UPDATE products p
          SET name = v.name, pack = v.pack, company = v.company,
              category = v.category, unit_price = v.price, barcode = v.barcode
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[])
              AS v(code, name, pack, company, category, price, barcode)
        WHERE p.code = v.code`,
      [col("code"), col("name"), col("pack"), col("company"), col("category"), col("price"), col("barcode")]
    );

    // 2) insert new products (id = "P-" + code; change if your ids look different)
    await client.query(
      `INSERT INTO products (id, code, name, pack, company, category, unit_price, barcode)
       SELECT 'P-' || v.code, v.code, v.name, v.pack, v.company, v.category, v.price, v.barcode
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[])
              AS v(code, name, pack, company, category, price, barcode)
        WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.code = v.code)`,
      [col("code"), col("name"), col("pack"), col("company"), col("category"), col("price"), col("barcode")]
    );

    // 3) update existing store_products
    await client.query(
      `UPDATE store_products sp
          SET system_qty = v.qty, default_bin = v.bin, current_batch = v.batch,
              expiry = v.expiry, updated_at = now()
         FROM unnest($1::text[], $2::numeric[], $3::text[], $4::text[], $5::text[])
              AS v(code, qty, bin, batch, expiry)
         JOIN products p ON p.code = v.code
        WHERE sp.store_id = $6 AND sp.product_id = p.id`,
      [col("code"), col("qty"), col("bin"), col("batch"), col("expiry"), storeId]
    );

    // 4) insert missing store_products
    await client.query(
      `INSERT INTO store_products (store_id, product_id, system_qty, default_bin, current_batch, expiry, updated_at)
       SELECT $6, p.id, v.qty, v.bin, v.batch, v.expiry, now()
         FROM unnest($1::text[], $2::numeric[], $3::text[], $4::text[], $5::text[])
              AS v(code, qty, bin, batch, expiry)
         JOIN products p ON p.code = v.code
        WHERE NOT EXISTS (
          SELECT 1 FROM store_products sp WHERE sp.store_id = $6 AND sp.product_id = p.id
        )`,
      [col("code"), col("qty"), col("bin"), col("batch"), col("expiry"), storeId]
    );

    await logAction(client, { id: null, name: "Google Sheet sync", role: "system" }, {
      action: "SHEET_SYNC",
      details: `store ${storeId}: ${items.length} products synced`,
    });

    await client.query("COMMIT");
    return res.status(200).json({
      ok: true,
      store: storeId,
      received: rows.length,
      synced: items.length,
      skipped,
      duplicates,
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("sync-branch error", e);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
}