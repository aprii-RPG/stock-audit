import React from 'react';
import {
  PackageCheck,
  Camera,
  TrendingDown,
  TrendingUp,
  Building2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import type { Audit, AuditItem, Store } from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';
import { DifferenceBadge } from '../common/DifferenceBadge';

interface DashboardViewProps {
  stores: Store[];
  audits: Audit[];
  auditItems: AuditItem[];
  selectedStoreId: string;
  onNavigateToAudits: (auditId?: string) => void;
  onNavigateToPhotos: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stores,
  audits,
  auditItems,
  selectedStoreId,
  onNavigateToAudits,
  onNavigateToPhotos,
}) => {
  // Filter items by store if selected
  const activeAudits = audits.filter(
    (a) => selectedStoreId === 'ALL' || a.storeId === selectedStoreId
  );
  const activeAuditIds = activeAudits.map((a) => a.id);
  const filteredItems = auditItems.filter((i) => activeAuditIds.includes(i.auditId));

  // 1. Products Audited: count saved + photo approved (or skipped)
  const productsAudited = filteredItems.filter(
    (i) => (i.physicalCount !== undefined && i.photoStatus === 'approved') || i.status === 'skipped'
  ).length;

  // 2. Photos Awaiting Approval
  const photosAwaiting = filteredItems.filter((i) => i.photoStatus === 'pending').length;

  // 3. Shortage Value in RED
  // 4. Excess Value in BLUE
  let totalShortageValue = 0;
  let totalExcessValue = 0;
  let totalShortageUnits = 0;
  let totalExcessUnits = 0;

  filteredItems.forEach((item) => {
    if (item.physicalCount !== undefined) {
      const disc = calculateAuditDiscrepancy(item);
      if (disc.direction === 'short') {
        totalShortageValue += disc.differenceValue;
        totalShortageUnits += Math.abs(disc.difference);
      } else if (disc.direction === 'excess') {
        totalExcessValue += disc.differenceValue;
        totalExcessUnits += disc.difference;
      }
    }
  });

  // Calculate branch rows for branch table
  const branchRows = stores
    .filter((s) => selectedStoreId === 'ALL' || s.id === selectedStoreId)
    .map((store) => {
      const storeAudits = audits.filter((a) => a.storeId === store.id);
      const storeAuditIds = storeAudits.map((a) => a.id);
      const storeItems = auditItems.filter((i) => storeAuditIds.includes(i.auditId));

      const auditedCount = storeItems.filter(
        (i) => (i.physicalCount !== undefined && i.photoStatus === 'approved') || i.status === 'skipped'
      ).length;
      const totalCount = storeItems.length || 1;
      const progressPercent = Math.round((auditedCount / totalCount) * 100);

      const pendingCount = storeItems.filter(
        (i) => i.status === 'not_started' || (i.physicalCount === undefined && i.status !== 'skipped')
      ).length;

      const photosToReview = storeItems.filter((i) => i.photoStatus === 'pending').length;

      let shortageVal = 0;
      let excessVal = 0;
      storeItems.forEach((item) => {
        if (item.physicalCount !== undefined) {
          const disc = calculateAuditDiscrepancy(item);
          if (disc.direction === 'short') shortageVal += disc.differenceValue;
          if (disc.direction === 'excess') excessVal += disc.differenceValue;
        }
      });

      const latestAudit = storeAudits[0];

      return {
        store,
        latestAudit,
        auditedCount,
        totalCount,
        progressPercent,
        pendingCount,
        photosToReview,
        shortageVal: Math.round(shortageVal * 100) / 100,
        excessVal: Math.round(excessVal * 100) / 100,
      };
    });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
            Multi-Store Audit Dashboard
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Live physical reconciliation status across retail pharmacy locations.
          </p>
        </div>
      </div>

      {/* 4 Summary Cards (Audited, Photos awaiting, Shortage value in RED, Excess value in BLUE) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Products Audited */}
        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Products Audited
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PackageCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#0B3D91]">{productsAudited}</span>
            <span className="text-xs font-semibold text-slate-400">
              of {filteredItems.length} products
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            Physical count saved & photo verified
          </p>
        </div>

        {/* Card 2: Photos Awaiting Approval */}
        <div
          onClick={onNavigateToPhotos}
          className="bg-white rounded-2xl p-5 border border-blue-100 shadow-sm cursor-pointer hover:border-blue-300 transition"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Photos Awaiting
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-600">{photosAwaiting}</span>
            <span className="text-xs font-semibold text-slate-400">pending queue</span>
          </div>
          <p className="text-xs text-blue-600 mt-2 font-semibold flex items-center gap-1">
            <span>Review GPS & Geofence</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </p>
        </div>

        {/* Card 3: Shortage Value in RED */}
        <div className="bg-white rounded-2xl p-5 border border-rose-200 shadow-sm bg-linear-to-b from-white to-rose-50/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
              Shortage Value (Loss)
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-600">
              ${totalShortageValue.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded">
              ▼ Short ({totalShortageUnits} units)
            </span>
          </div>
          <p className="text-xs text-rose-700/80 mt-2 font-medium">
            Subject to cutoff bill sales reconciliation
          </p>
        </div>

        {/* Card 4: Excess Value in BLUE */}
        <div className="bg-white rounded-2xl p-5 border border-blue-200 shadow-sm bg-linear-to-b from-white to-blue-50/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#1D5FD1] uppercase tracking-wider">
              Excess Value (Surplus)
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1D5FD1] flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#1D5FD1]">
              ${totalExcessValue.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded">
              ▲ Excess (+{totalExcessUnits} units)
            </span>
          </div>
          <p className="text-xs text-blue-700/80 mt-2 font-medium">
            Investigate unentered returns / supplier GRN
          </p>
        </div>
      </div>

      {/* Branch Table: Progress bar, pending products, photos to review, shortage and excess values */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-blue-100/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#1D5FD1]" />
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              Branch Stores Reconciliation Status
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {branchRows.length} Branch Locations Monitored
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
              <tr>
                <th className="py-3.5 px-4">Store / Location</th>
                <th className="py-3.5 px-4 min-w-[160px]">Audit Progress</th>
                <th className="py-3.5 px-4 text-center">Pending Products</th>
                <th className="py-3.5 px-4 text-center">Photos to Review</th>
                <th className="py-3.5 px-4 text-right">Shortage Value</th>
                <th className="py-3.5 px-4 text-right">Excess Value</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {branchRows.map((row) => (
                <tr key={row.store.id} className="hover:bg-blue-50/40 transition">
                  {/* Store / Location */}
                  <td className="py-4 px-4">
                    <div>
                      <p className="font-bold text-slate-900">{row.store.name}</p>
                      <p className="text-[11px] text-slate-500">{row.store.city} • Geofence: {row.store.geofenceRadiusMeters}m</p>
                      {row.latestAudit && (
                        <p className="text-[10px] text-blue-600 font-mono mt-0.5">
                          Cutoff: {row.latestAudit.cutoffBillNo}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Audit Progress */}
                  <td className="py-4 px-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-[#0B3D91]">{row.progressPercent}%</span>
                        <span className="text-slate-400">
                          {row.auditedCount} / {row.totalCount} items
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#1D5FD1] to-emerald-500 rounded-full"
                          style={{ width: `${row.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Pending Products */}
                  <td className="py-4 px-4 text-center">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                        row.pendingCount > 0
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {row.pendingCount}
                    </span>
                  </td>

                  {/* Photos to Review */}
                  <td className="py-4 px-4 text-center">
                    {row.photosToReview > 0 ? (
                      <button
                        onClick={onNavigateToPhotos}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-[#0B3D91] hover:bg-blue-200 transition"
                      >
                        <Camera className="w-3 h-3" />
                        <span>{row.photosToReview} Pending</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">All approved</span>
                    )}
                  </td>

                  {/* Shortage Value (in Red) */}
                  <td className="py-4 px-4 text-right">
                    {row.shortageVal > 0 ? (
                      <span className="font-bold text-rose-600">
                        -${row.shortageVal.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400">$0.00</span>
                    )}
                  </td>

                  {/* Excess Value (in Blue) */}
                  <td className="py-4 px-4 text-right">
                    {row.excessVal > 0 ? (
                      <span className="font-bold text-[#1D5FD1]">
                        +${row.excessVal.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400">$0.00</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-4 px-4 text-right">
                    <button
                      onClick={() => onNavigateToAudits(row.latestAudit?.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-[#1D5FD1] hover:bg-blue-100 font-bold text-xs border border-blue-200 transition min-h-[38px]"
                    >
                      <span>Review</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
