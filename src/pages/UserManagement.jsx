import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Pencil, Trash2, KeyRound, ShieldCheck, MessageSquare, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function UserCard({ user, onEdit, onPassword, onPermissions, onMessage, onDelete }) {
  const role = user.permission?.base_role || user.role || 'PROFISSIONAL';

  return (
    <div className="border rounded-xl p-4 flex justify-between items-center">
      <div>
        <p className="font-medium">{user.full_name || user.nome || '-'}</p>
        <p className="text-xs text-gray-500">{user.email}</p>
        <p className="text-xs text-gray-500">
          {[user.area, user.equipe, user.funcao].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-1 text-xs border rounded">{role}</span>

        <Button size="sm" variant="outline" onClick={() => onEdit(user)}>
          <Pencil className="w-4 h-4 mr-1" /> Editar
        </Button>

        <Button size="sm" variant="outline" onClick={() => onPassword(user)}>
          <KeyRound className="w-4 h-4 mr-1" /> Senha
        </Button>

        <Button size="sm" variant="outline" onClick={() => onPermissions(user)}>
          <ShieldCheck className="w-4 h-4 mr-1" /> Permissões
        </Button>

        <Button size="sm" variant="outline" onClick={() => onMessage(user)}>
          <MessageSquare className="w-4 h-4 mr-1" /> Mensagem
        </Button>

        <Button size="sm" variant="outline" onClick={() => onDelete(user)}>
          <Trash2 className="w-4 h-4 mr-1 text-red-600" /> Excluir
        </Button>
      </div>
    </div>
  );
}

function PermissionsDialog({ user, open, onClose }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const role = user.permission?.base_role || user.role || 'PROFISSIONAL';
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
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        base_role: role,
        user_email: normalizeEmail(user.email),
        user_name: user.full_name || user.nome,
        ...permissions,
      };

      if (isCoord) {
        Object.keys(payload).forEach(k => {
          if (k.startsWith('can_') || k.includes('gestao') || k.includes('aprovar')) {
            payload[k] = true;
          }
        });
      }

      if (user.permission?.id) {
        await base44.entities.UserPermission.update(user.permission.id, payload);
      } else {
        await base44.entities.UserPermission.create(payload);
      }

      toast.success('Permissões atualizadas');
      queryClient.invalidateQueries(['users']);
      onClose();
    } catch {
      toast.error('Erro ao salvar permissões');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissões — {user.full_name || user.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {Object.entries(permissions).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={isCoord ? true : v}
                disabled={isCoord}
                onCheckedChange={() => toggle(k)}
              />
              <span className="text-sm capitalize">{k.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-4 w-full">
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');

  const { data = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      const perms = await base44.entities.UserPermission.list();
      return users.map(u => ({
        ...u,
        permission: perms.find(p => normalizeEmail(p.user_email) === normalizeEmail(u.email)),
      }));
    },
  });

  async function handleDelete(user) {
    if (!confirm('Excluir usuário?')) return;
    await base44.entities.User.delete(user.id);
    toast.success('Usuário excluído');
    queryClient.invalidateQueries(['users']);
  }

  function openModal(type, user) {
    setSelected(user);
    setModal(type);
  }

  const filtered = data.filter(u =>
    !search ||
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <Button>
          <UserPlus className="w-4 h-4 mr-1" />
          Criar usuário
        </Button>
      </div>

      <Input
        placeholder="Buscar usuário..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.map(user => (
        <UserCard
          key={user.id}
          user={user}
          onEdit={(u) => openModal('edit', u)}
          onPassword={(u) => openModal('password', u)}
          onPermissions={(u) => openModal('permissions', u)}
          onMessage={(u) => openModal('message', u)}
          onDelete={handleDelete}
        />
      ))}

      {modal === 'permissions' && selected && (
        <PermissionsDialog
          user={selected}
          open={true}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}