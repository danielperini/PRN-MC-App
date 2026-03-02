import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];

const ROLE_LABELS = {
  COORDENADOR: 'Coordenação Geral',
  PROFISSIONAL: 'Profissional',
  ADMIN: 'Administração',
};

const ROLE_COLORS = {
  COORDENADOR: 'bg-black text-white',
  PROFISSIONAL: 'bg-gray-100 text-gray-700',
  ADMIN: 'bg-blue-100 text-blue-700',
};

const EMPTY_FORM = { email: '', role: 'PROFISSIONAL', equipe: '' };

function UserManagementInner() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      await base44.users.inviteUser(data.email, data.role === 'COORDENADOR' ? 'admin' : 'user');
      // Try to update extra fields after invite
      const allUsers = await base44.entities.User.list();
      const newUser = allUsers.find(u => u.email === data.email);
      if (newUser) {
        await base44.entities.User.update(newUser.id, {
          role: data.role,
          equipe: data.equipe,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success('Convite enviado com sucesso');
      setShowDialog(false);
      setFormData(EMPTY_FORM);
    },
    onError: () => toast.error('Erro ao convidar usuário'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success('Usuário atualizado');
      setShowDialog(false);
      setEditingUser(null);
      setFormData(EMPTY_FORM);
    },
    onError: () => toast.error('Erro ao atualizar usuário'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success('Usuário removido');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover usuário'),
  });

  const openCreate = () => {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      role: user.role || 'PROFISSIONAL',
      equipe: user.equipe || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.email && !editingUser) {
      toast.error('Informe o email'); return;
    }
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: { role: formData.role, equipe: formData.equipe } });
    } else {
      inviteMutation.mutate(formData);
    }
  };

  const isPending = inviteMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">Usuários</h1>
            <p className="text-gray-500 mt-1">Gerencie os profissionais do sistema</p>
          </div>
          <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Convidar Usuário
          </Button>
        </div>

        {/* Table header */}
        {!isLoading && users.length > 0 && (
          <div className="grid grid-cols-12 gap-4 px-4 mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <span className="col-span-4">Nome / Email</span>
            <span className="col-span-3">Papel</span>
            <span className="col-span-3">Equipe</span>
            <span className="col-span-2 text-right">Ações</span>
          </div>
        )}

        {/* Users List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-20 text-gray-400">Carregando usuários...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum usuário cadastrado</p>
            </div>
          ) : (
            users.map(user => (
              <div
                key={user.id}
                className="grid grid-cols-12 gap-4 items-center p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
              >
                {/* Nome / email */}
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-gray-600">
                      {(user.full_name || user.email || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-black truncate">{user.full_name || '–'}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>

                {/* Papel */}
                <div className="col-span-3">
                  <Badge className={`${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700'} font-normal`}>
                    {ROLE_LABELS[user.role] || user.role || '–'}
                  </Badge>
                </div>

                {/* Equipe */}
                <div className="col-span-3">
                  <span className="text-sm text-gray-600">{user.equipe || '–'}</span>
                </div>

                {/* Ações */}
                <div className="col-span-2 flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                    <Pencil className="w-4 h-4 text-gray-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(user)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuário' : 'Convidar Novo Usuário'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {!editingUser && (
              <div>
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            )}

            {editingUser && (
              <div>
                <Label>Nome</Label>
                <Input value={editingUser.full_name || ''} disabled className="bg-gray-50" />
              </div>
            )}

            <div>
              <Label>Papel <span className="text-red-500">*</span></Label>
              <Select value={formData.role} onValueChange={v => setFormData({ ...formData, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                  <SelectItem value="COORDENADOR">Coordenação Geral</SelectItem>
                  <SelectItem value="ADMIN">Administração</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {formData.role === 'COORDENADOR' && 'Pode revisar, aprovar e arquivar relatórios.'}
                {formData.role === 'ADMIN' && 'Pode gerenciar usuários e visualizar todos os relatórios.'}
                {formData.role === 'PROFISSIONAL' && 'Cria e envia seus próprios relatórios mensais.'}
              </p>
            </div>

            <div>
              <Label>Equipe</Label>
              <Select value={formData.equipe} onValueChange={v => setFormData({ ...formData, equipe: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleSubmit} disabled={isPending}>
              {editingUser ? 'Salvar' : 'Convidar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-gray-500 px-1">
            Tem certeza que deseja remover <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function UserManagement() {
  return <RequireAuth requireRole="COORDENADOR"><UserManagementInner /></RequireAuth>;
}