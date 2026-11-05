import React, { useState } from 'react';
import {
  BarChart3,
  Download,
  AlertTriangle,
  Clock,
  ShieldAlert,
  UserCheck,
  Package,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import type { Audit, AuditItem, Product, Store, User } from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';
import { DifferenceBadge } from '../common/DifferenceBadge';

interface ReportsViewProps {
  products: Product[];
  stores: Store[];
  audits: Audit[];
  items: AuditItem[];
  users: User[];
}

type ReportType =
  | 'no_bin'
  | 'not_audited_n_days'
  | 'reason_loss'
  | 'auditor_accuracy'
  | 'repeat_problems';

export const ReportsView: React.FC<ReportsViewProps> = ({
  products,
  stores,
  audits,
  items,
  users,
}) => {
  const [activeReport, setActiveReport] = useState<ReportType>('no_bin');
  const [overdueDaysThreshold, setOverdueDaysThreshold] = useState<number>(60);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL');

  // Helper to trigger CSV/Excel export
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((x) => `"${x}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Report 1: Products without bin
  const productsWithoutBin = products.filter(
    (p) => !p.defaultBin || p.defaultBin.trim().length === 0
  );

  const exportNoBinReport = () => {
    const headers = ['Product Code', 'Medicine Name', 'Pack Size', 'Company', 'Category', 'Unit Price ($)'];
    const rows = productsWithoutBin.map((p) => [
      p.code,
      p.name,
      p.pack,
      p.company,
      p.category,
      p.unitPrice,
    ]);
    downloadCSV('StockAudit_Products_Without_Bin', headers, rows);
  };

  // Report 2: Not audited in last N days per store
  const notAuditedProducts = products.map((prod) => {
    const lastAuditDate = prod.lastAuditedDate ? new Date(prod.lastAuditedDate) : null;
    const diffDays = lastAuditDate
      ? Math.floor((Date.now() - lastAuditDate.getTime()) / (1000 * 3600 * 24))
      : null;
    return {
      product: prod,
      lastAuditDate: prod.lastAuditedDate || 'Never audited',
      diffDays,
      isOverdue: diffDays === null || diffDays >= overdueDaysThreshold,
    };
  }).filter((x) => x.isOverdue);

  const exportNotAuditedReport = () => {
    const headers = ['Code', 'Medicine Name', 'Company', 'Last Audited Date', 'Days Overdue', 'Result'];
    const rows = notAuditedProducts.map((p) => [
      p.product.code,
      p.product.name,
      p.product.company,
      p.lastAuditDate,
      p.diffDays ?? 'Never audited',
      p.product.lastAuditedResult || 'N/A',
    ]);
    downloadCSV(`StockAudit_Overdue_${overdueDaysThreshold}_Days`, headers, rows);
  };

  // Report 3: Reason-wise loss
  const reasonMap: Record<string, { count: number; totalLoss: number }> = {};
  items.forEach((item) => {
    if (item.physicalCount !== undefined) {
      const disc = calculateAuditDiscrepancy(item);
      if (disc.direction === 'short') {
        const reason = item.differenceReason || 'theft_loss';
        if (!reasonMap[reason]) {
          reasonMap[reason] = { count: 0, totalLoss: 0 };
        }
        reasonMap[reason].count += 1;
        reasonMap[reason].totalLoss += disc.differenceValue;
      }
    }
  });

  const exportReasonLossReport = () => {
    const headers = ['Reason Code', 'Discrepancy Incidents', 'Total Financial Loss ($)'];
    const rows = Object.entries(reasonMap).map(([k, v]) => [
      k.replace(/_/g, ' ').toUpperCase(),
      v.count,
      v.totalLoss.toFixed(2),
    ]);
    downloadCSV('StockAudit_Reason_Wise_Loss', headers, rows);
  };

  // Report 4: Auditor accuracy
  const auditorAccuracyList = users
    .filter((u) => u.role === 'auditor')
    .map((auditor) => {
      const auditorItems = items.filter((i) => i.countedByUserId === auditor.id);
      const totalCounted = auditorItems.length || 1;
      const exactMatches = auditorItems.filter((i) => {
        const disc = calculateAuditDiscrepancy(i);
        return disc.difference === 0;
      }).length;
      const withinTolerance = auditorItems.filter((i) => {
        const disc = calculateAuditDiscrepancy(i);
        return Math.abs(disc.difference) <= 1;
      }).length;

      return {
        auditor,
        totalCounted: auditorItems.length,
        exactMatches,
        exactMatchRate: Math.round((exactMatches / totalCounted) * 100),
        toleranceRate: Math.round((withinTolerance / totalCounted) * 100),
      };
    });

  const exportAuditorAccuracy = () => {
    const headers = ['Employee ID', 'Auditor Name', 'Total Items Counted', 'Exact Match %', 'Within Tolerance %'];
    const rows = auditorAccuracyList.map((a) => [
      a.auditor.employeeId,
      a.auditor.name,
      a.totalCounted,
      `${a.exactMatchRate}%`,
      `${a.toleranceRate}%`,
    ]);
    downloadCSV('StockAudit_Auditor_Accuracy', headers, rows);
  };

  // Report 5: Repeat-problem products (short in many audits)
  const productDiscrepancyCount: Record<string, { product: Product; shortCount: number; totalLost: number }> = {};
  items.forEach((item) => {
    const disc = calculateAuditDiscrepancy(item);
    if (disc.direction === 'short') {
      if (!productDiscrepancyCount[item.productId]) {
        productDiscrepancyCount[item.productId] = {
          product: item.product,
          shortCount: 0,
          totalLost: 0,
        };
      }
      productDiscrepancyCount[item.productId].shortCount += 1;
      productDiscrepancyCount[item.productId].totalLost += disc.differenceValue;
    }
  });

  const repeatProblemProducts = Object.values(productDiscrepancyCount)
    .sort((a, b) => b.shortCount - a.shortCount);

  const exportRepeatProblems = () => {
    const headers = ['Medicine Name', 'Company', 'Shortage Incidents', 'Total Lost Value ($)'];
    const rows = repeatProblemProducts.map((p) => [
      p.product.name,
      p.product.company,
      p.shortCount,
      p.totalLost.toFixed(2),
    ]);
    downloadCSV('StockAudit_Repeat_Problem_Products', headers, rows);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
            Inventory Audit Reports & Analytics
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Generate compliance reports, shrink analysis, auditor accuracy, and export Excel data.
          </p>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 pb-2">
        <button
          onClick={() => setActiveReport('no_bin')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeReport === 'no_bin'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Products Without Bin ({productsWithoutBin.length})
        </button>

        <button
          onClick={() => setActiveReport('not_audited_n_days')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeReport === 'not_audited_n_days'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Not Audited in &gt;N Days
        </button>

        <button
          onClick={() => setActiveReport('reason_loss')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeReport === 'reason_loss'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Reason-Wise Loss
        </button>

        <button
          onClick={() => setActiveReport('auditor_accuracy')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeReport === 'auditor_accuracy'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Auditor Accuracy
        </button>

        <button
          onClick={() => setActiveReport('repeat_problems')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeReport === 'repeat_problems'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Repeat-Problem Products
        </button>
      </div>

      {/* REPORT 1: Products Without Bin */}
      {activeReport === 'no_bin' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Products Without Assigned Bin ({productsWithoutBin.length} Medicines)
              </h3>
              <p className="text-xs text-slate-500">
                Medicines in catalog missing fixed shelf coordinates; triggers suggestions for auditors during counting.
              </p>
            </div>
            <button
              onClick={exportNoBinReport}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition min-h-[42px]"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel / CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
                <tr>
                  <th className="py-3 px-3">Item Code</th>
                  <th className="py-3 px-3">Medicine Name</th>
                  <th className="py-3 px-3">Pack Size</th>
                  <th className="py-3 px-3">Company</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3 text-right">Unit Price</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {productsWithoutBin.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50/30">
                    <td className="py-3 px-3 font-mono text-[#0B3D91] font-bold">{p.code}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">{p.name}</td>
                    <td className="py-3 px-3 text-slate-600">{p.pack}</td>
                    <td className="py-3 px-3 text-slate-700">{p.company}</td>
                    <td className="py-3 px-3">{p.category}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">${p.unitPrice.toFixed(2)}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900">
                        Needs Bin
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 2: Not Audited in N Days */}
      {activeReport === 'not_audited_n_days' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Medicines Overdue for Audit (&gt;{overdueDaysThreshold} Days)
              </h3>
              <p className="text-xs text-slate-500">
                High-shrinkage risk items exceeding cycle count interval frequency.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span>Interval:</span>
                <select
                  value={overdueDaysThreshold}
                  onChange={(e) => setOverdueDaysThreshold(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs min-h-[38px]"
                >
                  <option value={30}>&gt; 30 Days</option>
                  <option value={60}>&gt; 60 Days</option>
                  <option value={90}>&gt; 90 Days</option>
                  <option value={120}>&gt; 120 Days</option>
                </select>
              </div>

              <button
                onClick={exportNotAuditedReport}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition min-h-[42px]"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel / CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
                <tr>
                  <th className="py-3 px-3">Medicine</th>
                  <th className="py-3 px-3">Company</th>
                  <th className="py-3 px-3">Last Audited Date</th>
                  <th className="py-3 px-3 text-center">Days Overdue</th>
                  <th className="py-3 px-3">Last Result</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {notAuditedProducts.map((p, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30">
                    <td className="py-3 px-3 font-bold text-slate-900">{p.product.name}</td>
                    <td className="py-3 px-3 text-slate-700">{p.product.company}</td>
                    <td className="py-3 px-3 font-mono">{p.lastAuditDate}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold px-2 py-0.5 rounded text-rose-700 bg-rose-50 border border-rose-200 font-mono">
                        {p.diffDays === null ? 'Never audited' : `${p.diffDays} days`}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600">
                      {p.product.lastAuditedResult || 'Approved'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-xs font-bold text-[#1D5FD1]">Queue for Spot Audit</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 3: Reason-Wise Loss */}
      {activeReport === 'reason_loss' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Root Cause Loss Analysis (Reason-Wise)
              </h3>
              <p className="text-xs text-slate-500">
                Breakdown of financial shrinkage by investigated loss justification.
              </p>
            </div>
            <button
              onClick={exportReasonLossReport}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition min-h-[42px]"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel / CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(reasonMap).map(([reason, stats]) => (
              <div
                key={reason}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-900 capitalize">
                    {reason.replace(/_/g, ' ')}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {stats.count} Discrepancy Occurrence(s)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-rose-600 font-mono">
                    -${stats.totalLoss.toFixed(2)}
                  </span>
                  <span className="block text-[10px] text-slate-400 uppercase font-semibold">
                    Net Shortage
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REPORT 4: Auditor Accuracy */}
      {activeReport === 'auditor_accuracy' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Field Auditor Quality &amp; Accuracy Metrics
              </h3>
              <p className="text-xs text-slate-500">
                First-time physical count precision vs cutoff snapshot.
              </p>
            </div>
            <button
              onClick={exportAuditorAccuracy}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition min-h-[42px]"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel / CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {auditorAccuracyList.map((a) => (
              <div
                key={a.auditor.id}
                className="bg-white rounded-xl border border-blue-100 p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                      {a.auditor.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{a.auditor.name}</h4>
                      <p className="text-[10px] text-slate-500">{a.auditor.employeeId}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {a.exactMatchRate}% Exact Match
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Within ±1 Unit Tolerance:</span>
                    <strong className="text-slate-900">{a.toleranceRate}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Products Counted:</span>
                    <strong className="text-slate-900">{a.totalCounted}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REPORT 5: Repeat-Problem Products */}
      {activeReport === 'repeat_problems' && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Repeat-Problem Products (Multiple Shortages)
              </h3>
              <p className="text-xs text-slate-500">
                Medicines exhibiting frequent negative variances across audits; targets for physical surveillance.
              </p>
            </div>
            <button
              onClick={exportRepeatProblems}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition min-h-[42px]"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel / CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
                <tr>
                  <th className="py-3 px-3">Medicine</th>
                  <th className="py-3 px-3">Company</th>
                  <th className="py-3 px-3 text-center">Shortage Incidents</th>
                  <th className="py-3 px-3 text-right">Cumulative Value Lost</th>
                  <th className="py-3 px-3 text-right">Surveillance Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {repeatProblemProducts.map((p, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30">
                    <td className="py-3 px-3 font-bold text-slate-900">{p.product.name}</td>
                    <td className="py-3 px-3 text-slate-700">{p.product.company}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        {p.shortCount} Audits Short
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-rose-600">
                      -${p.totalLost.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-rose-600 text-white">
                        High Priority
                      </span>
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
