import React from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, Wallet, BarChart3, CalendarDays, MapPin } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';
import { useNavigate } from 'react-router-dom';
import DashboardDrilldownSheet, { SectionTitle, RowItem, RubricaRow } from './DashboardDrilldownSheet';

const MONTH_ORDER = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtInt(value) {
  return toInt(value).toLocaleString('pt-BR');
}

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

function getReportMuseu(report) {
  const raw = (report.museu || '').toLowerCase();
  if (raw.includes('mhab') || raw.includes('abílio') || raw.includes('abilio')) return 'MHAB';
  if (raw.includes('mis') || raw.includes('imagem')) return 'MIS';
  if (raw.includes('mumo') || raw.includes('moda')) return 'MUMO';
  return report.museu || '—';
}

function getRubricaBudget(r) {
  return Number(r?.valor_rubrica || r?.valor_total || 0);
}
function getRubricaUsed(r) {
  return Number(r?.valor_utilizado || 0);
}

// ─── KpiCard clicável ─────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, highlight = false, helper, onClick }) {
  const base = 'p-5 border rounded-2xl transition-all shadow-sm min-w-[190px]';
  const active = highlight
    ? 'border-primary bg-primary text-primary-foreground shadow-md'
    : 'border-border bg-card hover:shadow-md';
  const clickable = onClick ? 'cursor-pointer hover:border-slate-400' : '';

  return (
    <div className={`${base} ${active} ${clickable}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {Icon && <Icon className={`w-5 h-5 flex-shrink-0 ${highlight ? 'text-primary-foreground' : 'text-muted-foreground'}`} />}
        <span className={`text-sm font-semibold uppercase tracking-wide truncate ${highlight ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>{label}</span>
      </div>
      <div className={`text-3xl font-bold leading-tight break-words tabular-nums ${highlight ? 'text-primary-foreground' : 'text-foreground'}`}>{value}</div>
      {helper && <p className={`text-base font-medium mt-1 truncate ${highlight ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{helper}</p>}
    </div>
  );
}

function AgendaKpiCard({ agendaItems = [], agendaDate, agendaIndex, onClick }) {
  const current = agendaItems.length > 0 ? agendaItems[agendaIndex % agendaItems.length] : null;
  const isHoje = agendaDate && sameDay(agendaDate, new Date());

  return (
    <div
      className="p-5 border border-border rounded-2xl transition-all shadow-sm min-w-[190px] bg-card hover:shadow-md hover:border-slate-400 cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
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
  const [openSheet, setOpenSheet] = React.useState(null); // 'atividades' | 'previstas' | 'agenda' | 'execucao' | 'participantes'
  const [atividadesPrevistasMes, setAtividadesPrevistasMes] = React.useState(0);
  const [programacaoItems, setProgramacaoItems] = React.useState([]);
  const [agendaItems, setAgendaItems] = React.useState([]);
  const [agendaDate, setAgendaDate] = React.useState(null);
  const [agendaIndex, setAgendaIndex] = React.useState(0);
  const { user } = useCurrentUser();
  const navigate = useNavigate();
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
        });
        const futuras = ativos.map((item) => ({ item, date: getProgramacaoDate(item) })).filter(({ date }) => date && startOfDay(date).getTime() >= hojeInicio.getTime()).sort((a, b) => startOfDay(a.date).getTime() - startOfDay(b.date).getTime());
        const targetDate = futuras[0]?.date || null;
        const itemsMesmoDia = targetDate ? futuras.filter(({ date }) => sameDay(date, targetDate)).map(({ item }) => item) : [];
        if (mounted) {
          setAtividadesPrevistasMes(totalMes.length);
          setProgramacaoItems(totalMes);
          setAgendaDate(targetDate);
          setAgendaItems(itemsMesmoDia);
          setAgendaIndex(0);
        }
      } catch {
        if (mounted) {
          setAtividadesPrevistasMes(0);
          setProgramacaoItems([]);
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

  // Drill-down: relatórios com atividades no último mês
  const resumoRelatoriosUltimoMes = React.useMemo(() => {
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();
    const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return reports
      .filter(r => {
        const idx = MESES.findIndex(m => m === r.mes_referencia);
        return idx === mesAtual && (r.ano || anoAtual) === anoAtual;
      })
      .map(r => ({
        autor: r.author_name || 'Profissional',
        museu: getReportMuseu(r),
        mes: r.mes_referencia || '—',
        ano: r.ano || '',
        status: r.status,
        atividades: (r.atividades || []).length,
        participantes: (r.atividades || []).reduce((s, a) => s + toInt(a.publico_total || a.publico_estimado || 0), 0),
        publicoGeral: toInt(r.publico_geral_declarado || 0),
      }))
      .sort((a, b) => b.atividades - a.atividades);
  }, [reports]);

  // Drill-down: rubricas agrupadas para execução orçamentária
  const rubricasResumo = React.useMemo(() => {
    return rubricas
      .filter(r => getRubricaBudget(r) > 0)
      .map(r => ({
        id: r.id,
        nome: r.rubrica || r.nome || r.descricao || 'Sem nome',
        grupo: r.grupo || '—',
        previsto: getRubricaBudget(r),
        utilizado: getRubricaUsed(r),
        pct: getRubricaBudget(r) > 0 ? Math.round((getRubricaUsed(r) / getRubricaBudget(r)) * 100) : 0,
        centro_custo: r.centro_custo || '—',
      }))
      .sort((a, b) => b.utilizado - a.utilizado)
      .slice(0, 30);
  }, [rubricas]);

  // Por museu: participantes e atividades
  const porMuseuResumo = React.useMemo(() => {
    const map = {};
    for (const r of reports) {
      const museu = getReportMuseu(r);
      if (!map[museu]) map[museu] = { participantes: 0, atividades: 0, relatorios: 0 };
      map[museu].relatorios++;
      map[museu].atividades += (r.atividades || []).length;
      map[museu].participantes += (r.atividades || []).reduce((s, a) => s + toInt(a.publico_total || a.publico_estimado || 0), 0);
    }
    return map;
  }, [reports]);

  const totalParticipantes = React.useMemo(() => {
    return reports.reduce((s, r) => {
      return s + (r.atividades || []).reduce((sa, a) => sa + toInt(a.publico_total || a.publico_estimado || 0), 0);
    }, 0);
  }, [reports]);

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Indicadores Executivos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Clique em qualquer card para ver a origem dos dados.</p>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="grid w-fit mx-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 justify-center">
          <KpiCard
            label={`Atividades ${ultimoMes.mes}`}
            value={fmtInt(ultimoMes.atividades)}
            icon={Activity}
            highlight
            helper="relatórios aprovados"
            onClick={() => setOpenSheet('atividades')}
          />
          <KpiCard
            label="Atividades previstas"
            value={fmtInt(atividadesPrevistasMes)}
            icon={CalendarDays}
            highlight
            helper="mês atual na agenda"
            onClick={() => setOpenSheet('previstas')}
          />
          <AgendaKpiCard
            agendaItems={agendaItems}
            agendaDate={agendaDate}
            agendaIndex={agendaIndex}
            onClick={() => setOpenSheet('agenda')}
          />
          {isCoordenador && (
            <KpiCard
              label="Execução"
              value={`${percentual.toFixed(1)}%`}
              icon={BarChart3}
              helper="orçamento utilizado"
              onClick={() => setOpenSheet('execucao')}
            />
          )}
          {isCoordenador && (
            <KpiCard
              label="Participantes"
              value={fmtInt(totalParticipantes)}
              icon={Wallet}
              helper="acumulado"
              onClick={() => setOpenSheet('participantes')}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection title="Atividades por Mês" empty={activitiesByMonth.length === 0}>{activitiesByMonth.map((m) => <MiniBar key={m.mes} label={m.mes} value={m.atividades} max={maxAtiv} color="bg-primary" />)}</CardSection>
        <CardSection title="Público por Mês" empty={activitiesByMonth.length === 0}>{activitiesByMonth.map((m) => <MiniBar key={m.mes} label={m.mes} value={m.publico} max={maxPub} color="bg-chart-secondary" />)}</CardSection>
        <CardSection title="Comparativo por Museu" empty={false}>{MUSEUS.map((museu) => <MiniBar key={museu} label={museu} value={porMuseuResumo[museu]?.participantes || 0} max={Math.max(...MUSEUS.map(m => porMuseuResumo[m]?.participantes || 0), 1)} color="bg-muted" />)}</CardSection>
      </div>

      {/* ── Sheet: Atividades do mês ── */}
      <DashboardDrilldownSheet
        open={openSheet === 'atividades'}
        onClose={() => setOpenSheet(null)}
        title={`Atividades ${ultimoMes.mes}`}
        value={`${ultimoMes.atividades} atividades`}
        fontes={['relatorios']}
      >
        <SectionTitle>Por museu</SectionTitle>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {MUSEUS.map(m => (
            <div key={m} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2">
              <span className="text-xs font-semibold text-slate-600">{m}</span>
              <span className="text-sm font-bold text-slate-900">{porMuseuResumo[m]?.atividades || 0}</span>
            </div>
          ))}
        </div>
        <SectionTitle>{resumoRelatoriosUltimoMes.length} relatórios no mês</SectionTitle>
        <div className="space-y-2">
          {resumoRelatoriosUltimoMes.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Nenhum relatório no mês atual</p>}
          {resumoRelatoriosUltimoMes.map((r, i) => (
            <RowItem key={i} label={r.autor} sub={`${r.museu} · ${r.mes} ${r.ano}`} value={`${r.atividades} ativ.`} badge={r.status === 'APPROVED' ? 'Aprovado' : r.status === 'SUBMITTED' ? 'Enviado' : r.status} />
          ))}
        </div>
      </DashboardDrilldownSheet>

      {/* ── Sheet: Participantes ── */}
      <DashboardDrilldownSheet
        open={openSheet === 'participantes'}
        onClose={() => setOpenSheet(null)}
        title="Participantes em atividades"
        value={`${fmtInt(totalParticipantes)} participantes`}
        fontes={['relatorios']}
      >
        <SectionTitle>Por museu</SectionTitle>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {MUSEUS.map(m => (
            <div key={m} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2">
              <span className="text-xs font-semibold text-slate-600">{m}</span>
              <span className="text-sm font-bold text-slate-900">{fmtInt(porMuseuResumo[m]?.participantes || 0)}</span>
            </div>
          ))}
        </div>
        <SectionTitle>{reports.length} relatórios no acumulado</SectionTitle>
        <div className="space-y-2">
          {reports.slice(0, 20).map((r, i) => {
            const partic = (r.atividades || []).reduce((s, a) => s + toInt(a.publico_total || a.publico_estimado || 0), 0);
            if (partic === 0) return null;
            return (
              <RowItem key={i} label={r.author_name || 'Profissional'} sub={`${getReportMuseu(r)} · ${r.mes_referencia} ${r.ano}`} value={fmtInt(partic)} badge={r.status === 'APPROVED' ? 'Aprovado' : 'Enviado'} />
            );
          }).filter(Boolean)}
        </div>
      </DashboardDrilldownSheet>

      {/* ── Sheet: Previstas na agenda ── */}
      <DashboardDrilldownSheet
        open={openSheet === 'previstas'}
        onClose={() => setOpenSheet(null)}
        title="Atividades previstas na agenda"
        value={`${atividadesPrevistasMes} atividades`}
        fontes={['programacao']}
      >
        <SectionTitle>{atividadesPrevistasMes} atividades cadastradas no mês atual</SectionTitle>
        <div className="space-y-2">
          {programacaoItems.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Nenhuma atividade cadastrada na agenda para este mês</p>}
          {programacaoItems.map((item, i) => {
            const d = getProgramacaoDate(item);
            return (
              <RowItem
                key={i}
                label={getProgramacaoTitle(item)}
                sub={`${getProgramacaoMuseu(item)} · ${d ? formatDateBR(d) : '—'}`}
                badge={item.status || ''}
              />
            );
          })}
        </div>
      </DashboardDrilldownSheet>

      {/* ── Sheet: Próxima agenda ── */}
      <DashboardDrilldownSheet
        open={openSheet === 'agenda'}
        onClose={() => setOpenSheet(null)}
        title="Próxima agenda"
        value={agendaDate ? formatDateBR(agendaDate) : '—'}
        fontes={['programacao']}
        footerAction={
          <button
            onClick={() => { setOpenSheet(null); navigate('/Agenda'); }}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            Ver agenda completa →
          </button>
        }
      >
        <SectionTitle>{agendaItems.length} atividade{agendaItems.length !== 1 ? 's' : ''} para {agendaDate ? formatDateBR(agendaDate) : '—'}</SectionTitle>
        <div className="space-y-2">
          {agendaItems.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Nenhuma atividade futura encontrada</p>}
          {agendaItems.map((item, i) => (
            <RowItem
              key={i}
              label={getProgramacaoTitle(item)}
              sub={getProgramacaoMuseu(item)}
              badge={item.status || ''}
            />
          ))}
        </div>
      </DashboardDrilldownSheet>

      {/* ── Sheet: Execução orçamentária ── */}
      <DashboardDrilldownSheet
        open={openSheet === 'execucao'}
        onClose={() => setOpenSheet(null)}
        title="Execução orçamentária"
        value={`${percentual.toFixed(1)}% · ${fmtBRL(totalUtilizado)}`}
        fontes={['rubricas', 'compras']}
        footerAction={
          <button
            onClick={() => { setOpenSheet(null); navigate('/Compras'); }}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold hover:bg-slate-800 transition"
          >
            Ver no Compras →
          </button>
        }
      >
        <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex flex-wrap gap-6 text-sm">
          <span className="text-slate-600">Previsto: <b>{fmtBRL(rubricas.reduce((s, r) => s + (Number(r.valor_rubrica || r.valor_total || 0)), 0))}</b></span>
          <span className="text-slate-600">Utilizado: <b>{fmtBRL(totalUtilizado)}</b></span>
          <span className="text-slate-600">Execução: <b>{percentual.toFixed(1)}%</b></span>
        </div>

        <SectionTitle>Rubricas por utilização (top 30)</SectionTitle>
        <div className="space-y-2">
          {rubricasResumo.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Nenhuma rubrica com dados</p>}
          {rubricasResumo.map((r, i) => (
            <RubricaRow key={i} rubrica={r.nome} previsto={r.previsto} utilizado={r.utilizado} pct={r.pct} />
          ))}
        </div>
      </DashboardDrilldownSheet>
    </div>
  );
}