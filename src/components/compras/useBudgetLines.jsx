import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useEffect } from 'react';

/**
 * Hook centralizado para carregar e sincronizar rubricas orçamentárias
 * Todas as páginas e componentes devem usar este hook para acesso às rubricas
 * Sincronização em tempo real via subscriptions
 */
export function useBudgetLines() {
  const queryClient = useQueryClient();

  const { data: budgetLines = [], isLoading, error } = useQuery({
    queryKey: ['budget-lines-sync'],
    queryFn: async () => {
      const allLines = await base44.entities.BudgetLine.list('codigo', 200);
      // Filtrar apenas rubricas do 3º Aditivo (MC3A)
      return allLines.filter(line => line.codigo?.startsWith('MC3A')).sort((a, b) => 
        a.codigo.localeCompare(b.codigo)
      );
    },
    staleTime: 30000, // 30 segundos
    gcTime: 5 * 60 * 1000, // 5 minutos (anteriormente cacheTime)
  });

  // Sincronizar mudanças em tempo real
  useEffect(() => {
    const unsubscribe = base44.entities.BudgetLine.subscribe((event) => {
      if (event.data?.codigo?.startsWith('MC3A')) {
        // Invalidar cache quando qualquer rubrica muda
        queryClient.invalidateQueries({ queryKey: ['budget-lines-sync'] });
      }
    });

    return unsubscribe;
  }, [queryClient]);

  return {
    budgetLines,
    isLoading,
    error,
    getBudgetLine: (id) => budgetLines.find(l => l.id === id),
    getBudgetLineByCode: (code) => budgetLines.find(l => l.codigo === code),
  };
}