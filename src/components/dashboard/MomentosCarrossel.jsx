import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MomentosCarrossel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: momentos = [], isLoading } = useQuery({
    queryKey: ['momentos'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const allMomentos = await base44.entities.Momento.list('-created_date', 100);
      return allMomentos.filter(m => m.ativo && (!m.data_expiracao || m.data_expiracao >= today));
    },
    refetchInterval: 60000, // Refresh a cada minuto
  });

  if (isLoading || momentos.length === 0) return null;

  const momento = momentos[currentIndex];
  const hasMultiple = momentos.length > 1;

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % momentos.length);
  };

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + momentos.length) % momentos.length);
  };

  const handleSearch = () => {
    const searchQuery = encodeURIComponent('museus centro viaduto das artes projeto museu');
    window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 mb-6">
      <div className="flex flex-col md:flex-row gap-6 p-6">
        {/* Imagem */}
        <div className="flex-shrink-0 w-full md:w-48 h-48 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
          <img
            src={momento.imagem_url}
            alt={momento.titulo}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-2xl font-bold text-black">{momento.titulo}</h3>
                 <p className="text-xs text-gray-400 mt-1">
                    {momentos.length > 1 && `Momento ${currentIndex + 1} de ${momentos.length}`}
                 </p>
                </div>
                </div>
                <p className="text-base text-gray-700 leading-relaxed line-clamp-4">{momento.texto}</p>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            {/* Navegação */}
            {hasMultiple && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goPrev}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goNext}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Botão de Pesquisa */}
            <Button
              className="gap-2 text-xs bg-black hover:bg-gray-800 text-white"
              onClick={handleSearch}
            >
              <Search className="w-4 h-4" />
              Pesquisar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}