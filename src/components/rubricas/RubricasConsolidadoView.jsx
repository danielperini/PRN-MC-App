import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, CheckCircle, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const SAUDE_CONFIG = {
  saudavel: { label: 'Saudável', color: 'bg-green-100 text-green-800', icon: CheckCircle, barColor: 'bg-green-500' },
  atencao:  { label: 'Atenção',  color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle, barColor: 'bg-yellow-500' },
  critico:  { label: 'Crítico',  color: 'bg-red-100 text-red-800', icon: AlertCircle, barColor: 'bg-red-500' },
};

function BarPercent({ percent }) {
  const cfg = percent >= 90 ? SAUDE_CONFIG.critico : percent >= 70 ? SAUDE_CONFIG.atencao : SAUDE_CONFIG.saudavel;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${cfg.barColor}`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

export default function RubricasConsolidadoView({ museu }) {
  const { data: consolidados = [], isLoading } = useQuery({
    queryKey: ['rubricas-consolidado', museu],
    queryFn: () => base44.entities.RubricasConsolidado.filter({ museu }),
    staleTime: 30000,
  });

  const dado = consolidados[0];

  if (isLoading) return <div className="text-center py-8 text-gray-400 text-sm">Carregando consolidação...</div>;

  if (!dado) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
        <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Nenhuma consolidação gerada ainda</p>
        <p className="text-sm text-gray-400 mt-1">Clique em "Consolidar com IA" para gerar</p>
      </div>
    );
  }

  const saude = SAUDE_CONFIG[dado.saude_geral] || SAUDE_CONFIG.atencao;
  const SaudeIcon = saude.icon;

  return (
    <div className="space-y-5">
      {/* Header com totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border border-gray-200">
          <p className="text-xs text-gray-500">Orçado Total</p>
          <p className="text-lg font-bold text-black">
            R$ {(dado.totais?.totalOrcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </Card>
        <Card className="p-4 border border-gray-200">
          <p className="text-xs text-gray-500">Utilizado</p>
          <p className="text-lg font-bold text-amber-700">
            R$ {(dado.totais?.totalUtilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-400">{dado.totais?.percentual || 0}%</p>
        </Card>
        <Card className="p-4 border border-gray-200">
          <p className="text-xs text-gray-500">Saldo</p>
          <p className={`text-lg font-bold ${(dado.totais?.saldo || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            R$ {(dado.totais?.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </Card>
        <Card className={`p-4 border ${saude.color.replace('text-', 'border-').replace('-800', '-200')}`}>
          <p className="text-xs text-gray-500">Saúde Geral</p>
          <div className="flex items-center gap-1.5 mt-1">
            <SaudeIcon className="w-4 h-4" />
            <span className={`text-sm font-bold ${saude.color.split(' ')[1]}`}>{saude.label}</span>
          </div>
        </Card>
      </div>

      {/* Categorias */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(dado.categorias_data || []).filter(c => c.rubricas?.length > 0).map(cat => (
          <Card key={cat.key} className="border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-900">{cat.label}</h3>
                <span className="text-xs text-gray-500">{cat.percentual}%</span>
              </div>
              <BarPercent percent={cat.percentual} />
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>Orçado: R$ {cat.totalOrcado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                <span>Saldo: R$ {cat.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {cat.rubricas.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5">
                    <span className="text-xs text-gray-700 truncate flex-1">{r.rubrica}</span>
                    <span className={`text-xs font-semibold ml-2 ${r.percentualUtilizado >= 90 ? 'text-red-700' : r.percentualUtilizado >= 70 ? 'text-amber-700' : 'text-green-700'}`}>
                      {r.percentualUtilizado}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insights IA */}
      {dado.insights_ia && (
        <Card className="border border-blue-100 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-blue-900">Análise da IA</h3>
            </div>
            <p className="text-sm text-blue-800 leading-relaxed">{dado.insights_ia}</p>
          </CardContent>
        </Card>
      )}

      {/* Alertas */}
      {dado.alertas_ia?.length > 0 && (
        <Card className="border border-red-100 bg-red-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-semibold text-red-900">Alertas</h3>
            </div>
            <ul className="space-y-1">
              {dado.alertas_ia.map((a, i) => (
                <li key={i} className="text-sm text-red-800 flex gap-2"><span>•</span>{a}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recomendações */}
      {dado.recomendacoes_ia?.length > 0 && (
        <Card className="border border-green-100 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <h3 className="text-sm font-semibold text-green-900">Recomendações</h3>
            </div>
            <ul className="space-y-1">
              {dado.recomendacoes_ia.map((r, i) => (
                <li key={i} className="text-sm text-green-800 flex gap-2"><span>•</span>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-gray-400 text-right">
        Gerado em: {dado.gerado_em ? new Date(dado.gerado_em).toLocaleString('pt-BR') : '—'}
      </p>
    </div>
  );
}