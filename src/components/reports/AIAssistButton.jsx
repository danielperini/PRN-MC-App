import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * AIAssistButton — uses InvokeLLM to auto-fill a text field based on context.
 * Props:
 *   field: field key to fill (e.g. 'resumo_executivo')
 *   context: object with report data / other relevant info
 *   onGenerate: (text: string) => void
 *   placeholder: hint for the AI
 */
export default function AIAssistButton({ field, context, onGenerate, placeholder }) {
  const [loading, setLoading] = useState(false);

  const fieldLabels = {
    resumo_executivo: 'Resumo Executivo do Mês',
    avaliacao_pontos_positivos: 'Pontos Positivos do Mês',
    avaliacao_desafios: 'Dificuldades Enfrentadas',
    avaliacao_sugestoes: 'Sugestões de Melhoria',
    justificativa_tecnica: 'Justificativa Técnica da Atividade',
    descricao_executado: 'Descrição do Executado na Atividade',
    resultados_impactos: 'Resultados e Impactos da Atividade',
    objetivo: 'Objetivo da Atividade',
  };

  const handle = async () => {
    setLoading(true);
    try {
      const fieldLabel = fieldLabels[field] || field;

      const prompt = `Você é um assistente de redação para relatórios mensais de profissionais de museus da Fundação Municipal de Cultura de Belo Horizonte (FMC/PBH).
      
Gere um texto profissional, objetivo e formal para o campo "${fieldLabel}" de um Relatório Mensal Individual.

Contexto do relatório:
- Profissional: ${context.author_name || 'Não informado'}
- Função: ${context.funcao || 'Não informada'}
- Museu: ${context.museu || 'Não informado'}
- Mês/Ano: ${context.mes_referencia || ''} ${context.ano || 2026}
- Número de atividades registradas: ${(context.atividades || []).length}
${(context.atividades || []).length > 0 ? `- Atividades: ${(context.atividades || []).map(a => a.nome).filter(Boolean).join(', ')}` : ''}
${context.extra_context ? `- Contexto adicional: ${context.extra_context}` : ''}
${placeholder ? `- Orientação: ${placeholder}` : ''}

Escreva apenas o texto do campo, sem títulos, sem prefácios. Tom: institucional, claro, direto. Tamanho: 3 a 6 linhas.`;

      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      onGenerate(typeof result === 'string' ? result : result?.text || '');
      toast.success('Texto gerado pela IA!');
    } catch (err) {
      toast.error('Erro ao chamar IA: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 gap-1 h-7 px-2"
      onClick={handle}
      disabled={loading}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <Sparkles className="w-3 h-3" />}
      {loading ? 'Gerando...' : 'Sugerir texto com IA'}
    </Button>
  );
}