const DASHBOARD_REFRESH_KEYS = [
  'dashboard-update',
  'app-data-update',
];

export const DASHBOARD_PRIORITY_REFRESH_KEY = 'dashboard-priority-refresh';

export function requestDashboardPriorityRefresh(source = 'dashboard-click') {
  const timestamp = Date.now().toString();

  try {
    sessionStorage.setItem(DASHBOARD_PRIORITY_REFRESH_KEY, timestamp);
    sessionStorage.setItem('dashboard-refresh-source', source);
  } catch {}

  DASHBOARD_REFRESH_KEYS.forEach((key) => {
    try {
      localStorage.setItem(key, timestamp);
    } catch {}
  });

  try {
    window.dispatchEvent(new CustomEvent('dashboard:update', {
      detail: { source, priority: true, timestamp },
    }));
    window.dispatchEvent(new CustomEvent('app:data-refresh', {
      detail: { source, priority: true, timestamp },
    }));
  } catch {}
}

export function consumeDashboardPriorityRefresh() {
  try {
    const value = sessionStorage.getItem(DASHBOARD_PRIORITY_REFRESH_KEY);
    if (!value) return null;
    sessionStorage.removeItem(DASHBOARD_PRIORITY_REFRESH_KEY);
    return value;
  } catch {
    return null;
  }
}
