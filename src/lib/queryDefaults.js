/**
 * Padrões de staleTime e gcTime para useQuery no Museus Centro.
 * Usar estas constantes em vez de valores inline para garantir consistência.
 */

/** Dados gerais de listagem — painéis, relatórios, galeria (5 min) */
export const STALE_STANDARD = {
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
};

/** Dados críticos em tempo real — aprovações, status de NF (1 min) */
export const STALE_REALTIME = {
  staleTime: 1 * 60 * 1000,
  gcTime: 5 * 60 * 1000,
};

/** Dados estáticos — rubricas, configurações, metas (30 min) */
export const STALE_STATIC = {
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
};