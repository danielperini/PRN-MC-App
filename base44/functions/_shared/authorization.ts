const ALLOWED_ROLES = new Set([
  'admin',
  'administrator',
  'administrador',
  'coordenador',
  'coordinator',
  'coordenador geral',
  'coordenador_geral',
  'coord geral',
]);

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, ' ');
}

function collectRoles(user: any, permission: any = null) {
  return [
    user?.role,
    user?.base_role,
    user?.app_role,
    user?.user_role,
    user?.metadata?.role,
    user?.user_metadata?.role,
    user?.data?.role,
    permission?.base_role,
    permission?.role,
    permission?.app_role,
  ].map(normalize).filter(Boolean);
}

function isAllowed(roles: string[]) {
  return roles.some((role) => ALLOWED_ROLES.has(role) || role.startsWith('coordenador ') || role.startsWith('coordinator '));
}

export async function authorizeAdminOrCoordinator(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user) {
    return {
      ok: false,
      response: Response.json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Sessão não identificada. Atualize a página e entre novamente.',
      }, { status: 401 }),
    };
  }

  let roles = collectRoles(user);
  let permission = null;

  if (!isAllowed(roles) && user?.email) {
    try {
      const permissions = await base44.asServiceRole.entities.UserPermission.filter({
        user_email: String(user.email).trim().toLowerCase(),
      });
      permission = Array.isArray(permissions)
        ? [...permissions].sort((a, b) => String(b?.updated_date || b?.created_date || '').localeCompare(String(a?.updated_date || a?.created_date || '')))[0] || null
        : null;
      roles = collectRoles(user, permission);
    } catch (error) {
      console.warn('[authorization] Falha ao consultar UserPermission:', error);
    }
  }

  if (!isAllowed(roles)) {
    return {
      ok: false,
      user,
      permission,
      response: Response.json({
        success: false,
        code: 'INSUFFICIENT_PERMISSION',
        error: 'A operação exige perfil de administrador ou coordenador.',
        detected_roles: roles,
      }, { status: 403 }),
    };
  }

  return { ok: true, user, permission, roles };
}
