import React, { useState } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Clock,
  User,
  Layers,
  FileText,
} from 'lucide-react';
import type { AuditLogEntry } from '../../types';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !search ||
      log.details.toLowerCase().includes(search.toLowerCase()) ||
      log.userName.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (log.productName && log.productName.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;

    return true;
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-[#0B3D91] tracking-tight">
          System Audit Trail &amp; Regulatory Log
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 font-medium">
          Immutable chronological ledger recording every count, photo verification, recount, and approval.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-blue-100 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit trail by person, medicine, or description..."
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 min-h-[44px]"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[44px]"
        >
          <option value="ALL">All Actions ({logs.length})</option>
          {uniqueActions.map((action) => (
            <option key={action} value={action}>
              {action.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Log Entries Table */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#F7FAFF] text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-blue-100">
              <tr>
                <th className="py-3 px-4 min-w-[150px]">Timestamp</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredLogs.map((log) => {
                const date = new Date(log.timestamp);
                const formattedTime = date.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });
                const formattedDate = date.toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <tr key={log.id} className="hover:bg-blue-50/30 transition">
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-mono font-bold text-slate-900 block">{formattedTime}</span>
                        <span className="text-[11px] text-slate-400">{formattedDate}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-slate-900">{log.userName}</span>
                        <span className="block text-[10px] text-blue-700 font-semibold uppercase tracking-wider">
                          {log.userRole}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-[#0B3D91] border border-blue-200">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="text-slate-800 text-xs sm:text-sm">{log.details}</p>
                      {log.productName && (
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          Medicine: {log.productName}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
