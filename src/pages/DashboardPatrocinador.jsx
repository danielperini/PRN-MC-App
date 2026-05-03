import React, { useEffect, useState, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Calendar, Users, TrendingUp, Target, Award, RotateCw, Filter, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewsCarousel from '@/components/dashboard/NewsCarousel';
import RubricaSelectorPanel from '@/components/patrocinador/RubricaSelectorPanel';
import AgendaCard from '@/components/patrocinador/AgendaCard';
import DataSyncAuditPanel from '@/components/dashboard/DataSyncAuditPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/context/ThemeContext';

const CHART_COLORS = ['#6366f1','#f97316','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#14b8a6'];
const CHART_COLORS_MUSEUBH = ['#2E6F95','#7A1E2C','#D9C6A5','#5FA8D3','#8B4513','#4B0082','#D4A574','#654321'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v || 0);

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function isApproved(status) {
  return ['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(String(status || '').toUpperCase());
}

function getReportMonthNumber(report) {
  const mesRef = String(report?.mes_referencia || '').trim();
  const idx = MESES.findIndex((m) => m.toLowerCase() === mesRef.toLowerCase());
  return idx >= 0 ? idx + 1 : null;
}

function getReportYear(report) {
  return Number(report?.ano) || new Date().getFullYear();
}

function getActivityCount(activity) {
  return Math.max(1, toInt(activity?.quantas_vezes_ocorreu || 1));
}

function getActivityPublic(activity) {
  const vezes = getActivityCount(activity);
  const publicoBase = toInt(activity?.publico_total || activity?.publico_medio || activity?.publico_estimado || 0);

  if (activity?.publico_total) return publicoBase;
  return vezes * publicoBase;
}

export default function DashboardPatrocinador() {
  const { themeId } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const isFetchingRef = useRef(false);
  const [filterTipoAtividade, setFilterTipoAtividade] = useState('todas');
  const [chartTypeOrcamento, setChartTypeOrcamento] = useState('bar');
  const chartColors = themeId === 'museubh' ? CHART_COLORS_MUSEUBH : CHART_COLORS;
  const [data, setData] = useState({
    periodo: '',
    museus: ['MIS', 'MHAB', 'MUMO'],
    totalAtividadesMes: 0,
    totalAtividadesAno: 0,
    totalPublico: 0,
    publicoMes: 0,
    atividades: [],
    rubricas: [],
    dadosMensais: [],
    dadosClassificacao: [],
    totalOrcado: 0,
    totalUtilizado: 0,
    saldoTotal: 0,
    percentualExecucao: 0,
    hasData: false,
  });

  const loadDashboardData = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [reportsRaw, programacaoRaw, rubricasRaw] = await Promise.all([
        base44.entities.Report.list('-updated_date', 300).catch(() => []),
        base44.entities.Programacao.list('-data_realizacao', 300).catch(() => []),
        base44.entities.Rubrica.list('ordem_exibicao', 300),
      ]);

      const now = new Date();
      const mesAtual = now.getMonth() + 1;
      const anoAtual = now.getFullYear();

      const reportsAprovados = (reportsRaw || []).filter((r) => isApproved(r?.status));

      const atividadesRelatorios = reportsAprovados.flatMap((report) => {
        const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
        const reportMes = getReportMonthNumber(report);
        const reportAno = getReportYear(report);

        return atividades.map((atividade) => ({
          ...atividade,
          __origem: 'report',
          __mes: reportMes,
          __ano: reportAno,
          __museu: atividade?.museu || report?.museu || '',
        }));
      });

      const atividadesProgramacao = (programacaoRaw || []).map((atividade) => {
        const dataField = atividade?.data_realizacao || atividade?.data_programacao || atividade?.data_inicio || atividade?.data;
        const d = dataField ? new Date(dataField) : null;
        return {
          ...atividade,
          __origem: 'programacao',
          __mes: d && !Number.isNaN(d.getTime()) ? d.getMonth() + 1 : null,
          __ano: d && !Number.isNaN(d.getTime()) ? d.getFullYear() : null,
          __museu: atividade?.museu || atividade?.local || '',
        };
      });

      const todasAsAtividades = [...atividadesRelatorios, ...atividadesProgramacao];

      const atividadesPorMes = {};
      todasAsAtividades.forEach((a) => {
        const mes = a.__mes;
        const ano = a.__ano;
        if (!mes || !ano) return;

        const chave = `${ano}-${String(mes).padStart(2, '0')}`;
        if (!atividadesPorMes[chave]) atividadesPorMes[chave] = { mes: chave, atividades: 0, publico: 0 };

        atividadesPorMes[chave].atividades += getActivityCount(a);
        atividadesPorMes[chave].publico += getActivityPublic(a);
      });

      const dadosMensais = Object.values(atividadesPorMes)
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .slice(-12);

      const atividadesMes = todasAsAtividades.filter((a) => a.__mes === mesAtual && a.__ano === anoAtual);

      const totalAtividadesMes = atividadesMes.reduce((sum, a) => sum + getActivityCount(a), 0);
      const totalAtividadesAno = todasAsAtividades
        .filter((a) => a.__ano === anoAtual)
        .reduce((sum, a) => sum + getActivityCount(a), 0);

      const publicoMes = atividadesMes.reduce((sum, a) => sum + getActivityPublic(a), 0);
      const totalPublico = todasAsAtividades.reduce((sum, a) => sum + getActivityPublic(a), 0);

      const atividadesClassificacao = {};
      atividadesMes.forEach((a) => {
        const c = a?.classificacao || 'Outro';
        atividadesClassificacao[c] = (atividadesClassificacao[c] || 0) + getActivityCount(a);
      });

      const dadosClassificacao = Object.entries(atividadesClassificacao).map(([nome, quantidade]) => ({
        nome,
        quantidade,
        display: nome === 'META' ? 'Metas' : nome === 'ROTINA' ? 'Rotina' : nome === 'EXTRA' ? 'Extra' : nome
      }));

      const TOTAL_OFICIAL = 1320000;
      const rubricasUnicas = new Map();

      (rubricasRaw || []).forEach((r) => {
        if (r?.ativo === false) return;
        if (r?.id && !rubricasUnicas.has(r.id)) rubricasUnicas.set(r.id, r);
      });

      const rubricasAgrupadas = {};
      rubricasUnicas.forEach((r) => {
        const grupo = r?.grupo || 'Outros';
        if (!rubricasAgrupadas[grupo]) rubricasAgrupadas[grupo] = { nome: grupo, previsto: 0, utilizado: 0, saldo: 0 };

        const previsto = Number(r?.valor_rubrica || r?.valor_total || 0);
        const utilizado = Number(r?.valor_utilizado || 0);

        rubricasAgrupadas[grupo].previsto += previsto;
        rubricasAgrupadas[grupo].utilizado += utilizado;
        rubricasAgrupadas[grupo].saldo += (previsto - utilizado);
      });

      const rubricasData = Object.values(rubricasAgrupadas).map((r) => ({
        ...r,
        previsto: Number(r.previsto.toFixed(2)),
        utilizado: Number(r.utilizado.toFixed(2)),
        saldo: Number(r.saldo.toFixed(2))
      }));

      const atividadesPorTipo = {};
      atividadesMes.forEach((a) => {
        const tipo = a?.tipo_atividade || a?.tipo_programacao || 'Outro';
        atividadesPorTipo[tipo] = (atividadesPorTipo[tipo] || 0) + getActivityCount(a);
      });

      const atividades = Object.entries(atividadesPorTipo)
        .filter(([, c]) => c > 0)
        .map(([tipo, quantidade]) => ({ tipo, quantidade }));

      const totalUtilizado = rubricasData.reduce((sum, r) => sum + r.utilizado, 0);
      const totalOrcado = TOTAL_OFICIAL;
      const saldoTotal = TOTAL_OFICIAL - totalUtilizado;
      const percentualExecucao = Number((totalUtilizado / TOTAL_OFICIAL * 100).toFixed(1));

      setData({
        periodo: `${mesAtual}/${anoAtual}`,
        museus: ['MIS', 'MHAB', 'MUMO'],
        totalAtividadesMes,
        totalAtividadesAno,
        totalPublico,
        publicoMes,
        percentualExecucao,
        atividades,
        rubricas: rubricasData,
        totalOrcado,
        totalUtilizado,
        saldoTotal,
        dadosMensais,
        dadosClassificacao,
        hasData: reportsAprovados.length > 0 || todasAsAtividades.length > 0
      });

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao carregar dashboard patrocinador:', error);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData(false);

    const interval = setInterval(() => loadDashboardData(true), 60000);

    const unsubscribeReports = base44.entities.Report.subscribe((e) => {
      if (e.type === 'create' || e.type === 'update') loadDashboardData(true);
    });
    const unsubscribeActivities = base44.entities.Activity.subscribe((e) => {
      if (e.type === 'create' || e.type === 'update') loadDashboardData(true);
    });
    const unsubscribeRubricas = base44.entities.Rubrica.subscribe((e) => {
      if (e.type === 'update') loadDashboardData(true);
    });
    const unsubscribePayments = base44.entities.TeamPayment.subscribe((e) => {
      if (e.type === 'create' || e.type === 'update') loadDashboardData(true);
    });
    const unsubscribePurchases = base44.entities.PurchaseRequest.subscribe((e) => {
      if (e.type === 'create' || e.type === 'update') loadDashboardData(true);
    });

    return () => {
      clearInterval(interval);
      unsubscribeReports();
      unsubscribeActivities();
      unsubscribeRubricas();
      unsubscribePayments();
      unsubscribePurchases();
    };
  }, [loadDashboardData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 text-base">Carregando painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div style={{
        background: themeId === 'museubh'
          ? 'linear-gradient(135deg, #2E6F95 0%, #7A1E2C 100%)'
          : 'linear-gradient(135deg, #111827 0%, #374151 100%)',
        color: 'white'
      }} className="rounded-2xl p-8">
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div>
            <p style={{ color: themeId === 'museubh' ? '#D9C6A5' : '#9CA3AF' }} className="text-xs font-bold uppercase tracking-widest mb-2">Painel Observador</p>
            <h1 className="text-4xl font-extrabold mb-2 tracking-tight">Museus Centro</h1>
            <p style={{ color: themeId === 'museubh' ? '#D9C6A5' : '#D1D5DB' }} className="text-base">{data.museus.join(' · ')} &nbsp;|&nbsp; Período: {data.periodo}</p>
          </div>
          <div className="text-right">
            <p style={{ color: themeId === 'museubh' ? '#D9C6A5' : '#9CA3AF' }} className="text-xs uppercase tracking-widest mb-1">Orçamento oficial</p>
            <p className="text-3xl font-bold">R$ 1.320.000</p>
            <Button size="sm" variant="outline" onClick={() => loadDashboardData(false)} disabled={loading || refreshing}
              className="mt-3 border-white/30 text-white hover:bg-white/10 gap-1.5 text-xs bg-transparent">
              <RotateCw className={`w-3.5 h-3.5 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
              {loading ? 'Carregando...' : refreshing ? 'Atualizando...' : 'Atualizar'}
            </Button>
            {lastUpdate && (
              <p style={{ color: themeId === 'museubh' ? '#D9C6A5' : '#818CF8' }} className="text-xs mt-1 flex items-center gap-1">
                {refreshing && <RotateCw className="w-2.5 h-2.5 animate-spin inline" />}
                Atualizado {lastUpdate.toLocaleTimeString('pt-BR')}
              </p>
            )}
          </div>
        </div>
      </div>

      {!data.hasData && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-base text-amber-800 font-medium">
          ⚠️ Sem dados disponíveis. Sincronize relatórios aprovados e atividades para visualizar métricas.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div style={{
          background: themeId === 'museubh'
            ? 'linear-gradient(135deg, #2E6F95 0%, #5FA8D3 100%)'
            : 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)'
        }} className="rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5" style={{ opacity: 0.8 }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ opacity: 0.9 }}>Atividades (mês)</p>
          </div>
          <p className="text-5xl font-extrabold">{data.totalAtividadesMes}</p>
          <p className="text-sm mt-2" style={{ opacity: 0.8 }}>{data.totalAtividadesAno} no acumulado do ano</p>
        </div>

        <div style={{
          background: themeId === 'museubh'
            ? 'linear-gradient(135deg, #D9C6A5 0%, #7A1E2C 100%)'
            : 'linear-gradient(135deg, #10B981 0%, #047857 100%)'
        }} className="rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5" style={{ opacity: 0.8 }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ opacity: 0.9 }}>Público Total</p>
          </div>
          <p className="text-5xl font-extrabold">{Math.round(data.totalPublico).toLocaleString('pt-BR')}</p>
          <p className="text-sm mt-2" style={{ opacity: 0.8 }}>{Math.round(data.publicoMes).toLocaleString('pt-BR')} este mês</p>
        </div>

        <div style={{
          background: themeId === 'museubh'
            ? 'linear-gradient(135deg, #5FA8D3 0%, #D9C6A5 100%)'
            : 'linear-gradient(135deg, #F97316 0%, #DC2626 100%)'
        }} className="rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5" style={{ opacity: 0.8 }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ opacity: 0.9 }}>Execução Orçam.</p>
          </div>
          <p className="text-5xl font-extrabold">{data.percentualExecucao}%</p>
          <p className="text-sm mt-2" style={{ opacity: 0.8 }}>do orçamento previsto</p>
        </div>

        <div style={{
          background: themeId === 'museubh'
            ? 'linear-gradient(135deg, #7A1E2C 0%, #2E6F95 100%)'
            : 'linear-gradient(135deg, #A855F7 0%, #6D28D9 100%)'
        }} className="rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-5 h-5" style={{ opacity: 0.8 }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ opacity: 0.9 }}>Saldo Disponível</p>
          </div>
          <p className="text-2xl font-extrabold leading-tight">{fmt(data.saldoTotal)}</p>
          <p className="text-sm mt-2" style={{ opacity: 0.8 }}>restante no projeto</p>
        </div>
      </div>

      <Card className="border-0 shadow-xl rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-700 text-white py-5 px-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-white text-xl">
              <Target className="w-5 h-5 text-amber-400" />
              Orçamento Executivo
            </CardTitle>
            <div className="flex gap-1 bg-white/10 rounded-lg p-1">
              <Button size="sm" onClick={() => setChartTypeOrcamento('bar')}
                className={`text-xs rounded-md ${chartTypeOrcamento === 'bar' ? 'bg-white text-slate-900' : 'bg-transparent text-white hover:bg-white/20'}`}>
                Colunas
              </Button>
              <Button size="sm" onClick={() => setChartTypeOrcamento('pie')}
                className={`text-xs rounded-md ${chartTypeOrcamento === 'pie' ? 'bg-white text-slate-900' : 'bg-transparent text-white hover:bg-white/20'}`}>
                Pizza
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl p-5 bg-blue-50 border border-blue-100">
              <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-1">Previsto</p>
              <p className="text-2xl font-bold text-blue-900">{fmt(data.totalOrcado)}</p>
            </div>
            <div className="rounded-xl p-5 bg-orange-50 border border-orange-100">
              <p className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-1">Utilizado</p>
              <p className="text-2xl font-bold text-orange-900">{fmt(data.totalUtilizado)}</p>
            </div>
            <div className="rounded-xl p-5 bg-emerald-50 border border-emerald-100">
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide mb-1">Saldo</p>
              <p className="text-2xl font-bold text-emerald-900">{fmt(data.totalOrcado - data.totalUtilizado)}</p>
            </div>
          </div>

          {data.rubricas.length > 0 ? (
            <div className="h-96 rounded-xl p-4 bg-slate-50 border border-slate-100">
              <ResponsiveContainer width="100%" height="100%">
                {chartTypeOrcamento === 'bar' ? (
                  <BarChart data={data.rubricas} margin={{ top: 20, right: 30, left: 0, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="nome" angle={-45} textAnchor="end" height={120} tick={{ fontSize: 10, fill: '#475569' }} stroke="#cbd5e1" />
                    <YAxis stroke="#cbd5e1" tick={{ fontSize: 10, fill: '#475569' }} />
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }} />
                    <Legend wrapperStyle={{ fontSize: '13px' }} />
                    <Bar dataKey="previsto" fill={chartColors[0]} radius={[4,4,0,0]} name="Previsto" />
                    <Bar dataKey="utilizado" fill={chartColors[1]} radius={[4,4,0,0]} name="Utilizado" />
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie data={data.rubricas} cx="50%" cy="50%" outerRadius={110} dataKey="previsto" nameKey="nome" labelLine={false} label={false}>
                      {data.rubricas.map((_, i) => <Cell key={`c-${i}`} fill={chartColors[i % chartColors.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: '13px' }} />
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }} />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-slate-400 text-base">Nenhuma rubrica com dados orçamentários</p>
            </div>
          )}
        </CardContent>
      </Card>

      {data.dadosClassificacao && data.dadosClassificacao.length > 0 && (
        <Card className="border-0 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-violet-600 to-purple-700 text-white py-5 px-6">
            <CardTitle className="flex items-center gap-2 text-white text-xl">
              <Filter className="w-5 h-5 text-violet-200" />
              Atividades por Classificação
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 bg-white">
            <div className="h-72 rounded-xl bg-slate-50 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dadosClassificacao} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="display" stroke="#cbd5e1" tick={{ fontSize: 14, fill: '#475569', fontWeight: 600 }} />
                  <YAxis stroke="#cbd5e1" tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '14px' }} />
                  <Bar dataKey="quantidade" name="Quantidade" radius={[6,6,0,0]}>
                    {data.dadosClassificacao.map((_, i) => <Cell key={`cc-${i}`} fill={chartColors[i % chartColors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {data.dadosMensais && data.dadosMensais.length > 0 && (
        <Card className="border-0 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-teal-600 to-emerald-700 text-white py-5 px-6">
            <CardTitle className="flex items-center gap-2 text-white text-xl">
              <Calendar className="w-5 h-5 text-teal-200" />
              Atividades e Público por Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 bg-white">
            <div className="h-72 rounded-xl bg-slate-50 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dadosMensais} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" stroke="#cbd5e1" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis yAxisId="left" stroke="#cbd5e1" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#cbd5e1" tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }} />
                  <Legend wrapperStyle={{ fontSize: '13px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="atividades" stroke={chartColors[0]} strokeWidth={3} dot={{ fill: chartColors[0], r: 5 }} name="Atividades" />
                  <Line yAxisId="right" type="monotone" dataKey="publico" stroke={chartColors[2]} strokeWidth={3} dot={{ fill: chartColors[2], r: 5 }} name="Público" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {data.atividades.length > 0 && (
        <Card className="border-0 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-amber-500 to-orange-600 text-white py-5 px-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2 text-white text-xl">
                <Award className="w-5 h-5 text-amber-200" />
                Atividades por Tipo
              </CardTitle>
              <div className="w-48">
                <Select value={filterTipoAtividade} onValueChange={setFilterTipoAtividade}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white">
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todos os tipos</SelectItem>
                    {data.atividades.map((item) => <SelectItem key={item.tipo} value={item.tipo}>{item.tipo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 bg-white">
            <div className="h-72 rounded-xl bg-slate-50 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filterTipoAtividade === 'todas' ? data.atividades : data.atividades.filter((a) => a.tipo === filterTipoAtividade)}
                    cx="50%" cy="50%" outerRadius={100} dataKey="quantidade" nameKey="tipo" labelLine={false} label={false}>
                    {(filterTipoAtividade === 'todas' ? data.atividades : data.atividades.filter((a) => a.tipo === filterTipoAtividade))
                      .map((_, i) => <Cell key={`ct-${i}`} fill={chartColors[i % chartColors.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: '13px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <DataSyncAuditPanel />
      <RubricaSelectorPanel />
      <AgendaCard />
      <NewsCarousel />

      <div className="rounded-xl p-5 bg-slate-50 border border-slate-200 text-slate-600 text-sm">
        <p className="font-semibold text-slate-800 mb-1">Sobre este painel</p>
        <p>Visão executiva e institucional do projeto Museus Centro. Dados filtrados e consolidados para foco em resultados e indicadores principais.</p>
      </div>
    </div>
  );
}
