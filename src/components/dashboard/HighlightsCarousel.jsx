import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper, RefreshCw, Rss } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SOURCE_LABELS = {
  portal_museus_centro: 'Portal MC',
  culturadoria_museus: 'Culturadoria',
  web_search: 'Web',
  internal: 'Interno',
};

const FONTE_COLORS = {
  portal_museus_centro: 'bg-emerald-500/80',
  culturadoria_museus: 'bg-purple-500/80',
  web_search: 'bg-blue-500/80',
  internal: 'bg-amber-500/80',
};

const MUSEU_LABELS = {
  museu_centro: 'Museus Centro',
  museu_pbh: 'Museu PBH',
};

export default function HighlightsCarousel() {
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const queryClient = useQueryClient();

  // Fetch today's selected news
   const { data: todayNews = [], isLoading: loadingNews, refetch: refetchNews } = useQuery({
     queryKey: ['today-news', today],
     queryFn: async () => {
       const all = await base44.entities.NewsHighlight.filter({ ativo: true }, '-created_date', 200);
       return all.filter(n => n.data_selecao === today).slice(0, 5);
     },
     refetchInterval: 60000, // 1 minuto
     staleTime: 30000, // 30 segundos
   });

  // Fetch momentos (internal highlights)
  const { data: momentos = [] } = useQuery({
    queryKey: ['momentos-ativos-carousel'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Momento.filter(
          { ativo: true, deve_ser_publicado: true },
          '-created_date', 3
        );
        return Array.isArray(data) ? data.filter(m => !m.data_expiracao || m.data_expiracao >= today) : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 120000,
  });

  const allItems = React.useMemo(() => [
    ...momentos.map(m => ({
      id: m.id,
      titulo: m.titulo,
      resumo: m.texto,
      imagem_url: m.imagem_url,
      link: null,
      fonte: 'internal',
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
      _tipo: 'noticia',
    })),
  ], [momentos, todayNews]);

  const selectTodayNews = useCallback(async () => {
    if (isSelecting) return;
    setIsSelecting(true);
    try {
      // Call search and index function to fetch and select new news
      await base44.functions.invoke('searchAndIndexNews', {});

      // Force refetch after a short delay to ensure data is updated
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
  }, [loadingNews, todayNews.length]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || allItems.length <= 1) return;
    const timer = setInterval(() => {
      setTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % allItems.length);
        setTransitioning(false);
      }, 200);
    }, 7000);
    return () => clearInterval(timer);
  }, [autoPlay, allItems.length]);

  const goTo = (idx) => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(idx);
      setTransitioning(false);
    }, 150);
  };

  const goPrev = (e) => {
    e.stopPropagation();
    goTo((currentIndex - 1 + allItems.length) % allItems.length);
  };

  const goNext = (e) => {
    e.stopPropagation();
    goTo((currentIndex + 1) % allItems.length);
  };

  // Loading / selecting state
  if (loadingNews || (isSelecting && allItems.length === 0)) {
    return (
      <div className="w-full mb-5 h-52 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center gap-3 border border-gray-800">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <span className="text-sm text-white/60">
          {isSelecting ? 'Selecionando notícias do dia...' : 'Carregando destaques...'}
        </span>
      </div>
    );
  }

  // Empty state
  if (allItems.length === 0) {
    return (
      <div className="w-full mb-5 h-40 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
        <div className="text-center">
          <Newspaper className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400 mb-3">Nenhum destaque hoje</p>
          <Button size="sm" variant="outline" onClick={selectTodayNews} className="text-xs gap-1">
            <RefreshCw className="w-3 h-3" />Buscar notícias
          </Button>
        </div>
      </div>
    );
  }

  const current = allItems[currentIndex] || allItems[0];
  const isMomento = current._tipo === 'momento';
  const bgClass = isMomento
    ? 'from-black via-gray-900 to-gray-800'
    : 'from-[#0a0a1a] via-[#0f1428] to-[#0a1035]';
  const fonteColor = FONTE_COLORS[current.fonte] || 'bg-gray-500/80';

  return (
    <div className="w-full mb-5">
      {/* Main card */}
      <div
        className={`relative w-full rounded-2xl overflow-hidden h-52 group bg-gradient-to-br ${bgClass}`}
        onMouseEnter={() => setAutoPlay(false)}
        onMouseLeave={() => setAutoPlay(true)}
      >
        {/* Background image */}
        {current.imagem_url && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${current.imagem_url})`, opacity: 0.12 }}
          />
        )}

        {/* Left accent gradient */}
        <div className="absolute inset-y-0 left-0 w-1 bg-white/20" />

        {/* Dark overlay on right for readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent" />

        {/* Content */}
        <div
          className={`relative z-10 h-full flex flex-col p-5 transition-opacity duration-200 ${transitioning ? 'opacity-0' : 'opacity-100'}`}
        >
          {/* Top row: source + dots */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full text-white backdrop-blur-sm ${fonteColor}`}>
                {isMomento ? '✦ Destaque' : '📡 Mídia'}
              </span>
              {!isMomento && (
                <span className="text-[10px] text-white/40 font-medium">
                  {SOURCE_LABELS[current.fonte] || 'Web'}
                </span>
              )}
              {current.museu_classificacao && (
                <span className="text-[10px] bg-blue-500/80 text-white px-2.5 py-1 rounded-full font-medium">
                  {MUSEU_LABELS[current.museu_classificacao] || current.museu_classificacao}
                </span>
              )}
            </div>

            {/* Navigation dots */}
            {allItems.length > 1 && (
              <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                {allItems.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goTo(idx)}
                    className={`rounded-full transition-all duration-300 ${
                      idx === currentIndex
                        ? 'bg-white w-5 h-1.5'
                        : 'bg-white/25 hover:bg-white/50 w-1.5 h-1.5'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-white leading-snug line-clamp-2 mb-2 flex-shrink-0">
            {current.titulo}
          </h3>

          {/* Summary */}
          <p className="text-sm text-white/65 leading-relaxed line-clamp-2 flex-1">
            {current.resumo}
          </p>

          {/* Bottom row */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-white/35 font-mono">
              {current.data_publicacao || today}
            </span>
            {current.link && (
              <a
                href={current.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/12 hover:bg-white/22 px-3 py-1.5 rounded-full transition-all backdrop-blur-sm border border-white/10"
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
              className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm z-20"
              onClick={goPrev}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm z-20"
              onClick={goNext}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <Rss className="w-3 h-3 text-green-500" />
          <span>
            {todayNews.length > 0
              ? `${todayNews.length} notícia${todayNews.length > 1 ? 's' : ''} selecionada${todayNews.length > 1 ? 's' : ''} hoje`
              : 'Nenhuma notícia selecionada'}
          </span>
        </div>
        <button
          onClick={selectTodayNews}
          disabled={isSelecting}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-black transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${isSelecting ? 'animate-spin' : ''}`} />
          {isSelecting ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}