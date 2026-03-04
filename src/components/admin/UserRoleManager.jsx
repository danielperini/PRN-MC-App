import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { UserCheck, Trash2, Edit2 } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'PROFISSIONAL', label: 'Profissional', color: 'bg-gray-100 text-gray-700' },
  { value: 'COORDENADOR', label: 'Coordenador', color: 'bg-black text-white' },
  { value: 'ADMIN', label: 'Admin', color: 'bg-blue-100 text-blue-700' },
];

export default function UserRoleManager() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['user-role-manager'],
    queryFn: () => base44.entities.User.list(),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }) => base44.entities.User.update(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-role-manager']);
      queryClient.invalidateQueries(['plat-users']);
      toast.success('Perfil atualizado com sucesso');
      setEditingUser(null);
      setNewRole('');
    },
    onError: () => toast.error('Erro ao atualizar perfil'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => base44.entities.User.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-role-manager']);
      queryClient.invalidateQueries(['plat-users']);
      toast.success('Usuário removido');
      setDeleteConfirm(null);
    },
    onError: () => toast.error('Erro ao remover usuário'),
  });

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role) => {
    const roleConfig = ROLE_OPTIONS.find(r => r.value === role);
    return roleConfig ? { label: roleConfig.label, color: roleConfig.color } : { label: 'Sem perfil', color: 'bg-gray-100 text-gray-500' };
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-400">Carregando usuários...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <Label className="text-sm text-gray-600">Buscar usuário</Label>
        <Input
          placeholder="Por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mt-2"
        />
      </div>

      {/* User List */}
      <div className="border border-gray-100 rounded-xl divide-y">
        <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 font-semibold text-xs text-gray-600 uppercase tracking-wide">
          <div>Nome / Email</div>
          <div>Perfil Atual</div>
          <div>Data de Cadastro</div>
          <div className="text-right">Ações</div>
        </div>

        {filteredUsers.map((user) => {
          const roleBadge = getRoleBadge(user.role);
          return (
            <div key={user.id} className="grid grid-cols-4 gap-4 p-4 items-center hover:bg-gray-50">
              <div>
                <p className="font-medium text-sm text-black">{user.full_name}</p>
                <p className="text-xs text-gray-400">{user.email}</p>
              </div>

              <div>
                <Badge className={`${roleBadge.color} font-normal text-xs`}>
                  {roleBadge.label}
                </Badge>
              </div>

              <div className="text-xs text-gray-500">
                {user.created_date
                  ? new Date(user.created_date).toLocaleDateString('pt-BR')
                  : '—'}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => {
                    setEditingUser(user);
                    setNewRole(user.role || '');
                  }}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Mudar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-red-600 border-red-200 hover:text-red-700"
                  onClick={() => setDeleteConfirm(user)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            Nenhum usuário encontrado
          </div>
        )}
      </div>

      {/* Edit Role Dialog */}
      <AlertDialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Alterar Perfil
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <p className="font-medium text-sm text-black">{editingUser?.full_name}</p>
              <p className="text-xs text-gray-500">{editingUser?.email}</p>
            </div>

            <div>
              <Label className="text-sm text-gray-700 mb-2 block">Novo Perfil</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um perfil" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (newRole) {
                  updateRoleMutation.mutate({ userId: editingUser.id, role: newRole });
                } else {
                  toast.error('Selecione um perfil');
                }
              }}
              disabled={updateRoleMutation.isPending}
              className="bg-black hover:bg-gray-800"
            >
              {updateRoleMutation.isPending ? 'Salvando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja remover <strong>{deleteConfirm?.full_name}</strong>? Esta ação não pode ser desfeita.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserMutation.mutate(deleteConfirm.id)}
              disabled={deleteUserMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteUserMutation.isPending ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}