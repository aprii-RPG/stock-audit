export type UserRole = 'auditor' | 'back office' | 'admin';

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  assignedStoreIds: string[];
  avatarUrl?: string;
  phone?: string;
}

export interface Store {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number; // e.g. 150m
  managerName: string;
  contactPhone: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  pack: string;
  company: string;
  category: string;
  unitPrice: number;
  defaultBin?: string;
  barcode: string;
  currentBatch: string;
  expiry: string;
  lastAuditedDate?: string;
  lastAuditedResult?: string;
}

export type AuditStatus = 'planned' | 'in_progress' | 'under_review' | 'completed';
export type AuditType = 'QUARTERLY FULL AUDIT' | 'MONTHLY CYCLE COUNT' | 'HIGH-VALUE NARCOTICS' | 'SPOT RECOUNT';

export interface Audit {
  id: string;
  name: string; // Format: STORE / TYPE / DATE
  storeId: string;
  storeName: string;
  type: AuditType;
  date: string;
  status: AuditStatus;
  assignedAuditorIds: string[];
  assignedBackOfficeIds: string[];
  snapshotLockedAt: string;
  cutoffBillNo: string;
  notes?: string;
  completedAt?: string;
  createdAt: string;
}

export type ItemStatus = 'not_started' | 'awaiting_approval' | 'recount' | 'approved' | 'skipped';

export type DifferenceReason =
  | 'expired'
  | 'damaged'
  | 'theft_loss'
  | 'wrong_billing'
  | 'purchase_not_entered'
  | 'return_not_entered'
  | 'wrong_batch'
  | 'none';

export interface CutoffBillItem {
  billNo: string;
  time: string;
  customerOrPatient?: string;
  qty: number;
  type: 'sale' | 'return' | 'purchase';
}

export interface AuditItem {
  id: string;
  auditId: string;
  productId: string;
  product: Product;
  bin: string; // assigned or suggested bin
  snapshotQty: number; // strictly hidden on auditor blind count screen
  salesAfterCutoff: number;
  returnsAfterCutoff: number;
  purchasesAfterCutoff: number;
  
  // Auditor inputs
  physicalCount?: number;
  countSavedAt?: string;
  countedByUserId?: string;
  countedByUserName?: string;
  
  // Photo verification
  photoUrl?: string;
  photoCapturedAt?: string;
  photoGpsLat?: number;
  photoGpsLng?: number;
  photoGpsAccuracy?: number;
  photoDistanceFromStoreM?: number;
  photoWithinWindow?: boolean;
  photoStatus: 'none' | 'pending' | 'approved' | 'rejected';
  photoRejectReason?: string;
  
  // Status and review
  status: ItemStatus;
  differenceReason?: DifferenceReason;
  differenceReasonNote?: string;
  
  // Recount data
  recountCount?: number;
  recountAssignedToId?: string;
  recountAssignedToName?: string;
  recountedByUserId?: string;
  recountNote?: string;
  
  // Approvals & skip
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalTier?: 'auto_tolerance' | 'store_manager' | 'head_office';
  
  skipReason?: string;
  skippedByUserId?: string;
  skippedByName?: string;
  
  erpAdjustmentNo?: string;
  erpAdjustmentPostedAt?: string;
}

export interface BinSuggestion {
  id: string;
  auditId: string;
  storeId: string;
  productId: string;
  productName: string;
  suggestedBin: string;
  auditorId: string;
  auditorName: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  similarExistingBins?: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  auditId?: string;
  auditName?: string;
  productId?: string;
  productName?: string;
}

export interface SystemSettings {
  autoApproveToleranceUnits: number; // e.g. 1 unit
  autoApproveToleranceValue: number; // e.g. $10
  storeManagerApprovalThreshold: number; // up to $100
  hoApprovalThreshold: number; // over $100 requires HO
  defaultGeofenceRadiusMeters: number;
  reasons: { code: DifferenceReason; label: string; description: string }[];
}

export interface OfflineCountQueueItem {
  id: string;
  auditId: string;
  productId: string;
  physicalCount: number;
  bin: string;
  timestamp: string;
  photoDataUrl?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy: number;
    distanceM: number;
    withinWindow: boolean;
  };
  synced: boolean;
}

export interface ProductAuditHistoryEntry {
  auditId: string;
  auditName: string;
  date: string;
  storeName: string;
  bin: string;
  snapshotQty: number;
  physicalCount: number;
  finalDifference: number;
  differenceValue: number;
  differenceReason?: DifferenceReason;
  approverName: string;
  erpAdjustmentNo?: string;
}
