import { base44 } from '@/api/base44Client';

const COORD_EMAILS = new Set([
  'daniel@periniprojetos.com.br',
  'josiane@periniprojetos.com.br',
]);

const EMAIL_FIELDS = [
  'email',
  'user_email',
  'created_by',
  'solicitante_email',
  'profissional_email',
  'responsavel_email',
  'author_email',
  'report_author',
  'linked_user',
];

const APPROVED_STATUSES = new Set(['APROVADO', 'APPROVED', 'ATIVO', 'ACTIVE', 'LIBERADO']);
const BLOCKED_STATUSES = new Set(['REJEITADO', 'REJECTED', 'BLOQUEADO', 'BLOCKED', 'INATIVO', 'EXCLUIDO', 'EXCLUÍDO', 'REMOVIDO', 'DELETED']);

export function normalizeEmail(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  if (role === 'ADMIN') return 'ADMIN';
  if (role.includes('COORD')) return 'COORDENADOR';
  if (role === 'PATROCINADOR' || role === 'OBSERVADOR') return 'OBSERVADOR';
  return role || '';
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '';
}

function hasEmailMatch(item, email) {
  const target = normalizeEmail(email);
  return EMAIL_FIELDS.some((field) => normalizeEmail(item?.[field]) === target);
}

async function safeList(entityName, order = '-updated_date', limit = 1000) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.list) return [];
    const data = await entity.list(order, limit);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function safeFilter(entityName, field, value) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.filter || !value) return [];
    const data = await entity.filter({ [field]: value });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function findByEmail(entityName, email, fields = EMAIL_FIELDS, order = '-updated_date', limit = 1000) {
  const normalized = normalizeEmail(email);
  const results = [];

  for (const field of fields) {
    const filtered = await safeFilter(entityName, field, normalized);
    results.push(...filtered);
  }

  if (results.length === 0) {
    const listed = await safeList(entityName, order, limit);
    results.push(...listed.filter((item) => hasEmailMatch(item, normalized)));
  }

  const seen = new Set();
  return results.filter((item) => {
    const key = item?.id || JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function logAccessRecovery(payload) {
  try {
    const auditLog = base44.entities?.AuditLog;
    if (!auditLog?.create) return;
    await auditLog.create({
      action: 'ACCESS_RECOVERY',
      entity_type: 'UserAccess',
      entity_id: payload.email,
      actor_email: payload.email,
      details: payload.status,
      metadata: payload,
    });
  } catch {
    // Log opcional. Não deve bloquear login nem poluir console.
  }
}

function inferRole({ authUser, permission, registration, teamMember, userRecord, hasOperationalHistory }) {
  const explicit = normalizeRole(
    firstNonEmpty(
      permission?.base_role,
      permission?.role,
      registration?.base_role,
      registration?.role,
      teamMember?.base_role,
      teamMember?.role,
      teamMember?.perfil,
      userRecord?.base_role,
      userRecord?.role,
      authUser?.base_role,
      authUser?.role
    )
  );

  const email = normalizeEmail(authUser?.email || registration?.email || permission?.user_email || teamMember?.email);
  if (COORD_EMAILS.has(email)) return 'COORDENADOR';
  if (explicit) return explicit;
  if (hasOperationalHistory) return 'PROFISSIONAL';
  return 'PROFISSIONAL';
}

function inferName({ authUser, registration, teamMember, userRecord }) {
  return firstNonEmpty(
    authUser?.full_name,
    authUser?.name,
    registration?.full_name,
    registration?.nome,
    teamMember?.nome,
    teamMember?.full_name,
    userRecord?.full_name,
    userRecord?.name
  );
}

function inferMuseu({ registration, teamMember, userRecord }) {
  return firstNonEmpty(
    registration?.museu,
    registration?.centro_custo,
    teamMember?.museu,
    teamMember?.centro_custo,
    userRecord?.museu,
    userRecord?.centro_custo,
    'Atuação Geral'
  );
}

function shouldRecover({ registrations, permissions, teamMembers, userRecords, reports, purchases }) {
  const approvedRegistration = registrations.find((item) => APPROVED_STATUSES.has(normalizeStatus(item.status)));
  const activePermission = permissions.find((item) => normalizeStatus(item.status) !== 'INATIVO' && normalizeStatus(item.status) !== 'BLOQUEADO');
  const activeTeamMember = teamMembers.find((item) => item.ativo !== false && !BLOCKED_STATUSES.has(normalizeStatus(item.status)));
  const activeUser = userRecords.find((item) => item.ativo !== false && !BLOCKED_STATUSES.has(normalizeStatus(item.status)));

  // Histórico operacional é preservado por auditoria e não deve reabrir acesso sozinho
  // para usuários que foram removidos. Ele só ajuda a inferir perfil quando já há vínculo ativo.
  const hasOperationalHistory = reports.length > 0 || purchases.length > 0;
  const hasActiveAccessAnchor = Boolean(approvedRegistration || activePermission || activeTeamMember || activeUser);

  return Boolean(
    hasActiveAccessAnchor ||
      (hasOperationalHistory && registrations.length > 0 && approvedRegistration)
  );
}

async function ensureRegistration({ email, name, role, museu, registrations, source }) {
  const approved = registrations.find((item) => APPROVED_STATUSES.has(normalizeStatus(item.status)));
  if (approved?.id) {
    const patch = {
      email,
      status: 'APROVADO',
      acesso_liberado: true,
      base_role: approved.base_role || role,
      role: approved.role || role,
    };
    await base44.entities.UserRegistration.update(approved.id, patch).catch(() => null);
    return { ...approved, ...patch };
  }

  const existing = registrations[0];
  if (existing?.id) {
    const patch = {
      email,
      full_name: existing.full_name || name,
      museu: existing.museu || museu,
      role: existing.role || role,
      base_role: existing.base_role || role,
      status: 'APROVADO',
      acesso_liberado: true,
      recovered_access: true,
      recovered_from: source,
      recovered_at: new Date().toISOString(),
    };
    await base44.entities.UserRegistration.update(existing.id, patch).catch(() => null);
    return { ...existing, ...patch };
  }

  if (!base44.entities.UserRegistration?.create) return null;
  return base44.entities.UserRegistration.create({
    email,
    full_name: name || email,
    museu,
    role,
    base_role: role,
    funcao: role === 'OBSERVADOR' ? 'Observador' : '',
    equipe: role === 'OBSERVADOR' ? 'Observador' : '',
    status: 'APROVADO',
    acesso_liberado: true,
    recovered_access: true,
    recovered_from: source,
    recovered_at: new Date().toISOString(),
  }).catch(() => null);
}

async function ensurePermission({ email, name, role, museu, permissions }) {
  const permissionPayload = {
    user_email: email,
    full_name: name || email,
    base_role: role,
    role,
    museu,
    status: 'ATIVO',
    acesso_liberado: true,
    is_active: true,
    recovered_access: true,
    updated_at: new Date().toISOString(),
  };

  const existing = permissions[0];
  if (existing?.id) {
    await base44.entities.UserPermission.update(existing.id, { ...existing, ...permissionPayload }).catch(() => null);
    return { ...existing, ...permissionPayload };
  }

  if (!base44.entities.UserPermission?.create) return null;
  return base44.entities.UserPermission.create({
    ...permissionPayload,
    created_at: new Date().toISOString(),
  }).catch(() => null);
}

async function syncAuthUser(authUser, { role, name, museu }) {
  try {
    await base44.auth.updateMe?.({
      full_name: authUser.full_name || name || authUser.email,
      role: authUser.role || role,
      base_role: authUser.base_role || role,
      museu: authUser.museu || museu,
      acesso_liberado: true,
    });
  } catch {
    // Auth profile may be read-only in some Base44 contexts.
  }
}

export async function recoverExistingUserAccess(authUser = null, options = {}) {
  const startedAt = new Date().toISOString();
  let currentUser = authUser;

  try {
    if (!currentUser?.email) {
      currentUser = await base44.auth.me().catch(() => null);
    }

    const email = normalizeEmail(currentUser?.email || options.email);
    if (!email) {
      return { recovered: false, reason: 'NO_AUTH_EMAIL' };
    }

    const [
      registrations,
      permissions,
      teamMembers,
      userRecords,
      profileRecords,
      reports,
      purchases,
    ] = await Promise.all([
      findByEmail('UserRegistration', email, ['email']),
      findByEmail('UserPermission', email, ['user_email', 'email']),
      findByEmail('TeamMember', email, ['email', 'user_email']),
      findByEmail('User', email, ['email', 'user_email']),
      findByEmail('Profile', email, ['email', 'user_email']),
      findByEmail('Report', email, ['created_by', 'user_email', 'author_email', 'report_author'], '-created_date', 1000),
      findByEmail('PurchaseRequest', email, ['created_by', 'user_email', 'solicitante_email', 'profissional_email', 'responsavel_email'], '-created_date', 1000),
    ]);

    const blockedRegistration = registrations.find((item) => BLOCKED_STATUSES.has(normalizeStatus(item.status)));
    if (blockedRegistration && registrations.every((item) => !APPROVED_STATUSES.has(normalizeStatus(item.status)))) {
      await logAccessRecovery({
        email,
        status: 'BLOCKED_REGISTRATION_NOT_RECOVERED',
        origin: options.origin || 'login',
        data: startedAt,
      });
      return { recovered: false, reason: 'BLOCKED_REGISTRATION' };
    }

    const canRecover = shouldRecover({
      registrations,
      permissions,
      teamMembers,
      userRecords: [...userRecords, ...profileRecords],
      reports,
      purchases,
    });

    if (!canRecover) {
      if (options.auditNoMatch) {
        await logAccessRecovery({
          email,
          status: 'NO_LEGACY_LINK_FOUND',
          origin: options.origin || 'login',
          data: startedAt,
        });
      }
      return { recovered: false, reason: 'NO_LEGACY_LINK_FOUND' };
    }

    const registration = registrations[0] || null;
    const permission = permissions[0] || null;
    const teamMember = teamMembers[0] || null;
    const userRecord = userRecords[0] || profileRecords[0] || null;
    const hasOperationalHistory = reports.length > 0 || purchases.length > 0;
    const role = inferRole({ authUser: currentUser, permission, registration, teamMember, userRecord, hasOperationalHistory });
    const name = inferName({ authUser: currentUser, registration, teamMember, userRecord });
    const museu = inferMuseu({ registration, teamMember, userRecord });

    const recoveredRegistration = await ensureRegistration({
      email,
      name,
      role,
      museu,
      registrations,
      source: options.origin || 'login',
    });
    const recoveredPermission = await ensurePermission({ email, name, role, museu, permissions });
    await syncAuthUser(currentUser, { role, name, museu });

    const recoveredUser = {
      ...currentUser,
      email,
      full_name: currentUser?.full_name || name,
      name: currentUser?.name || name,
      role: currentUser?.role || role,
      base_role: recoveredPermission?.base_role || recoveredRegistration?.base_role || role,
      museu: currentUser?.museu || museu,
      acesso_liberado: true,
    };

    await logAccessRecovery({
      email,
      user_email: email,
      status: 'RECOVERED',
      origin: options.origin || 'login',
      role_restaurada: role,
      registration_id: recoveredRegistration?.id,
      permission_id: recoveredPermission?.id,
      reports_found: reports.length,
      purchases_found: purchases.length,
      team_members_found: teamMembers.length,
      data: startedAt,
    });

    return {
      recovered: true,
      user: recoveredUser,
      role,
      registration: recoveredRegistration,
      permission: recoveredPermission,
    };
  } catch (error) {
    await logAccessRecovery({
      email: normalizeEmail(currentUser?.email || options.email),
      status: 'RECOVERY_ERROR',
      origin: options.origin || 'login',
      erro: error?.message,
      data: startedAt,
    });
    return { recovered: false, reason: 'RECOVERY_ERROR', error };
  }
}

export async function validateUserAccess(authUser, options = {}) {
  const email = normalizeEmail(authUser?.email);
  if (!email) return { allowed: false, reason: 'NO_EMAIL' };

  const registrations = await findByEmail('UserRegistration', email, ['email']);
  const approvedRegistration = registrations.find((item) => APPROVED_STATUSES.has(normalizeStatus(item.status)));
  const pendingOrRejected = registrations.find((item) => ['PENDENTE', 'REJEITADO', 'PENDING', 'REJECTED'].includes(normalizeStatus(item.status)));

  if (approvedRegistration) {
    const recovered = await recoverExistingUserAccess(authUser, { ...options, origin: options.origin || 'approved-registration-sync' });
    return { allowed: true, user: recovered.user || authUser, registration: approvedRegistration };
  }

  const recovered = await recoverExistingUserAccess(authUser, options);
  if (recovered.recovered) return { allowed: true, user: recovered.user, recovered };

  if (pendingOrRejected) {
    return {
      allowed: false,
      reason: normalizeStatus(pendingOrRejected.status) === 'REJEITADO' ? 'REJECTED' : 'PENDING',
      registration: pendingOrRejected,
    };
  }

  return { allowed: false, reason: recovered.reason || 'NOT_REGISTERED' };
}

export async function syncUserAccessState(authUser, options = {}) {
  return recoverExistingUserAccess(authUser, { ...options, origin: options.origin || 'sync' });
}

export async function migrateLegacyUsers(options = {}) {
  const users = await safeList('User', '-updated_date', options.limit || 1000);
  const profiles = await safeList('Profile', '-updated_date', options.limit || 1000);
  const teamMembers = await safeList('TeamMember', '-updated_date', options.limit || 1000);
  const emails = new Set([...users, ...profiles, ...teamMembers].map((item) => normalizeEmail(item.email || item.user_email)).filter(Boolean));
  const results = [];

  for (const email of emails) {
    results.push(await recoverExistingUserAccess({ email }, { origin: 'legacy-migration' }));
  }

  return results;
}

export async function revokeUserAccess(emailInput, options = {}) {
  const email = normalizeEmail(emailInput);
  if (!email) return { revoked: false, reason: 'NO_EMAIL' };

  const status = options.status || 'EXCLUIDO';
  const now = new Date().toISOString();

  const [
    registrations,
    permissions,
    teamMembers,
    userRecords,
    profileRecords,
  ] = await Promise.all([
    findByEmail('UserRegistration', email, ['email']),
    findByEmail('UserPermission', email, ['user_email', 'email']),
    findByEmail('TeamMember', email, ['email', 'user_email']),
    findByEmail('User', email, ['email', 'user_email']),
    findByEmail('Profile', email, ['email', 'user_email']),
  ]);

  const registrationPatch = {
    email,
    status,
    acesso_liberado: false,
    bloqueado: true,
    excluido: status === 'EXCLUIDO',
    revogado_em: now,
    motivo_revogacao: options.reason || 'Acesso removido pela coordenação',
    requires_new_approval: true,
  };

  if (registrations.length > 0) {
    await Promise.all(registrations.map((item) => (
      item?.id
        ? base44.entities.UserRegistration.update(item.id, { ...item, ...registrationPatch }).catch(() => null)
        : null
    )));
  } else if (base44.entities.UserRegistration?.create) {
    await base44.entities.UserRegistration.create({
      ...registrationPatch,
      full_name: options.full_name || email,
      role: 'PROFISSIONAL',
      base_role: 'PROFISSIONAL',
      museu: 'Atuação Geral',
      criado_por_revogacao: true,
    }).catch(() => null);
  }

  await Promise.all([
    ...permissions.map((item) => item?.id ? base44.entities.UserPermission.delete(item.id).catch(() => null) : null),
    ...teamMembers.map((item) => item?.id ? base44.entities.TeamMember.delete(item.id).catch(() => null) : null),
    ...userRecords.map((item) => item?.id ? base44.entities.User.delete(item.id).catch(() => null) : null),
    ...profileRecords.map((item) => item?.id ? base44.entities.Profile.delete(item.id).catch(() => null) : null),
  ]);

  await base44.functions.invoke('deleteUserAccount', { email }).catch((error) => {
    console.warn('Conta de autenticação não removida pelo backend:', error);
  });

  await logAccessRecovery({
    email,
    user_email: email,
    status: 'ACCESS_REVOKED',
    revocation_status: status,
    origin: options.origin || 'user-management',
    actor_email: options.actor_email || '',
    reason: options.reason || '',
    registrations: registrations.length,
    permissions: permissions.length,
    team_members: teamMembers.length,
    users: userRecords.length,
    profiles: profileRecords.length,
    data: now,
  });

  return {
    revoked: true,
    email,
    registrations: registrations.length,
    permissions: permissions.length,
    teamMembers: teamMembers.length,
    users: userRecords.length,
    profiles: profileRecords.length,
  };
}
