import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import MetadadosManager from '../components/admin/MetadadosManager';
import {
  Users, FileText, History, Settings, ShieldCheck,
  CheckCircle, XCircle, Pencil, Trash2, ChevronRight,
  TrendingUp, Clock, UserCheck, AlertTriangle, Download, Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

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
const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-700' },
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-yellow-100 text-yellow-700' },
  RETURNED:  { label: 'Devolvido',  color: 'bg-red-100 text-red-700' },
  APPROVED:  { label: 'Aprovado',   color: 'bg-green-100 text-green-700' },
  ARCHIVED:  { label: 'Arquivado',  color: 'bg-purple-100 text-purple-700' },
};

function KpiCard({ label, value, icon: Icon, sub }) {
  return (
    <div className="p-5 border border-gray-100 rounded-xl bg-white">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
          <Icon className="w-4 h-4 text-gray-500" />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-3xl font-semibold text-black">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function PlataformaAdminInner() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['plat-users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['plat-reports'],
    queryFn: () => base44.entities.Report.list('-created_date', 500),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['plat-logs'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 50),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['plat-users']);
      toast.success('Usuário atualizado');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['plat-users']);
      toast.success('Usuário removido');
      setDeleteTarget(null);
    },
  });

  const archiveReportMutation = useMutation({
    mutationFn: (id) => base44.entities.Report.update(id, { status: 'ARCHIVED' }),
    onSuccess: () => {
      queryClient.invalidateQueries(['plat-reports']);
      toast.success('Relatório arquivado');
    },
  });

  // Stats
  const totalUsers = users.length;
  const pendingUsers = users.filter(u => !u.role || u.role === '').length;
  const totalReports = reports.length;
  const approvedReports = reports.filter(r => r.status === 'APPROVED').length;

  // CSV export all reports
  const exportCSV = () => {
    const header = ['Profissional', 'Museu', 'Mês', 'Ano', 'Status', 'Equipe', 'Criado em'];
    const rows = reports.map(r => [
      r.author_name || '',
      r.museu || '',
      r.mes_referencia || '',
      r.ano || '',
      STATUS_CONFIG[r.status]?.label || r.status || '',
      r.equipe || '',
      r.created_date ? new Date(r.created_date).toLocaleDateString('pt-BR') : '',
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorios_exportados_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-3">
              <Settings className="w-7 h-7" />
              Gestão da Plataforma
            </h1>
            <p className="text-gray-500 mt-1 text-sm">Painel administrativo da coordenação — controle total do sistema</p>
          </div>
          <Button onClick={exportCSV} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar CSV Completo
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KpiCard label="Usuários Cadastrados" value={totalUsers} icon={Users} />
          <KpiCard label="Aguardando Configuração" value={pendingUsers} icon={AlertTriangle} sub="sem perfil definido" />
          <KpiCard label="Total de Relatórios" value={totalReports} icon={FileText} />
          <KpiCard label="Relatórios Aprovados" value={approvedReports} icon={CheckCircle} sub={totalReports ? `${Math.round((approvedReports/totalReports)*100)}% do total` : '—'} />
        </div>

        <Tabs defaultValue="usuarios">
          <TabsList className="mb-6 bg-gray-100 p-1 rounded-xl">
            <TabsTrigger value="usuarios" className="gap-2"><Users className="w-3.5 h-3.5" />Usuários</TabsTrigger>
            <TabsTrigger value="relatorios" className="gap-2"><FileText className="w-3.5 h-3.5" />Relatórios</TabsTrigger>
            <TabsTrigger value="auditoria" className="gap-2"><History className="w-3.5 h-3.5" />Auditoria</TabsTrigger>
            <TabsTrigger value="metadados" className="gap-2"><Database className="w-3.5 h-3.5" />Metadados</TabsTrigger>
          </TabsList>

          {/* ── USUÁRIOS ── */}
          <TabsContent value="usuarios">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-black">Gestão de Usuários</h2>
              <Link to={createPageUrl('UserManagement')}>
                <Button size="sm" className="bg-black text-white hover:bg-gray-800 gap-1">
                  Gerenciar <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>

            {loadingUsers ? (
              <div className="text-center py-16 text-gray-400">Carregando...</div>
            ) : (
              <div className="space-y-2">
                {users.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-gray-600">
                          {(user.full_name || user.email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-black text-sm">{user.full_name || '(sem nome)'}</p>
                        <p className="text-xs text-gray-400">{user.email} {user.equipe ? `· ${user.equipe}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={`${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-500'} font-normal text-xs`}>
                        {ROLE_LABELS[user.role] || user.role || 'Sem perfil'}
                      </Badge>
                      {/* Promover / rebaixar */}
                      {user.role !== 'COORDENADOR' && user.id !== currentUser?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => updateUserMutation.mutate({ id: user.id, data: { role: 'COORDENADOR' } })}
                        >
                          <UserCheck className="w-3 h-3" />Promover
                        </Button>
                      )}
                      {user.role === 'COORDENADOR' && user.id !== currentUser?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => updateUserMutation.mutate({ id: user.id, data: { role: 'PROFISSIONAL' } })}
                        >
                          Rebaixar
                        </Button>
                      )}
                      {user.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── RELATÓRIOS ── */}
          <TabsContent value="relatorios">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-black">Todos os Relatórios ({totalReports})</h2>
              <Button onClick={exportCSV} size="sm" variant="outline" className="gap-1">
                <Download className="w-3.5 h-3.5" />CSV
              </Button>
            </div>

            {loadingReports ? (
              <div className="text-center py-16 text-gray-400">Carregando...</div>
            ) : (
              <div className="space-y-2">
                {reports.map(report => {
                  const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
                  return (
                    <div key={report.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-gray-200">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-black text-sm">{report.author_name}</span>
                          <span className="text-xs text-gray-400">— {report.mes_referencia} {report.ano} · {report.museu}</span>
                          <Badge className={`${cfg.color} font-normal text-xs`}>{cfg.label}</Badge>
                        </div>
                        {report.equipe && <p className="text-xs text-gray-400 mt-0.5">Equipe: {report.equipe}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Link to={createPageUrl(`ReportEditor?id=${report.id}`)}>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                            <FileText className="w-3 h-3" />Ver
                          </Button>
                        </Link>
                        {report.status === 'APPROVED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => archiveReportMutation.mutate(report.id)}
                          >
                            Arquivar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── METADADOS ── */}
          <TabsContent value="metadados">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-black">Metadados do Sistema</h2>
              <p className="text-sm text-gray-400 mt-0.5">Gerencie museus, tipos de atividade, classificações e demais metadados usados nos formulários.</p>
            </div>
            <MetadadosManager />
          </TabsContent>

          {/* ── AUDITORIA ── */}
          <TabsContent value="auditoria">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-black">Últimas 50 Ações</h2>
              <Link to={createPageUrl('AuditLog')}>
                <Button size="sm" variant="outline" className="gap-1 text-xs">
                  Ver completo <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl text-sm">
                  <Badge className="font-normal text-xs bg-gray-100 text-gray-700">{log.action}</Badge>
                  <span className="text-gray-600 flex-1 truncate">{log.details || `${log.entity_type} #${log.entity_id}`}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{log.actor_name || log.actor_email}</span>
                </div>
              ))}
              {logs.length === 0 && <p className="text-center py-12 text-gray-400">Nenhuma ação registrada ainda</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-gray-500 px-1">
            Tem certeza que deseja remover <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>? Esta ação não pode ser desfeita.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteUserMutation.mutate(deleteTarget.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PlataformaAdmin() {
  return <RequireAuth requireRole="COORDENADOR"><PlataformaAdminInner /></RequireAuth>;
}