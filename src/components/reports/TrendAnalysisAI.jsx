import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function TrendAnalysisAI({ museu, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    // Buscar relatórios anteriores do museu
    const allReports = await base44.entities.Report.list('-created_date', 200).catch(() => []);
    const reportsForMuseum = allReports.filter(r => r.museu === museu && r.status === 'APPROVED');

    if (reportsForMuseum.length < 2) {
      setError('É necessário pelo menos 2 relatórios aprovados para análise de tendências');
      setLoading(false);
      return;
    }

    // Preparar dados dos relatórios
    const reportsData = reportsForMuseum.slice(0, 6).map(r => {
      const atividades = Array.isArray(r.atividades) ? r.atividades : [];
      return {
        periodo: `${r.mes_referencia} ${r.ano}`,
        total_atividades: atividades.length,
        meta: atividades.filter(a => a.classificacao === 'META').length,
        rotina: atividades.filter(a => a.classificacao === 'ROTINA').length,
        extra: atividades.filter(a => a.classificacao === 'EXTRA').length,
        publico_total: atividades.reduce((sum, a) => sum + (parseInt(a.publico_estimado) || 0), 0),
        tipos_acao: atividades.map(a => a.tipo_acao).filter(Boolean),
        pontos_positivos: r.avaliacao_pontos_positivos || '',
        desafios: r.avaliacao_desafios || ''
      };
    });

    const prompt = `Você é analista de tendências em gestão cultural e museus.
Analise os dados de relatórios anteriores e identifique:
1. Padrões recorrentes (atividades, horários, públicos)
2. Anomalias ou variações incomuns
3. Tendências ascendentes ou descendentes
4. Recomendações baseadas nas tendências

DADOS DOS RELATÓRIOS (últimos ${reportsData.length} períodos):
${JSON.stringify(reportsData, null, 2)}

Gere uma análise estruturada em JSON com a seguinte estrutura:
{
  "padroes": ["padrão 1", "padrão 2", ...],
  "anomalias": ["anomalia 1", "anomalia 2", ...],
  "tendencias": {
    "atividades": "descrição da tendência",
    "publico": "descrição da tendência",
    "tipos_acao": "descrição da tendência"
  },
  "recomendacoes": ["recomendação 1", "recomendação 2", ...]
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          padroes: { type: 'array', items: { type: 'string' } },
          anomalias: { type: 'array', items: { type: 'string' } },
          tendencias: {
            type: 'object',
            properties: {
              atividades: { type: 'string' },
              publico: { type: 'string' },
              tipos_acao: { type: 'string' }
            }
          },
          recomendacoes: { type: 'array', items: { type: 'string' } }
        }
      }
    }).catch(() => null);

    if (result) {
      setAnalysis(result);
    } else {
      setError('Erro ao gerar análise de tendências');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs w-full"
        onClick={handleAnalyze}
        disabled={loading || disabled}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
        {loading ? 'Analisando tendências...' : 'Analisar Tendências'}
      </Button>

      {error && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">{error}</p>
        </div>
      )}

      {analysis && (
        <div className="space-y-3 border border-purple-200 bg-purple-50/30 rounded-lg p-4">
          {/* Padrões Recorrentes */}
          {analysis.padroes?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-xs font-semibold text-gray-700 uppercase">Padrões Recorrentes</span>
              </div>
              <ul className="space-y-1.5">
                {analysis.padroes.map((p, i) => (
                  <li key={i} className="text-xs text-gray-700 bg-white/50 p-2 rounded border border-green-100">
                    • {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Anomalias */}
          {analysis.anomalias?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-semibold text-gray-700 uppercase">Anomalias Detectadas</span>
              </div>
              <ul className="space-y-1.5">
                {analysis.anomalias.map((a, i) => (
                  <li key={i} className="text-xs text-gray-700 bg-white/50 p-2 rounded border border-orange-100">
                    • {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tendências */}
          {analysis.tendencias && (
            <div>
              <span className="text-xs font-semibold text-gray-700 uppercase block mb-2">Tendências Identificadas</span>
              <div className="grid grid-cols-1 gap-2">
                {analysis.tendencias.atividades && (
                  <div className="bg-white/60 p-2 rounded border border-purple-100">
                    <p className="text-[10px] font-medium text-purple-700 mb-0.5">Atividades</p>
                    <p className="text-xs text-gray-600">{analysis.tendencias.atividades}</p>
                  </div>
                )}
                {analysis.tendencias.publico && (
                  <div className="bg-white/60 p-2 rounded border border-purple-100">
                    <p className="text-[10px] font-medium text-purple-700 mb-0.5">Público</p>
                    <p className="text-xs text-gray-600">{analysis.tendencias.publico}</p>
                  </div>
                )}
                {analysis.tendencias.tipos_acao && (
                  <div className="bg-white/60 p-2 rounded border border-purple-100">
                    <p className="text-[10px] font-medium text-purple-700 mb-0.5">Tipos de Ação</p>
                    <p className="text-xs text-gray-600">{analysis.tendencias.tipos_acao}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recomendações */}
          {analysis.recomendacoes?.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-700 uppercase block mb-2">Recomendações</span>
              <ul className="space-y-1.5">
                {analysis.recomendacoes.map((rec, i) => (
                  <li key={i} className="text-xs text-gray-700 bg-white/50 p-2 rounded border border-blue-100">
                    💡 {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}