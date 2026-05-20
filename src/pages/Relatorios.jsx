import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import {
  Plus,
  FileText,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  BarChart2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import LoadingPage from '@/components/common/LoadingPage';
import { toastMessages } from '@/lib/toastMessages';
import { notifyReportReturned } from '@/services/notifications/reportNotifications';

const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600', icon: Clock },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700', icon: Eye },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  ARCHIVED: { label: 'Arquivado', color: 'bg-slate-100 text-slate-600', icon: FileText },
};

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];
const REPORTS_CACHE_KEY = 'relatorios_list_cache_v1';

function readReportsCache() {
  try {
    const raw = localStorage.getItem(REPORTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReportsCache(reports = []) {
  try {
    localStorage.setItem(REPORTS_CACHE_KEY, JSON.stringify(Array.isArray(reports) ? reports : []));
  } catch {
    // noop
  }
}

export default function Relatorios() {
  const queryClient = useQueryClient();
  const { user, isLoading: userLoading, isCoordenador } = useCurrentUser();
  const [filterMuseu, setFilterMuseu] = useState('todos');
  const [filterMes, setFilterMes] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [returnDialog, setReturnDialog] = useState({ open: false, report: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, report: null });
  const [returnComment, setReturnComment] = useState('');
  const [cachedReports, setCachedReports] = useState(() => readReportsCache());

  const isAdmin = user?.role === 'admin';

  const returnReportMutation = useMutation({
    mutationFn: async ({ report, comment }) => {
      const update = {
        status: 'RETURNED',
        review_status: 'devolvido',
        return_comment: comment || '',
        reviewer_name: user?.full_name || '',
        reviewer_email: user?.email || '',
      };

      const updatedReport = await base44.entities.Report.update(report.id, update);

      await notifyReportReturned(
        {
          ...report,
          ...updatedReport,
          return_comment: comment || '',
        },
        user
      ).catch((error) => {
        console.warn('Falha ao notificar devolução de relatório:', error);
      });

      try {
        await base44.entities.AuditLog.create({
          action: 'RETURN',
          entity_type: 'REPORT',
          entity_id: report.id,
          actor_email: user?.email || '',
          actor_name: user?.full_name || '',
          previous_status: report.status || '',
          new_status: 'RETURNED',
          details: comment || '',
        });
      } catch (_error) {
        // Não bloqueia a atualização do relatório se o AuditLog falhar.
      }

      return updatedReport;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-list'] });
      toastMessages.updateSuccess();
      setReturnDialog({ open: false, report: null });
      setReturnComment('');
    },
    onError: (error) => {
      toastMessages.updateFailed(error?.message || 'Erro ao devolver relatório.');
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (report) => {
      await base44.entities.Report.delete(report.id);

      try {
        await base44.entities.AuditLog.create({
          action: 'DELETE',
          entity_type: 'REPORT',
          entity_id: report.id,
          actor_email: user?.email || '',
          actor_name: user?.full_name || '',
          previous_status: report.status || '',
          details: `Relatório excluído por coordenação: ${report.author_name || report.created_by || report.id}`,
        });
      } catch (_error) {
        // Não bloqueia a exclusão do relatório se o AuditLog falhar.
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-list'] });
      toastMessages.deleteSuccess();
      setDeleteDialog({ open: false, report: null });
    },
    onError: (error) => {
      toastMessages.deleteFailed(error?.message || 'Erro ao excluir relatório.');
    },
  });

  const {
    data: reports = [],
    isLoading,
    isError,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['relatorios-list'],
    queryFn: async () => {
      const data = await base44.entities.Report.list('-created_date', 200);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user?.email,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      const msg = String(err?.message || '').toLowerCase();
      const retryable = msg.includes('rate limit') || msg.includes('429') || msg.includes('network') || msg.includes('timeout');
      return retryable ? failureCount < 5 : failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(800 * (2 ** attempt), 8000),
  });

  useEffect(() => {
    if (Array.isArray(reports) && reports.length > 0) {
      setCachedReports(reports);
      saveReportsCache(reports);
    }
  }, [reports]);

  const effectiveReports = useMemo(() => {
    if (Array.isArray(reports) && reports.length > 0) return reports;
    if (isError && Array.isArray(cachedReports) && cachedReports.length > 0) return cachedReports;
    return Array.isArray(reports) ? reports : [];
  }, [reports, isError, cachedReports]);

  const myReports = useMemo(() => {
    if (isAdmin || isCoordenador) return effectiveReports;
    return effectiveReports.filter((report) => report.created_by === user?.email);
  }, [effectiveReports, user, isAdmin, isCoordenador]);

  const filtered = useMemo(() => {
    return myReports.filter((report) => {
      if (filterMuseu !== 'todos' && report.museu !== filterMuseu) return false;
      if (filterMes !== 'todos' && report.mes_referencia !== filterMes) return false;
      if (filterStatus !== 'todos' && report.status !== filterStatus) return false;
      return true;
    });
  }, [myReports, filterMuseu, filterMes, filterStatus]);

  const isInitialPageLoading = userLoading || (!!user?.email && isLoading);
  const hasCachedFallback = isError && cachedReports.length > 0;

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando os relatórios mensais, filtros e dados do usuário. Aguarde alguns instantes."
      />
    );
  }

  if (isError && !hasCachedFallback) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar os relatórios"
        errorDescription="Atualize a página ou tente novamente em alguns instantes."
      />
    );
  }

  return (
    <>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Relatórios Mensais
            </h1>

            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} relatório{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isCoordenador ? <Link to="/RelatorioFisicoFinanceiro">
              <Button variant="outline" className="gap-2">
                <BarChart2 className="h-4 w-4" />
                Gerador de Relatório
              </Button>
            </Link> : null}

            <Link to="/ReportEditor?novo=1">
              <Button className="gap-2 bg-black text-white hover:bg-gray-900">
                <Plus className="h-4 w-4" />
                Novo Relatório
              </Button>
            </Link>
          </div>
        </div>

        {isFetching && !isLoading && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Atualizando relatórios...
          </div>
        )}

        {hasCachedFallback && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Exibindo a ultima lista salva por instabilidade temporaria na carga em tempo real
            {error?.message ? ` (${error.message})` : ''}.
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-5">
          <Select value={filterMuseu} onValueChange={setFilterMuseu}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Museu" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="todos">Todos os museus</SelectItem>
              {MUSEUS.map((museu) => (
                <SelectItem key={museu} value={museu}>
                  {museu}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterMes} onValueChange={setFilterMes}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {MESES.map((mes) => (
                <SelectItem key={mes} value={mes}>
                  {mes}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum relatório encontrado</p>

            <Link to="/ReportEditor?novo=1" className="mt-3 inline-block">
              <Button size="sm" className="bg-black text-white hover:bg-gray-900 gap-1">
                <Plus className="h-3.5 w-3.5" />
                Criar primeiro relatório
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((report) => {
              const config = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
              const Icon = config.icon;
              const canReturnToReview = isCoordenador && report.status !== 'RETURNED';

              return (
                <Card
                  key={report.id}
                  className="border border-gray-200 bg-white hover:shadow-sm transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge className={`${config.color} text-xs font-medium gap-1`}>
                            <Icon className="h-3 w-3" />
                            {config.label}
                          </Badge>

                          {report.museu && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {report.museu}
                            </span>
                          )}

                          <span className="text-xs text-gray-400">
                            {report.mes_referencia} {report.ano}
                          </span>
                        </div>

                        <p className="font-medium text-gray-900 truncate">
                          {report.author_name || report.created_by || 'Sem autor'}
                        </p>

                        {report.funcao && (
                          <p className="text-sm text-gray-500 truncate">
                            {report.funcao}
                          </p>
                        )}

                        {report.return_comment && (
                          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            Retorno: {report.return_comment}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 justify-end">
                        <Link to={`/ReportEditor?id=${report.id}`}>
                          <Button size="sm" variant="outline" className="gap-1 shrink-0">
                            <Eye className="h-3.5 w-3.5" />
                            Abrir
                          </Button>
                        </Link>

                        {canReturnToReview && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 shrink-0"
                            onClick={() => {
                              setReturnComment(report.return_comment || '');
                              setReturnDialog({ open: true, report });
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Devolver para revisão
                          </Button>
                        )}

                        {isCoordenador && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1 shrink-0"
                            onClick={() => setDeleteDialog({ open: true, report })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={returnDialog.open}
        onOpenChange={(open) => {
          setReturnDialog({ open, report: open ? returnDialog.report : null });
          if (!open) setReturnComment('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver relatório para revisão</DialogTitle>
            <DialogDescription>
              A coordenação pode devolver o relatório para ajustes mesmo quando ele já estiver aprovado.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Motivo da devolução"
            value={returnComment}
            onChange={(event) => setReturnComment(event.target.value)}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReturnDialog({ open: false, report: null });
                setReturnComment('');
              }}
            >
              Cancelar
            </Button>

            <Button
              variant="destructive"
              disabled={returnReportMutation.isPending}
              onClick={() => {
                if (!returnDialog.report?.id) return;
                returnReportMutation.mutate({
                  report: returnDialog.report,
                  comment: returnComment,
                });
              }}
            >
              Confirmar devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          setDeleteDialog({ open, report: open ? deleteDialog.report : null });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir relatório</DialogTitle>
            <DialogDescription>
              Esta ação remove o relatório da lista, inclusive quando ele já estiver aprovado.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {deleteDialog.report?.author_name || deleteDialog.report?.created_by || 'Este relatório'} será excluído permanentemente.
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, report: null })}
            >
              Cancelar
            </Button>

            <Button
              variant="destructive"
              disabled={deleteReportMutation.isPending}
              onClick={() => {
                if (!deleteDialog.report?.id) return;
                deleteReportMutation.mutate(deleteDialog.report);
              }}
            >
              Confirmar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
