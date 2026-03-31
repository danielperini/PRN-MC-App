/**
 * Política central de permissões do sistema Museus Centro
 * Referenciar este arquivo em todos os componentes que precisam verificar permissões.
 */

export const COORD_GERAL_EMAIL = 'daniel@periniprojetos.com.br';

export const AUTO_APPROVED_DOMAINS = [
  '@viadutodasartes.org.br',
  '@periniprojetos.com.br',
  '@pbh.gov.br',
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
  return [
    'COORDENADOR',
    'ADMIN',
    'admin',
    'COORD_PRODUCAO',
    'COORD_ADMINISTRATIVA',
    'COORD_COMUNICACAO',
    'CONSULTORIA_PROGRAMACAO',
  ].includes(user.role);
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
 * Verifica se o usuário pode gerenciar usuários (aprovar, editar, excluir permissões)
 * COORDENADOR também pode quando tem can_manage_users = true
 */
export function canManageUsers(user) {
  if (!user) return false;
  return isCoordGeral(user) || user.can_manage_users === true || isCoordenador(user);
}

/**
 * Verifica se o usuário pode gerenciar permissões de outros usuários
 * Qualquer COORDENADOR ou ADMIN pode editar permissões
 */
export function canManagePermissions(user) {
  if (!user) return false;
  return isCoordenador(user);
}

/**
 * Todos os usuários autenticados podem acessar a área Equipe.
 */
export function canAccessEquipe(user) {
  return !!user;
}

/**
 * Usuário comum pode editar apenas o próprio perfil de equipe.
 * Coordenadores podem editar qualquer perfil.
 */
export function canEditOwnTeamProfile(user, targetEmail) {
  if (!user || !targetEmail) return false;
  if (isCoordenador(user)) return true;
  return String(user.email || '').toLowerCase() === String(targetEmail || '').toLowerCase();
}

/**
 * Apenas coordenadores podem editar todos os perfis da equipe.
 */
export function canEditAllTeamProfiles(user) {
  if (!user) return false;
  return isCoordenador(user);
}

/**
 * Regra consolidada para edição de perfil de equipe.
 */
export function canEditTeamProfile(user, targetEmail) {
  if (!user) return false;
  if (canEditAllTeamProfiles(user)) return true;
  return canEditOwnTeamProfile(user, targetEmail);
}

/**
 * Regra consolidada para visualização de perfil de equipe.
 * Todos acessam a área; usuário comum vê apenas o próprio perfil;
 * coordenadores visualizam todos.
 */
export function canViewTeamProfile(user, targetEmail) {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  if (!targetEmail) return false;
  return String(user.email || '').toLowerCase() === String(targetEmail || '').toLowerCase();
}

/**
 * Verifica se o usuário é um PATROCINADOR (leitura apenas, dados aprovados)
 */
export function isPatrocinador(user) {
  if (!user) return false;
  return user.role === 'PATROCINADOR' || user.base_role === 'PATROCINADOR';
}

/**
 * Permissões específicas do PATROCINADOR
 */
export const PATROCINADOR_PERMISSIONS = {
  can_view_sponsor_dashboard: true,
  can_view_approved_reports: true,
  can_view_approved_programacao: true,
  can_view_public_gallery: true,
  can_view_budget_summary: true,
  can_view_project_kpis: true,
  can_manage_users: false,
  can_manage_platform: false,
  can_manage_files: false,
  can_manage_equipes: false,
  can_review_reports: false,
  gestao_compras: false,
  can_view_audit_log: false,
};

/**
 * Verifica se um usuário PATROCINADOR pode acessar uma permissão específica
 */
export function canSponsorAccess(permission) {
  return PATROCINADOR_PERMISSIONS[permission] === true;
}