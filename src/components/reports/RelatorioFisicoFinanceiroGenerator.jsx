import React, { useState } from 'react';
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
import {
  DEFAULT_OPTIONS as REPORT_IMAGE_OPTIMIZATION_OPTIONS,
  PDF_MAX_TOTAL_SIZE_MB,
  optimizeReportHtmlImages,
} from '@/utils/reportImageOptimizer';
import {
  REPORT_CHAPTERS,
  REPORT_CHAPTER_IDS,
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
const MAX_EXPORT_PART_SIZE_BYTES = PDF_MAX_TOTAL_SIZE_MB * 1024 * 1024;
const EXPORT_FILENAME_BASE = 'Relatorio_Museus_Centro';
const SECOES_RELATORIO = REPORT_CHAPTER_IDS;
function getCapituloLabel(sectionId) {
  return getReportChapterById(sectionId)?.title || sectionId;
}

function buildPartFileName(partNumber, extension = 'html') {
  return `${EXPORT_FILENAME_BASE}_parte_${String(partNumber).padStart(2, '0')}.${extension}`;
}

function buildDivisionSummary(parts = []) {
  if (!Array.isArray(parts) || parts.length <= 1) return '';

  const linhas = parts.map((part) => {
    const titulos = (part.sectionLabels || []).join(', ');
    return `Parte ${String(part.partNumber).padStart(2, '0')} — ${titulos}`;
  });

  return `
    <section style="max-width:210mm;margin:0 auto 18px;padding:0 24px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#333;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:16px 18px;background:#fff;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;">Relatório dividido em ${parts.length} arquivos</p>
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
        <p style="margin:0;font-size:13px;font-weight:700;">Relatório Museus Centro — Parte ${String(partNumber).padStart(2, '0')} de ${String(totalParts).padStart(2, '0')}</p>
        <p style="margin:6px 0 0;font-size:11.5px;line-height:1.5;">Período do relatório: fevereiro a abril de 2026</p>
        <p style="margin:4px 0 0;font-size:11.5px;line-height:1.5;">Capítulos desta parte: ${sectionLabels.join(', ')}</p>
      </div>
    </section>
  `;

  const content = `${partNumber === 1 && summaryHtml ? summaryHtml : ''}${header}`;

  if (html.includes('<body>')) {
    return html.replace('<body>', `<body>${content}`);
  }

  return `${content}${html}`;
}

function buildPartsFromMeasuredSections(sectionMeasures = []) {
  const orderedMeasures = Array.isArray(sectionMeasures) ? sectionMeasures.filter(Boolean) : [];
  const parts = [];
  let currentSections = [];
  let currentSize = 0;

  orderedMeasures.forEach((measure) => {
    if (measure.sizeBytes > MAX_EXPORT_PART_SIZE_BYTES) {
      if (currentSections.length > 0) {
        parts.push({ secoes: currentSections, estimatedSizeBytes: currentSize, oversizedSingleChapter: false });
        currentSections = [];
        currentSize = 0;
      }

      parts.push({
        secoes: [measure.sectionId],
        estimatedSizeBytes: measure.sizeBytes,
        oversizedSingleChapter: true,
      });
      return;
    }

    const wouldExceedLimit =
      currentSections.length > 0 &&
      currentSize + measure.sizeBytes > MAX_EXPORT_PART_SIZE_BYTES;

    if (wouldExceedLimit) {
      parts.push({ secoes: currentSections, estimatedSizeBytes: currentSize, oversizedSingleChapter: false });
      currentSections = [];
      currentSize = 0;
    }

    currentSections.push(measure.sectionId);
    currentSize += measure.sizeBytes;
  });

  if (currentSections.length > 0) {
    parts.push({ secoes: currentSections, estimatedSizeBytes: currentSize, oversizedSingleChapter: false });
  }

  return parts;
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
    programacaoRaw,
    conhecimentoRaw,
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 2000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 2000),
    safeList(base44.entities.PurchaseRequest, '-created_date', 2000),
    safeList(base44.entities.TeamPayment, '-created_date', 2000),
    safeList(base44.entities.DocumentIntake, '-created_date', 2000),
    safeList(base44.entities.Attachment, '-created_date', 3000),
    safeList(base44.entities.Programacao, '-data_inicio', 3000),
    carregarBaseConhecimento(),
  ]);

  const contexto = buildRelatorioFisicoFinanceiroContext({
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    teamPaymentsRaw,
    documentIntakeRaw,
    attachmentsRaw,
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
  const [exportMode, setExportMode] = useState('single');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [secoes, setSecoes] = useState(buildReportChapterSelectionState());
  const [photoSelectionDialog, setPhotoSelectionDialog] = useState(false);
  const [photoSelectionCandidates, setPhotoSelectionCandidates] = useState([]);
  const [selectedInlinePhotoIds, setSelectedInlinePhotoIds] = useState({});

  const secoesSelecionadas = getSelectedReportChapterIds(secoes);
  const toggleSecao = (id) => setSecoes((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTodas = (value) => setSecoes(buildReportChapterSelectionState(value ? REPORT_CHAPTER_IDS : []));
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
    const validation = validateReportExportWithRegistry(html, selectedIds);
    if (!validation.valid) {
      const missingTitles = validation.missingSelected.map(getCapituloLabel);
      throw new Error(`Os seguintes capítulos selecionados não foram renderizados: ${missingTitles.join(', ')}.`);
    }

    const editorialValidation = validateReportBeforeExport(reportContext, html, selectedIds);
    if (!editorialValidation.valid) {
      throw new Error(`Validação editorial bloqueou a exportação: ${editorialValidation.errors.join(' ')}`);
    }
    if (editorialValidation.warnings.length > 0) {
      console.warn('Alertas editoriais antes da exportação:', editorialValidation.warnings);
    }
  };
  const runExport = async (inlinePhotoIds = []) => {
    const normalizedSelectedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);

    if (normalizedSelectedSections.length === 0) {
      toast.error('Selecione ao menos um capítulo.');
      return;
    }

    try {
      sessionStorage.setItem('relatorio_fisico_financeiro_selected_chapters', JSON.stringify(normalizedSelectedSections));
      sessionStorage.setItem('relatorio_fisico_financeiro_export_mode', exportMode);
    } catch {}

    setLoading(true);
    updateProgress(4, 'Iniciando geração do relatório', `${normalizedSelectedSections.length} capítulos selecionados`);
    setResultado(null);
    setErro(null);

    try {
      toast.info(exportMode === 'split' ? 'Preparando exportação dividida...' : 'Preparando exportação em arquivo único...');

      let data = null;
      let fonte = modoPremium ? 'premium_app' : 'backend';

      if (!modoPremium) {
        try {
          updateProgress(12, 'Consultando geração principal', 'Tentando usar a função evoluída do backend');
          const response = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
            museu: museu === 'Todos' ? null : museu,
            formato: 'abrangente',
            usar_fotos_app: true,
            incluir_relatorios_equipe: true,
            refinar_textos_ia: true,
          });

          if (response?.data?.html) {
            data = {
              ...response.data,
              html: await optimizeReportHtmlImages(response.data.html, REPORT_IMAGE_OPTIMIZATION_OPTIONS),
            };
          }
        } catch (backendError) {
          console.warn(
            'gerarRelatorioFisicoFinanceiro indisponível. Gerando no frontend com dados do app e textos refinados por IA.',
            backendError
          );
        }
      }

      if (!data?.html) {
        updateProgress(28, 'Consolidando dados e capítulos', 'Montando o relatório com dados reais do app');
        const local = await gerarRelatorioDoApp(museu, {
          premium: modoPremium,
          secoesSelecionadas: normalizedSelectedSections,
          selectedInlinePhotoIds: inlinePhotoIds,
        });
        data = { html: local.html, contexto: local.contexto };
        fonte = modoPremium ? 'premium_app' : 'frontend_ia';
      }

      const htmlSize = new Blob([data.html], { type: 'text/html;charset=utf-8' }).size;

      if (exportMode === 'single' || htmlSize <= MAX_EXPORT_PART_SIZE_BYTES) {
        updateProgress(88, 'Finalizando arquivo único', 'Preparando prévia e download');
        if (exportMode === 'split' && htmlSize <= MAX_EXPORT_PART_SIZE_BYTES) {
          toast.info('O relatório ficou abaixo de 200 MB e foi mantido em arquivo único.');
        }

        validateBeforeExport(data.html, normalizedSelectedSections, data.contexto);

        setResultado({
          ...data,
          fonte,
          exportMode: 'single',
          htmlSize,
        });
        updateProgress(100, 'Relatório concluído', 'Arquivo único pronto');
        openPreview(data.html);
      } else {
        const measuredSections = [];

        for (let index = 0; index < normalizedSelectedSections.length; index += 1) {
          const sectionId = normalizedSelectedSections[index];
          const percent = 30 + ((index + 1) / Math.max(1, normalizedSelectedSections.length)) * 28;
          updateProgress(percent, 'Medindo capítulos para divisão', `${index + 1} de ${normalizedSelectedSections.length} capítulos analisados`);
          const chapterResult = await gerarRelatorioDoApp(museu, {
            premium: modoPremium,
            secoesSelecionadas: [sectionId],
            selectedInlinePhotoIds: inlinePhotoIds,
          });
          validateBeforeExport(chapterResult.html, [sectionId], chapterResult.contexto);
          const chapterSize = new Blob([chapterResult.html], { type: 'text/html;charset=utf-8' }).size;
          measuredSections.push({
            sectionId,
            sizeBytes: chapterSize,
            label: getCapituloLabel(sectionId),
          });
        }

        const builtParts = buildPartsFromMeasuredSections(measuredSections);

        if (builtParts.length === 0) {
          builtParts.push({
            secoes: normalizedSelectedSections,
            estimatedSizeBytes: htmlSize,
            oversizedSingleChapter: false,
          });
        }

        const totalParts = builtParts.length;
        const summaryHtml = buildDivisionSummary(
          builtParts.map((part, index) => ({
            partNumber: index + 1,
            sectionLabels: part.secoes.map(getCapituloLabel),
          }))
        );

        const finalParts = [];
        for (let index = 0; index < builtParts.length; index += 1) {
          const part = builtParts[index];
          const partNumber = index + 1;
          const percent = 62 + (partNumber / Math.max(1, totalParts)) * 30;
          updateProgress(percent, 'Gerando partes do relatório', `${partNumber} de ${totalParts} partes em preparação`);
          if (part.oversizedSingleChapter && part.secoes.length === 1) {
            toast.info(`O capítulo ${getCapituloLabel(part.secoes[0])} excede 200 MB e foi exportado em arquivo próprio para preservar a integridade do PDF.`);
          }
          const splitContext = {
            enabled: true,
            partNumber,
            totalParts,
            sectionLabels: part.secoes.map(getCapituloLabel),
            subdivisionOf: null,
          };

          const localPart = await gerarRelatorioDoApp(museu, {
            premium: modoPremium,
            secoesSelecionadas: part.secoes,
            splitContext,
            selectedInlinePhotoIds: inlinePhotoIds,
          });

          const htmlPart = injectPartMetadata(localPart.html, {
            partNumber,
            totalParts,
            sectionLabels: splitContext.sectionLabels,
            summaryHtml,
          });
          validateBeforeExport(htmlPart, part.secoes, localPart.contexto);

          finalParts.push({
            partNumber,
            totalParts,
            fileName: buildPartFileName(partNumber),
            html: htmlPart,
            sizeBytes: new Blob([htmlPart], { type: 'text/html;charset=utf-8' }).size,
            sectionLabels: splitContext.sectionLabels,
            secoes: part.secoes,
          });

          toast.success(`Parte ${String(partNumber).padStart(2, '0')} preparada com ${splitContext.sectionLabels.join(', ')}.`);
        }

        setResultado({
          ...data,
          fonte,
          exportMode: 'split',
          htmlSize,
          parts: finalParts,
        });
        updateProgress(100, 'Relatório concluído', `${finalParts.length} partes prontas para visualização e download`);
        openPreview(finalParts[0]?.html || data.html);
      }

      setDialogAberto(false);
      toast.success(
        fonte === 'premium_app'
          ? 'Relatório institucional gerado.'
          : fonte === 'backend'
            ? 'Relatório gerado pela função evoluída.'
            : 'Relatório gerado com dados reais do app e IA.'
      );
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Não foi possível gerar o relatório.');
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 1200);
    }
  };

  const getSelectedInlineIds = () => Object.entries(selectedInlinePhotoIds)
    .filter(([, selected]) => selected)
    .map(([photoId]) => photoId);

  const handleGerar = async () => {
    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos um capítulo.');
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

      await runExport(selectedIds);
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
                  Exportação preparada em {resultado.parts.length} partes, respeitando a ordem dos capítulos selecionados.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            {resultado.exportMode === 'split' && Array.isArray(resultado.parts) && resultado.parts.length > 1 ? (
              <>
                <Button variant="outline" size="sm" onClick={() => openPreview(resultado.parts[0]?.html || resultado.html)}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Parte 01
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resultado.parts.forEach((part) => downloadNamedHtml(part.html, part.fileName))}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar todas as partes
                </Button>
                {resultado.parts.map((part) => (
                  <Button
                    key={part.fileName}
                    variant="outline"
                    size="sm"
                    onClick={() => downloadNamedHtml(part.html, part.fileName)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {`Parte ${String(part.partNumber).padStart(2, '0')}`}
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
                await runExport(selectedIds);
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

            <div className="space-y-3">
              <Label>Modo de exportação</Label>
              <div className="grid md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportMode('single')}
                  className={`rounded-xl border p-4 text-left transition-colors ${exportMode === 'single' ? 'border-black bg-black/5' : 'border-slate-200 bg-white'}`}
                >
                  <p className="text-sm font-semibold text-slate-900">Exportar em arquivo único</p>
                  <p className="text-xs text-slate-500 mt-1">Mantém exatamente o fluxo atual da exportação.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportMode('split')}
                  className={`rounded-xl border p-4 text-left transition-colors ${exportMode === 'split' ? 'border-black bg-black/5' : 'border-slate-200 bg-white'}`}
                >
                  <p className="text-sm font-semibold text-slate-900">Dividir em arquivos de até 200 MB</p>
                  <p className="text-xs text-slate-500 mt-1">Agrupa os capítulos em partes válidas antes da geração final do HTML/PDF.</p>
                </button>
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
              {REPORT_CHAPTERS.map((capitulo) => (
                <label key={capitulo.id} className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-3 py-2 cursor-pointer">
                  <Checkbox checked={!!secoes[capitulo.id]} onCheckedChange={() => toggleSecao(capitulo.id)} />
                  <span className="text-sm text-slate-700">{capitulo.title}</span>
                </label>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              {secoesSelecionadas.length} de {REPORT_CHAPTERS.length} capítulos selecionados.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={handleGerar} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Gerar relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
