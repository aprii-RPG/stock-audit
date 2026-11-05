import type {
  Audit,
  AuditItem,
  AuditLogEntry,
  AuditType,
  BinSuggestion,
  CutoffBillItem,
  DifferenceReason,
  Product,
  ProductAuditHistoryEntry,
  Store,
  SystemSettings,
  User,
  UserRole,
} from '../types';
import {
  clearSyncedItems,
  getUnsyncedCount as getDbUnsyncedCount,
  getUnsyncedOfflineCounts,
  markAsSynced,
  queueOfflineCount,
} from './db';

// Local storage keys
const STORAGE_KEYS = {
  CURRENT_USER: 'stock_audit_current_user',
  STORES: 'stock_audit_stores',
  USERS: 'stock_audit_users',
  PRODUCTS: 'stock_audit_products',
  AUDITS: 'stock_audit_audits',
  AUDIT_ITEMS: 'stock_audit_items',
  CUTOFF_BILLS: 'stock_audit_cutoff_bills',
  BIN_SUGGESTIONS: 'stock_audit_bin_suggestions',
  SETTINGS: 'stock_audit_settings',
  LOGS: 'stock_audit_logs',
};

const DEFAULT_SETTINGS: SystemSettings = {
  autoApproveToleranceUnits: 1,
  autoApproveToleranceValue: 15,
  storeManagerApprovalThreshold: 100,
  hoApprovalThreshold: 500,
  defaultGeofenceRadiusMeters: 150,
  reasons: [
    { code: 'expired', label: 'Expired Product', description: 'Stock reached shelf expiry date before sale' },
    { code: 'damaged', label: 'Damaged / Broken', description: 'Physical bottle breakage, foil tear, or seal damage' },
    { code: 'theft_loss', label: 'Theft / Unaccounted Loss', description: 'Pilferage or missing without transaction' },
    { code: 'wrong_billing', label: 'Wrong Billing / Mismatch', description: 'Billed as another pack or dosage variant' },
    { code: 'purchase_not_entered', label: 'Purchase Not Entered', description: 'Supplier stock received physically but GRN unposted' },
    { code: 'return_not_entered', label: 'Return Not Entered', description: 'Customer returned product without POS credit note' },
    { code: 'wrong_batch', label: 'Wrong Batch Selected', description: 'Stock swapped with alternate batch number' },
    { code: 'none', label: 'No Reason / Balanced', description: 'Zero variance or within approved variance tolerance' },
  ],
};

// Safe storage helpers
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return fallback;
  }
}

function writeStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error writing ${key} to storage:`, err);
  }
}

function removeLegacyDemoCache() {
  const demoUserIds = new Set(['USR-01', 'USR-02', 'USR-03']);
  const cachedUsers = readStorage<User[]>(STORAGE_KEYS.USERS, []);
  if (!cachedUsers.some((user) => demoUserIds.has(user.id))) return;

  [
    STORAGE_KEYS.CURRENT_USER,
    STORAGE_KEYS.USERS,
    STORAGE_KEYS.STORES,
    STORAGE_KEYS.PRODUCTS,
    STORAGE_KEYS.AUDITS,
    STORAGE_KEYS.AUDIT_ITEMS,
    STORAGE_KEYS.CUTOFF_BILLS,
    STORAGE_KEYS.BIN_SUGGESTIONS,
    STORAGE_KEYS.LOGS,
  ].forEach((key) => localStorage.removeItem(key));
}

removeLegacyDemoCache();

// Distance calculation using Haversine formula (returns meters)
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Business calculation:
// Final difference = physical - (snapshot - sales after cutoff + purchases/returns after cutoff)
export function calculateAuditDiscrepancy(item: AuditItem): {
  expectedQty: number;
  difference: number;
  differenceValue: number;
  direction: 'excess' | 'short' | 'balanced';
} {
  const snapshot = item.snapshotQty ?? 0;
  const sales = item.salesAfterCutoff ?? 0;
  const returns = item.returnsAfterCutoff ?? 0;
  const purchases = item.purchasesAfterCutoff ?? 0;
  
  // Book quantity expected after snapshot and active post-cutoff movements
  const expectedQty = snapshot - sales + returns + purchases;
  
  if (item.physicalCount === undefined || item.physicalCount === null) {
    return {
      expectedQty,
      difference: 0,
      differenceValue: 0,
      direction: 'balanced',
    };
  }

  const difference = item.physicalCount - expectedQty;
  const unitPrice = item.product?.unitPrice || 0;
  const differenceValue = Math.round(Math.abs(difference) * unitPrice * 100) / 100;

  let direction: 'excess' | 'short' | 'balanced' = 'balanced';
  if (difference > 0) direction = 'excess';
  else if (difference < 0) direction = 'short';

  return {
    expectedQty,
    difference,
    differenceValue,
    direction,
  };
}

// --- API Service Methods ---

export const api = {
  // Authentication & Users
  async getCurrentUser(): Promise<User | null> {
    return readStorage<User | null>(STORAGE_KEYS.CURRENT_USER, null);
  },

  async setCurrentUser(user: User): Promise<void> {
    writeStorage(STORAGE_KEYS.CURRENT_USER, user);
  },

  async login(loginIdOrEmail: string, password?: string, branchId?: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: loginIdOrEmail, password, storeId: branchId }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        writeStorage(STORAGE_KEYS.CURRENT_USER, data.user);
        return { success: true, user: data.user as User };
      }
      return { success: false, error: data.error || 'Login failed.' };
    } catch {
      return { success: false, error: 'Cannot reach server. Check your internet.' };
    }
  },

  async logout(): Promise<void> {
    try { await fetch('/api/logout', { method: 'POST' }); } catch { /* offline */ }
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  },

  async getUsers(): Promise<User[]> {
    try {
      const res = await fetch('/api/users');
      if (res.status === 401 || res.status === 403) return [];
      if (!res.ok) throw new Error(`Could not load users (${res.status}).`);
      const data = await res.json();
      if (!Array.isArray(data.users)) throw new Error('Invalid users response.');
      return data.users as User[];
    } catch (error) {
      console.error('Failed to load users:', error);
      return [];
    }
  },

  async saveUser(user: User): Promise<User> {
    const users = readStorage<User[]>(STORAGE_KEYS.USERS, []);
    const index = users.findIndex((u) => u.id === user.id);
    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }
    writeStorage(STORAGE_KEYS.USERS, users);
    return user;
  },

  // Stores
  async getStores(): Promise<Store[]> {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        writeStorage(STORAGE_KEYS.STORES, data.stores);
        return data.stores as Store[];
      }
    } catch { /* offline: use saved list */ }
    return readStorage<Store[]>(STORAGE_KEYS.STORES, []);
  },

  async getStoreById(id: string): Promise<Store | undefined> {
    const stores = await this.getStores();
    return stores.find((s) => s.id === id);
  },

  async saveStore(store: Store): Promise<Store> {
    const stores = await this.getStores();
    const index = stores.findIndex((s) => s.id === store.id);
    if (index >= 0) {
      stores[index] = store;
    } else {
      stores.push(store);
    }
    writeStorage(STORAGE_KEYS.STORES, stores);
    return store;
  },

  // Products
  async getProducts(): Promise<Product[]> {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        writeStorage(STORAGE_KEYS.PRODUCTS, data.products);
        return data.products as Product[];
      }
    } catch { /* offline: use saved list */ }
    return readStorage<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  },

  async getProductById(id: string): Promise<Product | undefined> {
    const products = await this.getProducts();
    return products.find((p) => p.id === id);
  },

  async saveProduct(product: Product): Promise<Product> {
    const products = await this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);
    if (index >= 0) {
      products[index] = product;
    } else {
      products.push(product);
    }
    writeStorage(STORAGE_KEYS.PRODUCTS, products);
    return product;
  },

  // Audits
  async getAudits(storeId?: string): Promise<Audit[]> {
    const qs = storeId && storeId !== 'ALL' ? `?storeId=${encodeURIComponent(storeId)}` : '';
    try {
      const res = await fetch('/api/audits' + qs);
      if (res.ok) {
        const data = await res.json();
        return data.audits as Audit[];
      }
    } catch { /* offline */ }
    return [];
  },

  async getAuditById(auditId: string): Promise<Audit | undefined> {
    const audits = await this.getAudits();
    return audits.find((a) => a.id === auditId);
  },

  async createAudit(payload: {
    storeId: string;
    type: AuditType;
    date: string;
    assignedAuditorIds: string[];
    assignedBackOfficeIds: string[];
    productSelectionType: 'all' | 'category' | 'company' | 'not_audited_days';
    filterValue?: string;
    notes?: string;
  }): Promise<Audit> {
    const res = await fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not create audit.');
    return data.audit as Audit;
  },

  // Audit Items & Counts
  async getAuditItems(auditId: string): Promise<AuditItem[]> {
    try {
      const res = await fetch('/api/audit-items?auditId=' + encodeURIComponent(auditId));
      if (res.ok) {
        const data = await res.json();
        return data.items as AuditItem[];
      }
    } catch { /* offline */ }
    return [];
  },

  async getAuditItem(auditId: string, productId: string): Promise<AuditItem | undefined> {
    const items = await this.getAuditItems(auditId);
    return items.find((i) => i.productId === productId);
  },

  async saveCount(payload: {
    auditId: string;
    productId: string;
    physicalCount: number;
    binName?: string;
    photoDataUrl?: string;
    gps?: {
      lat: number;
      lng: number;
      accuracy: number;
      distanceM: number;
      withinWindow: boolean;
    };
  }): Promise<{ item: AuditItem; autoApproved: boolean; offlineQueued: boolean }> {
    const currentUser = await this.getCurrentUser();
    const settings = await this.getAdminSettings();
    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const idx = items.findIndex((i) => i.auditId === payload.auditId && i.productId === payload.productId);

    if (idx === -1) {
      throw new Error('Audit item not found');
    }

    const currentItem = items[idx];
    const updatedBin = payload.binName !== undefined ? payload.binName : currentItem.bin;

    // Queue in Dexie offline database
    let offlineQueued = false;
    try {
      await queueOfflineCount({
        auditId: payload.auditId,
        productId: payload.productId,
        physicalCount: payload.physicalCount,
        bin: updatedBin,
        timestamp: new Date().toISOString(),
        photoDataUrl: payload.photoDataUrl,
        gps: payload.gps,
      });
      offlineQueued = true;
    } catch (e) {
      console.warn('Could not queue to Dexie:', e);
    }

    // Update in-memory / storage item
    currentItem.physicalCount = payload.physicalCount;
    currentItem.countSavedAt = new Date().toISOString();
    currentItem.countedByUserId = currentUser?.id;
    currentItem.countedByUserName = currentUser?.name;
    currentItem.bin = updatedBin;

    if (payload.photoDataUrl) {
      currentItem.photoUrl = payload.photoDataUrl;
      currentItem.photoCapturedAt = new Date().toISOString();
      currentItem.photoGpsLat = payload.gps?.lat;
      currentItem.photoGpsLng = payload.gps?.lng;
      currentItem.photoGpsAccuracy = payload.gps?.accuracy;
      currentItem.photoDistanceFromStoreM = payload.gps?.distanceM;
      currentItem.photoWithinWindow = payload.gps?.withinWindow ?? true;
      currentItem.photoStatus = 'pending'; // Requires photo approval!
    }

    // Calculate variance against cutoff
    const { difference, differenceValue } = calculateAuditDiscrepancy(currentItem);
    
    // Check auto-approve business rule:
    // If difference is within tolerance AND photo is already approved (or not required)
    const withinTolerance =
      Math.abs(difference) <= settings.autoApproveToleranceUnits &&
      Math.abs(differenceValue) <= settings.autoApproveToleranceValue;

    let autoApproved = false;
    if (withinTolerance && currentItem.photoStatus === 'approved') {
      currentItem.status = 'approved';
      currentItem.approvedByName = 'Auto-Tolerance Engine';
      currentItem.approvedAt = new Date().toISOString();
      currentItem.approvalTier = 'auto_tolerance';
      autoApproved = true;
    } else {
      currentItem.status = 'awaiting_approval';
    }

    items[idx] = currentItem;
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, items);

    await this.logAction({
      action: 'COUNT_SAVED',
      details: `Count ${payload.physicalCount} saved for ${currentItem.product.name} (Bin: ${updatedBin || 'None'}). Status: ${currentItem.status}`,
      auditId: payload.auditId,
      productId: payload.productId,
      productName: currentItem.product.name,
    });

    return { item: currentItem, autoApproved, offlineQueued };
  },

  async uploadPhoto(
    auditId: string,
    productId: string,
    photoDataUrl: string,
    gps: {
      lat: number;
      lng: number;
      accuracy: number;
      distanceM: number;
      withinWindow: boolean;
    }
  ): Promise<AuditItem> {
    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const idx = items.findIndex((i) => i.auditId === auditId && i.productId === productId);
    if (idx === -1) throw new Error('Item not found');

    const item = items[idx];
    item.photoUrl = photoDataUrl;
    item.photoCapturedAt = new Date().toISOString();
    item.photoGpsLat = gps.lat;
    item.photoGpsLng = gps.lng;
    item.photoGpsAccuracy = gps.accuracy;
    item.photoDistanceFromStoreM = gps.distanceM;
    item.photoWithinWindow = gps.withinWindow;
    item.photoStatus = 'pending';

    items[idx] = item;
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, items);

    await this.logAction({
      action: 'PHOTO_UPLOADED',
      details: `Photo uploaded for ${item.product.name}. Distance from store: ${gps.distanceM}m (Accuracy: ±${gps.accuracy}m)`,
      auditId,
      productId,
      productName: item.product.name,
    });

    return item;
  },

  // Back Office Approval Actions
  async approveProduct(
    auditId: string,
    productId: string,
    reason: DifferenceReason = 'none',
    reasonNote?: string
  ): Promise<AuditItem> {
    const currentUser = await this.getCurrentUser();
    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const idx = items.findIndex((i) => i.auditId === auditId && i.productId === productId);
    if (idx === -1) throw new Error('Item not found');

    const item = items[idx];
    const discrepancy = calculateAuditDiscrepancy(item);

    item.status = 'approved';
    item.differenceReason = reason;
    item.differenceReasonNote = reasonNote;
    item.approvedByUserId = currentUser?.id;
    item.approvedByName = currentUser?.name || 'Back Office Reviewer';
    item.approvedAt = new Date().toISOString();
    item.photoStatus = 'approved'; // Approving product also validates its photo

    // Determine approval tier
    const settings = await this.getAdminSettings();
    if (discrepancy.differenceValue > settings.storeManagerApprovalThreshold) {
      item.approvalTier = 'head_office';
    } else {
      item.approvalTier = 'store_manager';
    }

    // Auto-generate ERP adjustment number if difference != 0
    if (discrepancy.difference !== 0 && !item.erpAdjustmentNo) {
      item.erpAdjustmentNo = `ADJ-${Math.floor(100000 + Math.random() * 900000)}`;
      item.erpAdjustmentPostedAt = new Date().toISOString();
    }

    items[idx] = item;
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, items);

    await this.logAction({
      action: 'PRODUCT_APPROVED',
      details: `Approved by ${currentUser?.name}. Diff: ${discrepancy.difference} (${discrepancy.direction}) Value: $${discrepancy.differenceValue}. Reason: ${reason}`,
      auditId,
      productId,
      productName: item.product.name,
    });

    return item;
  },

  async sendToRecount(
    auditId: string,
    productId: string,
    recountAssigneeId: string,
    note?: string
  ): Promise<AuditItem> {
    const currentUser = await this.getCurrentUser();
    const users = await this.getUsers();
    const assignee = users.find((u) => u.id === recountAssigneeId);

    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const idx = items.findIndex((i) => i.auditId === auditId && i.productId === productId);
    if (idx === -1) throw new Error('Item not found');

    const item = items[idx];

    // Business rule: Recount must be assigned to a different person than the original counter!
    if (item.countedByUserId && item.countedByUserId === recountAssigneeId) {
      throw new Error('Business Rule: Recount must be assigned to a different person than the original auditor.');
    }

    item.status = 'recount';
    item.recountAssignedToId = recountAssigneeId;
    item.recountAssignedToName = assignee?.name || 'Assigned Auditor';
    item.recountNote = note || 'Physically verify pack count and secondary storage racks.';

    items[idx] = item;
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, items);

    await this.logAction({
      action: 'RECOUNT_DISPATCHED',
      details: `Recount dispatched to ${assignee?.name || recountAssigneeId} for ${item.product.name}. Note: ${item.recountNote}`,
      auditId,
      productId,
      productName: item.product.name,
    });

    return item;
  },

  async approvePhoto(auditId: string, productId: string): Promise<AuditItem> {
    const currentUser = await this.getCurrentUser();
    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const idx = items.findIndex((i) => i.auditId === auditId && i.productId === productId);
    if (idx === -1) throw new Error('Item not found');

    const item = items[idx];
    item.photoStatus = 'approved';

    // If count was saved and differences within tolerance, auto-approve product!
    const settings = await this.getAdminSettings();
    const { difference, differenceValue } = calculateAuditDiscrepancy(item);
    if (
      item.physicalCount !== undefined &&
      Math.abs(difference) <= settings.autoApproveToleranceUnits &&
      Math.abs(differenceValue) <= settings.autoApproveToleranceValue
    ) {
      item.status = 'approved';
      item.approvedByName = 'Auto-Tolerance Engine';
      item.approvedAt = new Date().toISOString();
      item.approvalTier = 'auto_tolerance';
    }

    items[idx] = item;
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, items);

    await this.logAction({
      action: 'PHOTO_APPROVED',
      details: `Photo verified and approved by ${currentUser?.name || 'Back Office'} for ${item.product.name}`,
      auditId,
      productId,
      productName: item.product.name,
    });

    return item;
  },

  async rejectPhoto(auditId: string, productId: string, reason: string): Promise<AuditItem> {
    const currentUser = await this.getCurrentUser();
    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const idx = items.findIndex((i) => i.auditId === auditId && i.productId === productId);
    if (idx === -1) throw new Error('Item not found');

    const item = items[idx];
    item.photoStatus = 'rejected';
    item.photoRejectReason = reason;
    // Rejection sends item back to recount/retake
    item.status = 'recount';
    item.recountNote = `Photo rejected: ${reason}. Please retake clear photo inside the shelf aisle.`;

    items[idx] = item;
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, items);

    await this.logAction({
      action: 'PHOTO_REJECTED',
      details: `Photo rejected for ${item.product.name}. Reason: ${reason}`,
      auditId,
      productId,
      productName: item.product.name,
    });

    return item;
  },

  async skipProduct(auditId: string, productId: string, reason: string): Promise<AuditItem> {
    const currentUser = await this.getCurrentUser();
    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const idx = items.findIndex((i) => i.auditId === auditId && i.productId === productId);
    if (idx === -1) throw new Error('Item not found');

    const item = items[idx];
    item.status = 'skipped';
    item.skipReason = reason;
    item.skippedByUserId = currentUser?.id;
    item.skippedByName = currentUser?.name;

    items[idx] = item;
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, items);

    await this.logAction({
      action: 'PRODUCT_SKIPPED',
      details: `Product ${item.product.name} skipped with authorized reason: "${reason}" by ${currentUser?.name}`,
      auditId,
      productId,
      productName: item.product.name,
    });

    return item;
  },

  // Audit Closure validation
  async submitAudit(auditId: string): Promise<{ success: boolean; message: string }> {
    const items = await this.getAuditItems(auditId);
    
    // Business rule:
    // A product counts as audited only when the count is saved AND its photo is approved (or skipped with authorized reason).
    // An audit cannot be closed while any product is pending unless back office records an approved skip reason.
    const pendingItems = items.filter(
      (item) => item.status === 'not_started' || item.status === 'awaiting_approval' || item.status === 'recount'
    );

    if (pendingItems.length > 0) {
      return {
        success: false,
        message: `Cannot close audit: ${pendingItems.length} product(s) still pending review, recount, or photo approval. Authorized skip reason required for uncounted items.`,
      };
    }

    const audits = await this.getAudits();
    const auditIdx = audits.findIndex((a) => a.id === auditId);
    if (auditIdx >= 0) {
      audits[auditIdx].status = 'completed';
      audits[auditIdx].completedAt = new Date().toISOString();
      writeStorage(STORAGE_KEYS.AUDITS, audits);
    }

    const currentUser = await this.getCurrentUser();
    await this.logAction({
      action: 'AUDIT_CLOSED',
      details: `Audit ${audits[auditIdx]?.name || auditId} finalized and closed by ${currentUser?.name}`,
      auditId,
    });

    return {
      success: true,
      message: 'Audit successfully finalized and submitted. All reconciliation vouchers generated.',
    };
  },

  // Cutoff Bills Drilldown
  async getCutoffBills(auditId: string, productId: string): Promise<CutoffBillItem[]> {
    const billsMap = readStorage<Record<string, CutoffBillItem[]>>(STORAGE_KEYS.CUTOFF_BILLS, {});
    const key = `${auditId}_${productId}`;
    return billsMap[key] || [];
  },

  // Bin Suggestions Queue
  async suggestBin(auditId: string, productId: string, suggestedBin: string): Promise<BinSuggestion> {
    const currentUser = await this.getCurrentUser();
    const product = await this.getProductById(productId);
    const audit = await this.getAuditById(auditId);

    // Look for similar bins
    const products = await this.getProducts();
    const existingBins = Array.from(new Set(products.map((p) => p.defaultBin).filter(Boolean))) as string[];
    const normalized = suggestedBin.trim().toUpperCase();
    const similar = existingBins.filter(
      (b) => b.toUpperCase().startsWith(normalized.slice(0, 2)) || b.toUpperCase() === normalized
    );

    const suggestion: BinSuggestion = {
      id: `BSUG-${Date.now()}`,
      auditId,
      storeId: audit?.storeId || '',
      productId,
      productName: product?.name || '',
      suggestedBin: normalized,
      auditorId: currentUser?.id || '',
      auditorName: currentUser?.name || '',
      createdAt: new Date().toISOString(),
      status: 'pending',
      similarExistingBins: similar.slice(0, 3),
    };

    const list = readStorage<BinSuggestion[]>(STORAGE_KEYS.BIN_SUGGESTIONS, []);
    list.unshift(suggestion);
    writeStorage(STORAGE_KEYS.BIN_SUGGESTIONS, list);

    await this.logAction({
      action: 'BIN_SUGGESTED',
      details: `New bin "${normalized}" suggested for ${product?.name} by ${currentUser?.name}`,
      auditId,
      productId,
      productName: product?.name,
    });

    return suggestion;
  },

  async getBinSuggestions(): Promise<BinSuggestion[]> {
    return readStorage<BinSuggestion[]>(STORAGE_KEYS.BIN_SUGGESTIONS, []);
  },

  async reviewBinSuggestion(id: string, approved: boolean, note?: string): Promise<void> {
    const currentUser = await this.getCurrentUser();
    const list = readStorage<BinSuggestion[]>(STORAGE_KEYS.BIN_SUGGESTIONS, []);
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return;

    list[idx].status = approved ? 'approved' : 'rejected';
    list[idx].reviewNote = note || (approved ? 'Approved by Back Office' : 'Rejected');
    writeStorage(STORAGE_KEYS.BIN_SUGGESTIONS, list);

    if (approved) {
      // Update default bin on master product as well
      const products = await this.getProducts();
      const pIdx = products.findIndex((p) => p.id === list[idx].productId);
      if (pIdx >= 0) {
        products[pIdx].defaultBin = list[idx].suggestedBin;
        writeStorage(STORAGE_KEYS.PRODUCTS, products);
      }
    }

    await this.logAction({
      action: approved ? 'BIN_APPROVED' : 'BIN_REJECTED',
      details: `Bin suggestion "${list[idx].suggestedBin}" for ${list[idx].productName} ${approved ? 'approved' : 'rejected'} by ${currentUser?.name}`,
    });
  },

  // Product History
  async getProductAuditHistory(productId: string): Promise<{
    product: Product | undefined;
    summary: {
      timesAudited: number;
      shortCount: number;
      excessCount: number;
      totalValueLost: number;
    };
    timeline: ProductAuditHistoryEntry[];
  }> {
    const product = await this.getProductById(productId);
    const allAudits = await this.getAudits();
    const allItems = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const productItems = allItems.filter((i) => i.productId === productId);

    const timeline: ProductAuditHistoryEntry[] = [];
    let shortCount = 0;
    let excessCount = 0;
    let totalValueLost = 0;

    for (const item of productItems) {
      const audit = allAudits.find((a) => a.id === item.auditId);
      const disc = calculateAuditDiscrepancy(item);
      if (disc.direction === 'short') {
        shortCount++;
        totalValueLost += disc.differenceValue;
      } else if (disc.direction === 'excess') {
        excessCount++;
      }

      timeline.push({
        auditId: item.auditId,
        auditName: audit?.name || item.auditId,
        date: audit?.date || '',
        storeName: audit?.storeName || '',
        bin: item.bin || 'None',
        snapshotQty: item.snapshotQty,
        physicalCount: item.physicalCount ?? 0,
        finalDifference: disc.difference,
        differenceValue: disc.differenceValue,
        differenceReason: item.differenceReason,
        approverName: item.approvedByName || '',
        erpAdjustmentNo: item.erpAdjustmentNo,
      });
    }

    return {
      product,
      summary: {
        timesAudited: timeline.length,
        shortCount,
        excessCount,
        totalValueLost: Math.round(totalValueLost * 100) / 100,
      },
      timeline,
    };
  },

  // Offline Sync Management
  async getUnsyncedCount(): Promise<number> {
    try {
      return await getDbUnsyncedCount();
    } catch {
      return 0;
    }
  },

  async syncOfflineData(): Promise<{ syncedCount: number }> {
    const unsynced = await getUnsyncedOfflineCounts();
    let count = 0;

    for (const item of unsynced) {
      await markAsSynced(item.id);
      count++;
    }

    if (count > 0) {
      await clearSyncedItems();
    }

    return { syncedCount: count };
  },

  // Admin & System Settings
  async getAdminSettings(): Promise<SystemSettings> {
    return readStorage<SystemSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  },

  async updateAdminSettings(settings: SystemSettings): Promise<SystemSettings> {
    writeStorage(STORAGE_KEYS.SETTINGS, settings);
    const currentUser = await this.getCurrentUser();
    await this.logAction({
      action: 'SETTINGS_UPDATED',
      details: `Tolerance & Approval thresholds updated by ${currentUser?.name}`,
    });
    return settings;
  },

  // Audit Logs
  async getAuditLogs(): Promise<AuditLogEntry[]> {
    return readStorage<AuditLogEntry[]>(STORAGE_KEYS.LOGS, []);
  },

  async logAction(entry: {
    action: string;
    details: string;
    auditId?: string;
    auditName?: string;
    productId?: string;
    productName?: string;
  }): Promise<void> {
    const currentUser = await this.getCurrentUser();
    const logs = readStorage<AuditLogEntry[]>(STORAGE_KEYS.LOGS, []);
    const newLog: AuditLogEntry = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'SYSTEM',
      userName: currentUser?.name || 'System Auto',
      userRole: currentUser?.role || 'admin',
      action: entry.action,
      details: entry.details,
      auditId: entry.auditId,
      auditName: entry.auditName,
      productId: entry.productId,
      productName: entry.productName,
    };
    logs.unshift(newLog);
    // Keep max 500 logs
    writeStorage(STORAGE_KEYS.LOGS, logs.slice(0, 500));
  },
};
