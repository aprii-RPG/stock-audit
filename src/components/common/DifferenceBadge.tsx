import React from 'react';
import { ArrowUp, ArrowDown, Check } from 'lucide-react';

interface DifferenceBadgeProps {
  difference: number;
  showZero?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const DifferenceBadge: React.FC<DifferenceBadgeProps> = ({
  difference,
  showZero = true,
  size = 'md',
}) => {
  if (difference === 0) {
    if (!showZero) return null;
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <Check className="w-3.5 h-3.5 text-slate-500" />
        <span>Exact Match (0)</span>
      </span>
    );
  }

  const isExcess = difference > 0;
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5 font-bold',
  }[size];

  if (isExcess) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs ${sizeClasses}`}
      >
        <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>▲ Excess (+{difference})</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs ${sizeClasses}`}
    >
      <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
      <span>▼ Short ({difference})</span>
    </span>
  );
};
