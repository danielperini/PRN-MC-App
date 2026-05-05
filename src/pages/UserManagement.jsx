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
import {
  Search,
  UserPlus,
  Trash2,
  UserCheck,
  XCircle,
  Clock,
  Pencil,
  KeyRound,
  MessageSquare,
  ArrowUpCircle,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';

const ROLE_OPTIONS = ['PROFISSIONAL', 'COORDENADOR', 'ADMIN', 'OBSERVADOR', 'PATROCINADOR'];

const PERMISSION_OPTIONS = [
  { key: 'can_review_reports', label: 'Revisar relatórios' },
  { key: 'can_manage_users', label: 'Gerenciar usuários' },
  { key: 'can_manage_files', label: 'Gerenciar arquivos' },
  { key: 'can_view_audit_log', label: 'Ver auditoria' },
  { key: 'can_manage_platform', label: 'Gerenciar plataforma' },
  { key: 'gestao_compras', label: 'Gestão de compras' },
  { key: 'pode_aprovar_solicitacoes', label: 'Aprovar solicitações' },
  { key: 'must_submit_monthly_reports', label: 'Enviar relatório mensal' },
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function roleDefaults(role) {
  return {
    base_role: role,
    can_review_reports: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_users: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_files: role === 'COORDENADOR' || role === 'ADMIN',
    can_view_audit_log: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_platform: role === 'ADMIN',
    gestao_compras: role === 'COORDENADOR' || role === 'ADMIN',
    pode_aprovar_solicitacoes: role === 'COORDENADOR' || role === 'ADMIN',
    must_submit_monthly_reports: role === 'PROFISSIONAL',
  };
}

function nextRole(currentRole) {
  const role = String(currentRole || '').toUpperCase();

  if (role === 'PROFISSIONAL') return 'COORDENADOR';
  if (role === 'OBSERVADOR') return 'PROFISSIONAL';
  if (role === 'PATROCINADOR') return 'OBSERVADOR';
  if (role === 'COORDENADOR') return 'ADMIN';

  return 'PROFISSIONAL';
}

function RegistrationCard({ item, onApprove, onReject }) {
  const [role, setRole] = useState('PROFISSIONAL');
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await onApprove(item, role);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await onReject(item);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-xl p-4 bg-amber-50 border-amber-200 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold">{item.full_name || item.nome || 'Sem nome'}</p>
          <p className="text-xs text-gray-600">{item.email}</p>
          <p className="text-xs text-gray-500">
            {[item.funcao, item.equipe, item.museu].filter(Boolean).join(' · ')}
          </p>
        </div>

        <Badge className="bg-amber-100 text-amber-800">
          <Clock className="w-3 h-3 mr-1" />
          Pendente
        </Badge>
      </div>

      <div className="flex gap-2">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" onClick={handleApprove} disabled={loading}>
          <UserCheck className="w-4 h-4 mr-1" />
          Aprovar
        </Button>

        <Button size="sm" variant="outline" onClick={handleReject} disabled={loading}>
          <XCircle className="w-4 h-4 mr-1" />
          Recusar
        </Button>
      </div>
    </div>
  );
}

function UserCard({ user, onDelete, onEdit, onPassword, onMessage, onPromote }) {
  const role = user?.permission?.base_role || user?.role || 'user';

  return (
    <div className="border rounded-xl p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-3 bg-white">
      <div>
        <p className="font-medium">{user.full_name || user.nome || '-'}</p>
        <p className="text-xs text-gray-500">{user.email}</p>
        <p className="text-xs text-gray-400 mt-1">{role}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onEdit(user)}>
          <Pencil className="w-4 h-4 mr-1" />
          Editar
        </Button>

        <Button size="sm" variant="outline" onClick={() => onPassword(user)}>
          <KeyRound className="w-4 h-4 mr-1" />
          Senha
        </Button>

        <Button size="sm" variant="outline" onClick={() => onMessage(user)}>
          <MessageSquare className="w-4 h-4 mr-1" />
          Mensagem
        </Button>

        <Button size="sm" variant="outline" onClick={() => onPromote(user)}>
          <ArrowUpCircle className="w-4 h-4 mr-1" />
          Promover
        </Button>

        <Button size="sm" variant="outline" onClick={() => onDelete(user)} className="text-red-600">
          <Trash2 className="w-4 h-4 mr-1" />
          Excluir
        </Button>
      </div>
    </div>
  );
}

function EditUserDialog({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || user?.nome || '',
    funcao: user?.funcao || '',
    equipe: user?.equipe || '',
    museu: user?.museu || '',
    base_role: user?.permission?.base_role || 'PROFISSIONAL',
    ...roleDefaults(user?.permission?.base_role || 'PROFISSIONAL'),
    ...(user?.permission || {}),
  });

  function changeRole(role) {
    setForm((prev) => ({
      ...prev,
      ...roleDefaults(role),
      base_role: role,
    }));
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>

          <div>
            <Label>Função</Label>
            <Input value={form.funcao} onChange={(e) => setForm((f) => ({ ...f, funcao: e.target.value }))} />
          </div>

          <div>
            <Label>Equipe</Label>
            <Input value={form.equipe} onChange={(e) => setForm((f) => ({ ...f, equipe: e.target.value }))} />
          </div>

          <div>
            <Label>Museu</Label>
            <Input value={form.museu} onChange={(e) => setForm((f) => ({ ...f, museu: e.target.value }))} />
          </div>

          <div>
            <Label>Perfil</Label>
            <Select value={form.base_role} onValueChange={changeRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg p-3 space-y-2">
            {PERMISSION_OPTIONS.map((permission) => (
              <label key={permission.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form[permission.key] === true}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, [permission.key]: checked === true }))}
                />
                {permission.label}
              </label>
            ))}
          </div>

          <Button className="w-full" onClick={() => onSave(user, form)}>
            <Save className="w-4 h-4 mr-1" />
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
            Alteração direta de senha depende dos recursos nativos do Base44. Use o convite/redefinição de senha para este usuário.
          </p>

          <p className="text-xs text-gray-500">{user?.email}</p>

          <Button variant="outline" onClick={onClose} className="w-full">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessageDialog({ user, onClose, onSend }) {
  const [message, setMessage] = useState('');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar mensagem</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-gray-500">{user?.email}</p>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite a mensagem..."
            className="w-full min-h-[120px] border rounded-md p-2 text-sm"
          />

          <Button className="w-full" onClick={() => onSend(user, message)}>
            <MessageSquare className="w-4 h-4 mr-1" />
            Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [messageUser, setMessageUser] = useState(null);
  const queryClient = useQueryClient();

  const { data = { users: [], registrations: [] }, isLoading } = useQuery({
    queryKey: ['user-management'],
    queryFn: async () => {
      const [users, registrations, permissions] = await Promise.all([
        base44.entities.User.list().catch(() => []),
        base44.entities.UserRegistration.list('-created_date', 200).catch(() => []),
        base44.entities.UserPermission.list().catch(() => []),
      ]);

      const usersWithPermissions = (users || []).map((user) => ({
        ...user,
        permission: (permissions || []).find((p) => normalizeEmail(p.user_email) === normalizeEmail(user.email)) || null,
      }));

      return {
        users: usersWithPermissions,
        registrations: (registrations || []).filter((r) => {
          const status = String(r.status || '').toUpperCase();
          return !['APROVADO', 'RECUSADO', 'REJEITADO', 'CANCELADO'].includes(status);
        }),
      };
    },
  });

  async function savePermission(email, payload) {
    const normalized = normalizeEmail(email);

    const existing = await base44.entities.UserPermission
      .filter({ user_email: normalized })
      .catch(() => []);

    if (existing?.[0]?.id) {
      await base44.entities.UserPermission.update(existing[0].id, payload);
    } else {
      await base44.entities.UserPermission.create(payload);
    }
  }

  async function handleApprove(reg, role) {
    try {
      const email = normalizeEmail(reg.email);

      await savePermission(email, {
        ...roleDefaults(role),
        user_email: email,
        user_name: reg.full_name || reg.nome || email,
        status: 'ATIVO',
      });

      await base44.entities.UserRegistration.update(reg.id, {
        status: 'APROVADO',
        aprovado_em: new Date().toISOString(),
        role_aprovada: role,
      });

      toast.success('Solicitação aprovada.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao aprovar: ' + (e?.message || e));
    }
  }

  async function handleReject(reg) {
    try {
      await base44.entities.UserRegistration.update(reg.id, {
        status: 'RECUSADO',
        recusado_em: new Date().toISOString(),
      });

      toast.success('Solicitação recusada.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao recusar.');
    }
  }

  async function handleDelete(user) {
    if (!confirm('Excluir usuário?')) return;

    try {
      if (user?.permission?.id) {
        await base44.entities.UserPermission.delete(user.permission.id);
      }

      await base44.entities.User.delete(user.id);

      toast.success('Usuário removido.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao remover usuário.');
    }
  }

  async function handleSaveUser(user, form) {
    try {
      await base44.entities.User.update(user.id, {
        full_name: form.full_name,
        funcao: form.funcao,
        equipe: form.equipe,
        museu: form.museu,
      });

      await savePermission(user.email, {
        ...form,
        user_email: normalizeEmail(user.email),
        user_name: form.full_name || user.email,
        status: 'ATIVO',
      });

      toast.success('Usuário atualizado.');
      setEditingUser(null);
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao salvar usuário.');
    }
  }

  async function handlePromote(user) {
    try {
      const currentRole = user?.permission?.base_role || 'PROFISSIONAL';
      const promotedRole = nextRole(currentRole);

      await savePermission(user.email, {
        ...roleDefaults(promotedRole),
        user_email: normalizeEmail(user.email),
        user_name: user.full_name || user.nome || user.email,
        status: 'ATIVO',
      });

      toast.success(`Usuário promovido para ${promotedRole}.`);
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao promover usuário.');
    }
  }

  async function handleSendMessage(user, message) {
    if (!message.trim()) {
      toast.error('Digite uma mensagem.');
      return;
    }

    try {
      await base44.entities.SystemMessage.create({
        user_email: normalizeEmail(user.email),
        user_name: user.full_name || user.nome || user.email,
        titulo: 'Mensagem da coordenação',
        mensagem: message,
        status: 'ENVIADA',
        lida: false,
      }).catch(async () => {
        await base44.entities.Notification.create({
          user_email: normalizeEmail(user.email),
          title: 'Mensagem da coordenação',
          message,
          status: 'ENVIADA',
          read: false,
        });
      });

      toast.success('Mensagem enviada.');
      setMessageUser(null);
    } catch (e) {
      toast.error('Erro ao enviar mensagem.');
    }
  }

  const filtered = data.users.filter((u) => {
    const text = `${u.full_name || ''} ${u.nome || ''} ${u.email || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Usuários</h1>

        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4 mr-1" />
          Convidar
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar usuário..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {data.registrations.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Solicitações de acesso</h2>

          {data.registrations.map((r) => (
            <RegistrationCard
              key={r.id}
              item={r}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-sm text-gray-400">Carregando...</div>
        ) : (
          filtered.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              onDelete={handleDelete}
              onEdit={setEditingUser}
              onPassword={setPasswordUser}
              onMessage={setMessageUser}
              onPromote={handlePromote}
            />
          ))
        )}
      </div>

      {showInvite && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
        />
      )}

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSaveUser}
        />
      )}

      {passwordUser && (
        <PasswordDialog
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
        />
      )}

      {messageUser && (
        <MessageDialog
          user={messageUser}
          onClose={() => setMessageUser(null)}
          onSend={handleSendMessage}
        />
      )}
    </div>
  );
}
