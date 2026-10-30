import React from 'react';
import { ClipboardList, PackageCheck, BarChart3, ScanLine } from 'lucide-react';

export type AuditorTab = 'audits' | 'products' | 'progress';

interface AuditorBottomNavProps {
  currentTab: AuditorTab;
  onSelectTab: (tab: AuditorTab) => void;
  hasActiveAudit: boolean;
  pendingCount: number;
}

export const AuditorBottomNav: React.FC<AuditorBottomNavProps> = ({
  currentTab,
  onSelectTab,
  hasActiveAudit,
  pendingCount,
}) => {
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-blue-200/80 shadow-lg flex items-center justify-around h-16 px-2 select-none">
      {/* 1. My Audits */}
      <button
        onClick={() => onSelectTab('audits')}
        className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition active:scale-95 ${
          currentTab === 'audits' ? 'text-[#1D5FD1] font-bold' : 'text-slate-500 font-medium'
        }`}
      >
        <ClipboardList className={`w-5 h-5 ${currentTab === 'audits' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[10px] mt-1">My Audits</span>
      </button>

      {/* 2. Product List & Blind Count */}
      <button
        onClick={() => onSelectTab('products')}
        disabled={!hasActiveAudit}
        className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] relative transition active:scale-95 ${
          !hasActiveAudit
            ? 'opacity-40 cursor-not-allowed text-slate-400'
            : currentTab === 'products'
            ? 'text-[#1D5FD1] font-bold'
            : 'text-slate-500 font-medium'
        }`}
      >
        <PackageCheck className={`w-5 h-5 ${currentTab === 'products' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[10px] mt-1">Products</span>
        {hasActiveAudit && pendingCount > 0 && (
          <span className="absolute top-2 right-1/4 w-2 h-2 rounded-full bg-amber-500" />
        )}
      </button>

      {/* 3. Progress & Submit */}
      <button
        onClick={() => onSelectTab('progress')}
        disabled={!hasActiveAudit}
        className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition active:scale-95 ${
          !hasActiveAudit
            ? 'opacity-40 cursor-not-allowed text-slate-400'
            : currentTab === 'progress'
            ? 'text-[#1D5FD1] font-bold'
            : 'text-slate-500 font-medium'
        }`}
      >
        <BarChart3 className={`w-5 h-5 ${currentTab === 'progress' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[10px] mt-1">Progress</span>
      </button>
    </nav>
  );
};
