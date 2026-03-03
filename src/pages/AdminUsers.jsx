import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Search, Power, Shield, User } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_COLORS = {
  admin: 'bg-black text-white',
  ADMIN: 'bg-black text-white',
  COORDENADOR: 'bg-blue-100 text-blue-800',
  PROFISSIONAL: 'bg-gray-100 text-gray-800',
  user: 'bg-gray-100 text-gray-800'
};

const ROLE_ICONS = {
  admin: Shield,
  ADMIN: Shield,
  COORDENADOR: Shield,
  PROFISSIONAL: User,
  user: User
};

function AdminUsersInner() {
  const [search, setSearch] = useState('');
  const [toggleTarget, setToggleTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list(),
  });

  const toggleUserMutation = useMutation({
    mutationFn: async (user) => {
      const newActive = !user.ativo;
      await base44.auth.updateMe({
        ...user,
        ativo: newActive
      });
      return newActive;
    },
    onSuccess: (newActive, user) => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      toast.success(newActive ? 'Usuário ativado com sucesso!' : 'Usuário desativado com sucesso!');
      setToggleTarget(null);
    },
    onError: () => {
      toast.error('Erro ao atualizar usuário');
    }
  });

  const filteredUsers = users.filter(u =>
    (u.full_name?.toLowerCase() || u.email?.toLowerCase()).includes(search.toLowerCase())
  );

  const getRoleLabel = (role) => {
    const roleMap = {
      'admin': 'Admin',
      'ADMIN': 'Admin',
      'COORDENADOR': 'Coordenador',
      'PROFISSIONAL': 'Profissional',
      'user': 'Usuário'
    };
    return roleMap[role] || role;
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-6 h-6 text-black" />
            <h1 className="text-3xl font-semibold text-black">Gestão de Usuários</h1>
          </div>
          <p className="text-gray-500 text-sm">Visualize e gerencie todos os usuários cadastrados na plataforma</p>
        </div>

        {/* Search */}
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>

        {/* Users Table */}
        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-400">Carregando usuários...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-gray-400">Nenhum usuário encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Nome</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Papel</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-700">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const Icon = ROLE_ICONS[user.role] || User;
                    const isActive = user.ativo !== false;
                    return (
                      <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-black">{user.full_name || '—'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-600 text-xs">{user.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={`${ROLE_COLORS[user.role] || ROLE_COLORS.user} gap-1.5`}>
                            <Icon className="w-3 h-3" />
                            {getRoleLabel(user.role)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className={`gap-2 ${isActive ? 'text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50' : 'text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50'}`}
                            onClick={() => setToggleTarget(user)}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {isActive ? 'Desativar' : 'Ativar'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-6 flex gap-6 text-sm">
          <div>
            <p className="text-gray-500">Total de usuários</p>
            <p className="text-2xl font-semibold text-black">{filteredUsers.length}</p>
          </div>
          <div>
            <p className="text-gray-500">Ativos</p>
            <p className="text-2xl font-semibold text-green-600">{filteredUsers.filter(u => u.ativo !== false).length}</p>
          </div>
          <div>
            <p className="text-gray-500">Inativos</p>
            <p className="text-2xl font-semibold text-red-600">{filteredUsers.filter(u => u.ativo === false).length}</p>
          </div>
        </div>
      </div>

      {/* Toggle Confirmation Dialog */}
      {toggleTarget && (
        <AlertDialog open={!!toggleTarget} onOpenChange={() => setToggleTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {toggleTarget.ativo !== false ? 'Desativar' : 'Ativar'} usuário?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {toggleTarget.ativo !== false
                  ? `Tem certeza que deseja desativar ${toggleTarget.full_name || toggleTarget.email}? Ele não conseguirá acessar a plataforma.`
                  : `Tem certeza que deseja ativar ${toggleTarget.full_name || toggleTarget.email}? Ele voltará a ter acesso à plataforma.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleUserMutation.mutate(toggleTarget)}
              className={toggleTarget.ativo !== false ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {toggleTarget.ativo !== false ? 'Desativar' : 'Ativar'}
            </AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default function AdminUsers() {
  return <RequireAuth requireRole="ADMIN"><AdminUsersInner /></RequireAuth>;
}