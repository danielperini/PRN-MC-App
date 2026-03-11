import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FONTE_COLORS = {
  portal_museus_centro: 'border-emerald-500',
  culturadoria_museus: 'border-purple-500',
  web_search: 'border-blue-500',
  internal: 'border-amber-500',
};

const FONTE_LABELS = {
  portal_museus_centro: 'Portal MC',
  culturadoria_museus: 'Culturadoria',
  web_search: 'Web',
  internal: 'Destaque',
};

const TAG_COLORS = {
  'Museuologia': 'bg-purple-100 text-purple-700 border-purple-300',
  'Cinema': 'bg-red-100 text-red-700 border-red-300',
  'Moda': 'bg-pink-100 text-pink-700 border-pink-300',
  'História de BH': 'bg-blue-100 text-blue-700 border-blue-300',
  'Patrimônio Cultural': 'bg-green-100 text-green-700 border-green-300',
  'Curadoria': 'bg-amber-100 text-amber-700 border-amber-300',
  'Educação': 'bg-indigo-100 text-indigo-700 border-indigo-300'
};

export default function UnifiedNewsCarousel() {
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const queryClient = useQueryClient();

  // Fetch news — apenas notícias publicadas em curadoria
  const { data: todayNews = [], isLoading: loadingNews, refetch: refetchNews } = useQuery({
    queryKey: ['today-news', today],
    queryFn: async () => {
      // Buscar apenas notícias com data_selecao definida (publicadas em curadoria)
      const all = await base44.entities.NewsHighlight.filter({ ativo: true }, '-data_selecao', 400);

      const curated = all.filter(n => n.data_selecao); // Apenas com data_selecao (curadoria)

      // Deduplicate by link
      const unique = Array.from(new Map(curated.map(n => [n.link || n.id, n])).values());

      // Shuffle randomly (different order every session)
      for (let i = unique.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unique[i], unique[j]] = [unique[j], unique[i]];
      }

      return unique.slice(0, 20);
    },
    refetchInterval: 180000,
    staleTime: 90000,
  });

  // Fetch momentos (internal highlights)
  const { data: momentos = [] } = useQuery({
    queryKey: ['momentos-ativos-carousel'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Momento.filter(
          { ativo: true, deve_ser_publicado: true },
          '-created_date', 5
        );
        return Array.isArray(data) ? data.filter(m => !m.data_expiracao || m.data_expiracao >= today) : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 120000,
  });

  const allItems = React.useMemo(() => {
    const items = [
      ...momentos.map(m => ({
        id: m.id,
        titulo: m.titulo,
        resumo: m.texto,
        imagem_url: m.imagem_url,
        link: null,
        fonte: 'internal',
        tags: m.tags || [],
        _tipo: 'momento',
      })),
      ...todayNews.map(n => ({
        id: n.id,
        titulo: n.titulo,
        resumo: n.resumo,
        imagem_url: n.imagem_url,
        link: n.link,
        fonte: n.fonte,
        data_publicacao: n.data_publicacao,
        tags: n.tags || [],
        _tipo: 'noticia',
      })),
    ];
    
    // Filter by selected tags
    let filtered = items;
    if (selectedTags.length > 0) {
      filtered = items.filter(item => 
        item.tags.some(tag => selectedTags.includes(tag))
      );
    }
    
    // Momentos sempre primeiro, depois ordem aleatória (já embaralhada no fetch)
    return filtered;
  }, [momentos, todayNews, selectedTags]);

  const allAvailableTags = React.useMemo(() => {
    const tags = new Set();
    [...todayNews, ...momentos].forEach(item => {
      (item.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [todayNews, momentos]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    setCurrentIndex(0);
  };

  const selectTodayNews = useCallback(async () => {
    if (isSelecting) return;
    setIsSelecting(true);
    try {
      await base44.functions.invoke('searchAndIndexNews', {});
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['today-news'] });
        refetchNews();
      }, 500);
    } catch (e) {
      console.error('selectTodayNews error:', e);
    } finally {
      setIsSelecting(false);
    }
  }, [isSelecting, queryClient, refetchNews]);

  // Auto-trigger selection if no news today
  useEffect(() => {
    if (!loadingNews && todayNews.length === 0 && !isSelecting) {
      selectTodayNews();
    }
  }, [loadingNews, todayNews.length, isSelecting, selectTodayNews]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || allItems.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % allItems.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [autoPlay, allItems.length]);

  const goTo = (idx) => {
    setCurrentIndex(idx);
  };

  const goPrev = (e) => {
    e.stopPropagation();
    goTo((currentIndex - 1 + allItems.length) % allItems.length);
  };

  const goNext = (e) => {
    e.stopPropagation();
    goTo((currentIndex + 1) % allItems.length);
  };

  // Loading state
  if (loadingNews || (isSelecting && allItems.length === 0)) {
    return (
      <div className="w-full mb-8 h-56 rounded-2xl bg-white border-2 border-black flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-black font-medium">
          {isSelecting ? 'Selecionando destaques do dia...' : 'Carregando...'}
        </span>
      </div>
    );
  }

  // Empty state
  if (allItems.length === 0) {
    return (
      <div className="w-full mb-8 h-56 rounded-2xl bg-white border-2 border-black flex items-center justify-center">
        <div className="text-center">
          <Newspaper className="w-8 h-8 text-black mx-auto mb-3" />
          <p className="text-sm text-black font-medium mb-4">Nenhum destaque disponível</p>
          <Button
            size="sm"
            onClick={selectTodayNews}
            className="border-2 border-black bg-white text-black hover:bg-black hover:text-white font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Buscar destaques
          </Button>
        </div>
      </div>
    );
  }

  const current = allItems[currentIndex] || allItems[0];
  const isMomento = current._tipo === 'momento';
  const borderColor = FONTE_COLORS[current.fonte] || 'border-gray-300';

  return (
    <div className="w-full mb-8">
      {/* Tag filters */}
      {allAvailableTags.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Filtrar:</span>
          {allAvailableTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border-2 transition-all ${
                selectedTags.includes(tag)
                  ? `${TAG_COLORS[tag]} border-current`
                  : 'bg-gray-100 text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {tag}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="px-2 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-all"
            >
              ✕ Limpar
            </button>
          )}
        </div>
      )}

      {/* Main card */}
      <div
        className="relative w-full rounded-2xl overflow-hidden h-56 group bg-white border-2 border-black"
        onMouseEnter={() => setAutoPlay(false)}
        onMouseLeave={() => setAutoPlay(true)}
      >
        {/* Left accent border */}
        <div className={`absolute inset-y-0 left-0 w-1 ${borderColor}`} />

        {/* Background image (subtle) */}
        {current.imagem_url && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${current.imagem_url})`, opacity: 0.08 }}
          />
        )}

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col p-6">
          {/* Top row: badge + dots */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full text-white bg-black">
                {isMomento ? '✦ Destaque' : '📡 ' + (FONTE_LABELS[current.fonte] || 'Notícia')}
              </span>
              {current.tags && current.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {current.tags.slice(0, 2).map(tag => (
                    <span
                      key={tag}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600 border-gray-300'}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation dots */}
            {allItems.length > 1 && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {allItems.slice(0, 8).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goTo(idx)}
                    className={`rounded-full transition-all duration-300 ${
                      idx === currentIndex
                        ? 'bg-black w-5 h-1.5'
                        : 'bg-gray-300 hover:bg-gray-400 w-1.5 h-1.5'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-black leading-snug line-clamp-2 mb-2 flex-shrink-0">
            {current.titulo}
          </h3>

          {/* Summary */}
          <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 flex-1">
            {current.resumo}
          </p>

          {/* Bottom row */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-600 font-mono">
              {current.data_publicacao || today}
            </span>
            {current.link && (
              <a
                href={current.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-full transition-all border border-black"
              >
                Ver matéria <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Arrow navigation */}
        {allItems.length > 1 && (
          <>
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-black text-black rounded-full p-1.5 z-20"
              onClick={goPrev}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-black text-black rounded-full p-1.5 z-20"
              onClick={goNext}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between mt-2 px-1">
        <p className="text-xs text-black font-medium">
          {todayNews.length > 0
            ? `${todayNews.length} destaque${todayNews.length > 1 ? 's' : ''} selecionado${todayNews.length > 1 ? 's' : ''}`
            : 'Destaques do dia'}
          {momentos.length > 0 && ` + ${momentos.length} interno${momentos.length > 1 ? 's' : ''}`}
        </p>
        <button
          onClick={selectTodayNews}
          disabled={isSelecting}
          className="flex items-center gap-1 text-xs text-black font-medium hover:opacity-70 transition-opacity disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${isSelecting ? 'animate-spin' : ''}`} />
          {isSelecting ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}