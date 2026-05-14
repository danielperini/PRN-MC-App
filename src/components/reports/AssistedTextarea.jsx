import React, { useMemo, useState } from 'react';
import { Sparkles, Wand2, ListChecks, PlusCircle, Building2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea as BaseTextarea } from '@/components/ui/textarea';

function normalizeText(value) {
  return String(value || '').trim();
}

function splitTopics(text) {
  return normalizeText(text)
    .split(/\n|;|•|-/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function titleFromField(fieldLabel) {
  return normalizeText(fieldLabel || 'campo do relatório').toLowerCase();
}

function improveText(text) {
  const value = normalizeText(text);
  if (!value) return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bfoi realizado\b/gi, 'foi desenvolvido')
    .replace(/\batividade\s+atividade\b/gi, 'atividade')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function fromTopics(text, contextLabel) {
  const topics = splitTopics(text);
  const label = titleFromField(contextLabel);

  if (topics.length === 0) {
    return `Informe tópicos objetivos sobre ${label}, incluindo museu, período, ações realizadas, público envolvido e principais evidências. A partir desses elementos, a IA poderá desenvolver um texto institucional mais completo, sem inventar dados e mantendo coerência com o relatório.`;
  }

  const sentence = topics.join(', ');
  return `No período analisado, o campo ${label} reúne elementos relacionados a ${sentence}. Esses pontos indicam aspectos relevantes da execução registrada e podem ser desenvolvidos como síntese institucional, articulando as ações realizadas, os públicos envolvidos, os registros disponíveis e a contribuição das atividades para o acompanhamento do projeto.\n\nA redação final deve aprofundar esses tópicos com base nos dados reais do relatório, evitando generalizações e preservando a relação entre museu, programação, evidências e resultados observados.`;
}

function expandText(text, contextLabel) {
  const value = improveText(text);
  const label = titleFromField(contextLabel);

  if (!value) return fromTopics('', label);

  return `${value}\n\nEsse registro pode ser aprofundado a partir da relação entre as ações descritas, o período de referência, o museu envolvido e as evidências reunidas no sistema. A análise deve destacar os dados confirmados, a participação observada, a coerência com a programação e os elementos que demonstram continuidade institucional, sem acrescentar informações que não estejam documentadas.`;
}

function institutionalText(text, contextLabel) {
  const value = improveText(text);
  const label = titleFromField(contextLabel);

  if (!value) return fromTopics('', label);

  return `${value}\n\nEm termos institucionais, esse conjunto de informações contribui para consolidar a memória do período e qualificar a leitura sobre a execução das ações. O texto deve manter linguagem técnica e cultural, relacionando dados, registros e evidências de forma objetiva, com atenção à transparência, à rastreabilidade e à consistência editorial do relatório.`;
}

function complementText(text, contextLabel) {
  const label = titleFromField(contextLabel);
  const base = normalizeText(text);
  const suggestions = [
    `• Conferir se o texto de ${label} menciona museu, mês e ano.`,
    '• Inserir público somente quando houver dado real registrado.',
    '• Relacionar a redação com atividades, programação, fotos ou documentos vinculados.',
    '• Evitar repetir expressões como “foi realizado” e “atividade” no mesmo parágrafo.',
    '• Acrescentar evidências ou resultados apenas quando estiverem documentados no sistema.',
  ].join('\n');

  return base ? `${base}\n\nSugestões de complementação:\n${suggestions}` : `Sugestões de complementação:\n${suggestions}`;
}

export default function AssistedTextarea({
  value,
  onChange,
  id,
  name,
  placeholder,
  className,
  fieldLabel,
  aiContext,
  disabled,
  ...props
}) {
  const [previousValue, setPreviousValue] = useState(null);

  const label = useMemo(() => {
    return fieldLabel || placeholder || name || id || 'campo textual';
  }, [fieldLabel, placeholder, name, id]);

  const emit = (nextValue) => {
    setPreviousValue(value || '');
    if (typeof onChange === 'function') {
      onChange({ target: { value: nextValue, id, name } });
    }
  };

  const actions = [
    { key: 'topics', label: 'Tópicos', icon: ListChecks, run: () => emit(fromTopics(value, label, aiContext)) },
    { key: 'improve', label: 'Melhorar', icon: Wand2, run: () => emit(improveText(value)) },
    { key: 'expand', label: 'Expandir', icon: PlusCircle, run: () => emit(expandText(value, label, aiContext)) },
    { key: 'institutional', label: 'Institucional', icon: Building2, run: () => emit(institutionalText(value, label, aiContext)) },
    { key: 'complement', label: 'Complementar', icon: Sparkles, run: () => emit(complementText(value, label, aiContext)) },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/70 p-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground">
          <Sparkles className="h-3.5 w-3.5" /> IA de redação
        </span>

        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.key}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={action.run}
              className="h-7 gap-1 rounded-full px-2 text-[11px]"
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </Button>
          );
        })}

        {previousValue !== null && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              const old = previousValue;
              setPreviousValue(null);
              if (typeof onChange === 'function') onChange({ target: { value: old, id, name } });
            }}
            className="h-7 gap-1 rounded-full px-2 text-[11px] text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Desfazer IA
          </Button>
        )}
      </div>

      <BaseTextarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        {...props}
      />
    </div>
  );
}
