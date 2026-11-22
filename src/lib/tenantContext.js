const STORAGE_KEY = 'appgestor.tenant-context';

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function getTenantContext() {
  if (!canUseStorage()) return { organizationId: '', projectId: '' };
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      organizationId: String(value.organizationId || value.organization_id || '').trim(),
      projectId: String(value.projectId || value.project_id || '').trim(),
    };
  } catch {
    return { organizationId: '', projectId: '' };
  }
}

export function setTenantContext(context = {}) {
  const next = {
    organizationId: String(context.organizationId || context.organization_id || '').trim(),
    projectId: String(context.projectId || context.project_id || '').trim(),
  };
  if (canUseStorage()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearTenantContext() {
  if (canUseStorage()) window.localStorage.removeItem(STORAGE_KEY);
}

export function tenantHeaders(headers = {}) {
  const context = getTenantContext();
  const next = { ...headers };
  if (context.organizationId) next['X-Organization-Id'] = context.organizationId;
  if (context.projectId) next['X-Project-Id'] = context.projectId;
  return next;
}

export async function selectTenantContext(context = {}, request = fetch) {
  const selected = setTenantContext(context);
  const response = await request('/api/context', {
    method: 'POST',
    credentials: 'include',
    headers: tenantHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(selected),
  });
  if (!response.ok) {
    clearTenantContext();
    const error = new Error('Unable to select organization/project context');
    error.status = response.status;
    throw error;
  }
  return response.json();
}
