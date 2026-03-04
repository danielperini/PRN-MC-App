import React, { useState } from 'react';
import { Quote, Search, ExternalLink, X, Loader2, Twitter, Instagram, Facebook, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';

const FRASES_FIXAS = [
  {
    frase: "Nunca tinha entrado num museu. Vim com a escola e me apaixonei pela história da cidade.",
    autor: "Visitante, MHAB",
    museu: "MHAB"
  },
  {
    frase: "A oficina de moda me fez entender que a roupa conta a história do povo. Foi transformador.",
    autor: "Participante de oficina, MUMO",
    museu: "MUMO"
  },
  {
    frase: "Ver o filme antigo da cidade foi como viajar no tempo. Minha avó até reconheceu o bairro.",
    autor: "Visitante em família, MIS",
    museu: "MIS"
  },
  {
    frase: "O espaço do viaduto virou ponto de encontro da galera. A cultura chegou onde a gente vive.",
    autor: "Jovem participante, Viaduto da Ponte",
    museu: "Viaduto"
  },
  {
    frase: "Nunca imaginei que fotografar a cidade pudesse ser arte. O museu me abriu esse mundo.",
    autor: "Participante do projeto, MIS",
    museu: "MIS"
  },
  {
    frase: "Aprendi que preservar a memória é um ato de resistência. Saí diferente daqui.",
    autor: "Estudante universitário, MHAB",
    museu: "MHAB"
  },
  {
    frase: "Minha filha pediu para voltar no museu. Ela que nunca quis ir à escola de arte.",
    autor: "Mãe de participante, MUMO",
    museu: "MUMO"
  },
  {
    frase: "A ação no viaduto quebrou o preconceito. As pessoas pararam, assistiram, conversaram.",
    autor: "Educador, Museus Centro",
    museu: "Viaduto"
  },
];

const REDES = [
  {
    nome: "Instagram",
    icon: Instagram,
    url: (q) => `https://www.instagram.com/explore/tags/${encodeURIComponent(q.replace(/\s+/g,''))}`,
    cor: "text-black"
  },
  {
    nome: "Twitter / X",
    icon: Twitter,
    url: (q) => `https://twitter.com/search?q=${encodeURIComponent(q)}`,
    cor: "text-black"
  },
  {
    nome: "Facebook",
    icon: Facebook,
    url: (q) => `https://www.facebook.com/search/posts/?q=${encodeURIComponent(q)}`,
    cor: "text-black"
  },
  {
    nome: "Google",
    icon: Globe,
    url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    cor: "text-black"
  },
];

const MUSEU_QUERIES = [
  { label: "Museus Centro BH", query: "Museus Centro Belo Horizonte", hashtag: "MuseusCentro" },
  { label: "MHAB", query: "MHAB Museu Histórico Abílio Barreto", hashtag: "MHAB" },
  { label: "MUMO", query: "MUMO Museu da Moda Belo Horizonte", hashtag: "MUMO" },
  { label: "MIS BH", query: "MIS Museu Imagem Som Belo Horizonte", hashtag: "MISBH" },
  { label: "Viaduto da Ponte", query: "Viaduto da Ponte Belo Horizonte cultura", hashtag: "ViadutoDaPonte" },
];

export default function FrasesParticipantes() {
  const [current, setCurrent] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiResults, setAiResults] = useState(null);
  const [selectedQuery, setSelectedQuery] = useState(null);

  const frase = FRASES_FIXAS[current];

  const prev = () => setCurrent(i => (i - 1 + FRASES_FIXAS.length) % FRASES_FIXAS.length);
  const next = () => setCurrent(i => (i + 1) % FRASES_FIXAS.length);

  const buscarNaWeb = async (q) => {
    setSelectedQuery(q);
    setLoadingAI(true);
    setAiResults(null);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Faça uma busca na internet sobre o projeto "${q.query}" incluindo ${q.hashtag} nas redes sociais. Retorne um resumo do que as pessoas estão falando sobre o projeto, menções nas redes sociais, e qualquer notícia ou post relevante que encontrar. Inclua também perfis ou contas nas redes sociais relacionados. Responda em português, de forma concisa e organizada com bullet points.`,
      add_context_from_internet: true,
    });
    setAiResults(result);
    setLoadingAI(false);
  };

  return (
    <>
      <div className="border-2 border-black rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black bg-black">
          <div className="flex items-center gap-3">
            <Quote className="w-5 h-5 text-white" />
            <h3 className="text-sm font-semibold text-white uppercase tracking-widest">
              Vozes do Projeto
            </h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-white text-white hover:bg-white hover:text-black gap-2 text-xs"
            onClick={() => setShowSearch(true)}
          >
            <Search className="w-3.5 h-3.5" />
            Buscar nas Redes
          </Button>
        </div>

        {/* Frase principal */}
        <div className="px-8 py-12 bg-white min-h-[220px] flex flex-col justify-between">
          <div>
            <Quote className="w-10 h-10 text-gray-200 mb-4" />
            <p className="text-3xl md:text-4xl font-light text-black leading-tight tracking-tight">
              "{frase.frase}"
            </p>
          </div>
          <div className="mt-8 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-black">{frase.autor}</p>
              <span className="text-xs text-gray-400 uppercase tracking-widest mt-0.5 block">{frase.museu}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={prev}
                className="w-8 h-8 rounded-full border border-black flex items-center justify-center text-black hover:bg-black hover:text-white transition-all text-sm font-bold"
              >
                ‹
              </button>
              <button
                onClick={next}
                className="w-8 h-8 rounded-full border border-black flex items-center justify-center text-black hover:bg-black hover:text-white transition-all text-sm font-bold"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* Indicadores */}
        <div className="flex justify-center gap-1.5 py-3 border-t border-gray-100 bg-white">
          {FRASES_FIXAS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-black w-4' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      </div>

      {/* Modal de busca nas redes */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-black">
              <Search className="w-5 h-5" />
              Buscar nas Redes Sociais — Museus Centro
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-2">
            {/* Tópicos de busca */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Escolha um tópico para buscar</p>
              <div className="grid grid-cols-1 gap-2">
                {MUSEU_QUERIES.map((q) => (
                  <div key={q.label} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-black text-sm">{q.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">#{q.hashtag} · "{q.query}"</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                        {REDES.map((rede) => {
                          const Icon = rede.icon;
                          return (
                            <a
                              key={rede.nome}
                              href={rede.url(q.query)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Buscar no ${rede.nome}`}
                              className="w-8 h-8 border border-gray-200 rounded-lg flex items-center justify-center hover:border-black hover:bg-black hover:text-white transition-all"
                            >
                              <Icon className="w-4 h-4" />
                            </a>
                          );
                        })}
                        <Button
                          size="sm"
                          className="bg-black hover:bg-gray-800 text-white text-xs h-8 px-3 gap-1"
                          onClick={() => buscarNaWeb(q)}
                          disabled={loadingAI && selectedQuery?.label === q.label}
                        >
                          {loadingAI && selectedQuery?.label === q.label
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Search className="w-3 h-3" />
                          }
                          IA
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resultados da IA */}
            {loadingAI && (
              <div className="flex items-center gap-3 py-8 justify-center border border-dashed border-gray-200 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <p className="text-sm text-gray-500">Buscando menções sobre {selectedQuery?.label}...</p>
              </div>
            )}
            {aiResults && !loadingAI && (
              <div className="border-2 border-black rounded-xl overflow-hidden">
                <div className="bg-black px-4 py-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-white uppercase tracking-widest">
                    Resultado: {selectedQuery?.label}
                  </p>
                  <button onClick={() => setAiResults(null)} className="text-white/60 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 bg-white">
                  <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{aiResults}</div>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2 flex-wrap">
                    {REDES.map((rede) => {
                      const Icon = rede.icon;
                      return (
                        <a
                          key={rede.nome}
                          href={rede.url(selectedQuery?.query || '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs border border-black px-3 py-1.5 rounded-lg hover:bg-black hover:text-white transition-all"
                        >
                          <Icon className="w-3.5 h-3.5" />
                          Ver no {rede.nome}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}