/**
 * Hook centralizado de permissões — Museus Centro / Viaduto das Artes
 *
 * Uso:
 *   const { isCoord, isProfissional, isObs, perfil, canAccess, filterRubricas } = usePermissions();
 */

import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import {
  isCoordenador,
  isObservador,
  isPatrocinador,
  isProfissional as isProfissionalFn,
  getUserPerfil,
  canAccessPage,
  canApproveRequests,
  canManageFinanceiro,
  canManageUsers,
  filterRubricasForUser,
  purchaseBelongsToUser as purchaseBelongsToUserFn,
  shouldHideRubricaForProfissional,
} from '@/components/auth/permissions';
import { normalizeEmail, syncUserAccessState } from '@/utils/auth/recoverExistingUserAccess';

export function usePermissions() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const user = await base44.auth.me();
        const recovery = await syncUserAccessState(user, { origin: 'use-permissions' });
        const recoveredUser = recovery?.recovered ? recovery.user : user;
        if (!active) return;
        setCurrentUser(recoveredUser);

        if (recoveredUser?.email) {
          const perms = await base44.entities.UserPermission.filter({ user_email: normalizeEmail(recoveredUser.email) }).catch(() => []);
          if (active) setUserPermission(Array.isArray(perms) ? perms[0] || null : null);
        }
      } catch {
        if (active) setCurrentUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const permissions = useMemo(() => {
    const isCoord = isCoordenador(currentUser);
    const isObs = isObservador(currentUser, userPermission) || isPatrocinador(currentUser);
    const isProfissional = isProfissionalFn(currentUser, userPermission);
    const perfil = getUserPerfil(currentUser, userPermission);

    return {
      currentUser,
      userPermission,
      loading,

      // Perfis
      isCoord,
      isObs,
      isProfissional,
      isPatrocinador: isPatrocinador(currentUser),
      perfil,

      // Verificações de acesso
      canAccess: (pageName) => canAccessPage(pageName, currentUser, userPermission),
      canApprove: canApproveRequests(currentUser, userPermission),
      canManageFinanceiro: canManageFinanceiro(currentUser, userPermission),
      canManageUsers: canManageUsers(currentUser),

      // Rubricas
      filterRubricas: (rubricas) => filterRubricasForUser(rubricas, currentUser, userPermission),
      shouldHideRubrica: (rubrica) => shouldHideRubricaForProfissional(rubrica, currentUser, userPermission),

      // Ownership
      purchaseBelongsToUser: (purchase) => purchaseBelongsToUserFn(purchase, currentUser),
    };
  }, [currentUser, userPermission, loading]);

  return permissions;
}
