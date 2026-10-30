import React, { useState } from 'react';
import { ScanBarcode, X, Check, Search, Sparkles } from 'lucide-react';
import type { AuditItem } from '../../types';

interface BarcodeScanModalProps {
  items: AuditItem[];
  onBarcodeMatched: (item: AuditItem) => void;
  onClose: () => void;
}

export const BarcodeScanModal: React.FC<BarcodeScanModalProps> = ({
  items,
  onBarcodeMatched,
  onClose,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleTestMatch = (item: AuditItem) => {
    onBarcodeMatched(item);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = manualCode.trim();
    if (!clean) return;

    const found = items.find(
      (i) => i.product.barcode === clean || i.product.code.toLowerCase() === clean.toLowerCase()
    );

    if (found) {
      onBarcodeMatched(found);
    } else {
      setError(`No medicine in this audit matched barcode or code "${clean}".`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-blue-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-[#0B3D91] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-blue-300" />
            <h3 className="text-base font-bold text-white">Scan Medicine Barcode</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-blue-300 hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder simulator */}
        <div className="relative bg-slate-900 p-8 text-center text-white flex flex-col items-center justify-center">
          <div className="relative w-64 h-36 border-2 border-dashed border-blue-400 rounded-2xl flex items-center justify-center overflow-hidden bg-slate-800/60 shadow-inner">
            {/* Animated Laser Scan line */}
            <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-bounce shadow-sm shadow-red-500/50" />
            <ScanBarcode className="w-12 h-12 text-slate-500 stroke-[1.5]" />
          </div>
          <p className="text-xs text-slate-300 mt-3 font-medium">
            Align medicine box barcode within the frame
          </p>
        </div>

        {/* Body & Manual Input */}
        <div className="p-5 overflow-y-auto space-y-4">
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Or Enter Barcode / Code Manually
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. 8901083001012 or MED-1001"
                className="flex-1 px-3 py-2 text-xs sm:text-sm font-mono rounded-xl border border-blue-200 focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] min-h-[44px]"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#1D5FD1] hover:bg-[#0B3D91] text-white font-bold text-xs rounded-xl shadow-xs min-h-[44px]"
              >
                Find
              </button>
            </div>
            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          </form>

          {/* Quick test triggers for testing convenience */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Quick Test Barcodes:</span>
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {items.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTestMatch(item)}
                  className="w-full text-left p-2 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/70 transition flex items-center justify-between gap-2 min-h-[44px]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {item.product.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500">
                      Barcode: {item.product.barcode} • Bin: {item.bin || 'None'}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-[#1D5FD1] shrink-0 bg-blue-100/60 px-2 py-1 rounded">
                    Simulate Scan
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
