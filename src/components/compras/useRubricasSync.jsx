import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useEffect } from 'react';

/**
 * Hook para sincronizar rubricas com purchases
 * Atualiza valor_utilizado automaticamente baseado em purchases aprovadas
 */
export function useRubricasSync() {
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 100),
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases-for-rubricas-sync'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 200),
  });

  const { data: mapeamentos = [] } = useQuery({
    queryKey: ['mapeamentos'],
    queryFn: () => base44.entities.MapeamentoRubricas.list('descricao_original', 100),
  });

  // Sincronizar automaticamente quando purchases mudam
  useEffect(() => {
    const syncRubricas = async () => {
      if (!rubricas.length || !purchases.length) return;

      const approvePurchases = purchases.filter(p => p.status === 'APROVADO_COORD');

      for (const rubrica of rubricas) {
        // Calcular total utilizado pelos purchases aprovados
        const totalUsed = approvePurchases
          .filter(p => p.budgetline_id === rubrica.id)
          .reduce((sum, p) => sum + (p.valor_solicitado || 0), 0);

        if (totalUsed !== rubrica.valor_utilizado) {
          const saldo = rubrica.valor_rubrica - totalUsed;
          const percentual = (totalUsed / rubrica.valor_rubrica) * 100;

          await base44.entities.Rubrica.update(rubrica.id, {
            valor_utilizado: totalUsed,
            saldo,
            percentual_utilizado: percentual,
          });
        }
      }
    };

    syncRubricas();
  }, [rubricas, purchases]);

  // Mapear automaticarmente compras para rubricas
  const mapearCompraParaRubrica = (descricao) => {
    const mapeamento = mapeamentos.find(m => 
      m.ativo && m.descricao_original.toLowerCase() === descricao.toLowerCase()
    );
    return mapeamento?.rubrica_id || null;
  };

  return { rubricas, purchases, mapeamentos, mapearCompraParaRubrica };
}