import React from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, Wallet, BarChart3, CalendarDays, MapPin } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

const MONTH_ORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtInt(value) {
  return toInt(value).toLocaleString('pt-BR');
}

function formatKpiValue(value) {
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  return value;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDateBR(date) {
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function getProgramacaoDate(item) {
  const raw =
    item?.data_realizacao ||
    item?.data_programacao ||
    item?.data_inicio ||
    item?.data ||
    item?.inicio ||
    '';

  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const br = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getProgramacaoTitle(item) {
  return (
    item?.nome_acao ||
    item?.titulo ||
    item?.atividade ||
    item?.nome ||
    item?.evento ||
    'Atividade programada'
  );
}

function getProgramacaoMuseu(item) {
  return (
    item?.museu ||
    item?.centro_custo ||
    item?.local_museu ||
    item?.equipamento ||
    item?.local ||
    'Museus Centro'
  );
}

function MiniBar({ label, value, max, color = 'bg-primary' }) {
  const safeValue = toInt(value);
  const safeMax = Math.max(toInt(max), 1);
  const pct = Math.min((safeValue / safeMax) * 100, 100);

  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span className="truncate max-w-[60%]">{label}</span>
        <span className="font-semibold text-foreground">{fmtInt(safeValue)}</span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CardSection({ title, children, empty, className = '' }) {
  return (
    <div className={`border border-border rounded-2xl p-4 bg-card shadow-sm ${className}`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      {empty ? (
        <p className="text-xs text-muted-foreground">Sem dados disponíveis</p>
      ) : children}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, highlight = false, helper }) {
  return (
    <div className={`p-5 border rounded-2xl transition-all shadow-sm min-w-0 ${
      highlight
        ? 'border-primary bg-primary text-primary-foreground shadow-md'
        : 'border-border bg-card hover:shadow-md'
    }`}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {Icon && <Icon className={`w-5 h-5 flex-shrink-0 ${highlight ? 'text-primary-foreground' : 'text-muted-foreground'}`} />}
        <span className={`text-sm font-semibold uppercase tracking-wide truncate ${highlight ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>
          {label}
        </span>
      </div>
      <div className={`text-3xl font-bold leading-tight break-words tabular-nums ${highlight ? 'text-primary-foreground' : 'text-foreground'}`}>
        {formatKpiValue(value)}
      </div>
      {helper && (
        <p className={`text-base font-medium mt-1 truncate ${highlight ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {helper}
        </p>
      )}
    </div>
  );
}

function AgendaKpiCard({ agendaItems = [], agendaDate, agendaIndex }) {
  const current = agendaItems.length > 0 ? agendaItems[agendaIndex % agendaItems.length] : null;
  const hoje = new Date();
  const isHoje = agendaDate && sameDay(agendaDate, hoje);

  return (
    <div className="p-5 border border-border rounded-2xl transition-all shadow-sm min-w-0 bg-card hover:shadow-md">
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <CalendarDays className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold uppercase tracking-wide truncate text-muted-foreground">
          {isHoje ? 'Agenda de hoje' : 'Próxima agenda'}
        </span>
      </div>

      {current ? (
        <>
          <p className="text-3xl font-bold leading-tight truncate text-foreground">
            {formatDateBR(agendaDate)}
          </p>
          <p className="text-base font-medium mt-1 truncate text-muted-foreground">
            {getProgramacaoTitle(current)}
          </p>
          <p className="text-base mt-1 truncate text-foreground font-semibold flex items-center gap-1">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            {getProgramacaoMuseu(current)}
          </p>

          {agendaItems.length > 1 && (
            <div className="flex items-center gap-1 mt-3">
              {agendaItems.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1 rounded-full transition-all ${
                    idx === agendaIndex % agendaItems.length ? 'w-5 bg-primary' : 'w-1.5 bg-muted'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-3xl font-bold leading-tight truncate text-foreground">—</p>
          <p className="text-base font-medium mt-1 truncate text-muted-foreground">sem atividade futura</p>
        </>
      )}
    </div>
  );
}

export default function ExecutiveIndicators({ reports = [], rubricas = [] }) {
  return (
    <div className="mt-8 space-y-5">
      <div className="flex justify-center">
        <div className="grid w-fit mx-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 justify-center">
        </div>
      </div>
    </div>
  );
}
