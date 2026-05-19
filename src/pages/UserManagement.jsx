import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Search, UserPlus, Save, Users, KeyRound, Pencil, Trash2, Clock3, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';
import { normalizeEmail, revokeUserAccess } from '@/utils/auth/recoverExistingUserAccess';
import { useAuth } from '@/lib/AuthContext';
import {
  canViewUserLoginMonitoring,
  fetchUserLoginMonitoringStats,
  formatLoginDate,
  normalizeLoginEmail,
} from '@/lib/userLoginMonitoring';

const ROLE_LABELS = {
  ADMIN: 'admin', admin: 'admin',
  COORDENADOR: 'coordenador',
  PROFISSIONAL: 'profissional',
  PATROCINADOR: 'observador',
  OBSERVADOR: 'observador',
  user: 'usuário',
};

const ROLE_COLORS = {
  ADMIN: 'bg-black text-white', admin: 'bg-black text-white',
  COORDENADOR: 'bg-blue-100 text-blue-800',
  PROFISSIONAL: 'bg-gray-100 text-gray-700',
  PATROCINADOR: 'bg-teal-100 text-teal-700',
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

const SPONSOR_PERMISSION_DEFAULTS = {
  can_view_sponsor_dashboard: true,
  can_view_approved_reports: true,
  can_view_approved_programacao: true,
  can_view_public_gallery: true,
  can_view_budget_summary: true,
  can_view_project_kpis: true,
  can_review_reports: false,
  can_manage_users: false,
  can_manage_files: false,
  can_manage_platform: false,
  gestao_compras: false,
  pode_aprovar_solicitacoes: false,
  must_submit_monthly_reports: false,
};

function defaultsForRole(role) {
  if (role === 'PATROCINADOR' || role === 'OBSERVADOR') {
    return {
      ...SPONSOR_PERMISSION_DEFAULTS,
      funcao: 'Observador',
      equipe: 'Observador',
    };
  }
  return {};
}

function EditDialog({ user, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    role: user.role === 'PATROCINADOR' ? 'OBSERVADOR' : (user.role === 'user' ? 'PROFISSIONAL' : (user.role || 'PROFISSIONAL')),
    funcao: user.funcao || '',
    equipe: user.equipe || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await base44.entities.User.update(user.id, {
        ...form,
        ...(form.role === 'OBSERVADOR' || form.role === 'PATROCINADOR' ? { funcao: 'Observador', equipe: 'Observador' } : {}),
      });
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
            <Select
              value={form.role}
              onValueChange={v => setForm({
                ...form,
                role: v,
                ...(v === 'OBSERVADOR' || v === 'PATROCINADOR' ? { funcao: 'Observador', equipe: 'Observador' } : {}),
              })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="OBSERVADOR">Observador</SelectItem>
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
  const [role, setRole] = useState(permissions?.base_role === 'PATROCINADOR' ? 'OBSERVADOR' : (permissions?.base_role || 'PROFISSIONAL'));
  const [perms, setPerms] = useState(permissions || {});
  const [saving, setSaving] = useState(false);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setPerms((prev) => ({ ...prev, ...defaultsForRole(newRole) }));
  };

  async function save() {
    setSaving(true);
    try {
      const roleDefaults = defaultsForRole(role);
      const data = { ...perms, ...roleDefaults, base_role: role, user_email: user.email, user_name: user.full_name };
      if (perms?.id) {
        await base44.entities.UserPermission.update(perms.id, data);
      } else {
        await base44.entities.UserPermission.create(data);
      }
      await base44.entities.User.update(user.id, {
        role,
        ...(role === 'OBSERVADOR' || role === 'PATROCINADOR' ? { funcao: 'Observador', equipe: 'Observador' } : {}),
      });
      toast.success('Permissões salvas!');
      queryClient.invalidateQueries(['user-management']);
      queryClient.invalidateQueries(['user-management-pending-registrations']);
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
            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="OBSERVADOR">Observador (somente leitura)</SelectItem>
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

function UserCard({
  user,
  onEdit,
  onPassword,
  onPermissions,
  onRoleChange,
  onDelete,
  showLoginMonitoring,
  loginStats,
}) {
  const rawRole = user.permissions?.base_role || user.role || 'user';
  const role = rawRole === 'PATROCINADOR' ? 'OBSERVADOR' : rawRole;
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
          {showLoginMonitoring && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <LogIn className="w-3 h-3" />
                {Number(loginStats?.total_logins || 0).toLocaleString('pt-BR')} login(s)
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="w-3 h-3" />
                {formatLoginDate(loginStats?.ultimo_login_em)}
              </span>
            </div>
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

function PendingRegistrationCard({ registration, onApprove, onReject, busy }) {
  const role = registration.base_role || registration.role || 'PROFISSIONAL';
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 border border-amber-200 bg-amber-50 rounded-2xl px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-950 truncate">{registration.full_name || 'Novo usuário'}</p>
        <p className="text-xs text-amber-800 truncate">{registration.email}</p>
        <p className="text-xs text-amber-700 mt-1">{[registration.museu, role, registration.funcao].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" className="bg-green-700 hover:bg-green-800 text-white" onClick={() => onApprove(registration)} disabled={busy}>
          Aprovar
        </Button>
        <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => onReject(registration)} disabled={busy}>
          Negar
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
  const { user: currentUser } = useAuth();
  const showLoginMonitoring = canViewUserLoginMonitoring(currentUser);

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

  const { data: loginMonitoring = { statsByEmail: {}, unavailable: false }, isLoading: loginStatsLoading } = useQuery({
    queryKey: ['user-login-monitoring-stats'],
    queryFn: fetchUserLoginMonitoringStats,
    enabled: showLoginMonitoring,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: pendingRegistrations = [] } = useQuery({
    queryKey: ['user-management-pending-registrations'],
    queryFn: () => base44.entities.UserRegistration.filter({ status: 'PENDENTE' }),
  });

  const approveRegistration = useMutation({
    mutationFn: async (registration) => {
      const email = String(registration.email || '').toLowerCase();
      if (!email) throw new Error('Solicitação sem e-mail.');
      const requestedRoleRaw = registration.role || registration.base_role || 'PROFISSIONAL';
      const requestedRole = requestedRoleRaw === 'PATROCINADOR' ? 'OBSERVADOR' : requestedRoleRaw;
      const roleDefaults = defaultsForRole(requestedRole);
      const permissionData = {
        ...roleDefaults,
        user_email: email,
        user_name: registration.full_name || '',
        base_role: requestedRole,
        can_review_reports: false,
        can_manage_users: false,
        can_manage_files: false,
        can_manage_platform: false,
        gestao_compras: false,
        pode_aprovar_solicitacoes: false,
        must_submit_monthly_reports: requestedRole === 'OBSERVADOR' ? false : true,
      };

      const permissions = await base44.entities.UserPermission.filter({ user_email: email });
      if (permissions?.[0]?.id) {
        await base44.entities.UserPermission.update(permissions[0].id, { ...permissions[0], ...permissionData });
      } else {
        await base44.entities.UserPermission.create(permissionData);
      }

      const users = await base44.entities.User.filter({ email }).catch(() => []);
      if (users?.[0]?.id) {
        await base44.entities.User.update(users[0].id, {
          role: requestedRole,
          full_name: registration.full_name || users[0].full_name,
          museu: registration.museu || users[0].museu,
          funcao: roleDefaults.funcao || registration.funcao || users[0].funcao,
          equipe: roleDefaults.equipe || registration.equipe || users[0].equipe,
        });
      }

      await base44.entities.UserRegistration.update(registration.id, {
        status: 'APROVADO',
        aprovado_em: new Date().toISOString(),
        acesso_liberado: true,
        base_role: requestedRole,
      });
    },
    onSuccess: () => {
      toast.success('Usuário aprovado.');
      queryClient.invalidateQueries(['user-management']);
      queryClient.invalidateQueries(['user-management-pending-registrations']);
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
    },
    onError: (e) => toast.error('Erro ao aprovar: ' + (e?.message || 'erro desconhecido')),
  });

  const rejectRegistration = useMutation({
    mutationFn: async (registration) => {
      await revokeUserAccess(registration.email, {
        status: 'REJEITADO',
        origin: 'user-management-reject',
        reason: 'Solicitação negada pela coordenação',
        full_name: registration.full_name,
      });
    },
    onSuccess: () => {
      toast.success('Solicitação negada.');
      queryClient.invalidateQueries(['user-management-pending-registrations']);
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
    },
    onError: (e) => toast.error('Erro ao negar: ' + (e?.message || 'erro desconhecido')),
  });

  async function handleDelete(user) {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${user.full_name || user.email}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const email = normalizeEmail(user.email);
      await revokeUserAccess(email, {
        status: 'EXCLUIDO',
        origin: 'user-management-delete',
        reason: 'Usuário excluído pela coordenação. Novo acesso exige nova aprovação.',
        full_name: user.full_name,
      });
      if (user.id) await base44.entities.User.delete(user.id).catch(() => null);
      toast.success('Usuário excluído. Para voltar ao app, precisará solicitar nova aprovação.');
      queryClient.invalidateQueries(['user-management']);
      queryClient.invalidateQueries(['user-management-pending-registrations']);
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
    } catch (e) { toast.error('Erro ao excluir: ' + e.message); }
  }

  async function handleRoleChange(user, newRole) {
    try {
      const perms = user.permissions;
      const roleDefaults = defaultsForRole(newRole);
      const d = { ...roleDefaults, base_role: newRole, user_email: user.email, user_name: user.full_name };
      if (perms?.id) {
        await base44.entities.UserPermission.update(perms.id, { ...perms, ...d });
      } else {
        await base44.entities.UserPermission.create(d);
      }
      await base44.entities.User.update(user.id, {
        role: newRole,
        ...(newRole === 'OBSERVADOR' || newRole === 'PATROCINADOR' ? { funcao: 'Observador', equipe: 'Observador' } : {}),
      });
      toast.success(`Papel alterado para ${newRole}`);
      queryClient.invalidateQueries(['user-management']);
    } catch (e) { toast.error('Erro: ' + e.message); }
  }

  const usersWithLoginStats = useMemo(() => {
    if (!showLoginMonitoring) return data;
    const statsByEmail = loginMonitoring?.statsByEmail || {};
    return data.map((user) => {
      const email = normalizeLoginEmail(user.email || user.user_email);
      const auditStats = statsByEmail[email] || {};
      const userTotalLogins = Number(user.total_logins || user.login_count || 0);
      const auditTotalLogins = Number(auditStats.total_logins || 0);
      return {
        ...user,
        loginStats: {
          total_logins: Math.max(userTotalLogins, auditTotalLogins),
          ultimo_login_em:
            auditStats.ultimo_login_em ||
            user.ultimo_login_em ||
            user.last_login_at ||
            user.lastLogin ||
            null,
        },
      };
    });
  }, [data, loginMonitoring?.statsByEmail, showLoginMonitoring]);

  const loginMonitoringSummary = useMemo(() => {
    if (!showLoginMonitoring) {
      return {
        monitoredUsers: 0,
        totalLogins: 0,
        activeRecently: 0,
        withoutRecord: 0,
      };
    }

    const now = Date.now();
    const recentlyThreshold = now - 1000 * 60 * 60 * 24 * 30;
    return usersWithLoginStats.reduce((summary, user) => {
      const total = Number(user.loginStats?.total_logins || 0);
      const lastLogin = user.loginStats?.ultimo_login_em
        ? new Date(user.loginStats.ultimo_login_em).getTime()
        : 0;

      summary.monitoredUsers += 1;
      summary.totalLogins += total;
      if (total <= 0) summary.withoutRecord += 1;
      if (lastLogin && !Number.isNaN(lastLogin) && lastLogin >= recentlyThreshold) {
        summary.activeRecently += 1;
      }
      return summary;
    }, {
      monitoredUsers: 0,
      totalLogins: 0,
      activeRecently: 0,
      withoutRecord: 0,
    });
  }, [showLoginMonitoring, usersWithLoginStats]);

  const filtered = usersWithLoginStats.filter(u =>
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

        {showLoginMonitoring && (
          <div className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">Usuários monitorados</p>
                <p className="text-2xl font-semibold text-black mt-1">{loginMonitoringSummary.monitoredUsers}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">Total de logins registrados</p>
                <p className="text-2xl font-semibold text-black mt-1">
                  {loginMonitoringSummary.totalLogins.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">Ativos nos últimos 30 dias</p>
                <p className="text-2xl font-semibold text-black mt-1">{loginMonitoringSummary.activeRecently}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">Sem login registrado</p>
                <p className="text-2xl font-semibold text-black mt-1">{loginMonitoringSummary.withoutRecord}</p>
              </div>
            </div>
            {!loginStatsLoading && (loginMonitoring?.unavailable || loginMonitoringSummary.totalLogins === 0) && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Monitoramento de login ainda sem registros consolidados.
              </p>
            )}
          </div>
        )}

        {pendingRegistrations.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-amber-950">Novos usuários aguardando aprovação</h2>
                <p className="text-xs text-amber-700">Aprove ou negue antes do primeiro acesso ao sistema.</p>
              </div>
              <Badge className="bg-amber-100 text-amber-800">{pendingRegistrations.length} pendente(s)</Badge>
            </div>
            <div className="space-y-3">
              {pendingRegistrations.map((registration) => (
                <PendingRegistrationCard
                  key={registration.id}
                  registration={registration}
                  onApprove={(item) => approveRegistration.mutate(item)}
                  onReject={(item) => rejectRegistration.mutate(item)}
                  busy={approveRegistration.isPending || rejectRegistration.isPending}
                />
              ))}
            </div>
          </div>
        )}

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
                showLoginMonitoring={showLoginMonitoring}
                loginStats={u.loginStats}
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
