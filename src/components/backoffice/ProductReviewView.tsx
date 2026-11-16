import React, { useEffect, useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  RotateCcw,
  Camera,
  Clock,
  Lock,
  Receipt,
  FileCheck2,
  X,
  AlertTriangle,
  Trash2,
  UserCheck,
  ChevronRight,
  HelpCircle,
  Plus,
  Pencil,
} from 'lucide-react';
import type {
  Audit,
  AuditItem,
  CutoffBillItem,
  DifferenceReason,
  Store,
  User,
} from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';
import { formatINR } from '../../utils/currency';
import { DifferenceBadge } from '../common/DifferenceBadge';
import { StatusChip } from '../common/StatusChip';

interface ProductReviewViewProps {
  audits: Audit[];
  selectedAuditId: string;
  onSelectAuditId: (id: string) => void;
  items: AuditItem[];
  stores: Store[];
  users: User[];
  canEditPhysicalQuantity: boolean;
  canDeleteAudit: boolean;
  cutoffBillsMap: Record<string, CutoffBillItem[]>;
  onApproveProduct: (
    itemId: string,
    reason: DifferenceReason,
    note?: string,
    zeroStockApproval?: boolean
  ) => Promise<AuditItem>;
  onUpdatePhysicalQuantity: (itemId: string, physicalCount: number) => Promise<AuditItem>;
  onSendToRecount: (
    auditId: string,
    productId: string,
    recountAssigneeId: string,
    note?: string
  ) => Promise<void>;
  onDeleteAudit: (auditId: string) => Promise<void>;
  onOpenAuditPlanner: (audit?: Audit) => void;
}

export const ProductReviewView: React.FC<ProductReviewViewProps> = ({
  audits,
  selectedAuditId,
  onSelectAuditId,
  items,
  stores,
  users,
  canEditPhysicalQuantity,
  canDeleteAudit,
  cutoffBillsMap,
  onApproveProduct,
  onUpdatePhysicalQuantity,
  onSendToRecount,
  onDeleteAudit,
  onOpenAuditPlanner,
}) => {
  const [selectedItem, setSelectedItem] = useState<AuditItem | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [varianceFilter, setVarianceFilter] = useState<'ALL' | 'DISCREPANCY' | 'MATCH'>('ALL');
  const [physicalQuantityFilterEnabled, setPhysicalQuantityFilterEnabled] = useState(false);
  const [exactPhysicalQuantity, setExactPhysicalQuantity] = useState('');
  const [submittedFromDate, setSubmittedFromDate] = useState('');
  const [submittedToDate, setSubmittedToDate] = useState('');

  // Side panel form states
  const [selectedReason, setSelectedReason] = useState<DifferenceReason>('none');
  const [reasonNote, setReasonNote] = useState('');
  const [recountAssigneeId, setRecountAssigneeId] = useState('');
  const [recountNote, setRecountNote] = useState('');
  const [showRecountForm, setShowRecountForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [physicalQuantityInput, setPhysicalQuantityInput] = useState('');
  const [isSavingPhysicalQuantity, setIsSavingPhysicalQuantity] = useState(false);
  const [isDeletingAudit, setIsDeletingAudit] = useState(false);
  const [deleteAuditError, setDeleteAuditError] = useState<string | null>(null);

  const activeAudit = audits.find((a) => a.id === selectedAuditId) || audits[0];

  useEffect(() => {
    setSelectedItem(null);
    setShowRecountForm(false);
    setActionError(null);
    setActionSuccess(null);
  }, [activeAudit?.id]);

  useEffect(() => {
    setSelectedItem((current) =>
      current ? items.find((item) => item.id === current.id) || current : current
    );
  }, [items]);

  // Sync item selection
  const handleSelectRow = (item: AuditItem) => {
    setSelectedItem(item);
    setPhysicalQuantityInput(item.physicalCount === undefined ? '' : String(item.physicalCount));
    setSelectedReason(item.differenceReason || 'none');
    setReasonNote(item.differenceReasonNote || '');
    setShowRecountForm(false);
    setActionError(null);
    setActionSuccess(null);

    // Pick default recount assignee different from original counter
    const differentUser = users.find(
      (u) => u.id !== item.countedByUserId && (u.role === 'auditor' || u.role === 'back office')
    );
    setRecountAssigneeId(differentUser?.id || users[1]?.id || '');
    setRecountNote('');
  };

  const handleUpdatePhysicalQuantity = async () => {
    if (!selectedItem) return;
    if (physicalQuantityInput.trim() === '') {
      setActionError('Enter a physical quantity.');
      return;
    }
    const physicalCount = Number(physicalQuantityInput);
    if (!Number.isFinite(physicalCount) || physicalCount < 0 || physicalCount > 1000000) {
      setActionError('Enter a valid physical quantity between 0 and 1,000,000.');
      return;
    }

    setIsSavingPhysicalQuantity(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updatedItem = await onUpdatePhysicalQuantity(selectedItem.id, physicalCount);
      setSelectedItem(updatedItem);
      setPhysicalQuantityInput(String(updatedItem.physicalCount ?? ''));
      setActionSuccess('Physical quantity updated. The item is now awaiting approval.');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingPhysicalQuantity(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedItem) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const approvedItem = await onApproveProduct(
        selectedItem.id,
        selectedReason,
        reasonNote
      );
      setSelectedItem(approvedItem);
      setActionSuccess('Product discrepancy verified and approved. ERP adjustment updated.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveZeroStock = async () => {
    if (!selectedItem || selectedItem.physicalCount !== 0) return;
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const approvedItem = await onApproveProduct(
        selectedItem.id,
        selectedReason,
        reasonNote,
        true
      );
      setSelectedItem(approvedItem);
      setActionSuccess('Zero-stock product approved.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecount = async () => {
    if (!selectedItem) return;
    if (!recountAssigneeId) {
      setActionError('Please select a recount assignee.');
      return;
    }

    // Business rule check: Recount must be by a different person!
    if (selectedItem.countedByUserId && selectedItem.countedByUserId === recountAssigneeId) {
      setActionError('Business Rule Violation: Recount must be assigned to a DIFFERENT person than original counter.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      await onSendToRecount(selectedItem.auditId, selectedItem.productId, recountAssigneeId, recountNote);
      setActionSuccess('Recount order successfully dispatched to auditor.');
      setShowRecountForm(false);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAudit = async () => {
    if (!activeAudit || isDeletingAudit) return;
    const confirmed = window.confirm(
      `Delete "${activeAudit.name}" permanently? Its product records, assignments, and photos will also be deleted. This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeletingAudit(true);
    setDeleteAuditError(null);
    try {
      await onDeleteAudit(activeAudit.id);
      setSelectedItem(null);
    } catch (error: unknown) {
      setDeleteAuditError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeletingAudit(false);
    }
  };

  // Filter items
  const auditItems = items.filter((i) => i.auditId === activeAudit?.id);
  const doneItemCount = auditItems.filter(
    (item) => item.status === 'skipped' || (item.physicalCount !== undefined && item.status !== 'recount')
  ).length;
  const pendingItemCount = auditItems.length - doneItemCount;
  const filteredItems = auditItems.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.product.name.toLowerCase().includes(q) ||
      item.product.company.toLowerCase().includes(q) ||
      (item.bin && item.bin.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }

    if (varianceFilter !== 'ALL') {
      const disc = calculateAuditDiscrepancy(item);
      if (varianceFilter === 'DISCREPANCY' && disc.difference === 0) return false;
      if (varianceFilter === 'MATCH' && disc.difference !== 0) return false;
    }

    if (physicalQuantityFilterEnabled && exactPhysicalQuantity.trim() !== '') {
      const quantity = Number(exactPhysicalQuantity);
      if (!Number.isFinite(quantity) || item.physicalCount !== quantity) return false;
    }

    if (submittedFromDate || submittedToDate) {
      if (!item.countSavedAt) return false;
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(item.countSavedAt));
      const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
      const submittedDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
      if (submittedFromDate && submittedDate < submittedFromDate) return false;
      if (submittedToDate && submittedDate > submittedToDate) return false;
    }

    return true;
  });

  const selectedItemBills: CutoffBillItem[] =
    selectedItem
      ? cutoffBillsMap[`${selectedItem.auditId}_${selectedItem.productId}`] || []
      : [];

  const selectedItemDisc = selectedItem ? calculateAuditDiscrepancy(selectedItem) : null;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Top Header & Audit Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-blue-100 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Select Audit Cycle
            </label>
            <select
              value={activeAudit?.id}
              onChange={(e) => onSelectAuditId(e.target.value)}
              className="text-sm font-bold text-[#0B3D91] bg-blue-50/70 border border-blue-200 rounded-xl px-3 py-2 min-h-[44px] cursor-pointer"
            >
              {audits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.status})
                </option>
              ))}
            </select>
          </div>

          {activeAudit && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              <span>
                Snapshot: <strong>{activeAudit.snapshotLockedAt}</strong> | Cutoff:{' '}
                <strong>{activeAudit.cutoffBillNo}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canDeleteAudit && activeAudit && activeAudit.status === 'in_progress' && (
            <button
              type="button"
              onClick={() => onOpenAuditPlanner(activeAudit)}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#0B3D91] text-xs sm:text-sm font-bold transition min-h-[44px]"
            >
              <Pencil className="w-4 h-4" />
              <span>Update Planner</span>
            </button>
          )}
          {canDeleteAudit && activeAudit && (
            <button
              type="button"
              onClick={handleDeleteAudit}
              disabled={isDeletingAudit}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-bold transition min-h-[44px] disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeletingAudit ? 'Deleting...' : 'Delete Audit'}</span>
            </button>
          )}
          <button
            onClick={() => onOpenAuditPlanner()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1D5FD1] hover:bg-[#0B3D91] text-white text-xs sm:text-sm font-bold transition shadow-xs min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>New Audit Planner</span>
          </button>
        </div>
      </div>
      {deleteAuditError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {deleteAuditError}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2.5 bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products in this audit..."
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden min-h-[40px]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 min-h-[40px]"
        >
          <option value="ALL">All Statuses</option>
          <option value="awaiting_approval">Awaiting Approval</option>
          <option value="recount">Recount</option>
          <option value="approved">Approved</option>
          <option value="not_started">Not Started</option>
        </select>

        <select
          value={varianceFilter}
          onChange={(e) => setVarianceFilter(e.target.value as 'ALL' | 'DISCREPANCY' | 'MATCH')}
          className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 min-h-[40px]"
        >
          <option value="ALL">All Differences</option>
          <option value="DISCREPANCY">Discrepancies Only (▲ / ▼)</option>
          <option value="MATCH">Zero Variance (Exact Match)</option>
        </select>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            Submitted
            <input
              type="date"
              aria-label="Submitted from date"
              value={submittedFromDate}
              max={submittedToDate || undefined}
              onChange={(event) => setSubmittedFromDate(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            />
          </label>
          <span className="text-xs text-slate-400">to</span>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <input
              type="date"
              aria-label="Submitted to date"
              value={submittedToDate}
              min={submittedFromDate || undefined}
              onChange={(event) => setSubmittedToDate(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            />
          </label>
          {(submittedFromDate || submittedToDate) && (
            <button
              type="button"
              onClick={() => {
                setSubmittedFromDate('');
                setSubmittedToDate('');
              }}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {activeAudit && (
        <section
          aria-label="Audit product progress"
          className="grid grid-cols-3 gap-3 rounded-xl border border-blue-100 bg-white p-3 shadow-2xs"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Products</p>
            <p className="text-lg font-black text-[#0B3D91]">{auditItems.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Done</p>
            <p className="text-lg font-black text-emerald-700">{doneItemCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending</p>
            <p className="text-lg font-black text-amber-700">{pendingItemCount}</p>
          </div>
          <p className="col-span-3 text-[11px] text-slate-500">
            Done includes submitted counts awaiting approval; recount requests remain pending.
          </p>
        </section>
      )}

      {/* Main Table + Drilldown Side Panel */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Table Column */}
        <div className="flex-1 w-full bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
                <tr>
                  <th className="py-3 px-3">Product</th>
                  <th className="py-3 px-3">Auditor</th>
                  <th className="py-3 px-3">Bin</th>
                  <th className="py-3 px-3 text-right">Snapshot Qty</th>
                  <th className="py-3 px-3 text-right">Sales Post-Cutoff</th>
                  <th className="py-3 px-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={physicalQuantityFilterEnabled}
                          onChange={(event) => {
                            setPhysicalQuantityFilterEnabled(event.target.checked);
                            if (!event.target.checked) setExactPhysicalQuantity('');
                          }}
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Enable physical quantity filter"
                          className="rounded border-slate-300 text-[#1D5FD1] focus:ring-[#1D5FD1]"
                        />
                        <span>Physical</span>
                      </label>
                      {physicalQuantityFilterEnabled && (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={exactPhysicalQuantity}
                          onChange={(event) => setExactPhysicalQuantity(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Filter by exact physical quantity"
                          placeholder="Enter qty"
                          className="w-24 rounded-md border border-blue-200 bg-white px-2 py-1 text-right text-[11px] font-normal normal-case tracking-normal"
                        />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-3 text-center">Submitted At</th>
                  <th className="py-3 px-3 text-center">Final Difference</th>
                  <th className="py-3 px-3 text-right">Value (INR)</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredItems.map((item) => {
                  const disc = calculateAuditDiscrepancy(item);
                  const isSelected = selectedItem?.id === item.id;
                  const hasPhysical = item.physicalCount !== undefined;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleSelectRow(item)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-50/90 font-bold border-l-4 border-l-[#1D5FD1]'
                          : 'hover:bg-blue-50/30'
                      }`}
                    >
                      {/* Product */}
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-bold text-slate-900 leading-snug">
                            {item.product.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {item.product.pack} • {item.product.company}
                          </p>
                        </div>
                      </td>

                      {/* Assigned count submitter */}
                      <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                        {item.countedByUserName || 'Not submitted'}
                      </td>

                      {/* Bin */}
                      <td className="py-3 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${
                            item.bin
                              ? 'bg-blue-50 text-[#0B3D91] border border-blue-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.bin || 'No bin'}
                        </span>
                      </td>

                      {/* Snapshot Qty */}
                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        {item.snapshotQty}
                      </td>

                      {/* Sales after cutoff bill */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {item.salesAfterCutoff > 0 ? (
                          <span className="text-amber-700 font-bold">
                            -{item.salesAfterCutoff}
                            {item.returnsAfterCutoff > 0 && ` (+${item.returnsAfterCutoff} ret)`}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* Physical count */}
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {hasPhysical ? (
                          <span className="text-[#0B3D91] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {item.physicalCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not counted</span>
                        )}
                      </td>

                      {/* Count submission timestamp */}
                      <td className="py-3 px-3 text-center text-[11px] font-mono text-slate-600 whitespace-nowrap">
                        {item.countSavedAt
                          ? new Date(item.countSavedAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                              timeZone: 'Asia/Kolkata',
                            })
                          : '—'}
                      </td>

                      {/* Final Difference: blue ▲ Excess / red ▼ Short */}
                      <td className="py-3 px-3 text-center">
                        {hasPhysical ? (
                          <DifferenceBadge difference={disc.difference} size="sm" />
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Value */}
                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        {hasPhysical ? (
                          disc.difference === 0 ? (
                            <span className="text-slate-400">{formatINR(0)}</span>
                          ) : disc.direction === 'excess' ? (
                            <span className="text-[#1D5FD1]">+{formatINR(disc.differenceValue)}</span>
                          ) : (
                            <span className="text-rose-600">-{formatINR(disc.differenceValue)}</span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSelectRow(item);
                          }}
                          aria-label={`Review ${item.product.name}, status ${item.status}`}
                        >
                          <StatusChip status={item.status} size="sm" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Panel: opens when row is selected */}
        {selectedItem && (
          <div className="w-full lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-96 lg:self-start lg:overflow-y-auto bg-white rounded-2xl border border-blue-100 shadow-xl p-5 space-y-4 shrink-0 animate-in fade-in slide-in-from-right-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1D5FD1] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Reconciliation Panel
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  {selectedItem.product.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Pack: {selectedItem.product.pack} • Batch: {selectedItem.product.currentBatch}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Count Photo Preview & GPS metadata */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Auditor Photo
              </label>
              {selectedItem.photoUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-blue-200 bg-slate-900 text-white">
                  <button
                    type="button"
                    onClick={() => setPhotoPreviewUrl(selectedItem.photoUrl ?? null)}
                    aria-label="Open shelf photo"
                    className="block w-full cursor-zoom-in"
                  >
                    <img
                      src={selectedItem.photoUrl}
                      alt="Shelf verification"
                      className="w-full h-44 object-cover"
                    />
                  </button>
                  <div className="pointer-events-none absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] space-y-0.5">
                    <p className="font-bold flex items-center gap-1">
                      <Camera className="w-3 h-3 text-blue-300" />
                      <span>By {selectedItem.countedByUserName || '—'}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                  <Camera className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <span>No photo captured yet for this item</span>
                </div>
              )}
            </div>

            {/* Snapshot Time & Cutoff Bill Info */}
            <div className="bg-[#F7FAFF] p-3 rounded-xl border border-blue-100 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold">Snapshot Locked:</span>
                <span className="font-mono">{activeAudit?.snapshotLockedAt}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold">Cutoff Bill:</span>
                <span className="font-mono font-bold text-[#0B3D91]">
                  {activeAudit?.cutoffBillNo}
                </span>
              </div>
            </div>

            {canEditPhysicalQuantity && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <label
                  htmlFor="edit-physical-quantity"
                  className="block text-xs font-bold uppercase tracking-wider text-amber-900"
                >
                  Edit Physical Quantity
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="edit-physical-quantity"
                    type="number"
                    min="0"
                    max="1000000"
                    step="any"
                    value={physicalQuantityInput}
                    onChange={(event) => setPhysicalQuantityInput(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleUpdatePhysicalQuantity}
                    disabled={
                      isSavingPhysicalQuantity ||
                      physicalQuantityInput.trim() === '' ||
                      Number(physicalQuantityInput) === selectedItem.physicalCount
                    }
                    className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingPhysicalQuantity ? 'Saving...' : 'Save Qty'}
                  </button>
                </div>
                <p className="text-[11px] text-amber-800">
                  Saving a changed quantity resets the item to Awaiting Approval.
                </p>
              </div>
            )}

            {/* Reconciliation Math Formula Box */}
            {selectedItemDisc && (
              <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 text-xs space-y-2">
                <p className="font-bold text-[#0B3D91] uppercase tracking-wider text-[11px] flex items-center gap-1">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Formula Breakdown</span>
                </p>
                <p className="text-[11px] font-mono text-slate-700">
                  Final Diff = Physical - (Snapshot - Sales + Returns)
                </p>
                <div className="p-2 bg-white rounded-lg border border-blue-100 font-mono text-xs text-slate-800">
                  <span>{selectedItem.physicalCount ?? '—'}</span>
                  <span className="text-slate-400"> - (</span>
                  <span>{selectedItem.snapshotQty}</span>
                  <span className="text-amber-600"> - {selectedItem.salesAfterCutoff}</span>
                  {selectedItem.returnsAfterCutoff > 0 && (
                    <span className="text-emerald-600"> + {selectedItem.returnsAfterCutoff}</span>
                  )}
                  <span className="text-slate-400">) = </span>
                  <strong
                    className={
                      selectedItemDisc.direction === 'short'
                        ? 'text-rose-600'
                        : selectedItemDisc.direction === 'excess'
                        ? 'text-[#1D5FD1]'
                        : 'text-emerald-700'
                    }
                  >
                    {selectedItemDisc.difference > 0
                      ? `+${selectedItemDisc.difference}`
                      : selectedItemDisc.difference}
                  </strong>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold text-slate-600">Variance:</span>
                  <DifferenceBadge difference={selectedItemDisc.difference} size="md" />
                </div>
              </div>
            )}

            {/* List of bills after cutoff */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-blue-600" />
                <span>Bills After Cutoff ({selectedItemBills.length})</span>
              </label>

              {selectedItemBills.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No movements recorded after cutoff.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedItemBills.map((b, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-800">{b.billNo}</span>
                        <span className="text-slate-400 text-[11px] ml-1.5">({b.time})</span>
                        <p className="text-[10px] text-slate-500">{b.customerOrPatient}</p>
                      </div>
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          b.type === 'sale'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {b.type === 'sale' ? `-${b.qty} sale` : `+${b.qty} return`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reason Dropdown Required by Prompt:
                (expired, damaged, theft/loss, wrong billing, purchase not entered, return not entered, wrong batch) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Reason Code
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value as DifferenceReason)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-blue-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#1D5FD1] min-h-[44px]"
              >
                <option value="none">No reason / Balanced</option>
                <option value="expired">Expired Product</option>
                <option value="damaged">Damaged / Broken Foil</option>
                <option value="theft_loss">Theft / Unaccounted Loss</option>
                <option value="wrong_billing">Wrong Billing / Mismatch</option>
                <option value="purchase_not_entered">Purchase Not Entered (GRN Pending)</option>
                <option value="return_not_entered">Return Not Entered (Unposted Credit)</option>
                <option value="wrong_batch">Wrong Batch Selected</option>
              </select>
            </div>

            <div>
              <input
                type="text"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Optional investigation comment..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white min-h-[40px]"
              />
            </div>

            {/* Feedback & Errors */}
            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {/* Recount Form Drawer */}
            {showRecountForm ? (
              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-900">
                    Dispatch Recount (Different Auditor Required)
                  </p>
                  <button
                    onClick={() => setShowRecountForm(false)}
                    className="text-amber-700 hover:text-amber-900 text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                    Assign Recount To:
                  </label>
                  <select
                    value={recountAssigneeId}
                    onChange={(e) => setRecountAssigneeId(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-amber-300 bg-white min-h-[40px]"
                  >
                    {users
                      .filter((u) => u.id !== selectedItem.countedByUserId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-amber-700 mt-1">
                    Original counter: <strong>{selectedItem.countedByUserName || '—'}</strong>{' '}
                    (excluded per business rule)
                  </p>
                </div>

                <div>
                  <input
                    type="text"
                    value={recountNote}
                    onChange={(e) => setRecountNote(e.target.value)}
                    placeholder="Recount instruction note (e.g. check secondary shelf)"
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-amber-300 bg-white min-h-[40px]"
                  />
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRecount}
                  className="w-full py-2.5 px-3 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-xs min-h-[44px]"
                >
                  {isSubmitting ? 'Dispatching...' : 'Confirm Recount Dispatch'}
                </button>
              </div>
            ) : (
              /* Buttons: Approve and Send to recount */
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecountForm(true)}
                  className="flex-1 py-3 px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs transition flex items-center justify-center gap-1.5 min-h-[46px]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Send to Recount</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || selectedItem.status === 'approved'}
                  onClick={handleApprove}
                  className="flex-1 py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-700/20 min-h-[46px]"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {isSubmitting
                      ? 'Approving...'
                      : selectedItem.status === 'approved'
                      ? 'Approved'
                      : 'Approve'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={
                    isSubmitting ||
                    selectedItem.status === 'approved' ||
                    selectedItem.physicalCount !== 0
                  }
                  onClick={handleApproveZeroStock}
                  title={
                    selectedItem.physicalCount !== 0
                      ? 'Save a physical count of 0 before approving zero stock.'
                      : 'Approve this product with zero physical stock.'
                  }
                  className="flex-1 min-w-[150px] py-3 px-3 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-700/20 min-h-[46px]"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>{isSubmitting ? 'Approving...' : 'Approve Zero Stock'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {photoPreviewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Shelf photo preview"
          onClick={() => setPhotoPreviewUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPhotoPreviewUrl(null)}
            aria-label="Close photo preview"
            className="absolute right-4 top-4 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={photoPreviewUrl}
            alt="Full-size shelf verification"
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
