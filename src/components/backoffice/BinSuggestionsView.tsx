import React, { useState } from 'react';
import {
  PackageSearch,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building,
  User,
  Clock,
  Check,
} from 'lucide-react';
import type { BinSuggestion } from '../../types';

interface BinSuggestionsViewProps {
  suggestions: BinSuggestion[];
  onReviewSuggestion: (id: string, approved: boolean, note?: string) => Promise<void>;
}

export const BinSuggestionsView: React.FC<BinSuggestionsViewProps> = ({
  suggestions,
  onReviewSuggestion,
}) => {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const filtered = suggestions.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const handleReview = async (id: string, approved: boolean, binName: string) => {
    await onReviewSuggestion(id, approved);
    setActionNotice(
      approved
        ? `Bin "${binName}" approved and updated on product master!`
        : `Bin "${binName}" rejected.`
    );
    setTimeout(() => setActionNotice(null), 3000);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
            Auditor Bin Suggestions Queue
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Review suggested shelf locations submitted from mobile field counts before master catalog sync.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-blue-100 shadow-2xs">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition min-h-[38px] ${
                filter === tab
                  ? 'bg-[#1D5FD1] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-blue-100 p-12 text-center shadow-xs">
          <PackageSearch className="w-12 h-12 text-blue-200 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-800">No Bin Suggestions in this Queue</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            When auditors encounter products without bins and suggest shelf locations, they appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const hasSimilar =
              item.similarExistingBins && item.similarExistingBins.length > 0;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-blue-100 p-5 shadow-xs hover:shadow-md transition space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold bg-blue-50 text-[#0B3D91] px-2.5 py-1 rounded-md border border-blue-200">
                      Suggested Bin: {item.suggestedBin}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        item.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 leading-snug">
                    {item.productName}
                  </h4>

                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.auditorName}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {new Date(item.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </span>
                  </div>

                  {/* Warning: "Similar name exists" required by prompt! */}
                  {hasSimilar && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-[11px]">Similar Bin Name Warning</p>
                        <p className="text-[11px] text-amber-800">
                          Existing bins: <strong>{item.similarExistingBins?.join(', ')}</strong>. Check for typographical duplication.
                        </p>
                      </div>
                    </div>
                  )}

                  {item.reviewNote && (
                    <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded-lg mt-2">
                      Note: {item.reviewNote}
                    </p>
                  )}
                </div>

                {item.status === 'pending' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleReview(item.id, false, item.suggestedBin)}
                      className="flex-1 py-2 px-3 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 font-bold text-xs transition flex items-center justify-center gap-1 min-h-[42px]"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReview(item.id, true, item.suggestedBin)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-1 shadow-xs min-h-[42px]"
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Approve</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
