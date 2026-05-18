/**
 * Política DEFINITIVA de permissões — Museus Centro / Viaduto das Artes
 * Este arquivo é a fonte única de verdade para todas as regras de acesso.
 * Importar e reutilizar em: Sidebar, rotas, páginas, botões, queries, tabelas.
 */

export const COORD_GERAL_EMAIL = 'daniel@periniprojetos.com.br';
export const COORD_FINANCEIRO_EMAILS = [
  COORD_GERAL_EMAIL,
  'josiane@periniprojetos.com.br',
];

export const AUTO_APPROVED_DOMAINS = [
  '@viadutodasartes.org.br',
  '@periniprojetos.com.br',
  '@pbh.gov.br',
];

export const AUTO_APPROVED_EMAILS = [
  'retinaeletricafilmes@gmail.com',
];

// ─── Classificação de perfil ───────────────────────────────────────────────────

/** Coordenador: acesso total ao sistema */
export function isCoordenador(user) {
  if (!user) return false;
  if (user.email === COORD_GERAL_EMAIL) return true;
  if (user.can_manage_users === true) return true;
  const role = String(user.role || '').toUpperCase();
  const baseRole = String(user.base_role || '').toUpperCase();
  return [
    'COORDENADOR', 'ADMIN',
    'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA',
    'COORD_COMUNICACAO', 'COORD_PROGRAMACAO',
    'CONSULTORIA_PROGRAMACAO',
  ].includes(role) || ['COORDENADOR', 'ADMIN'].includes(baseRole);
}

/** Patrocinador / Observador externo: acesso apenas a dados públicos aprovados */
export function isPatrocinador(user) {
  if (!user) return false;
  const role = String(user.role || '').toUpperCase();
  const baseRole = String(user.base_role || '').toUpperCase();
  return role === 'PATROCINADOR' || baseRole === 'PATROCINADOR';
}

/** Observador interno: acesso limitado a módulos públicos/operacionais */
export function isObservador(user, userPermission) {
  if (!user) return false;
  const baseRole = String(userPermission?.base_role || user.base_role || '').toUpperCase();
  const role = String(user.role || '').toUpperCase();
  return baseRole === 'OBSERVADOR' || role === 'OBSERVADOR';
}

/** Profissional: membro ativo da equipe sem poderes de coordenação */
export function isProfissional(user, userPermission) {
  if (!user) return false;
  if (isCoordenador(user)) return false;
  if (isObservador(user, userPermission)) return false;
  if (isPatrocinador(user)) return false;
  return true;
}

export function getUserPerfil(user, userPermission) {
  if (!user) return 'ANONIMO';
  if (isCoordenador(user)) return 'COORDENADOR';
  if (isObservador(user, userPermission)) return 'OBSERVADOR';
  if (isPatrocinador(user)) return 'OBSERVADOR';
  return 'PROFISSIONAL';
}

export function isCoordGeral(user) {
  if (!user) return false;
  return user.email === COORD_GERAL_EMAIL || user.can_manage_users === true;
}

export const OBSERVADOR_PAGES = new Set([
  'Dashboard',
  'DashboardPatrocinador',
  'GaleriaFotos',
  'Agenda',
  'ComunicacaoVisibilidade',
  'ProgramacaoEspelho',
  'RubricasPorMuseu',
  'Aparencia',
  'MeusDados',
  'Perfil',
  'Manual',
]);

export const PATROCINADOR_PAGES = new Set([
  'DashboardPatrocinador',
  'FinanceiroPatrocinador',
  'ComunicacaoVisibilidade',
  'Agenda',
  'ProgramacaoEspelho',
  'GaleriaFotos',
  'RubricasPorMuseu',
  'MuseusNoMapa',
  'MhaabMap',
  'MisMap',
  'MumoMap',
  'ViadutoMap',
  'Mensagens',
  'Manual',
  'Aparencia',
  'MeusDados',
  'Perfil',
]);

export const OBSERVADOR_EXTERNAL_PAGES = PATROCINADOR_PAGES;

export const PROFISSIONAL_EXTRA_PAGES = new Set([
  'Relatorios',
  'ReportEditor',
  'NovaAtividade',
  'EntradaUnica',
  'Compras',
  'Rubricas',
  'DashboardFinanceiro',
  'PrestacaoDeContas',
  'AssistentePlanejamento',
  'GeradorListaPresenca',
  'GeradorTermoCompromisso',
  'DashboardProfissional',
  'BaseConhecimento',
  'CoordReview',
  'GaleriaFotos',
  'Mensagens',
  'LeitorNoticias',
]);

export const PROFISSIONAL_PAGES = new Set([
  ...OBSERVADOR_PAGES,
  ...PROFISSIONAL_EXTRA_PAGES,
]);

export const COORDENADOR_ONLY_PAGES = new Set([
  'UserManagement',
  'PlataformaAdmin',
  'ActivityLog',
  'AuditLog',
  'AuditoriaInstitucional',
  'AdminUsers',
  'PlataformaConfig',
  'TeamManager',
  'GestaoDocumental',
  'GestaoDocumentalClean',
  'GestaoPagamentos',
  'ConsolidacaoFinanceira',
  'MonitoringPanel',
  'RelatorioMeta',
  'GestorArquivos',
]);

export function canAccessPage(pageName, user, userPermission) {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  if (isPatrocinador(user)) return PATROCINADOR_PAGES.has(pageName);
  if (isObservador(user, userPermission)) return OBSERVADOR_EXTERNAL_PAGES.has(pageName);
  return PROFISSIONAL_PAGES.has(pageName);
}

export const SIDEBAR_PATROCINADOR = new Set([
  'DashboardPatrocinador',
  'FinanceiroPatrocinador',
  'ComunicacaoVisibilidade',
  'Agenda',
  'MuseusNoMapa',
  'ProgramacaoEspelho',
  'GaleriaFotos',
  'RubricasPorMuseu',
  'Mensagens',
  'Manual',
  'Aparencia',
  'MeusDados',
]);

export const SIDEBAR_OBSERVADOR = new Set([
  'Dashboard',
  'GaleriaFotos',
  'Agenda',
  'ComunicacaoVisibilidade',
  'ProgramacaoEspelho',
  'RubricasPorMuseu',
  'Aparencia',
  'MeusDados',
]);

export const SIDEBAR_OBSERVADOR_EXTERNAL = SIDEBAR_PATROCINADOR;

export const SIDEBAR_PROFISSIONAL = new Set([
  'Dashboard',
  'EntradaUnica',
  'Relatorios',
  'ComunicacaoVisibilidade',
  'Agenda',
  'GaleriaFotos',
  'Compras',
  'DashboardFinanceiro',
  'PrestacaoDeContas',
  'RubricasPorMuseu',
  'LeitorNoticias',
  'ProgramacaoEspelho',
  'AssistentePlanejamento',
  'Manual',
  'Aparencia',
  'MeusDados',
  'GeradorListaPresenca',
  'GeradorTermoCompromisso',
  'Mensagens',
]);

export const GRUPOS_RUBRICA_BLOQUEADOS_PROFISSIONAL = [
  'equipe e gestao',
  'equipe e gestão',
  'equipe',
  'gestao',
  'gestão',
  'recursos humanos',
  'rh',
  'coordenacao',
  'coordenação',
  'administracao',
  'administração',
];

export const RUBRICAS_BLOQUEADAS_KEYWORDS_PROFISSIONAL = [
  'coordenador',
  'coordenação',
  'coordenacao',
  'assistente administrativo',
  'jurídico',
  'juridico',
  'financeiro',
  'comunicação interna',
  'comunicacao interna',
  'rh ',
  'recursos humanos',
  'gestão de equipe',
  'gestao de equipe',
];

function normalizeStr(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function shouldHideRubricaForProfissional(rubrica, user, userPermission) {
  if (isCoordenador(user)) return false;
  if (!isProfissional(user, userPermission)) return false;

  const grupo = normalizeStr(rubrica?.grupo);
  const nome = normalizeStr(rubrica?.rubrica || rubrica?.nome);

  for (const g of GRUPOS_RUBRICA_BLOQUEADOS_PROFISSIONAL) {
    if (grupo.includes(g)) return true;
  }
  for (const k of RUBRICAS_BLOQUEADAS_KEYWORDS_PROFISSIONAL) {
    if (nome.includes(k)) return true;
  }
  return false;
}

export function filterRubricasForUser(rubricas, user, userPermission) {
  if (!Array.isArray(rubricas)) return [];
  if (isCoordenador(user)) return rubricas;
  return rubricas.filter(r => !shouldHideRubricaForProfissional(r, user, userPermission));
}

export function purchaseBelongsToUser(purchase, user) {
  if (!purchase || !user) return false;
  if (isCoordenador(user)) return true;
  const email = String(user.email || '').toLowerCase().trim();
  const ownerEmails = [
    purchase.created_by,
    purchase.user_email,
    purchase.requester_email,
    purchase.solicitante_email,
    purchase.email_solicitante,
    purchase.author_email,
    purchase.owner_email,
  ].map(v => String(v || '').toLowerCase().trim()).filter(Boolean);
  return ownerEmails.includes(email);
}

export function canApproveRequests(user, userPermission) {
  if (!user) return false;
  if (isObservador(user, userPermission)) return false;
  if (isPatrocinador(user)) return false;
  return true;
}

export function canManageFinanceiro(user, userPermission) {
  if (!user) return false;
  if (isObservador(user, userPermission)) return false;
  if (isPatrocinador(user)) return false;
  return true;
}

export function canManageRubricas(user, userPermission) {
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  if (COORD_FINANCEIRO_EMAILS.includes(email)) return true;
  if (isObservador(user, userPermission)) return false;
  if (isPatrocinador(user)) return false;
  const role = String(user.role || user.base_role || userPermission?.base_role || '').toUpperCase();
  return role === 'ADMIN' || role === 'COORDENADOR' || isCoordenador(user);
}

export function canEditReport(currentUser, reportAuthorEmail) {
  if (!currentUser) return false;
  if (currentUser.email === reportAuthorEmail) return true;
  return isCoordenador(currentUser);
}

export function canViewReport(currentUser, reportAuthorEmail) {
  if (!currentUser) return false;
  if (isCoordenador(currentUser)) return true;
  return String(currentUser.email || '').toLowerCase() === String(reportAuthorEmail || '').toLowerCase();
}

export function canManageUsers(user) {
  if (!user) return false;
  return isCoordGeral(user) || user.can_manage_users === true || isCoordenador(user);
}

export function canManagePermissions(user) {
  if (!user) return false;
  return isCoordenador(user);
}

export function canAccessEquipe(user) {
  if (!user) return false;
  return isCoordenador(user);
}

export function canEditOwnTeamProfile(user, targetEmail) {
  if (!user || !targetEmail) return false;
  if (isCoordenador(user)) return true;
  return String(user.email || '').toLowerCase() === String(targetEmail || '').toLowerCase();
}

export function canEditAllTeamProfiles(user) {
  if (!user) return false;
  return isCoordenador(user);
}

export function canEditTeamProfile(user, targetEmail) {
  if (!user) return false;
  if (canEditAllTeamProfiles(user)) return true;
  return canEditOwnTeamProfile(user, targetEmail);
}

export function canViewTeamProfile(user, targetEmail) {
  if (!user) return false;
  if (isCoordenador(user)) return true;
  if (!targetEmail) return false;
  return String(user.email || '').toLowerCase() === String(targetEmail || '').toLowerCase();
}

export function isAutoApprovedDomain(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return AUTO_APPROVED_DOMAINS.some(domain => lower.endsWith(domain));
}

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

export const OBSERVADOR_PATROCINADOR_PERMISSIONS = PATROCINADOR_PERMISSIONS;

export function canSponsorAccess(permission) {
  return PATROCINADOR_PERMISSIONS[permission] === true;
}
