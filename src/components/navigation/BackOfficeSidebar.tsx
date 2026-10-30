import React from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Camera,
  CheckSquare,
  FileSpreadsheet,
  BarChart3,
  Settings,
  FolderSync,
  History,
  ShieldCheck,
  PackageSearch,
} from 'lucide-react';

export type BackOfficeTab =
  | 'dashboard'
  | 'audits'
  | 'photo_approval'
  | 'approvals'
  | 'erp_adjustments'
  | 'bin_suggestions'
  | 'product_history'
  | 'reports'
  | 'audit_log'
  | 'settings';

interface BackOfficeSidebarProps {
  currentTab: BackOfficeTab;
  onSelectTab: (tab: BackOfficeTab) => void;
  pendingPhotosCount: number;
  pendingApprovalsCount: number;
  pendingBinsCount: number;
}

export const BackOfficeSidebar: React.FC<BackOfficeSidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingPhotosCount,
  pendingApprovalsCount,
  pendingBinsCount,
}) => {
  const menuItems = [
    {
      id: 'dashboard' as BackOfficeTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'audits' as BackOfficeTab,
      label: 'Audits & Review',
      icon: ClipboardList,
      badge: null,
    },
    {
      id: 'photo_approval' as BackOfficeTab,
      label: 'Photo Approval',
      icon: Camera,
      badge: pendingPhotosCount > 0 ? pendingPhotosCount : null,
      badgeColor: 'bg-amber-400 text-slate-900',
    },
    {
      id: 'approvals' as BackOfficeTab,
      label: 'Approvals & Tiers',
      icon: CheckSquare,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'erp_adjustments' as BackOfficeTab,
      label: 'ERP Adjustments',
      icon: FolderSync,
      badge: null,
    },
    {
      id: 'bin_suggestions' as BackOfficeTab,
      label: 'Bin Suggestions',
      icon: PackageSearch,
      badge: pendingBinsCount > 0 ? pendingBinsCount : null,
      badgeColor: 'bg-blue-400 text-slate-950',
    },
    {
      id: 'product_history' as BackOfficeTab,
      label: 'Product History',
      icon: History,
      badge: null,
    },
    {
      id: 'reports' as BackOfficeTab,
      label: 'Reports & Export',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'audit_log' as BackOfficeTab,
      label: 'Audit Log',
      icon: ShieldCheck,
      badge: null,
    },
    {
      id: 'settings' as BackOfficeTab,
      label: 'Settings & Admin',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <aside className="w-64 bg-[#0B3D91] text-white flex-col shrink-0 border-r border-blue-900 hidden lg:flex select-none">
      <div className="p-4 border-b border-blue-900/60">
        <p className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">
          Management Console
        </p>
      </div>

      <nav className="p-3 space-y-1 overflow-y-auto flex-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition min-h-[44px] ${
                isActive
                  ? 'bg-[#1D5FD1] text-white shadow-md'
                  : 'text-blue-100 hover:bg-blue-900/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-300'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && (
                <span
                  className={`px-2 py-0.5 text-[11px] font-black rounded-full ${
                    item.badgeColor || 'bg-blue-500 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer System Status Info */}
      <div className="p-3.5 m-3 rounded-xl bg-blue-950/60 border border-blue-800/60 text-xs">
        <div className="flex items-center justify-between text-blue-300 mb-1">
          <span className="font-semibold">Cutoff Guard</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
        </div>
        <p className="text-[11px] text-blue-200/80">
          Reconciles live billing post-cutoff with physical counts.
        </p>
      </div>
    </aside>
  );
};
