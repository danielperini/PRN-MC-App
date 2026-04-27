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
    seed = seed * 1103515245 + 12345 & 0x7fffffff;
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
    refetchInterval: 300000 // 5 min
  });

  const news = useMemo(() => getDailyNews(published, 10), [published]);

  // Auto-play
  useEffect(() => {
    if (news.length === 0 || isPaused) return;
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % news.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [news.length, isPaused]);

  const prev = () => setCurrent((i) => (i - 1 + news.length) % news.length);
  const next = () => setCurrent((i) => (i + 1) % news.length);

  if (isLoading) {
    return (
      <div className="w-full h-24 border border-gray-200 rounded-xl flex items-center justify-center gap-2 text-gray-400 text-sm mb-6">
        <Newspaper className="w-4 h-4 animate-pulse" /> Carregando notícias...
      </div>);

  }

  if (news.length === 0) return null;

  const item = news[current];
  // 3 itens visíveis: current, current+1, current+2
  const visible = [0, 1, 2].map((offset) => news[(current + offset) % news.length]);

  return (
    <div
      className="relative w-full mb-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}>
      
      {/* Grid de 3 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {visible.map((newsItem, idx) =>
        <div
          key={`${current}-${idx}`}
          className="relative border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col"
          style={{ minHeight: '136px' }}>
          
            {/* Barra de progresso apenas no primeiro */}
            {idx === 0 &&
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
                <div
              className="h-full bg-black transition-all duration-300"
              style={{ width: `${(current + 1) / news.length * 100}%` }} />
            
              </div>
          }

            <div className="flex items-stretch flex-1">
              {/* Imagem */}
              {newsItem.imagem_url &&
            <div className="w-20 flex-shrink-0 overflow-hidden">
                  <img
                src={newsItem.imagem_url}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => e.target.parentElement.style.display = 'none'} />
              
                </div>
            }

              {/* Conteúdo */}
              <div className="flex-1 flex flex-col justify-between p-3 min-w-0">
                <div className="min-w-0">
                  <h3 className="font-semibold text-xs text-gray-900 line-clamp-2">{newsItem.titulo}</h3>
                  <p className="text-xs text-gray-600 line-clamp-1 mt-1">{newsItem.resumo}</p>
                </div>
                {newsItem.link && (
                  <a
                    href={newsItem.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-black underline flex items-center gap-1 w-fit hover:opacity-70 mt-2"
                  >
                    Ler <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>




















            
            </div>
          </div>
        )}
      </div>

      {/* Controles e indicadores */}
      <div className="flex items-center justify-center gap-3 mt-2">
        <button
          onClick={prev}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-black transition-colors">
          
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex gap-1">
          {news.map((_, i) =>
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`h-1.5 rounded-full transition-all ${i === current ? 'bg-black w-3' : 'bg-gray-300 w-1.5'}`} />

          )}
        </div>
        <button
          onClick={next}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-black transition-colors">
          
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>);

}