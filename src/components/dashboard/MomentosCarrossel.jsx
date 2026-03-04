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

  return null;
}