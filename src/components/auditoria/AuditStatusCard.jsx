import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

const statusStyles = {
  green: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    label: 'Consistente',
  },
  yellow: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-950',
    label: 'Requer conferência',
  },
  red: {
    icon: XCircle,
    className: 'border-red-200 bg-red-50 text-red-950',
    label: 'Crítico',
  },
  info: {
    icon: Info,
    className: 'border-slate-200 bg-slate-50 text-slate-900',
    label: 'Informativo',
  },
};

export default function AuditStatusCard({ title, value, helper, status = 'info' }) {
  const config = statusStyles[status] || statusStyles.info;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border p-4 ${config.className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</p>
        <Icon className="w-4 h-4 flex-shrink-0" />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      {helper && <p className="mt-1 text-xs opacity-80">{helper}</p>}
    </div>
  );
}
