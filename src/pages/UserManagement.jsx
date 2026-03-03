import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2, Bell, CheckCircle, XCircle, Clock, Copy, Check, Mail, Key, Shield, AlertCircle, Lock, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

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
  COORDENADOR: 'bg-black text-white',
  COORD_PRODUCAO: 'bg-purple-100 text-purple-700',
  COORD_ADMINISTRATIVA: 'bg-orange-100 text-orange-700',
  COORD_COMUNICACAO: 'bg-cyan-100 text-cyan-700',
  CONSULTORIA_PROGRAMACAO: 'bg-teal-100 text-teal-700',
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
   const [regRole, setRegRole] = useState('PROFISSIONAL');
   const [copied, setCopied] = useState(false);
   const [showInviteLink, setShowInviteLink] = useState(false);
   const [currentUser, setCurrentUser] = useState(null);
   const [editingUserPerm, setEditingUserPerm] = useState(null);
   const [permissionsForm, setPermissionsForm] = useState({});
   const [showCreateDirect, setShowCreateDirect] = useState(false);
   const [directForm, setDirectForm] = useState({ email: '', password: '', full_name: '', role: 'PROFISSIONAL' });
   const [passwordConfirm, setPasswordConfirm] = useState('');
   const [editPasswordUser, setEditPasswordUser] = useState(null);
   const [newPassword, setNewPassword] = useState('');
   const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
   const [expandedUserId, setExpandedUserId] = useState(null);
   const [editingUserMode, setEditingUserMode] = useState(null);

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

  const { data: userPermissions = [] } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => base44.asServiceRole.entities.UserPermission.list('-created_date', 9999),
    refetchInterval: 30_000,
  });

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
      // Also update or create UserPermission record
      const existingPerm = userPermissions.find(p => p.user_email === data.email);
      if (existingPerm) {
        await base44.asServiceRole.entities.UserPermission.update(existingPerm.id, {
          user_name: data.full_name,
          base_role: data.role,
        });
      } else if (data.email) {
        await base44.asServiceRole.entities.UserPermission.create({
          user_email: data.email,
          user_name: data.full_name,
          base_role: data.role,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['user-permissions']);
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

  const setShowPermissions = (user) => {
    const perm = userPermissions.find(p => p.user_email === user.email);
    setEditingUserPerm(perm || { user_email: user.email, user_name: user.full_name });
    setPermissionsForm({
      must_submit_monthly_report: perm?.must_submit_monthly_report || false,
      can_view_all_reports: perm?.can_view_all_reports !== false,
      can_review_reports: perm?.can_review_reports || false,
      can_manage_users: perm?.can_manage_users || false,
      can_manage_files: perm?.can_manage_files || false,
      can_manage_museus: perm?.can_manage_museus || false,
      can_manage_equipes: perm?.can_manage_equipes || false,
      can_view_audit_log: perm?.can_view_audit_log || false,
      can_manage_platform: perm?.can_manage_platform || false,
    });
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      role: user.role || 'PROFISSIONAL',
      equipe: user.equipe || '',
    });
    setShowPermissions(user);
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.email && !editingUser) {
      toast.error('Informe o email'); return;
    }
    if (editingUser) {
      // Se está editando e tem permissões customizadas, atualizar também
      if (editingUserPerm) {
        const permData = {
          user_email: editingUserPerm.user_email,
          user_name: editingUser.full_name,
          base_role: formData.role,
          must_submit_monthly_report: permissionsForm.must_submit_monthly_report,
          can_view_all_reports: permissionsForm.can_view_all_reports,
          can_review_reports: permissionsForm.can_review_reports,
          can_manage_users: permissionsForm.can_manage_users,
          can_manage_files: permissionsForm.can_manage_files,
          can_manage_museus: permissionsForm.can_manage_museus,
          can_manage_equipes: permissionsForm.can_manage_equipes,
          can_view_audit_log: permissionsForm.can_view_audit_log,
          can_manage_platform: permissionsForm.can_manage_platform,
        };

        if (editingUserPerm.id) {
          // Update existing permission
          await base44.asServiceRole.entities.UserPermission.update(editingUserPerm.id, permData);
        } else {
          // Create new permission
          await base44.asServiceRole.entities.UserPermission.create(permData);
        }
        queryClient.invalidateQueries(['user-permissions']);
      }
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

  const isPending = inviteMutation.isPending || updateMutation.isPending || createDirectMutation.isPending;

  const canViewReportStatus = currentUser && currentUser.role === 'COORDENADOR';

  const getReportStatus = (userEmail) => {
    const currentDate = new Date();
    const currentMonth = currentDate.toLocaleString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + currentDate.toLocaleString('pt-BR', { month: 'long' }).slice(1);
    const currentYear = currentDate.getFullYear();
    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const prevMonthName = prevMonth.toLocaleString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + prevMonth.toLocaleString('pt-BR', { month: 'long' }).slice(1);
    const prevYear = prevMonth.getFullYear();

    // Verifica se o usuário é obrigado (PROFISSIONAL)
    const user = users.find(u => u.email === userEmail);
    if (!user || user.role !== 'PROFISSIONAL') {
      return { status: 'nao_obrigado', label: 'Não obrigado', color: 'bg-gray-100 text-gray-700' };
    }

    // Verifica se está desobrigado neste mês
    const isExempted = allExemptions.some(e => 
      e.user_email === userEmail && 
      e.mes_referencia === prevMonthName && 
      e.ano === prevYear
    );
    if (isExempted) {
      return { status: 'desobrigado', label: 'Desobrigado', color: 'bg-purple-100 text-purple-700' };
    }

    // Procura relatório do mês anterior
    const report = allReports.find(r => 
      r.created_by === userEmail && 
      r.mes_referencia === prevMonthName && 
      r.ano === prevYear
    );

    if (!report) {
      // Verifica prazo (10º dia do mês atual)
      const deadline = new Date(currentDate.getFullYear(), currentDate.getMonth(), 10);
      if (currentDate > deadline) {
        return { status: 'atrasado', label: 'Atrasado', color: 'bg-red-100 text-red-700' };
      }
      return { status: 'pendente', label: 'Pendente', color: 'bg-amber-100 text-amber-700' };
    }

    if (report.status === 'APPROVED' || report.status === 'ARCHIVED') {
      return { status: 'aprovado', label: 'Aprovado', color: 'bg-green-100 text-green-700' };
    }
    if (report.status === 'SUBMITTED' || report.status === 'IN_REVIEW') {
      return { status: 'enviado', label: 'Enviado', color: 'bg-blue-100 text-blue-700' };
    }
    return { status: 'rascunho', label: 'Rascunho', color: 'bg-gray-100 text-gray-700' };
  };

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
            <Button variant="outline" className="gap-2" onClick={() => setShowInviteLink(true)}>
              <Plus className="w-4 h-4" />
              Convidar Usuário
            </Button>
          </div>
        </div>

        {(() => {
          const approvedButNotInvited = allRegistrations.filter(reg => {
            const isUser = users.some(u => u.email === reg.email);
            return reg.status === 'APROVADO' && !isUser;
          });
          const defaultTab = pendingRegistrations.length > 0 ? 'solicitacoes' : (approvedButNotInvited.length > 0 ? 'pendentes-convite' : 'usuarios');
          
          return (
            <Tabs defaultValue={defaultTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="usuarios">
                  Usuários
                </TabsTrigger>
                {approvedButNotInvited.length > 0 && (
                  <TabsTrigger value="pendentes-convite" className="gap-2">
                    <Mail className="w-3.5 h-3.5" />
                    Pendentes de Convite
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center font-bold">
                      {approvedButNotInvited.length}
                    </span>
                  </TabsTrigger>
                )}
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
                   const userReg = allRegistrations.find(r => r.email === user.email);
                   const approvalStatus = userReg?.status;
                   const reportStatus = getReportStatus(user.email);
                   const userPerm = userPermissions.find(p => p.user_email === user.email);

                   return (
                     <div key={user.id} className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-all">
                       {/* Header row */}
                       <div className="p-4 bg-white flex items-center justify-between gap-4">
                         <div className="flex items-center gap-4 flex-1 min-w-0">
                           <button
                             onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                             className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                           >
                             {expandedUserId === user.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                           </button>
                           <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                             <span className="text-sm font-medium text-gray-600">
                               {(user.full_name || user.email || '?')[0].toUpperCase()}
                             </span>
                           </div>
                           <div className="min-w-0 flex-1">
                             <p className="font-semibold text-black">{user.full_name || user.email}</p>
                             <p className="text-xs text-gray-500">{user.email}</p>
                           </div>
                         </div>
                         <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
                           <Badge className={`${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700'} font-normal text-xs`}>
                             {ROLE_LABELS[user.role] || user.role || '–'}
                           </Badge>
                           {user.equipe && (
                             <Badge variant="outline" className="text-xs">{user.equipe}</Badge>
                           )}
                           {approvalStatus === 'APROVADO' && (
                             <Badge className="bg-green-100 text-green-700 text-xs font-normal">
                               <CheckCircle className="w-3 h-3 mr-1" />Aprovado
                             </Badge>
                           )}
                         </div>
                       </div>

                       {/* Expanded details */}
                       {expandedUserId === user.id && (
                         <div className="border-t border-gray-100 p-4 space-y-6 bg-gray-50">
                           {/* Editar dados básicos */}
                           <div>
                             <div className="flex items-center justify-between mb-4">
                               <h3 className="text-sm font-semibold text-black">Informações</h3>
                               <Button
                                 size="sm"
                                 variant={editingUserMode === `${user.id}-info` ? 'default' : 'outline'}
                                 className="text-xs"
                                 onClick={() => setEditingUserMode(editingUserMode === `${user.id}-info` ? null : `${user.id}-info`)}
                               >
                                 {editingUserMode === `${user.id}-info` ? 'Salvar' : 'Editar'}
                                 </Button>
                                 </div>
                                 {editingUserMode === `${user.id}-info` ? (
                               <div className="space-y-3 bg-white p-3 rounded-lg border border-gray-200">
                                 <div>
                                   <Label className="text-xs">Cargo</Label>
                                   <Select value={user.role} onValueChange={(v) => base44.entities.User.update(user.id, { role: v }).then(() => queryClient.invalidateQueries(['users']))}>
                                     <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                     <SelectContent>
                                       {CARGO_OPTIONS.map(opt => (
                                         <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                       ))}
                                     </SelectContent>
                                   </Select>
                                 </div>
                                 <div>
                                   <Label className="text-xs">Equipe</Label>
                                   <Select value={user.equipe || ''} onValueChange={(v) => base44.entities.User.update(user.id, { equipe: v }).then(() => queryClient.invalidateQueries(['users']))}>
                                     <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                     <SelectContent>
                                       {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                                     </SelectContent>
                                   </Select>
                                 </div>
                               </div>
                             ) : (
                               <div className="space-y-2 text-sm">
                                 <div><span className="text-gray-600">Cargo:</span> {ROLE_LABELS[user.role] || user.role}</div>
                                 <div><span className="text-gray-600">Equipe:</span> {user.equipe || '–'}</div>
                                 {user.matricula && <div><span className="text-gray-600">Matrícula:</span> {user.matricula}</div>}
                               </div>
                             )}
                           </div>

                           {/* Permissões */}
                           <div>
                             <h3 className="text-sm font-semibold text-black mb-3">Permissões</h3>
                             <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-3">
                               <div className="space-y-2">
                                 <p className="text-xs font-semibold text-gray-600 uppercase">Relatórios</p>
                                 {['can_view_all_reports', 'can_review_reports', 'must_submit_monthly_report'].map(perm => (
                                   <div key={perm} className="flex items-center gap-2">
                                     <input
                                       type="checkbox"
                                       id={`${user.id}-${perm}`}
                                       checked={userPerm?.[perm] !== false}
                                       onChange={(e) => {
                                         const data = userPerm ? { ...userPerm, [perm]: e.target.checked } : { user_email: user.email, user_name: user.full_name, base_role: user.role, [perm]: e.target.checked };
                                         if (userPerm?.id) {
                                           base44.asServiceRole.entities.UserPermission.update(userPerm.id, data);
                                         } else {
                                           base44.asServiceRole.entities.UserPermission.create({ ...data, base_role: user.role });
                                         }
                                         queryClient.invalidateQueries(['user-permissions']);
                                       }}
                                       className="rounded border-gray-300"
                                     />
                                     <Label htmlFor={`${user.id}-${perm}`} className="text-xs font-normal cursor-pointer">
                                       {perm === 'can_view_all_reports' ? 'Visualizar todos' : perm === 'can_review_reports' ? 'Revisar e aprovar' : 'Enviar relatório mensal'}
                                     </Label>
                                   </div>
                                 ))}
                               </div>
                               <div className="space-y-2">
                                 <p className="text-xs font-semibold text-gray-600 uppercase">Gerenciamento</p>
                                 {['can_manage_users', 'can_manage_files', 'can_manage_museus', 'can_manage_equipes'].map(perm => (
                                   <div key={perm} className="flex items-center gap-2">
                                     <input
                                       type="checkbox"
                                       id={`${user.id}-${perm}`}
                                       checked={userPerm?.[perm] || false}
                                       onChange={(e) => {
                                         const data = userPerm ? { ...userPerm, [perm]: e.target.checked } : { user_email: user.email, user_name: user.full_name, base_role: user.role, [perm]: e.target.checked };
                                         if (userPerm?.id) {
                                           base44.asServiceRole.entities.UserPermission.update(userPerm.id, data);
                                         } else {
                                           base44.asServiceRole.entities.UserPermission.create({ ...data, base_role: user.role });
                                         }
                                         queryClient.invalidateQueries(['user-permissions']);
                                       }}
                                       className="rounded border-gray-300"
                                     />
                                     <Label htmlFor={`${user.id}-${perm}`} className="text-xs font-normal cursor-pointer">
                                       {perm === 'can_manage_users' ? 'Gerenciar usuários' : perm === 'can_manage_files' ? 'Gerenciar arquivos' : perm === 'can_manage_museus' ? 'Gerenciar museus' : 'Gerenciar equipes'}
                                     </Label>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           </div>

                           {/* Ações */}
                           <div className="flex gap-2 flex-wrap pt-3 border-t border-gray-200">
                             <Button
                               size="sm"
                               variant="outline"
                               className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                               onClick={() => { setEditPasswordUser(user); setNewPassword(''); setNewPasswordConfirm(''); }}
                             >
                               <Key className="w-3 h-3" />Alterar Senha
                             </Button>
                             <Button
                               size="sm"
                               className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                               onClick={() => {
                                 const appId = window.location.pathname.split('/')[2] || '';
                                 const cadastroUrl = appId ? `${window.location.origin}/app/${appId}/Cadastro` : `${window.location.origin}/Cadastro`;
                                 base44.functions.invoke('sendInviteEmail', {
                                   email: user.email,
                                   full_name: user.full_name,
                                   role: user.role,
                                   cadastroUrl
                                 }).then(() => toast.success('Convite reenviado'));
                               }}
                             >
                               <Mail className="w-3 h-3" />Reenviar Convite
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               className="text-red-600 border-red-200 hover:bg-red-50 gap-2 ml-auto"
                               onClick={() => setDeleteTarget(user)}
                             >
                               <Trash2 className="w-3 h-3" />Excluir
                             </Button>
                           </div>
                         </div>
                       )}
                     </div>
                   );
                })
              )}
            </div>
          </TabsContent>

          {/* ── ABA PENDENTES DE CONVITE ── */}
          <TabsContent value="pendentes-convite">
            {(() => {
              const approvedButNotInvited = allRegistrations.filter(reg => {
                const isUser = users.some(u => u.email === reg.email);
                return reg.status === 'APROVADO' && !isUser;
              });

              return approvedButNotInvited.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
                  <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum usuário pendente de convite</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {approvedButNotInvited.map((reg) => (
                    <div key={reg.id} className="p-5 border border-orange-100 bg-orange-50/40 rounded-xl hover:border-orange-200 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold text-orange-700">
                            {(reg.full_name || '')[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-black">{reg.full_name}</p>
                            <p className="text-sm text-gray-500">{reg.email}</p>
                            <div className="flex gap-3 text-xs text-gray-400 mt-1">
                              <span>{reg.funcao}</span>
                              <span>•</span>
                              <span>{reg.museu}</span>
                              {reg.equipe && (
                                <>
                                  <span>•</span>
                                  <span>{reg.equipe}</span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                              ✅ Aprovado em {new Date(reg.updated_date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs flex-shrink-0"
                          onClick={() => {
                            setReviewingReg({ ...reg, action: 'convidar' });
                            setRegRole('PROFISSIONAL');
                            setRegNote('');
                          }}
                        >
                          <Mail className="w-4 h-4 mr-1" />Enviar Convite
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
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
                {pendingRegistrations.map((reg, idx) => (
                  <div key={reg.id} className="p-5 border border-amber-100 bg-amber-50/40 rounded-xl hover:border-amber-200 transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold text-amber-700">
                          {(reg.full_name || '')[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-black">{reg.full_name}</p>
                            <span className="text-xs font-mono bg-amber-100 text-amber-700 px-2 py-0.5 rounded">#{idx + 1}</span>
                          </div>
                          <p className="text-sm text-gray-500">{reg.email}</p>
                          <div className="flex gap-3 text-xs text-gray-400 mt-1">
                            <span>{reg.funcao}</span>
                            <span>•</span>
                            <span>{reg.museu}</span>
                            {reg.equipe && (
                              <>
                                <span>•</span>
                                <span>{reg.equipe}</span>
                              </>
                            )}
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                          onClick={() => { setReviewingReg({ ...reg, action: 'rejeitar' }); setRegNote(''); }}
                        >
                          <XCircle className="w-4 h-4 mr-1" />Rejeitar
                        </Button>
                        <Button
                           size="sm"
                           className="bg-green-600 hover:bg-green-700 text-white text-xs"
                           onClick={() => { setReviewingReg({ ...reg, action: 'aprovar' }); setRegNote(''); setRegRole('PROFISSIONAL'); }}
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
           );
           })()}
           </div>

      {/* Invite Link Dialog */}
      <Dialog open={showInviteLink} onOpenChange={setShowInviteLink}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Convidar novo usuário</DialogTitle>
            <DialogDescription>Compartilhe o link com o profissional para solicitar acesso</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            <p className="text-sm text-gray-600">
              Compartilhe o link abaixo com o profissional. Ele(a) preencherá o formulário de cadastro e a solicitação chegará aqui para sua aprovação.
            </p>

            {/* Link */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Link do formulário de cadastro</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all text-gray-700">
                  {cadastroUrl}
                </code>
                <Button size="icon" variant="outline" onClick={copyLink} className="flex-shrink-0">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Texto para copiar */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Texto para WhatsApp / mensagens</Label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {`Olá! Você foi convidado(a) para acessar a plataforma de relatórios dos Museus Centro.\n\nPara solicitar seu acesso, preencha o formulário neste link:\n${cadastroUrl}\n\nApós o envio, sua solicitação será analisada e você receberá um e-mail com as instruções de acesso.`}
              </div>
            </div>

            {/* Ações rápidas */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={copyLink}
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar link'}
              </Button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              Após preencher o formulário, a solicitação aparecerá na aba "Solicitações de Acesso" para sua aprovação.
            </p>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setShowInviteLink(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                className="bg-blue-600 hover:bg-blue-700 text-white"
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
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingUserPerm(null); }}>Cancelar</Button>
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
              <Key className="w-5 h-5 text-blue-600" />
              Alterar senha
            </DialogTitle>
            <DialogDescription>
              Atualize a senha de <strong>{editPasswordUser?.full_name || editPasswordUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
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
              className="bg-blue-600 hover:bg-blue-700 text-white"
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