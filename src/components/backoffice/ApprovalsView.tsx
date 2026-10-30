import React, { useState } from 'react';
import {
  CheckSquare,
  ShieldAlert,
  RotateCcw,
  CheckCircle2,
  Building,
  UserCheck,
  AlertTriangle,
  ArrowRight,
  Filter,
} from 'lucide-react';
import type { Audit, AuditItem, Store, SystemSettings, User } from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';
import { DifferenceBadge } from '../common/DifferenceBadge';
import { StatusChip } from '../common/StatusChip';

interface ApprovalsViewProps {
  audits: Audit[];
  items: AuditItem[];
  stores: Store[];
  settings: SystemSettings;
  currentUser: User | null;
  onApproveItem: (auditId: string, productId: string) => Promise<void>;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  audits,
  items,
  stores,
  settings,
  currentUser,
  onApproveItem,
}) => {
  const [filterTier, setFilterTier] = useState<'all' | 'store_manager' | 'head_office' | 'recounts'>('all');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Filter items awaiting approval or in recount
  const awaitingItems = items.filter(
    (i) => i.status === 'awaiting_approval' || i.status === 'recount'
  );

  const enrichedItems = awaitingItems.map((item) => {
    const audit = audits.find((a) => a.id === item.auditId);
    const store = stores.find((s) => s.id === audit?.storeId);
    const disc = calculateAuditDiscrepancy(item);
    const isHORequired = disc.differenceValue > settings.storeManagerApprovalThreshold;

    return {
      item,
      audit,
      store,
      disc,
      tier: isHORequired ? 'head_office' : 'store_manager',
    };
  });

  const filtered = enrichedItems.filter((entry) => {
    if (filterTier === 'store_manager') return entry.tier === 'store_manager' && entry.item.status !== 'recount';
    if (filterTier === 'head_office') return entry.tier === 'head_office' && entry.item.status !== 'recount';
    if (filterTier === 'recounts') return entry.item.status === 'recount';
    return true;
  });

  const handleApprove = async (auditId: string, productId: string, name: string) => {
    await onApproveItem(auditId, productId);
    setActionNotice(`Discrepancy for ${name} successfully approved!`);
    setTimeout(() => setActionNotice(null), 3000);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
          Approval Queue & Value Tiers
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 font-medium">
          Multi-level authorization based on financial impact thresholds and recount results.
        </p>
      </div>

      {/* Threshold Rule Info Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Auto-Tolerance Engine
          </span>
          <p className="font-bold text-[#1D5FD1] mt-0.5">
            Within ±{settings.autoApproveToleranceUnits} Unit &amp; ±${settings.autoApproveToleranceValue}
          </p>
          <p className="text-slate-500 text-[11px] mt-0.5">Auto-approved without manual intervention</p>
        </div>

        <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-2xs bg-amber-50/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
            Tier 1: Store Manager
          </span>
          <p className="font-bold text-amber-900 mt-0.5">
            Variances up to ${settings.storeManagerApprovalThreshold}
          </p>
          <p className="text-slate-500 text-[11px] mt-0.5">Approved by Branch In-charge</p>
        </div>

        <div className="p-3 bg-white rounded-xl border border-rose-200 shadow-2xs bg-rose-50/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
            Tier 2: Head Office (HO)
          </span>
          <p className="font-bold text-rose-900 mt-0.5">
            Variances over ${settings.storeManagerApprovalThreshold}
          </p>
          <p className="text-slate-500 text-[11px] mt-0.5">Escalated to Marcus Vance (HO Lead)</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterTier('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[40px] ${
            filterTier === 'all'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Items ({enrichedItems.length})
        </button>

        <button
          onClick={() => setFilterTier('store_manager')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[40px] ${
            filterTier === 'store_manager'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          Branch Manager Tier (≤${settings.storeManagerApprovalThreshold})
        </button>

        <button
          onClick={() => setFilterTier('head_office')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[40px] ${
            filterTier === 'head_office'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
          }`}
        >
          HO Escalation (&gt;${settings.storeManagerApprovalThreshold})
        </button>

        <button
          onClick={() => setFilterTier('recounts')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[40px] ${
            filterTier === 'recounts'
              ? 'bg-amber-800 text-white shadow-xs'
              : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-50'
          }`}
        >
          Active Recounts ({enrichedItems.filter((e) => e.item.status === 'recount').length})
        </button>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Items List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-blue-100 p-12 text-center shadow-xs">
          <CheckSquare className="w-12 h-12 text-emerald-300 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-800">No Approvals Pending</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            All discrepancy items in this category have been processed or are within normal tolerances.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
                <tr>
                  <th className="py-3 px-4">Medicine &amp; Store</th>
                  <th className="py-3 px-4 text-center">Required Tier</th>
                  <th className="py-3 px-4 text-center">Difference</th>
                  <th className="py-3 px-4 text-right">Discrepancy Value</th>
                  <th className="py-3 px-4">Status &amp; Notes</th>
                  <th className="py-3 px-4 text-right">Authorize</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filtered.map(({ item, audit, store, disc, tier }) => (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition">
                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-bold text-slate-900">{item.product.name}</p>
                        <p className="text-xs text-slate-500">
                          {store?.name || 'Branch'} • Bin: {item.bin || 'None'}
                        </p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                          tier === 'head_office'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {tier === 'head_office' ? 'HO Escalation' : 'Store Manager'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <DifferenceBadge difference={disc.difference} size="sm" />
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      ${disc.differenceValue.toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <StatusChip status={item.status} size="sm" />
                        {item.status === 'recount' && (
                          <p className="text-[10px] text-amber-800 font-semibold">
                            Assigned to: {item.recountAssignedToName || 'Auditor'}
                          </p>
                        )}
                        {item.differenceReason && (
                          <p className="text-[10px] text-slate-500 capitalize">
                            Reason: {item.differenceReason.replace(/_/g, ' ')}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleApprove(item.auditId, item.productId, item.product.name)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-2xs min-h-[38px]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Authorize</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
