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
          <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={() => setShowInviteLink(true)}>
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
               <div className={`grid gap-4 px-4 mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide ${canViewReportStatus ? 'grid-cols-12' : 'grid-cols-10'}`}>
                 <span className={canViewReportStatus ? 'col-span-3' : 'col-span-3'}>Nome / Email</span>
                 <span className="col-span-2">Papel</span>
                 <span className="col-span-2">Equipe</span>
                 <span className="col-span-2">Acesso</span>
                 {canViewReportStatus && <span className="col-span-2">Relatório</span>}
                 <span className={`${canViewReportStatus ? 'col-span-1' : 'col-span-1'} text-right`}>Ações</span>
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
                users.map(user => {
                   const userReg = allRegistrations.find(r => r.email === user.email);
                   const approvalStatus = userReg?.status;
                   const reportStatus = getReportStatus(user.email);

                   return (
                     <div
                       key={user.id}
                       className={`grid gap-4 items-center p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-all ${canViewReportStatus ? 'grid-cols-12' : 'grid-cols-10'}`}
                     >
                       <div className="col-span-3 flex items-center gap-3 min-w-0">
                         <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                           <span className="text-sm font-medium text-gray-600">
                             {(user.full_name || user.email || '?')[0].toUpperCase()}
                           </span>
                         </div>
                         <div className="min-w-0">
                           <p className="font-medium text-black truncate">{user.full_name || '–'}</p>
                           <p className="text-xs text-gray-400 truncate">{user.email}</p>
                           {user.matricula && (
                             <p className="text-xs font-mono text-gray-400 truncate">{user.matricula}</p>
                           )}
                         </div>
                       </div>
                       <div className="col-span-2">
                         <Badge className={`${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700'} font-normal text-xs`}>
                           {ROLE_LABELS[user.role] || user.role || '–'}
                         </Badge>
                       </div>
                       <div className="col-span-2">
                         <span className="text-sm text-gray-600">{user.equipe || '–'}</span>
                       </div>
                       <div className="col-span-2">
                         {approvalStatus === 'APROVADO' ? (
                           <Badge className="bg-green-100 text-green-700 text-xs font-normal">
                             <CheckCircle className="w-3 h-3 mr-1" />Aprovado
                           </Badge>
                         ) : approvalStatus === 'REJEITADO' ? (
                           <Badge className="bg-red-100 text-red-700 text-xs font-normal">
                             <XCircle className="w-3 h-3 mr-1" />Rejeitado
                           </Badge>
                         ) : (
                           <Badge className="bg-amber-100 text-amber-700 text-xs font-normal">
                             <Clock className="w-3 h-3 mr-1" />Pendente
                           </Badge>
                         )}
                       </div>
                       {canViewReportStatus && (
                         <div className="col-span-2">
                           <Badge className={`${reportStatus.color} text-xs font-normal`}>
                             {reportStatus.label}
                           </Badge>
                         </div>
                       )}
                       <div className="col-span-1 flex justify-end gap-1">
                        {approvalStatus === 'PENDENTE' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                              onClick={() => { setReviewingReg({ ...userReg, action: 'rejeitar' }); setRegNote(''); }}
                            >
                              <XCircle className="w-3 h-3 mr-1" />Rejeitar
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white text-xs"
                              onClick={() => { setReviewingReg({ ...userReg, action: 'aprovar' }); setRegNote(''); setRegRole(user.role || 'PROFISSIONAL'); }}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />Aprovar
                            </Button>
                          </>
                        )}
                        {approvalStatus !== 'PENDENTE' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)}>
                            <Pencil className="w-4 h-4 text-gray-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(user)}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  );
                })
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
      </div>

      {/* Invite Link Dialog */}
      <Dialog open={showInviteLink} onOpenChange={setShowInviteLink}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Convidar novo usuário</DialogTitle>
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
  return <RequireAuth requireRole={['ADMIN', 'COORDENADOR']}><UserManagementInner /></RequireAuth>;
}