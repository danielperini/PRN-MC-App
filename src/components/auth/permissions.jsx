// 🔒 CONTROLE CENTRAL DE PERMISSÕES (NÃO ALTERAR SEM NECESSIDADE)

export function isCoordenador(user) {
  if (!user) return false;

  return (
    user?.base_role === 'COORDENADOR' ||
    user?.base_role === 'ADMIN' ||
    user?.email === 'daniel@periniprojetos.com.br'
  );
}

export function isProfissional(user) {
  if (!user) return false;

  return (
    user?.base_role === 'PROFISSIONAL' ||
    (!isCoordenador(user) && !!user?.email)
  );
}

// 👁️ Pode ver tudo (somente coordenação)
export function canViewAll(user) {
  return isCoordenador(user);
}

// 📄 Pode ver apenas seus próprios dados
export function canViewOwnData(user, record) {
  if (!user || !record) return false;

  if (isCoordenador(user)) return true;

  const userEmail = (user.email || '').toLowerCase();

  return (
    (record?.user_email || '').toLowerCase() === userEmail ||
    (record?.email || '').toLowerCase() === userEmail ||
    (record?.created_by || '').toLowerCase() === userEmail
  );
}

// 🧾 Compras / Notas
export function canViewPurchase(user, purchase) {
  if (isCoordenador(user)) return true;
  return canViewOwnData(user, purchase);
}

// 💳 Pagamentos equipe
export function canViewPayment(user, payment) {
  if (isCoordenador(user)) return true;
  return canViewOwnData(user, payment);
}

// 📁 Documentos
export function canViewDocument(user, doc) {
  if (isCoordenador(user)) return true;
  return canViewOwnData(user, doc);
}

// 👥 Equipe (somente coordenação)
export function canManageTeam(user) {
  return isCoordenador(user);
}

// 📊 Dashboard geral
export function canViewDashboard(user) {
  return isCoordenador(user);
}

// 📊 Rubricas
export function canViewRubricas(user) {
  return isCoordenador(user);
}

// 📥 Aprovações
export function canApprove(user) {
  return isCoordenador(user);
}

// 🔐 Helper para filtros (IMPORTANTE)
export function buildUserFilter(user) {
  if (isCoordenador(user)) {
    return {}; // sem filtro
  }

  return {
    user_email: user.email
  };
}
