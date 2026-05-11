export function canUseDashboardViewSwitcher(user, hookIsCoordenador = false) {
  if (hookIsCoordenador) return true;
  if (!user) return false;

  const role = String(user.role || '').trim().toUpperCase();
  const baseRole = String(user.base_role || '').trim().toUpperCase();

  const coordinatorRoles = [
    'ADMIN',
    'COORDENADOR',
    'COORD_GERAL',
    'COORD_PRODUCAO',
    'COORD_ADMINISTRATIVA',
    'COORD_COMUNICACAO',
    'COORD_PROGRAMACAO',
    'CONSULTORIA_PROGRAMACAO',
  ];

  return (
    user.can_manage_users === true ||
    user.pode_gerenciar_usuarios === true ||
    coordinatorRoles.includes(role) ||
    coordinatorRoles.includes(baseRole)
  );
}
