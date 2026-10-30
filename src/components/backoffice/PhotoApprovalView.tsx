import React, { useState } from 'react';
import {
  Camera,
  MapPin,
  Clock,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Building,
  Filter,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import type { Audit, AuditItem, Store } from '../../types';

interface PhotoApprovalViewProps {
  audits: Audit[];
  stores: Store[];
  items: AuditItem[];
  onApprovePhoto: (auditId: string, productId: string) => Promise<void>;
  onRejectPhoto: (auditId: string, productId: string, reason: string) => Promise<void>;
}

export const PhotoApprovalView: React.FC<PhotoApprovalViewProps> = ({
  audits,
  stores,
  items,
  onApprovePhoto,
  onRejectPhoto,
}) => {
  const [filterState, setFilterState] = useState<'pending' | 'flagged' | 'all'>('pending');
  const [selectedPhotoItem, setSelectedPhotoItem] = useState<AuditItem | null>(null);
  const [rejectingItem, setRejectingItem] = useState<AuditItem | null>(null);
  const [rejectReason, setRejectReason] = useState('Product label or batch number blurred/illegible');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Filter items with photos
  const itemsWithPhotos = items.filter((i) => i.photoUrl);

  const filteredPhotos = itemsWithPhotos.filter((item) => {
    const audit = audits.find((a) => a.id === item.auditId);
    const store = stores.find((s) => s.id === audit?.storeId);
    const geofence = store?.geofenceRadiusMeters || 150;
    const isOutside = (item.photoDistanceFromStoreM ?? 0) > geofence;

    if (filterState === 'pending') {
      return item.photoStatus === 'pending';
    }
    if (filterState === 'flagged') {
      return isOutside;
    }
    return true;
  });

  const handleApprove = async (item: AuditItem) => {
    await onApprovePhoto(item.auditId, item.productId);
    setActionNotice(`Photo for "${item.product.name}" approved!`);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingItem) return;
    await onRejectPhoto(rejectingItem.auditId, rejectingItem.productId, rejectReason);
    setActionNotice(`Photo for "${rejectingItem.product.name}" rejected. Item sent to recount.`);
    setRejectingItem(null);
    setTimeout(() => setActionNotice(null), 3000);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
            Photo Verification & Geofence Audit
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Review live camera captures, GPS proximity against geofences, and timestamp compliance.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-blue-100 shadow-2xs">
          <button
            onClick={() => setFilterState('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[38px] ${
              filterState === 'pending'
                ? 'bg-[#1D5FD1] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Pending Review ({itemsWithPhotos.filter((i) => i.photoStatus === 'pending').length})
          </button>

          <button
            onClick={() => setFilterState('flagged')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[38px] ${
              filterState === 'flagged'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Flagged Outside Radius
          </button>

          <button
            onClick={() => setFilterState('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[38px] ${
              filterState === 'all'
                ? 'bg-[#0B3D91] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Photos ({itemsWithPhotos.length})
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Photo Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-blue-100 p-12 text-center shadow-xs">
          <Camera className="w-12 h-12 text-blue-200 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Photos in this Queue</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            All captured shelf images have been verified or no photos match the active filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPhotos.map((item) => {
            const audit = audits.find((a) => a.id === item.auditId);
            const store = stores.find((s) => s.id === audit?.storeId);
            const geofence = store?.geofenceRadiusMeters || 150;
            const dist = item.photoDistanceFromStoreM ?? 12;
            const isOutside = dist > geofence;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl overflow-hidden border shadow-sm transition hover:shadow-md flex flex-col ${
                  isOutside
                    ? 'border-rose-300 ring-2 ring-rose-200/50'
                    : 'border-blue-100 hover:border-blue-300'
                }`}
              >
                {/* Photo Preview Container */}
                <div
                  className="relative h-48 bg-slate-900 cursor-pointer overflow-hidden group"
                  onClick={() => setSelectedPhotoItem(item)}
                >
                  <img
                    src={item.photoUrl}
                    alt={item.product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />

                  {/* Red Geofence Warning Flag Badge */}
                  {isOutside && (
                    <div className="absolute top-2.5 left-2.5 bg-rose-600 text-white text-[11px] font-black px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1.5 animate-pulse">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>FLAGGED: {dist}m from store (&gt;{geofence}m radius)</span>
                    </div>
                  )}

                  {/* Status Overlay */}
                  <div className="absolute top-2.5 right-2.5">
                    <span
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                        item.photoStatus === 'approved'
                          ? 'bg-emerald-600 text-white'
                          : item.photoStatus === 'rejected'
                          ? 'bg-rose-600 text-white'
                          : 'bg-amber-500 text-slate-950 font-black'
                      }`}
                    >
                      {item.photoStatus === 'approved'
                        ? 'Approved'
                        : item.photoStatus === 'rejected'
                        ? 'Rejected'
                        : 'Review Required'}
                    </span>
                  </div>

                  <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-[10px] font-mono flex items-center gap-1 backdrop-blur-xs">
                    <Eye className="w-3 h-3" />
                    <span>Click to Zoom</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">
                      {item.product.name}
                    </h4>
                    <p className="text-xs text-slate-500">
                      Pack: {item.product.pack} • Bin: {item.bin || 'None'}
                    </p>
                    <p className="text-[11px] text-[#0B3D91] font-semibold mt-0.5">
                      {audit?.storeName || 'Store'}
                    </p>
                  </div>

                  {/* Metadata Chips: Auditor, Time, Distance from store */}
                  <div className="bg-[#F7FAFF] p-2.5 rounded-xl border border-blue-100 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold">Auditor:</span>
                      <span className="text-slate-800 font-medium">
                        {item.countedByUserName || 'Alex Reed'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Captured:</span>
                      </span>
                      <span className="font-mono text-slate-800">
                        {item.photoCapturedAt
                          ? new Date(item.photoCapturedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '09:30 AM'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-blue-500" />
                        <span>Distance:</span>
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          isOutside ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {dist} meters {isOutside ? '(Outside)' : '(Within radius)'}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Approve and Reject (with reason) */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setRejectingItem(item)}
                      className="flex-1 py-2 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center justify-center gap-1 min-h-[42px]"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApprove(item)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-1 shadow-xs min-h-[42px]"
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Approve</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-blue-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Reject Product Photo</h3>
            <p className="text-xs text-slate-500 mb-3">
              Medicine: <strong>{rejectingItem.product.name}</strong>
            </p>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Rejection Reason
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white min-h-[44px]"
                >
                  <option value="Product label or batch number blurred/illegible">
                    Product label or batch number blurred/illegible
                  </option>
                  <option value="Photo taken outside approved store geofence radius">
                    Photo taken outside approved store geofence radius
                  </option>
                  <option value="Wrong medicine box photographed">
                    Wrong medicine box photographed
                  </option>
                  <option value="Photo does not show full shelf layout">
                    Photo does not show full shelf layout
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingItem(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 shadow-xs min-h-[44px]"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Photo Lightbox Modal */}
      {selectedPhotoItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-blue-500/30 flex flex-col">
            <div className="p-4 bg-slate-950 flex items-center justify-between text-white border-b border-slate-800">
              <div>
                <h4 className="text-sm font-bold">{selectedPhotoItem.product.name}</h4>
                <p className="text-xs text-slate-400">
                  Auditor: {selectedPhotoItem.countedByUserName || 'Alex Reed'} •{' '}
                  {selectedPhotoItem.photoDistanceFromStoreM}m from store
                </p>
              </div>
              <button
                onClick={() => setSelectedPhotoItem(null)}
                className="text-slate-400 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black">
              <img
                src={selectedPhotoItem.photoUrl}
                alt="Full preview"
                className="max-h-[500px] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
