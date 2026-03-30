import React from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Lightbulb, AlertCircle } from 'lucide-react';

export default function OpportunityMetricsWidget({ reports = [] }) {
  const metrics = React.useMemo(() => {
    let totalOpp = 0;
    const oppPorMes = {};
    const categories = {};

    reports.forEach((report) => {
      const mes = report.mes_referencia || 'Sem mês';
      const opps = Array.isArray(report.oportunidades) ? report.oportunidades : [];
      totalOpp += opps.length;
      oppPorMes[mes] = (oppPorMes[mes] || 0) + opps.length;

      opps.forEach((opp) => {
        const cat = opp.categoria || 'Sem categoria';
        categories[cat] = (categories[cat] || 0) + 1;
      });
    });

    const chartData = Object.entries(oppPorMes).
    map(([mes, count]) => ({ mes, oportunidades: count })).
    slice(-6);

    const topCategories = Object.entries(categories).
    map(([cat, count]) => ({ categoria: cat, count })).
    sort((a, b) => b.count - a.count).
    slice(0, 5);

    return { totalOpp, chartData, topCategories };
  }, [reports]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-black">{metrics.totalOpp}</p>
              <p className="text-sm text-gray-500 mt-1">Total de Oportunidades</p>
            </div>
            <Lightbulb className="w-8 h-8 text-yellow-400 opacity-30" />
          </div>
        </Card>

        







        
      </div>

      



















      

      {metrics.topCategories.length > 0 &&
      <Card className="p-4 border-gray-200">
          <p className="text-sm font-semibold text-black mb-4">Categorias Principais</p>
          <div className="space-y-3">
            {metrics.topCategories.map((cat, idx) =>
          <div key={idx} className="flex items-center justify-between">
                <p className="text-sm text-gray-700 truncate">{cat.categoria}</p>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-32 bg-gray-200 rounded-full overflow-hidden">
                    <div
                  className="h-full bg-black rounded-full"
                  style={{
                    width: `${cat.count / Math.max(...metrics.topCategories.map((c) => c.count), 1) * 100}%`
                  }} />
                
                  </div>
                  <span className="text-sm font-semibold text-black w-8 text-right">{cat.count}</span>
                </div>
              </div>
          )}
          </div>
        </Card>
      }
    </div>);

}