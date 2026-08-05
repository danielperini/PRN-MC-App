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
  Images,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const APP_URL = window.location.origin;
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
  // Feedback da sincronização de fotos na galeria após aprovação
  const [syncFeedback, setSyncFeedback] = useState(null); // { reportId, fotos, erro, pendente }

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['review-reports'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Report.list('-created_date');
        return Array.isArray(data) ? data : [];
      } catch { return []; }
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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

        // Dispara e-mail de aprovação para o autor
        const authorEmail = report.author_email || report.created_by || updatedReport.created_by || '';
        if (authorEmail) {
          base44.functions.invoke('notifyReportApprovedEmail', {
            report_id: id,
            author_email: authorEmail,
            author_name: report.author_name || '',
            mes_referencia: report.mes_referencia || '',
            museu: report.museu || '',
            reviewer_name: user?.full_name || '',
          }).catch(e => console.warn('Falha ao enviar e-mail de aprovação:', e));
        }

        // Sincroniza fotos do relatório aprovado na galeria central (ReportPhoto)
        // em background, reutilizando a função backend existente. Não bloqueia
        // o fluxo de aprovação — feedback é exibido via banner/toast.
        setSyncFeedback({ reportId: id, pendente: true });
        base44.functions.invoke('publicarFotosRelatorioAprovado', { report_id: id })
          .then((res) => {
            const data = res?.data || {};
            const criadas = Number(data.fotos_criadas || 0);
            const atualizadas = Number(data.fotos_atualizadas || 0);
            const erros = Array.isArray(data.erros) ? data.erros : [];
            const total = criadas + atualizadas;
            if (erros.length > 0 && total === 0) {
              setSyncFeedback({ reportId: id, erro: true });
              toast.warning('Sincronização de fotos pendente — verifique os logs.');
            } else if (total === 0) {
              setSyncFeedback({ reportId: id, fotos: 0 });
            } else {
              setSyncFeedback({ reportId: id, fotos: total });
              toast.success(`${total} ${total === 1 ? 'foto sincronizada' : 'fotos sincronizadas'} na galeria.`);
            }
          })
          .catch((err) => {
            console.warn('Falha ao sincronizar fotos do relatório aprovado:', err);
            setSyncFeedback({ reportId: id, erro: true });
            toast.warning('Sincronização de fotos pendente — tente novamente pela Galeria.');
          });
      }

      if (action === 'return') {
        const returnedReport = { ...report, ...updatedReport, return_comment: comment || '' };
        await notifyReportReturned(returnedReport, user).catch((error) => {
          console.warn('Falha ao notificar devolução de relatório:', error);
        });

        // Criar Notification no sino do profissional
        const authorEmail = returnedReport.author_email || returnedReport.created_by || '';
        if (authorEmail) {
          const mesMuseu = [returnedReport.mes_referencia, returnedReport.museu].filter(Boolean).join(' — ');
          const appLink = `/Relatorios`;
          try {
            await base44.entities.Notification.create({
              user_email: authorEmail,
              type: 'REPORT_RETURNED',
              title: 'Relatório devolvido',
              message: `${mesMuseu}\n\nMotivo: ${comment || ''}`,
              entity_type: 'Report',
              entity_id: id,
              action_url: appLink,
              read: false,
              resolved: false,
              email_sent: false,
            });
          } catch (notifErr) {
            console.warn('Falha ao criar Notification de devolução:', notifErr);
          }
        }
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
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-black tracking-tight">Revisão de Relatórios</h1>
        <p className="text-sm text-gray-500 mt-0.5">{pending.length} relatório{pending.length !== 1 ? 's' : ''} aguardando revisão</p>
      </div>

      {syncFeedback && (
        <div
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            syncFeedback.erro
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : syncFeedback.pendente
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
        >
          {syncFeedback.erro ? (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : syncFeedback.pendente ? (
            <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            {syncFeedback.erro ? (
              <span>⚠ Sincronização de fotos pendente — dispare novamente pela Galeria.</span>
            ) : syncFeedback.pendente ? (
              <span>Sincronizando fotos do relatório aprovado na galeria...</span>
            ) : syncFeedback.fotos === 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Images className="h-3.5 w-3.5" />
                Relatório aprovado sem fotos — nada a sincronizar na galeria.
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Images className="h-3.5 w-3.5" />
                ✓ {syncFeedback.fotos} {syncFeedback.fotos === 1 ? 'foto sincronizada' : 'fotos sincronizadas'} na galeria.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : pending.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="font-medium text-gray-700">Nenhum relatório pendente</p>
          <p className="text-sm text-gray-400 mt-1">Todos os relatórios foram revisados.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pending.map((report) => {
            const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.SUBMITTED;
            const Icon = cfg?.icon || FileText;

            return (
              <div key={report.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
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