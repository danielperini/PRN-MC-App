import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import {
  Users,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  TrendingUp,
  Building2,
  Download,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import PendingApprovalsPanel from './PendingApprovalsPanel';
import FrasesParticipantes from './FrasesParticipantes';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';

const MESES_ORDER = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: '#e5e7eb', text: '#374151' },
  RASCUNHO: { label: 'Rascunho', color: '#e5e7eb', text: '#374151' },
  SUBMITTED: { label: 'Enviado', color: '#dbeafe', text: '#1d4ed8' },
  ENVIADO: { label: 'Enviado', color: '#dbeafe', text: '#1d4ed8' },
  IN_REVIEW: { label: 'Em Revisão', color: '#fef9c3', text: '#92400e' },
  EM_REVISAO: { label: 'Em Revisão', color: '#fef9c3', text: '#92400e' },
  RETURNED: { label: 'Devolvido', color: '#fee2e2', text: '#b91c1c' },
  DEVOLVIDO: { label: 'Devolvido', color: '#fee2e2', text: '#b91c1c' },
  APPROVED: { label: 'Aprovado', color: '#dcfce7', text: '#15803d' },
  APROVADO: { label: 'Aprovado', color: '#dcfce7', text: '#15803d' },
  APROVADO_COORD: { label: 'Aprovado', color: '#dcfce7', text: '#15803d' },
  APROVADO_ADMIN: { label: 'Aprovado', color: '#dcfce7', text: '#15803d' },
  ARCHIVED: { label: 'Arquivado', color: '#f3e8ff', text: '#7e22ce' },
  ARQUIVADO: { label: 'Arquivado', color: '#f3e8ff', text: '#7e22ce' },
};

const PIE_COLORS = ['#000000', '#404040', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5'];
const APPROVED_STATUSES = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);
const PENDING_STATUSES = new Set(['SUBMITTED', 'ENVIADO', 'IN_REVIEW', 'EM_REVISAO']);

function normalizeStatus(status) {
  return String(status || '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isApprovedReport(report) {
  return APPROVED_STATUSES.has(normalizeStatus(report?.status));
}

function isPendingReport(report) {
  return PENDING_STATUSES.has(normalizeStatus(report?.status));
}

function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function getDateValue(item) {
  const raw = item?.data_realizacao || item?.data_inicio || item?.data || item?.inicio || item?.created_date || item?.updated_date;
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

function getActivityPublico(activity) {
  const direct = inteiro(activity?.publico_total ?? activity?.publico_estimado ?? activity?.publico ?? 0);
  if (direct > 0) return direct;

  const publicoMedio = inteiro(
    activity?.publico_medio_por_sessao ??
      activity?.publico_medio_sessao ??
      activity?.publico_medio ??
      activity?.publico_por_sessao ??
      0
  );

  const ocorrencias = inteiro(
    activity?.quantas_vezes_ocorreu ??
      activity?.qtd_ocorrencias ??
      activity?.ocorrencias ??
      activity?.quantidade_ocorrencias ??
      1
  );

  return publicoMedio * Math.max(ocorrencias, 1);
}

function getReportMonthNumber(report) {
  const raw = report?.mes_referencia ?? report?.mes ?? report?.competencia;
  const numeric = Number(raw);
  if (numeric >= 1 && numeric <= 12) return numeric;

  const text = String(raw || '').toLowerCase();
  const idx = MESES_ORDER.findIndex((mes) => text.includes(mes.toLowerCase()));
  if (idx >= 0) return idx + 1;

  if (text.includes('marco')) return 3;
  return null;
}

function getReportYear(report) {
  const year = Number(report?.ano ?? report?.ano_referencia);
  return Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
}

function getPreviousClosedMonth() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    monthIndex: date.getMonth(),
    monthNumber: date.getMonth() + 1,
    monthName: MESES_ORDER[date.getMonth()],
    year: date.getFullYear(),
    label: `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`,
  };
}

function normalizeMuseu(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('MIS') || text.includes('IMAGEM') || text.includes('SOM')) return 'MIS';
  if (text.includes('MHAB') || text.includes('ABILIO') || text.includes('ABÍLIO') || text.includes('HIST')) return 'MHAB';
  if (text.includes('MUMO') || text.includes('MODA')) return 'MUMO';
  if (text.includes('GERAL') || text.includes('ATUAÇÃO')) return 'Atuação Geral';
  return value || 'Não informado';
}

function getActivityAuditKey(activity, report) {
  const explicitProgramacaoId =
    activity?.programacao_id ||
    activity?.programacaoId ||
    activity?.id_programacao ||
    activity?.agenda_id;

  if (explicitProgramacaoId) return `programacao:${explicitProgramacaoId}`;

  const nome = normalizeText(
    activity?.nome_atividade ||
      activity?.nome ||
      activity?.titulo ||
      activity?.acao ||
      activity?.atividade ||
      ''
  );

  const data = getDateValue(activity);
  const mes = getReportMonthNumber(report);
  const ano = getReportYear(report);
  const periodo = data ? data.toISOString().slice(0, 10) : `${ano}-${String(mes || '').padStart(2, '0')}`;
  const museu = normalizeMuseu(activity?.museu || activity?.centro_custo || report?.museu || report?.museu_secundario);

  return [nome, periodo, museu].filter(Boolean).join('|');
}

function getReportActivities(report) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  const reportMonthNumber = getReportMonthNumber(report);
  const reportYear = getReportYear(report);
  const reportMonthName = reportMonthNumber ? MESES_ORDER[reportMonthNumber - 1] : report?.mes_referencia;

  return atividades.map((activity, index) => ({
    ...activity,
    _activityIndex: index,
    _reportId: report?.id,
    _reportMonthNumber: reportMonthNumber,
    _reportMonthName: reportMonthName,
    _reportYear: reportYear,
    _museu: normalizeMuseu(activity?.museu || activity?.centro_custo || report?.museu || report?.museu_secundario),
    _publico: getActivityPublico(activity),
    _auditKey: getActivityAuditKey(activity, report),
  }));
}

function deduplicateActivities(activities) {
  const unique = new Map();

  (activities || []).forEach((activity) => {
    const key = activity?._auditKey;
    if (!key) return;

    if (!unique.has(key)) {
      unique.set(key, activity);
      return;
    }

    const current = unique.get(key);
    if (inteiro(activity?._publico) > inteiro(current?._publico)) {
      unique.set(key, activity);
    }
  });

  return Array.from(unique.values());
}

function sameReportMonth(report, monthNumber, year) {
  return getReportMonthNumber(report) === monthNumber && getReportYear(report) === year;
}

function buildMetrics(reports) {
  const approvedReports = reports.filter(isApprovedReport);
  const rawActivities = approvedReports.flatMap(getReportActivities);
  const approvedActivities = deduplicateActivities(rawActivities);
  const publicoTotal = approvedActivities.reduce((sum, activity) => sum + activity._publico, 0);

  return {
    approvedReports,
    approvedActivities,
    publicoTotal,
  };
}

function KpiCard({ label, value, icon: Icon, highlight = false }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm min-w-0 transition-all ${
        highlight ? 'border-black bg-black text-white shadow-md' : 'border-gray-200 bg-white hover:shadow-md'
      }`}
    >
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-white' : 'text-gray-500'}`} />}
        <span className={`text-[11px] uppercase tracking-wide font-semibold truncate ${highlight ? 'text-gray-300' : 'text-gray-500'}`}>
          {label}
        </span>
      </div>
      <p className={`text-3xl font-bold leading-tight truncate ${highlight ? 'text-white' : 'text-black'}`}>
        {typeof value === 'number' ? inteiro(value).toLocaleString('pt-BR') : value}
      </p>
    </div>
  );
}

export default function CoordDashboard({ reports = [], isLoading }) {
  const [filterShowMore, setFilterShowMore] = useState(false);
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [filterMuseu, setFilterMuseu] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterTipoAtiv, setFilterTipoAtiv] = useState('');

  const isDarkTheme =
    typeof document !== 'undefined' &&
    (document.documentElement.getAttribute('data-theme') === 'nuit' || document.body.getAttribute('data-theme') === 'nuit');

  const publicoLineColor = isDarkTheme ? '#ffffff' : '#000000';
  const mesReferencia = useMemo(() => getPreviousClosedMonth(), []);
  const { data: presenceRecords = [] } = useQuery({
    queryKey: ['presence-records-dashboard'],
    queryFn: async () => {
      try {
        const data = await base44.entities.PresenceRecord.list('-data', 3000);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  });

  const reportsFiltrados = useMemo(() => {
    return reports.filter((report) => {
      const mes = getReportMonthNumber(report);
      const ano = getReportYear(report);
      const dataReport = mes ? new Date(ano, mes - 1, 1) : null;

      if (filterDataInicio && dataReport && new Date(filterDataInicio) > dataReport) return false;
      if (filterDataFim && dataReport && new Date(filterDataFim) < dataReport) return false;
      return true;
    });
  }, [reports, filterDataInicio, filterDataFim]);

  const metrics = useMemo(() => {
    const official = consolidateOfficialDashboardMetrics({ reports: reportsFiltrados, presenceRecords });
    return {
      approvedReports: official.reports.items.filter(isApprovedReport),
      approvedActivities: official.activities.items,
      publicoTotal: official.audience.publicoTotal,
      official,
    };
  }, [reportsFiltrados, presenceRecords]);

  const allAtiv = useMemo(() => {
    let atividades = metrics.approvedActivities;
    if (filterMuseu) atividades = atividades.filter((a) => a._museu === filterMuseu);
    if (filterClasse) atividades = atividades.filter((a) => String(a.classificacao || '').toUpperCase() === filterClasse);
    if (filterTipoAtiv) atividades = atividades.filter((a) => a.tipo_atividade === filterTipoAtiv);
    return atividades;
  }, [metrics.approvedActivities, filterMuseu, filterClasse, filterTipoAtiv]);

  const pendentes = reportsFiltrados.filter(isPendingReport).length;
  const aprovados = metrics.approvedReports.length;
  const totalAtiv = allAtiv.length;
  const hasActivityFilters = Boolean(filterMuseu || filterClasse || filterTipoAtiv);
  const publicoTotal = hasActivityFilters
    ? allAtiv.reduce((sum, activity) => sum + activity._publico, 0)
    : metrics.publicoTotal;

  const atividadesMesReferencia = useMemo(() => {
    const atividades = metrics.approvedActivities.filter((activity) => {
      const activityMonth = activity._reportMonthNumber || (activity._monthKey ? Number(String(activity._monthKey).slice(5, 7)) : null);
      const activityYear = activity._reportYear || (activity._monthKey ? Number(String(activity._monthKey).slice(0, 4)) : null);
      if (activityMonth !== mesReferencia.monthNumber || activityYear !== mesReferencia.year) return false;
      if (filterMuseu && activity._museu !== filterMuseu) return false;
      if (filterClasse && String(activity.classificacao || '').toUpperCase() !== filterClasse) return false;
      if (filterTipoAtiv && activity.tipo_atividade !== filterTipoAtiv) return false;
      return true;
    });

    return {
      count: atividades.length,
      publico: atividades.reduce((sum, activity) => sum + activity._publico, 0),
    };
  }, [metrics.approvedActivities, mesReferencia, filterMuseu, filterClasse, filterTipoAtiv]);

  const metas = allAtiv.filter((a) => String(a.classificacao || '').toUpperCase() === 'META').length;
  const rotinas = allAtiv.filter((a) => String(a.classificacao || '').toUpperCase() === 'ROTINA').length;
  const extras = allAtiv.filter((a) => String(a.classificacao || '').toUpperCase() === 'EXTRA').length;

  const porMuseu = useMemo(() => {
    const map = {};
    metrics.approvedReports.forEach((report) => {
      const museu = normalizeMuseu(report?.museu || report?.museu_secundario);
      if (!museu || String(museu).toLowerCase() === 'atuação geral') return;
      if (!map[museu]) map[museu] = { museu, relatorios: 0, atividades: 0, publico: 0 };
      map[museu].relatorios += 1;
    });

    allAtiv.forEach((activity) => {
      const museu = normalizeMuseu(activity._museu);
      if (!map[museu]) map[museu] = { museu, relatorios: 0, atividades: 0, publico: 0 };
      map[museu].atividades += 1;
      map[museu].publico += activity._publico;
    });

    return Object.values(map).sort((a, b) => b.atividades - a.atividades);
  }, [metrics.approvedReports, allAtiv]);

  const porMes = useMemo(() => {
    const map = {};
    allAtiv.forEach((activity) => {
      const mes = activity._reportMonthName;
      const mesNumber = activity._reportMonthNumber;
      if (!mes || !mesNumber) return;
      if (!map[mes]) map[mes] = { mes: mes.substring(0, 3), mesNumber, atividades: 0, publico: 0 };
      map[mes].atividades += 1;
      map[mes].publico += activity._publico;
    });

    return MESES_ORDER.filter((m) => map[m]).map((m) => map[m]);
  }, [allAtiv]);

  const statusData = useMemo(() => {
    const map = {};
    reportsFiltrados.forEach((report) => {
      const status = normalizeStatus(report.status) || 'SEM_STATUS';
      map[status] = (map[status] || 0) + 1;
    });

    return Object.entries(map).map(([status, value]) => ({
      name: STATUS_CONFIG[status]?.label || status,
      value,
      fill: STATUS_CONFIG[status]?.color || '#ccc',
    }));
  }, [reportsFiltrados]);

  const classifData = [
    { name: 'META', value: metas },
    { name: 'ROTINA', value: rotinas },
    { name: 'EXTRA', value: extras },
  ].filter((d) => d.value > 0);

  const atividadesPorTipo = useMemo(() => {
    const map = {};
    allAtiv.forEach((a) => {
      const tipo = a.tipo_atividade || 'Outro';
      map[tipo] = (map[tipo] || 0) + 1;
    });
    return Object.entries(map).map(([tipo, value]) => ({ tipo, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [allAtiv]);

  const museusUnicos = useMemo(() => {
    const set = new Set(metrics.approvedActivities.map((a) => a._museu).filter(Boolean));
    return Array.from(set).sort();
  }, [metrics.approvedActivities]);

  const tiposUnicos = useMemo(() => {
    const set = new Set(metrics.approvedActivities.map((a) => a.tipo_atividade).filter(Boolean));
    return Array.from(set).sort();
  }, [metrics.approvedActivities]);

  const pendentesList = reportsFiltrados.filter(isPendingReport).slice(0, 5);

  const exportarRelatorioGeral = () => {
    const rows = [
      ['Protocolo', 'Profissional', 'Museu', 'Mês', 'Ano', 'Status', 'Total Atividades', 'Público Total', 'Metas', 'Rotinas', 'Extras'],
      ...metrics.approvedReports.map((report) => {
        const atividades = deduplicateActivities(getReportActivities(report));
        return [
          report.numero_protocolo || '—',
          report.author_name || '',
          report.museu || '',
          report.mes_referencia || '',
          report.ano || '',
          report.status || '',
          atividades.length,
          atividades.reduce((sum, activity) => sum + activity._publico, 0),
          atividades.filter((a) => String(a.classificacao || '').toUpperCase() === 'META').length,
          atividades.filter((a) => String(a.classificacao || '').toUpperCase() === 'ROTINA').length,
          atividades.filter((a) => String(a.classificacao || '').toUpperCase() === 'EXTRA').length,
        ];
      }),
      [],
      ['AUDITORIA'],
      ['Fonte', 'Somente relatórios aprovados, com atividades deduplicadas'],
      ['Relatórios aprovados', metrics.approvedReports.length],
      ['Atividades aprovadas', totalAtiv],
      ['Público total aprovado', publicoTotal],
    ];

    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-geral-museus-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório geral exportado com sucesso!');
  };

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400">Carregando dashboard...</div>;
  }

  const temFiltrosAtivos = filterDataInicio || filterDataFim || filterMuseu || filterClasse || filterTipoAtiv;

  const limparFiltros = () => {
    setFilterDataInicio('');
    setFilterDataFim('');
    setFilterMuseu('');
    setFilterClasse('');
    setFilterTipoAtiv('');
    setFilterShowMore(false);
  };

  return (
    <div className="space-y-8">
      <PendingApprovalsPanel />
      <FrasesParticipantes reports={metrics.approvedReports} />

      <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg hidden">
        Auditoria ativa: atividades e público são calculados exclusivamente pela soma deduplicada das atividades dos relatórios aprovados. Agenda não entra em público realizado.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Pendentes de Revisão" value={pendentes} icon={AlertCircle} highlight={pendentes > 0} />
        <KpiCard label="Aprovados" value={aprovados} icon={CheckCircle} />
        <KpiCard label={`Atividades em ${mesReferencia.monthName} (aprovados)`} value={atividadesMesReferencia.count} icon={TrendingUp} />
        <KpiCard label="Público Total (aprovados)" value={publicoTotal.toLocaleString('pt-BR')} icon={Users} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {porMes.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5 hidden">
            <h3 className="text-sm font-semibold text-black mb-4">Atividades por Mês</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porMes} barSize={20}>
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="atividades" fill="#000000" radius={[4, 4, 0, 0]} name="Atividades" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {porMes.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5 hidden">
            <h3 className="text-sm font-semibold text-black mb-4">Público por Mês</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porMes} barSize={20}>
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip formatter={(value) => [Math.round(value).toLocaleString('pt-BR'), 'Público']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="publico" fill="#404040" radius={[4, 4, 0, 0]} name="Público" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {statusData.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Status dos Relatórios</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                  {statusData.map((entry, i) => <Cell key={`${entry.name}-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {classifData.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Classificação de Atividades</h3>
            <div className="space-y-3 mt-2">
              {[
                { label: 'META', value: metas, total: totalAtiv, color: 'bg-black' },
                { label: 'ROTINA', value: rotinas, total: totalAtiv, color: 'bg-gray-500' },
                { label: 'EXTRA', value: extras, total: totalAtiv, color: 'bg-gray-300' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{item.label}</span>
                    <span className="text-gray-500">{item.value} ({totalAtiv ? Math.round((item.value / totalAtiv) * 100) : 0}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: totalAtiv ? `${(item.value / totalAtiv) * 100}%` : '0%' }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">Total: {totalAtiv} atividades registradas</div>
          </div>
        )}

        {atividadesPorTipo.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Atividades por Tipo</h3>
            <div className="space-y-2">
              {atividadesPorTipo.map((item) => (
                <div key={item.tipo} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate">{item.tipo}</span>
                  <span className="font-semibold text-black">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {porMuseu.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Comparativo por Museu</h3>
            <div className="space-y-3">
              {porMuseu.map((m) => (
                <div key={m.museu} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-sm text-black truncate">{m.museu}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 pl-5">
                    <span>{m.relatorios} rel.</span>
                    <span>{m.atividades} ativ.</span>
                    <span>{Math.round(m.publico).toLocaleString('pt-BR')} púb.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {porMes.length > 2 && (
        <div className="border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-black mb-4">Público por Mês</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip formatter={(value) => [Math.round(value).toLocaleString('pt-BR'), 'Público']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="publico" stroke={publicoLineColor} strokeWidth={2} dot={{ r: 4, fill: publicoLineColor, stroke: publicoLineColor }} activeDot={{ r: 6, fill: publicoLineColor, stroke: publicoLineColor }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {pendentesList.length > 0 && (
        <div className="border border-black rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-black flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-black" />Aguardando Revisão ({pendentes})
            </h3>
            <Link to={createPageUrl('CoordReview')}>
              <Button size="sm" className="bg-black hover:bg-gray-800 text-white text-xs">
                Ver todos <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {pendentesList.map((report) => {
              const cfg = STATUS_CONFIG[normalizeStatus(report.status)];
              return (
                <Link key={report.id} to={createPageUrl(`ReportEditor?id=${report.id}`)} className="block">
                  <div className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    <div>
                      <span className="text-sm font-medium text-black">{report.author_name}</span>
                      <span className="text-xs text-gray-500 ml-2">— {report.mes_referencia} {report.ano} · {report.museu}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg?.color, color: cfg?.text }}>
                      {cfg?.label || report.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={exportarRelatorioGeral}>
          <Download className="w-4 h-4" />Exportar Relatório Geral (CSV)
        </Button>
      </div>
    </div>
  );
}
