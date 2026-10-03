export function normalizeLoginEmail(value) {
  return String(value || '').toLowerCase().trim();
}

export function canViewUserLoginMonitoring(currentUser) {
  return ['ADMIN', 'COORDENADOR'].includes(String(currentUser?.role || '').toUpperCase()) ||
    currentUser?.can_manage_users === true;
}

// The server records a login exactly when it issues a session cookie.
// Page refreshes must not inflate the count or depend on browser storage.
export async function trackUserLoginOnce() {
  return { tracked: false, reason: 'server-recorded' };
}

export async function fetchUserLoginMonitoringStats() {
  const response = await fetch('/api/admin/user-login-stats', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Não foi possível consultar os logins (${response.status}).`);
  return response.json();
}

export function formatLoginDate(value) {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
