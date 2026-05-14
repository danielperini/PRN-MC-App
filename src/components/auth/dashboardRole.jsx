import { isCoordenador } from '@/components/auth/permissions';

/**
 * Verifica se o usuário pode alternar a visão do dashboard (coordenador/profissional)
 * Delegado ao sistema central de permissões.
 */
export function canUseDashboardViewSwitcher(user) {
  return isCoordenador(user);
}