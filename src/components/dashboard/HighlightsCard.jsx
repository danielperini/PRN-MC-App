import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, ChevronRight, Loader2, Quote, ChevronLeft, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const INCENTIVE_TOPICS = [
  '🎯 Público alcançado e engajamento',
  '💡 Inovação na atividade',
  '🤝 Parcerias e colaborações',
  '♿ Acessibilidade e inclusão',
  '📊 Impacto educacional',
  '🌟 Destaques do público',
];

export default function HighlightsCard() {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingHighlight, setEditingHighlight] = useState(null);
  const [topics, setTopics] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [redactedText, setRedactedText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [mediaResults, setMediaResults] = useState([]);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [selectedHighlightForCarousel, setSelectedHighlightForCarousel] = useState(null);

  useEffect(() => {
    const loadHighlights = async () => {
      try {
        setLoading(true);
        const reports = await base44.entities.Report.list('-created_date', 100);

        if (!Array.isArray(reports)) {
          setHighlights([]);
          return;
        }

        const allHighlights = [];
        reports.forEach(report => {
          if (!report || !report.id) return;
          const atividades = Array.isArray(report.atividades) ? report.atividades : [];
          atividades.forEach(ativ => {
            if (ativ && ativ.depoimento_participantes && ativ.depoimento_participantes.trim()) {
              allHighlights.push({
                id: `${report.id}-${ativ.nome || 'unknown'}`,
                mes: report.mes_referencia || '',
                ano: report.ano || new Date().getFullYear(),
                museu: report.museu || 'Indefinido',
                atividade: ativ.nome || 'Atividade',
                depoimento: ativ.depoimento_participantes,
                autor: report.author_name || 'Anônimo',
                data: report.created_date || new Date().toISOString(),
              });
            }
          });
        });

        const recent = allHighlights.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
        setHighlights(recent);
      } catch (error) {
        console.warn('Fatos marcantes indisponíveis no dashboard. Mantendo lista vazia.', error);
        setHighlights([]);
      } finally {
        setLoading(false);
      }
    };

    loadHighlights();
  }, []);

  const openEditHighlight = (highlight) => {
    setEditingHighlight(highlight);
    setTopics([]);
    setQuotes([]);
    setRedactedText('');
  };

  const generateJournalisticText = async () => {
    if (topics.length === 0) {
      toast.error('Selecione ao menos um tópico');
      return;
    }

    setAiLoading(true);
    const topicsText = topics.join('\n- ');
    const quotesText = quotes.length > 0 ? `\n\nFalas/citações importantes:\n- ${quotes.join('\n- ')}` : '';
    
    const prompt = `Você é um jornalista cultural especializado em museus e artes. 
Redija um texto jornalístico atrativo e inspirador em português brasileiro sobre o seguinte highlight:

ATIVIDADE: ${editingHighlight.atividade}
MUSEU: ${editingHighlight.museu}
PERÍODO: ${editingHighlight.mes}/${editingHighlight.ano}
PROFISSIONAL: ${editingHighlight.autor}

TÓPICOS A ABORDAR:
- ${topicsText}
${quotesText}

INSTRUÇÕES:
- Tome um tom atrativo, jornalístico e inspirador
- Máximo 250 palavras
- Inclua as falas/quotes naturalmente no texto
- Destaque o impacto e a importância da iniciativa
- Use linguagem clara e envolvente
- Seja específico e concreto

Redija apenas o texto, sem prefácios ou explicações.`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setRedactedText(result);
      toast.success('Texto gerado com sucesso!');
    } catch (error) {
      toast.error('Erro ao gerar texto');
    } finally {
      setAiLoading(false);
    }
  };

  const searchMedia = async () => {
    setMediaLoading(true);
    try {
      const prompt = `Faça uma busca em redes sociais, blogs, notícias e mídia sobre os seguintes termos:
- "Museus Centro"
- "Viaduto das Artes"

Retorne em JSON com a seguinte estrutura:
{
  "resultados": [
    {
      "titulo": "título da postagem/notícia",
      "descricao": "breve descrição",
      "tipo": "rede_social|noticia|blog|outro",
      "data": "data aproximada",
      "url_sugerida": "descrição de onde encontrar"
    }
  ]
}

Máximo 10 resultados, ordenados por relevância e recência.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            resultados: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  descricao: { type: 'string' },
                  tipo: { type: 'string' },
                  data: { type: 'string' },
                  url_sugerida: { type: 'string' },
                },
              },
            },
          },
        },
      });

      setMediaResults(result.resultados || []);
      setShowMediaModal(true);
      toast.success('Busca concluída!');
    } catch (error) {
      toast.error('Erro ao buscar mídia/redes');
    } finally {
      setMediaLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 border border-gray-200 rounded-2xl bg-white">
        <p className="text-sm text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (highlights.length === 0) {
    return (
      <div className="p-6 border border-gray-200 rounded-2xl bg-white">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-black">Fatos Marcantes</h3>
        </div>
        <p className="text-sm text-gray-500">Nenhum fato marcante registrado ainda</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 border border-gray-200 rounded-2xl bg-white">
        <div className="flex items-center justify-between mb-5">
           <div className="flex items-center gap-3">
             <Sparkles className="w-5 h-5 text-gray-600" />
             <h3 className="font-semibold text-black text-lg">Fatos Marcantes</h3>
           </div>
          <Button
            size="sm"
            variant="outline"
            onClick={searchMedia}
            disabled={mediaLoading}
            className="text-xs"
          >
            {mediaLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            🔍 Redes & Mídia
          </Button>
        </div>

        <div className="space-y-4">
           {highlights.length > 1 && (
             <div className="flex gap-2 mb-4">
               <Button
                 size="sm"
                 variant="outline"
                 onClick={() => setSelectedHighlightForCarousel(highlights[carouselIndex])}
                 className="text-xs"
               >
                 <Image className="w-3 h-3 mr-1" />
                 Ver Carrossel
               </Button>
             </div>
           )}
           {highlights.map((item) => (
             <div key={item.id} className="pb-4 border-b border-gray-100 last:border-b-0 last:pb-0 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors" onClick={() => openEditHighlight(item)}>
               <div className="flex items-start gap-3">
                 <div className="flex-shrink-0 w-2 h-2 rounded-full bg-black mt-2" />
                 <div className="flex-1 min-w-0">
                   <p className="text-lg font-medium text-black line-clamp-2">
                     {item.atividade}
                   </p>
                   <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                     {item.depoimento}
                   </p>
                   <div className="flex items-center gap-2 mt-2 flex-wrap">
                     <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
                       {item.mes} {item.ano}
                     </span>
                     <span className="text-xs text-gray-500">{item.museu}</span>
                   </div>
                 </div>
                 <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
               </div>
             </div>
           ))}
         </div>
      </div>

      {/* Edit Highlight Modal */}
      <Dialog open={!!editingHighlight} onOpenChange={o => !o && setEditingHighlight(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Highlight Jornalístico</DialogTitle>
          </DialogHeader>

          {editingHighlight && (
            <div className="space-y-6 mt-4">
              {/* Info */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-black">{editingHighlight.atividade}</p>
                <p className="text-sm text-gray-500">{editingHighlight.museu} • {editingHighlight.mes}/{editingHighlight.ano}</p>
              </div>

              {/* Topics Selection */}
              <div>
                <Label className="mb-3 block font-semibold">Selecione os tópicos a abordar</Label>
                <div className="grid grid-cols-1 gap-2">
                  {INCENTIVE_TOPICS.map(topic => (
                    <button
                      key={topic}
                      onClick={() => setTopics(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic])}
                      className={`p-3 text-left rounded-lg border-2 transition-all ${
                            topics.includes(topic)
                              ? 'border-black bg-gray-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                    >
                      <p className="text-sm font-medium text-black">{topic}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quotes */}
              <div>
                <Label className="mb-2 block font-semibold flex items-center gap-2">
                  <Quote className="w-4 h-4" />
                  Falas/Citações do Público (opcional)
                </Label>
                <div className="space-y-2">
                  {quotes.map((quote, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={quote}
                        onChange={e => setQuotes(prev => prev.map((q, i) => i === idx ? e.target.value : q))}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        placeholder="Digite uma fala..."
                      />
                      <button
                        onClick={() => setQuotes(prev => prev.filter((_, i) => i !== idx))}
                        className="px-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setQuotes(prev => [...prev, ''])}
                    className="text-sm text-black hover:text-gray-700 font-medium"
                  >
                    + Adicionar fala
                  </button>
                </div>
              </div>

              {/* Generated Text */}
              {redactedText && (
                <div>
                  <Label className="mb-2 block font-semibold">Texto Gerado (Jornalístico)</Label>
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {redactedText}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditingHighlight(null)}>Fechar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={generateJournalisticText}
              disabled={aiLoading || topics.length === 0}
            >
              {aiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {aiLoading ? 'Gerando...' : 'Gerar com IA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carousel Modal */}
      <Dialog open={!!selectedHighlightForCarousel} onOpenChange={o => !o && setSelectedHighlightForCarousel(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Galeria: {selectedHighlightForCarousel?.atividade}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-gray-100 rounded-lg p-6 flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <Image className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Fotos da atividade em breve</p>
              </div>
            </div>

            {highlights.length > 1 && (
              <div className="flex gap-2 justify-between items-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCarouselIndex(prev => prev === 0 ? highlights.length - 1 : prev - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  {carouselIndex + 1} de {highlights.length}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newIdx = (carouselIndex + 1) % highlights.length;
                    setCarouselIndex(newIdx);
                    setSelectedHighlightForCarousel(highlights[newIdx]);
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="font-semibold text-black text-sm mb-2">{selectedHighlightForCarousel?.atividade}</p>
              <p className="text-xs text-gray-700">{selectedHighlightForCarousel?.depoimento}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedHighlightForCarousel(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Search Modal */}
      <Dialog open={showMediaModal} onOpenChange={setShowMediaModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Museus Centro & Viaduto das Artes na Mídia</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {mediaResults.length === 0 ? (
              <p className="text-center py-8 text-gray-500">Nenhum resultado encontrado</p>
            ) : (
              mediaResults.map((result, idx) => (
                <div key={idx} className="p-4 border border-gray-100 rounded-lg hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-black text-sm">{result.titulo}</p>
                      <p className="text-xs text-gray-600 mt-1">{result.descricao}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                          {result.tipo}
                        </span>
                        <span className="text-[11px] text-gray-500">{result.data}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 italic">{result.url_sugerida}</p>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowMediaModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
