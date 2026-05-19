import { base44 } from '@/api/base44Client';

export const COORDENADOR_GERAL_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
export const LOGIN_TRACKING_SESSION_KEY = 'museus_centro_login_tracked';
export const LOGIN_AUDIT_ACTION = 'USER_LOGIN';

export function normalizeLoginEmail(value) {
  return String(value || '').toLowerCase().trim();
}

export function canViewUserLoginMonitoring(currentUser) {
  return normalizeLoginEmail(currentUser?.email) === COORDENADOR_GERAL_EMAIL;
}

function getSessionStorageSafe() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

function getUserName(user) {
  return user?.full_name || user?.name || user?.email || '';
}

export async function trackUserLoginOnce(user) {
  const email = normalizeLoginEmail(user?.email);
  if (!email) return { tracked: false, reason: 'missing-email' };

  const sessionStorage = getSessionStorageSafe();
  const trackedEmail = sessionStorage?.getItem(LOGIN_TRACKING_SESSION_KEY);
  if (trackedEmail === email) {
    return { tracked: false, reason: 'already-tracked' };
  }

  sessionStorage?.setItem(LOGIN_TRACKING_SESSION_KEY, email);

  try {
    if (!base44.entities.AuditLog?.create) {
      return { tracked: false, reason: 'audit-log-unavailable' };
    }

    await base44.entities.AuditLog.create({
      action: LOGIN_AUDIT_ACTION,
      entity_type: 'USER',
      entity_id: email,
      actor_email: email,
      actor_name: getUserName(user),
      details: 'Login registrado para monitoramento restrito de acesso.',
    });

    return { tracked: true };
  } catch (error) {
    console.warn('Não foi possível registrar o login do usuário:', error);
    return { tracked: false, reason: 'audit-log-error', error };
  }
}

function getLoginDate(log) {
  const rawDate = log?.login_at || log?.created_date || log?.updated_date || '';
  const date = rawDate ? new Date(rawDate) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getLoginEmailFromLog(log) {
  return normalizeLoginEmail(log?.user_email || log?.actor_email || log?.entity_id);
}

export async function fetchUserLoginMonitoringStats() {
  if (!base44.entities.AuditLog?.filter && !base44.entities.AuditLog?.list) {
    return { statsByEmail: {}, unavailable: true };
  }

  let logs = [];
  try {
    if (base44.entities.AuditLog?.filter) {
      logs = await base44.entities.AuditLog.filter(
        { action: LOGIN_AUDIT_ACTION },
        '-created_date',
        5000
      );
    } else {
      logs = await base44.entities.AuditLog.list('-created_date', 5000);
    }
  } catch (error) {
    console.warn('Não foi possível carregar logs de login filtrados:', error);
    try {
      logs = await base44.entities.AuditLog.list('-created_date', 5000);
    } catch (fallbackError) {
      console.warn('Não foi possível carregar logs de auditoria para monitoramento:', fallbackError);
      return { statsByEmail: {}, unavailable: true, error: fallbackError };
    }
  }

  const statsByEmail = {};
  const loginLogs = Array.isArray(logs)
    ? logs.filter((log) => log?.action === LOGIN_AUDIT_ACTION)
    : [];

  loginLogs.forEach((log) => {
    const email = getLoginEmailFromLog(log);
    if (!email) return;

    const loginDate = getLoginDate(log);
    if (!statsByEmail[email]) {
      statsByEmail[email] = {
        total_logins: 0,
        ultimo_login_em: null,
      };
    }

    statsByEmail[email].total_logins += 1;
    if (
      loginDate &&
      (!statsByEmail[email].ultimo_login_em ||
        loginDate > new Date(statsByEmail[email].ultimo_login_em))
    ) {
      statsByEmail[email].ultimo_login_em = loginDate.toISOString();
    }
  });

  return { statsByEmail, unavailable: false };
}

export function formatLoginDate(value) {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
