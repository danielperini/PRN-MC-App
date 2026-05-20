import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, TrendingUp, AlertCircle, Filter, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastMessages } from '@/lib/toastMessages';
import NovaRubricaDialog from '@/components/rubricas/NovaRubricaDialog';
import { canManageRubricas } from '@/components/auth/permissions';

function DashboardFinanceiroInner() {
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const queryClient = useQueryClient();
  const [filterMuseu, setFilterMuseu] = useState('');
  const [filterEquipe, setFilterEquipe] = useState('');
  const [showNovaRubrica, setShowNovaRubrica] = useState(false);
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
