import React, { useMemo } from 'react';
import { Activity, Users } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';

const MESES_ORDER = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PERIODO_INICIAL = { year: 2026, monthNumber: 2 };
const publicoLineColor = '#111827';
const activityBarColor = '#374151';
const programacaoLineColor = '#4b5563';
const APPROVED_STATUSES = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function fmtInt(value) {
  return inteiro(value).toLocaleString('pt-BR');
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
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

function getActivityPublic(activity) {
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

function getPreviousClosedMonth() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    year: date.getFullYear(),
    monthNumber: date.getMonth() + 1
  };
}

function monthKey(year, monthNumber) {
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

function monthLabel(monthNumber, year) {
  const mes = MESES_ORDER[(Number(monthNumber) || 1) - 1] || 'Mês';
  return `${mes.slice(0, 3)}/${String(year).slice(-2)}`;
}

function compareMonth(aYear, aMonth, bYear, bMonth) {
  return (aYear * 12 + aMonth) - (bYear * 12 + bMonth);
}

function buildPeriodRows() {
  const end = getPreviousClosedMonth();
  const rows = [];
  let year = PERIODO_INICIAL.year;
  let monthNumber = PERIODO_INICIAL.monthNumber;

  while (compareMonth(year, monthNumber, end.year, end.monthNumber) <= 0) {
    rows.push({
      key: monthKey(year, monthNumber),
      ano: year,
      mesNumero: monthNumber,
      mes: monthLabel(monthNumber, year),
      publico: 0,
      atividades: 0,
      programacoes: 0
    });

    monthNumber += 1;
    if (monthNumber > 12) {
      monthNumber = 1;
      year += 1;
    }
  }

  return rows;
}

function getActivityAuditKey(activity, report, index = 0) {
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

  const data = activity?.data_realizacao || activity?.data_inicio || activity?.data || activity?.inicio || '';
  const museu = normalizeText(activity?.museu || activity?.centro_custo || report?.museu || report?.museu_secundario || '');
  const periodo = data || `${getReportYear(report)}-${String(getReportMonthNumber(report) || '').padStart(2, '0')}`;

  return [nome || `atividade-${index}`, periodo, museu].filter(Boolean).join('|');
}

function getReportActivities(report) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  const reportMonthNumber = getReportMonthNumber(report);
  const reportYear = getReportYear(report);

  return atividades.map((activity, index) => ({
    ...activity,
    _activityIndex: index,
    _reportId: report?.id,
    _reportMonthNumber: reportMonthNumber,
    _reportYear: reportYear,
    _publico: getActivityPublic(activity),
    _auditKey: getActivityAuditKey(activity, report, index)
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

function isInDashboardPeriod(year, monthNumber) {
  const end = getPreviousClosedMonth();
  return (
    compareMonth(year, monthNumber, PERIODO_INICIAL.year, PERIODO_INICIAL.monthNumber) >= 0 &&
    compareMonth(year, monthNumber, end.year, end.monthNumber) <= 0
  );
}

function buildMonthlyRows(reports = [], programacao = []) {
  const rows = buildPeriodRows();
  const map = new Map(rows.map((row) => [row.key, row]));
  const approvedReports = (Array.isArray(reports) ? reports : []).filter(isApprovedReport);
  const approvedActivities = deduplicateActivities(approvedReports.flatMap(getReportActivities));

  approvedActivities.forEach((activity) => {
    const year = activity?._reportYear;
    const monthNumber = activity?._reportMonthNumber;
    if (!year || !monthNumber || !isInDashboardPeriod(year, monthNumber)) return;

    const row = map.get(monthKey(year, monthNumber));
    if (!row) return;

    row.atividades += 1;
    row.publico += inteiro(activity?._publico);
  });

  (Array.isArray(programacao) ? programacao : []).forEach((item) => {
    const date = getDateValue(item);
    if (!date) return;

    const year = date.getFullYear();
    const monthNumber = date.getMonth() + 1;
    if (!isInDashboardPeriod(year, monthNumber)) return;

    const row = map.get(monthKey(year, monthNumber));
    if (row) row.programacoes += 1;
  });

  return rows;
}

function getApprovedTotals(reports = []) {
  const approvedReports = (Array.isArray(reports) ? reports : []).filter(isApprovedReport);
  const approvedActivities = deduplicateActivities(approvedReports.flatMap(getReportActivities)).filter((activity) => {
    const year = activity?._reportYear;
    const monthNumber = activity?._reportMonthNumber;
    return year && monthNumber && isInDashboardPeriod(year, monthNumber);
  });

  return {
    activities: approvedActivities.length,
    publicTotal: approvedActivities.reduce((sum, activity) => sum + inteiro(activity?._publico), 0)
  };
}

function StatCard({ title, value, helper, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
      <div className="mb-3 flex items-center gap-2 text-gray-500">
        {Icon && <Icon className="h-4 w-4 text-black" />}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{title}</span>
      </div>
      <div className="text-2xl font-bold text-black">{value}</div>
      {helper && <div className="mt-1 text-xs text-gray-500">{helper}</div>}
    </div>
  );
}

function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`border border-gray-100 rounded-2xl p-5 bg-white ${className}`}>
      <h3 className="text-sm font-semibold text-black mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export default function ProfessionalGeneralCharts({ reports = [], programacao = [] }) {
  const officialMetrics = useMemo(() => consolidateOfficialDashboardMetrics({ reports, programacao }), [reports, programacao]);
  const porMes = useMemo(() => {
    const rows = buildMonthlyRows([], programacao);
    const map = new Map(rows.map((row) => [row.key, row]));

    (officialMetrics.audience?.byMonth || []).forEach((item) => {
      if (!map.has(item.key)) {
        const [, monthNumber] = String(item.key || '').split('-').map(Number);
        map.set(item.key, {
          key: item.key,
          mesNumero: monthNumber,
          mes: monthLabel(monthNumber, String(item.key || '').slice(0, 4)),
          publico: 0,
          atividades: 0,
          programacoes: 0,
        });
      }
      const row = map.get(item.key);
      row.atividades = item.atividades || 0;
      row.publico = item.total ?? item.publico_atividades ?? 0;
    });

    return Array.from(map.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }, [officialMetrics, programacao]);
  const totals = useMemo(() => ({
    activities: officialMetrics.activities?.total || 0,
    publicTotal: officialMetrics.audience?.publicoTotal || 0,
  }), [officialMetrics]);

  return (
    <section className="mb-8 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Dados Gerais</h2>
        <p className="mt-1 text-sm text-muted-foreground">Indicadores consolidados dos três museus, de fevereiro/2026 até o mês anterior.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard
          title="Total de Atividades"
          value={fmtInt(totals.activities)}
          helper="atividades aprovadas e deduplicadas dos três museus"
          icon={Activity}
        />

        <StatCard
          title="Público Total"
          value={fmtInt(totals.publicTotal)}
          helper="mesma regra do dashboard de coordenação"
          icon={Users}
        />
      </div>

      {porMes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Público por Mês">
            <LineChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip formatter={(value) => [Math.round(value).toLocaleString('pt-BR'), 'Público']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="publico" stroke={publicoLineColor} strokeWidth={2} dot={{ r: 4, fill: publicoLineColor, stroke: publicoLineColor }} activeDot={{ r: 6, fill: publicoLineColor, stroke: publicoLineColor }} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Atividades por Mês">
            <BarChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip formatter={(value) => [Math.round(value).toLocaleString('pt-BR'), 'Atividades']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="atividades" fill={activityBarColor} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartCard>

          <div className="lg:col-span-2 flex justify-center">
            <ChartCard title="Programações por Mês" className="w-full max-w-5xl mx-auto">
              <LineChart data={porMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(value) => [Math.round(value).toLocaleString('pt-BR'), 'Programações']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey="programacoes" stroke={programacaoLineColor} strokeWidth={2} dot={{ r: 4, fill: programacaoLineColor, stroke: programacaoLineColor }} activeDot={{ r: 6, fill: programacaoLineColor, stroke: programacaoLineColor }} />
              </LineChart>
            </ChartCard>
          </div>
        </div>
      )}
    </section>
  );
}
