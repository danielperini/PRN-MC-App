import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  X,
  Loader2,
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
import { Input } from '@/components/ui/input';
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
import RestaurarRelatoriosDrive from '@/components/entrada/RestaurarRelatoriosDrive';
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

import { MESES, MUSEUS, CACHE_KEYS } from '@/utils/constants';

const REPORTS_CACHE_KEY = CACHE_KEYS.RELATORIOS_LIST;

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
  const [searchTerm, setSearchTerm] = useState('');
  const [returnDialog, setReturnDialog] = useState({ open: false, report: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, report: null });
  const [returnComment, setReturnComment] = useState('');
  const [cachedReports, setCachedReports] = useState(() => readReportsCache());
  const [deepSearchResults, setDeepSearchResults] = useState(null); // null = not triggered
  const [deepSearchLoading, setDeepSearchLoading] = useState(false);
  const deepSearchTimeout = useRef(null);

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

  // Deep search: dispara quando busca local retorna 0 ou termo começa com 'MC-'
  const runDeepSearch = useCallback(async (term) => {
    if (!term || term.trim().length < 2) { setDeepSearchResults(null); return; }
    setDeepSearchLoading(true);
    try {
      const q = term.trim();
      const isProtocol = q.toUpperCase().startsWith('MC-');
      let results = [];
      if (isProtocol) {
        results = await base44.entities.Report.filter({ numero_protocolo: q });
      } else {
        // Busca por author_name (sem limite)
        const byName = await base44.entities.Report.filter({ author_name: q });
        results = byName;
      }
      setDeepSearchResults(Array.isArray(results) ? results : []);
    } catch (e) {
      console.warn('Deep search failed:', e);
      setDeepSearchResults([]);
    } finally {
      setDeepSearchLoading(false);
    }
  }, []);

  // Monitora mudança no searchTerm para disparar busca profunda quando necessário
  useEffect(() => {
    if (deepSearchTimeout.current) clearTimeout(deepSearchTimeout.current);
    const term = searchTerm.trim();
    if (!term) { setDeepSearchResults(null); return; }
    // Disparo imediato para protocolos MC-
    if (term.toUpperCase().startsWith('MC-')) {
      deepSearchTimeout.current = setTimeout(() => runDeepSearch(term), 400);
      return;
    }
    // Para texto livre: aguarda filtro local rodar e verifica se deu 0
    deepSearchTimeout.current = setTimeout(() => {
      // será avaliado no useMemo abaixo
    }, 600);
    return () => { if (deepSearchTimeout.current) clearTimeout(deepSearchTimeout.current); };
  }, [searchTerm, runDeepSearch]);

  const applyFilters = useCallback((reportList) => {
    const q = searchTerm.trim().toLowerCase();
    return reportList.filter((report) => {
      if (filterMuseu !== 'todos' && report.museu !== filterMuseu) return false;
      if (filterMes !== 'todos' && (report.mes_referencia || '').toLowerCase() !== filterMes.toLowerCase()) return false;
      if (filterStatus !== 'todos' && report.status !== filterStatus) return false;
      if (q) {
        const haystack = [
          report.author_name,
          report.funcao,
          report.museu,
          report.mes_referencia,
          String(report.ano || ''),
          report.equipe,
          report.resumo_periodo,
          report.comentarios_gerais,
          report.numero_protocolo,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [filterMuseu, filterMes, filterStatus, searchTerm]);

  const localFiltered = useMemo(() => applyFilters(myReports), [myReports, applyFilters]);

  // Se busca local retornou 0 e há termo de busca (não protocolo), dispara busca profunda
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term || term.toUpperCase().startsWith('MC-')) return;
    if (localFiltered.length === 0 && !deepSearchLoading && deepSearchResults === null) {
      runDeepSearch(term);
    }
  }, [localFiltered, searchTerm, deepSearchLoading, deepSearchResults, runDeepSearch]);

  // Quando o searchTerm muda, reseta deepSearchResults para forçar reavaliação
  useEffect(() => {
    setDeepSearchResults(null);
  }, [searchTerm]);

  const isDeepSearch = deepSearchResults !== null;
  const filtered = useMemo(() => {
    if (isDeepSearch) return applyFilters(deepSearchResults);
    return localFiltered;
  }, [isDeepSearch, deepSearchResults, localFiltered, applyFilters]);

  // Chips de museu com contagem
  const museuCounts = useMemo(() => {
    const counts = {};
    myReports.forEach(r => {
      if (r.museu) counts[r.museu] = (counts[r.museu] || 0) + 1;
    });
    return counts;
  }, [myReports]);

  // Meses disponíveis dinamicamente — deduplicados case-insensitive, inclui "Maio–Junho"
  const mesesDisponiveis = useMemo(() => {
    const order = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Maio–Junho', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    // Deduplica preservando a versão com inicial maiúscula quando houver conflito
    const seen = new Map();
    myReports.forEach(r => {
      const val = r.mes_referencia;
      if (!val) return;
      const key = val.toLowerCase();
      if (!seen.has(key) || val[0] === val[0].toUpperCase()) seen.set(key, val);
    });
    return [...seen.values()].sort((a, b) => {
      const ia = order.findIndex(m => m.toLowerCase() === a.toLowerCase());
      const ib = order.findIndex(m => m.toLowerCase() === b.toLowerCase());
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [myReports]);

  const hasActiveFilters = filterMuseu !== 'todos' || filterMes !== 'todos' || filterStatus !== 'todos' || searchTerm.trim();

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
            {isCoordenador ? <>
              <Link to="/CoordReview">
                <Button variant="outline" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Revisão de Relatórios
                </Button>
              </Link>
              <Link to="/RelatorioFisicoFinanceiro">
                <Button variant="outline" className="gap-2">
                  <BarChart2 className="h-4 w-4" />
                  Gerador de Relatório
                </Button>
              </Link>
            </> : null}

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

        {/* Barra de busca */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Buscar por profissional, protocolo (MC-...), função, museu, mês..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-9 h-10 text-sm"
          />
          {deepSearchLoading ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin pointer-events-none" />
          ) : searchTerm ? (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setDeepSearchResults(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {deepSearchLoading && (
          <div className="mb-3 text-xs text-blue-600 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Buscando em todos os relatórios...
          </div>
        )}

        {/* Chips rápidos de museu */}
        {Object.keys(museuCounts).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={() => setFilterMuseu('todos')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all
                ${filterMuseu === 'todos'
                  ? 'border-black bg-black text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}
            >
              Todos
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${filterMuseu === 'todos' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {myReports.length}
              </span>
            </button>
            {Object.entries(museuCounts).sort((a, b) => b[1] - a[1]).map(([museu, count]) => (
              <button
                key={museu}
                type="button"
                onClick={() => setFilterMuseu(filterMuseu === museu ? 'todos' : museu)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all
                  ${filterMuseu === museu
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50'}`}
              >
                {museu}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${filterMuseu === museu ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Filtros de Mês e Status */}
        <div className="flex flex-wrap gap-3 mb-5">
          <Select value={filterMes} onValueChange={setFilterMes}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {mesesDisponiveis.map((mes) => (
                <SelectItem key={mes} value={mes}>{mes}</SelectItem>
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
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setFilterMuseu('todos'); setFilterMes('todos'); setFilterStatus('todos'); setSearchTerm(''); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
          )}
        </div>

        {(isAdmin || isCoordenador) && (
          <div className="mb-5">
            <RestaurarRelatoriosDrive />
          </div>
        )}

        {isDeepSearch && !deepSearchLoading && filtered.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2.5 py-1 font-medium">
              🔍 Resultado de busca expandida — {filtered.length} encontrado{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

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