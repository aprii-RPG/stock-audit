import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  Package,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  Building,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import type { Product, ProductAuditHistoryEntry } from '../../types';
import { api } from '../../services/api';
import { DifferenceBadge } from '../common/DifferenceBadge';

interface ProductHistoryViewProps {
  products: Product[];
}

export const ProductHistoryView: React.FC<ProductHistoryViewProps> = ({ products }) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || 'PRD-01');
  const [historyData, setHistoryData] = useState<{
    product: Product | undefined;
    summary: {
      timesAudited: number;
      shortCount: number;
      excessCount: number;
      totalValueLost: number;
    };
    timeline: ProductAuditHistoryEntry[];
  } | null>(null);

  const [search, setSearch] = useState('');

  const loadHistory = async (id: string) => {
    const data = await api.getProductAuditHistory(id);
    setHistoryData(data);
  };

  useEffect(() => {
    if (selectedProductId) {
      loadHistory(selectedProductId);
    }
  }, [selectedProductId]);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.company.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search)
  );

  const prod = historyData?.product || products[0];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
          Product Audit History & Lifecycle
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 font-medium">
          Comprehensive historical audit records, repeat variance patterns, and ERP adjustment tracking.
        </p>
      </div>

      {/* Product Selector Dropdown & Search */}
      <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Choose Medicine to Inspect
          </label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full text-xs sm:text-sm font-bold text-[#0B3D91] bg-[#F7FAFF] border border-blue-200 rounded-xl px-3 py-2.5 min-h-[44px] cursor-pointer"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.pack} - {p.company})
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-64">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Filter Medicine by Name/Barcode
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter list..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {prod && historyData && (
        <>
          {/* Header with Product Details */}
          <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1D5FD1] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {prod.category}
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                  {prod.name}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-600">
                  <span>Pack: <strong>{prod.pack}</strong></span>
                  <span>•</span>
                  <span>Manufacturer: <strong>{prod.company}</strong></span>
                  <span>•</span>
                  <span>Barcode: <strong className="font-mono">{prod.barcode}</strong></span>
                  <span>•</span>
                  <span>Unit Price: <strong>${prod.unitPrice.toFixed(2)}</strong></span>
                </div>
              </div>

              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200 text-xs space-y-0.5">
                <p className="font-semibold text-slate-700">Default Shelf Bin:</p>
                <p className="font-mono font-bold text-[#0B3D91] text-sm">
                  {prod.defaultBin || 'No bin assigned'}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Badges: Times audited, Short count, Excess count, Value lost */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* Times Audited */}
            <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Times Audited
              </span>
              <p className="text-2xl sm:text-3xl font-black text-[#0B3D91] mt-1">
                {historyData.summary.timesAudited}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Historical cycles</p>
            </div>

            {/* Short Count */}
            <div className="bg-white rounded-2xl p-4 border border-rose-200 shadow-xs bg-rose-50/20">
              <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                Short Audits
              </span>
              <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-1">
                {historyData.summary.shortCount}
              </p>
              <p className="text-[11px] text-rose-700/80 mt-0.5">Discrepancy incidents</p>
            </div>

            {/* Excess Count */}
            <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-xs bg-blue-50/20">
              <span className="text-[11px] font-bold text-[#1D5FD1] uppercase tracking-wider">
                Excess Audits
              </span>
              <p className="text-2xl sm:text-3xl font-black text-[#1D5FD1] mt-1">
                {historyData.summary.excessCount}
              </p>
              <p className="text-[11px] text-blue-700/80 mt-0.5">Surplus incidents</p>
            </div>

            {/* Total Value Lost */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Net Value Lost
              </span>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                ${historyData.summary.totalValueLost.toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Net inventory write-off</p>
            </div>
          </div>

          {/* Timeline Table: date, store, bin, difference, reason, approver, ERP adjustment number */}
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-blue-100 flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-[#1D5FD1]" />
                <span>Audit Timeline History</span>
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                {historyData.timeline.length} Recorded Audits
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
                  <tr>
                    <th className="py-3 px-4">Audit Date</th>
                    <th className="py-3 px-4">Store</th>
                    <th className="py-3 px-4">Bin</th>
                    <th className="py-3 px-4 text-center">Difference</th>
                    <th className="py-3 px-4">Investigation Reason</th>
                    <th className="py-3 px-4">Approver</th>
                    <th className="py-3 px-4 font-mono">ERP Adj No.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {historyData.timeline.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition">
                      <td className="py-3 px-4 font-semibold text-slate-900">{entry.date}</td>
                      <td className="py-3 px-4 text-slate-700">{entry.storeName}</td>
                      <td className="py-3 px-4 font-mono">{entry.bin}</td>
                      <td className="py-3 px-4 text-center">
                        <DifferenceBadge difference={entry.finalDifference} size="sm" />
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-700">
                        {entry.differenceReason
                          ? entry.differenceReason.replace(/_/g, ' ')
                          : 'None'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{entry.approverName}</td>
                      <td className="py-3 px-4 font-mono text-[#0B3D91] font-bold">
                        {entry.erpAdjustmentNo || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
