import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Search, UserPlus, Saimport React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Search,
  UserPlus,
  Save,
  Users,
  KeyRound,
  Pencil,
  Trash2,
  UserCheck,
  XCircle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';

const ROLE_LABELS = {
  ADMIN: 'admin',
  admin: 'admin',
  COORDENADOR: 'coordenador',
  PROFISSIONAL: 'profissional',
  PATROCINADOR: 'patrocinador',
  OBSERVADOR: 'observador',
  user: 'usuário',
};

const ROLE_COLORS = {
  ADMIN: 'bg-black text-white',
  admin: 'bg-black text-white',
  COORDENADOR: 'bg-blue-100 text-blue-800',
  PROFISSIONAL: 'bg-gray-100 text-gray-700',
  PATROCINADOR: 'bg-purple-100 text-purple-700',
  OBSERVADOR: 'bg-teal-100 text-teal-700',
  user: 'bg-gray-100 text-gray-700',
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

const DEFAULT_PROFISSIONAL_PERMISSIONS = {
  base_role: 'PROFISSIONAL',
  can_review_reports: false,
  can_manage_users: false,
  can_manage_files: false,
  can_view_audit_log: false,
  can_manage_platform: false,
  gestao_compras: false,
  pode_aprovar_solicitacoes: false,
  can_curate_news: false,
  must_submit_monthly_reports: true,
};

function getDefaultsByRole(role) {
  if (role === 'ADMIN') {
    return {
      base_role: 'ADMIN',
      can_review_reports: true,
      can_manage_users: true,
      can_manage_files: true,
      can_view_audit_log: true,
      can_manage_platform: true,
      gestao_compras: true,
      pode_aprovar_solicitacoes: true,
      can_curate_news: true,
      must_submit_monthly_reports: false,
    };
  }

  if (role === 'COORDENADOR') {
    return {
      base_role: 'COORDENADOR',
      can_review_reports: true,
      can_manage_users: true,
      can_manage_files: true,
      can_view_audit_log: true,
      can_manage_platform: false,
      gestao_compras: true,
      pode_aprovar_solicitacoes: true,
      can_curate_news: true,
      must_submit_monthly_reports: false,
    };
  }

  if (role === 'OBSERVADOR') {
    return {
      base_role: 'OBSERVADOR',
      can_review_reports: false,
      can_manage_users: false,
      can_manage_files: false,
      can_view_audit_log: false,
      can_manage_platform: false,
      gestao_compras: false,
      pode_aprovar_solicitacoes: false,
      can_curate_news: false,
      must_submit_monthly_reports: false,
    };
  }

  if (role === 'PATROCINADOR') {
    return {
      base_role: 'PATROCINADOR',
      can_review_reports: false,
      can_manage_users: false,
      can_manage_files: false,
      can_view_audit_log: false,
      can_manage_platform: false,
      gestao_compras: false,
      pode_aprovar_solicitacoes: false,
      can_curate_news: false,
      must_submit_monthly_reports: false,
    };
  }

  return DEFAULT_PROFISSIONAL_PERMISSIONS;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function EditDialog({ user, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    role: user.role || 'user',
    funcao: user.funcao || '',
    equipe: user.equipe || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await base44.entities.User.update(user.id, form);
      toast.success('Usuário atualizado!');
      queryClient.invalidateQueries(['user-management']);
      onClose();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar — {user.full_name || user.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm mb-1 block">Nome completo</Label>
            <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </div>

          <div>
            <Label className="text-sm mb-1 block">Função</Label>
            <Select value={form.funcao} onValueChange={v => setForm({ ...form, funcao: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Coordenação Geral">Coordenação Geral</SelectItem>
                <SelectItem value="Coordenação de Comunicação">Coordenação de Comunicação</SelectItem>
                <SelectItem value="Educador">Educador</SelectItem>
                <SelectItem value="Produtor Cultural">Produtor Cultural</SelectItem>
                <SelectItem value="Comunicador">Comunicador</SelectItem>
                <SelectItem value="Administrador">Administrador</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm mb-1 block">Equipe</Label>
            <Select value={form.equipe} onValueChange={v => setForm({ ...form, equipe: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Coordenação">Coordenação</SelectItem>
                <SelectItem value="Comunicação">Comunicação</SelectItem>
                <SelectItem value="Educativo">Educativo</SelectItem>
                <SelectItem value="Produção">Produção</SelectItem>
                <SelectItem value="Administração">Administração</SelectItem>
                <SelectItem value="Outra">Outra</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm mb-1 block">Papel</Label>
            <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose }) {
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Senha — {user.full_name || user.email}</DialogTitle>
        </DialogHeader>

        <div className="py-3 space-y-3">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Alteração de senha automática requer plano Builder+. Oriente o usuário a usar o fluxo de redefinição de senha.
          </p>
          <Input placeholder="Nova senha (indisponível neste plano)" disabled />
        </div>

        <Button variant="outline" onClick={onClose} className="w-full">Fechar</Button>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ user, permissions, onClose }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(permissions?.base_role || 'PROFISSIONAL');
  const [perms, setPerms] = useState(permissions || {});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const data = {
        ...perms,
        base_role: role,
        user_email: normalizeEmail(user.email),
        user_name: user.full_name || user.full_name_solicitado || user.email,
      };

      if (perms?.id) {
        await base44.entities.UserPermission.update(perms.id, data);
      } else {
        await base44.entities.UserPermission.create(data);
      }

      toast.success('Permissões salvas!');
      queryClient.invalidateQueries(['user-management']);
      onClose();
    } catch (e) {
      toast.error('Erro: ' + e.message);
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
            <Label className="text-sm font-semibold mb-2 block">Papel principal</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="OBSERVADOR">Observador (somente leitura)</SelectItem>
                <SelectItem value="PATROCINADOR">Patrocinador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">Permissões específicas</Label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
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

function UserCard({ user, onEdit, onPassword, onPermissions, onRoleChange, onDelete }) {
  const role = user.permissions?.base_role || user.role || 'user';
  const initials = (user.full_name || user.email || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const funcao = user.funcao || null;
  const equipe = user.equipe || null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 border border-gray-200 rounded-2xl px-5 py-4 bg-white hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {initials}
        </div>

        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{user.full_name || '—'}</p>
          {funcao && <p className="text-xs text-gray-600 truncate">{funcao}</p>}
          <p className="text-xs text-gray-500 truncate">{user.email}</p>
          {user.numero_matricula && (
            <p className="text-xs text-gray-400 font-mono mt-0.5">{user.numero_matricula}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {equipe && (
          <Badge className="text-xs px-2.5 py-0.5 bg-slate-100 text-slate-600">{equipe}</Badge>
        )}

        <Select value={role} onValueChange={v => onRoleChange(user, v)}>
          <SelectTrigger className={`h-7 text-xs px-2.5 border-0 font-medium ${ROLE_COLORS[role] || ROLE_COLORS.user}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
            <SelectItem value="COORDENADOR">Coordenador</SelectItem>
            <SelectItem value="ADMIN">Administrador</SelectItem>
            <SelectItem value="OBSERVADOR">Observador</SelectItem>
            <SelectItem value="PATROCINADOR">Patrocinador</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => onEdit(user)}>
          <Pencil className="w-3 h-3" />
          Editar
        </Button>

        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => onPassword(user)}>
          <KeyRound className="w-3 h-3" />
          Senha
        </Button>

        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => onPermissions(user)}>
          Permissões
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-8 border-red-200 text-red-600 hover:bg-red-50"
          onClick={() => onDelete(user)}
        >
          <Trash2 className="w-3 h-3" />
          Excluir
        </Button>
      </div>
    </div>
  );
}

function RegistrationCard({ registration, onApprove, onReject }) {
  const [role, setRole] = useState('PROFISSIONAL');
  const [perms, setPerms] = useState(getDefaultsByRole('PROFISSIONAL'));
  const [busy, setBusy] = useState(false);

  function changeRole(nextRole) {
    setRole(nextRole);
    setPerms(getDefaultsByRole(nextRole));
  }

  async function approve() {
    setBusy(true);
    try {
      await onApprove(registration, role, perms);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await onReject(registration);
    } finally {
      setBusy(false);
    }
  }

  const initials = (registration.full_name || registration.email || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-2xl px-5 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 truncate">{registration.full_name || '—'}</p>
              <Badge className="bg-amber-100 text-amber-800 border border-amber-200">
                <Clock className="w-3 h-3 mr-1" />
                Pendente
              </Badge>
            </div>

            <p className="text-xs text-gray-600 truncate">{registration.email}</p>
            <p className="text-xs text-gray-500 truncate">
              {[registration.museu, registration.funcao, registration.equipe].filter(Boolean).join(' · ') || 'Sem detalhes'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={role} onValueChange={changeRole}>
            <SelectTrigger className="h-9 text-xs min-w-[160px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
              <SelectItem value="COORDENADOR">Coordenador</SelectItem>
              <SelectItem value="ADMIN">Administrador</SelectItem>
              <SelectItem value="OBSERVADOR">Observador</SelectItem>
              <SelectItem value="PATROCINADOR">Patrocinador</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" className="gap-1.5 bg-green-700 hover:bg-green-800" onClick={approve} disabled={busy}>
            <UserCheck className="w-4 h-4" />
            Aprovar
          </Button>

          <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={reject} disabled={busy}>
            <XCircle className="w-4 h-4" />
            Recusar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white rounded-xl border border-amber-100 p-3">
        {PERMISSION_GROUPS.map(p => (
          <div key={p.key} className="flex items-center gap-2">
            <Checkbox
              id={`${registration.id}-${p.key}`}
              checked={perms[p.key] === true}
              onCheckedChange={v => setPerms(prev => ({ ...prev, [p.key]: v }))}
            />
            <label htmlFor={`${registration.id}-${p.key}`} className="text-xs text-gray-700 cursor-pointer">
              {p.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [permissionsUser, setPermissionsUser] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const queryClient = useQueryClient();

  const { data = { users: [], registrations: [] }, isLoading } = useQuery({
    queryKey: ['user-management'],
    queryFn: async () => {
      const [users, permissions, registrations] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.UserPermission.list(),
        base44.entities.UserRegistration.list('-created_date', 200).catch(() => []),
      ]);

      const usersWithPerms = (users || []).map(u => ({
        ...u,
        permissions: (permissions || []).find(p => normalizeEmail(p.user_email) === normalizeEmail(u.email)) || null,
      }));

      const pendingRegistrations = (registrations || []).filter(r => {
        const status = String(r.status || '').toUpperCase();
        return !['APROVADO', 'RECUSADO', 'REJEITADO', 'CANCELADO'].includes(status);
      });

      return {
        users: usersWithPerms,
        registrations: pendingRegistrations,
      };
    },
  });

  async function handleDelete(user) {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${user.full_name || user.email}"? Esta ação não pode ser desfeita.`)) return;

    try {
      if (user.permissions?.id) {
        await base44.entities.UserPermission.delete(user.permissions.id);
      }

      await base44.entities.User.delete(user.id);
      toast.success('Usuário excluído com sucesso.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao excluir: ' + e.message);
    }
  }

  async function handleRoleChange(user, newRole) {
    try {
      const current = user.permissions;
      const defaults = getDefaultsByRole(newRole);
      const dataToSave = {
        ...defaults,
        ...(current || {}),
        base_role: newRole,
        user_email: normalizeEmail(user.email),
        user_name: user.full_name,
      };

      if (current?.id) {
        await base44.entities.UserPermission.update(current.id, dataToSave);
      } else {
        await base44.entities.UserPermission.create(dataToSave);
      }

      toast.success(`Papel alterado para ${newRole}`);
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  }

  async function handleApproveRegistration(registration, role, perms) {
    try {
      const email = normalizeEmail(registration.email);
      const existingPerms = await base44.entities.UserPermission.filter({ user_email: email }).catch(() => []);

      const payload = {
        ...perms,
        base_role: role,
        user_email: email,
        user_name: registration.full_name || email,
        museu: registration.museu || '',
        funcao: registration.funcao || '',
        equipe: registration.equipe || '',
        registration_id: registration.id,
        status: 'ATIVO',
      };

      if (existingPerms?.[0]?.id) {
        await base44.entities.UserPermission.update(existingPerms[0].id, payload);
      } else {
        await base44.entities.UserPermission.create(payload);
      }

      await base44.entities.UserRegistration.update(registration.id, {
        status: 'APROVADO',
        aprovado_em: new Date().toISOString(),
        role_aprovada: role,
      });

      toast.success('Solicitação aprovada. Permissões criadas para o e-mail informado.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao aprovar: ' + e.message);
    }
  }

  async function handleRejectRegistration(registration) {
    if (!window.confirm(`Recusar solicitação de ${registration.full_name || registration.email}?`)) return;

    try {
      await base44.entities.UserRegistration.update(registration.id, {
        status: 'RECUSADO',
        recusado_em: new Date().toISOString(),
      });

      toast.success('Solicitação recusada.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao recusar: ' + e.message);
    }
  }

  const filtered = data.users.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const cadastroUrl = `${window.location.origin}/Cadastro`;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-black" />
              <h1 className="text-2xl font-semibold text-black">Gestão de Usuários</h1>
            </div>
            <p className="text-sm text-gray-500">
              {data.users.length} usuário(s) cadastrado(s) · {data.registrations.length} solicitação(ões) pendente(s)
            </p>
          </div>

          <Button onClick={() => setShowInvite(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Convidar
          </Button>
        </div>

        {data.registrations.length > 0 && (
          <div className="mb-8 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Solicitações de acesso</h2>
              <p className="text-sm text-gray-500">Pedidos enviados pelo link público de cadastro.</p>
            </div>

            {data.registrations.map(registration => (
              <RegistrationCard
                key={registration.id}
                registration={registration}
                onApprove={handleApproveRegistration}
                onReject={handleRejectRegistration}
              />
            ))}
          </div>
        )}

        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Carregando usuários...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Nenhum usuário encontrado</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(u => (
              <UserCard
                key={u.id}
                user={u}
                onEdit={setEditingUser}
                onPassword={setPasswordUser}
                onPermissions={setPermissionsUser}
                onRoleChange={handleRoleChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {editingUser && <EditDialog user={editingUser} onClose={() => setEditingUser(null)} />}
      {passwordUser && <PasswordDialog user={passwordUser} onClose={() => setPasswordUser(null)} />}
      {permissionsUser && (
        <PermissionsDialog
          user={permissionsUser}
          permissions={permissionsUser.permissions}
          onClose={() => setPermissionsUser(null)}
        />
      )}
      {showInvite && (
        <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} cadastroUrl={cadastroUrl} />
      )}
    </div>
  );
}ve, Users, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';

const ROLE_LABELS = {
  ADMIN: 'admin', admin: 'admin',
  COORDENADOR: 'coordenador',
  PROFISSIONAL: 'profissional',
  PATROCINADOR: 'patrocinador',
  OBSERVADOR: 'observador',
  user: 'usuário',
};

const ROLE_COLORS = {
  ADMIN: 'bg-black text-white', admin: 'bg-black text-white',
  COORDENADOR: 'bg-blue-100 text-blue-800',
  PROFISSIONAL: 'bg-gray-100 text-gray-700',
  PATROCINADOR: 'bg-purple-100 text-purple-700',
  OBSERVADOR: 'bg-teal-100 text-teal-700',
  user: 'bg-gray-100 text-gray-700',
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

function EditDialog({ user, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    role: user.role || 'user',
    funcao: user.funcao || '',
    equipe: user.equipe || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await base44.entities.User.update(user.id, form);
      toast.success('Usuário atualizado!');
      queryClient.invalidateQueries(['user-management']);
      onClose();
    } catch (e) { toast.error('Erro: ' + e.message); }
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Editar — {user.full_name || user.email}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm mb-1 block">Nome completo</Label>
            <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label className="text-sm mb-1 block">Função</Label>
            <Select value={form.funcao} onValueChange={v => setForm({ ...form, funcao: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Coordenação Geral">Coordenação Geral</SelectItem>
                <SelectItem value="Coordenação de Comunicação">Coordenação de Comunicação</SelectItem>
                <SelectItem value="Educador">Educador</SelectItem>
                <SelectItem value="Produtor Cultural">Produtor Cultural</SelectItem>
                <SelectItem value="Comunicador">Comunicador</SelectItem>
                <SelectItem value="Administrador">Administrador</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm mb-1 block">Equipe</Label>
            <Select value={form.equipe} onValueChange={v => setForm({ ...form, equipe: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Coordenação">Coordenação</SelectItem>
                <SelectItem value="Comunicação">Comunicação</SelectItem>
                <SelectItem value="Educativo">Educativo</SelectItem>
                <SelectItem value="Produção">Produção</SelectItem>
                <SelectItem value="Administração">Administração</SelectItem>
                <SelectItem value="Outra">Outra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm mb-1 block">Papel</Label>
            <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="flex-1">{saving ? 'Salvando...' : 'Salvar'}</Button>
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose }) {
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Senha — {user.full_name || user.email}</DialogTitle></DialogHeader>
        <div className="py-3 space-y-3">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Alteração de senha automática requer plano Builder+. Oriente o usuário a usar o fluxo de redefinição de senha.
          </p>
          <Input placeholder="Nova senha (indisponível neste plano)" disabled />
        </div>
        <Button variant="outline" onClick={onClose} className="w-full">Fechar</Button>
      </DialogContent>
    </Dialog>
  );
}

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
    } catch (e) { toast.error('Erro: ' + e.message); }
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Permissões — {user.full_name || user.email}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Papel principal</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="OBSERVADOR">Observador (somente leitura)</SelectItem>
                <SelectItem value="PATROCINADOR">Patrocinador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-semibold mb-2 block">Permissões específicas</Label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
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

function UserCard({ user, onEdit, onPassword, onPermissions, onRoleChange, onDelete }) {
  const role = user.permissions?.base_role || user.role || 'user';
  const initials = (user.full_name || user.email || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const funcao = user.funcao || null;
  const equipe = user.equipe || null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 border border-gray-200 rounded-2xl px-5 py-4 bg-white hover:bg-gray-50 transition-colors">
      {/* Avatar + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{user.full_name || '—'}</p>
          {funcao && <p className="text-xs text-gray-600 truncate">{funcao}</p>}
          <p className="text-xs text-gray-500 truncate">{user.email}</p>
          {user.numero_matricula && (
            <p className="text-xs text-gray-400 font-mono mt-0.5">{user.numero_matricula}</p>
          )}
        </div>
      </div>

      {/* Role select + equipe badges + actions */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {equipe && (
          <Badge className="text-xs px-2.5 py-0.5 bg-slate-100 text-slate-600">{equipe}</Badge>
        )}

        {/* Inline role selector */}
        <Select value={role} onValueChange={v => onRoleChange(user, v)}>
          <SelectTrigger className={`h-7 text-xs px-2.5 border-0 font-medium ${ROLE_COLORS[role] || ROLE_COLORS.user}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
            <SelectItem value="COORDENADOR">Coordenador</SelectItem>
            <SelectItem value="ADMIN">Administrador</SelectItem>
            <SelectItem value="OBSERVADOR">Observador</SelectItem>
            <SelectItem value="PATROCINADOR">Patrocinador</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => onEdit(user)}>
          <Pencil className="w-3 h-3" />
          Editar
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => onPassword(user)}>
          <KeyRound className="w-3 h-3" />
          Senha
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => onPermissions(user)}>
          Permissões
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-8 border-red-200 text-red-600 hover:bg-red-50"
          onClick={() => onDelete(user)}
        >
          <Trash2 className="w-3 h-3" />
          Excluir
        </Button>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [permissionsUser, setPermissionsUser] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const queryClient = useQueryClient();

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

  async function handleDelete(user) {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${user.full_name || user.email}"? Esta ação não pode ser desfeita.`)) return;
    try {
      if (user.permissions?.id) {
        await base44.entities.UserPermission.delete(user.permissions.id);
      }
      await base44.entities.User.delete(user.id);
      toast.success('Usuário excluído com sucesso.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) { toast.error('Erro ao excluir: ' + e.message); }
  }

  async function handleRoleChange(user, newRole) {
    try {
      const perms = user.permissions;
      const d = { base_role: newRole, user_email: user.email, user_name: user.full_name };
      if (perms?.id) {
        await base44.entities.UserPermission.update(perms.id, { ...perms, ...d });
      } else {
        await base44.entities.UserPermission.create(d);
      }
      toast.success(`Papel alterado para ${newRole}`);
      queryClient.invalidateQueries(['user-management']);
    } catch (e) { toast.error('Erro: ' + e.message); }
  }

  const filtered = data.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const cadastroUrl = `${window.location.origin}/Cadastro`;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-black" />
              <h1 className="text-2xl font-semibold text-black">Gestão de Usuários</h1>
            </div>
            <p className="text-sm text-gray-500">{data.length} usuário(s) cadastrado(s)</p>
          </div>
          <Button onClick={() => setShowInvite(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Convidar
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Carregando usuários...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Nenhum usuário encontrado</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(u => (
              <UserCard
                key={u.id}
                user={u}
                onEdit={setEditingUser}
                onPassword={setPasswordUser}
                onPermissions={setPermissionsUser}
                onRoleChange={handleRoleChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {editingUser && <EditDialog user={editingUser} onClose={() => setEditingUser(null)} />}
      {passwordUser && <PasswordDialog user={passwordUser} onClose={() => setPasswordUser(null)} />}
      {permissionsUser && (
        <PermissionsDialog
          user={permissionsUser}
          permissions={permissionsUser.permissions}
          onClose={() => setPermissionsUser(null)}
        />
      )}
      {showInvite && (
        <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} cadastroUrl={cadastroUrl} />
      )}
    </div>
  );
}
