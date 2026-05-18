import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

export default function BudgetHealthDashboard({ budgetLines, purchases }) {
  const analysis = useMemo(() => {
    if (!budgetLines || budgetLines.length === 0) return null;

    // Totalizadores globais
    const totalOrcado = budgetLines.reduce((sum, l) => sum + (l.valor_total || 0), 0);
    const totalComprometido = budgetLines.reduce((sum, l) => sum + (l.saldo_comprometido || 0), 0);
    const totalDisponivel = totalOrcado - totalComprometido;
    const percentualUsado = totalOrcado > 0 ? (totalComprometido / totalOrcado) * 100 : 0;

    // Dados por rubrica (top 10)
    const rubricasData = budgetLines
      .map(l => ({
        codigo: l.codigo?.substring(0, 8),
        nome: l.descricao?.substring(0, 25),
        total: l.valor_total || 0,
        comprometido: l.saldo_comprometido || 0,
        disponivel: Math.max(0, (l.saldo_inicial || 0) - (l.saldo_comprometido || 0)),
        percentual: l.valor_total ? ((l.saldo_comprometido || 0) / l.valor_total) * 100 : 0,
      }))
      .sort((a, b) => b.comprometido - a.comprometido)
      .slice(0, 10);

    // Distribuição de saúde
    const saudavel = budgetLines.filter(l => {
      const pct = l.valor_total ? ((l.saldo_comprometido || 0) / l.valor_total) * 100 : 0;
      return pct < 70;
    }).length;
    const atencao = budgetLines.filter(l => {
      const pct = l.valor_total ? ((l.saldo_comprometido || 0) / l.valor_total) * 100 : 0;
      return pct >= 70 && pct < 90;
    }).length;
    const critico = budgetLines.filter(l => {
      const pct = l.valor_total ? ((l.saldo_comprometido || 0) / l.valor_total) * 100 : 0;
      return pct >= 90;
    }).length;

    const healthDistribution = [
      { name: 'Saudável', value: saudavel, color: '#10b981' },
      { name: 'Atenção', value: atencao, color: '#f59e0b' },
      { name: 'Crítico', value: critico, color: '#ef4444' },
    ];

    // Evolução mensal (simulada por status de compras)
    const purchasesByMonth = {};
    purchases?.forEach(p => {
      if (p.created_date) {
        const month = p.created_date.substring(0, 7); // YYYY-MM
        if (!purchasesByMonth[month]) purchasesByMonth[month] = 0;
        purchasesByMonth[month] += p.valor_solicitado || 0;
      }
    });

    const monthlyData = Object.entries(purchasesByMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, valor]) => ({
        mes: new Date(month + '-01').toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
        solicitado: valor,
      }));

    return {
      totalOrcado,
      totalComprometido,
      totalDisponivel,
      percentualUsado,
      rubricasData,
      healthDistribution,
      monthlyData,
    };
  }, [budgetLines, purchases]);

  if (!analysis) {
    return (
      <div className="text-center py-12 text-gray-400">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Nenhuma rubrica orçamentária importada</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Orçamento Total (3º Aditivo)</p>
              <p className="break-words text-xl font-bold leading-tight text-black tabular-nums">
                R$ {(analysis.totalOrcado / 1e6).toFixed(2)}M
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Comprometido</p>
              <p className="break-words text-xl font-bold leading-tight text-amber-700 tabular-nums">
                R$ {(analysis.totalComprometido / 1e6).toFixed(2)}M
              </p>
              <p className="text-xs text-amber-600 mt-1">{analysis.percentualUsado.toFixed(1)}% do orçamento</p>
            </div>
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Disponível</p>
              <p className="break-words text-xl font-bold leading-tight text-green-700 tabular-nums">
                R$ {(analysis.totalDisponivel / 1e6).toFixed(2)}M
              </p>
              <p className="text-xs text-green-600 mt-1">{(100 - analysis.percentualUsado).toFixed(1)}% livre</p>
            </div>
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Saúde Orçamentária</p>
              <p className="text-2xl font-bold text-black">{analysis.healthDistribution[0].value}</p>
              <p className="text-xs text-gray-500 mt-1">Rubricas saudáveis (&lt;70%)</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-gray-600">{analysis.healthDistribution[0].value}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saúde das Rubricas (Pizza) */}
        <Card className="p-6 border border-gray-200">
          <h3 className="text-sm font-semibold text-black mb-4">Distribuição de Saúde das Rubricas</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analysis.healthDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {analysis.healthDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {analysis.healthDistribution.map((item, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }} />
                <span className="text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Evolução Mensal de Solicitações */}
        <Card className="p-6 border border-gray-200">
          <h3 className="text-sm font-semibold text-black mb-4">Evolução de Solicitações (últimos 6 meses)</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analysis.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip 
                  formatter={(value) => `R$ ${(value / 1000).toFixed(1)}k`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                />
                <Line
                  type="monotone"
                  dataKey="solicitado"
                  stroke="#000"
                  strokeWidth={2}
                  dot={{ fill: '#000' }}
                  name="Solicitado"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Top 10 Rubricas */}
      <Card className="p-6 border border-gray-200">
        <h3 className="text-sm font-semibold text-black mb-4">Top 10 Rubricas por Comprometimento</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={analysis.rubricasData}
              margin={{ top: 20, right: 30, left: 0, bottom: 100 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="codigo"
                angle={-45}
                textAnchor="end"
                height={100}
                interval={0}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => `R$ ${(value / 1000).toFixed(1)}k`}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
              />
              <Legend />
              <Bar dataKey="comprometido" fill="#10b981" name="Comprometido" />
              <Bar dataKey="disponivel" fill="#e5e7eb" name="Disponível" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabela Detalhada */}
      <Card className="p-6 border border-gray-200 overflow-x-auto">
        <h3 className="text-sm font-semibold text-black mb-4">Todas as Rubricas</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 font-semibold text-gray-700">Código</th>
              <th className="text-left py-2 px-3 font-semibold text-gray-700">Descrição</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-700">Orçado</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-700">Comprometido</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-700">Disponível</th>
              <th className="text-center py-2 px-3 font-semibold text-gray-700">%</th>
            </tr>
          </thead>
          <tbody>
            {budgetLines.map((line, i) => {
              const pct = line.valor_total ? ((line.saldo_comprometido || 0) / line.valor_total) * 100 : 0;
              const statusColor = pct < 70 ? 'text-green-700' : pct < 90 ? 'text-amber-700' : 'text-red-700';
              return (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-mono text-gray-600">{line.codigo}</td>
                  <td className="py-2 px-3 text-gray-700">{line.descricao?.substring(0, 30)}</td>
                  <td className="text-right py-2 px-3 text-gray-700">
                    R$ {(line.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-2 px-3 text-gray-700">
                    R$ {(line.saldo_comprometido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-2 px-3 text-gray-700">
                    R$ {(Math.max(0, (line.saldo_inicial || 0) - (line.saldo_comprometido || 0))).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={`text-center py-2 px-3 font-semibold ${statusColor}`}>
                    {pct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
