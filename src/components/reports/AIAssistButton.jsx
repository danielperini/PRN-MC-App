import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const FIELD_LABELS = {
  resumo_executivo: 'Resumo Executivo do Mês',
  avaliacao_pontos_positivos: 'Pontos Positivos do Mês',
  avaliacao_desafios: 'Dificuldades Enfrentadas',
  avaliacao_sugestoes: 'Sugestões de Melhoria',
  justificativa_tecnica: 'Justificativa Técnica da Atividade',
  descricao_executado: 'Descrição do Executado na Atividade',
  resultados_impactos: 'Resultados e Impactos da Atividade',
  objetivo: 'Objetivo da Atividade',
};

function buildPrompt(field, context, placeholder) {
  const fieldLabel = FIELD_LABELS[field] || field;
  const atividades = (context.atividades || []);
  const atividadesList = atividades
    .map(a => [a.nome, a.tipo_acao, a.classificacao].filter(Boolean).join(' – '))
    .filter(Boolean)
    .slice(0, 10)
    .join('\n  • ');

  return `Você é um redator especialista em relatórios institucionais para museus públicos de Belo Horizonte (FMC/PBH).

Redija um texto profissional, formal e objetivo para o campo **"${fieldLabel}"** de um Relatório Mensal Individual.

## Dados do Relatório
- Profissional: ${context.author_name || 'Não informado'}
- Função: ${context.funcao || 'Não informada'}
- Museu: ${context.museu || 'Não informado'}
- Período: ${context.mes_referencia || ''} de ${context.ano || 2026}
- Atividades registradas (${atividades.length}):${atividadesList ? `\n  • ${atividadesList}` : ' Nenhuma'}
${placeholder ? `\n## Orientação\n${placeholder}` : ''}

## Instruções
- Escreva APENAS o texto do campo, sem títulos ou prefácios
- Tom: institucional, claro, direto ao ponto
- Tamanho: 3 a 6 linhas
- Use linguagem em português do Brasil`;
}

export default function AIAssistButton({ field, context, onGenerate, placeholder }) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const prompt = buildPrompt(field, context, placeholder);
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      const text = typeof result === 'string' ? result : result?.text || '';
      onGenerate(text);
      toast.success('Texto gerado com sucesso!');
    } catch (err) {
      toast.error('Erro ao gerar texto com IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-xs text-gray-500 hover:text-black hover:bg-gray-100 gap-1.5 h-7 px-2.5"
      onClick={handle}
      disabled={loading}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <Sparkles className="w-3 h-3" />}
      {loading ? 'Gerando...' : 'Sugerir com IA'}
    </Button>
  );
}