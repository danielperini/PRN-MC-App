// 🔒 CONTROLE CENTRAL DE PERMISSÕES (NÃO ALTERAR SEM NECESSIDADE)

function normalizeRole(user) {
  return String(user?.role || user?.base_role || '').trim().toUpperCase();
}

function normalizeEmail(user) {
  return String(user?.email || '').trim().toLowerCase();
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
    role === 'COORD_PRODUCAO'
  );
}

export function isProfissional(user) {
  if (!user) return false;
  return !isCoordenador(user) && !!user?.email;
}

export function canViewAll(user) {
  return isCoordenador(user);
}

export function canViewOwnData(user, record) {
  if (!user || !record) return false;
  if (isCoordenador(user)) return true;

  const userEmail = normalizeEmail(user);

  return (
    String(record?.user_email || '').toLowerCase() === userEmail ||
    String(record?.email || '').toLowerCase() === userEmail ||
    String(record?.created_by || '').toLowerCase() === userEmail ||
    String(record?.uploadado_por || '').toLowerCase() === userEmail ||
    String(record?.author_email || '').toLowerCase() === userEmail ||
    String(record?.owner_email || '').toLowerCase() === userEmail ||
    String(record?.solicitante_email || '').toLowerCase() === userEmail ||
    String(record?.requester_email || '').toLowerCase() === userEmail
  );
}

export function canViewPurchase(user, purchase) {
  return canViewOwnData(user, purchase);
}

export function canViewPayment(user, payment) {
  return canViewOwnData(user, payment);
}

export function canViewDocument(user, doc) {
  return canViewOwnData(user, doc);
}

export function canManageTeam(user) {
  return isCoordenador(user);
}

export function canViewDashboard(user) {
  return isCoordenador(user);
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

export function buildUserFilter(user) {
  if (isCoordenador(user)) return {};
  return { user_email: user?.email };
}
