import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  AlertTriangle,
  Clock,
  ShieldAlert,
  UserCheck,
  Package,
  Layers,
  FileDown,
  X,
} from 'lucide-react';
import type { Audit, AuditItem, Product, Store, User } from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';
import { jsPDF } from 'jspdf';
import { DifferenceBadge } from '../common/DifferenceBadge';
import { AuditedProductsExportButton } from '../common/AuditedProductsExportButton';
import { formatINR } from '../../utils/currency';

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
  const [showVarianceBranchPicker, setShowVarianceBranchPicker] = useState(false);
  const [isGeneratingVariancePdf, setIsGeneratingVariancePdf] = useState(false);
  const [variancePdfError, setVariancePdfError] = useState<string | null>(null);
  const storesWithVariance = useMemo(() => {
    const auditStoreIds = new Map(audits.map((audit) => [audit.id, audit.storeId]));
    const storeIds = new Set<string>();
    for (const item of items) {
      if (item.physicalCount === undefined) continue;
      const storeId = auditStoreIds.get(item.auditId);
      if (storeId && calculateAuditDiscrepancy(item).direction !== 'balanced') {
        storeIds.add(storeId);
      }
    }
    return storeIds;
  }, [audits, items]);

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
    const headers = ['Product Code', 'Medicine Name', 'Pack Size', 'Company', 'Category', 'Unit Price (INR)'];
    const rows = productsWithoutBin.map((p) => [
      p.code,
      p.name,
      p.pack,
      p.company,
      p.category,
      formatINR(p.unitPrice),
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
    const headers = ['Reason Code', 'Discrepancy Incidents', 'Total Financial Loss (INR)'];
    const rows = Object.entries(reasonMap).map(([k, v]) => [
      k.replace(/_/g, ' ').toUpperCase(),
      v.count,
      formatINR(v.totalLoss),
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
    const headers = ['Medicine Name', 'Company', 'Shortage Incidents', 'Total Lost Value (INR)'];
    const rows = repeatProblemProducts.map((p) => [
      p.product.name,
      p.product.company,
      p.shortCount,
      formatINR(p.totalLost),
    ]);
    downloadCSV('StockAudit_Repeat_Problem_Products', headers, rows);
  };

  const exportVariancePdf = async (storeId: string) => {
    setIsGeneratingVariancePdf(true);
    setVariancePdfError(null);
    try {
      const branchReports = new Map<string, {
        branchName: string;
        branchCode: string;
        shortages: { audit: Audit; item: AuditItem; expectedQty: number; difference: number; value: number }[];
        excesses: { audit: Audit; item: AuditItem; expectedQty: number; difference: number; value: number }[];
      }>();

      for (const item of items) {
        if (item.physicalCount === undefined) continue;
        const audit = audits.find((entry) => entry.id === item.auditId);
        if (!audit || audit.storeId !== storeId) continue;
        const discrepancy = calculateAuditDiscrepancy(item);
        if (discrepancy.direction === 'balanced') continue;

        const store = stores.find((entry) => entry.id === audit.storeId);
        const branch = branchReports.get(audit.storeId) || {
          branchName: store?.name || audit.storeName || 'Unknown Branch',
          branchCode: store?.code || '',
          shortages: [],
          excesses: [],
        };
        const row = {
          audit,
          item,
          expectedQty: discrepancy.expectedQty,
          difference: discrepancy.difference,
          value: discrepancy.differenceValue,
        };
        if (discrepancy.direction === 'short') branch.shortages.push(row);
        else branch.excesses.push(row);
        branchReports.set(audit.storeId, branch);
      }

      if (branchReports.size === 0) {
        throw new Error('No counted shortage or excess products are available for this report.');
      }

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const columns = [
        { title: 'Product', x: 12, width: 82 },
        { title: 'Audit Date', x: 97, width: 25 },
        { title: 'Bin', x: 124, width: 25 },
        { title: 'Expected', x: 151, width: 20 },
        { title: 'Physical', x: 173, width: 21 },
        { title: 'Variance', x: 196, width: 25 },
        { title: 'Value (INR)', x: 223, width: 34 },
        { title: 'Status', x: 260, width: 25 },
      ];
      const formatPdfMoney = (value: number) =>
        `INR ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text('Branch Shortage & Excess Report', margin, 14);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`Generated ${new Date().toLocaleString('en-IN')}`, margin, 20);
      const reportBranch = branchReports.values().next().value;
      if (!reportBranch) {
        throw new Error('The selected branch has no counted shortage or excess products.');
      }
      pdf.text(
        `${reportBranch.branchCode ? `${reportBranch.branchCode} - ` : ''}${reportBranch.branchName}`,
        pageWidth - margin,
        20,
        { align: 'right' }
      );

      let y = 30;
      const drawTableHeader = () => {
        pdf.setFillColor(11, 61, 145);
        pdf.rect(margin, y - 5, pageWidth - margin * 2, 8, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(255, 255, 255);
        for (const column of columns) {
          pdf.text(column.title, column.x, y, { maxWidth: column.width });
        }
        pdf.setTextColor(30, 41, 59);
        pdf.setFont('helvetica', 'normal');
        y += 7;
      };
      const drawSectionTitle = (
        branchName: string,
        branchCode: string,
        kind: 'shortage' | 'excess',
        rows: { audit: Audit; item: AuditItem; expectedQty: number; difference: number; value: number }[],
        continued = false
      ) => {
        if (y > pageHeight - 38) {
          pdf.addPage();
          y = 18;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(11, 61, 145);
        pdf.text(
          `${branchCode ? `${branchCode} - ` : ''}${branchName}${continued ? ' (continued)' : ''}`,
          margin,
          y
        );
        y += 6;
        const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
        const totalUnits = rows.reduce((sum, row) => sum + Math.abs(row.difference), 0);
        pdf.setFontSize(9);
        pdf.setTextColor(kind === 'shortage' ? 190 : 29, kind === 'shortage' ? 18 : 95, kind === 'shortage' ? 60 : 209);
        pdf.text(
          `${kind === 'shortage' ? 'SHORTAGE' : 'EXCESS'}: ${rows.length} product(s) | ${totalUnits.toLocaleString('en-IN')} units | ${formatPdfMoney(totalValue)}`,
          margin,
          y
        );
        y += 7;
        drawTableHeader();
      };

      for (const branch of branchReports.values()) {
        for (const [kind, rows] of [
          ['shortage', branch.shortages],
          ['excess', branch.excesses],
        ] as const) {
          if (rows.length === 0) continue;
          rows.sort((a, b) => a.audit.date.localeCompare(b.audit.date) || a.item.product.name.localeCompare(b.item.product.name));
          drawSectionTitle(branch.branchName, branch.branchCode, kind, rows);

          for (const row of rows) {
            const productText = pdf.splitTextToSize(
              `${row.item.product.code} - ${row.item.product.name}\n${row.audit.name}`,
              columns[0].width
            ) as string[];
            const binText = pdf.splitTextToSize(row.item.bin || '-', columns[2].width) as string[];
            const statusText = pdf.splitTextToSize(row.item.status.replace(/_/g, ' '), columns[7].width) as string[];
            const lineCount = Math.max(1, productText.length, binText.length, statusText.length);
            const rowHeight = Math.max(7, lineCount * 3.8);
            if (y + rowHeight > pageHeight - 12) {
              pdf.addPage();
              y = 18;
              drawSectionTitle(branch.branchName, branch.branchCode, kind, rows, true);
            }

            pdf.setDrawColor(226, 232, 240);
            pdf.line(margin, y + rowHeight - 1, pageWidth - margin, y + rowHeight - 1);
            pdf.setFontSize(7);
            pdf.setTextColor(30, 41, 59);
            pdf.text(productText, columns[0].x, y + 2, { lineHeightFactor: 1.15 });
            pdf.text(row.audit.date, columns[1].x, y + 2);
            pdf.text(binText, columns[2].x, y + 2);
            pdf.text(String(row.expectedQty), columns[3].x, y + 2);
            pdf.text(String(row.item.physicalCount), columns[4].x, y + 2);
            pdf.text(`${row.difference > 0 ? '+' : ''}${row.difference}`, columns[5].x, y + 2);
            pdf.text(formatPdfMoney(row.value), columns[6].x, y + 2);
            pdf.text(statusText, columns[7].x, y + 2);
            y += rowHeight;
          }
          y += 8;
        }
      }

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
      }

      const branchFileName = `${reportBranch.branchCode ? `${reportBranch.branchCode}_` : ''}${reportBranch.branchName}`
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/^_+|_+$/g, '');
      pdf.save(`StockAudit_Shortage_Excess_${branchFileName}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Branch-wise shortage and excess PDF export failed', error);
      setVariancePdfError(error instanceof Error ? error.message : 'Could not create the branch-wise PDF report.');
    } finally {
      setIsGeneratingVariancePdf(false);
    }
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
        <div className="flex flex-wrap items-start gap-2">
          <AuditedProductsExportButton audits={audits} items={items} stores={stores} />
          <div>
            <button
              type="button"
              onClick={() => {
                setVariancePdfError(null);
                setShowVarianceBranchPicker(true);
              }}
              disabled={isGeneratingVariancePdf || storesWithVariance.size === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D91] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#082e6d] disabled:cursor-not-allowed disabled:opacity-50 min-h-[42px]"
            >
              <FileDown className="h-4 w-4" />
              <span>{isGeneratingVariancePdf ? 'Creating PDF...' : 'Shortage & Excess PDF by Branch'}</span>
            </button>
            {storesWithVariance.size === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                No counted shortage or excess products are available for PDF export.
              </p>
            )}
            {variancePdfError && (
              <p role="alert" className="mt-2 max-w-xs text-sm text-rose-700">
                {variancePdfError}
              </p>
            )}
          </div>
        </div>
      </div>

      {showVarianceBranchPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isGeneratingVariancePdf) {
              setShowVarianceBranchPicker(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="variance-branch-picker-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between bg-[#0B3D91] px-5 py-4 text-white">
              <div>
                <h3 id="variance-branch-picker-title" className="text-base font-black">
                  Select Branch
                </h3>
                <p className="mt-1 text-xs text-blue-100">
                  Select a branch to start its PDF download.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVarianceBranchPicker(false)}
                disabled={isGeneratingVariancePdf}
                aria-label="Close branch selection"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-blue-100 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {stores.filter((store) => storesWithVariance.has(store.id)).map((store) => (
                <button
                  key={store.id}
                  type="button"
                  disabled={isGeneratingVariancePdf}
                  onClick={() => {
                    setShowVarianceBranchPicker(false);
                    void exportVariancePdf(store.id);
                  }}
                  className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
                >
                  <span>{store.code ? `${store.code} - ` : ''}{store.name}</span>
                  <FileDown className="h-4 w-4 shrink-0 text-[#1D5FD1]" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

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
                    <td className="py-3 px-3 text-right font-mono font-bold">{formatINR(p.unitPrice)}</td>
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
                    -{formatINR(stats.totalLoss)}
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
                      -{formatINR(p.totalLost)}
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
