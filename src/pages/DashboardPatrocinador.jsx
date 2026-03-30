import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Calendar, Users, FileText, TrendingUp, Target, Award } from 'lucide-react';
import NewsCarousel from '@/components/dashboard/NewsCarousel';

export default function DashboardPatrocinador() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    periodo: '',
    museus: ['MIS', 'MHAB', 'MUMO'],
    totalAtividadesMes: 0,
    totalAtividadesAno: 0,
    totalPublico: 0,
    statusProjeto: 'Em andamento',
    atividades: [],
    rubricas: [],
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);

      const [activitiesRaw, rubricasRaw, reportsRaw] = await Promise.all([
        base44.entities.Activity.list('-data_realizacao', 200),
        base44.entities.Rubrica.list('grupo', 100),
        base44.entities.Report.filter({ status: 'APPROVED' }),
      ]);

      const now = new Date();
      const mesAtual = now.getMonth() + 1;
      const anoAtual = now.getFullYear();

      // Atividades do mês atual
      const atividadesMes = (activitiesRaw || []).filter(a => {
        if (!a?.data_realizacao) return false;
        const data = new Date(a.data_realizacao);
        return data.getMonth() + 1 === mesAtual && data.getFullYear() === anoAtual;
      });

      // Total público
      const totalPublico = (activitiesRaw || []).reduce((sum, a) => {
        return sum + (Number(a?.publico_total) || 0);
      }, 0);

      // Rubricas - agrupar por macro (Equipe, Manutenção, Consultorias, etc)
      const rubricasAgrupadas = {};
      (rubricasRaw || []).forEach(r => {
        const grupo = r?.grupo || 'Outros';
        if (!rubricasAgrupadas[grupo]) {
          rubricasAgrupadas[grupo] = {
            nome: grupo,
            previsto: 0,
            utilizado: 0,
            saldo: 0,
          };
        }
        rubricasAgrupadas[grupo].previsto += Number(r?.valor_rubrica) || 0;
        rubricasAgrupadas[grupo].utilizado += Number(r?.valor_utilizado) || 0;
        rubricasAgrupadas[grupo].saldo += Number(r?.saldo) || 0;
      });

      const rubricasData = Object.values(rubricasAgrupadas).map(r => ({
        ...r,
        previsto: Number(r.previsto.toFixed(2)),
        utilizado: Number(r.utilizado.toFixed(2)),
        saldo: Number(r.saldo.toFixed(2)),
      }));

      // Atividades por tipo (amostra últimas 10)
      const atividadesPorTipo = {};
      atividadesMes.slice(0, 10).forEach(a => {
        const tipo = a?.tipo_atividade || 'Outro';
        atividadesPorTipo[tipo] = (atividadesPorTipo[tipo] || 0) + 1;
      });

      const atividades = Object.entries(atividadesPorTipo).map(([tipo, count]) => ({
        tipo,
        quantidade: count,
      }));

      const totalOrcado = rubricasData.reduce((sum, r) => sum + r.previsto, 0);
      const totalUtilizado = rubricasData.reduce((sum, r) => sum + r.utilizado, 0);
      const percentualExecucao = totalOrcado > 0 ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(1)) : 0;

      const statusProjeto = reportsRaw?.length > 0 ? 'Relatórios aprovados' : 'Em andamento';

      setData({
        periodo: `${mesAtual}/${anoAtual}`,
        museus: ['MIS', 'MHAB', 'MUMO'],
        totalAtividadesMes: atividadesMes.length,
        totalAtividadesAno: activitiesRaw?.length || 0,
        totalPublico,
        statusProjeto,
        percentualExecucao,
        atividades,
        rubricas: rubricasData,
        totalOrcado,
        totalUtilizado,
        relatoriosAprovados: reportsRaw?.length || 0,
      });
    } catch (error) {
      console.error('Erro ao carregar dashboard patrocinador:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto" />
          <p className="text-slate-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg p-6">
        <h1 className="text-3xl font-bold mb-2">Painel Executivo do Projeto</h1>
        <p className="text-slate-300">Período: {data.periodo} | Museus: {data.museus.join(', ')}</p>
        <div className="flex items-center gap-2 mt-3 text-sm bg-slate-700/50 w-fit px-3 py-1 rounded-full">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          {data.statusProjeto}
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-600">
              <Calendar className="w-4 h-4" />
              Atividades (Mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{data.totalAtividadesMes}</div>
            <p className="text-xs text-slate-500 mt-1">{data.totalAtividadesAno} no acumulado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-600">
              <Users className="w-4 h-4" />
              Público Atingido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{data.totalPublico.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">pessoas/participações</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-600">
              <TrendingUp className="w-4 h-4" />
              Execução Orçamentária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{data.percentualExecucao}%</div>
            <p className="text-xs text-slate-500 mt-1">do orçamento previsto</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-600">
              <FileText className="w-4 h-4" />
              Relatórios Aprovados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{data.relatoriosAprovados}</div>
            <p className="text-xs text-slate-500 mt-1">documentos aprovados</p>
          </CardContent>
        </Card>
      </div>

      {/* Orçamento Executivo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Orçamento Executivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-600 mb-1">Previsto</p>
              <p className="text-xl font-bold text-slate-900">
                R$ {(data.totalOrcado / 1000).toFixed(1)}K
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-slate-600 mb-1">Utilizado</p>
              <p className="text-xl font-bold text-blue-900">
                R$ {(data.totalUtilizado / 1000).toFixed(1)}K
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-slate-600 mb-1">Saldo</p>
              <p className="text-xl font-bold text-green-900">
                R$ {((data.totalOrcado - data.totalUtilizado) / 1000).toFixed(1)}K
              </p>
            </div>
          </div>

          {data.rubricas.length > 0 && (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.rubricas}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(value) => `R$ ${(value / 1000).toFixed(1)}K`} />
                  <Legend />
                  <Bar dataKey="previsto" fill="#94a3b8" name="Previsto" />
                  <Bar dataKey="utilizado" fill="#3b82f6" name="Utilizado" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atividades por Tipo */}
      {data.atividades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              Atividades por Tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.atividades}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ tipo, quantidade }) => `${tipo}: ${quantidade}`}
                    outerRadius={80}
                    fill="#3b82f6"
                    dataKey="quantidade"
                  >
                    {data.atividades.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Painel de Notícias */}
      <NewsCarousel />

      {/* Info Rodapé */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-sm text-slate-600">
        <p className="font-medium mb-2">Sobre este painel</p>
        <p>
          Esse dashboard apresenta uma visão executiva e institucional do projeto Museus Centro. Os dados mostrados são filtrados
          e consolidados para foco em resultados e indicadores principais. Para análises operacionais e detalhadas, acesse as demais
          seções da plataforma.
        </p>
      </div>
    </div>
  );
}