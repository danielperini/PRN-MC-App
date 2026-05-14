import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Sparkles, Users, MapPin, BookOpen, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const DIMENSION_ICONS = {
  participacao: <Users className="w-4 h-4" />,
  mediacao_cultural: <Sparkles className="w-4 h-4" />,
  territorio: <MapPin className="w-4 h-4" />,
  escuta: <Mic className="w-4 h-4" />,
  memoria: <BookOpen className="w-4 h-4" />,
  construcao_coletiva: <Users className="w-4 h-4" />,
  apropriacao_espacos: <MapPin className="w-4 h-4" />,
  educacao_patrimonial: <BookOpen className="w-4 h-4" />,
};

const DIMENSION_LABELS = {
  participacao: 'Participação Social',
  mediacao_cultural: 'Mediação Cultural',
  territorio: 'Dimensão Territorial',
  escuta: 'Escuta e Percepção',
  memoria: 'Produção de Memória',
  construcao_coletiva: 'Construção Coletiva',
  apropriacao_espacos: 'Apropriação de Espaços',
  educacao_patrimonial: 'Educação Patrimonial',
};

export default function SociologicalAnalysisPanel({
  reportId,
  atividades = [],
  mes,
  ano,
  museu,
  equipe,
  onAnalysisComplete,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const resp = await base44.functions.invoke('analisarDimensoesSociologicas', {
        reportId,
        atividades,
        mes,
        ano,
        museu,
        equipe,
      });

      if (!resp.data?.success) {
        throw new Error(resp.data?.error || 'Erro ao analisar dimensões');
      }

      setResultado(resp.data);
      if (onAnalysisComplete) {
        onAnalysisComplete(resp.data);
      }

      toast.success('Análise sociológica concluída!');
    } catch (err) {
      setError(err.message);
      toast.error('Erro ao analisar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!resultado) {
    return (
      <Card className="p-4 border border-purple-200 bg-purple-50">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-purple-900 mb-2">
              Análise Sociológica e Territorial
            </h3>
            <p className="text-sm text-purple-800 mb-3">
              Detectar e valorizar dimensões de participação, mediação cultural, escuta e pertencimento territorial nas ações realizadas.
            </p>
            <Button
              onClick={handleAnalyze}
              disabled={loading || atividades.length === 0}
              variant="outline"
              size="sm"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Analisando...' : 'Analisar Dimensões'}
            </Button>
            {atividades.length === 0 && (
              <p className="text-xs text-purple-700 mt-2">
                ℹ️ Adicione atividades primeiro para análise
              </p>
            )}
          </div>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded text-sm text-red-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </Card>
    );
  }

  const { analise, introducao, observacoes, dimensoes_detectadas } = resultado;

  return (
    <Card className="p-4 border-2 border-purple-200 bg-purple-50 space-y-4">
      {/* Introdução Sociológica */}
      <div className="bg-white p-4 rounded-lg border border-purple-100">
        <h4 className="font-semibold text-purple-900 mb-2">📝 Introdução Contextual</h4>
        <p className="text-sm text-purple-800 italic leading-relaxed">{introducao}</p>
      </div>

      {/* Dimensões Detectadas */}
      {dimensoes_detectadas && dimensoes_detectadas.length > 0 && (
        <div>
          <h4 className="font-semibold text-purple-900 mb-3">🔍 Dimensões Identificadas</h4>
          <div className="grid grid-cols-2 gap-2">
            {dimensoes_detectadas.map((dim) => (
              <div
                key={dim}
                className="p-3 bg-white rounded-lg border border-purple-200 flex items-center gap-2"
              >
                <span className="text-purple-600">{DIMENSION_ICONS[dim]}</span>
                <span className="text-sm font-medium text-purple-900">
                  {DIMENSION_LABELS[dim]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observações Sociológicas */}
      {observacoes && observacoes.length > 0 && (
        <div>
          <h4 className="font-semibold text-purple-900 mb-3">💡 Leitura Institucional</h4>
          <div className="space-y-3">
            {observacoes.map((obs, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-purple-100">
                <p className="text-sm text-purple-800">{obs}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intensidade da Análise */}
      <div className="text-xs text-purple-700 pt-2 border-t border-purple-200">
        📊 Análise com{' '}
        {resultado.intensidade > 0.75
          ? 'alta intensidade'
          : resultado.intensidade > 0.5
          ? 'média intensidade'
          : 'presença identificada'}{' '}
        de dimensões sociológicas
      </div>

      {/* Botão para Copiar e Usar */}
      <div className="flex gap-2 pt-2 border-t border-purple-200">
        <Button
          onClick={() => {
            const texto = [introducao, ...observacoes].join('\n\n');
            navigator.clipboard.writeText(texto);
            toast.success('Texto copiado para clipboard');
          }}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          📋 Copiar Textos
        </Button>
      </div>
    </Card>
  );
}