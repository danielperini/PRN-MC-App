import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Calendar, Users, FileText, TrendingUp, Target, Award, RotateCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewsCarousel from '@/components/dashboard/NewsCarousel';
import RubricaSelectorPanel from '@/components/patrocinador/RubricaSelectorPanel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
'@/components/ui/select';

export default function DashboardPatrocinador() {
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [filterTipoAtividade, setFilterTipoAtividade] = useState('todas');
  const [chartTypeOrcamento, setChartTypeOrcamento] = useState('bar');
  const [filterCategoriaAtividade, setFilterCategoriaAtividade] = useState('todas');
  const [data, setData] = useState({
    periodo: '',
    museus: ['MIS', 'MHAB', 'MUMO'],
    totalAtividadesMes: 0,
    totalAtividadesAno: 0,
    totalPublico: 0,
    statusProjeto: 'Em andamento',
    atividades: [],
    rubricas: [],
    dadosMensais: [],
    dadosClassificacao: []
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
      base44.entities.Report.filter({ status: 'APPROVED' })]
      );

      const now = new Date();
      const mesAtual = now.getMonth() + 1;
      const anoAtual = now.getFullYear();

      // Atividades por mês
      const atividadesPorMes = {};
      (activitiesRaw || []).forEach((a) => {
        if (!a?.data_realizacao) return;
        const data = new Date(a.data_realizacao);
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        const chave = `${ano}-${mes}`;
        if (!atividadesPorMes[chave]) {
          atividadesPorMes[chave] = { mes: chave, atividades: 0, publico: 0 };
        }
        atividadesPorMes[chave].atividades += 1;
        atividadesPorMes[chave].publico += Number(a?.publico_total) || 0;
      });

      const dadosMensais = Object.values(atividadesPorMes).
      sort((a, b) => a.mes.localeCompare(b.mes)).
      slice(-12);

      // Atividades do mês atual
      const atividadesMes = (activitiesRaw || []).filter((a) => {
        if (!a?.data_realizacao) return false;
        const data = new Date(a.data_realizacao);
        return data.getMonth() + 1 === mesAtual && data.getFullYear() === anoAtual;
      });

      // Atividades por classificação
      const atividadesClassificacao = {};
      atividadesMes.forEach((a) => {
        const classificacao = a?.classificacao || 'Outro';
        atividadesClassificacao[classificacao] = (atividadesClassificacao[classificacao] || 0) + 1;
      });

      const dadosClassificacao = Object.entries(atividadesClassificacao).map(([nome, quantidade]) => ({
        nome,
        quantidade,
        display: nome === 'META' ? 'Metas' : nome === 'ROTINA' ? 'Rotina' : nome === 'EXTRA' ? 'Extra' : nome
      }));

      // Total público
      const totalPublico = (activitiesRaw || []).reduce((sum, a) => {
        return sum + (Number(a?.publico_total) || 0);
      }, 0);

      // Rubricas - agrupar por macro (Equipe, Manutenção, Consultorias, etc)
      const rubricasAgrupadas = {};
      (rubricasRaw || []).forEach((r) => {
        const grupo = r?.grupo || 'Outros';
        if (!rubricasAgrupadas[grupo]) {
          rubricasAgrupadas[grupo] = {
            nome: grupo,
            previsto: 0,
            utilizado: 0,
            saldo: 0
          };
        }
        // Usa campos reais: valor_total, valor_utilizado_aprovado, saldo_disponivel
        rubricasAgrupadas[grupo].previsto += Number(r?.valor_total) || 0;
        rubricasAgrupadas[grupo].utilizado += Number(r?.valor_utilizado_aprovado) || 0;
        rubricasAgrupadas[grupo].saldo += Number(r?.saldo_disponivel) || 0;
      });

      const rubricasData = Object.values(rubricasAgrupadas).map((r) => ({
        ...r,
        previsto: Number(r.previsto.toFixed(2)),
        utilizado: Number(r.utilizado.toFixed(2)),
        saldo: Number(r.saldo.toFixed(2))
      }));

      // Atividades por tipo (amostra últimas 10)
      const atividadesPorTipo = {};
      atividadesMes.slice(0, 10).forEach((a) => {
        const tipo = a?.tipo_atividade || 'Outro';
        atividadesPorTipo[tipo] = (atividadesPorTipo[tipo] || 0) + 1;
      });

      const atividades = Object.entries(atividadesPorTipo).map(([tipo, count]) => ({
        tipo,
        quantidade: count
      }));

      const totalOrcado = rubricasData.reduce((sum, r) => sum + r.previsto, 0);
      const totalUtilizado = rubricasData.reduce((sum, r) => sum + r.utilizado, 0);
      const percentualExecucao = totalOrcado > 0 ? Number((totalUtilizado / totalOrcado * 100).toFixed(1)) : 0;

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
        dadosMensais,
        dadosClassificacao,
        allActivitiesRaw: activitiesRaw || []
      });
      setLastUpdate(new Date());
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
      </div>);

  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg p-6">
        <h1 className="text-3xl font-bold mb-2">Painel Executivo do Projeto</h1>
        <p className="text-slate-300">Período: {data.periodo} | Museus: {data.museus.join(', ')}</p>
        


        
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">Período</label>
          <Select defaultValue="todos">
            <SelectTrigger>
              <SelectValue placeholder="Selecionar período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {data.dadosMensais?.map((m) =>
              <SelectItem key={m.mes} value={m.mes}>{m.mes}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">Classificação</label>
          <Select defaultValue="todas">
            <SelectTrigger>
              <SelectValue placeholder="Selecionar análise" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as atividades</SelectItem>
              <SelectItem value="META">Apenas Metas</SelectItem>
              <SelectItem value="ROTINA">Apenas Rotina</SelectItem>
              <SelectItem value="EXTRA">Apenas Extra</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">Tipo de Atividade</label>
          <Select value={filterCategoriaAtividade} onValueChange={setFilterCategoriaAtividade}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="Atividades Educativas">Educativas</SelectItem>
              <SelectItem value="Consultorias">Consultorias</SelectItem>
              <SelectItem value="Museus">Museus</SelectItem>
              <SelectItem value="Variados">Variados</SelectItem>
            </SelectContent>
          </Select>
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
      <Card className="border-2 border-black">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Orçamento Executivo
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 bg-white rounded border-2 border-black p-1">
                <Button
                  size="sm"
                  variant={chartTypeOrcamento === 'bar' ? 'default' : 'ghost'}
                  onClick={() => setChartTypeOrcamento('bar')}
                  className={`text-xs ${chartTypeOrcamento === 'bar' ? 'bg-black text-white' : 'text-black hover:bg-gray-100'}`}>
                  
                  Colunas
                </Button>
                <Button
                  size="sm"
                  variant={chartTypeOrcamento === 'pie' ? 'default' : 'ghost'}
                  onClick={() => setChartTypeOrcamento('pie')}
                  className={`text-xs ${chartTypeOrcamento === 'pie' ? 'bg-black text-white' : 'text-black hover:bg-gray-100'}`}>
                  
                  Pizza
                </Button>
              </div>
              {lastUpdate &&
              <span className="text-xs text-slate-500">
                  Atualizado: {lastUpdate.toLocaleString('pt-BR')}
                </span>
              }
              <Button
                size="sm"
                variant="ghost"
                onClick={loadDashboardData}
                disabled={loading}
                className="gap-1.5">
                
                <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 border-2 border-black">
              <p className="text-sm font-medium text-black mb-1">Previsto</p>
              <p className="text-xl font-bold text-black">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.totalOrcado)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border-2 border-black">
              <p className="text-sm font-medium text-black mb-1">Utilizado</p>
              <p className="text-xl font-bold text-black">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.totalUtilizado)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border-2 border-black">
              <p className="text-sm font-medium text-black mb-1">Saldo</p>
              <p className="text-xl font-bold text-black">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.totalOrcado - data.totalUtilizado)}
              </p>
            </div>
          </div>

          {data.rubricas.length > 0 &&
          <div className="h-96 border-2 border-black rounded-lg p-4 bg-white">
              <ResponsiveContainer width="100%" height="100%">
                {chartTypeOrcamento === 'bar' ?
              <BarChart data={data.rubricas} margin={{ top: 20, right: 30, left: 0, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#000000" strokeWidth={1.5} />
                    <XAxis
                  dataKey="nome"
                  angle={-45}
                  textAnchor="end"
                  height={120}
                  tick={{ fontSize: 9, fill: '#000000' }}
                  stroke="#000000"
                  strokeWidth={2} />
                
                    <YAxis
                  stroke="#000000"
                  strokeWidth={2}
                  tick={{ fontSize: 9, fill: '#000000' }} />
                
                    <Tooltip
                  formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                  contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #000000', fontSize: '12px' }} />
                
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="previsto" fill="#ffffff" stroke="#000000" strokeWidth={2} name="Previsto" />
                    <Bar dataKey="utilizado" fill="#000000" stroke="#000000" strokeWidth={2} name="Utilizado" />
                  </BarChart> :

              <PieChart>
                     <Pie
                  data={data.rubricas}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={100}
                  fill="#000000"
                  dataKey="previsto"
                  nameKey="nome">
                  
                       {data.rubricas.map((entry, index) => {
                    const colors = ['#FFD700', '#FF6B6B', '#4169E1', '#32CD32', '#FF8C00', '#DC143C', '#00CED1', '#9370DB', '#FF1493', '#20B2AA'];
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={colors[index % colors.length]}
                        stroke="#000000"
                        strokeWidth={2} />);


                  })}
                     </Pie>
                     <Legend wrapperStyle={{ fontSize: '11px' }} />
                     <Tooltip
                  formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                  contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #000000', fontSize: '12px' }} />
                
                   </PieChart>
              }
              </ResponsiveContainer>
            </div>
          }
        </CardContent>
      </Card>

      {/* Atividades por Classificação */}
      {data.dadosClassificacao && data.dadosClassificacao.length > 0 &&
      <Card className="border-2 border-black">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Atividades por Classificação (Metas, Rotina, Extra)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 border-2 border-black rounded-lg p-4 bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dadosClassificacao} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="0" stroke="#000000" strokeWidth={1.5} />
                  <XAxis
                  dataKey="display"
                  stroke="#000000"
                  strokeWidth={2}
                  tick={{ fontSize: 9, fill: '#000000' }} />
                
                  <YAxis
                  stroke="#000000"
                  strokeWidth={2}
                  tick={{ fontSize: 9, fill: '#000000' }} />
                
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #000000', fontSize: '12px' }} />
                  <Bar dataKey="quantidade" fill="#000000" stroke="#000000" strokeWidth={2} name="Quantidade" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      }

      {/* Atividades por Mês */}
      {data.dadosMensais && data.dadosMensais.length > 0 &&
      <Card className="border-2 border-black">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Atividades e Público por Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 border-2 border-black rounded-lg p-4 bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dadosMensais} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="0" stroke="#000000" strokeWidth={1.5} />
                  <XAxis
                  dataKey="mes"
                  stroke="#000000"
                  strokeWidth={2}
                  tick={{ fontSize: 9, fill: '#000000' }} />
                
                  <YAxis
                  yAxisId="left"
                  stroke="#000000"
                  strokeWidth={2}
                  tick={{ fontSize: 9, fill: '#000000' }}
                  label={{ value: 'Atividades', angle: -90, position: 'insideLeft', fill: '#000000', fontSize: 11 }} />
                
                  <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#000000"
                  strokeWidth={2}
                  tick={{ fontSize: 9, fill: '#000000' }}
                  label={{ value: 'Público', angle: 90, position: 'insideRight', fill: '#000000', fontSize: 11 }} />
                
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #000000', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="atividades" stroke="#000000" strokeWidth={2.5} name="Atividades" />
                  <Line yAxisId="right" type="monotone" dataKey="publico" stroke="#666666" strokeWidth={2.5} name="Público" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      }

      {/* Atividades por Tipo */}
      {data.atividades.length > 0 &&
      <Card className="border-2 border-black">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5" />
                Atividades por Tipo
              </CardTitle>
              <div className="w-48">
                <Select value={filterTipoAtividade} onValueChange={setFilterTipoAtividade}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todos os tipos</SelectItem>
                    {data.atividades.map((item) =>
                  <SelectItem key={item.tipo} value={item.tipo}>{item.tipo}</SelectItem>
                  )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80 border-2 border-black rounded-lg p-4 bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                  data={filterTipoAtividade === 'todas' ? data.atividades : data.atividades.filter((a) => a.tipo === filterTipoAtividade)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={80}
                  fill="#000000"
                  dataKey="quantidade"
                  nameKey="tipo">
                  
                    {(filterTipoAtividade === 'todas' ? data.atividades : data.atividades.filter((a) => a.tipo === filterTipoAtividade)).map((entry, index) => {
                    const colors = ['#FFD700', '#FF6B6B', '#4169E1', '#32CD32', '#FF8C00', '#DC143C', '#00CED1', '#9370DB', '#FF1493', '#20B2AA'];
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={colors[index % colors.length]}
                        stroke="#000000"
                        strokeWidth={2} />);


                  })}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #000000', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      }

      {/* Painel de Análise de Rubrica Individual */}
      <RubricaSelectorPanel />

      {/* Painel de Notícias */}
      <NewsCarousel />

      {/* Info Rodapé */}
      <div className="bg-white rounded-lg p-4 border-2 border-black text-sm text-black">
        <p className="font-medium mb-2">Sobre este painel</p>
        <p>
          Esse dashboard apresenta uma visão executiva e institucional do projeto Museus Centro. Os dados mostrados são filtrados
          e consolidados para foco em resultados e indicadores principais. Para análises operacionais e detalhadas, acesse as demais
          seções da plataforma.
        </p>
      </div>
    </div>);

}