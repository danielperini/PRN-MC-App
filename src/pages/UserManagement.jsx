import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2, Bell, CheckCircle, XCircle, Copy, Check, Mail, Key, AlertCircle, Shield, ChevronDown, ChevronUp, Save, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import InviteDialog from '../components/users/InviteDialog';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const DEFAULT_PERMISSIONS = [
  { key: 'can_view_all_reports', label: 'Visualizar todos os relatórios' },
  { key: 'can_review_reports', label: 'Revisar e aprovar relatórios' },
  { key: 'can_manage_users', label: 'Gerenciar usuários' },
  { key: 'can_manage_files', label: 'Gerenciar arquivos (completo)' },
  { key: 'can_manage_museus', label: 'Gerenciar museus' },
  { key: 'can_manage_equipes', label: 'Gerenciar equipes' },
  { key: 'can_view_audit_log', label: 'Visualizar auditoria' },
  { key: 'can_manage_platform', label: 'Gerenciar plataforma' },
  { key: 'gestao_compras', label: 'Gestão de Compras' },
];

const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];

const CARGO_OPTIONS = [
  { value: 'PROFISSIONAL', label: 'Profissional', description: 'Cria e envia seus próprios relatórios' },
  { value: 'COORD_PRODUCAO', label: 'Coordenação de Produção', description: 'Pode revisar relatórios da produção, ver dashboard, valores financeiros. Não pode editar/deletar de outros.' },
  { value: 'COORD_ADMINISTRATIVA', label: 'Coordenação Administrativa', description: 'Pode revisar relatórios administrativos, ver dashboard, valores financeiros. Não pode editar/deletar de outros.' },
  { value: 'COORD_COMUNICACAO', label: 'Coordenação de Comunicação', description: 'Pode revisar relatórios de comunicação, ver dashboard, valores financeiros. Não pode editar/deletar de outros.' },
  { value: 'CONSULTORIA_PROGRAMACAO', label: 'Consultoria Programação', description: 'Mesmas permissões que Coordenação de Comunicação.' },
  { value: 'COORDENADOR', label: 'Coordenação Geral', description: 'Todas as permissões. Pode gerenciar tudo.' },
  { value: 'ADMIN', label: 'Administração', description: 'Gerencia usuários e visualiza tudo.' },
];

const gerarMatricula = async () => {
  const ano = new Date().getFullYear();
  const allUsers = await base44.entities.User.list('-created_date', 9999);
  const seq = String(allUsers.length + 1).padStart(8, '0');
  return `MCA${ano}${seq}`;
};

const ROLE_LABELS = {
  COORDENADOR: 'Coordenação Geral',
  COORD_PRODUCAO: 'Coordenação de Produção',
  COORD_ADMINISTRATIVA: 'Coordenação Administrativa',
  COORD_COMUNICACAO: 'Coordenação de Comunicação',
  CONSULTORIA_PROGRAMACAO: 'Consultoria Programação',
  PROFISSIONAL: 'Profissional',
  ADMIN: 'Administração',
};

const ROLE_COLORS = {
  COORDENADOR: 'bg-black text-white border border-black',
  COORD_PRODUCAO: 'bg-white text-black border border-black',
  COORD_ADMINISTRATIVA: 'bg-white text-black border border-black',
  COORD_COMUNICACAO: 'bg-white text-black border border-black',
  CONSULTORIA_PROGRAMACAO: 'bg-white text-black border border-black',
  PROFISSIONAL: 'bg-white text-black border border-black',
  ADMIN: 'bg-black text-white border border-black',
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
   const [regRole, setRegRole] = useState('PROFISSIONAL');
   const [copied, setCopied] = useState(false);
   const [showInviteLink, setShowInviteLink] = useState(false);
   const [showInviteDialog, setShowInviteDialog] = useState(false);
   const [currentUser, setCurrentUser] = useState(null);
   const [showCreateDirect, setShowCreateDirect] = useState(false);
   const [directForm, setDirectForm] = useState({ email: '', password: '', full_name: '', role: 'PROFISSIONAL' });
   const [passwordConfirm, setPasswordConfirm] = useState('');
   const [editPasswordUser, setEditPasswordUser] = useState(null);
   const [newPassword, setNewPassword] = useState('');
   const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
   const [expandedUserId, setExpandedUserId] = useState(null);
   const [editingUserId, setEditingUserId] = useState(null);
   const [editingUserData, setEditingUserData] = useState({});
   const [editingPendingReg, setEditingPendingReg] = useState(null);
   const [editingPendingData, setEditingPendingData] = useState({});
   const [deleteRegTarget, setDeleteRegTarget] = useState(null);
   const [editingPerm, setEditingPerm] = useState(null);
   const [showPermDialog, setShowPermDialog] = useState(false);
   const [permFormData, setPermFormData] = useState(null);
   const [permSearchEmail, setPermSearchEmail] = useState('');
   const [showPermsSection, setShowPermsSection] = useState(false);

   React.useEffect(() => {
     const loadUser = async () => {
       const user = await base44.auth.me();
       setCurrentUser(user);
     };
     loadUser();
   }, []);

  const cadastroUrl = (() => {
    const parts = window.location.pathname.split('/');
    const appIdx = parts.indexOf('app');
    const appId = appIdx !== -1 ? parts[appIdx + 1] : '';
    return appId
      ? `${window.location.origin}/app/${appId}/Cadastro`
      : `${window.location.origin}/Cadastro`;
  })();

  const copyLink = () => {
    navigator.clipboard.writeText(cadastroUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappText = encodeURIComponent(
    `Olá! Você foi convidado(a) para acessar a plataforma de relatórios dos Museus Centro.\n\nPara solicitar seu acesso, preencha o formulário neste link:\n${cadastroUrl}\n\nApós o envio, sua solicitação será analisada e você receberá um e-mail com as instruções de acesso.`
  );

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: pendingRegistrations = [] } = useQuery({
    queryKey: ['user-registrations-pending'],
    queryFn: () => base44.entities.UserRegistration.filter({ status: 'PENDENTE' }, '-created_date'),
    refetchInterval: 30_000,
  });

  const { data: allRegistrations = [] } = useQuery({
    queryKey: ['user-registrations'],
    queryFn: () => base44.entities.UserRegistration.list('-created_date', 9999),
    refetchInterval: 30_000,
  });

  const { data: allReports = [] } = useQuery({
    queryKey: ['all-reports-status'],
    queryFn: () => base44.entities.Report.list('-created_date', 9999),
    refetchInterval: 60_000,
  });

  const { data: allExemptions = [] } = useQuery({
    queryKey: ['all-exemptions-status'],
    queryFn: () => base44.entities.ReportExemption.list('-created_date', 9999),
    refetchInterval: 60_000,
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => base44.entities.UserPermission.list('-created_date', 1000),
  });

  const { data: permissionTypes = [] } = useQuery({
    queryKey: ['permission-types'],
    queryFn: async () => {
      try { return await base44.entities.PermissionType.list('', 1000); } catch { return []; }
    },
  });

  const PERMISSIONS = permissionTypes.length > 0
    ? permissionTypes.filter(t => t.ativo).map(t => ({ key: t.key, label: t.label }))
    : DEFAULT_PERMISSIONS;

  const createPermMutation = useMutation({
    mutationFn: (data) => base44.entities.UserPermission.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-permissions']);
      toast.success('Permissões criadas');
      setShowPermDialog(false);
      setPermFormData(null);
    },
    onError: () => toast.error('Erro ao criar permissões'),
  });

  const updatePermMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UserPermission.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-permissions']);
      toast.success('Permissões atualizadas');
      setEditingPerm(null);
    },
    onError: () => toast.error('Erro ao atualizar permissões'),
  });

  const deletePermMutation = useMutation({
    mutationFn: (id) => base44.entities.UserPermission.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-permissions']);
      toast.success('Permissões removidas');
    },
    onError: () => toast.error('Erro ao remover permissões'),
  });

  const openPermEdit = (perm) => setEditingPerm({ ...perm });

  const openPermCreate = (user) => {
    const newForm = { user_email: user?.email || '', user_name: user?.full_name || '', base_role: user?.role || 'PROFISSIONAL' };
    PERMISSIONS.forEach(p => { newForm[p.key] = false; });
    setPermFormData(newForm);
    setShowPermDialog(true);
  };

  const togglePerm = (key) => {
    if (editingPerm) setEditingPerm(prev => ({ ...prev, [key]: !prev[key] }));
    else setPermFormData(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const savePerm = () => {
    if (editingPerm) {
      const data = {};
      PERMISSIONS.forEach(p => { data[p.key] = editingPerm[p.key]; });
      updatePermMutation.mutate({ id: editingPerm.id, data });
    } else {
      if (!permFormData.user_email) { toast.error('Selecione um usuário'); return; }
      createPermMutation.mutate(permFormData);
    }
  };

  const permMap = {};
  permissions.forEach(p => { permMap[p.user_email] = p; });



  const approveRegMutation = useMutation({
    mutationFn: async (reg) => {
      const matricula = await gerarMatricula();
      // Invite the user to the platform
      const base44Role = ['COORDENADOR', 'ADMIN'].includes(regRole) ? 'admin' : 'user';
      await base44.users.inviteUser(reg.email, base44Role);

      // Get cadastro URL and send email with direct access
      const appId = window.location.pathname.split('/')[2] || '';
      const cadastroUrl = appId 
        ? `${window.location.origin}/app/${appId}/Cadastro` 
        : `${window.location.origin}/Cadastro`;

      await base44.functions.invoke('sendInviteEmail', {
        email: reg.email,
        full_name: reg.full_name,
        role: regRole,
        cadastroUrl
      });

      // Try to update extra fields after invite
      const allUsers = await base44.entities.User.list();
      const newUser = allUsers.find(u => u.email === reg.email);
      if (newUser) {
        await base44.entities.User.update(newUser.id, {
          role: regRole,
          funcao: reg.funcao,
          museu: reg.museu,
          equipe: reg.equipe || '',
          matricula,
          newly_approved: true,
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
      const matricula = await gerarMatricula();
      const base44Role = ['COORDENADOR', 'ADMIN'].includes(data.role) ? 'admin' : 'user';
      await base44.users.inviteUser(data.email, base44Role);

      // Send email with configured sender and direct cadastro link
      const appId = window.location.pathname.split('/')[2] || '';
      const cadastroUrl = appId 
        ? `${window.location.origin}/app/${appId}/Cadastro` 
        : `${window.location.origin}/Cadastro`;

      await base44.functions.invoke('sendInviteEmail', {
        email: data.email,
        full_name: data.full_name || data.email,
        role: base44Role,
        cadastroUrl
      });

      // Try to update extra fields after invite
      const allUsers = await base44.entities.User.list();
      const newUser = allUsers.find(u => u.email === data.email);
      if (newUser) {
        await base44.entities.User.update(newUser.id, {
          role: data.role,
          equipe: data.equipe,
          matricula,
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
    mutationFn: async ({ id, data }) => {
      await base44.entities.User.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success('Usuário atualizado');
      setEditingUserId(null);
      setEditingUserData({});
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

  const handleSubmit = () => {
    if (!formData.email && !editingUser) {
      toast.error('Informe o email'); return;
    }
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: { role: formData.role, equipe: formData.equipe, email: editingUser.email } });
    } else {
      inviteMutation.mutate(formData);
    }
  };

  const createDirectMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('createUserWithPassword', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['user-permissions']);
      toast.success('Usuário cadastrado com sucesso!');
      setShowCreateDirect(false);
      setDirectForm({ email: '', password: '', full_name: '', role: 'PROFISSIONAL' });
      setPasswordConfirm('');
    },
    onError: (err) => toast.error(err.message || 'Erro ao cadastrar usuário'),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('changeUserPassword', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Senha alterada com sucesso!');
      setEditPasswordUser(null);
      setNewPassword('');
      setNewPasswordConfirm('');
    },
    onError: (err) => toast.error(err.message || 'Erro ao alterar senha'),
  });

  const updateRegMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UserRegistration.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-registrations']);
      toast.success('Registro atualizado');
      setEditingPendingReg(null);
      setEditingPendingData({});
    },
    onError: () => toast.error('Erro ao atualizar registro'),
  });

  const deleteRegMutation = useMutation({
    mutationFn: (id) => base44.entities.UserRegistration.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-registrations']);
      queryClient.invalidateQueries(['user-registrations-pending']);
      toast.success('Registro removido');
      setDeleteRegTarget(null);
    },
    onError: () => toast.error('Erro ao remover registro'),
  });

  const createDirectFromPendingMutation = useMutation({
    mutationFn: async (reg) => {
      const password = Math.random().toString(36).slice(-10) + 'A1!';
      const response = await base44.functions.invoke('createUserWithPassword', {
        email: reg.email,
        full_name: reg.full_name,
        role: reg.role || 'PROFISSIONAL',
        password,
      });
      await base44.entities.UserRegistration.update(reg.id, { status: 'APROVADO', reviewer_note: 'Cadastrado diretamente pelo administrador' });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['user-registrations']);
      queryClient.invalidateQueries(['user-registrations-pending']);
      toast.success('Usuário cadastrado diretamente!');
    },
    onError: (err) => toast.error(err.message || 'Erro ao cadastrar usuário'),
  });

  const isPending = inviteMutation.isPending || updateMutation.isPending || createDirectMutation.isPending;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">Usuários</h1>
            <p className="text-gray-500 mt-1">Gerencie os profissionais e seus perfis de acesso</p>
          </div>
          <div className="flex gap-2">
            <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={() => setShowCreateDirect(true)}>
              <Plus className="w-4 h-4" />
              Cadastrar com Senha
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setShowInviteDialog(true)}>
              <Plus className="w-4 h-4" />
              Convidar Usuário
            </Button>
          </div>
        </div>

        <div className="space-y-10">

          {/* ── SOLICITAÇÕES DE ACESSO ── */}
          {pendingRegistrations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-black" />
                <h2 className="text-sm font-semibold text-black">Solicitações de Acesso</h2>
                <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">
                  {pendingRegistrations.length}
                </span>
              </div>
              <div className="space-y-3">
                {pendingRegistrations.map((reg, idx) => (
                  <div key={reg.id} className="p-5 border-2 border-black bg-white rounded-xl transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold text-black">
                          {(reg.full_name || '')[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-black">{reg.full_name}</p>
                            <span className="text-xs font-mono bg-gray-100 text-black px-2 py-0.5 rounded">#{idx + 1}</span>
                          </div>
                          <p className="text-sm text-gray-500">{reg.email}</p>
                          <div className="flex gap-3 text-xs text-gray-400 mt-1">
                            <span>{reg.funcao}</span>
                            <span>•</span>
                            <span>{reg.museu}</span>
                            {reg.equipe && (<><span>•</span><span>{reg.equipe}</span></>)}
                          </div>
                          {reg.mensagem && (
                            <p className="text-xs text-gray-500 mt-2 p-2 bg-white/50 rounded border border-amber-100 italic">
                              "{reg.mensagem}"
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            📅 Solicitado em {new Date(reg.created_date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                          onClick={() => { setReviewingReg({ ...reg, action: 'rejeitar' }); setRegNote(''); }}>
                          <XCircle className="w-4 h-4 mr-1" />Rejeitar
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs"
                          onClick={() => { setReviewingReg({ ...reg, action: 'aprovar' }); setRegNote(''); setRegRole('PROFISSIONAL'); }}>
                          <CheckCircle className="w-4 h-4 mr-1" />Aprovar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PENDENTES DE CONVITE ── */}
          {(() => {
            const approvedButNotInvited = allRegistrations.filter(reg => {
              const isUser = users.some(u => u.email === reg.email);
              return reg.status === 'APROVADO' && !isUser;
            });
            if (approvedButNotInvited.length === 0) return null;
            return (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="w-4 h-4 text-black" />
                  <h2 className="text-sm font-semibold text-black">Pendentes de Convite</h2>
                  <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">
                    {approvedButNotInvited.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {approvedButNotInvited.map((reg) => (
                    <div key={reg.id} className="p-5 border-2 border-black bg-white rounded-xl transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold text-black">
                            {(reg.full_name || '')[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-black">{reg.full_name}</p>
                            <p className="text-sm text-gray-500">{reg.email}</p>
                            <div className="flex gap-3 text-xs text-gray-400 mt-1">
                              <span>{reg.funcao}</span><span>•</span><span>{reg.museu}</span>
                              {reg.equipe && (<><span>•</span><span>{reg.equipe}</span></>)}
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                              ✅ Aprovado em {new Date(reg.updated_date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 flex-wrap">
                          <Button size="sm" variant="outline" className="text-xs gap-1"
                            onClick={() => { setEditingPendingReg(reg); setEditingPendingData({ full_name: reg.full_name, email: reg.email, funcao: reg.funcao, museu: reg.museu, equipe: reg.equipe || '' }); }}>
                            <Pencil className="w-3 h-3" />Editar
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => createDirectFromPendingMutation.mutate(reg)}
                            disabled={createDirectFromPendingMutation.isPending}>
                            <Plus className="w-3 h-3" />Cadastrar Direto
                          </Button>
                          <Button size="sm" className="bg-black hover:bg-gray-800 text-white text-xs gap-1"
                            onClick={() => { setReviewingReg({ ...reg, action: 'convidar' }); setRegRole('PROFISSIONAL'); setRegNote(''); }}>
                            <Mail className="w-3 h-3" />Reenviar Convite
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setDeleteRegTarget(reg)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── PERMISSÕES ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowPermsSection(v => !v)}>
                <Shield className="w-4 h-4 text-black" />
                <h2 className="text-sm font-semibold text-black">Permissões de Usuários</h2>
                {showPermsSection ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
              {showPermsSection && (
                <Button size="sm" className="bg-black hover:bg-gray-800 text-white gap-1 text-xs" onClick={() => openPermCreate(null)}>
                  <Plus className="w-3 h-3" />Adicionar
                </Button>
              )}
            </div>

            {showPermsSection && (
              <div className="space-y-3">
                <Input
                  placeholder="Buscar por email..."
                  value={permSearchEmail}
                  onChange={e => setPermSearchEmail(e.target.value)}
                  className="max-w-sm"
                />
                {users
                  .filter(u => !permSearchEmail || u.email.toLowerCase().includes(permSearchEmail.toLowerCase()) || (u.full_name || '').toLowerCase().includes(permSearchEmail.toLowerCase()))
                  .map(user => {
                    const perm = permMap[user.email];
                    return (
                      <div key={user.email} className={`p-4 border rounded-xl transition-all ${perm ? 'border-gray-200' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-black text-sm">{user.full_name || user.email}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                            {perm ? (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {PERMISSIONS.filter(p => perm[p.key]).map(p => (
                                  <span key={p.key} className="text-[10px] bg-white text-black border border-black px-2 py-0.5 rounded-full">{p.label}</span>
                                ))}
                                {PERMISSIONS.filter(p => perm[p.key]).length === 0 && (
                                  <span className="text-xs text-gray-400 italic">Nenhuma permissão extra</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic mt-1 block">Sem permissões customizadas</span>
                            )}
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {perm ? (
                              <>
                                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openPermEdit(perm)}>
                                  <Edit className="w-3 h-3" />Editar
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => deletePermMutation.mutate(perm.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openPermCreate(user)}>
                                <Plus className="w-3 h-3" />Definir
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* ── USUÁRIOS ── */}
          <div>
            {(pendingRegistrations.length > 0 || allRegistrations.some(r => r.status === 'APROVADO' && !users.some(u => u.email === r.email))) && (
              <h2 className="text-sm font-semibold text-black mb-4">Usuários Cadastrados</h2>
            )}
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-20 text-gray-400">Carregando usuários...</div>
              ) : users.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum usuário cadastrado</p>
                </div>
              ) : (
                users.map(user => {
                  const isEditing = editingUserId === user.id;
                  return (
                    <div key={user.id} className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-all">
                      <div className="p-4 bg-white flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-medium text-gray-600">
                              {(user.full_name || user.email || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-black">{user.full_name || user.email}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                            {user.matricula && <p className="text-xs text-gray-400">{user.matricula}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          <Badge className={`${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700'} font-normal text-xs`}>
                            {ROLE_LABELS[user.role] || user.role || '–'}
                          </Badge>
                          {user.equipe && <Badge variant="outline" className="text-xs">{user.equipe}</Badge>}
                          <Button size="sm" variant="outline" className="text-xs gap-1"
                            onClick={() => {
                              setEditingUserId(user.id);
                              setEditingUserData({ role: user.role || 'PROFISSIONAL', equipe: user.equipe || '', full_name: user.full_name || '' });
                            }}>
                            <Pencil className="w-3 h-3" />Editar
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs gap-1"
                            onClick={() => { setEditPasswordUser(user); setNewPassword(''); setNewPasswordConfirm(''); }}>
                            <Key className="w-3 h-3" />Senha
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs gap-1"
                            onClick={() => openPermEdit(permMap[user.email] || { user_email: user.email, user_name: user.full_name, base_role: user.role })}
                          >
                            <Shield className="w-3 h-3" />Permissões
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setDeleteTarget(user)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Invite Dialog — link com aprovação ou email direto */}
      <InviteDialog open={showInviteDialog} onClose={() => setShowInviteDialog(false)} cadastroUrl={cadastroUrl} />

      {/* Review Registration Dialog */}
      <Dialog open={!!reviewingReg} onOpenChange={o => !o && setReviewingReg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewingReg?.action === 'aprovar' ? 'Aprovar solicitação' : reviewingReg?.action === 'convidar' ? 'Enviar convite' : 'Rejeitar solicitação'}
            </DialogTitle>
            <DialogDescription>
              {reviewingReg?.action === 'aprovar' ? 'Aprove e configure as permissões iniciais' : reviewingReg?.action === 'convidar' ? 'Envie um convite ao usuário aprovado' : 'Informe o motivo da rejeição'}
            </DialogDescription>
          </DialogHeader>
          {reviewingReg && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                <p><strong>{reviewingReg.full_name}</strong> — {reviewingReg.email}</p>
                <p className="text-gray-500">{reviewingReg.funcao} · {reviewingReg.museu}{reviewingReg.equipe ? ` · ${reviewingReg.equipe}` : ''}</p>
              </div>
              {(reviewingReg.action === 'aprovar' || reviewingReg.action === 'convidar') && (
                <div className="space-y-3">
                  <div>
                    <Label>Cargo <span className="text-red-500">*</span></Label>
                    <Select value={regRole} onValueChange={setRegRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CARGO_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400 mt-1">
                      {CARGO_OPTIONS.find(o => o.value === regRole)?.description}
                    </p>
                  </div>
                </div>
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
            ) : reviewingReg?.action === 'convidar' ? (
              <Button
                className="bg-black hover:bg-gray-800 text-white"
                onClick={() => approveRegMutation.mutate(reviewingReg)}
                disabled={approveRegMutation.isPending}
              >
                {approveRegMutation.isPending ? 'Enviando...' : 'Enviar Convite'}
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

      {/* Edit User Dialog */}
      <Dialog open={!!editingUserId} onOpenChange={o => { if (!o) { setEditingUserId(null); setEditingUserData({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Atualize cargo e equipe do usuário</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Nome completo</Label>
              <Input
                placeholder="Nome completo"
                value={editingUserData.full_name || ''}
                onChange={e => setEditingUserData({ ...editingUserData, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Cargo</Label>
              <Select value={editingUserData.role || 'PROFISSIONAL'} onValueChange={v => setEditingUserData({ ...editingUserData, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARGO_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">{CARGO_OPTIONS.find(o => o.value === editingUserData.role)?.description}</p>
            </div>
            <div>
              <Label>Equipe</Label>
              <Select value={editingUserData.equipe || ''} onValueChange={v => setEditingUserData({ ...editingUserData, equipe: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => { setEditingUserId(null); setEditingUserData({}); }}>Cancelar</Button>
            <Button className="bg-black hover:bg-gray-800 text-white" disabled={updateMutation.isPending}
              onClick={() => {
                const user = users.find(u => u.id === editingUserId);
                if (user) updateMutation.mutate({ id: user.id, data: { role: editingUserData.role, equipe: editingUserData.equipe, full_name: editingUserData.full_name, email: user.email } });
              }}>
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Dialog — apenas para convidar novo usuário */}
       <Dialog open={showDialog && !editingUser} onOpenChange={setShowDialog}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Convidar Novo Usuário</DialogTitle>
             <DialogDescription>Convide um novo profissional para a plataforma</DialogDescription>
           </DialogHeader>

           <div className="space-y-4 mt-2">
             <div>
               <Label>Email <span className="text-red-500">*</span></Label>
               <Input
                 type="email"
                 placeholder="email@exemplo.com"
                 value={formData.email}
                 onChange={e => setFormData({ ...formData, email: e.target.value })}
               />
             </div>

             <div>
                <Label>Cargo <span className="text-red-500">*</span></Label>
                <Select value={formData.role} onValueChange={v => setFormData({ ...formData, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARGO_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  {CARGO_OPTIONS.find(o => o.value === formData.role)?.description}
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
              <Button variant="outline" onClick={() => { setShowDialog(false); }}>Cancelar</Button>
              <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleSubmit} disabled={isPending}>
                Convidar
              </Button>
             </DialogFooter>
             </DialogContent>
             </Dialog>

      {/* Create Direct User Dialog */}
      <Dialog open={showCreateDirect} onOpenChange={setShowCreateDirect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar novo usuário com senha</DialogTitle>
            <DialogDescription>
              Crie um usuário direto na plataforma sem necessidade de convite
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <Label>Nome completo <span className="text-red-500">*</span></Label>
              <Input
                placeholder="João Silva"
                value={directForm.full_name}
                onChange={e => setDirectForm({ ...directForm, full_name: e.target.value })}
              />
            </div>

            <div>
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                placeholder="joao@example.com"
                value={directForm.email}
                onChange={e => setDirectForm({ ...directForm, email: e.target.value })}
              />
            </div>

            <div>
              <Label>Cargo <span className="text-red-500">*</span></Label>
              <Select value={directForm.role} onValueChange={v => setDirectForm({ ...directForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARGO_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {CARGO_OPTIONS.find(o => o.value === directForm.role)?.description}
              </p>
            </div>

            <div>
              <Label>Senha <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                placeholder="Digite uma senha segura"
                value={directForm.password}
                onChange={e => setDirectForm({ ...directForm, password: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">Mínimo 8 caracteres</p>
            </div>

            <div>
              <Label>Confirmar senha <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                placeholder="Digite a senha novamente"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowCreateDirect(false)}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={() => {
                if (!directForm.full_name || !directForm.email || !directForm.password || !passwordConfirm) {
                  toast.error('Preencha todos os campos');
                  return;
                }
                if (directForm.password !== passwordConfirm) {
                  toast.error('As senhas não coincidem');
                  return;
                }
                if (directForm.password.length < 8) {
                  toast.error('Senha deve ter no mínimo 8 caracteres');
                  return;
                }
                createDirectMutation.mutate(directForm);
              }}
              disabled={createDirectMutation.isPending}
            >
              {createDirectMutation.isPending && <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />}
              {createDirectMutation.isPending ? 'Cadastrando...' : 'Cadastrar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!editPasswordUser} onOpenChange={o => !o && setEditPasswordUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-black" />
              Alterar senha
            </DialogTitle>
            <DialogDescription>
              Atualize a senha de <strong>{editPasswordUser?.full_name || editPasswordUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="p-3 bg-gray-50 border border-black rounded-lg flex gap-3">
              <AlertCircle className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
              <p className="text-xs text-black">
                A nova senha será enviada ao usuário. Certifique-se de que ele está ciente da alteração.
              </p>
            </div>

            <div>
              <Label>Nova senha <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                placeholder="Digite a nova senha"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Mínimo 8 caracteres</p>
            </div>

            <div>
              <Label>Confirmar senha <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                placeholder="Confirme a nova senha"
                value={newPasswordConfirm}
                onChange={e => setNewPasswordConfirm(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditPasswordUser(null)}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={() => {
                if (!newPassword || !newPasswordConfirm) {
                  toast.error('Preencha ambas as senhas');
                  return;
                }
                if (newPassword !== newPasswordConfirm) {
                  toast.error('As senhas não coincidem');
                  return;
                }
                if (newPassword.length < 8) {
                  toast.error('Senha deve ter no mínimo 8 caracteres');
                  return;
                }
                changePasswordMutation.mutate({ 
                  target_user_email: editPasswordUser.email,
                  new_password: newPassword 
                });
              }}
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? 'Alterando...' : 'Alterar Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pending Registration Dialog */}
      <Dialog open={!!editingPendingReg} onOpenChange={o => { if (!o) { setEditingPendingReg(null); setEditingPendingData({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Registro Pendente</DialogTitle>
            <DialogDescription>Atualize os dados do registro de {editingPendingReg?.full_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Nome completo</Label>
              <Input value={editingPendingData.full_name || ''} onChange={e => setEditingPendingData({ ...editingPendingData, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editingPendingData.email || ''} onChange={e => setEditingPendingData({ ...editingPendingData, email: e.target.value })} />
            </div>
            <div>
              <Label>Função</Label>
              <Input value={editingPendingData.funcao || ''} onChange={e => setEditingPendingData({ ...editingPendingData, funcao: e.target.value })} />
            </div>
            <div>
              <Label>Museu</Label>
              <Input value={editingPendingData.museu || ''} onChange={e => setEditingPendingData({ ...editingPendingData, museu: e.target.value })} />
            </div>
            <div>
              <Label>Equipe</Label>
              <Select value={editingPendingData.equipe || ''} onValueChange={v => setEditingPendingData({ ...editingPendingData, equipe: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => { setEditingPendingReg(null); setEditingPendingData({}); }}>Cancelar</Button>
            <Button className="bg-black hover:bg-gray-800 text-white" disabled={updateRegMutation.isPending}
              onClick={() => updateRegMutation.mutate({ id: editingPendingReg.id, data: editingPendingData })}>
              {updateRegMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permission Create Dialog */}
      <Dialog open={showPermDialog} onOpenChange={setShowPermDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissões: {permFormData?.user_name || permFormData?.user_email}</DialogTitle>
            <DialogDescription>Configure as permissões customizadas para este usuário</DialogDescription>
          </DialogHeader>
          {permFormData && (
            <div className="space-y-3 mt-3">
              {/* Controle especial para obrigatoriedade de relatório mensal */}
              <div className="p-3 border-2 border-black rounded-lg bg-white space-y-3">
                <p className="text-sm font-semibold text-black">Relatório Mensal Obrigatório</p>
                <div className="flex items-center gap-3">
                  <Checkbox checked={!!permFormData['must_submit_monthly_reports']} onCheckedChange={() => togglePerm('must_submit_monthly_reports')} id="new-must_submit_monthly_reports" />
                  <label htmlFor="new-must_submit_monthly_reports" className="text-sm cursor-pointer font-medium">Exigir envio de relatório mensal</label>
                </div>
                <p className="text-xs text-gray-500 ml-6">Quando ativado: usuário receberá notificação no último dia do mês, relatório será exportado em PDF, aprovado pela coordenação e assinado digitalmente.</p>
              </div>

              {/* Outras permissões */}
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-semibold text-black">Permissões de Acesso</p>
                {PERMISSIONS.filter(p => p.key !== 'must_submit_monthly_report').map(p => (
                  <div key={p.key} className="flex items-center gap-3">
                    <Checkbox checked={!!permFormData[p.key]} onCheckedChange={() => togglePerm(p.key)} id={`new-${p.key}`} />
                    <label htmlFor={`new-${p.key}`} className="text-sm cursor-pointer">{p.label}</label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowPermDialog(false)}>Cancelar</Button>
            <Button className="bg-black hover:bg-gray-800 text-white" onClick={savePerm} disabled={createPermMutation.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permission Edit Dialog */}
      <Dialog open={!!editingPerm} onOpenChange={o => !o && setEditingPerm(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Permissões: {editingPerm?.user_name}</DialogTitle>
            <DialogDescription>{editingPerm?.user_email}</DialogDescription>
          </DialogHeader>
          {editingPerm && (
            <div className="space-y-3 mt-3">
              {/* Controle especial para obrigatoriedade de relatório mensal */}
              <div className="p-3 border-2 border-black rounded-lg bg-white space-y-3">
                <p className="text-sm font-semibold text-black">Obrigações de Relatório</p>
                <div className="flex items-center gap-3">
                  <Checkbox checked={!!editingPerm['must_submit_monthly_report']} onCheckedChange={() => togglePerm('must_submit_monthly_report')} id="edit-must_submit_monthly_report" />
                  <label htmlFor="edit-must_submit_monthly_report" className="text-sm cursor-pointer font-medium">Relatório mensal</label>
                </div>
                <p className="text-xs text-gray-500 ml-6">Quando ativado, o sistema exigirá que este usuário envie um relatório a cada mês.</p>
              </div>

              {/* Outras permissões */}
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-semibold text-black">Permissões de Acesso</p>
                {PERMISSIONS.filter(p => p.key !== 'must_submit_monthly_report').map(p => (
                  <div key={p.key} className="flex items-center gap-3">
                    <Checkbox checked={!!editingPerm[p.key]} onCheckedChange={() => togglePerm(p.key)} id={`edit-${p.key}`} />
                    <label htmlFor={`edit-${p.key}`} className="text-sm cursor-pointer">{p.label}</label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditingPerm(null)}>Cancelar</Button>
            <Button className="bg-black hover:bg-gray-800 text-white" onClick={savePerm} disabled={updatePermMutation.isPending}>
              <Save className="w-4 h-4 mr-1" />Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Pending Registration Confirm */}
      <AlertDialog open={!!deleteRegTarget} onOpenChange={o => !o && setDeleteRegTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover registro?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-gray-500 px-1">
            Tem certeza que deseja remover o registro de <strong>{deleteRegTarget?.full_name || deleteRegTarget?.email}</strong>? Esta ação não pode ser desfeita.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteRegMutation.mutate(deleteRegTarget.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  return <RequireAuth requireRole={['ADMIN', 'COORDENADOR']}><UserManagementInner /></RequireAuth>;
}