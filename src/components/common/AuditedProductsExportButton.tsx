import React, { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import type { Audit, AuditItem, Store } from '../../types';
import { calculateAuditDiscrepancy } from '../../services/api';

interface AuditedProductsExportButtonProps {
  audits: Audit[];
  items: AuditItem[];
  stores: Store[];
}

export const AuditedProductsExportButton: React.FC<AuditedProductsExportButtonProps> = ({
  audits,
  items,
  stores,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const auditIds = new Set(audits.map((audit) => audit.id));
  const auditedProductCount = items.filter(
    (item) => item.physicalCount !== undefined && auditIds.has(item.auditId)
  ).length;

  const exportAuditedProductsByBranch = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Stock Audit';
      workbook.created = new Date();

      const branchRows = new Map<
        string,
        { branchName: string; branchCode: string; rows: { audit: Audit; item: AuditItem }[] }
      >();

      for (const item of items) {
        if (item.physicalCount === undefined) continue;
        const audit = audits.find((entry) => entry.id === item.auditId);
        if (!audit) continue;
        const store = stores.find((entry) => entry.id === audit.storeId);
        const branchName = store?.name || audit.storeName || 'Unknown Branch';
        const branchCode = store?.code || '';
        const branch = branchRows.get(audit.storeId) || {
          branchName,
          branchCode,
          rows: [],
        };
        branch.rows.push({ audit, item });
        branchRows.set(audit.storeId, branch);
      }

      const usedSheetNames = new Set<string>();
      for (const branch of branchRows.values()) {
        const baseName = (branch.branchCode ? `${branch.branchCode} ${branch.branchName}` : branch.branchName)
          .replace(/[\\/*?:[\]]/g, '')
          .slice(0, 31) || 'Branch';
        let sheetName = baseName;
        let suffix = 2;
        while (usedSheetNames.has(sheetName)) {
          const suffixText = ` (${suffix++})`;
          sheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
        }
        usedSheetNames.add(sheetName);

        const sheet = workbook.addWorksheet(sheetName);
        sheet.columns = [
          { header: 'Audit', key: 'audit', width: 34 },
          { header: 'Audit Date', key: 'auditDate', width: 14 },
          { header: 'Audit Status', key: 'auditStatus', width: 16 },
          { header: 'Product Code', key: 'productCode', width: 18 },
          { header: 'Product', key: 'product', width: 36 },
          { header: 'Pack', key: 'pack', width: 20 },
          { header: 'Company', key: 'company', width: 28 },
          { header: 'Bin', key: 'bin', width: 16 },
          { header: 'Snapshot Qty', key: 'snapshotQty', width: 14 },
          { header: 'Physical Count', key: 'physicalCount', width: 16 },
          { header: 'Final Difference', key: 'difference', width: 16 },
          { header: 'Item Status', key: 'itemStatus', width: 18 },
          { header: 'Audited By', key: 'auditor', width: 24 },
          { header: 'Photo', key: 'photo', width: 42 },
        ];
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0B3D91' },
        };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: branch.rows.length + 1, column: sheet.columns.length },
        };

        for (const { audit, item } of branch.rows) {
          const discrepancy = calculateAuditDiscrepancy(item);
          const row = sheet.addRow({
            audit: audit.name,
            auditDate: audit.date,
            auditStatus: audit.status,
            productCode: item.product.code,
            product: item.product.name,
            pack: item.product.pack,
            company: item.product.company,
            bin: item.bin,
            snapshotQty: item.snapshotQty,
            physicalCount: item.physicalCount,
            difference: discrepancy.difference,
            itemStatus: item.status,
            auditor: item.countedByUserName || '',
            photo: item.photoUrl
              ? {
                  text: 'Open photo',
                  hyperlink: new URL(item.photoUrl, window.location.origin).toString(),
                  tooltip: 'Open this audited product photo',
                }
              : 'No photo',
          });
          if (item.photoUrl) {
            row.getCell('photo').font = { color: { argb: 'FF0563C1' }, underline: true };
          }
        }
      }

      if (branchRows.size === 0) {
        throw new Error('No counted products are available to export.');
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `StockAudit_Audited_Products_By_Branch_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Audited products export failed', error);
      setExportError(error instanceof Error ? error.message : 'Could not export audited products.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={exportAuditedProductsByBranch}
        disabled={isExporting || auditedProductCount === 0}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition min-h-[42px]"
      >
        <FileSpreadsheet className="w-4 h-4" />
        <span>
          {isExporting
            ? 'Preparing Excel...'
            : `Export Audited Products by Branch (${auditedProductCount})`}
        </span>
      </button>
      {exportError && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {exportError}
        </p>
      )}
    </div>
  );
};
