import React from 'react';
import { CheckCircle2, Clock, RotateCcw, AlertCircle, SkipForward } from 'lucide-react';
import type { ItemStatus } from '../../types';

interface StatusChipProps {
  status: ItemStatus;
  size?: 'sm' | 'md';
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, size = 'md' }) => {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  switch (status) {
    case 'approved':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 ${sizeClass}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Approved</span>
        </span>
      );

    case 'awaiting_approval':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-300 ${sizeClass}`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Awaiting approval</span>
        </span>
      );

    case 'recount':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-amber-100 text-amber-900 border border-amber-400 ${sizeClass}`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span>Recount</span>
        </span>
      );

    case 'skipped':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-purple-50 text-purple-800 border border-purple-200 ${sizeClass}`}
        >
          <SkipForward className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <span>Skipped</span>
        </span>
      );

    case 'not_started':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200 ${sizeClass}`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Not started</span>
        </span>
      );
  }
};
