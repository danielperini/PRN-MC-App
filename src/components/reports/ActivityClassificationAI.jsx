import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const CLASSIF_BADGE = {
  META:   'bg-blue-100 text-blue-800',
  ROTINA: 'bg-green-100 text-green-700',
  EXTRA:  'bg-orange-100 text-orange-700',
};

export default function ActivityClassificationAI({ atividade, onApplySuggestion, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const handleSuggest = async () => {
    if (!atividade.descricao_executado && !atividade.objetivo) {
      toast.error('Adicione descrição ou objetivo para receber sugestão');
      return;
    }

    setLoading(true);
    const prompt = `Você é especialista em classificação de atividades culturais.
Analise a atividade abaixo e sugira:
1. A classificação mais adequada (META, ROTINA ou EXTRA)
2. Uma justificativa breve

ATIVIDADE:
Nome: ${atividade.nome || '(sem nome)'}
Tipo: ${atividade.tipo_acao || ''}
Objetivo: ${atividade.objetivo || ''}
Descrição: ${atividade.descricao_executado || ''}
Público: ${atividade.publico_estimado || ''}
Museu: ${atividade.museu || ''}

Responda em JSON: {
  "classificacao": "META|ROTINA|EXTRA",
  "justificativa": "Breve explicação (máx 1 linha)"
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          classificacao: { type: 'string' },
          justificativa: { type: 'string' },
        }
      }
    }).catch(() => null);

    if (result) {
      setSuggestion(result);
      setExpanded(true);
    } else {
      toast.error('Erro ao gerar sugestão');
    }
    setLoading(false);
  };

  const handleApply = () => {
    if (suggestion?.classificacao) {
      onApplySuggestion('classificacao', suggestion.classificacao);
      toast.success(`Classificação "${suggestion.classificacao}" aplicada`);
      setSuggestion(null);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={handleSuggest}
        disabled={loading || disabled}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {loading ? 'Analisando...' : 'Classificar com IA'}
      </Button>

      {suggestion && (
        <div
          className="border border-blue-200 bg-blue-50 rounded-lg overflow-hidden"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-blue-100/50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-blue-700">Sugestão: </span>
              <Badge className={`text-xs font-medium ${CLASSIF_BADGE[suggestion.classificacao] || ''}`}>
                {suggestion.classificacao}
              </Badge>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />}
          </div>

          {expanded && (
            <div className="px-3 pb-3 space-y-2 border-t border-blue-200">
              <p className="text-xs text-blue-700">{suggestion.justificativa}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs"
                  onClick={handleApply}
                >
                  Aplicar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setSuggestion(null)}
                >
                  Descartar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}