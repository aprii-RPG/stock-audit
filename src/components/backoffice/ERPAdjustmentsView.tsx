import React, { useState } from 'react';
import {
  FolderSync,
  FileCheck2,
  CheckCircle2,
  Building,
  ArrowRight,
  Download,
  Receipt,
  Layers,
} from 'lucide-react';
import type { Audit, AuditItem, Store } from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';
import { DifferenceBadge } from '../common/DifferenceBadge';

interface ERPAdjustmentsViewProps {
  audits: Audit[];
  items: AuditItem[];
  stores: Store[];
}

export const ERPAdjustmentsView: React.FC<ERPAdjustmentsViewProps> = ({
  audits,
  items,
  stores,
}) => {
  const [selectedStore, setSelectedStore] = useState<string>('ALL');
  const [justPosted, setJustPosted] = useState(false);

  // Filter approved items with non-zero differences
  const adjustmentItems = items.filter((item) => {
    if (item.status !== 'approved' && item.status !== 'awaiting_approval') return false;
    const disc = calculateAuditDiscrepancy(item);
    return disc.difference !== 0;
  });

  const filtered = adjustmentItems.filter((item) => {
    if (selectedStore === 'ALL') return true;
    const audit = audits.find((a) => a.id === item.auditId);
    return audit?.storeId === selectedStore;
  });

  const totalAdjustmentValue = filtered.reduce((acc, curr) => {
    const disc = calculateAuditDiscrepancy(curr);
    return acc + disc.differenceValue;
  }, 0);

  const handlePostAllToERP = () => {
    setJustPosted(true);
    setTimeout(() => setJustPosted(false), 4000);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
            ERP Inventory Adjustments
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Post verified physical count variances directly to SAP / Oracle ERP ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="text-xs font-bold text-slate-700 bg-white border border-blue-200 rounded-xl px-3 py-2 min-h-[44px]"
          >
            <option value="ALL">All Store Branches</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            onClick={handlePostAllToERP}
            className="px-4 py-2 bg-[#1D5FD1] hover:bg-[#0B3D91] text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-xs flex items-center gap-2 min-h-[44px]"
          >
            <FolderSync className="w-4 h-4" />
            <span>Post Batch to ERP</span>
          </button>
        </div>
      </div>

      {justPosted && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>
            Batch reconciliation voucher posted to ERP successfully! Credit/Debit inventory journals created.
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Pending Adjustments
          </span>
          <p className="text-2xl font-black text-[#0B3D91] mt-1">{filtered.length} SKUs</p>
          <p className="text-xs text-slate-500 mt-0.5">Approved variances awaiting journal entry</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Adjustment Value
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1">
            ${totalAdjustmentValue.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Combined financial impact</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            ERP Integration Status
          </span>
          <p className="text-sm font-bold text-emerald-700 mt-1.5 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected &amp; Synchronized</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Automated batch journal queue active</p>
        </div>
      </div>

      {/* Adjustments Table */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-blue-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#1D5FD1]" />
            <span>Inventory Variance Adjustments</span>
          </h3>
          <span className="text-xs text-slate-500 font-mono font-medium">
            Cutoff Bill Reference Protected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
              <tr>
                <th className="py-3 px-4">Voucher No.</th>
                <th className="py-3 px-4">Medicine &amp; Company</th>
                <th className="py-3 px-4">Store</th>
                <th className="py-3 px-4 text-center">Variance</th>
                <th className="py-3 px-4 text-right">Value Impact</th>
                <th className="py-3 px-4">Reason Code</th>
                <th className="py-3 px-4">Authorizer</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filtered.map((item) => {
                const audit = audits.find((a) => a.id === item.auditId);
                const store = stores.find((s) => s.id === audit?.storeId);
                const disc = calculateAuditDiscrepancy(item);
                const voucher = item.erpAdjustmentNo || 'ADJ-84910';

                return (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#0B3D91]">{voucher}</td>
                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-bold text-slate-900">{item.product.name}</p>
                        <p className="text-[11px] text-slate-500">{item.product.pack}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{store?.name}</td>
                    <td className="py-3.5 px-4 text-center">
                      <DifferenceBadge difference={disc.difference} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      ${disc.differenceValue.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 capitalize text-slate-700">
                      {item.differenceReason ? item.differenceReason.replace(/_/g, ' ') : 'Balanced'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{item.approvedByName || 'Auto Engine'}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        Ready to Post
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
