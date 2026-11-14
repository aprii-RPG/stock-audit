const FIELD_HEADERS = [
  ["item_id", "Audit Item ID"],
  ["audit_id", "Audit ID"],
  ["audit_name", "Audit Name"],
  ["audit_date", "Audit Date"],
  ["branch_code", "Branch Code"],
  ["branch_name", "Branch"],
  ["product_code", "Product Code"],
  ["product_name", "Product"],
  ["pack", "Pack"],
  ["company", "Company"],
  ["bin", "Bin"],
  ["snapshot_qty", "Snapshot Qty"],
  ["sales_after_cutoff", "Sales After Cutoff"],
  ["returns_after_cutoff", "Returns After Cutoff"],
  ["purchases_after_cutoff", "Purchases After Cutoff"],
  ["physical_count", "Physical Count"],
  ["expected_count", "Expected Count"],
  ["variance_units", "Variance Units"],
  ["unit_price_inr", "Unit Price (INR)"],
  ["variance_value_inr", "Variance Value (INR)"],
  ["difference_reason", "Difference Reason"],
  ["difference_reason_note", "Reason Note"],
  ["approved_by_name", "Approved By"],
  ["approved_at", "Approved At"],
  ["synced_at", "Synced At"],
];

const NUMERIC_FIELDS = new Set([
  "snapshot_qty",
  "sales_after_cutoff",
  "returns_after_cutoff",
  "purchases_after_cutoff",
  "physical_count",
  "expected_count",
  "variance_units",
  "unit_price_inr",
  "variance_value_inr",
]);

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeCellValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function doPost(event) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty("SYNC_SECRET");
    const spreadsheetId = properties.getProperty("SPREADSHEET_ID");
    const sheetName = properties.getProperty("SHEET_NAME") || "Approved Products";
    const payload = JSON.parse(event.postData.contents || "{}");

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ success: false, error: "Unauthorized sync request." });
    }
    if (payload.action !== "sync_approved_products" || !Array.isArray(payload.items)) {
      return jsonResponse({ success: false, error: "Invalid sync request." });
    }
    if (!spreadsheetId) {
      return jsonResponse({ success: false, error: "SPREADSHEET_ID is not configured." });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
      const headers = FIELD_HEADERS.map(([, header]) => header);
      const lastRow = sheet.getLastRow();
      let existingRows = [];
      if (lastRow === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      } else {
        existingRows = sheet.getRange(1, 1, lastRow, headers.length).getValues().slice(1);
        const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
        if (headers.some((header, index) => actualHeaders[index] !== header)) {
          return jsonResponse({
            success: false,
            error: `The "${sheetName}" sheet has unexpected headers. Use a new, empty sheet tab.`,
          });
        }
      }

      const rowsById = new Map();
      existingRows.forEach((row) => {
        const id = String(row[0] || "");
        if (id) rowsById.set(id, row);
      });

      const syncedAt = new Date().toISOString();
      payload.items.forEach((item) => {
        const row = FIELD_HEADERS.map(([field]) => {
          const value = field === "synced_at" ? syncedAt : item[field];
          if (NUMERIC_FIELDS.has(field)) {
            return value === null || value === undefined || value === "" ? "" : Number(value);
          }
          return safeCellValue(value);
        });
        rowsById.set(String(item.item_id), row);
      });

      const rows = Array.from(rowsById.values());
      if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
      if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      sheet.setFrozenRows(1);
      return jsonResponse({ success: true, syncedCount: payload.items.length });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error && error.message ? error.message : "Google Sheets sync failed.",
    });
  }
}
