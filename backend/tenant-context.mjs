const TENANT_SCOPED_TABLES = new Set([
  'reports',
  'activities',
  'report_activities',
  'report_photos',
  'attachments',
  'purchase_requests',
  'purchase_documents',
  'rubricas',
  'lancamentos_rubrica',
  'project_metas',
  'metas',
  'meta_activities',
  'document_intakes',
  'notifications',
]);

function headerValue(req, names) {
  for (const name of names) {
    const value = String(req.headers[name] || req.query?.[name.replaceAll('-', '_')] || '').trim();
    if (value) return value;
  }
  return '';
}

async function activeMembership(pool, table, userId, idColumn, id) {
  const result = await pool.query(
    `SELECT * FROM ${table} WHERE user_id=$1 AND ${idColumn}=$2 AND COALESCE(status,'ACTIVE')='ACTIVE' LIMIT 1`,
    [userId, id],
  );
  return result.rows[0] || null;
}

export async function resolveTenantContext(pool, req) {
  const userId = String(req.userId || '').trim();
  if (!userId) throw new Error('authenticated_user_required');

  const requestedOrganizationId = headerValue(req, ['x-organization-id', 'x-org-id']);
  const requestedProjectId = headerValue(req, ['x-project-id']);

  const organizations = (await pool.query(`
    SELECT o.*, om.role AS organization_role
    FROM organizations o
    JOIN organization_memberships om ON om.organization_id=o.id
    WHERE om.user_id=$1 AND COALESCE(om.status,'ACTIVE')='ACTIVE' AND COALESCE(o.status,'ACTIVE')='ACTIVE'
    ORDER BY o.created_at, o.id
  `, [userId])).rows;
  if (!organizations.length) throw new Error('organization_membership_required');

  const organization = organizations.find((row) => !requestedOrganizationId || String(row.id) === requestedOrganizationId);
  if (!organization) throw new Error('organization_access_denied');

  const projects = (await pool.query(`
    SELECT p.*, pm.role AS project_role
    FROM projects p
    JOIN project_memberships pm ON pm.project_id=p.id
    WHERE p.organization_id=$1 AND pm.user_id=$2
      AND COALESCE(pm.status,'ACTIVE')='ACTIVE' AND COALESCE(p.status,'ACTIVE')='ACTIVE'
    ORDER BY p.created_at, p.id
  `, [organization.id, userId])).rows;
  if (!projects.length) throw new Error('project_membership_required');

  const project = projects.find((row) => !requestedProjectId || String(row.id) === requestedProjectId);
  if (!project) throw new Error('project_access_denied');

  return {
    organizationId: String(organization.id),
    organizationRole: String(organization.organization_role || 'MEMBER').toUpperCase(),
    projectId: String(project.id),
    projectRole: String(project.project_role || 'PROFESSIONAL').toUpperCase(),
    organization,
    project,
    organizations,
    projects,
  };
}

export function tenantScopedTable(table) {
  return TENANT_SCOPED_TABLES.has(String(table || ''));
}

export function applyTenantPayload(body = {}, table, columns = [], context) {
  if (!context || !tenantScopedTable(table)) return body;
  const next = { ...body };
  for (const [field, value] of [['organization_id', context.organizationId], ['project_id', context.projectId]]) {
    if (!columns.includes(field)) continue;
    if (next[field] !== undefined && next[field] !== null && String(next[field]) !== String(value)) {
      throw new Error(`${field}_context_mismatch`);
    }
    next[field] = value;
  }
  return next;
}

export function appendTenantScope(sql, values, table, columns, context) {
  if (!context || !tenantScopedTable(table)) return { sql, values };
  let nextSql = sql;
  const nextValues = [...values];
  for (const [field, value] of [['organization_id', context.organizationId], ['project_id', context.projectId]]) {
    if (!columns.includes(field)) continue;
    nextValues.push(value);
    nextSql += `${nextSql ? ' AND ' : ' WHERE '}${field}=$${nextValues.length}`;
  }
  return { sql: nextSql, values: nextValues };
}

export function tenantContextResponse(context) {
  return {
    organization: context.organization,
    project: context.project,
    organizationRole: context.organizationRole,
    projectRole: context.projectRole,
    organizations: context.organizations,
    projects: context.projects,
  };
}
