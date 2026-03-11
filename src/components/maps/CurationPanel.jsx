import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Zap, TrendingUp, Target, AlertCircle } from 'lucide-react';

export default function CurationPanel({
  opportunities,
  onRefreshAnalysis,
  isLoadingAnalysis,
  nomeMuseu,
}) {
  // Top 10 parceiros por aderência
  const topParceiros = opportunities
    .sort((a, b) => b.nivel_aderencia - a.nivel_aderencia)
    .slice(0, 10);

  // Top 10 oportunidades de mobilização (Alta prioridade)
  const topOportunidades = opportunities
    .filter(o => o.prioridade === 'Alta')
    .sort((a, b) => b.nivel_aderencia - a.nivel_aderencia)
    .slice(0, 10);

  // Públicos mais frequentes
  const publicosFrequentes = {};
  opportunities.forEach(opp => {
    opp.publicos_alvo?.forEach(pub => {
      publicosFrequentes[pub] = (publicosFrequentes[pub] || 0) + 1;
    });
  });

  const topPublicos = Object.entries(publicosFrequentes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Lacunas de articulação (categorias com menos de 3 instituições)
  const categoriasCont = {};
  opportunities.forEach(opp => {
    categoriasCont[opp.categoria] = (categoriasCont[opp.categoria] || 0) + 1;
  });

  const lacunas = Object.entries(categoriasCont)
    .filter(([_, count]) => count < 3)
    .map(([cat, count]) => ({ categoria: cat, quantidade: count }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-2">{nomeMuseu}</h2>
        <p className="text-slate-300 text-sm">
          Painel de Curadoria Territorial — {opportunities.length} oportunidades mapeadas
        </p>
      </div>

      {/* Botão de Atualização */}
      <div>
        <Button
          onClick={onRefreshAnalysis}
          disabled={isLoadingAnalysis}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2 w-full md:w-auto"
        >
          <Zap className="w-4 h-4" />
          {isLoadingAnalysis ? 'Analisando com IA...' : 'Atualizar Análise com IA'}
        </Button>
      </div>

      {/* Top 10 Parceiros */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-slate-700" />
          <h3 className="text-lg font-bold text-slate-900">Top 10 Parceiros Prioritários</h3>
        </div>
        <div className="space-y-2">
          {topParceiros.map((opp, idx) => (
            <div
              key={opp.id}
              className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-slate-100 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">#{idx + 1}</span>
                  <span className="text-sm font-medium text-slate-800">{opp.nome}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{opp.bairro}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{opp.nivel_aderencia}%</p>
                  <p className="text-xs text-slate-500">{opp.prioridade}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Top Públicos */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Públicos Mais Promissores</h3>
        <div className="flex flex-wrap gap-2">
          {topPublicos.map(([publico, freq]) => (
            <Badge key={publico} className="bg-blue-100 text-blue-800">
              {publico} ({freq})
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      {/* Top Oportunidades de Mobilização */}
      {topOportunidades.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-slate-700" />
            <h3 className="text-lg font-bold text-slate-900">
              Oportunidades de Mobilização (Alta Prioridade)
            </h3>
          </div>
          <div className="space-y-2">
            {topOportunidades.map((opp) => (
              <div key={opp.id} className="p-3 bg-red-50 rounded border border-red-200">
                <p className="font-semibold text-slate-900 text-sm">{opp.nome}</p>
                {opp.potencial_parceria && (
                  <p className="text-xs text-slate-700 mt-1">{opp.potencial_parceria}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {topOportunidades.length > 0 && <Separator />}

      {/* Lacunas de Articulação */}
      {lacunas.length > 0 && (
        <div className="bg-white rounded-lg border border-amber-200 p-6 bg-amber-50">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-700" />
            <h3 className="text-lg font-bold text-amber-900">Lacunas de Articulação</h3>
          </div>
          <p className="text-sm text-amber-800 mb-4">
            Categorias com menos de 3 instituições mapeadas — oportunidades para expansão:
          </p>
          <div className="space-y-2">
            {lacunas.map((lacuna) => (
              <div key={lacuna.categoria} className="flex items-center justify-between p-2 bg-white rounded">
                <span className="text-sm text-slate-700">{lacuna.categoria}</span>
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  {lacuna.quantidade}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}