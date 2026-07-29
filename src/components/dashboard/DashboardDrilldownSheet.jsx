import React from 'react';
import { X, FileText, BarChart3, ShoppingCart, CalendarDays, ExternalLink } from 'lucide-react';

const FONTE_CONFIG = {
  relatorios:  { label: 'Relatórios',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  rubricas:    { label: 'Rubricas',    color: 'bg-green-100 text-green-700 border-green-200' },
  compras:     { label: 'Compras',     color: 'bg-purple-100 text-purple-700 border-purple-200' },
  programacao: { label: 'Programação', color: 'bg-orange-100 text-orange-700 border-orange-200' },
};

function FonteBadge({ tipo }) {
  const cfg = FONTE_CONFIG[tipo] || { label: tipo, color: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

/**
 * DashboardDrilldownSheet
 * Painel lateral de origem dos dados dos cards do dashboard.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   title: string          — título do card
 *   value: string          — valor exibido no card
 *   fontes: string[]       — ex: ['relatorios','rubricas']
 *   children: ReactNode    — conteúdo do painel
 *   footerAction?: ReactNode — botão de ação opcional no rodapé
 */
export default function DashboardDrilldownSheet({ open, onClose, title, value, fontes = [], children, footerAction }) {
  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Sheet lateral */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl border-l border-slate-200 w-full md:w-[600px] max-w-full"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabeçalho fixo */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 bg-white">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Origem dos dados</p>
            <h3 className="text-lg font-bold text-slate-900 leading-snug truncate">{title}</h3>
            {value && (
              <p className="mt-1 text-2xl font-black text-slate-800 tabular-nums">{value}</p>
            )}
            {fontes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {fontes.map(f => <FonteBadge key={f} tipo={f} />)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-lg border border-slate-200 p-2 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4 text-slate-600" />
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {children}
        </div>

        {/* Rodapé fixo (opcional) */}
        {footerAction && (
          <div className="border-t border-slate-100 px-5 py-3 bg-white flex justify-end gap-3">
            {footerAction}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Helpers reutilizáveis nos painéis ───────────────────────────────────────

export function SectionTitle({ children }) {
  return (
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{children}</p>
  );
}

export function RowItem({ label, sub, value, badge }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{label}</p>
        {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {badge && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">{badge}</span>
        )}
        {value && <span className="text-sm font-bold text-slate-900 tabular-nums">{value}</span>}
      </div>
    </div>
  );
}

export function MuseuBreakdown({ porMuseu }) {
  const entries = Object.entries(porMuseu || {}).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([museu, count]) => (
        <div key={museu} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2">
          <span className="text-xs font-semibold text-slate-600">{museu}</span>
          <span className="text-sm font-bold text-slate-900">{count}</span>
        </div>
      ))}
    </div>
  );
}

export function RubricaRow({ rubrica, previsto, utilizado, pct }) {
  const barColor = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 30 ? 'bg-yellow-400' : 'bg-red-400';
  const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{rubrica}</p>
        <span className="text-xs font-bold text-slate-700 flex-shrink-0">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-[11px] text-slate-500">
        {fmtBRL(utilizado)} utilizado de {fmtBRL(previsto)}
      </p>
    </div>
  );
}