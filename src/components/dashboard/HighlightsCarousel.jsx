import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HighlightsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  // Fetch Momentos (conteúdo interno)
  const { data: momentos = [] } = useQuery({
    queryKey: ['momentos-ativos'],
    queryFn: async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const data = await base44.entities.Momento.filter({
          ativo: true,
          deve_ser_publicado: true
        }, '-created_date', 10);
        return Array.isArray(data) ? data.filter(m => {
          if (!m.data_expiracao) return true;
          return m.data_expiracao >= today;
        }) : [];
      } catch (error) {
        console.error('Erro ao buscar Momentos:', error);
        return [];
      }
    },
    refetchInterval: 60000 // 1 minuto
  });

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

  // Combinar e ordenar conteúdo (Momentos primeiro, depois notícias)
  const allHighlights = React.useMemo(() => {
    const combined = [
      ...momentos.map(m => ({
        id: m.id,
        titulo: m.titulo,
        resumo: m.texto,
        imagem_url: m.imagem_url,
        link: null,
        tipo: 'momento',
        fonte: 'internal'
      })),
      ...newsHighlights.map(n => ({
        id: n.id,
        titulo: n.titulo,
        resumo: n.resumo,
        imagem_url: n.imagem_url,
        link: n.link,
        tipo: 'noticia',
        fonte: n.fonte
      }))
    ];
    return combined;
  }, [momentos, newsHighlights]);

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
        className="relative w-full rounded-2xl overflow-hidden bg-white border-2 border-black h-48 flex items-center justify-between px-3 py-6 group cursor-pointer"
        onMouseEnter={() => setAutoPlay(false)}
        onMouseLeave={() => setAutoPlay(true)}
        onClick={() => current.link && handleViewNews(current)}
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
              {current.fonte === 'internal' ? 'Destaque Interno' : 'Museu na Mídia'}
            </span>
          </div>
          <h3 className="text-xl font-bold text-black mb-2 line-clamp-2">
            {current.titulo}
          </h3>
          <p className="text-sm text-gray-700 mb-3 line-clamp-2">
            {current.resumo}
          </p>
          {current.link && (
            <div className="flex flex-col gap-2">
              <a 
                href={current.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {current.link}
              </a>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewNews(current);
                }}
                variant="outline"
                size="sm"
                className="border-black text-black hover:bg-black hover:text-white gap-1 w-fit"
              >
                Leia mais
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
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