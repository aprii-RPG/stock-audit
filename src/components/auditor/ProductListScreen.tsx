import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import {
  Search,
  ScanBarcode,
  Layers,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Building,
  ChevronLeft,
} from 'lucide-react';
import type { Audit, AuditItem } from '../../types';
import { StatusChip } from '../common/StatusChip';

const ITEMS_PER_PAGE = 50;

interface ProductListScreenProps {
  audit: Audit;
  items: AuditItem[];
  selectedItem: AuditItem | null;
  onSelectItem: (item: AuditItem) => void;
  onOpenScanner: () => void;
  onBackToAudits: () => void;
  isTabletSplit?: boolean;
}

export const ProductListScreen: React.FC<ProductListScreenProps> = ({
  audit,
  items,
  selectedItem,
  onSelectItem,
  onOpenScanner,
  onBackToAudits,
  isTabletSplit = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChip, setFilterChip] = useState<'All' | 'Pending' | 'Recount' | 'Done'>('All');
  const [packFilter, setPackFilter] = useState<'ALL' | 'TAB' | 'CAP' | 'ML'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filter items based on search and status filter chips
  const filteredItems = useMemo(() => {
    const q = deferredSearchQuery.toLowerCase().trim();
    return items.filter((item) => {
      // Search matching: name, company, pack, barcode, bin
      const matchesSearch =
        !q ||
        item.product.name.toLowerCase().includes(q) ||
        item.product.company.toLowerCase().includes(q) ||
        item.product.barcode.includes(q) ||
        item.product.pack.toLowerCase().includes(q) ||
        (item.bin && item.bin.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      const pack = item.product.pack;
      const matchesPack =
        packFilter === 'ALL' ||
        (packFilter === 'TAB' && /(?:^|[^a-z])(?:tabs?|tablets?)(?:$|[^a-z])/i.test(pack)) ||
        (packFilter === 'CAP' && /(?:^|[^a-z])(?:caps?|capsules?)(?:$|[^a-z])/i.test(pack)) ||
        (packFilter === 'ML' && /(?:^|[^a-z])ml(?:$|[^a-z])/i.test(pack));
      if (!matchesPack) return false;

      if (filterChip === 'All') return true;
      if (filterChip === 'Pending') {
        return item.status === 'not_started' || item.status === 'awaiting_approval';
      }
      if (filterChip === 'Recount') {
        return item.status === 'recount';
      }
      if (filterChip === 'Done') {
        return item.status === 'approved' || item.status === 'skipped';
      }

      return true;
    });
  }, [items, deferredSearchQuery, filterChip, packFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const visibleItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [audit.id, deferredSearchQuery, filterChip, packFilter]);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  // Counts for filter chips
  const counts = useMemo(() => {
    return {
      all: items.length,
      pending: items.filter((i) => i.status === 'not_started' || i.status === 'awaiting_approval').length,
      recount: items.filter((i) => i.status === 'recount').length,
      done: items.filter((i) => i.status === 'approved' || i.status === 'skipped').length,
    };
  }, [items]);

  return (
    <div className="flex flex-col h-full bg-[#F7FAFF] pb-16 sm:pb-0">
      {/* Header Bar */}
      <div className="p-3 sm:p-4 bg-white border-b border-blue-100 shadow-2xs">
        {!isTabletSplit && (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={onBackToAudits}
              className="p-2 -ml-1 text-slate-600 hover:text-[#0B3D91] hover:bg-blue-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition"
              aria-label="Back to Audits"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-black text-[#0B3D91] truncate tracking-tight">
                {audit.name}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                Snapshot locked at {audit.snapshotLockedAt} • Cutoff {audit.cutoffBillNo}
              </p>
            </div>
          </div>
        )}

        {/* Search Bar + Barcode Scan Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicine, company, bin, barcode..."
              className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-blue-200 bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] focus:border-transparent min-h-[44px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 px-1 py-1"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={onOpenScanner}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1D5FD1] hover:bg-[#0B3D91] text-white font-bold text-xs sm:text-sm shadow-xs transition shrink-0 min-h-[44px] active:scale-95"
            title="Scan Medicine Barcode"
          >
            <ScanBarcode className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Scan Barcode</span>
            <span className="sm:hidden">Scan</span>
          </button>
        </div>

        {/* Filter Chips: All, Pending, Recount, Done */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setFilterChip('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1 min-h-[38px] ${
              filterChip === 'All'
                ? 'bg-[#0B3D91] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-blue-200 hover:bg-blue-50'
            }`}
          >
            <span>All</span>
            <span className="opacity-80">({counts.all})</span>
          </button>

          <button
            onClick={() => setFilterChip('Pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1 min-h-[38px] ${
              filterChip === 'Pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-amber-800 border border-amber-300 hover:bg-amber-50'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Pending</span>
            <span>({counts.pending})</span>
          </button>

          <button
            onClick={() => setFilterChip('Recount')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1 min-h-[38px] ${
              filterChip === 'Recount'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-amber-900 border border-amber-400 hover:bg-amber-50'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Recount</span>
            <span>({counts.recount})</span>
          </button>

          <button
            onClick={() => setFilterChip('Done')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1 min-h-[38px] ${
              filterChip === 'Done'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Done</span>
            <span>({counts.done})</span>
          </button>
        </div>

        <label className="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-600">
          <Filter className="w-3.5 h-3.5 shrink-0 text-[#0B3D91]" />
          <span>Pack</span>
          <select
            value={packFilter}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'ALL' || value === 'TAB' || value === 'CAP' || value === 'ML') {
                setPackFilter(value);
              }
            }}
            className="min-h-[38px] flex-1 rounded-lg border border-blue-200 bg-white px-2.5 text-xs font-semibold text-slate-700"
            aria-label="Filter products by pack type"
          >
            <option value="ALL">All packs</option>
            <option value="TAB">TAB</option>
            <option value="CAP">CAP</option>
            <option value="ML">ML</option>
          </select>
        </label>
      </div>

      {/* Product List Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white rounded-2xl border border-blue-100 mt-2">
              <Layers className="w-10 h-10 text-blue-200 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">No products found</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Try adjusting your search query or filter chip.
              </p>
            </div>
          ) : (
            visibleItems.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const hasBin = Boolean(item.bin && item.bin.trim().length > 0);

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer select-none min-h-[58px] ${
                    isSelected
                      ? 'bg-blue-50/80 border-[#1D5FD1] ring-2 ring-blue-400/40 shadow-xs'
                      : 'bg-white border-blue-100/90 hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* Row 1: Product Name & Pack */}
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <h4 className="text-sm font-bold text-slate-900 leading-snug">
                          {item.product.name}
                        </h4>
                        <span className="text-xs text-slate-500 font-medium">
                          ({item.product.pack})
                        </span>
                      </div>

                      {/* Row 2: Company & Bin */}
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="text-slate-600 font-medium truncate max-w-[180px]">
                          {item.product.company}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span
                          className={`font-semibold px-1.5 py-0.5 rounded text-[11px] ${
                            hasBin
                              ? 'bg-blue-50 text-[#0B3D91] border border-blue-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {hasBin ? `Bin: ${item.bin}` : 'No bin'}
                        </span>
                      </div>
                    </div>

                    {/* Status Chip */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusChip status={item.status} size="sm" />
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {filteredItems.length > 0 && (
          <div className="mx-3 mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-600">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                aria-label="Previous product page"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-blue-200 px-2.5 text-xs font-bold text-[#0B3D91] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="text-xs font-semibold text-slate-600">
                {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                disabled={currentPage >= pageCount}
                aria-label="Next product page"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-blue-200 px-2.5 text-xs font-bold text-[#0B3D91] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
