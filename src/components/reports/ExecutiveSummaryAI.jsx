import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ExecutiveSummaryAI({ atividades = [], reportData = {}, onApply, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const handleGenerate = async () => {
    if (!atividades || atividades.length === 0) {
      toast.error('Registre atividades para gerar resumo executivo');
      return;
    }

    setLoading(true);
    const atividadesSummary = atividades.map((a, i) => `
${i + 1}. ${a.nome || 'Sem nome'}
   Tipo: ${a.tipo_acao || ''}
   Classificação: ${a.classificacao || ''}
   Público: ${a.publico_estimado || 0}
   Descrição: ${a.descricao_executado || a.objetivo || '(sem descrição)'}
   Status: ${a.status_meta || 'N/A'}
    `).join('\n');

    const totalAtividades = atividades.length;
    const totalMeta = atividades.filter(a => a.classificacao === 'META').length;
    const totalRotina = atividades.filter(a => a.classificacao === 'ROTINA').length;
    const totalExtra = atividades.filter(a => a.classificacao === 'EXTRA').length;
    const publicoTotal = atividades.reduce((sum, a) => sum + (parseInt(a.publico_estimado) || 0), 0);

    const prompt = `Você é especialista em relatórios de gestão cultural. 
Analise as atividades abaixo e gere um resumo executivo detalhado e profissional (máximo 5 parágrafos).

CONTEXTO:
- Período: ${reportData.mes_referencia || 'Mês'} ${reportData.ano || 2026}
- Museu: ${reportData.museu || ''}
- Profissional: ${reportData.author_name || ''}
- Total de Atividades: ${totalAtividades}
  • Metas: ${totalMeta}
  • Rotina: ${totalRotina}
  • Extras: ${totalExtra}
- Público Total: ${publicoTotal} pessoas

ATIVIDADES EXECUTADAS:
${atividadesSummary}

PONTOS POSITIVOS DO MÊS:
${reportData.avaliacao_pontos_positivos || '(não informado)'}

DESAFIOS ENFRENTADOS:
${reportData.avaliacao_desafios || '(não informado)'}

Gere um resumo executivo que:
1. Sintetize os destaques do mês
2. Mencione as metas e sua evolução
3. Destaque o impacto nas atividades de rotina
4. Aponte desafios superados
5. Indique perspectivas para o próximo período

Escriba em português do Brasil, de forma concisa, profissional e orientada a resultados.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6'
    }).catch(() => null);

    if (result) {
      setSuggestion(result);
      setExpanded(true);
    } else {
      toast.error('Erro ao gerar resumo');
    }
    setLoading(false);
  };

  const handleApply = () => {
    if (suggestion) {
      onApply(suggestion);
      toast.success('Resumo executivo aplicado');
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
        onClick={handleGenerate}
        disabled={loading || disabled}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {loading ? 'Gerando...' : 'Gerar Resumo Executivo'}
      </Button>

      {suggestion && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-lg overflow-hidden">
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-emerald-100/50 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            <span className="text-xs font-medium text-emerald-700">Resumo Executivo Gerado</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-emerald-500" /> : <ChevronDown className="w-4 h-4 text-emerald-500" />}
          </div>

          {expanded && (
            <div className="px-3 pb-3 space-y-3 border-t border-emerald-200">
              <p className="text-sm text-emerald-800 leading-relaxed whitespace-pre-wrap">{suggestion}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
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