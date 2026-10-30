import React, { useState } from 'react';
import {
  Building2,
  User as UserIcon,
  LogOut,
  ChevronDown,
  RefreshCw,
  Shield,
  Layers,
  Sparkles,
  Smartphone,
  LayoutDashboard,
} from 'lucide-react';
import type { Store, User } from '../../types';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface TopBarProps {
  currentUser: User | null;
  allUsers: User[];
  stores: Store[];
  selectedStoreId: string;
  onSelectStore: (storeId: string) => void;
  onSwitchUser: (user: User) => void;
  onLogout: () => void;
  unsyncedCount: number;
  onSync: () => void;
  isSyncing: boolean;
  auditorViewActive: boolean;
  onToggleAuditorBackOffice?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentUser,
  allUsers,
  stores,
  selectedStoreId,
  onSelectStore,
  onSwitchUser,
  onLogout,
  unsyncedCount,
  onSync,
  isSyncing,
  auditorViewActive,
  onToggleAuditorBackOffice,
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Filter stores accessible to current user
  const accessibleStores = stores.filter(
    (s) => currentUser?.role !== 'auditor' || currentUser.assignedStoreIds.includes(s.id)
  );

  return (
    <header className="sticky top-0 z-30 bg-[#0B3D91] text-white shadow-md border-b border-blue-900/40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand & Mobile App Mode indicator */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1D5FD1] to-blue-400 p-0.5 shadow-md flex items-center justify-center shrink-0">
            <div className="w-full h-full rounded-[10px] bg-[#0B3D91] flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-none text-white">
                Stock Audit
              </h1>
              <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-blue-800 text-blue-200 border border-blue-700">
                Pharma
              </span>
            </div>
            <p className="text-[11px] text-blue-200 font-medium leading-tight">
              {currentUser?.role === 'auditor' ? 'Auditor Field Mode' : 'Back-Office Portal'}
            </p>
          </div>
        </div>

        {/* Center: Store Selector */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Building2 className="w-4 h-4 text-blue-300 absolute left-2.5 pointer-events-none hidden sm:block" />
            <select
              value={selectedStoreId}
              onChange={(e) => onSelectStore(e.target.value)}
              className="bg-blue-950/70 text-white text-xs sm:text-sm font-medium pl-2.5 sm:pl-8 pr-7 py-2 rounded-lg border border-blue-700/60 focus:outline-hidden focus:ring-2 focus:ring-blue-400 cursor-pointer min-h-[40px]"
            >
              {currentUser?.role !== 'auditor' && <option value="ALL">All Stores (Overview)</option>}
              {accessibleStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-blue-300 absolute right-2 pointer-events-none" />
          </div>

          {/* Quick toggle between Auditor View and Back Office View if user has BO or Admin role */}
          {currentUser && currentUser.role !== 'auditor' && onToggleAuditorBackOffice && (
            <button
              onClick={onToggleAuditorBackOffice}
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition min-h-[38px] ${
                auditorViewActive
                  ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-sm'
                  : 'bg-blue-900/60 text-blue-100 border-blue-700 hover:bg-blue-800/80'
              }`}
              title="Switch between Auditor mobile view and Back-Office desktop view"
            >
              {auditorViewActive ? (
                <>
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Switch to Back Office</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-amber-300" />
                  <span>Preview Auditor View</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right: Sync Status, PWA Install & User profile dropdown */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Unsynced Badge / Sync trigger */}
          {unsyncedCount > 0 && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-xs min-h-[38px] active:scale-95"
              title="Click to sync offline counts"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync ({unsyncedCount})</span>
              <span className="sm:hidden">{unsyncedCount}</span>
            </button>
          )}

          <div className="hidden lg:block">
            <PWAInstallButton compact />
          </div>

          {/* User Profile & Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-900/80 hover:bg-blue-800 border border-blue-700/70 transition min-h-[40px] text-left"
            >
              <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser?.name.charAt(0) || 'U'}
              </div>
              <div className="hidden xl:block">
                <p className="text-xs font-bold leading-tight text-white">{currentUser?.name}</p>
                <p className="text-[10px] text-blue-200 capitalize">{currentUser?.role}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-blue-300 ml-0.5" />
            </button>

            {userDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-xl bg-white text-slate-800 shadow-2xl border border-blue-100 p-2 z-50 animate-in fade-in slide-in-from-top-2"
                onClick={() => setUserDropdownOpen(false)}
              >
                <div className="p-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                      {currentUser?.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{currentUser?.name}</p>
                      <p className="text-xs text-slate-500">{currentUser?.email}</p>
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-[#0B3D91]">
                        {currentUser?.role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Role Switcher for seamless testing */}
                <div className="p-2 border-b border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Quick Switch Profile</span>
                  </p>
                  <div className="space-y-1">
                    {allUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => onSwitchUser(u)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition text-left min-h-[38px] ${
                          currentUser?.id === u.id
                            ? 'bg-blue-50 text-[#1D5FD1] font-bold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <span>{u.name}</span>
                          <span className="block text-[10px] text-slate-400 capitalize">{u.role}</span>
                        </div>
                        {currentUser?.id === u.id && (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-100/60 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-1">
                  <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition min-h-[40px]"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
