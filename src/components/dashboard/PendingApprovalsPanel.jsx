import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Trash2,
  Eye,
  Lock,
  FileText,
  Users,
  CheckCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { normalizeEmail, revokeUserAccess } from '@/utils/auth/recoverExistingUserAccess';

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Enviado', color: '#dbeafe', text: '#1d4ed8' },
  IN_REVIEW: { label: 'Em Revisão', color: '#fef9c3', text: '#92400e' },
  PENDING: { label: 'Aguardando', color: '#fef9c3', text: '#92400e' },
};

export default function PendingApprovalsPanel() {
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // Fetch pending users registrations
  const { data: pendingUsers = [] } = useQuery({
    queryKey: ['pending-users'],
    queryFn: () => base44.entities.UserRegistration.filter({ status: 'PENDENTE' }),
  });

  // Fetch pending reports
  const { data: pendingReports = [] } = useQuery({
    queryKey: ['pending-reports'],
    queryFn: async () => {
      const all = await base44.entities.Report.list('-created_date', 500);
      return all.filter((r) => ['SUBMITTED', 'IN_REVIEW'].includes(r.status));
    },
  });

  // Approve user registration
  const approveUserMutation = useMutation({
    mutationFn: async (userId) => {
      const user = pendingUsers.find((item) => item.id === userId);

      if (!user?.email) {
        throw new Error('Usuário sem e-mail válido.');
      }

      await base44.entities.UserRegistration.update(userId, {
        status: 'APROVADO',
        aprovado_em: new Date().toISOString(),
        acesso_liberado: true,
      });

      const email = normalizeEmail(user.email);
      const permissions = await base44.entities.UserPermission.filter({
        user_email: email,
      });
      const requestedRoleRaw = user.role || user.base_role || 'PROFISSIONAL';
      const requestedRole = requestedRoleRaw === 'PATROCINADOR' ? 'OBSERVADOR' : requestedRoleRaw;
      const sponsorDefaults = requestedRole === 'PATROCINADOR' || requestedRole === 'OBSERVADOR'
        ? {
            can_view_sponsor_dashboard: true,
            can_view_approved_reports: true,
            can_view_approved_programacao: true,
            can_view_public_gallery: true,
            can_view_budget_summary: true,
            can_view_project_kpis: true,
            must_submit_monthly_reports: false,
            funcao: 'Observador',
            equipe: 'Observador',
          }
        : {};

      const permissionData = {
        user_email: email,
        user_name: user.full_name || '',
        base_role: requestedRole,
        can_view_all_reports: false,
        can_review_reports: false,
        can_manage_users: false,
        can_manage_files: false,
        can_manage_platform: false,
        can_view_audit_log: false,
        can_manage_museus: false,
        can_manage_equipes: false,
        must_submit_monthly_reports: requestedRole === 'PATROCINADOR' || requestedRole === 'OBSERVADOR' ? false : true,
        gestao_compras: false,
        ...sponsorDefaults,
      };

      if (!permissions?.length) {
        await base44.entities.UserPermission.create(permissionData);
      } else {
        await base44.entities.UserPermission.update(permissions[0].id, permissionData);
      }

      const appUsers = await base44.entities.User.filter({ email }).catch(() => []);
      if (appUsers?.[0]?.id) {
        await base44.entities.User.update(appUsers[0].id, {
          role: requestedRole,
          full_name: user.full_name || appUsers[0].full_name,
          museu: user.museu || appUsers[0].museu,
          funcao: sponsorDefaults.funcao || user.funcao || appUsers[0].funcao,
          equipe: sponsorDefaults.equipe || user.equipe || appUsers[0].equipe,
        });
      }

      try {
        await base44.entities.AuditLog.create({
          action: 'APPROVE',
          entity_type: 'USER_REGISTRATION',
          entity_id: userId,
          actor_email: 'system',
          actor_name: 'Coordenador',
          details: `Usuário aprovado e liberado para acesso ao app: ${user.email}`,
        });
      } catch (error) {
        console.warn('Auditoria de aprovação de usuário não registrada:', error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      toast.success('Usuário aprovado e liberado para acesso ao app');
    },
    onError: (err) => toast.error('Erro ao aprovar: ' + (err?.message || 'erro desconhecido')),
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId) => {
      await base44.entities.Report.delete(reportId);
      await base44.entities.AuditLog.create({
        action: 'DELETE',
        entity_type: 'REPORT',
        entity_id: reportId,
        actor_email: 'system',
        actor_name: 'Coordenador',
        details: 'Relatório deletado via painel de aprovações',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-reports'] });
      toast.success('Relatório deletado com sucesso');
      setShowDeleteConfirm(null);
    },
    onError: (err) => toast.error('Erro ao deletar: ' + (err?.message || 'erro desconhecido')),
  });

  // Reject user registration
  const rejectUserMutation = useMutation({
    mutationFn: async (userId) => {
      const user = pendingUsers.find((item) => item.id === userId);

      await base44.entities.UserRegistration.update(userId, {
        status: 'REJEITADO',
        rejeitado_em: new Date().toISOString(),
        acesso_liberado: false,
      });

      if (user?.email) {
        await revokeUserAccess(user.email, {
          status: 'REJEITADO',
          origin: 'pending-approvals-reject',
          reason: 'Solicitação negada pela coordenação',
          full_name: user.full_name,
        });
      }

      try {
        await base44.entities.AuditLog.create({
          action: 'REJECT',
          entity_type: 'USER_REGISTRATION',
          entity_id: userId,
          actor_email: 'system',
          actor_name: 'Coordenador',
          details: `Solicitação de usuário rejeitada via painel de aprovações${user?.email ? `: ${user.email}` : ''}`,
        });
      } catch (error) {
        console.warn('Auditoria de rejeição de usuário não registrada:', error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      toast.success('Solicitação rejeitada');
    },
    onError: (err) => toast.error('Erro: ' + (err?.message || 'erro desconhecido')),
  });

  const totalPending = pendingUsers.length + pendingReports.length;

  if (totalPending === 0) {
    return null;
  }

  return (
    <div className="border-2 border-black rounded-2xl p-6 bg-black/5">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-black flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Painel de Aprovações ({totalPending})
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Usuários Pendentes */}
        {pendingUsers.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2 mb-4">
              <Users className="w-4 h-4" />
              Usuários Aguardando ({pendingUsers.length})
            </h3>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {pendingUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-white p-3 rounded-lg flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black truncate">{user.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {user.funcao} • {user.museu}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white text-xs"
                      onClick={() => approveUserMutation.mutate(user.id)}
                      disabled={approveUserMutation.isPending || rejectUserMutation.isPending}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      Aprovar
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 text-xs"
                      onClick={() => rejectUserMutation.mutate(user.id)}
                      disabled={rejectUserMutation.isPending || approveUserMutation.isPending}
                    >
                      Rejeitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relatórios Pendentes */}
        {pendingReports.length > 0 && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4" />
              Relatórios em Revisão ({pendingReports.length})
            </h3>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {pendingReports.map((report) => (
                <div key={report.id} className="bg-white p-3 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black">{report.author_name}</p>
                      <p className="text-xs text-gray-500">
                        {report.mes_referencia} {report.ano} • {report.museu}
                      </p>

                      <Badge
                        className="mt-1 text-xs"
                        style={{
                          background: STATUS_CONFIG[report.status]?.color,
                          color: STATUS_CONFIG[report.status]?.text,
                        }}
                      >
                        {STATUS_CONFIG[report.status]?.label}
                      </Badge>
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <Link to={createPageUrl(`ReportEditor?id=${report.id}`)}>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <Eye className="w-4 h-4 text-blue-600" />
                        </Button>
                      </Link>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setShowDeleteConfirm(report.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-gray-600">
            Tem certeza que deseja deletar este relatório? Esta ação não pode ser desfeita.
          </p>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              Cancelar
            </Button>

            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteReportMutation.mutate(showDeleteConfirm)}
              disabled={deleteReportMutation.isPending}
            >
              {deleteReportMutation.isPending ? 'Deletando...' : 'Deletar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
