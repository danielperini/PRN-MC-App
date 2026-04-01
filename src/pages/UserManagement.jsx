import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, UserPlus, Shield, User, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';

const ROLE_LABELS = {
  ADMIN: 'Admin',
  COORDENADOR: 'Coordenador',
  PROFISSIONAL: 'Profissional',
  PATROCINADOR: 'Patrocinador',
  admin: 'Admin',
  user: 'Usuário',
};

const ROLE_COLORS = {
  ADMIN: 'bg-black text-white',
  admin: 'bg-black text-white',
  COORDENADOR: 'bg-blue-100 text-blue-800',
  PROFISSIONAL: 'bg-gray-100 text-gray-800',
  PATROCINADOR: 'bg-purple-100 text-purple-800',
  user: 'bg-gray-100 text-gray-800',
};

const PERMISSION_GROUPS = [
  { key: 'can_review_reports', label: 'Revisar relatórios' },
  { key: 'can_manage_users', label: 'Gerenciar usuários' },
  { key: 'can_manage_files', label: 'Gerenciar arquivos' },
  { key: 'can_view_audit_log', label: 'Ver auditoria' },
  { key: 'can_manage_platform', label: 'Gerenciar plataforma' },
  { key: 'gestao_compras', label: 'Gestão de compras' },
  { key: 'pode_aprovar_solicitacoes', label: 'Aprovar solicitações' },
  { key: 'can_curate_news', label: 'Curadoria de notícias' },
  { key: 'must_submit_monthly_reports', label: 'Enviar relatório mensal' },
];

function PermissionsDialog({ user, permissions, onClose }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(permissions?.base_role || 'PROFISSIONAL');
  const [perms, setPerms] = useState(permissions || {});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const data = { ...perms, base_role: role, user_email: user.email, user_name: user.full_name };
      if (perms?.id) {
        await base44.entities.UserPermission.update(perms.id, data);
      } else {
        await base44.entities.UserPermission.create(data);
      }
      toast.success('Permissões salvas!');
      queryClient.invalidateQueries(['user-management']);
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permissões — {user.full_name || user.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Papel principal</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="PATROCINADOR">Patrocinador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Permissões específicas</label>
            <div className="space-y-2">
              {PERMISSION_GROUPS.map(p => (
                <div key={p.key} className="flex items-center gap-3">
                  <Checkbox
                    id={p.key}
                    checked={perms[p.key] === true}
                    onCheckedChange={v => setPerms(prev => ({ ...prev, [p.key]: v }))}
                  />
                  <label htmlFor={p.key} className="text-sm text-gray-700 cursor-pointer">{p.label}</label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="flex-1 gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [showInvite, setShowInvite] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['user-management'],
    queryFn: async () => {
      const [users, permissions] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.UserPermission.list(),
      ]);
      return users.map(u => ({
        ...u,
        permissions: permissions.find(p => p.user_email === u.email) || null,
      }));
    },
  });

  const filtered = data.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const cadastroUrl = `${window.location.origin}/Cadastro`;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-6 h-6 text-black" />
              <h1 className="text-2xl font-semibold text-black">Gestão de Usuários</h1>
            </div>
            <p className="text-sm text-gray-500">Gerencie membros e permissões da plataforma</p>
          </div>
          <Button onClick={() => setShowInvite(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Convidar
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>

        {/* Users list */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Carregando usuários...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Nenhum usuário encontrado</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(u => {
              const role = u.permissions?.base_role || u.role || 'user';
              return (
                <div
                  key={u.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-gray-200 rounded-xl px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
                >
                  {/* Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      {role === 'ADMIN' || role === 'admin' ? (
                        <Shield className="w-4 h-4 text-gray-600" />
                      ) : (
                        <User className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-black truncate">{u.full_name || '—'}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                  </div>

                  {/* Role + actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className={`text-xs ${ROLE_COLORS[role] || ROLE_COLORS.user}`}>
                      {ROLE_LABELS[role] || role}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => setEditingUser(u)}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Permissões
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {!isLoading && (
          <p className="text-xs text-gray-400 mt-4 text-center">{filtered.length} usuário(s)</p>
        )}
      </div>

      {/* Dialogs */}
      {editingUser && (
        <PermissionsDialog
          user={editingUser}
          permissions={editingUser.permissions}
          onClose={() => setEditingUser(null)}
        />
      )}

      {showInvite && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
          cadastroUrl={cadastroUrl}
        />
      )}
    </div>
  );
}