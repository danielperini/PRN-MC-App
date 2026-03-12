import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ActivitySummarizer({ atividades, canEdit, onApplySuggestions }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [shortDescriptionWarnings, setShortDescriptionWarnings] = useState([]);

  // Detectar descrições curtas ou genéricas
  const checkShortDescriptions = () => {
    const warnings = atividades
      .filter(a => !!a)
      .map((a, idx) => {
        const desc = a.descricao_executado || '';
        const obj = a.objetivo || '';
        const combined = (desc + ' ' + obj).trim();
        
        if (combined.length < 30) {
          return {
            index: idx,
            name: a.nome || `Atividade ${idx + 1}`,
            length: combined.length,
            type: 'muito_curta'
          };
        }
        
        const genericTerms = ['atividade', 'realizada', 'executada', 'feito', 'foi', 'sim'];
        const wordCount = combined.split(/\s+/).length;
        const genericCount = combined.toLowerCase().split(/\s+/).filter(w => genericTerms.includes(w)).length;
        
        if (wordCount < 15 && genericCount / wordCount > 0.3) {
          return {
            index: idx,
            name: a.nome || `Atividade ${idx + 1}`,
            length: combined.length,
            type: 'genérica'
          };
        }
        
        return null;
      })
      .filter(Boolean);
    
    setShortDescriptionWarnings(warnings);
  };

  const analyzeSimilarities = async () => {
    if (atividades.length === 0) return;
    
    setAnalyzing(true);
    
    // Primeiro, checar descrições curtas
    checkShortDescriptions();
    
    // Agrupar atividades por tipo/museu/data
    const ativitiesList = atividades.filter(a => !!a).map((a, idx) => ({
      index: idx,
      nome: a.nome || `Atividade ${idx + 1}`,
      tipo: a.tipo_acao || 'Sem tipo',
      museu: a.museu || 'Sem local',
      data: a.data_inicio || 'Sem data',
      descricao: a.descricao_executado || a.objetivo || '',
      publico: a.publico_estimado || '?',
      produto: a.produto_realizado || 'Sem produto'
    }));

    const prompt = `Você é um especialista em análise de dados de projetos culturais. 
Analise as seguintes atividades para:
1. AGRUPAMENTO: Identificar atividades similares que poderiam ser consolidadas
2. REDUNDÂNCIA: Detectar descrições redundantes ou que tratam do mesmo tema
3. APRIMORAMENTO: Sugerir melhorias nas descrições

ATIVIDADES:
${ativitiesList.map(a => `
- ${a.nome}
  Tipo: ${a.tipo} | Museu: ${a.museu} | Data: ${a.data}
  Descrição: "${a.descricao}"
  Público: ${a.publico} | Produto: ${a.produto}
`).join('\n')}

Responda em JSON com a seguinte estrutura:
{
  "grupos_similares": [
    {
      "titulo": "Nome do grupo",
      "atividades_indices": [0, 2, 5],
      "motivo": "Por que são similares",
      "sugestao_consolidacao": "Como poderiam ser consolidadas"
    }
  ],
  "redundancias": [
    {
      "descricao": "O que é redundante",
      "atividades_afetadas": [1, 3],
      "sugestao": "Sugestão para resolver"
    }
  ],
  "aprimoramentos": [
    {
      "indice_atividade": 0,
      "descricao_atual": "Descrição atual",
      "sugestao_descricao": "Descrição melhorada e mais específica"
    }
  ]
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          grupos_similares: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                atividades_indices: { type: 'array', items: { type: 'number' } },
                motivo: { type: 'string' },
                sugestao_consolidacao: { type: 'string' }
              }
            }
          },
          redundancias: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                descricao: { type: 'string' },
                atividades_afetadas: { type: 'array', items: { type: 'number' } },
                sugestao: { type: 'string' }
              }
            }
          },
          aprimoramentos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                indice_atividade: { type: 'number' },
                descricao_atual: { type: 'string' },
                sugestao_descricao: { type: 'string' }
              }
            }
          }
        }
      }
    });

    setSuggestions(result);
    setAnalyzing(false);
  };

  const applyDescriptionSuggestion = (index, newDescription) => {
    if (onApplySuggestions) {
      onApplySuggestions({
        type: 'update_description',
        index,
        value: newDescription
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Alerta para descrições curtas */}
      {shortDescriptionWarnings.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">Descrições incompletas detectadas</p>
              <div className="mt-2 space-y-1.5">
                {shortDescriptionWarnings.map((w) => (
                  <div key={w.index} className="flex items-center justify-between text-xs text-blue-800 bg-white px-3 py-2 rounded">
                    <span>
                      <strong>{w.name}</strong> - {w.type === 'muito_curta' ? 'Muito curta' : 'Descrição genérica'} ({w.length} caracteres)
                    </span>
                    <Badge variant="outline" className="text-blue-600">Atividade {w.index + 1}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-blue-700 mt-2">Recomendação: Expanda estas descrições com detalhes sobre resultados, público impactado e metodologia.</p>
            </div>
          </div>
        </div>
      )}

      {/* Botão de análise */}
      {canEdit && (
        <div className="flex gap-2">
          <Button
            onClick={analyzeSimilarities}
            disabled={analyzing || atividades.length < 2}
            variant="outline"
            className="gap-2"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analisar atividades com IA
              </>
            )}
          </Button>
          {suggestions && (
            <Button
              onClick={() => setSuggestions(null)}
              variant="ghost"
              size="sm"
              className="gap-1"
            >
              <X className="w-4 h-4" />
              Fechar
            </Button>
          )}
        </div>
      )}

      {/* Resultados da análise */}
      {suggestions && (
        <div className="space-y-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
          {/* Grupos similares */}
          {suggestions.grupos_similares && suggestions.grupos_similares.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
                Atividades Similares Detectadas
              </h3>
              {suggestions.grupos_similares.map((grupo, idx) => (
                <div key={idx} className="bg-white border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="font-medium text-sm text-gray-900">{grupo.titulo}</p>
                  <p className="text-xs text-gray-600">
                    Atividades: <Badge variant="outline" className="ml-1">{grupo.atividades_indices.map(i => i + 1).join(', ')}</Badge>
                  </p>
                  <p className="text-xs text-gray-700"><strong>Motivo:</strong> {grupo.motivo}</p>
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded"><strong>Sugestão:</strong> {grupo.sugestao_consolidacao}</p>
                </div>
              ))}
            </div>
          )}

          {/* Redundâncias */}
          {suggestions.redundancias && suggestions.redundancias.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                Redundâncias Identificadas
              </h3>
              {suggestions.redundancias.map((red, idx) => (
                <div key={idx} className="bg-white border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-gray-700"><strong>Redundância:</strong> {red.descricao}</p>
                  <p className="text-xs text-gray-600">
                    Atividades afetadas: <Badge variant="outline" className="ml-1">{red.atividades_afetadas.map(i => i + 1).join(', ')}</Badge>
                  </p>
                  <p className="text-xs text-red-700 bg-red-50 p-2 rounded"><strong>Solução:</strong> {red.sugestao}</p>
                </div>
              ))}
            </div>
          )}

          {/* Aprimoramentos de descrição */}
          {suggestions.aprimoramentos && suggestions.aprimoramentos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Sugestões de Aprimoramento
              </h3>
              {suggestions.aprimoramentos.map((apr, idx) => (
                <div key={idx} className="bg-white border border-blue-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-900">
                    Atividade {apr.indice_atividade + 1}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2 h-6 text-xs"
                        onClick={() => applyDescriptionSuggestion(apr.indice_atividade, apr.sugestao_descricao)}
                      >
                        Aplicar
                      </Button>
                    )}
                  </p>
                  <div className="grid md:grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Descrição atual:</p>
                      <p className="text-xs bg-gray-50 p-2 rounded italic text-gray-600">"{apr.descricao_atual}"</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Sugestão:</p>
                      <p className="text-xs bg-blue-50 p-2 rounded italic text-blue-700">"{apr.sugestao_descricao}"</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(!suggestions.grupos_similares || suggestions.grupos_similares.length === 0) &&
            (!suggestions.redundancias || suggestions.redundancias.length === 0) &&
            (!suggestions.aprimoramentos || suggestions.aprimoramentos.length === 0) && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Nenhuma similaridade ou redundância detectada.</p>
              <p className="text-xs text-gray-500 mt-1">As atividades parecem bem estruturadas e diversificadas.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}