import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, TrendingUp, AlertCircle, Filter, Plus, CheckCircle2, Wallet, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastMessages } from '@/lib/toastMessages';
import NovaRubricaDialog from '@/components/rubricas/NovaRubricaDialog';
import { canManageRubricas } from '@/components/auth/permissions';
import PainelPrevistoVsUtilizado from '@/components/financeiro/PainelPrevistoVsUtilizado';
import MemoriaCalculoDrawer from '@/components/financeiro/MemoriaCalculoDrawer';
import { calcularExecucaoOrcamentariaOficial, isOrigemAditivo } from '@/services/canonicalMetrics';

function DashboardFinanceiroInner() {
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const queryClient = useQueryClient();
  const [filterMuseu, setFilterMuseu] = useState('');
  const [filterEquipe, setFilterEquipe] = useState('');
  const [showNovaRubrica, setShowNovaRubrica] = useState(false);
  const [showMemoria, setShowMemoria] = useState(false);
  const canManage = canManageRubricas(currentUser);

  // Carregar dados financeiros
  const { data: termos = [] } = useQuery({
    queryKey: ['termos-compromisso'],
    queryFn: async () => {
      try {
        const data = await base44.entities.TermoCompromisso.list('-created_date', 500);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.warn('Termos indisponíveis no dashboard financeiro. Mantendo lista vazia.', e);
        return [];
      }
    }
  });

  const { data: pagamentos = [] } = useQuery({
    queryKey: ['pagamentos-fornecedor'],
    queryFn: async () => {
      try {
        const data = await base44.entities.PagamentoFornecedor.list('-data_pagamento', 500);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.warn('Pagamentos indisponíveis no dashboard financeiro. Mantendo lista vazia.', e);
        return [];
      }
    }
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fornecedores'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Fornecedor.list('nome', 500);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoice-submissions'],
    queryFn: async () => {
      try {
        const data = await base44.entities.InvoiceSubmission.list('-data_submissao', 500);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }
  });

  // Rubricas ativas para cálculo de saldo real
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-ativas-dashboard'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Rubrica.filter({ ativo: true }, 'grupo', 500);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }
  });

  // Dados agregados por museu
  const dataByMuseu = useMemo(() => {
    const aggregated = {};
    
    // Somar valores de termos por museu
    termos.forEach(t => {
      const museu = t.museu || 'Sem Museu';
      if (!aggregated[museu]) {
        aggregated[museu] = { museu, termos: 0, pagamentos: 0, invoices: 0 };
      }
      aggregated[museu].termos += t.valor_total || 0;
    });

    // Somar valores de pagamentos por museu
    pagamentos.forEach(p => {
      const museu = p.museu || 'Sem Museu';
      if (!aggregated[museu]) {
        aggregated[museu] = { museu, termos: 0, pagamentos: 0, invoices: 0 };
      }
      aggregated[museu].pagamentos += p.valor_pago || 0;
    });

    // Somar valores de invoices por museu
    invoices.forEach(inv => {
      const museu = inv.museu || 'Sem Museu';
      if (!aggregated[museu]) {
        aggregated[museu] = { museu, termos: 0, pagamentos: 0, invoices: 0 };
      }
      aggregated[museu].invoices += inv.valor_total || 0;
    });

    return Object.values(aggregated).filter(d => d.termos > 0 || d.pagamentos > 0 || d.invoices > 0);
  }, [termos, pagamentos, invoices]);

  // Dados por categoria de fornecedor
  const dataByFornecedor = useMemo(() => {
    const aggregated = {};
    
    pagamentos.forEach(p => {
      const fornecedorId = p.fornecedor_id;
      const fornecedor = fornecedores.find(f => f.id === fornecedorId);
      const nome = fornecedor?.nome || 'Fornecedor Desconhecido';
      
      if (!aggregated[nome]) {
        aggregated[nome] = { name: nome, value: 0, count: 0 };
      }
      aggregated[nome].value += p.valor_pago || 0;
      aggregated[nome].count += 1;
    });

    return Object.values(aggregated)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [pagamentos, fornecedores]);

  // Gastos por tipo de termo (categoria)
  const dataByTermo = useMemo(() => {
    const aggregated = {};
    
    termos.forEach(t => {
      const tipo = t.tipo_termo || 'Outro';
      if (!aggregated[tipo]) {
        aggregated[tipo] = { name: tipo, value: 0, count: 0 };
      }
      aggregated[tipo].value += t.valor_total || 0;
      aggregated[tipo].count += 1;
    });

    return Object.values(aggregated).sort((a, b) => b.value - a.value);
  }, [termos]);

  // Estatísticas gerais
  const stats = useMemo(() => {
    const totalTermos = termos.reduce((sum, t) => sum + (t.valor_total || 0), 0);
    const totalPagamentos = pagamentos.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
    const totalInvoices = invoices.reduce((sum, i) => sum + (i.valor_total || 0), 0);
    const totalGasto = totalTermos + totalPagamentos + totalInvoices;
    
    return { totalTermos, totalPagamentos, totalInvoices, totalGasto };
  }, [termos, pagamentos, invoices]);

  // ── Execução orçamentária oficial — ÚNICA FONTE DE VERDADE ──
  const execucaoOficial = useMemo(() => calcularExecucaoOrcamentariaOficial(rubricas), [rubricas]);

  // Rubricas oficiais para passar ao PainelPrevistoVsUtilizado
  const rubricasOficiais = useMemo(() => rubricas.filter(r => r?.ativo !== false && isOrigemAditivo(r)), [rubricas]);

  // Saldo por aditivo (3º e 4º) para os cards de detalhamento
  const saldoAditivos = useMemo(() => {
    const grupos = {
      '3': { label: '3º Aditivo', previsto: 0, utilizado: 0, count: 0 },
      '4': { label: '4º Aditivo', previsto: 0, utilizado: 0, count: 0 },
    };
    execucaoOficial.itens.forEach(r => {
      const origem = (r.origem_recurso || '').trim();
      const chave = (origem === '3º ADITIVO' || origem === '3º Aditivo') ? '3' : '4';
      grupos[chave].previsto += Number(r?.valor_rubrica ?? r?.valor_total ?? r?.valor_previsto ?? r?.valor ?? 0);
      grupos[chave].utilizado += Number(r?.valor_utilizado ?? r?.valor_executado ?? r?.utilizado ?? r?.realizado ?? 0);
      grupos[chave].count += 1;
    });
    return Object.values(grupos).map(g => ({
      ...g,
      saldo: g.previsto - g.utilizado,
      percentual: g.previsto > 0 ? Math.min(100, (g.utilizado / g.previsto) * 100) : 0,
    }));
  }, [execucaoOficial]);

  const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtPct = (v) => `${Number(v).toFixed(1)}%`;

  const COLORS = ['#000000', '#333333', '#666666', '#999999', '#cccccc'];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight mb-2">
              Dashboard Financeiro
            </h1>
            <p className="text-gray-500">Consolidação de gastos, fornecedores e orçamentos</p>
          </div>
          {canManage && (
            <Button
              onClick={() => setShowNovaRubrica(true)}
              className="bg-black hover:bg-gray-800 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Rubrica
            </Button>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-6 rounded-2xl bg-black text-white">
            <DollarSign className="w-6 h-6 mb-3 opacity-70" />
            <p className="text-sm text-gray-300">Gasto Total</p>
            <p className="text-3xl font-bold mt-2">
              R$ {(stats.totalGasto / 1000).toFixed(1)}k
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-gray-200">
            <TrendingUp className="w-6 h-6 mb-3 text-black opacity-70" />
            <p className="text-sm text-gray-600">Termos de Compromisso</p>
            <p className="text-3xl font-bold text-black mt-2">
              R$ {(stats.totalTermos / 1000).toFixed(1)}k
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-gray-200">
            <DollarSign className="w-6 h-6 mb-3 text-black opacity-70" />
            <p className="text-sm text-gray-600">Pagamentos Confirmados</p>
            <p className="text-3xl font-bold text-black mt-2">
              R$ {(stats.totalPagamentos / 1000).toFixed(1)}k
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-gray-200">
            <AlertCircle className="w-6 h-6 mb-3 text-black opacity-70" />
            <p className="text-sm text-gray-600">Notas Fiscais</p>
            <p className="text-3xl font-bold text-black mt-2">
              R$ {(stats.totalInvoices / 1000).toFixed(1)}k
            </p>
          </div>
        </div>

        {/* Execução Orçamentária Oficial — 3º e 4º Aditivo */}
        <div className="mb-8 rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-black" />
              <h2 className="text-lg font-semibold text-black">Execução Orçamentária Oficial</h2>
              <span className="text-xs text-gray-400 ml-1">3º e 4º Aditivo</span>
            </div>
            <button
              onClick={() => setShowMemoria(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-black border border-gray-200 hover:border-gray-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              <FileSearch className="w-3.5 h-3.5" />
              Ver memória de cálculo
            </button>
          </div>

          {/* Alerta de divergência */}
          {execucaoOficial.divergencia > 1 && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
              <p className="text-xs text-amber-700 font-medium">
                ⚠️ Divergência de {fmt(execucaoOficial.divergencia)} detectada em relação ao orçamento oficial de R$ 1.401.719,85 — verifique rubricas
              </p>
            </div>
          )}

          {/* Cards principais com formato completo */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100 bg-gray-50">
            <div className="px-6 py-5 text-center">
              <p className="text-xs text-gray-500 mb-1">Total Previsto</p>
              <p className="text-2xl font-bold text-black tracking-tight">{fmt(execucaoOficial.previsto)}</p>
              <p className="text-xs text-gray-400 mt-1">base oficial das rubricas</p>
            </div>
            <div className="px-6 py-5 text-center">
              <p className="text-xs text-gray-500 mb-1">Total Utilizado</p>
              <p className="text-2xl font-bold text-gray-800 tracking-tight">
                {fmt(execucaoOficial.utilizado)}
                <span className="text-sm font-normal text-gray-500 ml-2">{fmtPct(execucaoOficial.percentual)}</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">{execucaoOficial.rubricas_ativas} rubricas — {execucaoOficial.grupos} grupos</p>
            </div>
            <div className="px-6 py-5 text-center">
              <p className="text-xs text-gray-500 mb-1">Saldo Disponível</p>
              <p className={`text-2xl font-bold tracking-tight ${execucaoOficial.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(execucaoOficial.saldo)}
              </p>
              <p className="text-xs text-gray-400 mt-1">previsto menos utilizado</p>
            </div>
          </div>

          {/* Detalhes por aditivo */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {saldoAditivos.map(a => (
              <div key={a.label} className="px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-black">{a.label}</h3>
                  <span className="text-xs text-gray-400">{a.count} rubricas</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Previsto</p>
                    <p className="font-semibold text-black text-sm">{fmt(a.previsto)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Utilizado</p>
                    <p className="font-semibold text-gray-700 text-sm">{fmt(a.utilizado)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Saldo</p>
                    <p className={`font-semibold text-sm ${a.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(a.saldo)}</p>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${a.percentual >= 90 ? 'bg-red-500' : a.percentual >= 70 ? 'bg-yellow-500' : 'bg-black'}`}
                    style={{ width: `${a.percentual}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{fmtPct(a.percentual)} utilizado</p>
              </div>
            ))}
          </div>
        </div>

        {/* Painel Previsto vs Utilizado por Rubrica — passa apenas rubricas oficiais */}
        <PainelPrevistoVsUtilizado rubricas={rubricasOficiais} />

        {/* Drawer de memória de cálculo */}
        <MemoriaCalculoDrawer
          open={showMemoria}
          onClose={() => setShowMemoria(false)}
          itens={execucaoOficial.itens}
          previsto={execucaoOficial.previsto}
          utilizado={execucaoOficial.utilizado}
          saldo={execucaoOficial.saldo}
          percentual={execucaoOficial.percentual}
          divergencia={execucaoOficial.divergencia}
        />

        {/* Filtros */}
        <div className="flex gap-3 mb-8 items-center">
          <Filter className="w-5 h-5 text-gray-400" />
          <Select value={filterMuseu} onValueChange={setFilterMuseu}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por museu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos os museus</SelectItem>
              {[...new Set(dataByMuseu.map(d => d.museu))].map(museu => (
                <SelectItem key={museu} value={museu}>{museu}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Gastos por Museu */}
          <div className="p-6 rounded-2xl border border-gray-200">
            <h2 className="text-lg font-semibold text-black mb-6">Gastos por Museu</h2>
            {dataByMuseu.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dataByMuseu}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="museu" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value) => `R$ ${(value / 1000).toFixed(2)}k`}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                  />
                  <Legend />
                  <Bar dataKey="termos" fill="#000000" name="Termos" />
                  <Bar dataKey="pagamentos" fill="#666666" name="Pagamentos" />
                  <Bar dataKey="invoices" fill="#999999" name="Invoices" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-20">Sem dados disponíveis</p>
            )}
          </div>

          {/* Distribuição por Tipo de Termo */}
          <div className="p-6 rounded-2xl border border-gray-200">
            <h2 className="text-lg font-semibold text-black mb-6">Gastos por Tipo de Termo</h2>
            {dataByTermo.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dataByTermo}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: R$ ${(value / 1000).toFixed(1)}k`}
                  >
                    {dataByTermo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `R$ ${(value / 1000).toFixed(2)}k`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-20">Sem dados disponíveis</p>
            )}
          </div>
        </div>

        {/* Top Fornecedores */}
        <div className="p-6 rounded-2xl border border-gray-200 mb-8">
          <h2 className="text-lg font-semibold text-black mb-6">Top 10 Fornecedores</h2>
          {dataByFornecedor.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dataByFornecedor} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                <Tooltip 
                  formatter={(value) => `R$ ${(value / 1000).toFixed(2)}k`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="value" fill="#000000" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-20">Sem dados disponíveis</p>
          )}
        </div>

        {/* Tabela de Detalhes por Museu */}
        <div className="p-6 rounded-2xl border border-gray-200">
          <h2 className="text-lg font-semibold text-black mb-6">Resumo por Museu</h2>
          {dataByMuseu.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-black">Museu</th>
                    <th className="text-right py-3 px-4 font-semibold text-black">Termos (R$)</th>
                    <th className="text-right py-3 px-4 font-semibold text-black">Pagamentos (R$)</th>
                    <th className="text-right py-3 px-4 font-semibold text-black">Invoices (R$)</th>
                    <th className="text-right py-3 px-4 font-semibold text-black">Total (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {dataByMuseu.map(row => (
                    <tr key={row.museu} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-black font-medium">{row.museu}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{(row.termos / 1000).toFixed(2)}k</td>
                      <td className="py-3 px-4 text-right text-gray-600">{(row.pagamentos / 1000).toFixed(2)}k</td>
                      <td className="py-3 px-4 text-right text-gray-600">{(row.invoices / 1000).toFixed(2)}k</td>
                      <td className="py-3 px-4 text-right font-semibold text-black">
                        {((row.termos + row.pagamentos + row.invoices) / 1000).toFixed(2)}k
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-20">Sem dados disponíveis</p>
          )}
        </div>
      </div>
      <NovaRubricaDialog
        open={showNovaRubrica}
        currentUser={currentUser}
        onClose={() => {
          setShowNovaRubrica(false);
          queryClient.invalidateQueries({
            predicate: (query) => String(query.queryKey?.[0] || '').toLowerCase().includes('rubrica'),
          });
        }}
      />
    </div>
  );
}

export default function DashboardFinanceiro() {
  return <RequireAuth><DashboardFinanceiroInner /></RequireAuth>;
}