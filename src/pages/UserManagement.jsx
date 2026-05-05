import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Search, UserPlus, Trash2, UserCheck, XCircle, Clock, Save } from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';

const ROLE_OPTIONS = ['PROFISSIONAL', 'COORDENADOR', 'ADMIN', 'OBSERVADOR', 'PATROCINADOR'];

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

function UserCard({ user, onDelete }) {
  return (
    <div className="border rounded-xl p-4 flex justify-between items-center bg-white">
      <div>
        <p className="font-medium">{user.full_name || user.nome || '-'}</p>
        <p className="text-xs text-gray-500">{user.email}</p>
      </div>

      <Button size="sm" variant="outline" onClick={() => onDelete(user)}>
        <Trash2 className="w-4 h-4" />
      </Button>
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
    museu: '',
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
      let createdUser = null;

      try {
        createdUser = await base44.entities.User.create({
          full_name: form.full_name,
          nome: form.full_name,
          email,
          login,
          password: form.senha,
          senha_inicial: form.senha,
          role: 'user',
          funcao: form.funcao,
          equipe: form.equipe,
          museu: form.museu,
          status: 'ATIVO',
        });
      } catch (e) {
        await base44.entities.UserRegistration.create({
          full_name: form.full_name,
          nome: form.full_name,
          email,
          login,
          senha_inicial: form.senha,
          funcao: form.funcao,
          equipe: form.equipe,
          museu: form.museu,
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
        museu: form.museu,
      };

      if (existing?.[0]?.id) {
        await base44.entities.UserPermission.update(existing[0].id, permissionPayload);
      } else {
        await base44.entities.UserPermission.create(permissionPayload);
      }

      toast.success(createdUser ? 'Usuário criado.' : 'Usuário registrado e permissões criadas.');
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
            <Label>Função</Label>
            <Input value={form.funcao} onChange={(e) => update('funcao', e.target.value)} />
          </div>

          <div>
            <Label>Equipe</Label>
            <Input value={form.equipe} onChange={(e) => update('equipe', e.target.value)} />
          </div>

          <div>
            <Label>Museu</Label>
            <Input value={form.museu} onChange={(e) => update('museu', e.target.value)} />
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

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const queryClient = useQueryClient();

  const { data = { users: [], registrations: [] }, isLoading } = useQuery({
    queryKey: ['user-management'],
    queryFn: async () => {
      const [users, registrations] = await Promise.all([
        base44.entities.User.list().catch(() => []),
        base44.entities.UserRegistration.list('-created_date', 200).catch(() => []),
      ]);

      return {
        users: users || [],
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

      const existing = await base44.entities.UserPermission
        .filter({ user_email: email })
        .catch(() => []);

      const payload = {
        ...rolePayload(role),
        user_email: email,
        user_name: reg.full_name || reg.nome || email,
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
      await base44.entities.User.delete(user.id);
      toast.success('Usuário removido.');
      queryClient.invalidateQueries(['user-management']);
    } catch (e) {
      toast.error('Erro ao remover usuário.');
    }
  }

  const filtered = data.users.filter((u) => {
    const text = `${u.full_name || ''} ${u.nome || ''} ${u.email || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

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
            <UserCard key={u.id} user={u} onDelete={handleDelete} />
          ))
        )}
      </div>

      {showInvite && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
        />
      )}

      {showCreateUser && (
        <CreateUserDialog
          open={showCreateUser}
          onClose={() => setShowCreateUser(false)}
          onCreated={() => queryClient.invalidateQueries(['user-management'])}
        />
      )}
    </div>
  );
}
