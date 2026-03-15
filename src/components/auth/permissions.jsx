/**
 * Política central de permissões do sistema Museus Centro
 * Referenciar este arquivo em todos os componentes que precisam verificar permissões.
 */

export const COORD_GERAL_EMAIL = 'daniel@periniprojetos.com.br';

export const AUTO_APPROVED_DOMAINS = [
  '@viadutodasartes.org.br',
  '@periniprojetos.com.br',
];

/**
 * Verifica se o usuário é o Coordenador Geral (Daniel Perini)
 * Único com poder total de gestão de usuários.
 */
export function isCoordGeral(user) {
  if (!user) return false;
  return (
    user.email === COORD_GERAL_EMAIL ||
    user.can_manage_users === true
  );
}

/**
 * Verifica se o usuário é coordenador (qualquer tipo, inclui coord geral)
 */
export function isCoordenador(user) {
  if (!user) return false;
  if (isCoordGeral(user)) return true;
  return ['COORDENADOR', 'ADMIN', 'admin', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA', 'COORD_COMUNICACAO', 'CONSULTORIA_PROGRAMACAO'].includes(user.role);
}

/**
 * Verifica se o email pertence a um domínio com aprovação automática
 */
export function isAutoApprovedDomain(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return AUTO_APPROVED_DOMAINS.some(domain => lower.endsWith(domain));
}

/**
 * Verifica se o usuário pode editar um relatório
 */
export function canEditReport(currentUser, reportAuthorEmail) {
  if (!currentUser) return false;
  if (currentUser.email === reportAuthorEmail) return true;
  return isCoordenador(currentUser);
}

/**
 * Verifica se o usuário pode gerenciar usuários (aprovar, editar, excluir)
 */
export function canManageUsers(user) {
  return isCoordGeral(user);
}