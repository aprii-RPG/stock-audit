import React, { useState, useEffect } from 'react';
import {
  Camera,
  Plus,
  Minus,
  Check,
  Lock,
  Calendar,
  AlertTriangle,
  History,
  Building,
  Tag,
  ArrowRight,
  PlusCircle,
  X,
  FileCheck2,
} from 'lucide-react';
import type { Audit, AuditItem } from '../../types';
import { StatusChip } from '../common/StatusChip';

interface BlindCountScreenProps {
  audit: Audit;
  item: AuditItem;
  existingBins: string[];
  onSaveCount: (count: number, binName?: string) => Promise<void>;
  onOpenPhotoCapture: () => void;
  onNextProduct: () => void;
  onSuggestNewBin: (binName: string) => Promise<void>;
  isTabletSplit?: boolean;
  onClose?: () => void;
}

export const BlindCountScreen: React.FC<BlindCountScreenProps> = ({
  audit,
  item,
  existingBins,
  onSaveCount,
  onOpenPhotoCapture,
  onNextProduct,
  onSuggestNewBin,
  isTabletSplit = false,
  onClose,
}) => {
  const [count, setCount] = useState<number>(item.physicalCount ?? 0);
  const [selectedBin, setSelectedBin] = useState<string>(item.bin || '');
  const [showAddBinModal, setShowAddBinModal] = useState(false);
  const [newBinInput, setNewBinInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Sync count if item changes
  useEffect(() => {
    setCount(item.physicalCount ?? 0);
    setSelectedBin(item.bin || '');
    setSaveSuccessNotice(false);
  }, [item.id, item.physicalCount, item.bin]);

  const handleIncrement = (amount = 1) => {
    setCount((prev) => Math.max(0, prev + amount));
  };

  const handleDecrement = (amount = 1) => {
    setCount((prev) => Math.max(0, prev - amount));
  };

  const handleSaveAndNext = async () => {
    setIsSaving(true);
    try {
      await onSaveCount(count, selectedBin);
      setSaveSuccessNotice(true);
      setTimeout(() => {
        setSaveSuccessNotice(false);
        onNextProduct();
      }, 500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBinInput.trim()) return;
    const cleanBin = newBinInput.trim().toUpperCase();
    await onSuggestNewBin(cleanBin);
    setSelectedBin(cleanBin);
    setShowAddBinModal(false);
    setNewBinInput('');
  };

  const hasBin = Boolean(item.bin && item.bin.trim().length > 0);

  return (
    <div className="flex flex-col h-full bg-[#F7FAFF] overflow-y-auto">
      {/* Top Bar / Header */}
      <div className="bg-white p-4 border-b border-blue-100 flex items-center justify-between shadow-2xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#1D5FD1] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Blind Count
            </span>
            <StatusChip status={item.status} size="sm" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 truncate mt-1">
            {item.product.name}
          </h3>
        </div>

        {onClose && !isTabletSplit && (
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-xl mx-auto w-full">
        {/* Snapshot Lock Banner: CRITICAL */}
        <div className="bg-gradient-to-r from-blue-900 to-[#1D5FD1] text-white p-3.5 rounded-xl shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-white" />
          </div>
          <div className="text-xs">
            <p className="font-bold text-white">
              Snapshot locked {audit.snapshotLockedAt}, after bill {audit.cutoffBillNo}
            </p>
            <p className="text-blue-100/90 text-[11px]">
              System quantity is strictly hidden for unbiased physical count integrity.
            </p>
          </div>
        </div>

        {/* Product Card with Image Placeholder & Details */}
        <div className="bg-white rounded-2xl border border-blue-100 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-start gap-4">
            {/* Product Image Placeholder */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex flex-col items-center justify-center text-blue-500 shrink-0 shadow-inner">
              <Tag className="w-8 h-8 stroke-[1.5]" />
              <span className="text-[10px] font-bold uppercase mt-1 text-[#0B3D91]">
                Medicine
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="text-base font-black text-slate-900 leading-snug">
                {item.product.name}
              </h4>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">
                Pack: <span className="text-slate-900">{item.product.pack}</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Company: <span className="font-medium text-slate-700">{item.product.company}</span>
              </p>

              {/* Barcode & Batch */}
              <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-xs">
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                  Batch: {item.product.currentBatch}
                </span>
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                  Exp: {item.product.expiry}
                </span>
              </div>
            </div>
          </div>

          {/* Last Audited Date + Result ONLY (Strict: NEVER show system quantity!) */}
          <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100 text-xs flex items-center gap-2.5">
            <History className="w-4 h-4 text-[#1D5FD1] shrink-0" />
            <div className="text-slate-700">
              <span className="font-semibold text-slate-900">Last Audited: </span>
              <span>{item.product.lastAuditedDate || '2026-08-15'}</span>
              <span className="mx-1.5">•</span>
              <span className="font-semibold text-emerald-700">
                {item.product.lastAuditedResult || 'Approved (No variance)'}
              </span>
            </div>
          </div>

          {/* Recount notice if item was sent to recount */}
          {item.status === 'recount' && (
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-300 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Recount Assigned by Back Office</p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  {item.recountNote || 'Please physically recount all boxes in primary and reserve storage racks.'}
                </p>
              </div>
            </div>
          )}

          {/* Optional Bin Selection if Product has no bin */}
          {!hasBin && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Bin Location (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddBinModal(true)}
                  className="text-xs font-bold text-[#1D5FD1] hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add new bin</span>
                </button>
              </div>

              <select
                value={selectedBin}
                onChange={(e) => {
                  if (e.target.value === '__NEW__') {
                    setShowAddBinModal(true);
                  } else {
                    setSelectedBin(e.target.value);
                  }
                }}
                className="w-full px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-blue-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] min-h-[44px]"
              >
                <option value="">-- No bin assigned --</option>
                {existingBins.map((b) => (
                  <option key={b} value={b}>
                    Bin {b}
                  </option>
                ))}
                <option value="__NEW__">+ Add new bin suggestion...</option>
              </select>
            </div>
          )}
        </div>

        {/* Large Number Input with Stepper (+ / -) */}
        <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-xs text-center">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Physical Quantity Counted
          </label>

          <div className="flex items-center justify-center gap-3 sm:gap-4 my-2">
            {/* Minus Button */}
            <button
              type="button"
              onClick={() => handleDecrement(1)}
              className="w-14 h-14 rounded-2xl bg-blue-50 text-[#0B3D91] border-2 border-blue-200 hover:bg-blue-100 active:scale-95 flex items-center justify-center text-xl font-bold transition shadow-xs min-h-[44px] min-w-[44px]"
              aria-label="Decrease by 1"
            >
              <Minus className="w-6 h-6 stroke-[3]" />
            </button>

            {/* Input Value Display & Editing */}
            <div className="flex-1 max-w-[160px]">
              <input
                type="number"
                min="0"
                value={count === 0 ? '' : count}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCount(isNaN(val) ? 0 : Math.max(0, val));
                }}
                placeholder="0"
                className="w-full text-center text-4xl sm:text-5xl font-black text-[#0B3D91] py-2 rounded-2xl border-2 border-blue-300 bg-[#F7FAFF] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] min-h-[64px]"
              />
              <span className="block text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                Units in stock
              </span>
            </div>

            {/* Plus Button */}
            <button
              type="button"
              onClick={() => handleIncrement(1)}
              className="w-14 h-14 rounded-2xl bg-[#1D5FD1] text-white hover:bg-[#0B3D91] active:scale-95 flex items-center justify-center text-xl font-bold transition shadow-md shadow-blue-500/20 min-h-[44px] min-w-[44px]"
              aria-label="Increase by 1"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>

          {/* Quick Increment Shortcuts */}
          <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-slate-100">
            {[+5, +10, +25].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handleIncrement(amt)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0B3D91] text-xs font-bold border border-slate-200 transition min-h-[38px]"
              >
                +{amt}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCount(0)}
              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition min-h-[38px]"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Photo Status Banner & Trigger */}
        <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                item.photoUrl
                  ? item.photoStatus === 'approved'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                  : 'bg-blue-50 text-[#1D5FD1]'
              }`}
            >
              <Camera className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800">
                {item.photoUrl ? 'Shelf Photo Captured' : 'Photo Required'}
              </p>
              <p className="text-[11px] text-slate-500">
                {item.photoUrl
                  ? `Status: ${item.photoStatus === 'approved' ? 'Approved by BO' : 'Pending BO Approval'}`
                  : 'Capture live GPS-verified camera picture of shelf'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenPhotoCapture}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border transition min-h-[44px] flex items-center gap-1.5 ${
              item.photoUrl
                ? 'bg-blue-50 text-[#0B3D91] border-blue-200 hover:bg-blue-100'
                : 'bg-[#1D5FD1] text-white hover:bg-[#0B3D91] shadow-xs'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{item.photoUrl ? 'Retake Photo' : 'Take Photo'}</span>
          </button>
        </div>

        {/* Bottom Actions: Save and next product */}
        <div className="pt-2 pb-6 space-y-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveAndNext}
            className="w-full py-3.5 px-4 rounded-xl bg-[#1D5FD1] hover:bg-[#0B3D91] text-white font-bold text-sm sm:text-base shadow-md shadow-blue-500/20 active:scale-98 transition flex items-center justify-center gap-2 min-h-[48px]"
          >
            {isSaving ? (
              <span>Saving count...</span>
            ) : (
              <>
                <Check className="w-5 h-5 stroke-[3]" />
                <span>Save and next product</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {saveSuccessNotice && (
            <p className="text-center text-xs font-bold text-emerald-600 animate-in fade-in flex items-center justify-center gap-1">
              <FileCheck2 className="w-4 h-4" />
              <span>Count saved in local offline DB!</span>
            </p>
          )}
        </div>
      </div>

      {/* Modal for adding new bin suggestion */}
      {showAddBinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-blue-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Suggest New Bin</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter the shelf/aisle code where this medicine is placed. It will be sent to Back Office for verification.
            </p>

            <form onSubmit={handleAddBinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Bin Identifier
                </label>
                <input
                  type="text"
                  value={newBinInput}
                  onChange={(e) => setNewBinInput(e.target.value)}
                  placeholder="e.g. A-14, COLD-02, RACK-03"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-sm uppercase font-mono rounded-xl border border-blue-200 focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] min-h-[44px]"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddBinModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#1D5FD1] text-white font-bold text-xs hover:bg-[#0B3D91] shadow-xs min-h-[44px]"
                >
                  Submit Bin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
