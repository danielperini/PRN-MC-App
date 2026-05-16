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

const MESES_ORDER = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const publicoLineColor = '#111827';
const activityBarColor = '#374151';
const reportBarColor = '#6b7280';
const programacaoLineColor = '#4b5563';

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

function getActivityPublic(activity) {
  const publicoTotal = toNumber(activity?.publico_total);
  if (publicoTotal > 0) return publicoTotal;
  const publicoEstimado = toNumber(activity?.publico_estimado);
  const repeticoes = Math.max(toNumber(activity?.quantas_repeticoes || activity?.quantas_vezes_ocorreu || 1), 1);
  return publicoEstimado > 0 ? publicoEstimado * repeticoes : 0;
}

function getReportMonthNumber(report) {
  const raw = report?.mes_referencia ?? report?.mes ?? report?.competencia;
  const numeric = Number(raw);
  if (numeric >= 1 && numeric <= 12) return numeric;
  const text = String(raw || '').toLowerCase();
  const idx = MESES_ORDER.findIndex((mes) => text.includes(mes.toLowerCase()));
  if (idx >= 0) return idx + 1;
  if (text.includes('marco')) return 3;
  const created = report?.created_date || report?.updated_date;
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) return d.getMonth() + 1;
  }
  return null;
}

function getReportYear(report) {
  const year = Number(report?.ano ?? report?.ano_referencia);
  if (Number.isFinite(year) && year > 1900) return year;
  const created = report?.created_date || report?.updated_date;
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) return d.getFullYear();
  }
  return new Date().getFullYear();
}

function getDateValue(item) {
  const raw = item?.data_realizacao || item?.data_inicio || item?.data || item?.inicio || item?.created_date || item?.updated_date;
  if (!raw) return null;
  const br = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(year, monthNumber) {
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

function monthLabel(monthNumber, year) {
  const mes = MESES_ORDER[(Number(monthNumber) || 1) - 1] || 'Mês';
  return `${mes.slice(0, 3)}/${String(year).slice(-2)}`;
}

function buildMonthlyRows(reports = [], programacao = []) {
  const map = new Map();

  const ensureRow = (year, monthNumber) => {
    if (!year || !monthNumber) return null;

    const key = monthKey(year, monthNumber);

    if (!map.has(key)) {
      map.set(key, {
        key,
        ano: year,
        mesNumero: monthNumber,
        mes: monthLabel(monthNumber, year),
        publico: 0,
        atividades: 0,
        relatorios: 0,
        programacoes: 0
      });
    }

    return map.get(key);
  };

  (Array.isArray(reports) ? reports : []).forEach((report) => {
    const row = ensureRow(getReportYear(report), getReportMonthNumber(report));
    if (!row) return;

    row.relatorios += 1;
    row.publico += toNumber(report?.publico_geral_declarado || report?.publico_geral || 0);

    const atividades = Array.isArray(report?.atividades) ? report.atividades : [];

    row.atividades += atividades.length;

    atividades.forEach((activity) => {
      row.publico += getActivityPublic(activity);
    });
  });

  (Array.isArray(programacao) ? programacao : []).forEach((item) => {
    const date = getDateValue(item);
    if (!date) return;

    const row = ensureRow(date.getFullYear(), date.getMonth() + 1);

    if (row) row.programacoes += 1;
  });

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
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

function ChartCard({ title, children }) {
  return (
    <div className="border border-gray-100 rounded-2xl p-5 bg-white">
      <h3 className="text-sm font-semibold text-black mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export default function ProfessionalGeneralCharts({ reports = [], programacao = [] }) {
  const porMes = useMemo(() => buildMonthlyRows(reports, programacao), [reports, programacao]);

  const totals = useMemo(() => {
    const activities = reports.flatMap((report) => Array.isArray(report?.atividades) ? report.atividades : []);

    const publicActivities = activities.reduce((sum, a) => sum + getActivityPublic(a), 0);

    const publicGeneral = reports.reduce((sum, r) => sum + toNumber(r.publico_geral_declarado || r.publico_geral || 0), 0);

    return {
      activities: activities.length,
      publicTotal: publicActivities + publicGeneral,
      publicActivities,
      publicGeneral
    };
  }, [reports]);

  return (
    <section className="mb-8 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Dados Gerais</h2>
        <p className="mt-1 text-sm text-muted-foreground">Indicadores consolidados dos três museus.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Total de Atividades"
          value={fmtInt(totals.activities)}
          helper="atividades registradas nos três museus"
          icon={Activity}
        />

        <StatCard
          title="Público Total"
          value={fmtInt(totals.publicTotal)}
          helper="público das atividades e público geral declarado"
          icon={Users}
        />

        <StatCard
          title="Público das Atividades"
          value={fmtInt(totals.publicActivities)}
          helper="somente público registrado nas atividades"
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

          <ChartCard title="Relatórios por Mês">
            <BarChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip formatter={(value) => [Math.round(value).toLocaleString('pt-BR'), 'Relatórios']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="relatorios" fill={reportBarColor} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Programações por Mês">
            <LineChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip formatter={(value) => [Math.round(value).toLocaleString('pt-BR'), 'Programações']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="programacoes" stroke={programacaoLineColor} strokeWidth={2} dot={{ r: 4, fill: programacaoLineColor, stroke: programacaoLineColor }} activeDot={{ r: 6, fill: programacaoLineColor, stroke: programacaoLineColor }} />
            </LineChart>
          </ChartCard>
        </div>
      )}
    </section>
  );
}
