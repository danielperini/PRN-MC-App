import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2, Bell, CheckCircle, XCircle, Clock, Copy, Check, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const CADASTRO_URL = `${window.location.origin}/app/${window.location.pathname.split('/')[2] || ''}/Cadastro`;

function UserManagementInner() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reviewingReg, setReviewingReg] = useState(null);
  const [regNote, setRegNote] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: pendingRegistrations = [] } = useQuery({
    queryKey: ['user-registrations-pending'],
    queryFn: () => base44.entities.UserRegistration.filter({ status: 'PENDENTE' }, '-created_date'),
    refetchInterval: 30_000,
  });

  const approveRegMutation = useMutation({
    mutationFn: async (reg) => {
      // Invite the user to the platform
      await base44.users.inviteUser(reg.email, 'user');
      // Try to update extra fields after invite
      const allUsers = await base44.entities.User.list();
      const newUser = allUsers.find(u => u.email === reg.email);
      if (newUser) {
        await base44.entities.User.update(newUser.id, {
          role: 'PROFISSIONAL',
          funcao: reg.funcao,
          museu: reg.museu,
          equipe: reg.equipe || '',
        });
      }
      await base44.entities.UserRegistration.update(reg.id, {
        status: 'APROVADO',
        reviewer_note: regNote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['user-registrations-pending']);
      toast.success('Usuário aprovado e convite enviado!');
      setReviewingReg(null);
      setRegNote('');
    },
    onError: () => toast.error('Erro ao aprovar solicitação.'),
  });

  const rejectRegMutation = useMutation({
    mutationFn: (reg) => base44.entities.UserRegistration.update(reg.id, {
      status: 'REJEITADO',
      reviewer_note: regNote,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-registrations-pending']);
      toast.success('Solicitação rejeitada.');
      setReviewingReg(null);
      setRegNote('');
    },
    onError: () => toast.error('Erro ao rejeitar solicitação.'),
  });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      const base44Role = ['COORDENADOR', 'ADMIN'].includes(data.role) ? 'admin' : 'user';
      await base44.users.inviteUser(data.email, base44Role);
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
            <p className="text-gray-500 mt-1">Gerencie os profissionais e seus perfis de acesso</p>
          </div>
          <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Convidar Usuário
          </Button>
        </div>

        <Tabs defaultValue={pendingRegistrations.length > 0 ? 'solicitacoes' : 'usuarios'}>
          <TabsList className="mb-6">
            <TabsTrigger value="usuarios">
              Usuários
            </TabsTrigger>
            <TabsTrigger value="solicitacoes" className="gap-2">
              <Bell className="w-3.5 h-3.5" />
              Solicitações de Acesso
              {pendingRegistrations.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {pendingRegistrations.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── ABA USUÁRIOS ── */}
          <TabsContent value="usuarios">
            {/* Table header */}
            {!isLoading && users.length > 0 && (
              <div className="grid grid-cols-12 gap-4 px-4 mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <span className="col-span-4">Nome / Email</span>
                <span className="col-span-3">Papel</span>
                <span className="col-span-3">Equipe</span>
                <span className="col-span-2 text-right">Ações</span>
              </div>
            )}
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
                    <div className="col-span-3">
                      <Badge className={`${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700'} font-normal`}>
                        {ROLE_LABELS[user.role] || user.role || '–'}
                      </Badge>
                    </div>
                    <div className="col-span-3">
                      <span className="text-sm text-gray-600">{user.equipe || '–'}</span>
                    </div>
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
          </TabsContent>

          {/* ── ABA SOLICITAÇÕES ── */}
          <TabsContent value="solicitacoes">
            {pendingRegistrations.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhuma solicitação pendente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRegistrations.map(reg => (
                  <div key={reg.id} className="p-5 border border-amber-100 bg-amber-50/40 rounded-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Clock className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-black">{reg.full_name}</p>
                          <p className="text-sm text-gray-500">{reg.email}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {reg.funcao} · {reg.museu}{reg.equipe ? ` · ${reg.equipe}` : ''}
                          </p>
                          {reg.mensagem && (
                            <p className="text-xs text-gray-500 mt-2 italic">"{reg.mensagem}"</p>
                          )}
                          <p className="text-xs text-gray-300 mt-1">
                            Solicitado em {new Date(reg.created_date).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => { setReviewingReg({ ...reg, action: 'rejeitar' }); setRegNote(''); }}
                        >
                          <XCircle className="w-4 h-4 mr-1" />Rejeitar
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => { setReviewingReg({ ...reg, action: 'aprovar' }); setRegNote(''); }}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />Aprovar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Review Registration Dialog */}
      <Dialog open={!!reviewingReg} onOpenChange={o => !o && setReviewingReg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewingReg?.action === 'aprovar' ? 'Aprovar solicitação' : 'Rejeitar solicitação'}
            </DialogTitle>
          </DialogHeader>
          {reviewingReg && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                <p><strong>{reviewingReg.full_name}</strong> — {reviewingReg.email}</p>
                <p className="text-gray-500">{reviewingReg.funcao} · {reviewingReg.museu}{reviewingReg.equipe ? ` · ${reviewingReg.equipe}` : ''}</p>
              </div>
              {reviewingReg.action === 'aprovar' && (
                <p className="text-sm text-gray-500">
                  O usuário receberá um convite por e-mail com acesso como <strong>Profissional</strong>. Você poderá ajustar o papel e equipe posteriormente.
                </p>
              )}
              <div>
                <Label>Observação {reviewingReg.action === 'rejeitar' ? '(motivo)' : '(opcional)'}</Label>
                <Textarea
                  placeholder={reviewingReg.action === 'aprovar' ? 'Mensagem de boas-vindas ou observação...' : 'Informe o motivo da rejeição...'}
                  value={regNote}
                  onChange={e => setRegNote(e.target.value)}
                  className="min-h-[80px] mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setReviewingReg(null)}>Cancelar</Button>
            {reviewingReg?.action === 'aprovar' ? (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => approveRegMutation.mutate(reviewingReg)}
                disabled={approveRegMutation.isPending}
              >
                {approveRegMutation.isPending ? 'Aprovando...' : 'Confirmar aprovação'}
              </Button>
            ) : (
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => rejectRegMutation.mutate(reviewingReg)}
                disabled={rejectRegMutation.isPending}
              >
                {rejectRegMutation.isPending ? 'Rejeitando...' : 'Confirmar rejeição'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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