import React, { useState } from 'react';
import {
  Settings,
  Building,
  Users,
  Shield,
  Sliders,
  CheckCircle2,
  MapPin,
  Save,
  Plus,
} from 'lucide-react';
import type { Store, SystemSettings, User, UserRole } from '../../types';

interface AdminSettingsViewProps {
  stores: Store[];
  users: User[];
  settings: SystemSettings;
  onUpdateSettings: (settings: SystemSettings) => Promise<void>;
  onSaveStore: (store: Store) => Promise<void>;
  onSaveUser: (user: User) => Promise<void>;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  stores,
  users,
  settings,
  onUpdateSettings,
  onSaveStore,
  onSaveUser,
}) => {
  const [activeTab, setActiveTab] = useState<'tolerance' | 'stores' | 'users' | 'reasons'>('tolerance');

  // Form states for Settings
  const [toleranceUnits, setToleranceUnits] = useState(settings.autoApproveToleranceUnits);
  const [toleranceValue, setToleranceValue] = useState(settings.autoApproveToleranceValue);
  const [storeManagerThreshold, setStoreManagerThreshold] = useState(settings.storeManagerApprovalThreshold);
  const [hoThreshold, setHoThreshold] = useState(settings.hoApprovalThreshold);
  const [defaultGeofence, setDefaultGeofence] = useState(settings.defaultGeofenceRadiusMeters);

  const [savingNotice, setSavingNotice] = useState<string | null>(null);

  // Edit Store State
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeGeofenceInput, setStoreGeofenceInput] = useState<number>(150);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings({
      ...settings,
      autoApproveToleranceUnits: Number(toleranceUnits),
      autoApproveToleranceValue: Number(toleranceValue),
      storeManagerApprovalThreshold: Number(storeManagerThreshold),
      hoApprovalThreshold: Number(hoThreshold),
      defaultGeofenceRadiusMeters: Number(defaultGeofence),
    });
    setSavingNotice('Tolerance thresholds and financial approval tiers updated successfully!');
    setTimeout(() => setSavingNotice(null), 3000);
  };

  const handleUpdateStoreGeofence = async (store: Store) => {
    await onSaveStore({
      ...store,
      geofenceRadiusMeters: storeGeofenceInput,
    });
    setEditingStore(null);
    setSavingNotice(`Geofence radius for "${store.name}" updated to ${storeGeofenceInput}m!`);
    setTimeout(() => setSavingNotice(null), 3000);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
          System Administration &amp; Master Configuration
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 font-medium">
          Manage store geofences, user roles, store access permissions, tolerance engines, and reason codes.
        </p>
      </div>

      {savingNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savingNotice}</span>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 pb-2">
        <button
          onClick={() => setActiveTab('tolerance')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeTab === 'tolerance'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Tolerance &amp; Value Thresholds
        </button>

        <button
          onClick={() => setActiveTab('stores')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeTab === 'stores'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Stores &amp; GPS Geofences ({stores.length})
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeTab === 'users'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Users, Roles &amp; Store Access ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('reasons')}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[42px] ${
            activeTab === 'reasons'
              ? 'bg-[#0B3D91] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Investigation Reason Codes ({settings.reasons.length})
        </button>
      </div>

      {/* 1. Tolerance & Value Thresholds Form */}
      {activeTab === 'tolerance' && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-blue-100 p-6 shadow-sm space-y-6 max-w-2xl">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Auto-Approval Tolerances &amp; Value Tiers
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Differences within tolerance auto-approve; larger ones go to recount, then to approval by value tier (store manager or HO).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Auto-Approve Tolerance (Units)
              </label>
              <input
                type="number"
                min="0"
                value={toleranceUnits}
                onChange={(e) => setToleranceUnits(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-blue-200 min-h-[44px]"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Variances within ±{toleranceUnits} units bypass manual review.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Auto-Approve Tolerance Value ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={toleranceValue}
                onChange={(e) => setToleranceValue(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-blue-200 min-h-[44px]"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Discrepancy financial impact limit for auto-approval.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Store Manager Approval Tier Limit ($)
              </label>
              <input
                type="number"
                min="0"
                value={storeManagerThreshold}
                onChange={(e) => setStoreManagerThreshold(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-blue-200 min-h-[44px]"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Variances up to this dollar amount can be approved locally.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Head Office (HO) Escalation Limit ($)
              </label>
              <input
                type="number"
                min="0"
                value={hoThreshold}
                onChange={(e) => setHoThreshold(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-blue-200 min-h-[44px]"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Variances exceeding this amount trigger senior management alerts.
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#1D5FD1] hover:bg-[#0B3D91] text-white font-bold text-xs sm:text-sm shadow-xs transition flex items-center gap-2 min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>Save Tolerance Rules</span>
          </button>
        </form>
      )}

      {/* 2. Stores & Geofences */}
      {activeTab === 'stores' && (
        <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">Configured Store Branches</h3>
              <p className="text-xs text-slate-500">
                GPS coordinates and geofence radius in meters for auditor mobile photo enforcement.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stores.map((s) => (
              <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{s.name}</h4>
                    <p className="text-xs text-slate-500">{s.code} • {s.city}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#0B3D91]">
                    Active
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1 bg-white p-2.5 rounded-lg border border-slate-100">
                  <p className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-500" />
                    <span>Lat: {s.latitude}, Lng: {s.longitude}</span>
                  </p>
                  <p className="flex items-center gap-1 font-semibold text-slate-800">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Geofence Radius: {s.geofenceRadiusMeters} meters</span>
                  </p>
                </div>

                {editingStore?.id === s.id ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="50"
                        max="1000"
                        value={storeGeofenceInput}
                        onChange={(e) => setStoreGeofenceInput(Number(e.target.value))}
                        className="w-24 px-2 py-1 text-xs border rounded-lg font-mono"
                      />
                      <span className="text-xs text-slate-500">meters</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateStoreGeofence(s)}
                        className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingStore(null)}
                        className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingStore(s);
                      setStoreGeofenceInput(s.geofenceRadiusMeters);
                    }}
                    className="w-full py-2 px-3 text-xs font-semibold text-[#1D5FD1] bg-blue-50 hover:bg-blue-100 rounded-lg transition min-h-[36px]"
                  >
                    Edit Geofence Radius
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Users & Store Access */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900">User Roles &amp; Store Access Permissions</h3>
            <p className="text-xs text-slate-500">
              Auditors only see audits for assigned stores; Back Office &amp; Admin manage across all locations.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
                <tr>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Assigned Stores</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {users.map((u) => {
                  const assignedStoreNames = stores
                    .filter((s) => u.assignedStoreIds.includes(s.id))
                    .map((s) => s.name);

                  return (
                    <tr key={u.id} className="hover:bg-blue-50/30">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#0B3D91]">{u.employeeId}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{u.name}</td>
                      <td className="py-3.5 px-4 text-slate-600">{u.email}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-[#0B3D91]">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.role === 'auditor' ? (
                          <span className="text-xs text-slate-700">
                            {assignedStoreNames.join(', ') || 'No store assigned'}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700">
                            All Stores (Full Enterprise Access)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Reason Codes */}
      {activeTab === 'reasons' && (
        <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-black text-slate-900">Standardized Discrepancy Reason Codes</h3>
            <p className="text-xs text-slate-500">
              Taxonomy used for stock reconciliation loss write-offs and ERP journal posting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {settings.reasons.map((r) => (
              <div key={r.code} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="font-mono text-xs font-bold text-[#0B3D91] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {r.code}
                </span>
                <h4 className="text-sm font-bold text-slate-900 mt-2">{r.label}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
