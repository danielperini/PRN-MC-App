import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  AlertCircle, CheckCircle, Trash2, Edit, Eye, Download,
  ChevronRight, Lock, FileText, Users
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Enviado', color: '#dbeafe', text: '#1d4ed8' },
  IN_REVIEW: { label: 'Em Revisão', color: '#fef9c3', text: '#92400e' },
  PENDING: { label: 'Aguardando', color: '#fef9c3', text: '#92400e' },
};

export default function PendingApprovalsPanel() {
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState(null);
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
      return all.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status));
    },
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
    onError: (err) => toast.error('Erro ao deletar: ' + err.message),
  });

  // Reject user registration
  const rejectUserMutation = useMutation({
    mutationFn: async (userId) => {
      await base44.entities.UserRegistration.update(userId, { status: 'REJEITADO' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      toast.success('Solicitação rejeitada');
    },
    onError: (err) => toast.error('Erro: ' + err.message),
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
              {pendingUsers.map(user => (
                <div key={user.id} className="bg-white p-3 rounded-lg flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black truncate">{user.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {user.funcao} • {user.museu}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 text-xs ml-2 flex-shrink-0"
                    onClick={() => rejectUserMutation.mutate(user.id)}
                    disabled={rejectUserMutation.isPending}
                  >
                    Rejeitar
                  </Button>
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
              {pendingReports.map(report => (
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