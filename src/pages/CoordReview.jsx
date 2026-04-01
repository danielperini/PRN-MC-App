import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import RequireCoordinator from '../components/auth/RequireCoordinator';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Eye, CheckCircle, AlertCircle, Clock, Send,
  FileText, History, ChevronDown, ChevronUp
} from 'lucide-react';
import DebugPanel from '../components/reports/DebugPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toastMessages } from '@/lib/toastMessages';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', cardBg: 'bg-blue-50/30', icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700', cardBg: 'bg-amber-50/30', icon: Eye },
};

function CoordReviewInner() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  const [approveDialog, setApproveDialog] = useState({ open: false, report: null });
  const [returnDialog, setReturnDialog] = useState({ open: false, report: null });
  const [comment, setComment] = useState('');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['review-reports'],
    queryFn: () => base44.entities.Report.list('-created_date'),
  });

  const pending = reports.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status));

  const mutation = useMutation({
    mutationFn: async ({ id, action, comment }) => {
      const update = {};

      if (action === 'approve') {
        update.status = 'APPROVED';
        update.review_status = 'revisao_concluida';
        update.reviewer_name = user?.full_name || '';
        update.reviewer_email = user?.email || '';
      }

      if (action === 'return') {
        update.status = 'RETURNED';
        update.return_comment = comment || '';
      }

      await base44.entities.Report.update(id, update);

      await base44.entities.AuditLog.create({
        action: action === 'approve' ? 'APPROVE' : 'RETURN',
        entity_type: 'REPORT',
        entity_id: id,
        actor_email: user?.email || '',
        actor_name: user?.full_name || '',
        new_status: update.status,
        details: comment || '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['review-reports']);
      toastMessages.success('Ação realizada com sucesso');
    },
    onError: (e) => toastMessages.error(e?.message),
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
          {pending.map(report => {
            const cfg = STATUS_CONFIG[report.status];
            const Icon = cfg?.icon || FileText;

            return (
              <div key={report.id} className="border rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <Badge className={cfg?.color}>{cfg?.label}</Badge>
                  <span className="text-xs text-gray-400">{report.mes_referencia} {report.ano}</span>
                </div>

                <h2 className="font-medium">{report.author_name}</h2>
                <p className="text-sm text-gray-500">{report.museu}</p>

                <div className="flex gap-2 mt-4">
                  <Link to={createPageUrl(`ReportEditor?id=${report.id}`)}>
                    <Button size="sm" variant="outline">
                      <Eye className="w-4 h-4 mr-1" /> Ver
                    </Button>
                  </Link>

                  {report.status === 'SUBMITTED' && (
                    <Button
                      size="sm"
                      onClick={() => mutation.mutate({ id: report.id, action: 'approve' })}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" /> Aprovar direto
                    </Button>
                  )}

                  {report.status === 'IN_REVIEW' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReturnDialog({ open: true, report })}
                      >
                        <AlertCircle className="w-4 h-4 mr-1" /> Devolver
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => setApproveDialog({ open: true, report })}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Aprovar */}
      <Dialog open={approveDialog.open} onOpenChange={() => setApproveDialog({ open: false, report: null })}>
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
                mutation.mutate({
                  id: approveDialog.report.id,
                  action: 'approve',
                  comment,
                });
                setApproveDialog({ open: false, report: null });
                setComment('');
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Devolver */}
      <Dialog open={returnDialog.open} onOpenChange={() => setReturnDialog({ open: false, report: null })}>
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
                mutation.mutate({
                  id: returnDialog.report.id,
                  action: 'return',
                  comment,
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
