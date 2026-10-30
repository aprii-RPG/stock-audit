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
import {
  generateInitialAuditItems,
  INITIAL_AUDIT_LOGS,
  INITIAL_AUDITS,
  INITIAL_BIN_SUGGESTIONS,
  INITIAL_CUTOFF_BILLS,
  INITIAL_SETTINGS,
  INITIAL_STORES,
  INITIAL_USERS,
  MEDICINE_PRODUCTS,
} from './mockData';

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

// Ensure seeded storage
function initStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.STORES)) {
    writeStorage(STORAGE_KEYS.STORES, INITIAL_STORES);
  }
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    writeStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
    writeStorage(STORAGE_KEYS.PRODUCTS, MEDICINE_PRODUCTS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.AUDITS)) {
    writeStorage(STORAGE_KEYS.AUDITS, INITIAL_AUDITS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.AUDIT_ITEMS)) {
    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, generateInitialAuditItems());
  }
  if (!localStorage.getItem(STORAGE_KEYS.CUTOFF_BILLS)) {
    writeStorage(STORAGE_KEYS.CUTOFF_BILLS, INITIAL_CUTOFF_BILLS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.BIN_SUGGESTIONS)) {
    writeStorage(STORAGE_KEYS.BIN_SUGGESTIONS, INITIAL_BIN_SUGGESTIONS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    writeStorage(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
    writeStorage(STORAGE_KEYS.LOGS, INITIAL_AUDIT_LOGS);
  }
  // Default login user: Alex Reed (Auditor)
  if (!localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) {
    writeStorage(STORAGE_KEYS.CURRENT_USER, INITIAL_USERS[0]);
  }
}

initStorage();

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
    return readStorage<User | null>(STORAGE_KEYS.CURRENT_USER, INITIAL_USERS[0]);
  },

  async setCurrentUser(user: User): Promise<void> {
    writeStorage(STORAGE_KEYS.CURRENT_USER, user);
  },

  async login(loginIdOrEmail: string, _password?: string, branchId?: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const users = readStorage<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const trimmed = loginIdOrEmail.trim().toLowerCase();
    const found = users.find(
      (u) =>
        u.employeeId.toLowerCase() === trimmed ||
        u.email.toLowerCase() === trimmed ||
        u.name.toLowerCase() === trimmed
    );

    if (found) {
      if (branchId && found.role === 'auditor' && !found.assignedStoreIds.includes(branchId)) {
        const stores = readStorage<Store[]>(STORAGE_KEYS.STORES, INITIAL_STORES);
        const branchObj = stores.find((s) => s.id === branchId);
        const assignedBranches = stores
          .filter((s) => found.assignedStoreIds.includes(s.id))
          .map((s) => s.name);
        return {
          success: false,
          error: `Branch Access Denied: You do not have audit permissions for "${branchObj?.name || branchId}". Your assigned branches: ${assignedBranches.join(', ')}.`,
        };
      }
      writeStorage(STORAGE_KEYS.CURRENT_USER, found);
      return { success: true, user: found };
    }
    return {
      success: false,
      error: 'Invalid Login ID or Password. Please check credentials or contact admin.',
    };
  },

  async logout(): Promise<void> {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  },

  async getUsers(): Promise<User[]> {
    return readStorage<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
  },

  async saveUser(user: User): Promise<User> {
    const users = readStorage<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
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
    return readStorage<Store[]>(STORAGE_KEYS.STORES, INITIAL_STORES);
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
    return readStorage<Product[]>(STORAGE_KEYS.PRODUCTS, MEDICINE_PRODUCTS);
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
    const audits = readStorage<Audit[]>(STORAGE_KEYS.AUDITS, INITIAL_AUDITS);
    if (!storeId || storeId === 'ALL') {
      return audits;
    }
    return audits.filter((a) => a.storeId === storeId);
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
    const store = await this.getStoreById(payload.storeId);
    if (!store) throw new Error('Store not found');

    const prefixStore = store.name.split(' ')[0].toUpperCase();
    const generatedName = `${prefixStore} / ${payload.type} / ${payload.date}`;

    const newAudit: Audit = {
      id: `AUD-${Date.now()}`,
      name: generatedName,
      storeId: payload.storeId,
      storeName: store.name,
      type: payload.type,
      date: payload.date,
      status: 'in_progress',
      assignedAuditorIds: payload.assignedAuditorIds,
      assignedBackOfficeIds: payload.assignedBackOfficeIds,
      snapshotLockedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cutoffBillNo: `#INV-${Math.floor(10000 + Math.random() * 90000)}`,
      notes: payload.notes,
      createdAt: new Date().toISOString(),
    };

    const audits = await this.getAudits();
    audits.unshift(newAudit);
    writeStorage(STORAGE_KEYS.AUDITS, audits);

    // Populate audit items based on product filter
    const allProducts = await this.getProducts();
    let selectedProducts = allProducts;
    if (payload.productSelectionType === 'category' && payload.filterValue) {
      selectedProducts = allProducts.filter((p) => p.category === payload.filterValue);
    } else if (payload.productSelectionType === 'company' && payload.filterValue) {
      selectedProducts = allProducts.filter((p) => p.company === payload.filterValue);
    } else if (payload.productSelectionType === 'not_audited_days') {
      // Pick random 15 products as overdue
      selectedProducts = allProducts.slice(0, 20);
    }

    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    const newItems: AuditItem[] = selectedProducts.map((p, idx) => ({
      id: `ITM-${newAudit.id}-${idx}`,
      auditId: newAudit.id,
      productId: p.id,
      product: p,
      bin: p.defaultBin || '',
      snapshotQty: Math.floor(10 + Math.random() * 80),
      salesAfterCutoff: idx % 3 === 0 ? 1 : 0,
      returnsAfterCutoff: 0,
      purchasesAfterCutoff: 0,
      photoStatus: 'none',
      status: 'not_started',
    }));

    writeStorage(STORAGE_KEYS.AUDIT_ITEMS, [...items, ...newItems]);

    await this.logAction({
      action: 'AUDIT_CREATED',
      details: `Audit ${newAudit.name} created with ${newItems.length} products. Cutoff bill: ${newAudit.cutoffBillNo}`,
      auditId: newAudit.id,
      auditName: newAudit.name,
    });

    return newAudit;
  },

  // Audit Items & Counts
  async getAuditItems(auditId: string): Promise<AuditItem[]> {
    const items = readStorage<AuditItem[]>(STORAGE_KEYS.AUDIT_ITEMS, []);
    return items.filter((i) => i.auditId === auditId);
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
    currentItem.countedByUserId = currentUser?.id || 'USR-01';
    currentItem.countedByUserName = currentUser?.name || 'Alex Reed';
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
    const billsMap = readStorage<Record<string, CutoffBillItem[]>>(STORAGE_KEYS.CUTOFF_BILLS, INITIAL_CUTOFF_BILLS);
    const key = `${auditId}_${productId}`;
    if (billsMap[key]) {
      return billsMap[key];
    }
    // Return realistic generated post-cutoff transactions if not explicitly defined
    return [
      {
        billNo: '#INV-84922',
        time: '08:45 AM',
        customerOrPatient: 'Counter Walk-in',
        qty: 1,
        type: 'sale',
      },
    ];
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
      storeId: audit?.storeId || 'STR-01',
      productId,
      productName: product?.name || 'Unknown Medicine',
      suggestedBin: normalized,
      auditorId: currentUser?.id || 'USR-01',
      auditorName: currentUser?.name || 'Alex Reed',
      createdAt: new Date().toISOString(),
      status: 'pending',
      similarExistingBins: similar.slice(0, 3),
    };

    const list = readStorage<BinSuggestion[]>(STORAGE_KEYS.BIN_SUGGESTIONS, INITIAL_BIN_SUGGESTIONS);
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
    return readStorage<BinSuggestion[]>(STORAGE_KEYS.BIN_SUGGESTIONS, INITIAL_BIN_SUGGESTIONS);
  },

  async reviewBinSuggestion(id: string, approved: boolean, note?: string): Promise<void> {
    const currentUser = await this.getCurrentUser();
    const list = readStorage<BinSuggestion[]>(STORAGE_KEYS.BIN_SUGGESTIONS, INITIAL_BIN_SUGGESTIONS);
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
        date: audit?.date || '2026-10-22',
        storeName: audit?.storeName || 'Apex Central Pharmacy',
        bin: item.bin || 'None',
        snapshotQty: item.snapshotQty,
        physicalCount: item.physicalCount ?? item.snapshotQty,
        finalDifference: disc.difference,
        differenceValue: disc.differenceValue,
        differenceReason: item.differenceReason,
        approverName: item.approvedByName || 'Sarah Jenkins',
        erpAdjustmentNo: item.erpAdjustmentNo || 'ADJ-84902',
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
    return readStorage<SystemSettings>(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
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
    return readStorage<AuditLogEntry[]>(STORAGE_KEYS.LOGS, INITIAL_AUDIT_LOGS);
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
    const logs = readStorage<AuditLogEntry[]>(STORAGE_KEYS.LOGS, INITIAL_AUDIT_LOGS);
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
