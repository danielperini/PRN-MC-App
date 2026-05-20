import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell } from
'recharts';
import { Activity, Calendar, MapPin, RotateCw, TrendingUp, Users } from 'lucide-react';
import AgendaCard from '@/components/patrocinador/AgendaCard';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';
import { consumeDashboardPriorityRefresh } from '@/utils/dashboardRefresh';

const TOTAL_OFICIAL = 1320000;
const MUSEUS = ['MIS', 'MHAB', 'MUMO'];
const CHART_COLORS = ['#111827', '#4B5563', '#9CA3AF', '#D1D5DB'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const APPROVED_STATUSES = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0));
const fmtInt = (v) => Math.round(Number(v || 0)).toLocaleString('pt-BR');

function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function normalizeText(value) {
  return String(value || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  trim().
  toLowerCase().
  replace(/\s+/g, ' ');
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const data = await entity.list(order, limit);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Falha ao listar entidade:', error);
    return [];
  }
}

function getDateValue(item) {
  const raw = item?.data_realizacao || item?.data_programacao || item?.data_inicio || item?.data || item?.inicio || item?.created_date || item?.updated_date;
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

function isApprovedReport(report) {
  return APPROVED_STATUSES.has(String(report?.status || '').trim().toUpperCase());
}

// Público de atividades/eventos. Mantém compatibilidade com campos antigos e novos do ReportEditor.
// Público geral declarado do museu NÃO entra nesta função — é exibido separadamente.
function getActivityPublico(atividade) {
  const total = inteiro(
    atividade?.publico_total ??
    atividade?.publicoTotal ??
    atividade?.total_publico ??
    atividade?.publico ??
    0
  );
  if (total > 0) return total;

  const publicoMedio = inteiro(
    atividade?.publico_medio_por_sessao ??
    atividade?.publico_medio_sessao ??
    atividade?.publico_medio ??
    atividade?.publico_por_sessao ??
    atividade?.publico_estimado ??
    0
  );

  const repeticoes = inteiro(
    atividade?.quantas_vezes_ocorreu ??
    atividade?.quantas_repeticoes ??
    atividade?.qtd_ocorrencias ??
    atividade?.ocorrencias ??
    atividade?.quantidade_ocorrencias ??
    1
  );

  if (publicoMedio > 0) return publicoMedio * Math.max(repeticoes, 1);
  return 0;
}

function isAtividadeConsolidadoMensal(activity) {
  const text = normalizeText([
  activity?.nome_atividade,
  activity?.nome,
  activity?.titulo,
  activity?.acao,
  activity?.atividade,
  activity?.descricao,
  activity?.observacoes,
  activity?.tipo_atividade,
  activity?.classificacao].
  filter(Boolean).join(' '));

  if (!text) return false;

  const hasConsolidado =
  text.includes('publico geral') ||
  text.includes('público geral') ||
  text.includes('publico total') ||
  text.includes('público total') ||
  text.includes('total do mes') ||
  text.includes('total do mês') ||
  text.includes('consolidado') ||
  text.includes('consolidada') ||
  text.includes('balanco mensal') ||
  text.includes('balanço mensal') ||
  text.includes('resumo mensal');

  const hasMensal =
  text.includes('mes') ||
  text.includes('mês') ||
  text.includes('mensal') ||
  text.includes('geral');

  return hasConsolidado && hasMensal;
}

function getPublicoContabil(activity) {
  return inteiro(activity?._publico_contabil ?? activity?._publico ?? 0);
}

function getReportMonthNumber(report) {
  const raw = report?.mes_referencia ?? report?.mes ?? report?.competencia;
  const numeric = Number(raw);
  if (numeric >= 1 && numeric <= 12) return numeric;

  const text = String(raw || '').toLowerCase();
  const idx = MESES.findIndex((mes) => text.includes(mes.toLowerCase()));
  if (idx >= 0) return idx + 1;
  if (text.includes('marco')) return 3;
  return null;
}

function getReportYear(report) {
  const year = Number(report?.ano ?? report?.ano_referencia);
  return Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
}

function getMonthFromDate(date) {
  return {
    monthIndex: date.getMonth(),
    monthNumber: date.getMonth() + 1,
    monthName: MESES[date.getMonth()],
    year: date.getFullYear(),
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    label: `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  };
}

function getCurrentMonth() {
  return getMonthFromDate(new Date());
}

function getPreviousClosedMonth() {
  const now = new Date();
  return getMonthFromDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

function getReportMonthDate(report) {
  const mes = getReportMonthNumber(report);
  const ano = getReportYear(report);
  if (mes >= 1 && mes <= 12 && ano) return new Date(ano, mes - 1, 1);
  return getDateValue(report);
}

function getMonthKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key) {
  if (!key) return '—';
  const [ano, mes] = key.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function getProgramacaoTitle(item) {
  return item?.nome_acao || item?.titulo || item?.atividade || item?.nome || item?.evento || 'Atividade programada';
}

function getProgramacaoMuseu(item) {
  return item?.museu || item?.centro_custo || item?.local_museu || item?.equipamento || item?.local || 'Museus Centro';
}

function normalizeMuseu(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('MIS') || text.includes('IMAGEM') || text.includes('SOM')) return 'MIS';
  if (text.includes('MHAB') || text.includes('ABILIO') || text.includes('ABÍLIO') || text.includes('HIST')) return 'MHAB';
  if (text.includes('MUMO') || text.includes('MODA')) return 'MUMO';
  return 'GERAL';
}

function getActivityAuditKey(activity, report) {
  const explicitProgramacaoId =
  activity?.programacao_id ||
  activity?.programacaoId ||
  activity?.id_programacao ||
  activity?.agenda_id;

  if (explicitProgramacaoId) return `programacao:${explicitProgramacaoId}`;

  const title = normalizeText(
    activity?.nome_atividade ||
    activity?.nome ||
    activity?.titulo ||
    activity?.acao ||
    activity?.atividade ||
    activity?.id ||
    ''
  );
  const date = getDateValue(activity) || getReportMonthDate(report);
  const reportMonth = getMonthKey(getReportMonthDate(report));
  const museu = normalizeMuseu(activity?.museu || activity?.centro_custo || report?.museu || report?.museu_secundario);

  return [title, date ? date.toISOString().slice(0, 10) : reportMonth, museu].filter(Boolean).join('|');
}

function getReportActivities(report) {
  const reportDate = getReportMonthDate(report);
  const reportMonthKey = getMonthKey(reportDate);
  const reportMonthNumber = getReportMonthNumber(report);
  const reportYear = getReportYear(report);
  const activities = Array.isArray(report?.atividades) ? report.atividades : [];

  return activities.map((activity, index) => ({
    ...activity,
    _source: 'report',
    _reportId: report?.id,
    _index: index,
    _museu: normalizeMuseu(activity?.museu || activity?.centro_custo || report?.museu || report?.museu_secundario),
    _date: getDateValue(activity) || reportDate,
    _reportMonthKey: reportMonthKey,
    _reportMonthNumber: reportMonthNumber,
    _reportYear: reportYear,
    _publico: getActivityPublico(activity),
    _isConsolidadoMensal: isAtividadeConsolidadoMensal(activity),
    _auditKey: getActivityAuditKey(activity, report) || `${report?.id || 'report'}|${index}`
  }));
}

function deduplicateActivities(activities) {
  const unique = new Map();
  const counts = new Map();

  (activities || []).forEach((activity) => {
    const key = activity?._auditKey;
    if (!key) return;

    counts.set(key, (counts.get(key) || 0) + 1);

    if (!unique.has(key)) {
      unique.set(key, activity);
      return;
    }

    const current = unique.get(key);
    const currentPublico = inteiro(current?._publico);
    const nextPublico = inteiro(activity?._publico);

    if (nextPublico > currentPublico) {
      unique.set(key, activity);
    }
  });

  const duplicateCount = Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return { uniqueActivities: Array.from(unique.values()), duplicateCount };
}

function applyPublicoConsolidadoMensal(activities) {
  const groups = new Map();

  (activities || []).forEach((activity) => {
    const key = [activity?._reportMonthKey, activity?._museu].filter(Boolean).join('|');
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(activity);
  });

  const consolidatedKeys = new Set();
  const result = [];

  groups.forEach((items, key) => {
    const consolidados = items.filter((item) => item._isConsolidadoMensal && inteiro(item._publico) > 0);

    if (consolidados.length === 0) {
      items.forEach((item) => result.push({ ...item, _publico_contabil: inteiro(item._publico), _publico_regra: 'soma_atividade' }));
      return;
    }

    consolidatedKeys.add(key);
    const consolidadoPrincipal = consolidados.reduce((best, item) => inteiro(item._publico) > inteiro(best?._publico) ? item : best, consolidados[0]);

    items.forEach((item) => {
      if (item === consolidadoPrincipal || item._auditKey === consolidadoPrincipal._auditKey) {
        result.push({ ...item, _publico_contabil: inteiro(consolidadoPrincipal._publico), _publico_regra: 'consolidado_mensal' });
      } else {
        result.push({ ...item, _publico_contabil: 0, _publico_regra: 'ignorado_por_consolidado_mensal' });
      }
    });
  });

  return {
    activities: result,
    consolidatedGroupCount: consolidatedKeys.size
  };
}

function buildApprovedMetrics(reportsAll) {
  const reports = reportsAll.filter(isApprovedReport);
  const rawActivities = reports.flatMap(getReportActivities);

  // Atividade aprovada deve contar mesmo quando o público ainda não foi preenchido.
  // Público continua sendo somado apenas quando houver valor válido.
  const { uniqueActivities, duplicateCount } = deduplicateActivities(rawActivities);
  const publicoConsolidado = applyPublicoConsolidadoMensal(uniqueActivities);
  const totalPublico = publicoConsolidado.activities.reduce((sum, activity) => sum + getPublicoContabil(activity), 0);

  const publicoGeralPorMuseu = {};
  reports.forEach((r) => {
    const museu = normalizeMuseu(r.museu || r.museu_secundario);
    const pg = inteiro(r.publico_geral_declarado ?? 0);
    if (pg > 0) {
      publicoGeralPorMuseu[museu] = (publicoGeralPorMuseu[museu] || 0) + pg;
    }
  });

  return {
    reports,
    rawActivities,
    activities: publicoConsolidado.activities,
    duplicateCount,
    consolidatedGroupCount: publicoConsolidado.consolidatedGroupCount,
    totalPublico,
    publicoGeralPorMuseu
  };
}

function KpiCard({ icon: Icon, label, value, helper, dark = false }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm min-w-0 ${dark ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${dark ? 'text-white' : 'text-gray-500'}`} />
        <span className={`text-[11px] uppercase tracking-wide font-semibold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{label}</span>
      </div>
      <p className={`break-words text-2xl font-bold leading-tight tabular-nums ${dark ? 'text-white' : 'text-black'}`}>{value}</p>
      {helper && <p className={`mt-1 break-words text-[11px] leading-tight ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{helper}</p>}
    </div>);

}

function SectionCard({ title, children }) {
  return (
    <Card className="rounded-2xl border-gray-200 shadow-sm">
      <CardContent className="p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">{title}</h3>
        {children}
      </CardContent>
    </Card>);

}

export default function DashboardPatrocinadorSync() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loadError, setLoadError] = useState('');
  const isFetchingRef = useRef(false);
  const [data, setData] = useState({
    periodo: '',
    periodoAgenda: '',
    totalAtividadesMes: 0,
    totalAtividadesAno: 0,
    totalPublico: 0,
    publicoMes: 0,
    atividadesPrevistasMes: 0,
    programacao: [],
    proximaAgenda: null,
    agendaDoDia: [],
    dadosMensais: [],
    dadosClassificacao: [],
    comparativoMuseu: [],
    duplicateCount: 0,
    consolidatedGroupCount: 0,
    totalOrcado: TOTAL_OFICIAL,
    totalUtilizado: 0,
    saldoTotal: TOTAL_OFICIAL,
    percentualExecucao: 0,
    hasData: false
  });

  const loadDashboardData = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoadError('');
    if (!silent) setLoading(true);else
    setRefreshing(true);

    try {
      const hoje = new Date();
      const hojeInicio = startOfDay(hoje);
      const mesReferencia = getPreviousClosedMonth();
      const mesAgenda = getCurrentMonth();

      const [reportsAll, programacaoRaw, rubricasRaw, presenceRecords] = await Promise.all([
      safeList(base44.entities.Report, '-updated_date', 1000),
      safeList(base44.entities.Programacao, '-data_realizacao', 1000),
      safeList(base44.entities.Rubrica, 'ordem_exibicao', 1000),
      safeList(base44.entities.PresenceRecord, '-data', 3000)]
      );

      const officialMetrics = consolidateOfficialDashboardMetrics({
        reports: reportsAll,
        programacao: programacaoRaw,
        rubricas: rubricasRaw,
        presenceRecords,
      });
      const publicoGeralPorMuseu = Object.fromEntries(
        (officialMetrics.audience?.byMuseum || []).map((item) => [item.museu, item.total])
      );
      const metrics = {
        reports: officialMetrics.reports.items,
        rawActivities: officialMetrics.activities.items,
        activities: officialMetrics.activities.items,
        duplicateCount: officialMetrics.activities.duplicateActivities.length,
        consolidatedGroupCount: officialMetrics.activities.consolidatedAudienceGroups.length,
        totalPublico: officialMetrics.audience.publicoTotal,
        publicoGeralPorMuseu,
      };
      const atividadesRealizadas = metrics.activities;
      const mesKeyReferencia = `${mesReferencia.year}-${String(mesReferencia.monthNumber).padStart(2, '0')}`;
      const atividadesMesInfo = (officialMetrics.activities?.byMonth || []).find((item) => item.key === mesKeyReferencia) || { atividades: 0, publico: 0 };

      const programacao = programacaoRaw.
      filter((item) => {
        const status = String(item?.status || item?.situacao || '').toUpperCase();
        return !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status);
      }).
      map((item) => ({ ...item, _date: getDateValue(item), _museu: normalizeMuseu(getProgramacaoMuseu(item)) }));

      const programacaoMes = programacao.filter((item) => item._date && item._date.getMonth() === mesAgenda.monthIndex && item._date.getFullYear() === mesAgenda.year);

      const agendaHoje = programacao.
      filter((item) => item._date && startOfDay(item._date).getTime() === hojeInicio.getTime()).
      sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')));

      const futuras = programacao.
      filter((item) => item._date && startOfDay(item._date).getTime() >= hojeInicio.getTime()).
      sort((a, b) => startOfDay(a._date).getTime() - startOfDay(b._date).getTime());

      const atividadesPorMes = {};
      atividadesRealizadas.forEach((item) => {
        const chave = item._reportMonthKey || getMonthKey(item._date);
        if (!chave) return;
        if (!atividadesPorMes[chave]) atividadesPorMes[chave] = { mes: getMonthLabel(chave), key: chave, atividades: 0, publico: 0 };
        atividadesPorMes[chave].atividades += 1;
        atividadesPorMes[chave].publico += getPublicoContabil(item);
      });

      const dadosMensais = Object.values(atividadesPorMes).
      sort((a, b) => a.key.localeCompare(b.key)).
      slice(-6).
      map((item) => ({ mes: item.mes, atividades: Math.round(item.atividades), publico: Math.round(item.publico) }));

      const classificacao = {};
      atividadesRealizadas.forEach((item) => {
        const nome = String(item?.classificacao || 'Outro').toUpperCase();
        classificacao[nome] = (classificacao[nome] || 0) + 1;
      });

      const dadosClassificacao = Object.entries(classificacao).map(([nome, quantidade]) => ({
        nome,
        quantidade,
        display: nome === 'META' ? 'Metas' : nome === 'ROTINA' ? 'Rotina' : nome === 'EXTRA' ? 'Extra' : nome
      }));

      const comparativoMuseu = MUSEUS.map((museu) => {
        const itemsComPublico = atividadesRealizadas.filter((item) => item._museu === museu && getPublicoContabil(item) > 0);
        const totalAtivMuseu = atividadesRealizadas.filter((item) => item._museu === museu).length;
        const publicoAtividades = Math.round(itemsComPublico.reduce((sum, item) => sum + getPublicoContabil(item), 0));
        const mediaPublico = itemsComPublico.length > 0 ? Math.round(publicoAtividades / itemsComPublico.length) : 0;
        return {
          museu,
          atividades: totalAtivMuseu,
          atividadesComPublico: itemsComPublico.length,
          publico: publicoAtividades,
          publicoGeral: metrics.publicoGeralPorMuseu[museu] || 0,
          mediaPublico
        };
      });

      const totalUtilizado = officialMetrics.financeiro.totalUtilizado;
      const saldoTotal = officialMetrics.financeiro.saldo;
      const percentualExecucao = officialMetrics.financeiro.percentualExecucao;
      const publicoMes = atividadesMesInfo.publico || 0;
      const totalPublico = metrics.totalPublico;

      setData({
        periodo: mesReferencia.label,
        periodoAgenda: mesAgenda.label,
        totalAtividadesMes: atividadesMesInfo.atividades || 0,
        totalAtividadesAno: atividadesRealizadas.length,
        totalPublico,
        publicoMes,
        atividadesPrevistasMes: programacaoMes.length,
        programacao,
        agendaDoDia: agendaHoje,
        proximaAgenda: agendaHoje[0] || futuras[0] || null,
        dadosMensais,
        dadosClassificacao,
        comparativoMuseu,
        duplicateCount: metrics.duplicateCount,
        consolidatedGroupCount: metrics.consolidatedGroupCount,
        totalOrcado: TOTAL_OFICIAL,
        totalUtilizado,
        saldoTotal,
        percentualExecucao,
        hasData: metrics.reports.length > 0 || atividadesRealizadas.length > 0
      });

      setLastUpdate(new Date());
    } catch (error) {
      console.warn('Dashboard patrocinador parcialmente indisponível. Mantendo dados disponíveis.', error);
      setLoadError('Alguns dados não puderam ser carregados. O painel exibiu o que estava disponível.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const hasPriorityRefresh = consumeDashboardPriorityRefresh();
    loadDashboardData(!hasPriorityRefresh);
    const interval = setInterval(() => loadDashboardData(true), 60000);
    const onUpdate = () => loadDashboardData(true);
    window.addEventListener('dashboard:update', onUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('dashboard:update', onUpdate);
    };
  }, [loadDashboardData]);

  const renderProximaAgenda = useMemo(() => {
    if (!data.proximaAgenda) return <p className="text-sm text-gray-500">Nenhuma atividade futura cadastrada na programação.</p>;
    const item = data.proximaAgenda;
    const date = item?._date;
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-black">{date ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}</p>
            <p className="text-sm font-semibold text-black line-clamp-2 mt-1">{getProgramacaoTitle(item)}</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{getProgramacaoMuseu(item)}</p>
          </div>
          <div className="rounded-full border border-black px-3 py-1 text-[11px] font-semibold text-black">{data.agendaDoDia.length > 0 ? 'Hoje' : 'Próxima'}</div>
        </div>
      </div>);

  }, [data.proximaAgenda, data.agendaDoDia.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Carregando painel...</p>
        </div>
      </div>);

  }

  return (
    <div className="space-y-8">
      {loadError && <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-700">{loadError}</div>}

      {!data.hasData && <div className="bg-white border border-black rounded-2xl p-5 text-sm text-black font-medium">Sem dados disponíveis. Sincronize relatórios aprovados e atividades para visualizar métricas.</div>}

      {(data.duplicateCount > 0 || data.consolidatedGroupCount > 0) &&
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-sm hidden">
          Auditoria ativa: {data.duplicateCount > 0 ? `${fmtInt(data.duplicateCount)} atividade(s) repetida(s) removida(s). ` : ''}
          {data.consolidatedGroupCount > 0 ? `${fmtInt(data.consolidatedGroupCount)} grupo(s) museu/mês com público consolidado; atividades detalhadas foram ignoradas apenas na soma de público.` : ''}
        </div>
      }

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          
          
        </div>
        


        
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Activity} label="Atividades do mês" value={fmtInt(data.totalAtividadesMes)} helper={`${fmtInt(data.totalAtividadesAno)} no acumulado`} dark />
        <KpiCard icon={Calendar} label="Previstas na agenda" value={fmtInt(data.atividadesPrevistasMes)} helper={`período ${data.periodoAgenda || data.periodo}`} dark />
        <KpiCard icon={Users} label="Participantes em atividades" value={fmtInt(data.totalPublico)} helper={`${fmtInt(data.publicoMes)} no mês`} />
        <KpiCard icon={TrendingUp} label="Execução orçamentária" value={`${data.percentualExecucao}%`} helper={`${fmtBRL(data.totalUtilizado)} utilizado`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Próxima agenda">{renderProximaAgenda}</SectionCard>
        <SectionCard title="Orçamento oficial">
          <div className="space-y-3">
            <div className="flex justify-between gap-3 text-[11px]"><span className="text-gray-500">Previsto</span><span className="break-words text-right font-semibold tabular-nums text-black">{fmtBRL(data.totalOrcado)}</span></div>
            <div className="flex justify-between gap-3 text-[11px]"><span className="text-gray-500">Utilizado</span><span className="break-words text-right font-semibold tabular-nums text-black">{fmtBRL(data.totalUtilizado)}</span></div>
            <div className="flex justify-between gap-3 text-[11px]"><span className="text-gray-500">Saldo</span><span className="break-words text-right font-semibold tabular-nums text-black">{fmtBRL(data.saldoTotal)}</span></div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-1.5 rounded-full bg-black" style={{ width: `${Math.min(data.percentualExecucao, 100)}%` }} /></div>
          </div>
        </SectionCard>
        <SectionCard title="Museus acompanhados">
          <div className="grid grid-cols-3 gap-2">
            {MUSEUS.map((museu) => {
              const item = data.comparativoMuseu.find((x) => x.museu === museu) || {};
              return (
                <div key={museu} className="rounded-xl border border-gray-200 p-3 space-y-2">
                  <p className="text-sm font-bold text-black">{museu}</p>
                  {item.publicoGeral > 0 &&
                  <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Público Geral</p>
                      <p className="text-xs font-bold text-black">{fmtInt(item.publicoGeral)}</p>
                    </div>
                  }
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Atividades c/ público</p>
                    <p className="text-xs text-gray-700">{fmtInt(item.atividadesComPublico)} de {fmtInt(item.atividades)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Participantes</p>
                    <p className="text-xs text-gray-700">{fmtInt(item.publico)}</p>
                  </div>
                  {item.mediaPublico > 0 &&
                  <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Média/atividade</p>
                      <p className="text-xs text-gray-700">{fmtInt(item.mediaPublico)}</p>
                    </div>
                  }
                </div>);

            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Atividades realizadas por mês">
          {data.dadosMensais.length === 0 ? <p className="text-sm text-gray-400">Sem dados disponíveis.</p> :
          <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dadosMensais}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="atividades" fill="#111827" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          }
        </SectionCard>

        <SectionCard title="Classificação de atividades">
          {data.dadosClassificacao.length === 0 ? <p className="text-sm text-gray-400">Sem dados disponíveis.</p> :
          <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.dadosClassificacao} dataKey="quantidade" nameKey="display" outerRadius={86} innerRadius={48} paddingAngle={3}>
                    {data.dadosClassificacao.map((entry, index) => <Cell key={entry.nome} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          }
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <SectionCard title="Agenda"><AgendaCard programacao={data.programacao} /></SectionCard>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500 border border-gray-200 rounded-2xl px-4 py-3 bg-white">
        <span>Fonte oficial dos indicadores: atividades deduplicadas dos relatórios aprovados; público consolidado mensal prevalece quando informado.</span>
        {lastUpdate && <span>Última atualização: {lastUpdate.toLocaleString('pt-BR')}</span>}
      </div>
    </div>);

}
