import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import {
  FileText, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, Download, X, Search, SlidersHorizontal, Trash2, FileX
} from 'lucide-react';
import PDFGeneratorDialog from '../components/reports/PDFGeneratorDialog';
import PeriodExportDialog from '../components/reports/PeriodExportDialog';
import RelatorioFisicoFinanceiroDialog from '../components/reports/RelatorioFisicoFinanceiroDialog';
import ActivityFilters from '../components/reports/ActivityFilters';
import ActivitySummary from '../components/reports/ActivitySummary';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { toastMessages } from '@/lib/toastMessages';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];
const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: 'bg-white text-black border border-black', cardBg: 'bg-white', icon: Clock },
  SUBMITTED: { label: 'Enviado', color: 'bg-white text-black border border-black', cardBg: 'bg-white', icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-white text-black border border-black', cardBg: 'bg-white', icon: Eye },
  RETURNED: { label: 'Devolvido', color: 'bg-black text-white border border-black', cardBg: 'bg-white', icon: AlertCircle },
  APPROVED: { label: 'Aprovado', color: 'bg-black text-white border border-black', cardBg: 'bg-white', icon: CheckCircle },
  ARCHIVED: { label: 'Arquivado', color: 'bg-gray-200 text-black border border-black', cardBg: 'bg-white', icon: Archive }
};

function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatReportPublico(value) {
  return inteiro(value).toLocaleString('pt-BR');
}

function buildFallbackReportHtml(report) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  const titulo = `Relatório ${report?.mes_referencia || ''} ${report?.ano || ''}`.trim();
  const totalPublico = atividades.reduce(
    (sum, atividade) => sum + inteiro(atividade?.publico_total ?? atividade?.publico_estimado ?? 0),
    0
  );

  const atividadesHtml = atividades.length > 0
    ? atividades.map((atividade, index) => `
      <section class="atividade">
        <h3>${index + 1}. ${escapeHtml(atividade?.nome || atividade?.titulo || 'Atividade')}</h3>
        ${atividade?.classificacao ? `<p><strong>Classificação:</strong> ${escapeHtml(atividade.classificacao)}</p>` : ''}
        ${atividade?.descricao ? `<p><strong>Descrição:</strong> ${escapeHtml(atividade.descricao)}</p>` : ''}
        <p><strong>Público:</strong> ${formatReportPublico(atividade?.publico_total ?? atividade?.publico_estimado ?? 0)}</p>
      </section>
    `).join('')
    : '<p>Nenhuma atividade cadastrada neste relatório.</p>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titulo || 'Relatório')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 32px; line-height: 1.45; }
    header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 24px 0 10px; }
    h3 { font-size: 15px; margin: 0 0 8px; }
    p { margin: 4px 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; }
    .box { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 12px 0; }
    .atividade { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 10px 0; break-inside: avoid; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 64px; }
    .linha { border-top: 1px solid #111; padding-top: 8px; text-align: center; font-size: 12px; }
    @media print { body { margin: 18mm; } button { display: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(titulo || 'Relatório')}</h1>
    <div class="grid">
      <p><strong>Profissional:</strong> ${escapeHtml(report?.author_name || '')}</p>
      <p><strong>Museu:</strong> ${escapeHtml(report?.museu || '')}</p>
      <p><strong>Equipe:</strong> ${escapeHtml(report?.equipe || '')}</p>
      <p><strong>Status:</strong> ${escapeHtml(report?.status || '')}</p>
    </div>
  </header>

  <section class="box">
    <h2>Resumo</h2>
    <p><strong>Total de atividades:</strong> ${formatReportPublico(atividades.length)}</p>
    <p><strong>Público total:</strong> ${formatReportPublico(totalPublico)}</p>
  </section>

  ${report?.resumo_periodo ? `<section class="box"><h2>Resumo do Período</h2><p>${escapeHtml(report.resumo_periodo)}</p></section>` : ''}
  ${report?.resumo_executivo ? `<section class="box"><h2>Resumo Executivo</h2><p>${escapeHtml(report.resumo_executivo)}</p></section>` : ''}

  <section>
    <h2>Atividades</h2>
    ${atividadesHtml}
  </section>

  <section class="assinaturas">
    <div class="linha">Responsável pelo relatório</div>
    <div class="linha">Coordenação</div>
  </section>

  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;
}

function isFunctionNotFoundError(error) {
  const status = error?.response?.status || error?.status;
  const message = String(error?.message || '').toLowerCase();
  return status === 404 || message.includes('404') || message.includes('not found');
}

function exportCSV(reports) {
  try {
    if (!Array.isArray(reports) || reports.length === 0) {
      alert('Nenhum relatório para exportar');
      return;
    }

    const rows = [];
    const header = [
      'ID', 'Profissional', 'Museu', 'Equipe', 'Mês', 'Ano', 'Status',
      'Atividade', 'Classificação', 'Público Estimado', 'Equipe Responsável',
      'Acessibilidade', 'Parceria'
    ];

    rows.push(header.join(';'));

    reports.forEach((r) => {
      if (!r || !r.id) return;
      const atividades = Array.isArray(r.atividades) ? r.atividades : [];
      if (atividades.length === 0) {
        rows.push([r.id, r.author_name || '', r.museu || '', r.equipe || '', r.mes_referencia || '', r.ano || '', r.status || '',
          '', '', '', '', '', ''].join(';'));
      } else {
        atividades.forEach((a) => {
          if (!a) return;
          rows.push([
            r.id, r.author_name || '', r.museu || '', r.equipe || '', r.mes_referencia || '', r.ano || '', r.status || '',
            a.nome || a.titulo || '', a.classificacao || '', inteiro(a.publico_total ?? a.publico_estimado ?? 0),
            a.equipe_responsavel || '', a.acessibilidade || '', a.parceria || ''
          ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
        });
      }
    });

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorios_museus_centro_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erro ao exportar CSV:', error);
    alert('Erro ao exportar relatórios');
  }
}

function RelatoriosInner() {
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const isComunicacao = currentUser?.role === 'COORD_COMUNICACAO';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ mes: '', museu: '', equipe: '', status: '', classificacao: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activityFilters, setActivityFilters] = useState({ team: '', museum: '', dateStart: '', dateEnd: '' });
  const [selectedReports, setSelectedReports] = useState(new Set());
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [periodExportOpen, setPeriodExportOpen] = useState(false);
  const [fisicoFinanceiroOpen, setFisicoFinanceiroOpen] = useState(false);
  const [exportingSingleId, setExportingSingleId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Report.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['all-reports-list']);
      queryClient.invalidateQueries(['my-reports-list']);
      toastMessages.deleteSuccess();
      setDeleteTarget(null);
    },
    onError: () => toastMessages.deleteFailed()
  });

  const { data: allReports = [], isLoading: loadingAll } = useQuery({
    queryKey: ['all-reports-list'],
    queryFn: () => base44.entities.Report.list('-created_date', 200),
    enabled: !!currentUser && isCoordenador,
    staleTime: 30_000
  });

  const { data: myReports = [], isLoading: loadingMy } = useQuery({
    queryKey: ['my-reports-list', currentUser?.email],
    queryFn: () => base44.entities.Report.filter({ created_by: currentUser?.email }, '-created_date'),
    enabled: !!currentUser?.email && !isCoordenador,
    staleTime: 30_000
  });

  const { data: allAttachments = [] } = useQuery({
    queryKey: ['all-attachments-list'],
    queryFn: () => base44.entities.Attachment.list('-created_date', 500),
    enabled: !!currentUser,
    staleTime: 30_000
  });

  const isLoading = isCoordenador ? loadingAll : loadingMy;
  const baseReports = isCoordenador ? allReports : myReports;

  const allActivities = baseReports.flatMap((report) => {
    if (!report || !report.id) return [];
    const atividades = Array.isArray(report.atividades) ? report.atividades : [];
    return atividades.map((activity) => {
      if (!activity) return null;
      const publicoInteiro = inteiro(activity?.publico_total ?? activity?.publico_estimado ?? 0);

      return {
        ...activity,
        publico_total: publicoInteiro,
        publico_estimado: publicoInteiro,
        report_id: report.id,
        author_name: report.author_name || '',
        mes_referencia: report.mes_referencia || '',
        ano: report.ano || '',
        museu: report.museu || ''
      };
    }).filter(Boolean);
  });

  const filteredActivityList = allActivities.filter((activity) => {
    if (activityFilters.team && activity.equipe_responsavel !== activityFilters.team) return false;
    if (activityFilters.museum && activity.museu !== activityFilters.museum) return false;
    if (activityFilters.dateStart && (!activity.data_inicio || activity.data_inicio < activityFilters.dateStart)) return false;
    if (activityFilters.dateEnd && (!activity.data_inicio || activity.data_inicio > activityFilters.dateEnd)) return false;
    return true;
  });

  const uniqueTeams = Array.from(new Set(allActivities.map((a) => a.equipe_responsavel).filter(Boolean))).sort();

  const filtered = baseReports.filter((r) => {
    if (filters.mes && r.mes_referencia !== filters.mes) return false;
    if (filters.museu && r.museu !== filters.museu) return false;
    if (filters.equipe && r.equipe !== filters.equipe) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.classificacao) {
      const hasClass = (r.atividades || []).some((a) => a.classificacao === filters.classificacao);
      if (!hasClass) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchName = r.author_name?.toLowerCase().includes(q);
      const matchMuseu = r.museu?.toLowerCase().includes(q);
      const matchMes = r.mes_referencia?.toLowerCase().includes(q);
      const matchEquipe = r.equipe?.toLowerCase().includes(q);
      const matchAtiv = (r.atividades || []).some((a) => (a.nome || a.titulo || '').toLowerCase().includes(q));
      if (!matchName && !matchMuseu && !matchMes && !matchEquipe && !matchAtiv) return false;
    }
    return true;
  });

  const hasFilters = Object.values(filters).some(Boolean) || !!search;
  const setFilter = (k, v) => setFilters((p) => ({ ...p, [k]: v === '__all__' ? '' : v }));
  const clearFilters = () => {
    setFilters({ mes: '', museu: '', equipe: '', status: '', classificacao: '' });
    setSearch('');
  };

  const toggleReportSelection = (reportId) => {
    const newSelected = new Set(selectedReports);
    if (newSelected.has(reportId)) {
      newSelected.delete(reportId);
    } else {
      newSelected.add(reportId);
    }
    setSelectedReports(newSelected);
  };

  const selectAllFiltered = () => {
    if (selectedReports.size === filtered.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(filtered.map((r) => r.id)));
    }
  };

  const exportSelectedPDF = async () => {
    if (selectedReports.size === 0) {
      toastMessages.warning('Selecione ao menos um relatório');
      return;
    }
    setGeneratingPDF(true);
    try {
      const response = await base44.functions.invoke('generateConsolidatedReportsPDF', {
        reportIds: Array.from(selectedReports)
      });
      if (response.data && response.data.error) {
        toastMessages.warning(response.data.error);
      } else {
        toastMessages.createSuccess();
      }
    } catch (err) {
      toastMessages.createFailed(err?.message);
    } finally {
      setGeneratingPDF(false);
    }
  };

  const openPdfHtml = (html, fileName = 'relatorio_pdf') => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');

    if (!printWindow) {
      toast.error('Não foi possível abrir a janela do PDF. Verifique o bloqueador de pop-up.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.document.title = fileName;
    printWindow.focus();
  };

  const exportSingleReportPDF = async (report) => {
    if (!report?.id) return;

    setExportingSingleId(report.id);
    try {
      const response = await base44.functions.invoke('generateSingleReportPDF', {
        reportId: report.id,
        mode: 'assinatura'
      });

      const html = response?.data?.html || response?.html;
      const url = response?.data?.url || response?.url;
      const fileName = response?.data?.file_name || response?.file_name || `relatorio_${report.id}`;

      if (url) {
        window.open(url, '_blank');
        toast.success('PDF aberto com sucesso.');
        return;
      }

      if (html) {
        openPdfHtml(html, fileName);
        toast.success('Relatório aberto para impressão e salvamento em PDF.');
        return;
      }

      const fallbackHtml = buildFallbackReportHtml(report);
      openPdfHtml(fallbackHtml, fileName);
      toast.warning('Função de PDF sem retorno. Abrindo versão local para impressão.');
    } catch (err) {
      console.error('Erro ao exportar PDF individual:', err);

      if (isFunctionNotFoundError(err)) {
        const fallbackHtml = buildFallbackReportHtml(report);
        openPdfHtml(fallbackHtml, `relatorio_${report.id}`);
        toast.warning('Função generateSingleReportPDF não encontrada. Abrindo versão local para impressão.');
        return;
      }

      toast.error(`Erro ao exportar PDF: ${err?.message || 'tente novamente'}`);
    } finally {
      setExportingSingleId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">Relatórios</h1>
            <p className="text-gray-500 mt-1 text-sm">
              {filtered.length} de {baseReports.length} relatório(s)
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link to="/ReportEditor">
              <Button className="bg-black hover:bg-gray-800 text-white gap-2">
                <FileText className="w-4 h-4" />
                Novo Relatório
              </Button>
            </Link>

            {selectedReports.size > 0 && (
              <>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                  onClick={() => setPdfDialogOpen(true)}
                  disabled={generatingPDF}
                >
                  <Download className="w-4 h-4" />
                  PDF Customizado ({selectedReports.size})
                </Button>
              </>
            )}

            {isCoordenador && (
              <Button
                variant="outline"
                className="border-black gap-2"
                onClick={() => setFisicoFinanceiroOpen(true)}
              >
                <Download className="w-4 h-4" />
                Relatório Físico-Financeiro
              </Button>
            )}

            <Button
              variant="outline"
              className="border-black gap-2"
              onClick={() => exportCSV(filtered)}
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="mb-8 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por profissional, museu, mês, atividade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 border border-gray-100"
              />

              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              className={`gap-2 h-10 border border-gray-100 ${showFilters ? 'bg-gray-50' : ''}`}
              onClick={() => setShowFilters((p) => !p)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {Object.values(filters).some(Boolean) && (
                <span className="w-4 h-4 rounded-full bg-black text-white text-[10px] flex items-center justify-center">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              )}
            </Button>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="text-gray-400 gap-1 h-10" onClick={clearFilters}>
                <X className="w-3 h-3" /> Limpar
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 p-4 bg-white border border-gray-100 rounded-2xl">
              <FilterSel placeholder="Mês" value={filters.mes} onChange={(v) => setFilter('mes', v)}
                options={MESES.map((m) => ({ value: m, label: m }))} />
              <FilterSel placeholder="Museu" value={filters.museu} onChange={(v) => setFilter('museu', v)}
                options={MUSEUS.map((m) => ({ value: m, label: m }))} />
              <FilterSel placeholder="Equipe" value={filters.equipe} onChange={(v) => setFilter('equipe', v)}
                options={EQUIPES.map((e) => ({ value: e, label: e }))} />
              <FilterSel placeholder="Status" value={filters.status} onChange={(v) => setFilter('status', v)}
                options={Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))} />
              <FilterSel placeholder="Classificação" value={filters.classificacao} onChange={(v) => setFilter('classificacao', v)}
                options={['META', 'ROTINA', 'EXTRA'].map((c) => ({ value: c, label: c }))} />
            </div>
          )}
        </div>

        <div className="mb-8 space-y-4">
          <ActivityFilters
            teams={uniqueTeams}
            onFilter={setActivityFilters}
            onClear={() => setActivityFilters({ team: '', museum: '', dateStart: '', dateEnd: '' })}
          />

          {filteredActivityList.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-black uppercase tracking-wide">Resumo do Período</p>
              <ActivitySummary activities={filteredActivityList} reports={baseReports} />
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="mb-6 p-4 bg-white border border-gray-100 rounded-2xl flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedReports.size === filtered.length && filtered.length > 0}
                onChange={selectAllFiltered}
                className="w-5 h-5 cursor-pointer"
              />

              <span className="text-sm font-medium text-gray-700">
                {selectedReports.size === 0
                  ? `Selecionar todos os ${filtered.length} relatório(s)`
                  : `${selectedReports.size} de ${filtered.length} selecionado(s)`}
              </span>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando relatórios...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum relatório encontrado</p>
            {hasFilters && <p className="text-xs text-gray-400 mt-1">Tente ajustar os filtros ou a busca</p>}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(
              filtered.reduce((acc, report) => {
                const key = `${report.mes_referencia}/${report.ano}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(report);
                return acc;
              }, {})
            ).map(([monthKey, monthReports]) => (
              <div key={monthKey} className="border-l-4 border-black pl-6">
                <h3 className="text-lg font-semibold text-black mb-4">{monthKey}</h3>
                <div className="space-y-2">
                  {monthReports.map((report) => {
                    const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
                    const StatusIcon = cfg.icon;
                    const attachments = allAttachments.filter((att) => att.report_id === report.id);
                    const canDelete = report.created_by === currentUser?.email && (!isComunicacao || report.funcao === 'Comunicador');
                    const isSelected = selectedReports.has(report.id);
                    const isExportingThis = exportingSingleId === report.id;

                    return (
                      <div key={report.id} className={`group relative border rounded-xl transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'}`}>
                        <div className="absolute left-0 top-0 bottom-0 w-4 flex items-center pl-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleReportSelection(report.id);
                            }}
                            className="w-4 h-4 cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <Link to={`/ReportEditor?id=${report.id}`}>
                          <div className="p-4 pl-10 flex items-center justify-between hover:shadow-sm transition-all">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Badge className={`${cfg.color} font-normal gap-1`}>
                                      <StatusIcon className="w-3 h-3" />{cfg.label}
                                    </Badge>
                                    <p className="text-sm font-medium text-black">{report.author_name}</p>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">{report.museu}{report.equipe ? ` · ${report.equipe}` : ''}</p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-gray-400 group-hover:text-gray-600">
                              {attachments.length > 0 && (
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                                  {attachments.length} arquivo{attachments.length > 1 ? 's' : ''}
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </Link>

                        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              exportSingleReportPDF(report);
                            }}
                            disabled={isExportingThis}
                            className="p-1.5 rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 text-green-700 disabled:opacity-50"
                            title={isExportingThis ? 'Gerando PDF...' : 'Exportar relatório em PDF'}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {report.status === 'DRAFT' && isCoordenador && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteTarget(report);
                              }}
                              className="p-1.5 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-red-600"
                              title="Sem entrega este mês"
                            >
                              <FileX className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canDelete && report.status !== 'DRAFT' && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteTarget(report);
                              }}
                              className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-400 hover:text-red-500"
                              title="Excluir relatório"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PDFGeneratorDialog
        open={pdfDialogOpen}
        onClose={() => setPdfDialogOpen(false)}
        selectedReports={selectedReports}
        reports={filtered}
        museus={[...new Set(filtered.map((r) => r.museu))]}
      />

      <PeriodExportDialog
        open={periodExportOpen}
        onClose={() => setPeriodExportOpen(false)}
        museusUnicos={[...new Set(baseReports.map((r) => r.museu).filter(Boolean))]}
      />

      <RelatorioFisicoFinanceiroDialog
        open={fisicoFinanceiroOpen}
        onClose={() => setFisicoFinanceiroOpen(false)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-gray-500 px-1">
            Tem certeza que deseja excluir o relatório de <strong>{deleteTarget?.author_name}</strong> — {deleteTarget?.mes_referencia} {deleteTarget?.ano}? Esta ação não pode ser desfeita.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Relatorios() {
  return <RequireAuth><RelatoriosInner /></RequireAuth>;
}

function FilterSel({ placeholder, value, onChange, options }) {
  return (
    <Select value={value || '__all__'} onValueChange={(v) => onChange(v)}>
      <SelectTrigger className="h-8 text-sm min-w-[120px] border-gray-200">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">— {placeholder} —</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}