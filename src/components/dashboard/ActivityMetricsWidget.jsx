import React from 'react';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, TrendingUp } from 'lucide-react';

export default function ActivityMetricsWidget({ reports = [] }) {
  const metrics = React.useMemo(() => {
    let totalMeta = 0;
    let totalRotina = 0;
    let totalExtra = 0;
    let totalPublico = 0;
    const atividadesPorMuseu = {};
    const publicoPorMuseu = {};

    // Apenas relatórios APROVADOS
    const approvedReports = reports.filter(r => r.status === 'APPROVED');
    approvedReports.forEach(report => {
      const atividades = Array.isArray(report.atividades) ? report.atividades : [];
      atividades.forEach(a => {
        if (a.classificacao === 'META') totalMeta++;
        if (a.classificacao === 'ROTINA') totalRotina++;
        if (a.classificacao === 'EXTRA') totalExtra++;
        totalPublico += a.publico_total || 0;

        const museu = report.museu || 'Sem Museu';
        if (!atividadesPorMuseu[museu]) atividadesPorMuseu[museu] = 0;
        atividadesPorMuseu[museu]++;
        
        if (!publicoPorMuseu[museu]) publicoPorMuseu[museu] = 0;
        publicoPorMuseu[museu] += a.publico_total || 0;
      });
    });

    const chartData = Object.entries(atividadesPorMuseu).map(([museu, count]) => ({
      name: museu.substring(0, 10),
      full: museu,
      atividades: count,
      publico: publicoPorMuseu[museu] || 0,
    }));

    const classData = [
      { name: 'Metas', value: totalMeta, color: '#000' },
      { name: 'Rotina', value: totalRotina, color: '#6b7280' },
      { name: 'Extra', value: totalExtra, color: '#d1d5db' },
    ].filter(d => d.value > 0);

    return { totalMeta, totalRotina, totalExtra, totalPublico, chartData, classData };
  }, [reports]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-black">{metrics.totalMeta}</p>
              <p className="text-xs text-gray-500">Atividades Meta</p>
            </div>
            <Activity className="w-5 h-5 text-black opacity-20" />
          </div>
        </Card>

        <Card className="p-4 border-gray-200">
          <div>
            <p className="text-2xl font-bold text-black">{metrics.totalRotina}</p>
            <p className="text-xs text-gray-500">Atividades Rotina</p>
          </div>
        </Card>

        <Card className="p-4 border-gray-200">
          <div>
            <p className="text-2xl font-bold text-black">{metrics.totalExtra}</p>
            <p className="text-xs text-gray-500">Atividades Extra</p>
          </div>
        </Card>

        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-black">{(metrics.totalPublico || 0).toLocaleString('pt-BR')}</p>
              <p className="text-xs text-gray-500">Público Total</p>
            </div>
            <TrendingUp className="w-5 h-5 text-black opacity-20" />
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {metrics.chartData.length > 0 && (
          <Card className="p-4 border-gray-200">
            <p className="text-sm font-semibold text-black mb-4">Atividades por Museu</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="atividades" fill="#000" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {metrics.chartData.length > 0 && (
          <Card className="p-4 border-gray-200">
            <p className="text-sm font-semibold text-black mb-4">Público por Museu</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
                <Bar dataKey="publico" fill="#6b7280" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {metrics.classData.length > 0 && (
          <Card className="p-4 border-gray-200 md:col-span-3">
            <p className="text-sm font-semibold text-black mb-4">Classificação de Atividades</p>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={metrics.classData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {metrics.classData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {metrics.classData.map(item => (
                <div key={item.name} className="text-center">
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-1"
                    style={{ backgroundColor: item.color }}
                  />
                  <p className="text-xs text-gray-600">{item.name}</p>
                  <p className="text-sm font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}