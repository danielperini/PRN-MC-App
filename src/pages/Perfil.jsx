import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useMutation } from '@tanstack/react-query';
import { User, Save, BadgeCheck, LogOut, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import PermissionsDisplay from '../components/dashboard/PermissionsDisplay';

const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Coordenador', 'Outro'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção', 'Outra'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];

function PerfilInner() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({ full_name: '', funcao: '', equipe: '', museu: '' });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });

  useEffect(() => {
    base44.auth.me().then(u => {
      if (!u) {
        setUser(null);
        return;
      }
      setUser(u);
      setFormData({
        full_name: u.full_name || '',
        funcao: u.funcao || '',
        equipe: u.equipe || '',
        museu: u.museu || '',
      });
    }).catch(() => setUser(null));
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => base44.auth.updateMe(formData),
    onSuccess: () => toast.success('Perfil atualizado com sucesso!'),
    onError: () => toast.error('Erro ao atualizar perfil.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (user) {
        await base44.entities.User.delete(user.id);
        await base44.auth.logout();
      }
    },
    onError: () => toast.error('Erro ao excluir conta.'),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
        throw new Error('Preencha todos os campos');
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('As senhas não coincidem');
      }
      if (passwordForm.newPassword.length < 8) {
        throw new Error('Senha deve ter no mínimo 8 caracteres');
      }
      
      const response = await base44.functions.invoke('changeUserPassword', {
        target_user_email: user.email,
        new_password: passwordForm.newPassword
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao alterar senha');
      }

      return response.data;
    },
    onSuccess: () => {
      toast.success('Senha alterada com sucesso! Email de confirmação enviado.');
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setShowPasswordDialog(false);
    },
    onError: (error) => toast.error(error.message || 'Erro ao alterar senha.'),
  });

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-semibold text-gray-600">
              {(user.full_name || user.email || '?')[0].toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-black">{user.full_name || 'Meu Perfil'}</h1>
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>
        </div>

        {/* Matrícula (somente leitura) */}
        {user.matricula && (
          <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
            <BadgeCheck className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Número de Matrícula</p>
              <p className="text-base font-mono font-semibold text-black mt-0.5">{user.matricula}</p>
            </div>
          </div>
        )}

        {/* Formulário */}
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Nome Completo</Label>
            <Input
              value={formData.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Função</Label>
            <Select value={formData.funcao} onValueChange={v => set('funcao', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
              <SelectContent>
                {FUNCOES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Equipe</Label>
            <Select value={formData.equipe} onValueChange={v => set('equipe', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
              <SelectContent>
                {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Museu</Label>
            <Select value={formData.museu} onValueChange={v => set('museu', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o museu" /></SelectTrigger>
              <SelectContent>
                {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Campos somente leitura */}
          <div className="space-y-1.5">
            <Label className="text-gray-500">Papel no sistema</Label>
            <Input value={user.role || '–'} disabled className="bg-gray-50 text-gray-500" />
          </div>

          {/* Permissões Customizadas */}
          {['COORDENADOR', 'ADMIN', 'admin'].includes(user.role) && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <PermissionsDisplay userEmail={user.email} />
            </div>
          )}

          <div className="pt-2">
            <Button
              className="w-full bg-black hover:bg-gray-800 text-white select-none"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
          </div>

          {/* Alterar Senha Section */}
          <div className="mt-8 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Segurança</h3>
          <Button
            variant="outline"
            className="w-full border-black text-black hover:bg-black hover:text-white select-none"
            onClick={() => setShowPasswordDialog(true)}
          >
            <Lock className="w-4 h-4 mr-2" />
            Alterar Senha
          </Button>
          </div>

          {/* Excluir Conta Section */}
          <div className="mt-6 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Zona de Risco</h3>
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm text-red-700 mb-4">
              Excluir sua conta é uma ação permanente. Todos os seus dados serão removidos e não poderão ser recuperados.
            </p>
            <Button
              variant="outline"
              className="w-full text-red-600 border-red-200 hover:bg-red-50 select-none"
              onClick={() => setShowDeleteDialog(true)}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Excluir Conta
            </Button>
          </div>
          </div>
          </div>

          {/* Change Password Dialog */}
          <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar Senha</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Nova Senha</Label>
              <Input
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Confirmar Senha</Label>
              <Input
                type="password"
                placeholder="Confirme a nova senha"
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <AlertDialogCancel className="select-none">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-black hover:bg-gray-800 text-white select-none"
            onClick={() => passwordMutation.mutate()}
            disabled={passwordMutation.isPending}
          >
            {passwordMutation.isPending ? 'Alterando...' : 'Alterar Senha'}
          </AlertDialogAction>
          </AlertDialogContent>
          </AlertDialog>

          {/* Delete Account Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta permanentemente?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-gray-600">
            Esta ação não pode ser desfeita. Sua conta e todos os dados associados serão removidos permanentemente.
          </p>
          <AlertDialogCancel className="select-none">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white select-none"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Excluindo...' : 'Excluir permanentemente'}
          </AlertDialogAction>
          </AlertDialogContent>
          </AlertDialog>
          </div>
          );
          }

export default function Perfil() {
  return <RequireAuth><PerfilInner /></RequireAuth>;
}