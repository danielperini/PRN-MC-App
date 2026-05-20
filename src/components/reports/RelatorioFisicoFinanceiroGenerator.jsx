import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, Download, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import LoadingDataNotice from '@/components/ui/LoadingDataNotice';
import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import { validateReportBeforeExport } from '@/utils/reportDataNormalizer';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';
import { montarHtmlRelatorioPremium } from '@/components/reports/premium/PremiumReportLayout';
import { revisarHtmlRelatorioAntesDaExportacao } from '@/services/reportEditorialReview';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';
import {
  DEFAULT_OPTIONS as REPORT_IMAGE_OPTIMIZATION_OPTIONS,
  optimizeReportHtmlImages,
} from '@/utils/reportImageOptimizer';
import {
  REPORT_CHAPTERS,
  REPORT_CHAPTER_IDS,
  buildReportSectionOptions,
  buildReportChapterSelectionState,
  getReportChapterById,
  getSelectedReportChapterIds,
  normalizeSelectedReportChapterIds,
  validateReportExportWithRegistry,
} from '@/config/reportChapters';
import {
  buildActivityPhotoCaption,
  cleanFileName,
  getPhotoIdentity,
} from '@/components/reports/premium/premiumReportUtils';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];
const EXPORT_VOLUME_COUNT = 3;
const EXPORT_FILENAME_BASE = 'Museus-Centro-Relatorio';
const SECOES_RELATORIO = REPORT_CHAPTER_IDS;
function getCapituloLabel(sectionId) {
  return getReportChapterById(sectionId)?.title || sectionId;
}

function buildPartFileName(partNumber, extension = 'html') {
  return `${EXPORT_FILENAME_BASE}-Volume-${partNumber}.${extension}`;
}

function buildDivisionSummary(parts = []) {
  if (!Array.isArray(parts) || parts.length <= 1) return '';

  const linhas = parts.map((part) => {
    const titulos = (part.sectionLabels || []).join(', ');
    return `Volume ${String(part.partNumber).padStart(2, '0')} — ${titulos}`;
  });

  return `
    <section style="max-width:210mm;margin:0 auto 18px;padding:0 24px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#333;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:16px 18px;background:#fff;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;">Sumário comum dos volumes</p>
        <p style="margin:0 0 10px;font-size:11.5px;line-height:1.5;">Os volumes preservam este mesmo sumário e usam paginação contínua no PDF para posterior junção externa.</p>
        <ul style="margin:0;padding-left:18px;font-size:11.5px;line-height:1.55;">
          ${linhas.map((linha) => `<li>${linha}</li>`).join('')}
        </ul>
      </div>
    </section>
  `;
}

function injectPartMetadata(html, { partNumber, totalParts, sectionLabels = [], summaryHtml = '' } = {}) {
  if (!html) return html;

  const header = `
    <section style="max-width:210mm;margin:0 auto 18px;padding:0 24px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#333;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:14px 18px;background:#fff;">
        <p style="margin:0;font-size:13px;font-weight:700;">Relatório Museus Centro — Volume ${String(partNumber).padStart(2, '0')} de ${String(totalParts).padStart(2, '0')}</p>
        <p style="margin:6px 0 0;font-size:11.5px;line-height:1.5;">Período do relatório: fevereiro a abril de 2026</p>
        <p style="margin:4px 0 0;font-size:11.5px;line-height:1.5;">Capítulos deste volume: ${sectionLabels.join(', ')}</p>
      </div>
    </section>
  `;

  const content = `${summaryHtml || ''}${header}`;

  if (html.includes('<body>')) {
    return html.replace('<body>', `<body>${content}`);
  }

  return `${content}${html}`;
}

function buildVolumeParts(sectionIds = []) {
  const ids = Array.isArray(sectionIds) ? sectionIds.filter(Boolean) : [];
  return [
    { partNumber: 1, totalParts: EXPORT_VOLUME_COUNT, secoes: ids.slice(0, 10) },
    { partNumber: 2, totalParts: EXPORT_VOLUME_COUNT, secoes: ids.slice(10, 20) },
    { partNumber: 3, totalParts: EXPORT_VOLUME_COUNT, secoes: ids.slice(20) },
  ];
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const res = await entity.list(order, limit);
    return Array.isArray(res) ? res : [];
  } catch (error) {
    console.warn('Falha ao listar entidade do relatório:', error);
    return [];
  }
}

async function carregarBaseConhecimento() {
  const candidatos = [
    base44?.entities?.BaseConhecimento,
    base44?.entities?.KnowledgeBase,
    base44?.entities?.KnowledgeItem,
    base44?.entities?.ProjectKnowledge,
  ].filter(Boolean);

  for (const entity of candidatos) {
    const lista = await safeList(entity, '-updated_date', 500);
    if (lista.length > 0) return lista;
  }

  return [];
}

function buildPhotoSelectionCandidates(contexto = {}) {
  return (Array.isArray(contexto?.atividades) ? contexto.atividades : [])
    .map((atividade, index) => {
      const photos = (Array.isArray(atividade?.fotos) ? atividade.fotos : [])
        .map((photo, photoIndex) => {
          const identity = getPhotoIdentity(photo);
          const imageUrl = photo?.url || photo?.link || photo?.file_url || photo?.src || photo?.arquivo_url || '';

          if (!identity || !imageUrl) return null;

          return {
            ...photo,
            id: identity,
            imageUrl,
            caption: buildActivityPhotoCaption({
              ...photo,
              atividade: atividade?.nome || atividade?.titulo,
              museu: atividade?.museu,
              mes: atividade?.mes,
            }),
            fileName: cleanFileName(photo?.fileName || photo?.file_name || photo?.name || imageUrl),
            key: `${identity}-${photoIndex}`,
          };
        })
        .filter(Boolean);

      if (photos.length === 0) return null;

      return {
        id: atividade?.id || `${atividade?.nome || atividade?.titulo || 'atividade'}-${index}`,
        titulo: atividade?.nome || atividade?.titulo || 'Atividade registrada',
        museu: atividade?.museu || 'Museus Centro',
        data: atividade?.data || atividade?.data_inicio || atividade?.mes || '',
        mes: atividade?.mes || '',
        photos,
      };
    })
    .filter(Boolean);
}

function salvarPreview(html) {
  try {
    sessionStorage.setItem('relatorio_fisico_financeiro_html', html);
  } catch (error) {
    console.warn('Não foi possível salvar a prévia do relatório:', error);
  }
}

async function carregarContextoRelatorioDoApp(museu, { secoesSelecionadas = SECOES_RELATORIO, splitContext = null, selectedInlinePhotoIds = [] } = {}) {
  const dateFrom = '2026-02-02';
  const dateTo = '2026-04-30';
  const museuFiltro = museu === 'Todos' ? 'todos' : museu;

  const [
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    teamPaymentsRaw,
    documentIntakeRaw,
    attachmentsRaw,
    galleryRaw,
    metasRaw,
    presenceRecordsRaw,
    programacaoRaw,
    conhecimentoRaw,
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 2000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 2000),
    safeList(base44.entities.PurchaseRequest, '-created_date', 2000),
    safeList(base44.entities.TeamPayment, '-created_date', 2000),
    safeList(base44.entities.DocumentIntake, '-created_date', 2000),
    safeList(base44.entities.Attachment, '-created_date', 3000),
    safeList(base44.entities.Gallery, '-created_date', 3000),
    safeList(base44.entities.Meta, 'codigo', 1000),
    safeList(base44.entities.PresenceRecord, '-data', 3000),
    safeList(base44.entities.Programacao, '-data_inicio', 3000),
    carregarBaseConhecimento(),
  ]);

  const dashboardMetrics = consolidateOfficialDashboardMetrics({
    reports: reportsRaw,
    programacao: programacaoRaw,
    rubricas: rubricasRaw,
    metas: metasRaw,
    photos: [...attachmentsRaw, ...galleryRaw],
    presenceRecords: presenceRecordsRaw,
  }, {
    period: {
      from: dateFrom,
      to: dateTo,
    },
  });

  const contexto = buildRelatorioFisicoFinanceiroContext({
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    teamPaymentsRaw,
    documentIntakeRaw,
    attachmentsRaw,
    galleryRaw,
    metasRaw,
    presenceRecordsRaw,
    programacaoRaw,
    conhecimentoRaw,
    filtros: {
      dateFrom,
      dateTo,
      museu: museuFiltro,
      capitulos: secoesSelecionadas,
      split_context: splitContext || undefined,
    },
  });

  const contextoComEstrategia = {
    ...contexto,
    dashboard_metrics: dashboardMetrics,
    dashboard_data_source: {
      reports: reportsRaw.length,
      programacao: programacaoRaw.length,
      rubricas: rubricasRaw.length,
      metas: metasRaw.length,
      attachments: attachmentsRaw.length,
      gallery: galleryRaw.length,
      presenceRecords: presenceRecordsRaw.length,
    },
    capitulos_relatorio: REPORT_CHAPTERS,
    secoesSelecionadas,
    split_context: splitContext || undefined,
    selected_inline_photo_ids: selectedInlinePhotoIds,
  };

  const filtros = {
    dateFrom,
    dateTo,
    museu: museu === 'Todos' ? 'Todos os museus' : museu,
  };

  return { contexto: contextoComEstrategia, filtros };
}

async function gerarRelatorioDoApp(museu, { premium = false, secoesSelecionadas = SECOES_RELATORIO, splitContext = null, selectedInlinePhotoIds = [] } = {}) {
  const { contexto, filtros } = await carregarContextoRelatorioDoApp(museu, {
    secoesSelecionadas,
    splitContext,
    selectedInlinePhotoIds,
  });

  const textos = await gerarTextosRelatorioFisicoFinanceiro(
    contexto,
    true
  );

  const htmlInicial = premium ? montarHtmlRelatorioPremium({
    contexto,
    textos,
    filtros,
    secoesSelecionadas,
  }) : montarHtmlRelatorioFisicoFinanceiro({
    contexto,
    textos,
    secoesSelecionadas,
    filtros,
  });
  const htmlRevisado = revisarHtmlRelatorioAntesDaExportacao(htmlInicial, { modo: premium ? 'premium' : 'fisico_financeiro' });
  const html = await optimizeReportHtmlImages(htmlRevisado, REPORT_IMAGE_OPTIMIZATION_OPTIONS);

  return { html, contexto };
}

export default function RelatorioFisicoFinanceiroGenerator() {
  const [museu, setMuseu] = useState('Todos');
  const [loading, setLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [modoPremium, setModoPremium] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [requestedVolume, setRequestedVolume] = useState(1);
  const [lastPageVolume1, setLastPageVolume1] = useState('');
  const [lastPageVolume2, setLastPageVolume2] = useState('');
  const [secoes, setSecoes] = useState(buildReportChapterSelectionState());
  const [photoSelectionDialog, setPhotoSelectionDialog] = useState(false);
  const [photoSelectionCandidates, setPhotoSelectionCandidates] = useState([]);
  const [selectedInlinePhotoIds, setSelectedInlinePhotoIds] = useState({});

  const secoesSelecionadas = getSelectedReportChapterIds(secoes);
  const volumeParts = useMemo(
    () => buildVolumeParts(normalizeSelectedReportChapterIds(secoesSelecionadas)),
    [secoesSelecionadas]
  );
  const producedSectionTexts = useMemo(() => Object.fromEntries(
    REPORT_CHAPTERS.map((chapter) => [
      chapter.contentKey || `${chapter.id}_text`,
      [chapter.title, chapter.summaryDescription, chapter.renderTitle].filter(Boolean).join('\n'),
    ])
  ), []);
  const visibleSectionOptions = useMemo(
    () => buildReportSectionOptions(REPORT_CHAPTERS, producedSectionTexts),
    [producedSectionTexts]
  );
  const visibleChapterIds = useMemo(
    () => visibleSectionOptions.map((option) => option.id),
    [visibleSectionOptions]
  );

  useEffect(() => {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table(visibleSectionOptions.map((option) => ({
        id: option.id,
        sectionId: option.sectionId,
        title: option.title,
        contentKey: option.contentKey,
      })));
    }
  }, [visibleSectionOptions]);

  const toggleSecao = (id) => setSecoes((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTodas = (value) => setSecoes(buildReportChapterSelectionState(value ? visibleChapterIds : []));
  const toggleInlinePhoto = (photoId, value) => {
    setSelectedInlinePhotoIds((prev) => ({
      ...prev,
      [photoId]: typeof value === 'boolean' ? value : !prev[photoId],
    }));
  };
  const selectAllActivityPhotos = (activity, value) => {
    setSelectedInlinePhotoIds((prev) => {
      const next = { ...prev };
      (activity?.photos || []).forEach((photo) => {
        next[photo.id] = value;
      });
      return next;
    });
  };

  const getVolumePageOffset = (volumeNumber) => {
    if (volumeNumber === 1) return 0;

    const inputValue = volumeNumber === 2 ? lastPageVolume1 : lastPageVolume2;
    const parsed = parsePositiveInteger(inputValue);

    if (!parsed) {
      toast.error(volumeNumber === 2
        ? 'Informe a última página do Volume 1 para gerar o Volume 2.'
        : 'Informe a última página do Volume 2 para gerar o Volume 3.');
      return null;
    }

    return parsed;
  };

  const openPreview = (html) => {
    salvarPreview(html);
    const preview = window.open('/RelatorioPreview', '_blank', 'width=1200,height=900');
    if (preview) return null;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return url;
  };

  const downloadNamedHtml = (html, fileName) => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHtml = (html) => {
    downloadNamedHtml(html, `relatorio-museus-centro-${Date.now()}.html`);
  };

  const updateProgress = (percent, label, detail = '') => {
    setExportProgress({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      label,
      detail,
    });
  };

  const validateBeforeExport = (html, selectedIds, reportContext = {}) => {
    if (!String(html || '').trim()) {
      throw new Error('HTML do relatorio vazio.');
    }

    const validation = validateReportExportWithRegistry(html, selectedIds);
    if (!validation.valid) {
      const missingTitles = validation.missingSelected.map(getCapituloLabel);
      console.warn('Capitulos selecionados nao renderizados antes da exportacao:', missingTitles);
    }

    const editorialValidation = validateReportBeforeExport(reportContext, html, selectedIds);
    if (!editorialValidation.valid) {
      throw new Error(`Falha estrutural na exportacao: ${editorialValidation.errors.join(' ')}`);
    }
    const warnings = [
      ...(validation.valid ? [] : validation.missingSelected.map(getCapituloLabel)),
      ...editorialValidation.warnings,
    ].filter(Boolean);
    if (warnings.length > 0) {
      console.warn('Alertas antes da exportacao:', warnings);
    }
  };
  const runExport = async (inlinePhotoIds = [], volumeNumber = requestedVolume) => {
    const normalizedSelectedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);
    const allVolumeParts = buildVolumeParts(normalizedSelectedSections);
    const selectedVolume = allVolumeParts.find((part) => part.partNumber === volumeNumber);
    const pageNumberOffset = getVolumePageOffset(volumeNumber);

    if (normalizedSelectedSections.length === 0) {
      toast.error('Selecione ao menos um capítulo.');
      return;
    }

    if (!selectedVolume || selectedVolume.secoes.length === 0) {
      toast.error(`O Volume ${volumeNumber} nao possui capitulos selecionados.`);
      return;
    }

    if (pageNumberOffset === null) return;

    try {
      sessionStorage.setItem('relatorio_fisico_financeiro_selected_chapters', JSON.stringify(selectedVolume.secoes));
      sessionStorage.setItem('relatorio_fisico_financeiro_all_chapters', JSON.stringify(normalizedSelectedSections));
      sessionStorage.setItem('relatorio_fisico_financeiro_export_mode', 'volume');
      sessionStorage.setItem('relatorio_fisico_financeiro_export_volume', JSON.stringify({
        volumeNumber,
        totalVolumes: EXPORT_VOLUME_COUNT,
        pageNumberOffset,
      }));
    } catch {}

    setLoading(true);
    updateProgress(4, 'Iniciando geracao do relatorio', `Volume ${volumeNumber} com ${selectedVolume.secoes.length} capitulos`);
    setResultado(null);
    setErro(null);

    try {
      toast.info(`Preparando Volume ${volumeNumber} do relatorio...`);

      updateProgress(28, 'Buscando dados do dashboard', 'Relatorios, programacao, rubricas, metas, presenca e galeria');
      const fullData = await gerarRelatorioDoApp(museu, {
        premium: modoPremium,
        secoesSelecionadas: normalizedSelectedSections,
        selectedInlinePhotoIds: inlinePhotoIds,
      });
      const summaryHtml = buildDivisionSummary(
        allVolumeParts.map((part) => ({
          partNumber: part.partNumber,
          sectionLabels: part.secoes.map(getCapituloLabel),
        }))
      );
      const splitContext = {
        enabled: true,
        partNumber: volumeNumber,
        totalParts: EXPORT_VOLUME_COUNT,
        sectionLabels: selectedVolume.secoes.map(getCapituloLabel),
        pageNumberOffset,
        subdivisionOf: null,
      };

      updateProgress(72, `Gerando Volume ${volumeNumber}`, splitContext.sectionLabels.join(', '));
      const localPart = await gerarRelatorioDoApp(museu, {
        premium: modoPremium,
        secoesSelecionadas: selectedVolume.secoes,
        splitContext,
        selectedInlinePhotoIds: inlinePhotoIds,
      });

      const htmlPart = injectPartMetadata(localPart.html, {
        partNumber: volumeNumber,
        totalParts: EXPORT_VOLUME_COUNT,
        sectionLabels: splitContext.sectionLabels,
        summaryHtml,
      });
      validateBeforeExport(htmlPart, selectedVolume.secoes, localPart.contexto);

      const finalPart = {
        partNumber: volumeNumber,
        totalParts: EXPORT_VOLUME_COUNT,
        fileName: buildPartFileName(volumeNumber),
        html: htmlPart,
        sizeBytes: new Blob([htmlPart], { type: 'text/html;charset=utf-8' }).size,
        sectionLabels: splitContext.sectionLabels,
        secoes: selectedVolume.secoes,
        pageNumberOffset,
      };

      setResultado({
        html: htmlPart,
        contexto: localPart.contexto || fullData.contexto,
        fonte: modoPremium ? 'premium_app' : 'frontend_ia',
        exportMode: 'volume',
        htmlSize: finalPart.sizeBytes,
        volumeNumber,
        pageNumberOffset,
        parts: [finalPart],
      });
      updateProgress(100, 'Relatorio concluido', `Volume ${volumeNumber} pronto para visualizacao e PDF`);
      openPreview(htmlPart);
      setDialogAberto(false);
      toast.success(`Volume ${volumeNumber} gerado com dados reais do aplicativo.`);
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Nao foi possivel gerar o relatorio.');
      toast.error('Nao foi possivel gerar o relatorio.');
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 1200);
    }

    return;
  };

  const getSelectedInlineIds = () => Object.entries(selectedInlinePhotoIds)
    .filter(([, selected]) => selected)
    .map(([photoId]) => photoId);

  const handleGerar = async (volumeNumber) => {
    setRequestedVolume(volumeNumber);
    if (getVolumePageOffset(volumeNumber) === null) return;

    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos um capítulo.');
      return;
    }

    const selectedVolume = volumeParts.find((part) => part.partNumber === volumeNumber);
    if (!selectedVolume || selectedVolume.secoes.length === 0) {
      toast.error(`O Volume ${volumeNumber} nao possui capitulos selecionados.`);
      return;
    }

    const selectedIds = getSelectedInlineIds();

    setErro(null);
    setLoading(true);
    updateProgress(4, 'Analisando fotos vinculadas', 'Verificando imagens vinculadas às atividades');

    try {
      const { contexto } = await carregarContextoRelatorioDoApp(museu, {
        secoesSelecionadas,
        selectedInlinePhotoIds: selectedIds,
      });
      const candidates = buildPhotoSelectionCandidates(contexto);

      if (candidates.length > 0) {
        setPhotoSelectionCandidates(candidates);
        setSelectedInlinePhotoIds((prev) => {
          const next = { ...prev };
          candidates.forEach((activity) => {
            activity.photos.forEach((photo) => {
              if (typeof next[photo.id] === 'undefined') next[photo.id] = false;
            });
          });
          return next;
        });
        setDialogAberto(false);
        setPhotoSelectionDialog(true);
        setLoading(false);
        setExportProgress(null);
        return;
      }

      await runExport(selectedIds, volumeNumber);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setExportProgress(null);
      setErro(err.message || 'Não foi possível preparar a seleção de fotos.');
      toast.error('Não foi possível preparar a seleção de fotos.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gerar Relatório</h2>
          <p className="text-sm text-slate-500">Catálogo-livro institucional com fotos, gráficos, metas, programação e execução financeira.</p>
        </div>
      </div>

      {exportProgress && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Progresso da Exportação</p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-4xl font-bold leading-none text-slate-900 tabular-nums">{exportProgress.percent}%</span>
                <span className="pb-1 text-sm text-slate-500">concluído</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{exportProgress.label}</p>
              <p className="text-xs text-slate-500">{exportProgress.detail}</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-300"
              style={{ width: `${exportProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      <Button onClick={() => setDialogAberto(true)} disabled={loading} className="w-full h-12">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
        Gerar Relatório
      </Button>

      {loading && (
        <LoadingDataNotice
          className="mt-4"
          title="Relatório carregando dados"
          message="O app está recuperando relatórios, programação, rubricas, compras, anexos e textos de apoio. A prévia será aberta quando a consolidação terminar."
        />
      )}

      {erro && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Não foi possível gerar o relatório</p>
            <p className="text-xs text-amber-700 mt-1">{erro}</p>
          </div>
        </div>
      )}

      {resultado && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Relatório gerado com sucesso!</p>
              <p className="text-xs text-green-700 mt-1">
                {resultado.fonte === 'premium_app'
                  ? 'Gerado no modo relatório institucional, usando dados reais do app e refinamento textual editorial.'
                  : resultado.fonte === 'backend'
                    ? 'Gerado pela função gerarRelatorioFisicoFinanceiro.'
                    : 'Gerado no frontend com dados reais do app, fotos vinculadas e refinamento textual por IA.'}
              </p>
              {resultado.exportMode === 'split' && Array.isArray(resultado.parts) && resultado.parts.length > 1 && (
                <p className="text-xs text-green-700 mt-1">
                  Exportação preparada em {resultado.parts.length} volumes balanceados, respeitando a ordem dos capítulos selecionados.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            {resultado.exportMode === 'split' && Array.isArray(resultado.parts) && resultado.parts.length > 1 ? (
              <>
                <Button variant="outline" size="sm" onClick={() => openPreview(resultado.parts[0]?.html || resultado.html)}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Volume 01
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resultado.parts.forEach((part) => downloadNamedHtml(part.html, part.fileName))}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar todos os volumes
                </Button>
                {resultado.parts.map((part) => (
                  <Button
                    key={part.fileName}
                    variant="outline"
                    size="sm"
                    onClick={() => downloadNamedHtml(part.html, part.fileName)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {`Volume ${String(part.partNumber).padStart(2, '0')}`}
                  </Button>
                ))}
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => openPreview(resultado.html)}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Relatório
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadHtml(resultado.html)}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar HTML
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={photoSelectionDialog} onOpenChange={setPhotoSelectionDialog}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fotos vinculadas às atividades</DialogTitle>
            <p className="text-sm text-slate-500">
              Selecione quais fotos devem ser impressas no corpo das atividades. As fotos não selecionadas serão enviadas automaticamente para a galeria final, organizadas por museu, atividade e mês.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {photoSelectionCandidates.map((activity) => (
              <div key={activity.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{activity.titulo}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {[activity.museu, activity.data || activity.mes, `${activity.photos.length} foto${activity.photos.length !== 1 ? 's' : ''} vinculada${activity.photos.length !== 1 ? 's' : ''}`]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => selectAllActivityPhotos(activity, true)}>
                      Selecionar todas desta atividade
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => selectAllActivityPhotos(activity, false)}>
                      Não imprimir fotos nesta atividade
                    </Button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {activity.photos.map((photo) => (
                    <label key={photo.key} className="rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={!!selectedInlinePhotoIds[photo.id]}
                          onCheckedChange={(value) => toggleInlinePhoto(photo.id, !!value)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="w-full h-32 overflow-hidden rounded-lg bg-slate-100 mb-3">
                            <img src={photo.imageUrl} alt={photo.caption} className="w-full h-full object-cover" loading="lazy" />
                          </div>
                          <p className="text-xs font-medium text-slate-800 break-words">{photo.fileName}</p>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{photo.caption}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPhotoSelectionDialog(false);
                setDialogAberto(true);
              }}
              disabled={loading}
            >
              Voltar
            </Button>
            <Button
              onClick={async () => {
                const selectedIds = getSelectedInlineIds();
                setPhotoSelectionDialog(false);
                await runExport(selectedIds, requestedVolume);
              }}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Continuar exportação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escolha os capítulos do relatório</DialogTitle>
            <p className="text-sm text-slate-500">Selecione o formato, o museu, o modo de exportação e os capítulos que entram na geração.</p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {loading && (
              <LoadingDataNotice
                title="Carregando dados do relatório"
                message="Mantenha esta janela aberta enquanto o sistema consolida dados reais do app e revisa o HTML antes da prévia."
              />
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Museu</Label>
                <Select value={museu} onValueChange={setMuseu}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MUSEUS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer ${modoPremium ? 'border-black bg-black/5' : 'border-slate-200 bg-slate-50'}`}
                onClick={() => setModoPremium((value) => !value)}
              >
                <Checkbox
                  checked={modoPremium}
                  onCheckedChange={(value) => setModoPremium(!!value)}
                  onClick={(event) => event.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Catálogo-livro institucional</p>
                  <p className="text-xs text-slate-500 mt-0.5">Capa full bleed, timeline, museus, Noturno, comunicação, galeria com créditos/GPS e tabelas A4.</p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <Label>Ultima pagina do Volume 1</Label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={lastPageVolume1}
                  onChange={(event) => setLastPageVolume1(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
                  placeholder="Obrigatorio para Volume 2"
                />
              </div>
              <div>
                <Label>Ultima pagina do Volume 2</Label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={lastPageVolume2}
                  onChange={(event) => setLastPageVolume2(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
                  placeholder="Obrigatorio para Volume 3"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Capítulos</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => toggleTodas(true)} className="text-blue-600 hover:underline">Todos</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={() => toggleTodas(false)} className="text-slate-500 hover:underline">Nenhum</button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {visibleSectionOptions.map((option) => (
                <label key={option.id} className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-3 py-2 cursor-pointer">
                  <Checkbox checked={!!secoes[option.id]} onCheckedChange={() => toggleSecao(option.id)} />
                  <span className="text-sm text-slate-700">{option.title}</span>
                </label>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              {secoesSelecionadas.filter((id) => visibleChapterIds.includes(id)).length} de {visibleSectionOptions.length} capítulos selecionados.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={loading}>Cancelar</Button>
            {[1, 2, 3].map((volumeNumber) => {
              const volume = volumeParts.find((part) => part.partNumber === volumeNumber);
              const disabled = loading || secoesSelecionadas.length === 0 || !volume || volume.secoes.length === 0;
              return (
                <Button key={volumeNumber} onClick={() => handleGerar(volumeNumber)} disabled={disabled}>
                  {loading && requestedVolume === volumeNumber ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                  {`Gerar / Exportar Volume ${volumeNumber}`}
                </Button>
              );
            })}
            <Button className="hidden" onClick={handleGerar} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Gerar relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
