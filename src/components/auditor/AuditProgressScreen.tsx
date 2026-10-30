import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Camera,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Send,
  FileText,
  Building,
  Lock,
} from 'lucide-react';
import type { Audit, AuditItem, User } from '../../types';
import { StatusChip } from '../common/StatusChip';

interface AuditProgressScreenProps {
  audit: Audit;
  items: AuditItem[];
  currentUser: User | null;
  onSelectItem: (item: AuditItem) => void;
  onSubmitAudit: () => Promise<void>;
  onSkipProduct?: (item: AuditItem, reason: string) => Promise<void>;
  onBackToProducts: () => void;
}

export const AuditProgressScreen: React.FC<AuditProgressScreenProps> = ({
  audit,
  items,
  currentUser,
  onSelectItem,
  onSubmitAudit,
  onSkipProduct,
  onBackToProducts,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [skipModalItem, setSkipModalItem] = useState<AuditItem | null>(null);
  const [skipReasonText, setSkipReasonText] = useState('Shelf temporarily inaccessible during store hours');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Business rule calculation:
  // "A product counts as audited only when the count is saved AND its photo is approved (or skipped)."
  const auditedItems = items.filter(
    (i) => (i.physicalCount !== undefined && i.photoStatus === 'approved') || i.status === 'skipped'
  );

  const photoReviewItems = items.filter(
    (i) => i.physicalCount !== undefined && i.photoStatus === 'pending'
  );

  const pendingItems = items.filter(
    (i) =>
      i.status === 'not_started' ||
      (i.physicalCount === undefined && i.status !== 'skipped') ||
      i.status === 'recount'
  );

  const isAuditComplete = pendingItems.length === 0 && photoReviewItems.length === 0;

  const handleSubmit = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSubmitAudit();
      setSubmitSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skipModalItem || !onSkipProduct) return;
    await onSkipProduct(skipModalItem, skipReasonText);
    setSkipModalItem(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#1D5FD1] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            Reconciliation & Submission
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight mt-1">
            {audit.name}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Snapshot locked at {audit.snapshotLockedAt} • Cutoff Bill {audit.cutoffBillNo}
          </p>
        </div>

        <button
          onClick={onBackToProducts}
          className="px-3.5 py-2 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 text-slate-700 text-xs font-bold transition min-h-[44px]"
        >
          Back to Product List
        </button>
      </div>

      {/* KPI Cards: Audited, Pending, Photo Review */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Audited Card */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Audited Products
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-600">
            {auditedItems.length}
            <span className="text-sm font-semibold text-slate-400 ml-1">/ {items.length}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Count saved + photo approved
          </p>
        </div>

        {/* Pending Products Card */}
        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Pending Products
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-600">{pendingItems.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Awaiting physical count or recount
          </p>
        </div>

        {/* Photo Review Card */}
        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Photo Review
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1D5FD1] flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-[#1D5FD1]">{photoReviewItems.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Awaiting Back Office photo verification
          </p>
        </div>
      </div>

      {/* Progress Bar & Rule notice */}
      <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-xs space-y-3">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-slate-700">Audit Completion Criteria</span>
          <span className="font-extrabold text-[#0B3D91]">
            {Math.round((auditedItems.length / (items.length || 1)) * 100)}% Complete
          </span>
        </div>

        <div className="w-full h-3 bg-blue-100/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#1D5FD1] to-emerald-500 rounded-full transition-all duration-500"
            style={{
              width: `${(auditedItems.length / (items.length || 1)) * 100}%`,
            }}
          />
        </div>

        <div className="text-xs text-slate-600 bg-blue-50/60 p-3 rounded-xl border border-blue-100 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-[#1D5FD1] shrink-0 mt-0.5" />
          <p>
            <strong>Strict Business Rule:</strong> A product counts as audited only when the count is saved{' '}
            <strong>AND</strong> its photo is approved. An audit cannot be submitted while any product is pending unless Back Office authorizes an approved skip reason.
          </p>
        </div>
      </div>

      {/* List of Pending Products */}
      <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Pending Products ({pendingItems.length})
          </h3>
          {pendingItems.length === 0 && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>All products counted!</span>
            </span>
          )}
        </div>

        {pendingItems.length === 0 ? (
          <div className="p-6 text-center text-emerald-700 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-1 text-emerald-600" />
            <p className="text-sm font-bold">Zero Pending Products</p>
            <p className="text-xs text-emerald-600/80">
              All medicines have recorded counts and are ready for closure.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/80 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {item.product.name}
                    </h4>
                    <span className="text-[11px] text-slate-500">({item.product.pack})</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>{item.product.company}</span>
                    <span>•</span>
                    <span>Bin: {item.bin || 'No bin'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Skip Reason trigger for Back Office / Admin */}
                  {currentUser?.role !== 'auditor' && (
                    <button
                      type="button"
                      onClick={() => setSkipModalItem(item)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 min-h-[36px]"
                    >
                      Authorize Skip
                    </button>
                  )}

                  <button
                    onClick={() => onSelectItem(item)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#1D5FD1] hover:bg-[#0B3D91] text-white text-xs font-bold transition flex items-center gap-1 min-h-[40px]"
                  >
                    <span>Count</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submission Errors */}
      {submitError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Final Submit Audit Button (Disabled until no product is pending) */}
      <div className="pt-2 pb-8">
        <button
          type="button"
          disabled={!isAuditComplete || isSubmitting || audit.status === 'completed'}
          onClick={handleSubmit}
          className={`w-full py-4 px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 transition min-h-[52px] ${
            isAuditComplete && audit.status !== 'completed'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/25 active:scale-98 cursor-pointer'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
          }`}
        >
          {audit.status === 'completed' ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span>Audit Completed & Closed</span>
            </>
          ) : isSubmitting ? (
            <span>Finalizing & Generating ERP Vouchers...</span>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Submit Audit ({isAuditComplete ? 'Ready' : `${pendingItems.length} Products Pending`})</span>
            </>
          )}
        </button>

        {!isAuditComplete && audit.status !== 'completed' && (
          <p className="text-center text-xs text-slate-400 mt-2 font-medium">
            Submit button activates when all products are counted and photos approved.
          </p>
        )}
      </div>

      {/* Skip reason authorization modal */}
      {skipModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-blue-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Authorize Product Skip Reason
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Product: <strong>{skipModalItem.product.name}</strong>
            </p>

            <form onSubmit={handleSkipSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Approved Reason Code
                </label>
                <select
                  value={skipReasonText}
                  onChange={(e) => setSkipReasonText(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-blue-200 bg-slate-50 focus:bg-white min-h-[44px]"
                >
                  <option value="Shelf temporarily inaccessible during store hours">
                    Shelf temporarily inaccessible during store hours
                  </option>
                  <option value="Stock sent for external lab batch testing">
                    Stock sent for external lab batch testing
                  </option>
                  <option value="Cold chain chamber locked for scheduled defrost cycle">
                    Cold chain chamber locked for scheduled defrost cycle
                  </option>
                  <option value="Narcotic safe key with designated branch manager off-duty">
                    Narcotic safe key with designated branch manager off-duty
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSkipModalItem(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-purple-700 text-white font-bold text-xs hover:bg-purple-800 shadow-xs min-h-[44px]"
                >
                  Authorize Skip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
