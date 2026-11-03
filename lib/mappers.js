const num = (v) => (v === null || v === undefined ? undefined : Number(v));
const iso = (d) => (d ? new Date(d).toISOString() : undefined);

export function toProduct(r) {
  return {
    id: r.id, code: r.code, name: r.name, pack: r.pack || "", company: r.company || "",
    category: r.category || "", unitPrice: Number(r.unit_price) || 0,
    defaultBin: r.default_bin || undefined, barcode: r.barcode || "",
    currentBatch: r.current_batch || "", expiry: r.expiry || "",
  };
}

export const ITEM_SELECT = `
  SELECT i.*, p.code, p.name AS product_name, p.pack, p.company, p.category, p.unit_price, p.barcode,
         sp.default_bin, sp.current_batch, sp.expiry,
         cu.name AS counted_by_name, ru.name AS recount_to_name, su.name AS skipped_by_name
  FROM audit_items i
  JOIN audits a ON a.id = i.audit_id
  JOIN products p ON p.id = i.product_id
  LEFT JOIN store_products sp ON sp.store_id = a.store_id AND sp.product_id = i.product_id
  LEFT JOIN users cu ON cu.id = i.counted_by_user_id
  LEFT JOIN users ru ON ru.id = i.recount_assigned_to_id
  LEFT JOIN users su ON su.id = i.skipped_by_user_id`;

export function toAuditItem(r, hideSystem) {
  const z = (v) => (hideSystem ? 0 : Number(v) || 0);
  return {
    id: r.id, auditId: r.audit_id, productId: r.product_id,
    product: {
      id: r.product_id, code: r.code, name: r.product_name, pack: r.pack || "",
      company: r.company || "", category: r.category || "", unitPrice: Number(r.unit_price) || 0,
      defaultBin: r.default_bin || undefined, barcode: r.barcode || "",
      currentBatch: r.current_batch || "", expiry: r.expiry || "",
    },
    bin: r.bin || "",
    snapshotQty: z(r.snapshot_qty),
    salesAfterCutoff: z(r.sales_after_cutoff),
    returnsAfterCutoff: z(r.returns_after_cutoff),
    purchasesAfterCutoff: z(r.purchases_after_cutoff),
    physicalCount: num(r.physical_count),
    countSavedAt: iso(r.count_saved_at),
    countedByUserId: r.counted_by_user_id || undefined,
    countedByUserName: r.counted_by_name || undefined,
    photoUrl: r.photo_url || undefined,
    photoCapturedAt: iso(r.photo_captured_at),
    photoGpsLat: num(r.photo_gps_lat), photoGpsLng: num(r.photo_gps_lng),
    photoGpsAccuracy: num(r.photo_gps_accuracy),
    photoDistanceFromStoreM: num(r.photo_distance_from_store_m),
    photoWithinWindow: r.photo_within_window ?? undefined,
    photoStatus: r.photo_status,
    photoRejectReason: r.photo_reject_reason || undefined,
    status: r.status,
    differenceReason: r.difference_reason || undefined,
    differenceReasonNote: r.difference_reason_note || undefined,
    recountCount: num(r.recount_count),
    recountAssignedToId: r.recount_assigned_to_id || undefined,
    recountAssignedToName: r.recount_to_name || undefined,
    recountedByUserId: r.recounted_by_user_id || undefined,
    recountNote: r.recount_note || undefined,
    approvedByUserId: r.approved_by_user_id || undefined,
    approvedByName: r.approved_by_name || undefined,
    approvedAt: iso(r.approved_at),
    approvalTier: r.approval_tier || undefined,
    skipReason: r.skip_reason || undefined,
    skippedByUserId: r.skipped_by_user_id || undefined,
    skippedByName: r.skipped_by_name || undefined,
    erpAdjustmentNo: r.erp_adjustment_no || undefined,
    erpAdjustmentPostedAt: iso(r.erp_adjustment_posted_at),
  };
}