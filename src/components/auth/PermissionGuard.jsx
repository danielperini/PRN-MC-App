/**
 * PermissionGuard — bloqueia renderização de conteúdo sem permissão.
 *
 * Uso:
 *   <PermissionGuard allow="coord">conteúdo restrito</PermissionGuard>
 *   <PermissionGuard allow="profissional">...</PermissionGuard>
 *   <PermissionGuard allow={['coord', 'profissional']}>...</PermissionGuard>
 *   <PermissionGuard allow="coord" fallback={<p>Sem acesso</p>}>...</PermissionGuard>
 */

import React from 'react';
import { isCoordenador, isObservador, isPatrocinador, isProfissional } from '@/components/auth/permissions';

export default function PermissionGuard({ allow, currentUser, userPermission, fallback = null, children }) {
  if (!currentUser) return fallback;

  const roles = Array.isArray(allow) ? allow : [allow];

  const checks = {
    coord: isCoordenador(currentUser),
    profissional: isCoordenador(currentUser) || isProfissional(currentUser, userPermission),
    observador: true, // todos veem conteúdo de observador
    patrocinador: isPatrocinador(currentUser),
    all: true,
  };

  const allowed = roles.some(role => checks[role] === true);

  return allowed ? <>{children}</> : fallback;
}