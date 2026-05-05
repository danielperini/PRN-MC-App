import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, UserPlus, Trash2, UserCheck, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import InviteDialog from '@/components/users/InviteDialog';

const ROLE_OPTIONS = ['PROFISSIONAL', 'COORDENADOR', 'ADMIN', 'OBSERVADOR', 'PATROCINADOR'];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
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
        user_email: email,
        user_name: reg.full_name || reg.nome || email,
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
    </div>
  );
}
