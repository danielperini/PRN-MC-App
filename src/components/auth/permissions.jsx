// 🔒 CONTROLE CENTRAL DE PERMISSÕES (NÃO ALTERAR SEM NECESSIDADE)

function normalizeRole(user) {
  return String(
    user?.base_role ||
    user?.permission?.base_role ||
    user?.permissions?.base_role ||
    user?.role ||
    ''
  ).trim().toUpperCase();
}

function normalizeEmailValue(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(user) {
  return normalizeEmailValue(user?.email || user?.user_email);
}

function truthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function isCoordGeral(user) {
  if (!user) return false;

  const role = normalizeRole(user);
  const email = normalizeEmail(user);

  return (
    role === 'ADMIN' ||
    role === 'COORD_GERAL' ||
    role === 'COORDENADOR_GERAL' ||
    email === 'daniel@periniprojetos.com.br' ||
    email === 'danielperini.mc@viadutodasartes.org.br'
  );
}

export function isCoordenador(user) {
  if (!user) return false;

  const role = normalizeRole(user);

  return (
    isCoordGeral(user) ||
    role === 'COORDENADOR' ||
    role === 'COORD_COMUNICACAO' ||
    role === 'COORD_ADMINISTRATIVA' ||
    role === 'COORD_PRODUCAO' ||
    truthy(user?.can_review_reports) ||
    truthy(user?.can_manage_users) ||
    truthy(user?.gestao_compras) ||
    truthy(user?.pode_aprovar_solicitacoes)
  );
}

export function isProfissional(user) {
  if (!user) return false;
  return !isCoordenador(user) && !!normalizeEmail(user);
}

export function canViewAll(user) {
  return isCoordenador(user);
}

export function canViewOwnData(user, record) {
  if (!user || !record) return false;
  if (isCoordenador(user)) return true;

  const userEmail = normalizeEmail(user);

  return (
    normalizeEmailValue(record?.user_email) === userEmail ||
    normalizeEmailValue(record?.email) === userEmail ||
    normalizeEmailValue(record?.created_by) === userEmail ||
    normalizeEmailValue(record?.created_by_email) === userEmail ||
    normalizeEmailValue(record?.uploadado_por) === userEmail ||
    normalizeEmailValue(record?.uploaded_by) === userEmail ||
    normalizeEmailValue(record?.uploaded_by_email) === userEmail ||
    normalizeEmailValue(record?.author_email) === userEmail ||
    normalizeEmailValue(record?.owner_email) === userEmail ||
    normalizeEmailValue(record?.solicitante_email) === userEmail ||
    normalizeEmailValue(record?.requester_email) === userEmail ||
    normalizeEmailValue(record?.profissional_email) === userEmail ||
    normalizeEmailValue(record?.prestador_email) === userEmail ||
    normalizeEmailValue(record?.team_member_email) === userEmail ||
    normalizeEmailValue(record?.responsavel_email) === userEmail
  );
}

export function canEditOwnData(user, record) {
  if (!user || !record) return false;
  if (isCoordenador(user)) return true;
  return canViewOwnData(user, record);
}

export function canViewPurchase(user, purchase) {
  return canViewOwnData(user, purchase);
}

export function canEditPurchase(user, purchase) {
  if (isCoordenador(user)) return true;
  const status = String(purchase?.status || '').toUpperCase();
  return canViewOwnData(user, purchase) && ['', 'RASCUNHO', 'SOLICITADO', 'DEVOLVIDO'].includes(status);
}

export function canViewPayment(user, payment) {
  return canViewOwnData(user, payment);
}

export function canEditPayment(user, payment) {
  if (isCoordenador(user)) return true;
  const status = String(payment?.status || '').toUpperCase();
  return canViewOwnData(user, payment) && ['', 'RASCUNHO', 'PENDENTE', 'DEVOLVIDO'].includes(status);
}

export function canViewDocument(user, doc) {
  return canViewOwnData(user, doc);
}

export function canEditDocument(user, doc) {
  if (isCoordenador(user)) return true;
  const status = String(doc?.status || doc?.status_processamento || '').toUpperCase();
  return canViewOwnData(user, doc) && ['', 'RASCUNHO', 'ENVIADO', 'AGUARDANDO_REVISAO', 'DEVOLVIDO', 'ERRO_PROCESSAMENTO'].includes(status);
}

export function canManageTeam(user) {
  return isCoordenador(user);
}

export function canViewDashboard(user) {
  return !!normalizeEmail(user);
}

export function canAccessEntradaUnica(user) {
  return !!normalizeEmail(user);
}

export function canAccessRelatorios(user) {
  return !!normalizeEmail(user);
}

export function canAccessCompras(user) {
  return !!normalizeEmail(user);
}

export function canAccessMeusDados(user) {
  return !!normalizeEmail(user);
}

export function canViewRubricas(user) {
  return isCoordenador(user);
}

export function canApprove(user) {
  return isCoordenador(user);
}

export function canManageUsers(user) {
  return isCoordenador(user);
}

export function canManageFiles(user) {
  return isCoordenador(user) || truthy(user?.can_manage_files);
}

export function canReviewReports(user) {
  return isCoordenador(user) || truthy(user?.can_review_reports);
}

export function canSubmitReports(user) {
  return !!normalizeEmail(user);
}

export function canManagePurchases(user) {
  return isCoordenador(user) || truthy(user?.gestao_compras);
}

export function canApprovePurchases(user) {
  return isCoordenador(user) || truthy(user?.pode_aprovar_solicitacoes);
}

export function buildUserFilter(user) {
  if (isCoordenador(user)) return {};
  return { user_email: normalizeEmail(user) };
}

export function filterOwnRecords(user, records = []) {
  if (isCoordenador(user)) return records || [];
  return (records || []).filter((record) => canViewOwnData(user, record));
}

export function mergeUserWithPermission(user, permission) {
  return {
    ...(user || {}),
    ...(permission || {}),
    permission: permission || null,
    base_role: permission?.base_role || user?.base_role || user?.role,
    area: permission?.area || user?.area || user?.museu || '',
    museu: permission?.museu || permission?.area || user?.museu || user?.area || '',
    equipe: permission?.equipe || user?.equipe || '',
    funcao: permission?.funcao || user?.funcao || '',
  };
}
