/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  Audit,
  AuditItem,
  AuditType,
  BinSuggestion,
  CutoffBillItem,
  DifferenceReason,
  Product,
  Store,
  SystemSettings,
  User,
} from './types';
import { api } from './services/api';
import { TopBar } from './components/navigation/TopBar';
import { BackOfficeSidebar, type BackOfficeTab } from './components/navigation/BackOfficeSidebar';
import { AuditorBottomNav, type AuditorTab } from './components/auditor/AuditorBottomNav';
import { LoginScreen } from './components/auditor/LoginScreen';
import { MyAuditsScreen } from './components/auditor/MyAuditsScreen';
import { ProductListScreen } from './components/auditor/ProductListScreen';
import { BlindCountScreen } from './components/auditor/BlindCountScreen';
import { PhotoCaptureModal } from './components/auditor/PhotoCaptureModal';
import { BarcodeScanModal } from './components/auditor/BarcodeScanModal';
import { AuditProgressScreen } from './components/auditor/AuditProgressScreen';
import { DashboardView } from './components/backoffice/DashboardView';
import { ProductReviewView } from './components/backoffice/ProductReviewView';
import { PhotoApprovalView } from './components/backoffice/PhotoApprovalView';
import { ProductHistoryView } from './components/backoffice/ProductHistoryView';
import { AuditPlannerModal } from './components/backoffice/AuditPlannerModal';
import { ApprovalsView } from './components/backoffice/ApprovalsView';
import { ERPAdjustmentsView } from './components/backoffice/ERPAdjustmentsView';
import { BinSuggestionsView } from './components/backoffice/BinSuggestionsView';
import { ReportsView } from './components/backoffice/ReportsView';
import { AdminSettingsView } from './components/backoffice/AdminSettingsView';
import { AuditLogView } from './components/backoffice/AuditLogView';
import { OfflineIndicator } from './components/common/OfflineIndicator';

export default function App() {
  // App Core State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cutoffBillsMap, setCutoffBillsMap] = useState<Record<string, CutoffBillItem[]>>({});
  const [binSuggestions, setBinSuggestions] = useState<BinSuggestion[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  // Navigation & View State
  const [selectedStoreId, setSelectedStoreId] = useState<string>('STR-01');
  const [activeAudit, setActiveAudit] = useState<Audit | null>(null);
  const [selectedAuditItem, setSelectedAuditItem] = useState<AuditItem | null>(null);
  const [backOfficeTab, setBackOfficeTab] = useState<BackOfficeTab>('dashboard');
  const [auditorTab, setAuditorTab] = useState<AuditorTab>('audits');
  const [forceAuditorMode, setForceAuditorMode] = useState<boolean>(false);

  // Modals
  const [showPhotoModal, setShowPhotoModal] = useState<boolean>(false);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [showPlannerModal, setShowPlannerModal] = useState<boolean>(false);

  // Sync state
  const [unsyncedCount, setUnsyncedCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Refresh all state from API
  const refreshData = useCallback(async () => {
    try {
      const [
        u,
        allU,
        s,
        p,
        a,
        sett,
        bs,
        lg,
        unsynced,
      ] = await Promise.all([
        api.getCurrentUser(),
        api.getUsers(),
        api.getStores(),
        api.getProducts(),
        api.getAudits(),
        api.getAdminSettings(),
        api.getBinSuggestions(),
        api.getAuditLogs(),
        api.getUnsyncedCount(),
      ]);

      setCurrentUser(u);
      setAllUsers(allU);
      setStores(s);
      setProducts(p);
      setAudits(a);
      setSettings(sett);
      setBinSuggestions(bs);
      setLogs(lg);
      setUnsyncedCount(unsynced);

      // Load all items
      if (a.length > 0) {
        const itemPromises = a.map((audit) => api.getAuditItems(audit.id));
        const allItemsNested = await Promise.all(itemPromises);
        const combined = allItemsNested.flat();
        setItems(combined);

        // Keep active audit updated
        setActiveAudit((prev) => {
          if (!prev) return a[0];
          return a.find((x) => x.id === prev.id) || a[0];
        });
      }
    } catch (e) {
      console.error('Data load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Sync Offline Queue
  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await api.syncOfflineData();
      await refreshData();
    } finally {
      setIsSyncing(false);
    }
  };

  // User switch
  const handleSwitchUser = async (user: User, overrideBranchId?: string) => {
    await api.setCurrentUser(user);
    setCurrentUser(user);
    const targetBranch =
      overrideBranchId ||
      (user.role === 'auditor' && !user.assignedStoreIds.includes(selectedStoreId)
        ? user.assignedStoreIds[0]
        : selectedStoreId);

    if (targetBranch) {
      setSelectedStoreId(targetBranch);
      const storeAudit = audits.find((a) => a.storeId === targetBranch);
      if (storeAudit) setActiveAudit(storeAudit);
    }

    if (user.role === 'auditor') {
      setForceAuditorMode(true);
    } else {
      setForceAuditorMode(false);
    }
    await refreshData();
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
  };

  // Auditor Actions
  const handleSaveCount = async (count: number, binName?: string) => {
    if (!activeAudit || !selectedAuditItem) return;
    await api.saveCount({
      auditId: activeAudit.id,
      productId: selectedAuditItem.productId,
      physicalCount: count,
      binName,
    });
    await refreshData();
  };

  const handlePhotoSaved = async (
    dataUrl: string,
    gps: { lat: number; lng: number; accuracy: number; distanceM: number; withinWindow: boolean }
  ) => {
    if (!activeAudit || !selectedAuditItem) return;
    await api.uploadPhoto(activeAudit.id, selectedAuditItem.productId, dataUrl, gps);
    await refreshData();
  };

  const handleSuggestNewBin = async (binName: string) => {
    if (!activeAudit || !selectedAuditItem) return;
    await api.suggestBin(activeAudit.id, selectedAuditItem.productId, binName);
    await refreshData();
  };

  const handleNextProduct = () => {
    if (!activeAudit || !selectedAuditItem) return;
    const currentAuditItems = items.filter((i) => i.auditId === activeAudit.id);
    const currentIndex = currentAuditItems.findIndex((i) => i.id === selectedAuditItem.id);
    if (currentIndex >= 0 && currentIndex < currentAuditItems.length - 1) {
      setSelectedAuditItem(currentAuditItems[currentIndex + 1]);
    }
  };

  // Back Office Approval Actions
  const handleApproveProduct = async (
    auditId: string,
    productId: string,
    reason: DifferenceReason,
    note?: string
  ) => {
    await api.approveProduct(auditId, productId, reason, note);
    await refreshData();
  };

  const handleSendToRecount = async (
    auditId: string,
    productId: string,
    recountAssigneeId: string,
    note?: string
  ) => {
    await api.sendToRecount(auditId, productId, recountAssigneeId, note);
    await refreshData();
  };

  const handleApprovePhoto = async (auditId: string, productId: string) => {
    await api.approvePhoto(auditId, productId);
    await refreshData();
  };

  const handleRejectPhoto = async (auditId: string, productId: string, reason: string) => {
    await api.rejectPhoto(auditId, productId, reason);
    await refreshData();
  };

  const handleCreateAudit = async (payload: {
    storeId: string;
    type: AuditType;
    date: string;
    assignedAuditorIds: string[];
    assignedBackOfficeIds: string[];
    productSelectionType: 'all' | 'category' | 'company' | 'not_audited_days';
    filterValue?: string;
    notes?: string;
  }) => {
    const created = await api.createAudit(payload);
    await refreshData();
    setActiveAudit(created);
    setBackOfficeTab('audits');
  };

  const handleSubmitAudit = async () => {
    if (!activeAudit) return;
    const res = await api.submitAudit(activeAudit.id);
    if (!res.success) {
      throw new Error(res.message);
    }
    await refreshData();
  };

  const handleSkipProduct = async (item: AuditItem, reason: string) => {
    await api.skipProduct(item.auditId, item.productId, reason);
    await refreshData();
  };

  const handleReviewBin = async (id: string, approved: boolean, note?: string) => {
    await api.reviewBinSuggestion(id, approved, note);
    await refreshData();
  };

  if (isLoading || !settings) {
    return (
      <div className="min-h-screen bg-[#F7FAFF] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#0B3D91] text-white flex items-center justify-center mx-auto animate-pulse">
            <span className="font-bold text-xl">SA</span>
          </div>
          <p className="text-sm font-bold text-[#0B3D91]">Loading Stock Audit System...</p>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Login Screen
  if (!currentUser) {
    return (
      <LoginScreen
        stores={stores}
        onLoginSuccess={(user, branchId) => {
          handleSwitchUser(user, branchId);
        }}
      />
    );
  }

  // Map audit items by auditId for quick access
  const auditItemsMap: Record<string, AuditItem[]> = {};
  audits.forEach((a) => {
    auditItemsMap[a.id] = items.filter((i) => i.auditId === a.id);
  });

  const activeAuditItems = activeAudit ? items.filter((i) => i.auditId === activeAudit.id) : [];

  // Existing unique bins for dropdown
  const existingBins = Array.from(
    new Set(products.map((p) => p.defaultBin).filter(Boolean))
  ) as string[];

  // Pending badge counters
  const pendingPhotosCount = items.filter((i) => i.photoStatus === 'pending').length;
  const pendingApprovalsCount = items.filter(
    (i) => i.status === 'awaiting_approval' || i.status === 'recount'
  ).length;
  const pendingBinsCount = binSuggestions.filter((b) => b.status === 'pending').length;

  // Determine if in Auditor View or Back Office View
  const isAuditorView = currentUser.role === 'auditor' || forceAuditorMode;

  return (
    <div className="min-h-screen bg-[#F7FAFF] flex flex-col antialiased">
      {/* Top Bar with Store Selector & User profile */}
      <TopBar
        currentUser={currentUser}
        allUsers={allUsers}
        stores={stores}
        selectedStoreId={selectedStoreId}
        onSelectStore={(id) => {
          setSelectedStoreId(id);
          // Also set active audit matching this store if available
          const storeAudit = audits.find((a) => a.storeId === id);
          if (storeAudit) setActiveAudit(storeAudit);
        }}
        onSwitchUser={handleSwitchUser}
        onLogout={handleLogout}
        unsyncedCount={unsyncedCount}
        onSync={handleSyncNow}
        isSyncing={isSyncing}
        auditorViewActive={isAuditorView}
        onToggleAuditorBackOffice={() => setForceAuditorMode(!forceAuditorMode)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* If Back Office / Admin view on desktop, render left sidebar */}
        {!isAuditorView && (
          <BackOfficeSidebar
            currentTab={backOfficeTab}
            onSelectTab={setBackOfficeTab}
            pendingPhotosCount={pendingPhotosCount}
            pendingApprovalsCount={pendingApprovalsCount}
            pendingBinsCount={pendingBinsCount}
          />
        )}

        {/* Dynamic Screen Viewport */}
        <main className="flex-1 overflow-y-auto pb-20 sm:pb-6">
          {/* ========================================================= */}
          {/* AUDITOR FIELD VIEWS (Responsive: Phone, Tablet, Desktop)   */}
          {/* ========================================================= */}
          {isAuditorView ? (
            <>
              {/* Tab 1: My Audits */}
              {auditorTab === 'audits' && (
                <MyAuditsScreen
                  currentUser={currentUser}
                  audits={audits}
                  auditItemsMap={auditItemsMap}
                  unsyncedCount={unsyncedCount}
                  onSelectAudit={(audit) => {
                    setActiveAudit(audit);
                    const auditProducts = items.filter((i) => i.auditId === audit.id);
                    setSelectedAuditItem(auditProducts[0] || null);
                    setAuditorTab('products');
                  }}
                />
              )}

              {/* Tab 2: Product List & Blind Count */}
              {auditorTab === 'products' && activeAudit && (
                <div className="h-[calc(100vh-64px)] sm:h-[calc(100vh-64px)] flex flex-col">
                  {/* TABLET SPLIT PANE (640px to 1024px) or DESKTOP:
                      2 PANES (Product list on left ~40%, Blind count on right ~60%) */}
                  <div className="hidden sm:flex flex-1 overflow-hidden divide-x divide-blue-200">
                    <div className="w-5/12 min-w-[320px] max-w-md h-full overflow-hidden bg-white">
                      <ProductListScreen
                        audit={activeAudit}
                        items={activeAuditItems}
                        selectedItem={selectedAuditItem}
                        onSelectItem={(item) => setSelectedAuditItem(item)}
                        onOpenScanner={() => setShowScannerModal(true)}
                        onBackToAudits={() => setAuditorTab('audits')}
                        isTabletSplit={true}
                      />
                    </div>

                    <div className="flex-1 h-full overflow-y-auto bg-[#F7FAFF]">
                      {selectedAuditItem ? (
                        <BlindCountScreen
                          audit={activeAudit}
                          item={selectedAuditItem}
                          existingBins={existingBins}
                          onSaveCount={handleSaveCount}
                          onOpenPhotoCapture={() => setShowPhotoModal(true)}
                          onNextProduct={handleNextProduct}
                          onSuggestNewBin={handleSuggestNewBin}
                          isTabletSplit={true}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full p-8 text-center text-slate-400">
                          <p className="text-sm font-semibold">
                            Select a product from the list to begin blind counting.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PHONE SINGLE COLUMN (<640px):
                      Shows Product List or Blind Count screen full-screen */}
                  <div className="sm:hidden flex-1 overflow-y-auto">
                    {selectedAuditItem ? (
                      <BlindCountScreen
                        audit={activeAudit}
                        item={selectedAuditItem}
                        existingBins={existingBins}
                        onSaveCount={handleSaveCount}
                        onOpenPhotoCapture={() => setShowPhotoModal(true)}
                        onNextProduct={handleNextProduct}
                        onSuggestNewBin={handleSuggestNewBin}
                        isTabletSplit={false}
                        onClose={() => setSelectedAuditItem(null)}
                      />
                    ) : (
                      <ProductListScreen
                        audit={activeAudit}
                        items={activeAuditItems}
                        selectedItem={selectedAuditItem}
                        onSelectItem={(item) => setSelectedAuditItem(item)}
                        onOpenScanner={() => setShowScannerModal(true)}
                        onBackToAudits={() => setAuditorTab('audits')}
                        isTabletSplit={false}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Progress & Submission */}
              {auditorTab === 'progress' && activeAudit && (
                <AuditProgressScreen
                  audit={activeAudit}
                  items={activeAuditItems}
                  currentUser={currentUser}
                  onSelectItem={(item) => {
                    setSelectedAuditItem(item);
                    setAuditorTab('products');
                  }}
                  onSubmitAudit={handleSubmitAudit}
                  onSkipProduct={handleSkipProduct}
                  onBackToProducts={() => setAuditorTab('products')}
                />
              )}

              {/* Mobile Phone Bottom Nav */}
              <AuditorBottomNav
                currentTab={auditorTab}
                onSelectTab={(tab) => {
                  setAuditorTab(tab);
                  if (tab === 'audits') {
                    setSelectedAuditItem(null);
                  }
                }}
                hasActiveAudit={Boolean(activeAudit)}
                pendingCount={
                  activeAuditItems.filter(
                    (i) => i.status === 'not_started' || i.physicalCount === undefined
                  ).length
                }
              />
            </>
          ) : (
            /* ========================================================= */
            /* BACK OFFICE & ADMIN VIEWS (Blue/White, Sidebar Navigation) */
            /* ========================================================= */
            <>
              {backOfficeTab === 'dashboard' && (
                <DashboardView
                  stores={stores}
                  audits={audits}
                  auditItems={items}
                  selectedStoreId={selectedStoreId}
                  onNavigateToAudits={(auditId) => {
                    if (auditId) {
                      const match = audits.find((a) => a.id === auditId);
                      if (match) setActiveAudit(match);
                    }
                    setBackOfficeTab('audits');
                  }}
                  onNavigateToPhotos={() => setBackOfficeTab('photo_approval')}
                />
              )}

              {backOfficeTab === 'audits' && (
                <ProductReviewView
                  audits={audits}
                  selectedAuditId={activeAudit?.id || audits[0]?.id || ''}
                  onSelectAuditId={(id) => {
                    const match = audits.find((a) => a.id === id);
                    if (match) setActiveAudit(match);
                  }}
                  items={items}
                  stores={stores}
                  users={allUsers}
                  cutoffBillsMap={cutoffBillsMap}
                  onApproveProduct={handleApproveProduct}
                  onSendToRecount={handleSendToRecount}
                  onOpenAuditPlanner={() => setShowPlannerModal(true)}
                />
              )}

              {backOfficeTab === 'photo_approval' && (
                <PhotoApprovalView
                  audits={audits}
                  stores={stores}
                  items={items}
                  onApprovePhoto={handleApprovePhoto}
                  onRejectPhoto={handleRejectPhoto}
                />
              )}

              {backOfficeTab === 'approvals' && (
                <ApprovalsView
                  audits={audits}
                  items={items}
                  stores={stores}
                  settings={settings}
                  currentUser={currentUser}
                  onApproveItem={async (aId, pId) => {
                    await handleApproveProduct(aId, pId, 'none');
                  }}
                />
              )}

              {backOfficeTab === 'erp_adjustments' && (
                <ERPAdjustmentsView audits={audits} items={items} stores={stores} />
              )}

              {backOfficeTab === 'bin_suggestions' && (
                <BinSuggestionsView
                  suggestions={binSuggestions}
                  onReviewSuggestion={handleReviewBin}
                />
              )}

              {backOfficeTab === 'product_history' && (
                <ProductHistoryView products={products} />
              )}

              {backOfficeTab === 'reports' && (
                <ReportsView
                  products={products}
                  stores={stores}
                  audits={audits}
                  items={items}
                  users={allUsers}
                />
              )}

              {backOfficeTab === 'audit_log' && <AuditLogView logs={logs} />}

              {backOfficeTab === 'settings' && (
                <AdminSettingsView
                  stores={stores}
                  users={allUsers}
                  settings={settings}
                  onUpdateSettings={async (newSettings) => {
                    await api.updateAdminSettings(newSettings);
                    await refreshData();
                  }}
                  onSaveStore={async (store) => {
                    await api.saveStore(store);
                    await refreshData();
                  }}
                  onSaveUser={async (user) => {
                    await api.saveUser(user);
                    await refreshData();
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Camera & GPS Modal */}
      {showPhotoModal && activeAudit && selectedAuditItem && (
        <PhotoCaptureModal
          audit={activeAudit}
          item={selectedAuditItem}
          store={stores.find((s) => s.id === activeAudit.storeId)}
          onPhotoSaved={handlePhotoSaved}
          onClose={() => setShowPhotoModal(false)}
        />
      )}

      {/* Barcode Scanner Modal */}
      {showScannerModal && activeAudit && (
        <BarcodeScanModal
          items={activeAuditItems}
          onBarcodeMatched={(matchedItem) => {
            setSelectedAuditItem(matchedItem);
            setShowScannerModal(false);
          }}
          onClose={() => setShowScannerModal(false)}
        />
      )}

      {/* Audit Planner Modal */}
      {showPlannerModal && (
        <AuditPlannerModal
          stores={stores}
          users={allUsers}
          onClose={() => setShowPlannerModal(false)}
          onCreateAudit={handleCreateAudit}
        />
      )}

      {/* Offline Connectivity & Sync Banner */}
      <OfflineIndicator onSyncCompleted={refreshData} />
    </div>
  );
}
