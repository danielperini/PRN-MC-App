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
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v || 0);

const getAtividadeDate = (atividade) => {
  const raw = atividade?.data_realizacao || atividade?.data_programacao || atividade?.data || atividade?.created_date || atividade?.updated_date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getAtividadePublico = (atividade) => {
  const publicoDireto =
    Number(atividade?.publico_total) ||
    Number(atividade?.publico_estimado) ||
    Number(atividade?.publico) ||
    0;

  if (publicoDireto > 0) return publicoDireto;

  const publicoMedio =
    Number(atividade?.publico_medio) ||
    Number(atividade?.publico_medio_sessao) ||
    Number(atividade?.publico_por_sessao) ||
    0;

  const ocorrencias =
    Number(atividade?.quantas_vezes_ocorreu) ||
    Number(atividade?.qtd_ocorrencias) ||
    Number(atividade?.ocorrencias) ||
    1;

  return publicoMedio * ocorrencias;
};

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
        base44.entities.Report.filter({ status: 'APPROVED' }, '-updated_date', 200),
        base44.entities.Programacao.list('-data_realizacao', 200).catch(() => []),
        base44.entities.Rubrica.list('ordem_exibicao', 300),
      ]);

      const todasAsAtividades = [
        ...(reportsRaw || []).filter(r => r.atividades).flatMap(r => r.atividades || []),
        ...(programacaoRaw || [])
      ];

      const atividadesPorMes = {};
      todasAsAtividades.forEach((a) => {
        const d = getAtividadeDate(a);
        if (!d) return;
        const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!atividadesPorMes[chave]) atividadesPorMes[chave] = { mes: chave, atividades: 0, publico: 0 };
        atividadesPorMes[chave].atividades += 1;
        atividadesPorMes[chave].publico += getAtividadePublico(a);
      });
      const dadosMensais = Object.values(atividadesPorMes).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);

      const mesReferencia = dadosMensais.length > 0 ? dadosMensais[dadosMensais.length - 1].mes : null;
      const [anoReferencia, mesReferenciaNumero] = mesReferencia
        ? mesReferencia.split('-').map(Number)
        : [new Date().getFullYear(), new Date().getMonth() + 1];

      const atividadesMes = todasAsAtividades.filter((a) => {
        const d = getAtividadeDate(a);
        if (!d) return false;
        return d.getMonth() + 1 === mesReferenciaNumero && d.getFullYear() === anoReferencia;
      });

      const publicoMes = atividadesMes.reduce((sum, a) => sum + getAtividadePublico(a), 0);
      const totalPublico = todasAsAtividades.reduce((sum, a) => sum + getAtividadePublico(a), 0);

      const atividadesClassificacao = {};
      atividadesMes.forEach((a) => {
        const c = a?.classificacao || 'Outro';
        atividadesClassificacao[c] = (atividadesClassificacao[c] || 0) + 1;
      });
      const dadosClassificacao = Object.entries(atividadesClassificacao).map(([nome, quantidade]) => ({
        nome, quantidade,
        display: nome === 'META' ? 'Metas' : nome === 'ROTINA' ? 'Rotina' : nome === 'EXTRA' ? 'Extra' : nome
      }));

      // Rubricas — apenas ativas, deduplicadas
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
        const previsto = Number(r?.valor_rubrica || 0);
        const utilizado = Number(r?.valor_utilizado || 0);
        rubricasAgrupadas[grupo].previsto += previsto;
        rubricasAgrupadas[grupo].utilizado += utilizado;
        rubricasAgrupadas[grupo].saldo += (previsto - utilizado);
      });
      const rubricasData = Object.values(rubricasAgrupadas).map((r) => ({
        ...r, previsto: Number(r.previsto.toFixed(2)), utilizado: Number(r.utilizado.toFixed(2)), saldo: Number(r.saldo.toFixed(2))
      }));

      const atividadesPorTipo = {};
      atividadesMes.forEach((a) => {
        const tipo = a?.tipo_atividade || a?.tipo_programacao || 'Outro';
        atividadesPorTipo[tipo] = (atividadesPorTipo[tipo] || 0) + 1;
      });
      const atividades = Object.entries(atividadesPorTipo).filter(([, c]) => c > 0).map(([tipo, quantidade]) => ({ tipo, quantidade }));

      const totalUtilizado = rubricasData.reduce((sum, r) => sum + r.utilizado, 0);
      const totalOrcado = TOTAL_OFICIAL;
      const saldoTotal = TOTAL_OFICIAL - totalUtilizado;
      const percentualExecucao = Number((totalUtilizado / TOTAL_OFICIAL * 100).toFixed(1));

      setData({
        periodo: `${mesReferenciaNumero}/${anoReferencia}`,
        museus: ['MIS', 'MHAB', 'MUMO'],
        totalAtividadesMes: atividadesMes.length,
        totalAtividadesAno: todasAsAtividades.length,
        totalPublico, publicoMes,
        percentualExecucao, atividades,
        rubricas: rubricasData, totalOrcado, totalUtilizado, saldoTotal,
        dadosMensais, dadosClassificacao,
        hasData: reportsRaw?.length > 0 || todasAsAtividades.length > 0
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

    // Polling a cada 60s em background (sem spinner)
    const interval = setInterval(() => loadDashboardData(true), 60000);

    // Subscrições em tempo real
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
      {/* Header */}
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

      {/* KPIs */}
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
          <p className="text-sm mt-2" style={{ opacity: 0.8 }}>{data.totalAtividadesAno} no acumulado total</p>
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
      </div>
    </div>
  );
}
