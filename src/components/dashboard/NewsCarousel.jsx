import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react';

// Seleciona 10 notícias aleatórias fixas por dia (seed baseado na data)
function getDailyNews(items, count = 10) {
  if (!items || items.length === 0) return [];
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  let seed = parseInt(today) % 9999;
  const arr = [...items];
  // Fisher-Yates determinístico com seed
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

export default function NewsCarousel() {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef(null);

  const { data: published = [], isLoading } = useQuery({
    queryKey: ['dashboard-news-carousel'],
    queryFn: () => base44.entities.NewsHighlight.filter({ ativo: true }, '-created_date', 100),
    refetchInterval: 300000, // 5 min
  });

  const news = useMemo(() => getDailyNews(published, 10), [published]);

  // Auto-play
  useEffect(() => {
    if (news.length === 0 || isPaused) return;
    intervalRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % news.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [news.length, isPaused]);

  const prev = () => setCurrent(i => (i - 1 + news.length) % news.length);
  const next = () => setCurrent(i => (i + 1) % news.length);

  if (isLoading) {
    return (
      <div className="w-full h-24 border border-gray-200 rounded-xl flex items-center justify-center gap-2 text-gray-400 text-sm mb-6">
        <Newspaper className="w-4 h-4 animate-pulse" /> Carregando notícias...
      </div>
    );
  }

  if (news.length === 0) return null;

  const item = news[current];

  return (
    <div
      className="relative w-full mb-6 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm min-h-[113px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Barra de progresso */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
        <div
          className="h-full bg-black transition-all duration-300"
          style={{ width: `${((current + 1) / news.length) * 100}%` }}
        />
      </div>

      <div className="flex items-stretch min-h-[113px]">
        {/* Imagem */}
        {item.imagem_url && (
          <div className="w-24 md:w-36 flex-shrink-0 overflow-hidden">
            <img
              src={item.imagem_url}
              alt=""
              className="w-full h-full object-cover"
              onError={e => e.target.parentElement.style.display = 'none'}
            />
          </div>
        )}

        {/* Conteúdo */}
        <div className="flex-1 px-4 py-3 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {item.fonte?.replace(/_/g, ' ')}
              </span>
              {item.data_publicacao && (
                <span className="text-[10px] text-gray-300">• {item.data_publicacao}</span>
              )}
              <span className="text-[10px] text-gray-300 ml-auto">{current + 1}/{news.length}</span>
            </div>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:underline">
                {item.titulo}
                <ExternalLink className="inline w-3 h-3 ml-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
            </a>
            {item.resumo && (
              <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{item.resumo}</p>
            )}
          </div>
        </div>

        {/* Controles */}
        <div className="flex flex-col items-center justify-center gap-1 px-2 border-l border-gray-100">
          <button
            onClick={prev}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-black transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-black transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Indicadores de ponto */}
      <div className="flex justify-center gap-1 pb-2">
        {news.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-black w-3' : 'bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
}