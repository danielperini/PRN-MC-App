import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FONTE_COLORS = {
  portal_museus_centro: 'bg-emerald-600',
  culturadoria_museus: 'bg-purple-600',
  web_search: 'bg-blue-600',
  internal: 'bg-amber-600',
  fallback: 'bg-black',
};

const FONTE_LABELS = {
  portal_museus_centro: 'Portal MC',
  culturadoria_museus: 'Culturadoria',
  web_search: 'Web',
  internal: 'Destaque',
  fallback: 'Museus Centro',
};

const TAG_COLORS = {
  Museuologia: 'bg-purple-100 text-purple-700 border-purple-300',
  Cinema: 'bg-red-100 text-red-700 border-red-300',
  Moda: 'bg-pink-100 text-pink-700 border-pink-300',
  'História de BH': 'bg-blue-100 text-blue-700 border-blue-300',
  'Patrimônio Cultural': 'bg-green-100 text-green-700 border-green-300',
  Curadoria: 'bg-amber-100 text-amber-700 border-amber-300',
  Educação: 'bg-indigo-100 text-indigo-700 border-indigo-300',
};

const FALLBACK_ITEMS = [
  {
    id: 'fallback-1',
    titulo: 'Museus Centro: acompanhamento integrado do projeto',
    resumo: 'Painel consolida relatórios, atividades, documentos e indicadores do projeto Museus Centro.',
    imagem_url: '',
    link: '',
    fonte: 'fallback',
    tags: ['Museuologia'],
    _tipo: 'fallback',
  },
  {
    id: 'fallback-2',
    titulo: 'Relatórios e atividades em atualização contínua',
    resumo: 'Acompanhe os registros mensais, ações culturais, ações educativas e indicadores aprovados.',
    imagem_url: '',
    link: '',
    fonte: 'fallback',
    tags: ['Educação'],
    _tipo: 'fallback',
  },
  {
    id: 'fallback-3',
    titulo: 'Gestão documental e financeira integrada',
    resumo: 'Notas fiscais, contratos, solicitações e rubricas permanecem vinculados para auditoria e prestação de contas.',
    imagem_url: '',
    link: '',
    fonte: 'fallback',
    tags: ['Patrimônio Cultural'],
    _tipo: 'fallback',
  },
];

function todayBR() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function normalizeItems(items = []) {
  return items
    .filter(Boolean)
    .map((item) => ({
      ...item,
      titulo: item.titulo || item.title || 'Destaque sem título',
      resumo: item.resumo || item.description || item.texto || '',
      imagem_url: item.imagem_url || item.image_url || item.image || '',
      link: item.link || item.url || '',
      fonte: item.fonte || 'web_search',
      tags: Array.isArray(item.tags) ? item.tags : [],
    }));
}

function deduplicateByLinkOrTitle(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.link || `${item.titulo}-${item.resumo}`;
    if (!map.has(key)) map.set(key, item);
  });
  return Array.from(map.values());
}

function seededShuffle(items = [], seedText = '') {
  const arr = [...items];
  let seed = parseInt(String(seedText).replace(/\D/g, '') || '1', 10) || 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function NewsCarousel({ items: itemsProp = null }) {
  const today = todayBR();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!base44?.entities?.NewsHighlight?.subscribe) return undefined;

    const unsub = base44.entities.NewsHighlight.subscribe((event) => {
      if (event?.type === 'update' || event?.type === 'create' || event?.type === 'delete') {
        queryClient.invalidateQueries({ queryKey: ['dashboard-news-carousel-real'] });
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [queryClient]);

  const { data: newsHighlights = [], isLoading: loadingNews, refetch: refetchNews } = useQuery({
    queryKey: ['dashboard-news-carousel-real', today],
    queryFn: async () => {
      if (Array.isArray(itemsProp) && itemsProp.length > 0) return itemsProp;

      const all = await base44.entities.NewsHighlight.filter({ ativo: true }, '-created_date', 500).catch(() => []);
      const published = (all || []).filter((n) => {
        if (n.status_curadoria === 'REJEITADO') return false;
        if (n.status_curadoria === 'PENDENTE') return false;
        if (n.score_pertinencia !== undefined && n.score_pertinencia !== null && Number(n.score_pertinencia) < 50) return false;
        return true;
      });

      return seededShuffle(deduplicateByLinkOrTitle(normalizeItems(published)), today).slice(0, 20);
    },
    enabled: !itemsProp || itemsProp.length === 0,
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: momentos = [] } = useQuery({
    queryKey: ['dashboard-momentos-carousel-real', today],
    queryFn: async () => {
      const data = await base44.entities.Momento.filter(
        { ativo: true, deve_ser_publicado: true },
        '-created_date',
        5
      ).catch(() => []);

      return (Array.isArray(data) ? data : [])
        .filter((m) => !m.data_expiracao || m.data_expiracao >= today)
        .map((m) => ({
          id: m.id,
          titulo: m.titulo,
          resumo: m.texto,
          imagem_url: m.imagem_url,
          link: '',
          fonte: 'internal',
          tags: Array.isArray(m.tags) ? m.tags : [],
          _tipo: 'momento',
        }));
    },
    refetchInterval: 120000,
  });

  const allItems = useMemo(() => {
    const propsItems = Array.isArray(itemsProp) && itemsProp.length > 0
      ? normalizeItems(itemsProp).map((item) => ({ ...item, _tipo: item._tipo || 'manual' }))
      : [];

    const newsItems = normalizeItems(newsHighlights).map((item) => ({
      ...item,
      _tipo: item._tipo || 'noticia',
    }));

    const sourceItems = propsItems.length > 0 ? propsItems : [...momentos, ...newsItems];
    const withFallback = sourceItems.length > 0 ? sourceItems : FALLBACK_ITEMS;

    const filtered = selectedTags.length > 0
      ? withFallback.filter((item) => (item.tags || []).some((tag) => selectedTags.includes(tag)))
      : withFallback;

    return filtered.length > 0 ? filtered : withFallback;
  }, [itemsProp, momentos, newsHighlights, selectedTags]);

  const allAvailableTags = useMemo(() => {
    const tags = new Set();
    [...momentos, ...normalizeItems(newsHighlights), ...FALLBACK_ITEMS].forEach((item) => {
      (item.tags || []).forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [momentos, newsHighlights]);

  useEffect(() => {
    if (!autoPlay || allItems.length <= 1) return undefined;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % allItems.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [autoPlay, allItems.length]);

  useEffect(() => {
    if (currentIndex >= allItems.length) setCurrentIndex(0);
  }, [allItems.length, currentIndex]);

  const selectTodayNews = useCallback(async () => {
    if (isSelecting) return;
    setIsSelecting(true);
    try {
      await base44.functions.invoke('searchAndIndexNews', {}).catch((error) => {
        console.warn('searchAndIndexNews indisponível:', error?.message || error);
      });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-news-carousel-real'] });
      await refetchNews();
    } finally {
      setIsSelecting(false);
    }
  }, [isSelecting, queryClient, refetchNews]);

  function toggleTag(tag) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    setCurrentIndex(0);
  }

  function goTo(idx) {
    setCurrentIndex(idx);
  }

  function goPrev(e) {
    e.stopPropagation();
    setCurrentIndex((currentIndex - 1 + allItems.length) % allItems.length);
  }

  function goNext(e) {
    e.stopPropagation();
    setCurrentIndex((currentIndex + 1) % allItems.length);
  }

  if (loadingNews && allItems.length === 0) {
    return (
      <div className="w-full mb-8 h-56 rounded-2xl bg-white border-2 border-black flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-black font-medium">Carregando notícias...</span>
      </div>
    );
  }

  const current = allItems[currentIndex] || allItems[0] || FALLBACK_ITEMS[0];
  const isMomento = current._tipo === 'momento';
  const fonteClass = FONTE_COLORS[current.fonte] || 'bg-gray-700';
  const fonteLabel = FONTE_LABELS[current.fonte] || 'Notícia';
  const indicatorItems = allItems.slice(0, 12);

  return (
    <div className="w-full mb-8">
      {allAvailableTags.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Filtrar:</span>
          {allAvailableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border-2 transition-all ${
                selectedTags.includes(tag)
                  ? `${TAG_COLORS[tag] || 'bg-gray-200 text-black border-black'}`
                  : 'bg-gray-100 text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {tag}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="px-2 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-all"
            >
              ✕ Limpar
            </button>
          )}
        </div>
      )}

      <div
        className="relative w-full rounded-2xl overflow-hidden h-56 group bg-white border-2 border-black"
        onMouseEnter={() => setAutoPlay(false)}
        onMouseLeave={() => setAutoPlay(true)}
      >
        <div className={`absolute inset-y-0 left-0 w-1 ${fonteClass}`} />

        {current.imagem_url ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${current.imagem_url})`, opacity: 0.12 }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-white" />
        )}

        <div className="relative z-10 h-full flex flex-col p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full text-white bg-black">
                {isMomento ? '✦ Destaque' : `📡 ${fonteLabel}`}
              </span>
              {(current.tags || []).slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600 border-gray-300'}`}
                >
                  {tag}
                </span>
              ))}
            </div>

            {indicatorItems.length > 1 && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {indicatorItems.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => goTo(idx)}
                    className={`rounded-full transition-all duration-300 ${
                      idx === currentIndex ? 'bg-black w-5 h-1.5' : 'bg-gray-300 hover:bg-gray-400 w-1.5 h-1.5'
                    }`}
                    aria-label={`Ir para destaque ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          <h3 className="text-xl font-bold text-black leading-snug line-clamp-2 mb-2 flex-shrink-0">
            {current.titulo}
          </h3>

          <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 flex-1">
            {current.resumo}
          </p>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-600 font-mono">
              {current.data_publicacao || today}
            </span>
            {current.link ? (
              <a
                href={current.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-full transition-all border border-black"
              >
                Ver matéria <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-black border border-black px-3 py-1.5 rounded-full bg-white">
                <Newspaper className="w-3 h-3" /> Destaque interno
              </span>
            )}
          </div>
        </div>

        {allItems.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-black text-black rounded-full p-1.5 z-20"
              onClick={goPrev}
              aria-label="Destaque anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-black text-black rounded-full p-1.5 z-20"
              onClick={goNext}
              aria-label="Próximo destaque"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 px-1">
        <p className="text-xs text-black font-medium">
          {newsHighlights.length > 0
            ? `${newsHighlights.length} notícia${newsHighlights.length > 1 ? 's' : ''} selecionada${newsHighlights.length > 1 ? 's' : ''}`
            : 'Destaques do projeto'}
          {momentos.length > 0 && ` + ${momentos.length} interno${momentos.length > 1 ? 's' : ''}`}
        </p>
        <button
          type="button"
          onClick={selectTodayNews}
          disabled={isSelecting}
          className="flex items-center gap-1 text-xs text-black font-medium hover:opacity-70 transition-opacity disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${isSelecting ? 'animate-spin' : ''}`} />
          {isSelecting ? 'Atualizando...' : 'Atualizar com IA'}
        </button>
      </div>
    </div>
  );
}
