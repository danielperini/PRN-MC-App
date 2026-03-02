import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Eye, CheckCircle, AlertCircle, ChevronRight, 
  FileText, Clock, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700',   cardBg: 'bg-blue-50/40',   icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700', cardBg: 'bg-amber-50/40',  icon: Eye },
};

function CoordReviewInner() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMuseu, setFilterMuseu] = useState('all');
  const [returnDialog, setReturnDialog] = useState({ open: false, reportId: null, report: null });
  const [returnComment, setReturnComment] = useState('');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['review-reports'],
    queryFn: () => base44.entities.Report.list('-created_date'),
  });

  const pending = reports.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status));

  const filtered = pending.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterMuseu !== 'all' && r.museu !== filterMuseu) return false;
    return true;
  });

  const museus = [...new Set(pending.map(r => r.museu).filter(Boolean))];

  const workflowMutation = useMutation({
    mutationFn: async ({ id, status, comment }) => {
      if (!id) throw new Error('ID do relatório inválido');
      const update = { status };
      if (comment) update.return_comment = comment;
      return base44.entities.Report.update(id, update);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['review-reports']);
      const msgs = {
        IN_REVIEW: 'Revisão iniciada',
        APPROVED: 'Relatório aprovado',
        RETURNED: 'Relatório devolvido',
        ARCHIVED: 'Relatório arquivado',
      };
      toast.success(msgs[vars.status] || 'Status atualizado');
    },
    onError: (err) => toast.error('Erro ao atualizar relatório: ' + (err?.message || 'tente novamente')),
  });

  const handleReturn = () => {
    if (!returnComment.trim()) { toast.error('Informe o motivo da devolução'); return; }
    workflowMutation.mutate({ 
      id: returnDialog.reportId, 
      status: 'RETURNED', 
      comment: returnComment 
    });
    setReturnDialog({ open: false, reportId: null });
    setReturnComment('');
  };

  return (<div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-black tracking-tight">
            Revisão da Coordenação
          </h1>
          <p className="text-gray-500 mt-1">
            Relatórios aguardando revisão ou em revisão — {pending.length} pendente(s)
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-8 text-sm border-gray-200">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Status —</SelectItem>
              <SelectItem value="SUBMITTED">Enviado</SelectItem>
              <SelectItem value="IN_REVIEW">Em Revisão</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterMuseu} onValueChange={setFilterMuseu}>
            <SelectTrigger className="w-44 h-8 text-sm border-gray-200">
              <SelectValue placeholder="Museu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Museu —</SelectItem>
              {museus.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Cards grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full text-center py-20 text-gray-400">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum relatório pendente de revisão</p>
            </div>
          ) : (
            filtered.map(report => {
              const cfg = STATUS_CONFIG[report.status];
              const Icon = cfg?.icon || FileText;
              const nAtiv = (report.atividades || []).length;
              return (
                <div key={report.id} className={`p-5 rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all ${cfg?.cardBg || 'bg-white'}`}>
                  {/* Status + date */}
                  <div className="flex items-center justify-between mb-4">
                    {cfg && (
                      <Badge className={`${cfg.color} font-normal gap-1`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </Badge>
                    )}
                    <span className="text-xs text-gray-400">{report.mes_referencia} {report.ano}</span>
                  </div>

                  {/* Info */}
                  <h3 className="font-semibold text-black text-base leading-tight">{report.author_name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{report.museu}{report.equipe ? ` · ${report.equipe}` : ''}</p>
                  {nAtiv > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{nAtiv} atividade{nAtiv > 1 ? 's' : ''}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <Link to={createPageUrl(`ReportEditor?id=${report.id}`)}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Eye className="w-3.5 h-3.5" />Ver
                      </Button>
                    </Link>
                    {report.status === 'SUBMITTED' && (
                      <Button size="sm" variant="outline" className="border-black gap-1"
                        onClick={() => workflowMutation.mutate({ id: report.id, status: 'IN_REVIEW' })}
                        disabled={workflowMutation.isPending}>
                        Assumir Revisão
                      </Button>
                    )}
                    {report.status === 'IN_REVIEW' && (
                      <>
                        <Button size="sm" variant="outline" className="border-red-300 text-red-600 gap-1"
                          onClick={() => setReturnDialog({ open: true, reportId: report.id, report })}>
                          <AlertCircle className="w-3.5 h-3.5" />Devolver
                        </Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                          onClick={() => workflowMutation.mutate({ id: report.id, status: 'APPROVED' })}
                          disabled={workflowMutation.isPending}>
                          <CheckCircle className="w-3.5 h-3.5" />Aprovar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Return Dialog */}
      <Dialog open={returnDialog.open} onOpenChange={o => setReturnDialog(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver Relatório</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Motivo da devolução <span className="text-red-500">*</span></Label>
            <Textarea
              className="mt-2"
              rows={4}
              placeholder="Descreva o motivo e o que precisa ser corrigido..."
              value={returnComment}
              onChange={e => setReturnComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialog({ open: false, reportId: null })}>
              Cancelar
            </Button>
            <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleReturn}>
              Confirmar Devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CoordReview() {
  return <RequireAuth requireRole="COORDENADOR"><CoordReviewInner /></RequireAuth>;
}