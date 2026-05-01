import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Hook para gerenciar atualizações otimistas com rollback automático
 * @param {string} queryKey - Chave da query a ser atualizada
 * @param {function} updateFn - Função que faz a requisição real
 * @returns {function} Função para executar a atualização otimista
 */
export function useOptimisticUpdate(queryKey, updateFn) {
  const queryClient = useQueryClient();

  return useCallback(
    async (updater, onSuccess, onError) => {
      const previousData = queryClient.getQueryData(queryKey);

      // Atualização otimista
      if (updater) {
        queryClient.setQueryData(queryKey, (old) => updater(old));
      }

      try {
        const result = await updateFn();
        if (onSuccess) onSuccess(result);
        return result;
      } catch (error) {
        // Rollback em caso de erro
        queryClient.setQueryData(queryKey, previousData);
        if (onError) onError(error);
        throw error;
      }
    },
    [queryClient, queryKey, updateFn]
  );
}