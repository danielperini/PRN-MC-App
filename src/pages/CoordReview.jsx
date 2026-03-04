import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Eye, CheckCircle, AlertCircle, Clock, Send,
  FileText, History, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700',   cardBg: 'bg-blue-50/30',   icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700', cardBg: 'bg-amber-50/30',  icon: Eye },
};

const REVIEW_STATUS_CONFIG = {
  aguardando_revisao: { label: 'Aguardando Revisão', color: 'text-blue-600', bg: 'bg-blue-50' },
  revisao_concluida: { label: 'Revisão Concluída', color: 'text-amber-600', bg: 'bg-amber-50' },
  aguardando_aprovacao_final: { label: 'Aguardando Aprovação Final', color: 'text-purple-600', bg: 'bg-purple-50' },
};

const SECOES = [
  { key: 'identificacao', label: 'Identificação' },
  { key: 'atividades',    label: 'Atividades Executadas' },
  { key: 'avaliacao',     label: 'Avaliação do Mês' },
];

function ReturnDialog({ open, onClose, report, onConfirm, isPending }) {
  const [comments, setComments] = useState({ identificacao: '', atividades: '', avaliacao: '', geral: '' });

  const hasAnyComment = Object.values(comments).some(v => v.trim());

  const handleConfirm = () => {
    if (!hasAnyComment) { toast.error('Informe pelo menos um comentário de devolução'); return; }
    onConfirm(comments);
    setComments({ identificacao: '', atividades: '', avaliacao: '', geral: '' });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Devolver Relatório</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {report?.author_name} — {report?.mes_referencia} {report?.ano}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            Adicione comentários nas seções que precisam de correção. Pelo menos um comentário é obrigatório.
          </p>

          {SECOES.map(secao => (
            <div key={secao.key} className="space-y-1.5">
              <Label className="text-sm font-medium">{secao.label}</Label>
              <Textarea
                rows={2}
                placeholder={`Comentários sobre ${secao.label.toLowerCase()}...`}
                value={comments[secao.key]}
                onChange={e => setComments(p => ({ ...p, [secao.key]: e.target.value }))}
                className="text-sm resize-none"
              />
            </div>
          ))}

          <div className="space-y-1.5 border-t pt-4">
            <Label className="text-sm font-medium text-red-700">Comentário Geral <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <Textarea
              rows={3}
              placeholder="Observações gerais sobre a devolução..."
              value={comments.geral}
              onChange={e => setComments(p => ({ ...p, geral: e.target.value }))}
              className="text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleConfirm}
            disabled={isPending || !hasAnyComment}
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            Confirmar Devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ open, onClose, report, onConfirm, isPending }) {
  const [note, setNote] = useState('');

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aprovar Relatório</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {report?.author_name} — {report?.mes_referencia} {report?.ano}
          </p>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <Label className="text-sm">Observação do coordenador <span className="text-gray-400">(opcional)</span></Label>
          <Textarea
            rows={3}
            placeholder="Parabéns pelo trabalho, observações finais..."
            value={note}
            onChange={e => setNote(e.target.value)}
            className="text-sm resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => { onConfirm(note); setNote(''); }}
            disabled={isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Confirmar Aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditEntry({ log }) {
  const [expanded, setExpanded] = useState(false);

  const actionColors = {
    APPROVE: 'bg-emerald-100 text-emerald-700',
    RETURN:  'bg-red-100 text-red-700',
    START_REVIEW: 'bg-amber-100 text-amber-700',
    SUBMIT: 'bg-blue-100 text-blue-700',
  };
  const actionLabels = {
    APPROVE: 'Aprovado',
    RETURN:  'Devolvido',
    START_REVIEW: 'Revisão Iniciada',
    SUBMIT: 'Enviado',
  };

  const color = actionColors[log.action] || 'bg-gray-100 text-gray-700';
  const label = actionLabels[log.action] || log.action;
  const hasDetails = log.details && log.details.length > 60;

  return (
    <div className="flex gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="flex-shrink-0 mt-0.5">
        <Badge className={`${color} text-xs font-normal`}>{label}</Badge>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-black">{log.actor_name || log.actor_email}</p>
            <p className="text-xs text-gray-500">
              {log.created_date ? format(new Date(log.created_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR }) : '—'}
            </p>
          </div>
          {log.details && (
            <button className="text-gray-400 hover:text-gray-600 flex-shrink-0" onClick={() => setExpanded(p => !p)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
        {log.details && expanded && (
          <p className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded-lg whitespace-pre-wrap">{log.details}</p>
        )}
        {log.details && !expanded && hasDetails && (
          <p className="text-xs text-gray-400 mt-1 truncate">{log.details}</p>
        )}
        {log.details && !hasDetails && (
          <p className="text-xs text-gray-600 mt-1">{log.details}</p>
        )}
      </div>
    </div>
  );
}

function CoordReviewInner() {
   const queryClient = useQueryClient();
   const { user } = useCurrentUser();
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterMuseu, setFilterMuseu]   = useState('all');
    const [filterReviewStatus, setFilterReviewStatus] = useState('all');
    const [returnDialog, setReturnDialog] = useState({ open: false, report: null });
    const [approveDialog, setApproveDialog] = useState({ open: false, report: null });
    const [delegateDialog, setDelegateDialog] = useState({ open: false, report: null, selectedCoord: '' });

   const isComunicacao = user?.role === 'COORD_COMUNICACAO';

   const { data: reports = [], isLoading } = useQuery({
     queryKey: ['review-reports'],
     queryFn: () => base44.entities.Report.list('-created_date'),
   });

   const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
      queryKey: ['audit-approvals'],
      queryFn: () => base44.entities.AuditLog.filter({ entity_type: 'REPORT' }, '-created_date', 100),
    });

    const { data: allCoords = [] } = useQuery({
      queryKey: ['coordinators'],
      queryFn: () => base44.asServiceRole.entities.User.filter({ role: 'COORDENADOR' }),
    });

    const pending = reports.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status));
    const museus  = [...new Set(pending.map(r => r.museu).filter(Boolean))];

   const filtered = pending.filter(r => {
     if (filterStatus !== 'all' && r.status !== filterStatus) return false;
     if (filterMuseu !== 'all' && r.museu !== filterMuseu) return false;
     if (filterReviewStatus !== 'all' && (r.review_status || 'aguardando_revisao') !== filterReviewStatus) return false;
     return true;
   });

  const workflowMutation = useMutation({
    mutationFn: async ({ id, status, returnComments, approvalNote }) => {
      const update = { status };

      if (status === 'RETURNED' && returnComments) {
        // Store per-section comments as JSON in return_comment
        const lines = [];
        if (returnComments.identificacao) lines.push(`[Identificação]\n${returnComments.identificacao}`);
        if (returnComments.atividades)    lines.push(`[Atividades Executadas]\n${returnComments.atividades}`);
        if (returnComments.avaliacao)     lines.push(`[Avaliação do Mês]\n${returnComments.avaliacao}`);
        if (returnComments.geral)         lines.push(`[Geral]\n${returnComments.geral}`);
        update.return_comment = lines.join('\n\n');
      }

      if (status === 'APPROVED') {
        update.reviewer_name  = user?.full_name || '';
        update.reviewer_email = user?.email || '';
        update.review_status = 'revisao_concluida';
      } else if (status === 'IN_REVIEW') {
        update.review_status = 'aguardando_aprovacao_final';
      }

      const report = reports.find(r => r.id === id);
      await base44.entities.Report.update(id, update);

      // Audit log
      let logDetails = '';
      if (status === 'APPROVED') {
        logDetails = `Aprovado por ${user?.full_name || user?.email || '—'}` +
          (approvalNote ? `\nObservação: ${approvalNote}` : '');
      } else if (status === 'RETURNED') {
        const lines = [];
        if (returnComments?.identificacao) lines.push(`Identificação: ${returnComments.identificacao}`);
        if (returnComments?.atividades)    lines.push(`Atividades: ${returnComments.atividades}`);
        if (returnComments?.avaliacao)     lines.push(`Avaliação: ${returnComments.avaliacao}`);
        if (returnComments?.geral)         lines.push(`Geral: ${returnComments.geral}`);
        logDetails = lines.join('\n');
      } else if (status === 'IN_REVIEW') {
        logDetails = `Revisão assumida por ${user?.full_name || user?.email || '—'}`;
      }

      const actionMap = { APPROVED: 'APPROVE', RETURNED: 'RETURN', IN_REVIEW: 'START_REVIEW' };
      await base44.entities.AuditLog.create({
        action: actionMap[status] || 'UPDATE',
        entity_type: 'REPORT',
        entity_id: id,
        actor_email: user?.email || '',
        actor_name: user?.full_name || '',
        previous_status: report?.status,
        new_status: status,
        details: logDetails,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['review-reports']);
      queryClient.invalidateQueries(['audit-approvals']);
      const msgs = { IN_REVIEW: 'Revisão iniciada', APPROVED: 'Relatório aprovado!', RETURNED: 'Relatório devolvido' };
      toast.success(msgs[vars.status] || 'Status atualizado');
    },
    onError: (err) => toast.error('Erro: ' + (err?.message || 'tente novamente')),
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight">Revisão da Coordenação</h1>
          <p className="text-gray-500 mt-1">{pending.length} relatório(s) pendente(s) de revisão</p>
        </div>

        <Tabs defaultValue="pendentes">
          <TabsList className="mb-6">
            <TabsTrigger value="pendentes">
              Pendentes
              {pending.length > 0 && (
                <span className="ml-2 bg-black text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="log">
              <History className="w-4 h-4 mr-1.5" />Log de Aprovações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pendentes">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-6">
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

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                <div className="col-span-full text-center py-20 text-gray-400">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="col-span-full text-center py-20 border border-dashed border-gray-200 rounded-2xl">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum relatório pendente</p>
                </div>
              ) : filtered.map(report => {
                const cfg = STATUS_CONFIG[report.status];
                const Icon = cfg?.icon || FileText;
                const nAtiv = (report.atividades || []).length;
                return (
                  <div key={report.id} className={`p-5 rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all ${cfg?.cardBg || 'bg-white'}`}>
                    <div className="flex items-center justify-between mb-4">
                      {cfg && <Badge className={`${cfg.color} font-normal gap-1`}><Icon className="w-3 h-3" />{cfg.label}</Badge>}
                      <span className="text-xs text-gray-400">{report.mes_referencia} {report.ano}</span>
                    </div>
                    <h3 className="font-semibold text-black text-base leading-tight">{report.author_name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{report.museu}{report.equipe ? ` · ${report.equipe}` : ''}</p>
                    {nAtiv > 0 && <p className="text-xs text-gray-400 mt-1">{nAtiv} atividade{nAtiv > 1 ? 's' : ''}</p>}

                    <div className="flex gap-2 mt-4 flex-wrap">
                      <Link to={createPageUrl(`ReportEditor?id=${report.id}`)}>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Eye className="w-3.5 h-3.5" />Ver
                        </Button>
                      </Link>
                      {report.status === 'SUBMITTED' && (!isComunicacao || report.funcao === 'Comunicador') && (
                        <Button size="sm" variant="outline" className="border-black gap-1"
                          onClick={() => workflowMutation.mutate({ id: report.id, status: 'IN_REVIEW' })}
                          disabled={workflowMutation.isPending}>
                          Assumir Revisão
                        </Button>
                      )}
                      {report.status === 'IN_REVIEW' && (!isComunicacao || report.funcao === 'Comunicador') && (
                        <>
                          <Button size="sm" variant="outline" className="border-red-300 text-red-600 gap-1"
                            onClick={() => setReturnDialog({ open: true, report })}>
                            <AlertCircle className="w-3.5 h-3.5" />Devolver
                          </Button>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            onClick={() => setApproveDialog({ open: true, report })}>
                            <CheckCircle className="w-3.5 h-3.5" />Aprovar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="log">
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-black mb-4">Log de Aprovações e Ações</h2>
              {logsLoading ? (
                <p className="text-gray-400 text-sm">Carregando...</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-gray-400 text-sm">Nenhum registro encontrado.</p>
              ) : (
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 px-4">
                  {auditLogs.map(log => (
                    <AuditEntry key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ReturnDialog
        open={returnDialog.open}
        report={returnDialog.report}
        onClose={() => setReturnDialog({ open: false, report: null })}
        isPending={workflowMutation.isPending}
        onConfirm={(comments) => {
          workflowMutation.mutate({ id: returnDialog.report.id, status: 'RETURNED', returnComments: comments });
          setReturnDialog({ open: false, report: null });
        }}
      />

      <ApproveDialog
        open={approveDialog.open}
        report={approveDialog.report}
        onClose={() => setApproveDialog({ open: false, report: null })}
        isPending={workflowMutation.isPending}
        onConfirm={(note) => {
          workflowMutation.mutate({ id: approveDialog.report.id, status: 'APPROVED', approvalNote: note });
          setApproveDialog({ open: false, report: null });
        }}
      />
    </div>
  );
}

export default function CoordReview() {
  return <RequireAuth requireRole="COORDENADOR"><CoordReviewInner /></RequireAuth>;
}