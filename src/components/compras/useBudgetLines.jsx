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

  const invalidateBudgetQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines-sync'] }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-consolidadas'] })
    ]);
  };

  const { data: budgetLines = [], isLoading, error } = useQuery({
    queryKey: ['budget-lines'],
    queryFn: async () => {
      const allLines = await base44.entities.BudgetLine.list('codigo', 200);

      return (allLines || [])
        .filter(line => line?.codigo?.startsWith('MC3A'))
        .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || '')));
    },
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsubscribe = base44.entities.BudgetLine.subscribe(async (event) => {
      if (event?.data?.codigo?.startsWith('MC3A')) {
        await invalidateBudgetQueries();
      }
    });

    return unsubscribe;
  }, [queryClient]);

  return {
    budgetLines,
    isLoading,
    error,
    refreshBudgetLines: invalidateBudgetQueries,
    getBudgetLine: (id) => budgetLines.find(l => l.id === id),
    getBudgetLineByCode: (code) => budgetLines.find(l => l.codigo === code),
  };
}