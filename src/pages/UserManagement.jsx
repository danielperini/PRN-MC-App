import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { isCoordenador, canManageUsers } from '@/components/auth/permissions';
import InviteDialog from '@/components/users/InviteDialog';
import { UserPlus, Settings, RefreshCw } from 'lucide-react';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function PermissionsDialog({ user, open, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);

  const role = user?.permission?.base_role || user?.role || 'PROFISSIONAL';
  const isCoord = role === 'COORDENADOR' || role === 'ADMIN';

  const [permissions, setPermissions] = useState({
    can_review_reports: user?.permission?.can_review_reports || false,
    can_manage_users: user?.permission?.can_manage_users || false,
    can_manage_files: user?.permission?.can_manage_files || false,
    can_view_audit_log: user?.permission?.can_view_audit_log || false,
    can_manage_platform: user?.permission?.can_manage_platform || false,
    gestao_compras: user?.permission?.gestao_compras || false,
    pode_aprovar_solicitacoes: user?.permission?.pode_aprovar_solicitacoes || false,
    must_submit_monthly_reports: user?.permission?.must_submit_monthly_reports || false,
  });

  function toggle(key) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        base_role: role,
        user_email: normalizeEmail(user?.email),
        user_name: user?.full_name || user?.email,
        funcao: user?.funcao || '',
        equipe: user?.equipe || '',
        museu: user?.museu || '',
        ...permissions,
      };

      if (isCoord) {
        Object.keys(payload).forEach((k) => {
          if (k.startsWith('can_') || k.includes('gestao') || k.includes('aprovar')) {
            payload[k] = true;
          }
        });
      }

      if (user?.permission?.id) {
        await base44.entities.UserPermission.update(user.permission.id, payload);
      } else {
        await base44.entities.UserPermission.create(payload);
      }

      toast.success('Permissões atualizadas com sucesso.');
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error('Erro ao salvar permissões.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permissões — {user?.full_name || user?.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {Object.entries(permissions).map(([key, value]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={isCoord ? true : value}
                disabled={isCoord}
                onCheckedChange={() => toggle(key)}
              />
              <span className="capitalize">{key.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full mt-4">
          {saving ? 'Salvando...' : 'Salvar permissões'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState(null);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users-management'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!currentUser,
  });

  const { data: allPermissions = [] } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => base44.entities.UserPermission.list(),
    enabled: !!currentUser,
  });

  const usersWithPermissions = React.useMemo(() => {
    const permMap = {};
    for (const p of allPermissions) {
      permMap[normalizeEmail(p.user_email)] = p;
    }
    return users.map((u) => ({
      ...u,
      permission: permMap[normalizeEmail(u.email)] || null,
    }));
  }, [users, allPermissions]);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['users-management'] });
    queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
  }

  if (!canManageUsers(currentUser)) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500 text-sm">Acesso restrito.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Usuários</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie usuários e permissões do sistema</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-800"
          >
            <UserPlus className="w-4 h-4" />
            Convidar usuário
          </button>
        </div>
      </div>

      {/* Tabela */}
      {loadingUsers ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-gray-700">Nome</th>
                <th className="text-left p-3 font-medium text-gray-700">Email</th>
                <th className="text-left p-3 font-medium text-gray-700">Papel</th>
                <th className="text-left p-3 font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usersWithPermissions.map((u) => (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">{u.full_name || '—'}</td>
                  <td className="p-3 text-gray-600">{u.email}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                      {u.permission?.base_role || u.role || 'PROFISSIONAL'}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setPermissionsUser(u)}
                      className="border rounded px-2 py-1 text-xs hover:bg-gray-100 flex items-center gap-1"
                    >
                      <Settings className="w-3 h-3" />
                      Permissões
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usersWithPermissions.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Nenhum usuário encontrado.
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showInvite && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
          currentUser={currentUser}
        />
      )}

      {permissionsUser && (
        <PermissionsDialog
          user={permissionsUser}
          open={!!permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaved={handleRefresh}
        />
      )}
    </div>
  );
}