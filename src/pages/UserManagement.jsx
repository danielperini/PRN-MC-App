import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Search,
  UserPlus,
  Trash2,
  UserCheck,
  XCircle,
  Clock,
  Save,
  Pencil,
  KeyRound,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';

const ROLE_OPTIONS = ['PROFISSIONAL', 'COORDENADOR', 'ADMIN', 'OBSERVADOR', 'PATROCINADOR'];
const AREA_OPTIONS = ['MHAB', 'MUMO', 'MIS', 'Geral', 'Observador'];
const EQUIPE_OPTIONS = [
  'PV',
  'Produção Viaduto das Artes',
  'Produção',
  'Coordenação',
  'Comunicação',
  'Educativo',
  'Administrativo',
  'Financeiro',
  'Observador'
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function rolePayload(role) {
  return {
    base_role: role,
    status: 'ATIVO',
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
            {[item.funcao, item.equipe, item.area || item.museu].filter(Boolean).join(' · ')}
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

function UserCard({ user, onEdit, onPassword, onPermissions, onMessage, onDelete }) {
  const role = user.permission?.base_role || user.role || user.role_aprovada || 'PROFISSIONAL';

  return (
    <div className="border rounded-xl p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-3 bg-white">
      <div>
        <p className="font-medium">{user.full_name || user.nome || '-'}</p>
        <p className="text-xs text-gray-500">{user.email}</p>
        <p className="text-xs text-gray-500 mt-1">
          {[user.area || user.museu, user.equipe, user.funcao].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline">{role}</Badge>

        <Button size="sm" variant="outline" onClick={() => onEdit(user)}>
          <Pencil className="w-4 h-4 mr-1" />
          Editar
        </Button>

        <Button size="sm" variant="outline" onClick={() => onPassword(user)}>
          <KeyRound className="w-4 h-4 mr-1" />
          Senha
        </Button>

        <Button size="sm" variant="outline" onClick={() => onPermissions(user)}>
          <ShieldCheck className="w-4 h-4 mr-1" />
          Permissões
        </Button>

        <Button size="sm" variant="outline" onClick={() => onMessage(user)}>
          <MessageSquare className="w-4 h-4 mr-1" />
          Mensagem
        </Button>

        <Button size="sm" variant="outline" onClick={() => onDelete(user)} className="text-red-600">
          <Trash2 className="w-4 h-4 mr-1" />
          Excluir
        </Button>
      </div>
    </div>
  );
}

function CreateUserDialog({ open, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    login: '',
    senha: '',
    role: 'PROFISSIONAL',
    funcao: '',
    equipe: '',
    area: 'Geral',
  });

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    const email = normalizeEmail(form.email || form.login);
    const login = normalizeEmail(form.login || form.email);

    if (!form.full_name || !email || !login) {
      toast.error('Informe nome, e-mail e login.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        full_name: form.full_name,
        nome: form.full_name,
        email,
        login,
        senha: form.senha,
        senha_inicial: form.senha,
        role: form.role,
        funcao: form.funcao,
        equipe: form.equipe,
        area: form.area,
        museu: form.area,
        permissions: rolePayload(form.role),
      };

      try {
        await base44.functions.invoke('createUserByCoordinator', payload);
      } catch (functionError) {
        const existingRegistration = await base44.entities.UserRegistration
          .filter({ email })
          .catch(() => []);

        if (existingRegistration?.[0]?.id) {
          await base44.entities.UserRegistration.update(existingRegistration[0].id, {
            ...payload,
            status: 'APROVADO',
            aprovado_em: new Date().toISOString(),
            role_aprovada: form.role,
          });
        } else {
          await base44.entities.UserRegistration.create({
            ...payload,
            status: 'APROVADO',
            aprovado_em: new Date().toISOString(),
            role_aprovada: form.role,
          });
        }

        const existing = await base44.entities.UserPermission
          .filter({ user_email: email })
          .catch(() => []);

        const permissionPayload = {
          ...rolePayload(form.role),
          user_email: email,
          user_name: form.full_name,
          funcao: form.funcao,
          equipe: form.equipe,
          area: form.area,
          museu: form.area,
        };

        if (existing?.[0]?.id) {
          await base44.entities.UserPermission.update(existing[0].id, permissionPayload);
        } else {
          await base44.entities.UserPermission.create(permissionPayload);
        }
      }

      toast.success('Usuário registrado com sucesso.');
      onCreated?.();
      onClose?.();
    } catch (e) {
      toast.error('Erro ao criar usuário: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar usuário</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />
          </div>

          <div>
            <Label>E-mail</Label>
            <Input value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>

          <div>
            <Label>Login</Label>
            <Input value={form.login} onChange={(e) => update('login', e.target.value)} placeholder="normalmente igual ao e-mail" />
          </div>

          <div>
            <Label>Senha inicial</Label>
            <Input type="password" value={form.senha} onChange={(e) => update('senha', e.target.value)} />
          </div>

          <div>
            <Label>Perfil</Label>
            <Select value={form.role} onValueChange={(v) => update('role', v)}>
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

          <div>
            <Label>Área</Label>
            <Select value={form.area} onValueChange={(v) => update('area', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREA_OPTIONS.map((area) => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipe</Label>
            <Select value={form.equipe} onValueChange={(v) => update('equipe', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar equipe" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPE_OPTIONS.map((equipe) => (
                  <SelectItem key={equipe} value={equipe}>{equipe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Função</Label>
            <Input value={form.funcao} onChange={(e) => update('funcao', e.target.value)} placeholder="Ex: Produtor Cultural, Comunicador" />
          </div>

          <Button onClick={handleCreate} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Criando...' : 'Criar usuário'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, open, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: user.full_name || user.nome || '',
    funcao: user.funcao || '',
    equipe: user.equipe || '',
    area: user.area || user.museu || 'Geral',
  });

  async function handleSave() {
    setSaving(true);

    try {
      if (user.is_registration_user && user.registration_id) {
        await base44.entities.UserRegistration.update(user.registration_id, {
          full_name: form.full_name,
          nome: form.full_name,
          funcao: form.funcao,
          equipe: form.equipe,
          area: form.area,
          museu: form.area,
        });
      } else {
        await base44.entities.User.update(user.id, {
          full_name: form.full_name,
          nome: form.full_name,
          funcao: form.funcao,
          equipe: form.equipe,
          area: form.area,
          museu: form.area,
        });
      }

      if (user.permission?.id) {
        await base44.entities.UserPermission.update(user.permission.id, {
          user_name: form.full_name,
          funcao: form.funcao,
          equipe: form.equipe,
          area: form.area,
          museu: form.area,
        });
      }

      toast.success('Usuário atualizado com sucesso.');
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error('Erro ao editar usuário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
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
            <Label>Área</Label>
            <Select value={form.area} onValueChange={(v) => setForm((f) => ({ ...f, area: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREA_OPTIONS.map((area) => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipe</Label>
            <Select value={form.equipe} onValueChange={(v) => setForm((f) => ({ ...f, equipe: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar equipe" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPE_OPTIONS.map((equipe) => (
                  <SelectItem key={equipe} value={equipe}>{equipe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Função</Label>
            <Input value={form.funcao} onChange={(e) => setForm((f) => ({ ...f, funcao: e.target.value }))} />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Senha</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
            Para alterar senha, envie convite/redefinição pelo Base44. Usuário: {user?.email}
          </p>

          <Button
            className="w-full"
            onClick={() => {
              toast.success('Oriente o usuário a usar redefinição de senha no login.');
              onClose?.();
            }}
          >
            Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ user, open, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(user.permission?.base_role || user.role || user.role_aprovada || 'PROFISSIONAL');

  async function handleSave() {
    setSaving(true);

    try {
      const payload = {
        ...rolePayload(role),
        user_email: normalizeEmail(user.email),
        user_name: user.full_name || user.nome || user.email,
        funcao: user.funcao || '',
        equipe: user.equipe || '',
        area: user.area || user.museu || '',
        museu: user.area || user.museu || '',
      };

      if (user.permission?.id) {
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Permissões</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Perfil</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar permissões'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessageDialog({ user, open, onClose }) {
  const [sending, setSending] = useState(false);
  const [mensagem, setMensagem] = useState('');

  async function handleSend() {
    if (!mensagem.trim()) {
      toast.error('Digite uma mensagem.');
      return;
    }

    setSending(true);

    try {
      try {
        await base44.entities.SystemMessage.create({
          user_email: normalizeEmail(user.email),
          user_name: user.full_name || user.nome || user.email,
          titulo: 'Mensagem da coordenação',
          mensagem,
          status: 'ENVIADA',
          lida: false,
        });
      } catch (e) {
        await base44.entities.Notification.create({
          user_email: normalizeEmail(user.email),
          title: 'Mensagem da coordenação',
          message: mensagem,
          status: 'ENVIADA',
          read: false,
        });
      }

      toast.success('Mensagem enviada com sucesso.');
      onClose?.();
    } catch (e) {
      toast.error('Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar mensagem</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-gray-500">{user?.email}</p>

          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            className="w-full border rounded-md p-2 text-sm min-h-[120px]"
            placeholder="Digite a mensagem..."
          />

          <Button onClick={handleSend} disabled={sending} className="w-full">
            {sending ? 'Enviando...' : 'Enviar mensagem'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [permissionsUser, setPermissionsUser] = useState(null);
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

      const usersWithPermission = (users || []).map((user) => ({
        ...user,
        permission: (permissions || []).find((p) => normalizeEmail(p.user_email) === normalizeEmail(user.email)) || null,
        is_registration_user: false,
      }));

      const approvedRegistrationsAsUsers = (registrations || [])
        .filter((r) => String(r.status || '').toUpperCase() === 'APROVADO')
        .filter((r) => {
          const email = normalizeEmail(r.email);
          return !(users || []).some((u) => normalizeEmail(u.email) === email);
        })
        .map((r) => ({
          id: `registration-${r.id}`,
          registration_id: r.id,
          full_name: r.full_name || r.nome || '',
          nome: r.nome || r.full_name || '',
          email: r.email,
          funcao: r.funcao || '',
          equipe: r.equipe || '',
          area: r.area || r.museu || '',
          museu: r.area || r.museu || '',
          role: r.role_aprovada || 'PROFISSIONAL',
          role_aprovada: r.role_aprovada || 'PROFISSIONAL',
          is_registration_user: true,
          permission: (permissions || []).find((p) => normalizeEmail(p.user_email) === normalizeEmail(r.email)) || null,
        }));

      return {
        users: [...usersWithPermission, ...approvedRegistrationsAsUsers],
        registrations: (registrations || []).filter((r) => {
          const status = String(r.status || '').toUpperCase();
          return !['APROVADO', 'RECUSADO', 'REJEITADO', 'CANCELADO'].includes(status);
        }),
      };
    },
  });

  async function handleApprove(reg, role) {
    try {
      const email = normalizeEmail(reg.email);

      try {
        await base44.functions.invoke('approveUserWithPermissions', {
          userRegistrationId: reg.id,
          role,
          permissions: rolePayload(role),
        });
      } catch (functionError) {
        const existing = await base44.entities.UserPermission
          .filter({ user_email: email })
          .catch(() => []);

        const payload = {
          ...rolePayload(role),
          user_email: email,
          user_name: reg.full_name || reg.nome || email,
          funcao: reg.funcao || '',
          equipe: reg.equipe || '',
          area: reg.area || reg.museu || '',
          museu: reg.area || reg.museu || '',
        };

        if (existing?.[0]?.id) {
          await base44.entities.UserPermission.update(existing[0].id, payload);
        } else {
          await base44.entities.UserPermission.create(payload);
        }

        await base44.entities.UserRegistration.update(reg.id, {
          status: 'APROVADO',
          aprovado_em: new Date().toISOString(),
          role_aprovada: role,
        });
      }

      toast.success('Usuário aprovado.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao aprovar.');
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
      if (user.permission?.id) {
        await base44.entities.UserPermission.delete(user.permission.id);
      }

      if (user.is_registration_user && user.registration_id) {
        await base44.entities.UserRegistration.update(user.registration_id, {
          status: 'CANCELADO',
          cancelado_em: new Date().toISOString(),
        });
      } else {
        await base44.entities.User.delete(user.id);
      }

      toast.success('Usuário excluído com sucesso.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao excluir usuário.');
    }
  }

  const filtered = data.users.filter((u) => {
    const text = `${u.full_name || ''} ${u.nome || ''} ${u.email || ''} ${u.funcao || ''} ${u.equipe || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const cadastroUrl = `${window.location.origin}/Cadastro`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center gap-2">
        <h1 className="text-xl font-semibold">Usuários</h1>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateUser(true)}>
            <UserPlus className="w-4 h-4 mr-1" />
            Criar usuário
          </Button>

          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="w-4 h-4 mr-1" />
            Convidar
          </Button>
        </div>
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
              onEdit={setEditingUser}
              onPassword={setPasswordUser}
              onPermissions={setPermissionsUser}
              onMessage={setMessageUser}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {showInvite && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
          cadastroUrl={cadastroUrl}
        />
      )}

      {showCreateUser && (
        <CreateUserDialog
          open={showCreateUser}
          onClose={() => setShowCreateUser(false)}
          onCreated={() => queryClient.invalidateQueries(['user-management'])}
        />
      )}

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          open={!!editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => queryClient.invalidateQueries(['user-management'])}
        />
      )}

      {passwordUser && (
        <PasswordDialog
          user={passwordUser}
          open={!!passwordUser}
          onClose={() => setPasswordUser(null)}
        />
      )}

      {permissionsUser && (
        <PermissionsDialog
          user={permissionsUser}
          open={!!permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaved={() => queryClient.invalidateQueries(['user-management'])}
        />
      )}

      {messageUser && (
        <MessageDialog
          user={messageUser}
          open={!!messageUser}
          onClose={() => setMessageUser(null)}
        />
      )}
    </div>
  );
}
