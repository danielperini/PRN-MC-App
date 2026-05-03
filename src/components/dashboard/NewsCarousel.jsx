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

  return null;
































































































}