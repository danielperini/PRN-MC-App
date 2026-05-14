import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

const CACHE_KEY = 'comunicacao_sintese_ia_v1';
const CACHE_HOURS = 6;

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const age = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
    if (age > CACHE_HOURS) return null;
    return parsed;
  } catch { return null; }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch {}
}

export default function SinteseIA({ clippingItems = [], driveItems = [], keywords = [] }) {
  const cached = loadCache();
  const [loading, setLoading] = useState(false);
  const [sintese, setSintese] = useState(cached?.sintese || null);
  const [geradoEm, setGeradoEm] = useState(cached?.geradoEm || null);

  async function gerarSintese() {
    setLoading(true);
    try {
      const resumoClipping = clippingItems.slice(0, 12).map(item =>
        `- "${item.title}" (${item.sourceName}, ${item.publishedDate || 'sem data'}) — ${item.summary || ''}`
      ).join('\n');

      const prompt = `Você é um analista de comunicação institucional do projeto Museus Centro / Viaduto das Artes em Belo Horizonte.

Com base nos dados de clipping e visibilidade abaixo, gere uma SÍNTESE ESTRATÉGICA DE COMUNICAÇÃO em formato Markdown bem estruturado.

CLIPPING RECENTE (últimos 60 dias):
${resumoClipping || 'Nenhum clipping disponível.'}

PALAVRAS-CHAVE MONITORADAS:
${keywords.join(', ')}

A síntese deve conter:
## Resumo do período
(2-3 parágrafos sobre o panorama geral de comunicação)

## Principais temas em destaque
(lista dos temas mais recorrentes)

## Percepção institucional
(como o projeto está sendo percebido pela mídia e público)

## Ações com maior repercussão
(quais ações geraram mais cobertura)

## Recomendações estratégicas
(2-3 sugestões para ampliar visibilidade)

Seja objetivo, institucional e use linguagem adequada para patrocinadores.`;

      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      const text = typeof result === 'string' ? result : result?.output_text || result?.text || JSON.stringify(result);
      const now = new Date().toLocaleString('pt-BR');
      setSintese(text);
      setGeradoEm(now);
      saveCache({ sintese: text, geradoEm: now });
    } catch (err) {
      console.error('Erro ao gerar síntese IA:', err);
      setSintese('Não foi possível gerar a síntese neste momento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-black" />
            <div>
              <h2 className="text-lg font-semibold text-black">Leitura Inteligente da Comunicação</h2>
              <p className="text-xs text-gray-500">Síntese estratégica gerada por IA com base no clipping e dados do período.</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={gerarSintese}
            disabled={loading}
            className="gap-2 rounded-xl"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {sintese ? 'Regenerar' : 'Gerar síntese'}
          </Button>
        </div>

        {!sintese && !loading && (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-gray-300 mx-auto" />
            <p className="text-sm text-gray-400">Clique em "Gerar síntese" para que a IA analise o clipping e produza um resumo estratégico do período.</p>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center space-y-3">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Analisando clipping e gerando síntese institucional...</p>
          </div>
        )}

        {sintese && !loading && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <ReactMarkdown
              className="prose prose-sm prose-slate max-w-none text-gray-800 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-black [&_h2]:mt-4 [&_h2]:mb-1 [&_ul]:pl-4 [&_li]:text-xs [&_p]:text-xs [&_p]:leading-relaxed"
            >
              {sintese}
            </ReactMarkdown>
            {geradoEm && (
              <p className="text-[10px] text-gray-400 mt-3 border-t border-gray-200 pt-2">
                Gerado em: {geradoEm} · Cache válido por {CACHE_HOURS}h
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}