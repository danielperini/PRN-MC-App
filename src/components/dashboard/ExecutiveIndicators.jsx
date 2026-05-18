import React from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, Wallet, BarChart3, CalendarDays, MapPin } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';

const MONTH_ORDER = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtInt(value) {
  return toInt(value).toLocaleString('pt-BR');
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
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getProgramacaoDate(item) {
  const raw = item?.data_realizacao || item?.data_programacao || item?.data_inicio || item?.data || item?.inicio || '';
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
  return item?.nome_acao || item?.titulo || item?.atividade || item?.nome || item?.evento || 'Atividade programada';
}

function getProgramacaoMuseu(item) {
  return item?.museu || item?.centro_custo || item?.local_museu || item?.equipamento || item?.local || 'Museus Centro';
}

function KpiCard({ label, value, icon: Icon, highlight = false, helper }) {
  return (
    <div className={`p-5 border rounded-2xl transition-all shadow-sm min-w-[190px] ${highlight ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'border-border bg-card hover:shadow-md'}`}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {Icon && <Icon className={`w-5 h-5 flex-shrink-0 ${highlight ? 'text-primary-foreground' : 'text-muted-foreground'}`} />}
        <span className={`text-sm font-semibold uppercase tracking-wide truncate ${highlight ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>{label}</span>
      </div>
      <div className={`text-3xl font-bold leading-tight break-words tabular-nums ${highlight ? 'text-primary-foreground' : 'text-foreground'}`}>{value}</div>
      {helper && <p className={`text-base font-medium mt-1 truncate ${highlight ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{helper}</p>}
    </div>
  );
}

function AgendaKpiCard({ agendaItems = [], agendaDate, agendaIndex }) {
  const current = agendaItems.length > 0 ? agendaItems[agendaIndex % agendaItems.length] : null;
  const isHoje = agendaDate && sameDay(agendaDate, new Date());

  return (
    <div className="p-5 border border-border rounded-2xl transition-all shadow-sm min-w-[190px] bg-card hover:shadow-md">
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <CalendarDays className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold uppercase tracking-wide truncate text-muted-foreground">{isHoje ? 'Agenda de hoje' : 'Próxima agenda'}</span>
      </div>
      <p className="text-3xl font-bold leading-tight truncate text-foreground">{formatDateBR(agendaDate)}</p>
      <p className="text-base font-medium mt-1 truncate text-muted-foreground">{current ? getProgramacaoTitle(current) : 'sem atividade futura'}</p>
      {current && <p className="text-base mt-1 truncate text-foreground font-semibold flex items-center gap-1"><MapPin className="w-4 h-4 flex-shrink-0" />{getProgramacaoMuseu(current)}</p>}
    </div>
  );
}

function MiniBar({ label, value, max, color = 'bg-primary' }) {
  const safeValue = toInt(value);
  const pct = Math.min((safeValue / Math.max(toInt(max), 1)) * 100, 100);
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span className="truncate max-w-[60%]">{label}</span><span className="font-semibold text-foreground">{fmtInt(safeValue)}</span></div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden"><div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function CardSection({ title, children, empty, className = '' }) {
  return (
    <div className={`border border-border rounded-2xl p-4 bg-card shadow-sm ${className}`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      {empty ? <p className="text-xs text-muted-foreground">Sem dados disponíveis</p> : children}
    </div>
  );
}

export default function ExecutiveIndicators({ reports = [], rubricas = [] }) {
  const [atividadesPrevistasMes, setAtividadesPrevistasMes] = React.useState(0);
  const [agendaItems, setAgendaItems] = React.useState([]);
  const [agendaDate, setAgendaDate] = React.useState(null);
  const [agendaIndex, setAgendaIndex] = React.useState(0);
  const { user } = useCurrentUser();
  const isCoordenador = user?.role === 'COORDENADOR' || user?.base_role === 'COORDENADOR';
  const officialMetrics = React.useMemo(() => consolidateOfficialDashboardMetrics({ reports, rubricas }), [reports, rubricas]);

  React.useEffect(() => {
    let mounted = true;
    async function carregarProgramacao() {
      try {
        const hojeInicio = startOfDay(new Date());
        const mesAtual = new Date().getMonth();
        const anoAtual = new Date().getFullYear();
        const lista = await base44.entities.Programacao.list('-data_realizacao', 1000).catch(() => []);
        const ativos = (lista || []).filter((item) => !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(String(item?.status || item?.situacao || '').toUpperCase()));
        const totalMes = ativos.filter((item) => {
          const d = getProgramacaoDate(item);
          return d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
        }).length;
        const futuras = ativos.map((item) => ({ item, date: getProgramacaoDate(item) })).filter(({ date }) => date && startOfDay(date).getTime() >= hojeInicio.getTime()).sort((a, b) => startOfDay(a.date).getTime() - startOfDay(b.date).getTime());
        const targetDate = futuras[0]?.date || null;
        const itemsMesmoDia = targetDate ? futuras.filter(({ date }) => sameDay(date, targetDate)).map(({ item }) => item) : [];
        if (mounted) {
          setAtividadesPrevistasMes(totalMes);
          setAgendaDate(targetDate);
          setAgendaItems(itemsMesmoDia);
          setAgendaIndex(0);
        }
      } catch {
        if (mounted) {
          setAtividadesPrevistasMes(0);
          setAgendaDate(null);
          setAgendaItems([]);
          setAgendaIndex(0);
        }
      }
    }
    carregarProgramacao();
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    if (agendaItems.length <= 1) return undefined;
    const timer = window.setInterval(() => setAgendaIndex((prev) => (prev + 1) % agendaItems.length), 5000);
    return () => window.clearInterval(timer);
  }, [agendaItems.length]);

  const activitiesByMonth = React.useMemo(() => {
    return (officialMetrics.activities?.byMonth || []).map((item) => {
      const [, month] = String(item.key || '').split('-').map(Number);
      return {
        mes: month ? MONTH_ORDER[month - 1].slice(0, 3) : String(item.key || '—'),
        atividades: toInt(item.atividades),
        publico: toInt(item.publico),
      };
    });
  }, [officialMetrics]);

  const ultimoMes = activitiesByMonth[activitiesByMonth.length - 1] || { mes: '—', atividades: 0, publico: 0 };
  const maxAtiv = activitiesByMonth.length > 0 ? Math.max(...activitiesByMonth.map((m) => m.atividades), 1) : 1;
  const maxPub = activitiesByMonth.length > 0 ? Math.max(...activitiesByMonth.map((m) => m.publico), 1) : 1;
  const totalUtilizado = officialMetrics.financeiro?.totalUtilizado || 0;
  const percentual = officialMetrics.financeiro?.percentualExecucao || 0;
  const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Indicadores Executivos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Síntese operacional, agenda, museus e execução financeira.</p>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="grid w-fit mx-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 justify-center">
          <KpiCard label={`Atividades ${ultimoMes.mes}`} value={fmtInt(ultimoMes.atividades)} icon={Activity} highlight helper="relatórios aprovados" />
          <KpiCard label="Atividades previstas" value={fmtInt(atividadesPrevistasMes)} icon={CalendarDays} highlight helper="mês atual na agenda" />
          <AgendaKpiCard agendaItems={agendaItems} agendaDate={agendaDate} agendaIndex={agendaIndex} />
          {isCoordenador && <KpiCard label="Execução" value={`${percentual.toFixed(1)}%`} icon={BarChart3} helper="orçamento utilizado" />}
          {isCoordenador && <KpiCard label="Utilizado" value={fmtBRL(totalUtilizado)} icon={Wallet} helper="valor realizado" />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection title="Atividades por Mês" empty={activitiesByMonth.length === 0}>{activitiesByMonth.map((m) => <MiniBar key={m.mes} label={m.mes} value={m.atividades} max={maxAtiv} color="bg-primary" />)}</CardSection>
        <CardSection title="Público por Mês" empty={activitiesByMonth.length === 0}>{activitiesByMonth.map((m) => <MiniBar key={m.mes} label={m.mes} value={m.publico} max={maxPub} color="bg-chart-secondary" />)}</CardSection>
        <CardSection title="Comparativo por Museu" empty={false}>{MUSEUS.map((museu) => <MiniBar key={museu} label={museu} value={0} max={1} color="bg-muted" />)}</CardSection>
      </div>
    </div>
  );
}
