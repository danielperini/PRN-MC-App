import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HighlightsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  // Fetch NewsHighlight (notícias externas)
  const { data: newsHighlights = [] } = useQuery({
    queryKey: ['news-highlights'],
    queryFn: async () => {
      try {
        const data = await base44.entities.NewsHighlight.list('-data_encontrada', 10);
        return Array.isArray(data) ? data.filter(n => n.ativo) : [];
      } catch (error) {
        console.error('Erro ao buscar notícias:', error);
        return [];
      }
    },
    refetchInterval: 300000 // 5 minutos
  });

  // Usar apenas notícias
  const allHighlights = React.useMemo(() => {
    return newsHighlights.map(n => ({
      id: n.id,
      titulo: n.titulo,
      resumo: n.resumo,
      imagem_url: n.imagem_url,
      link: n.link,
      tipo: 'noticia',
      fonte: n.fonte
    }));
  }, [newsHighlights]);

  // Auto-play carrossel
  useEffect(() => {
    if (!autoPlay || allHighlights.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % allHighlights.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [autoPlay, allHighlights.length]);

  // Atualizar visualizações
  const handleViewNews = async (item) => {
    if (item.tipo === 'noticia') {
      const current = newsHighlights.find(n => n.id === item.id);
      if (current) {
        await base44.entities.NewsHighlight.update(item.id, {
          visualizacoes: (current.visualizacoes || 0) + 1
        });
      }
    }
    if (item.link) {
      window.open(item.link, '_blank');
    }
  };

  if (allHighlights.length === 0) {
    return (
      <div className="w-full mb-8 p-6 rounded-2xl border-2 border-gray-200 bg-gray-50 text-center">
        <p className="text-gray-500">Nenhum destaque disponível no momento</p>
      </div>
    );
  }

  const current = allHighlights[currentIndex] || allHighlights[0];

  return (
    <div className="w-full mb-8">
      <div 
        className="relative w-full rounded-2xl overflow-hidden bg-white border-2 border-black h-48 flex items-center justify-between px-6 py-6 group"
        onMouseEnter={() => setAutoPlay(false)}
        onMouseLeave={() => setAutoPlay(true)}
      >
        {/* Imagem de fundo (opcional) */}
        {current.imagem_url && (
          <div className="absolute inset-0 opacity-10 bg-cover bg-center" 
            style={{ backgroundImage: `url(${current.imagem_url})` }} 
          />
        )}

        {/* Conteúdo */}
        <div className="relative z-10 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-black text-white">
              Museu na Mídia
            </span>
          </div>
          <h3 className="text-xl font-bold text-black mb-2 line-clamp-2">
            {current.titulo}
          </h3>
          <p className="text-sm text-gray-700 mb-4 line-clamp-2">
            {current.resumo}
          </p>
          {current.link && (
            <Button
              onClick={() => handleViewNews(current)}
              variant="outline"
              size="sm"
              className="border-black text-black hover:bg-black hover:text-white gap-1"
            >
              Leia mais
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Setas navegação */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="bg-black/80 hover:bg-black text-white rounded-full h-10 w-10"
            onClick={() => setCurrentIndex(prev => (prev - 1 + allHighlights.length) % allHighlights.length)}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>

        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="bg-black/80 hover:bg-black text-white rounded-full h-10 w-10"
            onClick={() => setCurrentIndex(prev => (prev + 1) % allHighlights.length)}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Indicadores de slide */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {allHighlights.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex ? 'bg-black w-8' : 'bg-gray-400 w-2'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}