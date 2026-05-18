import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import RequireCoordinator from '../components/auth/RequireCoordinator';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Eye,
  CheckCircle,
  AlertCircle,
  Send,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toastMessages } from '@/lib/toastMessages';
import { notifyReportApproved, notifyReportReturned } from '@/services/notifications/reportNotifications';

const STATUS_CONFIG = {
  SUBMITTED: {
    label: 'Enviado',
    color: 'bg-blue-100 text-blue-700',
    icon: Send,
  },
  IN_REVIEW: {
    label: 'Em Revisão',
    color: 'bg-amber-100 text-amber-700',
    icon: Eye,
  },
  RETURNED: {
    label: 'Devolvido',
    color: 'bg-red-100 text-red-700',
    icon: AlertCircle,
  },
  APPROVED: {
    label: 'Aprovado',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle,
  },
};

function CoordReviewInner() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  const [approveDialog, setApproveDialog] = useState({ open: false, report: null });
  const [returnDialog, setReturnDialog] = useState({ open: false, report: null });
  const [reviewDialog, setReviewDialog] = useState({ open: false, report: null });
  const [comment, setComment] = useState('');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['review-reports'],
    queryFn: () => base44.entities.Report.list('-created_date'),
  });

  const pending = useMemo(
    () => reports.filter((r) => ['SUBMITTED', 'IN_REVIEW'].includes(r.status)),
    [reports]
  );

  const mutation = useMutation({
    mutationFn: async ({ id, action, comment, report }) => {
      const update = {};

      if (action === 'start_review') {
        update.status = 'IN_REVIEW';
        update.review_status = 'em_revisao';
        update.reviewer_name = user?.full_name || '';
        update.reviewer_email = user?.email || '';
      }

      if (action === 'approve') {
        update.status = 'APPROVED';
        update.review_status = 'revisao_concluida';
        update.reviewer_name = user?.full_name || '';
        update.reviewer_email = user?.email || '';
        update.review_comment = comment || '';
        update.approved_at = new Date().toISOString();
      }

      if (action === 'return') {
        update.status = 'RETURNED';
        update.review_status = 'devolvido';
        update.return_comment = comment || '';
        update.reviewer_name = user?.full_name || '';
        update.reviewer_email = user?.email || '';
      }

      const updatedReport = await base44.entities.Report.update(id, update);

      if (action === 'approve') {
        await notifyReportApproved({
          ...report,
          ...updatedReport,
        }, user).catch((error) => {
          console.warn('Falha ao notificar aprovação de relatório:', error);
        });
      }

      if (action === 'return') {
        await notifyReportReturned({
          ...report,
          ...updatedReport,
          return_comment: comment || '',
        }, user).catch((error) => {
          console.warn('Falha ao notificar devolução de relatório:', error);
        });
      }

      try {
        await base44.entities.AuditLog.create({
          action:
            action === 'approve'
              ? 'APPROVE'
              : action === 'return'
              ? 'RETURN'
              : 'START_REVIEW',
          entity_type: 'REPORT',
          entity_id: id,
          actor_email: user?.email || '',
          actor_name: user?.full_name || '',
          new_status: update.status,
          details: comment || '',
        });
      } catch (_err) {
        // não bloqueia o fluxo se o AuditLog falhar
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-reports'] });
      toastMessages.approveSuccess();
    },
    onError: (e) => toastMessages.createFailed(e?.message || 'Erro ao processar ação'),
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Revisão de Relatórios</h1>

      {isLoading ? (
        <p>Carregando...</p>
      ) : pending.length === 0 ? (
        <p>Nenhum relatório pendente</p>
      ) : (
        <div className="grid gap-4">
          {pending.map((report) => {
            const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.SUBMITTED;
            const Icon = cfg?.icon || FileText;

            return (
              <div key={report.id} className="border rounded-lg p-4 bg-white">
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <Badge className={cfg.color}>
                    <Icon className="w-3.5 h-3.5 mr-1" />
                    {cfg.label}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {report.mes_referencia} {report.ano}
                  </span>
                </div>

                <h2 className="font-medium">{report.author_name || report.created_by || 'Sem autor'}</h2>
                <p className="text-sm text-gray-500">{report.museu || 'Museu não informado'}</p>

                {report.return_comment && (
                  <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    Último retorno: {report.return_comment}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  <Link to={createPageUrl(`ReportEditor?id=${report.id}`)}>
                    <Button size="sm" variant="outline">
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                  </Link>

                  {report.status === 'SUBMITTED' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          mutation.mutate({
                            id: report.id,
                            action: 'start_review',
                            report,
                          });
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Iniciar revisão
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => setApproveDialog({ open: true, report })}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Aprovar direto
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReturnDialog({ open: true, report })}
                      >
                        <AlertCircle className="w-4 h-4 mr-1" />
                        Devolver
                      </Button>
                    </>
                  )}

                  {report.status === 'IN_REVIEW' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReturnDialog({ open: true, report })}
                      >
                        <AlertCircle className="w-4 h-4 mr-1" />
                        Devolver
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => setApproveDialog({ open: true, report })}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Aprovar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={approveDialog.open}
        onOpenChange={(open) => {
          setApproveDialog({ open, report: open ? approveDialog.report : null });
          if (!open) setComment('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar relatório</DialogTitle>
          </DialogHeader>

          <Textarea
            placeholder="Comentário opcional"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <DialogFooter>
            <Button
              onClick={() => {
                if (!approveDialog.report?.id) return;
                mutation.mutate({
                  id: approveDialog.report.id,
                  action: 'approve',
                  comment,
                  report: approveDialog.report,
                });
                setApproveDialog({ open: false, report: null });
                setComment('');
              }}
            >
              Confirmar aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={returnDialog.open}
        onOpenChange={(open) => {
          setReturnDialog({ open, report: open ? returnDialog.report : null });
          if (!open) setComment('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver relatório</DialogTitle>
          </DialogHeader>

          <Textarea
            placeholder="Motivo da devolução"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                if (!returnDialog.report?.id) return;
                mutation.mutate({
                  id: returnDialog.report.id,
                  action: 'return',
                  comment,
                  report: returnDialog.report,
                });
                setReturnDialog({ open: false, report: null });
                setComment('');
              }}
            >
              Confirmar devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CoordReview() {
  return (
    <RequireAuth>
      <RequireCoordinator>
        <CoordReviewInner />
      </RequireCoordinator>
    </RequireAuth>
  );
}
