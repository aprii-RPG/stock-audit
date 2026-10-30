import React from 'react';
import {
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  ArrowRight,
  Wifi,
  WifiOff,
  Lock,
  Layers,
} from 'lucide-react';
import type { Audit, AuditItem, User } from '../../types';

interface MyAuditsScreenProps {
  currentUser: User | null;
  audits: Audit[];
  auditItemsMap: Record<string, AuditItem[]>;
  unsyncedCount: number;
  onSelectAudit: (audit: Audit) => void;
}

export const MyAuditsScreen: React.FC<MyAuditsScreenProps> = ({
  currentUser,
  audits,
  auditItemsMap,
  unsyncedCount,
  onSelectAudit,
}) => {
  // Filter audits for auditor's assigned stores
  const visibleAudits = audits.filter((a) => {
    if (currentUser?.role === 'auditor') {
      return (
        currentUser.assignedStoreIds.includes(a.storeId) ||
        a.assignedAuditorIds.includes(currentUser.id)
      );
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
          My Assigned Audits
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
          Select an active audit cycle to start physical counting and photo verification.
        </p>
      </div>

      {visibleAudits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-blue-100 p-8 text-center shadow-xs">
          <Layers className="w-12 h-12 text-blue-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Audits Assigned</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            You do not currently have any active audits scheduled for your assigned branches. Contact your back-office supervisor.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleAudits.map((audit) => {
            const items = auditItemsMap[audit.id] || [];
            const totalItems = items.length;
            // Audited: count is saved AND photo is approved (or skipped)
            const auditedItems = items.filter(
              (i) => (i.physicalCount !== undefined && i.photoStatus === 'approved') || i.status === 'skipped'
            ).length;
            const progressPercent = totalItems > 0 ? Math.round((auditedItems / totalItems) * 100) : 0;
            const isCompleted = audit.status === 'completed';

            return (
              <div
                key={audit.id}
                onClick={() => onSelectAudit(audit)}
                className="bg-white rounded-2xl border border-blue-100/80 p-5 shadow-sm hover:shadow-md transition cursor-pointer hover:border-blue-300 active:scale-99"
              >
                {/* Top Row: Store, Type, Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-[#1D5FD1] border border-blue-200">
                      {audit.type}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      {audit.date}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {unsyncedCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                        <WifiOff className="w-3 h-3 text-amber-600" />
                        <span>{unsyncedCount} Unsynced</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Wifi className="w-3 h-3 text-emerald-600" />
                        <span>All Synced</span>
                      </span>
                    )}

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-[#0B3D91]'
                      }`}
                    >
                      {isCompleted ? 'Completed' : 'Active'}
                    </span>
                  </div>
                </div>

                {/* Audit Name (STORE / TYPE / DATE) */}
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mb-1 flex items-center gap-2">
                  <Building className="w-4 h-4 text-[#1D5FD1] shrink-0" />
                  <span>{audit.name}</span>
                </h3>

                {/* Snapshot Lock & Cutoff Bill Info */}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-4 bg-[#F7FAFF] px-3 py-1.5 rounded-lg border border-blue-50">
                  <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    Snapshot locked at <strong>{audit.snapshotLockedAt}</strong>, after bill{' '}
                    <strong className="text-slate-800">{audit.cutoffBillNo}</strong>
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700">Audit Completion Progress</span>
                    <span className="font-bold text-[#0B3D91]">
                      {auditedItems} of {totalItems} items ({progressPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-blue-100/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#1D5FD1] to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Action Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="text-xs text-slate-500 font-medium">
                    {items.filter((i) => i.status === 'not_started').length} items not started
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectAudit(audit);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1D5FD1] text-white text-xs sm:text-sm font-bold shadow-xs hover:bg-[#0B3D91] transition min-h-[44px]"
                  >
                    <span>{isCompleted ? 'View Results' : 'Open Product List'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
