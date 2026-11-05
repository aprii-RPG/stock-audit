import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  Shield,
  AlertCircle,
  Check,
  Building2,
  ChevronDown,
} from 'lucide-react';
import type { Store, User } from '../../types';
import { api } from '../../services/api';

interface LoginScreenProps {
  stores?: Store[];
  onLoginSuccess: (user: User, selectedBranchId?: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ stores: initialStores, onLoginSuccess }) => {
  const [stores, setStores] = useState<Store[]>(initialStores || []);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    initialStores && initialStores.length > 0 ? initialStores[0].id : ''
  );
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If stores were not passed or empty, load from API
  useEffect(() => {
    if (!initialStores || initialStores.length === 0) {
      api.getStores().then((loadedStores) => {
        setStores(loadedStores);
        if (loadedStores.length > 0 && !selectedBranchId) {
          setSelectedBranchId(loadedStores[0].id);
        }
      });
    } else {
      setStores(initialStores);
      if (!selectedBranchId && initialStores.length > 0) {
        setSelectedBranchId(initialStores[0].id);
      }
    }
  }, [initialStores]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedBranchId) {
      setError('Please select a branch to sign in.');
      return;
    }

    if (!loginId.trim()) {
      setError('Please enter your Login ID.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.login(loginId, password, selectedBranchId);
      if (res.success && res.user) {
        onLoginSuccess(res.user, selectedBranchId);
      } else {
        setError(res.error || 'Authentication failed. Please check credentials or branch access.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentBranch = stores.find((s) => s.id === selectedBranchId);

  return (
    <div className="min-h-screen bg-[#F7FAFF] flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#1D5FD1] to-[#0B3D91] shadow-xl shadow-blue-500/20 mb-3 text-white">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0B3D91] tracking-tight">
            Stock Audit
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            Multi-Store Medicine Inventory Audit System
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-blue-100 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Branch Sign In</h2>
          <p className="text-xs text-slate-500 mb-5">
            Select your assigned store branch and enter your employee credentials.
          </p>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            {/* 1. Branch Name Dropdown */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Branch Name
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-blue-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setError(null);
                  }}
                  required
                  className="w-full appearance-none pl-10 pr-10 py-3 text-xs sm:text-sm font-semibold rounded-xl border border-blue-200 bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] focus:border-transparent min-h-[44px] cursor-pointer text-slate-800"
                >
                  {stores.length === 0 ? (
                    <option value="">Loading branches...</option>
                  ) : (
                    stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) - {s.city}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {currentBranch && (
                <p className="text-[11px] text-slate-500 mt-1 font-medium pl-1">
                  Location: <span className="text-slate-700">{currentBranch.address}</span> (Geofence: {currentBranch.geofenceRadiusMeters}m)
                </p>
              )}
            </div>

            {/* 2. Login ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Login ID
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoComplete="off"
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value);
                    setError(null);
                  }}
                  placeholder="Employee ID or email"
                  required
                  className="w-full pl-10 pr-3.5 py-3 text-xs sm:text-sm font-medium rounded-xl border border-blue-200 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] focus:border-transparent min-h-[44px]"
                />
              </div>
            </div>

            {/* 3. Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-12 py-3 text-xs sm:text-sm font-medium rounded-xl border border-blue-200 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1D5FD1] focus:border-transparent min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checkbox & Forgot Password */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="w-4 h-4 rounded text-[#1D5FD1] border-slate-300 focus:ring-[#1D5FD1]"
                />
                <span className="text-xs text-slate-600 font-medium">Keep me signed in</span>
              </label>

              <button
                type="button"
                onClick={() => alert('Please contact your system administrator to reset your password.')}
                className="text-xs text-[#1D5FD1] font-semibold hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-[#1D5FD1] hover:bg-[#0B3D91] text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-98 transition flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
            >
              {isLoading ? (
                <span>Verifying credentials...</span>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

        </div>

        {/* Security badge */}
        <p className="text-center text-[11px] text-slate-400 mt-6 font-medium">
          Protected by GPS Geofenced Verification & Cutoff Snapshot Lock
        </p>
      </div>
    </div>
  );
};
