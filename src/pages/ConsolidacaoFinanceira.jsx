import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TrendingUp, DollarSign, Building2, Users, Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const COLORS = ['#000000', '#404040', '#808080', '#c0c0c0', '#e8e8e8'];

function ConsolidacaoFinanceiraInner() {
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const [filterMuseu, setFilterMuseu] = useState('all');
  const [filterEquipe, setFilterEquipe] = useState('all');
  const [filterAno, setFilterAno] = useState(new Date().getFullYear().toString());

  // Fetch reports with activities
  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['financial-reports'],
    queryFn: () => base44.entities.Report.list('-created_date', 500),
    enabled: !!currentUser && isCoordenador
  });

  // Fetch purchases
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['purchases-financial'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 1000),
    enabled: !!currentUser && isCoordenador
  });

  // Fetch budget lines
  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines'],
    queryFn: () => base44.entities.BudgetLine.list(),
    enabled: !!currentUser && isCoordenador
  });

  // Filter data
  const filteredReports = reports.filter(r => {
    if (filterMuseu !== 'all' && r.museu !== filterMuseu) return false;
    if (filterAno !== 'all' && r.ano !== parseInt(filterAno)) return false;
    return true;
  });

  const filteredPurchases = purchases.filter(p => {
    if (p.status !== 'PAGO') return false;
    return true;
  });

  // Get unique museums and teams
  const museus = [...new Set(reports.map(r => r.museu).filter(Boolean))];
  const equipes = [...new Set(reports.map(r => r.equipe).filter(Boolean))];
  const anos = [...new Set(reports.map(r => r.ano).filter(Boolean))].sort().reverse();

  // Calculate costs by museum
  const costsByMuseum = museus.map(museo => {
    const museumPurchases = filteredPurchases.filter(p => {
      const purchase = purchases.find(pr => pr.id === p.id);
      const report = reports.find(r => r.id === purchase?.report_id);
      return report?.museu === museo;
    });
    const total = museumPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
    return { name: museo, value: total, count: museumPurchases.length };
  }).filter(m => m.value > 0);

  // Calculate costs by team
  const costsByTeam = equipes.map(team => {
    const teamReports = filteredReports.filter(r => r.equipe === team);
    const teamPurchases = filteredPurchases.filter(p => {
      const report = reports.find(r => r.id === p.report_id);
      return teamReports.some(tr => tr.id === report?.id);
    });
    const total = teamPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
    return { name: team, value: total, count: teamPurchases.length };
  }).filter(t => t.value > 0);

  // Timeline data (monthly)
  const monthlyData = [];
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  
  months.forEach((month, idx) => {
    const monthNum = idx + 1;
    const monthReports = filteredReports.filter(r => {
      const monthIndex = months.indexOf(r.mes_referencia);
      return monthIndex === idx;
    });
    const monthPurchases = filteredPurchases.filter(p => {
      const report = reports.find(r => r.id === p.report_id);
      return monthReports.some(mr => mr.id === report?.id);
    });
    const total = monthPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
    if (total > 0) {
      monthlyData.push({ name: month, value: total });
    }
  });

  // Summary statistics
  const totalCost = filteredPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
  const avgCostPerReport = filteredReports.length > 0 ? totalCost / filteredReports.length : 0;
  const topMuseum = costsByMuseum.length > 0 ? costsByMuseum.reduce((max, m) => m.value > max.value ? m : max) : null;
  const topTeam = costsByTeam.length > 0 ? costsByTeam.reduce((max, t) => t.value > max.value ? t : max) : null;

  const isLoading = loadingReports || loadingPurchases;

  if (!isCoordenador) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-black mb-2">Acesso Restrito</h1>
          <p className="text-gray-500">Apenas coordenadores podem acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight">Consolidação Financeira</h1>
          <p className="text-gray-500 mt-1">Visualize custos totais por museu e equipe ao longo do tempo</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          <Select value={filterAno} onValueChange={setFilterAno}>
            <SelectTrigger className="w-40 h-10 border-gray-200">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {anos.map(a => <SelectItem key={a} value={a.toString()}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMuseu} onValueChange={setFilterMuseu}>
            <SelectTrigger className="w-40 h-10 border-gray-200">
              <Building2 className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Museu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os museus</SelectItem>
              {museus.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterEquipe} onValueChange={setFilterEquipe}>
            <SelectTrigger className="w-40 h-10 border-gray-200">
              <Users className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Equipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as equipes</SelectItem>
              {equipes.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-gray-200 gap-2">
            <Download className="w-4 h-4" />
            Exportar
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando dados...</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card className="p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Gasto</p>
                    <p className="text-2xl font-semibold text-black mt-2">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}
                    </p>
                  </div>
                  <DollarSign className="w-10 h-10 text-gray-200" />
                </div>
              </Card>

              <Card className="p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Custo Médio</p>
                    <p className="text-2xl font-semibold text-black mt-2">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(avgCostPerReport)}
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-gray-200" />
                </div>
              </Card>

              <Card className="p-6 border border-gray-200">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Top Museu</p>
                  <p className="text-xl font-semibold text-black mt-2">{topMuseum?.name || '—'}</p>
                  <p className="text-sm text-gray-400 mt-1">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(topMuseum?.value || 0)}</p>
                </div>
              </Card>

              <Card className="p-6 border border-gray-200">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Top Equipe</p>
                  <p className="text-xl font-semibold text-black mt-2">{topTeam?.name || '—'}</p>
                  <p className="text-sm text-gray-400 mt-1">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(topTeam?.value || 0)}</p>
                </div>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-8 mb-8">
              {/* Costs by Museum */}
              <Card className="p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-black mb-4">Custos por Museu</h3>
                {costsByMuseum.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costsByMuseum}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={v => `R$ ${v.toLocaleString('pt-BR')}`} />
                      <Bar dataKey="value" fill="#000000" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-400 py-10">Sem dados para exibir</p>
                )}
              </Card>

              {/* Costs by Team */}
              <Card className="p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-black mb-4">Custos por Equipe</h3>
                {costsByTeam.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costsByTeam}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={v => `R$ ${v.toLocaleString('pt-BR')}`} />
                      <Bar dataKey="value" fill="#404040" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-gray-400 py-10">Sem dados para exibir</p>
                )}
              </Card>
            </div>

            {/* Timeline */}
            <Card className="p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-black mb-4">Gastos Mensais</h3>
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={v => `R$ ${v.toLocaleString('pt-BR')}`} />
                    <Line type="monotone" dataKey="value" stroke="#000000" strokeWidth={2} dot={{ fill: '#000000', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-gray-400 py-10">Sem dados para exibir</p>
              )}
            </Card>

            {/* Detailed Table */}
            <Card className="p-6 border border-gray-200 mt-8">
              <h3 className="text-lg font-semibold text-black mb-4">Detalhamento por Museu e Equipe</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Museu</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Equipe</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Total Gasto</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Compras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map(report => {
                      const reportPurchases = filteredPurchases.filter(p => p.report_id === report.id);
                      const reportTotal = reportPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
                      return reportPurchases.length > 0 ? (
                        <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-900">{report.museu}</td>
                          <td className="py-3 px-4 text-gray-900">{report.equipe}</td>
                          <td className="py-3 px-4 text-right font-medium text-black">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportTotal)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge className="bg-gray-100 text-gray-700">{reportPurchases.length}</Badge>
                          </td>
                        </tr>
                      ) : null;
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConsolidacaoFinanceira() {
  return <RequireAuth requireRole="COORDENADOR"><ConsolidacaoFinanceiraInner /></RequireAuth>;
}