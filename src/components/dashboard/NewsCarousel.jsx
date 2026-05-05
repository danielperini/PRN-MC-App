import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';

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
  {
    id: 'fallback-4',
    titulo: 'Programação e memória institucional',
    resumo: 'Destaques do projeto podem ser publicados como momentos internos e exibidos automaticamente no painel.',
    imagem_url: '',
    link: '',
    fonte: 'fallback',
    tags: ['Curadoria'],
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

function getVisibleItems(items, startIndex, count = 4) {
  if (!items.length) return [];
  const visible = [];
  const total = Math.min(count, items.length);
  for (let i = 0; i < total; i += 1) {
    visible.push(items[(startIndex + i) % items.length]);
  }
  return visible;
}

function NewsCard({ item, today }) {
  const isMomento = item._tipo === 'momento';
  const fonteClass = FONTE_COLORS[item.fonte] || 'bg-gray-700';
  const fonteLabel = FONTE_LABELS[item.fonte] || 'Notícia';

  return (
    <div className="relative min-h-[220px] rounded-2xl overflow-hidden bg-white border-2 border-black group">
      <div className={`absolute inset-x-0 top-0 h-1 ${fonteClass}`} />

      {item.imagem_url ? (
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(${item.imagem_url})`, opacity: 0.12 }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-white" />
      )}

      <div className="relative z-10 h-full flex flex-col p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full text-white bg-black">
              {isMomento ? '✦ Destaque' : `📡 ${fonteLabel}`}
            </span>
            {(item.tags || []).slice(0, 2).map((tag) => (
              <span
                key={tag}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600 border-gray-300'}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <h3 className="text-base md:text-lg font-bold text-black leading-snug line-clamp-2 mb-2 flex-shrink-0">
          {item.titulo}
        </h3>

        <p className="text-sm text-gray-700 leading-relaxed line-clamp-3 flex-1">
          {item.resumo}
        </p>

        <div className="flex items-center justify-between gap-2 mt-4">
          <span className="text-[11px] text-gray-600 font-mono truncate">
            {item.data_publicacao || today}
          </span>
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-full transition-all border border-black flex-shrink-0"
            >
              Ver matéria <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-black border border-black px-3 py-1.5 rounded-full bg-white flex-shrink-0">
              <Newspaper className="w-3 h-3" /> Destaque
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewsCarousel({ items: itemsProp = null }) {
  const today = todayBR();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);
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
    refetchInterval: 60000,
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

    return seededShuffle(deduplicateByLinkOrTitle(withFallback), today).slice(0, 20);
  }, [itemsProp, momentos, newsHighlights, today]);

  useEffect(() => {
    if (!autoPlay || allItems.length <= 4) return undefined;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 4) % allItems.length);
    }, 15000);
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
      setCurrentIndex(0);
    } finally {
      setIsSelecting(false);
    }
  }, [isSelecting, queryClient, refetchNews]);

  function goPrev(e) {
    e.stopPropagation();
    setCurrentIndex((currentIndex - 4 + allItems.length) % allItems.length);
  }

  function goNext(e) {
    e.stopPropagation();
    setCurrentIndex((currentIndex + 4) % allItems.length);
  }

  function goToPage(pageIndex) {
    setCurrentIndex(pageIndex * 4);
  }

  if (loadingNews && allItems.length === 0) {
    return (
      <div className="w-full mb-8 h-56 rounded-2xl bg-white border-2 border-black flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-black font-medium">Carregando notícias...</span>
      </div>
    );
  }

  const visibleItems = getVisibleItems(allItems, currentIndex, 4);
  const pageCount = Math.max(1, Math.ceil(allItems.length / 4));
  const currentPage = Math.floor(currentIndex / 4);

  return (
    <div className="w-full mb-8">
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Destaques e Notícias</p>
          <p className="text-[11px] text-gray-500">
            Curadoria diária de até 20 notícias · troca automática a cada 15 segundos
          </p>
        </div>

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

      <div
        className="relative group"
        onMouseEnter={() => setAutoPlay(false)}
        onMouseLeave={() => setAutoPlay(true)}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleItems.map((item, idx) => (
            <NewsCard key={`${item.id || item.link || item.titulo}-${idx}`} item={item} today={today} />
          ))}
        </div>

        {allItems.length > 4 && (
          <>
            <button
              type="button"
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-black text-black rounded-full p-1.5 z-20"
              onClick={goPrev}
              aria-label="Destaques anteriores"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-black text-black rounded-full p-1.5 z-20"
              onClick={goNext}
              aria-label="Próximos destaques"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {Array.from({ length: pageCount }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goToPage(idx)}
              className={`rounded-full transition-all duration-300 ${
                idx === currentPage ? 'bg-black w-6 h-1.5' : 'bg-gray-300 hover:bg-gray-400 w-1.5 h-1.5'
              }`}
              aria-label={`Ir para grupo de notícias ${idx + 1}`}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2 px-1">
        <p className="text-xs text-black font-medium">
          {newsHighlights.length > 0
            ? `${Math.min(20, newsHighlights.length)} notícia${newsHighlights.length > 1 ? 's' : ''} em curadoria diária`
            : 'Destaques do projeto'}
          {momentos.length > 0 && ` + ${momentos.length} interno${momentos.length > 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  );
}
