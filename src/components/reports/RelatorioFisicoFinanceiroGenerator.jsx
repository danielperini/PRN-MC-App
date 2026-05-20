import React, { useMemo, useState } from 'react';
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
const OPENING_CHAPTER_IDS = ['capa', 'expediente', 'sumario_executivo', 'introducao'];
const CHAPTER_MUSEUM_WEIGHT = {
  agenda_programacao: 1.7,
  atividades_museu: 2.2,
  museus_premium: 1.8,
  relatorios_completos: 1.6,
  comunicacao: 1.3,
  comunicacao_premium: 1.2,
  financeiro: 1.5,
  rubricas: 1.4,
  orcamento_museu: 1.4,
  prestacao: 1.5,
  'notas-fiscais-contratos': 1.8,
  governanca_documental: 1.2,
};

const GENERATION_MODE_OPTIONS = [
  {
    id: 'all_volumes',
    title: 'Gerar relatorio em 3 volumes editoriais',
    description: 'Distribui 100% do conteudo selecionado entre Volume 1, Volume 2 e Volume 3, sem repetir capitulos, imagens ou paginas institucionais.',
    volumes: [1, 2, 3],
  },
  {
    id: 'volume_1',
    title: 'Gerar apenas Volume 1',
    description: 'Gera a abertura institucional, atividades por museu, comunicacao, orcamento por museu e sintese inicial.',
    volumes: [1],
  },
  {
    id: 'volume_2',
    title: 'Gerar apenas Volume 2',
    description: 'Gera a continuacao do relatorio com execucao financeira, prestacao de contas, rubricas, notas fiscais, contratos e governanca financeira.',
    volumes: [2],
  },
  {
    id: 'volume_3',
    title: 'Gerar apenas Volume 3',
    description: 'Gera a continuacao final com Museu Centro APP, auditoria operacional, anexos analiticos, memoria institucional e conclusao.',
    volumes: [3],
  },
];

const EDITORIAL_VOLUMES = [
  {
    number: 1,
    title: 'Volume 1 — Abertura institucional, atividades e orcamento por museu',
    description: 'Este volume abre a publicacao e apresenta a leitura institucional do periodo, as atividades por equipamento, comunicacao e analise orcamentaria por museu.',
    chapters: [
      { code: '1', title: 'Capa editorial', sectionIds: ['capa'] },
      { code: '2', title: 'Expediente institucional', sectionIds: ['expediente'] },
      { code: '3', title: 'Sumario executivo', sectionIds: ['sumario_executivo', 'indicadores_premium', 'resumo_geral'] },
      { code: '4', title: 'Introducao institucional', sectionIds: ['introducao', 'territorio', 'publico'] },
      { code: '5', title: 'Atividades por museu', sectionIds: ['atividades_museu', 'museus_premium', 'noturno_premium'] },
      { code: '6', title: 'Comunicacao, registros e evidencias', sectionIds: ['comunicacao'] },
      { code: '7', title: 'Orcamento por Museu', sectionIds: ['orcamento_museu'] },
      { code: '8', title: 'Sintese, alertas e governanca', sectionIds: ['auditoria_operacional'] },
    ],
  },
  {
    number: 2,
    title: 'Volume 2 — Execucao financeira, prestacao de contas e documentos',
    description: 'Este volume consolida a execucao financeira, prestacao de contas, rubricas, pagamentos, notas fiscais, contratos e alertas de rastreabilidade.',
    chapters: [
      { code: '9', title: 'Execucao financeira', sectionIds: ['financeiro'] },
      { code: '10', title: 'Prestacao de contas', sectionIds: ['prestacao'] },
      { code: '11', title: 'Governanca financeira e rastreabilidade', sectionIds: ['governanca_documental', 'rubricas'] },
      { code: '12', title: 'Metas do 3o Aditivo', sectionIds: ['metas'] },
      { code: '13', title: 'Sintese financeira do periodo', sectionIds: ['financeiro', 'prestacao', 'rubricas', 'governanca_documental'] },
    ],
  },
  {
    number: 3,
    title: 'Volume 3 — Sistema, auditoria, anexos e conclusao',
    description: 'Este volume encerra o relatorio com sistema, governanca de dados, auditoria operacional, anexos analiticos e conclusao institucional.',
    chapters: [
      { code: '14', title: 'Museu Centro APP', sectionIds: ['app_museu_centro', 'sistema_governanca'] },
      { code: '15', title: 'Auditoria operacional do periodo', sectionIds: ['auditoria_operacional'] },
      { code: '16', title: 'Comunicacao editorial e memoria institucional', sectionIds: ['comunicacao_premium', 'galeria_premium'] },
      { code: '17', title: 'Anexos analiticos', sectionIds: ['agenda_programacao', 'relatorios_completos', 'notas-fiscais-contratos', 'galeria_evidencias'] },
      { code: '18', title: 'Conclusao institucional', sectionIds: ['conclusao'] },
    ],
  },
];
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



function estimateChapterWeight(sectionId, context = {}) {
  const base = CHAPTER_MUSEUM_WEIGHT[sectionId] || 1;
  const activities = Array.isArray(context?.atividades) ? context.atividades.length : 0;
  const photos = Array.isArray(context?.fotos) ? context.fotos.length : 0;
  const docs = Array.isArray(context?.attachments_raw) ? context.attachments_raw.length : 0;
  const multiplier = 1 + (activities / 600) + (photos / 1200) + (docs / 1800);
  return Number((base * multiplier).toFixed(3));
}


function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function chapterHasRenderableContent(sectionId, context = {}) {
  const atividades = Array.isArray(context?.atividades) ? context.atividades : [];
  const fotos = Array.isArray(context?.fotos) ? context.fotos : [];
  const rubricas = Array.isArray(context?.rubricas) ? context.rubricas : [];
  const compras = Array.isArray(context?.compras) ? context.compras : [];
  const relatorios = Array.isArray(context?.relatorios_equipe) ? context.relatorios_equipe : [];
  const programacao = Array.isArray(context?.programacao) ? context.programacao : [];
  const documentos = Array.isArray(context?.attachments_raw) ? context.attachments_raw : [];

  if (OPENING_CHAPTER_IDS.includes(sectionId)) return true;

  switch (sectionId) {
    case 'atividades_museu':
    case 'museus_premium':
      return atividades.length > 0;
    case 'comunicacao':
    case 'comunicacao_premium':
      return atividades.length > 0 || fotos.length > 0;
    case 'programacao':
    case 'agenda_programacao':
    case 'timeline_premium':
      return programacao.length > 0 || atividades.length > 0;
    case 'relatorios_completos':
      return relatorios.length > 0;
    case 'financeiro':
    case 'rubricas':
    case 'orcamento_museu':
      return rubricas.length > 0 || compras.length > 0;
    case 'prestacao':
    case 'notas-fiscais-contratos':
    case 'governanca_documental':
      return documentos.length > 0 || compras.length > 0;
    case 'galeria_evidencias':
    case 'galeria_premium':
      return fotos.length > 0;
    default:
      return true;
  }
}

function buildFullReportPlan(sectionIds = [], context = {}) {
  const ids = Array.isArray(sectionIds) ? sectionIds.filter(Boolean) : [];
  return ids
    .filter((id) => chapterHasRenderableContent(id, context))
    .map((id) => ({
      id,
      title: getCapituloLabel(id),
      weight: estimateChapterWeight(id, context),
      onlyVolume1: OPENING_CHAPTER_IDS.includes(id),
    }));
}

function buildVolumeParts(sectionIds = [], context = {}) {
  const plan = buildFullReportPlan(sectionIds, context);
  const opening = plan.filter((item) => item.onlyVolume1);
  const body = plan.filter((item) => !item.onlyVolume1);
  const baseParts = Array.from({ length: EXPORT_VOLUME_COUNT }, (_, index) => ({
    partNumber: index + 1,
    totalParts: EXPORT_VOLUME_COUNT,
    secoes: [],
    sectionPlan: [],
    estimatedWeight: 0,
    estimatedPages: 0,
    estimatedMB: 0,
    estimatedImages: 0,
    status: 'adequado',
  }));

  opening.forEach((item) => {
    baseParts[0].secoes.push(item.id);
    baseParts[0].sectionPlan.push(item);
    baseParts[0].estimatedWeight += item.weight;
  });

  const bodyTotalWeight = body.reduce((sum, item) => sum + item.weight, 0);
  const perPartTarget = bodyTotalWeight > 0 ? bodyTotalWeight / EXPORT_VOLUME_COUNT : 0;
  let partIndex = 0;
  let currentBodyWeight = 0;

  body.forEach((item, index) => {
    const current = baseParts[partIndex];
    current.secoes.push(item.id);
    current.sectionPlan.push(item);
    current.estimatedWeight += item.weight;
    currentBodyWeight += item.weight;

    const remainingChapters = body.length - index - 1;
    const remainingParts = EXPORT_VOLUME_COUNT - partIndex - 1;
    const canAdvance = partIndex < EXPORT_VOLUME_COUNT - 1 && remainingChapters >= remainingParts;

    if (canAdvance && currentBodyWeight >= perPartTarget) {
      partIndex += 1;
      currentBodyWeight = 0;
    }
  });

  baseParts.forEach((part) => {
    if (part.secoes.length === 0) {
      part.status = 'sem conteudo';
      return;
    }

    part.estimatedPages = Math.max(2, Math.round(part.estimatedWeight * 3.4));
    part.estimatedImages = Math.max(0, Math.round(part.estimatedWeight * 4));
    part.estimatedMB = Number(Math.max(0.8, part.estimatedWeight * 2.1).toFixed(1));
    if (part.estimatedMB > 180) part.status = 'volume muito pesado';
  });

  return baseParts;
}

function injectPartMetadata(html, { partNumber, totalParts, sectionLabels = [], pageNumberOffset = 0 } = {}) {
  if (!html) return html;
  if (Number(partNumber) === 1) return html;

  const startPage = Number(pageNumberOffset || 0) + 1;
  const header = `
    <section style="max-width:210mm;margin:0 auto 18px;padding:0 24px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#333;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:14px 18px;background:#fff;">
        <p style="margin:0;font-size:13px;font-weight:700;">Relatório Institucional Museus Centro</p>
        <p style="margin:6px 0 0;font-size:12px;font-weight:700;">Volume ${String(partNumber).padStart(2, '0')} de ${String(totalParts).padStart(2, '0')}</p>
        <p style="margin:4px 0 0;font-size:11.5px;line-height:1.5;">Continuação do Volume ${String(Math.max(1, Number(partNumber) - 1)).padStart(2, '0')} · início na página ${startPage}</p>
        <p style="margin:4px 0 0;font-size:11.5px;line-height:1.5;">Neste volume: ${sectionLabels.join(', ')}</p>
      </div>
    </section>
  `;

  if (html.includes('<body>')) {
    return html.replace('<body>', `<body>${header}`);
  }

  return `${header}${html}`;
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

const PREVIEW_DB_NAME = 'museus_centro_report_preview';
const PREVIEW_DB_STORE = 'previews';
const PREVIEW_HTML_KEY = 'latest_html';

function savePreviewHtmlToIndexedDb(html) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const request = indexedDB.open(PREVIEW_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) {
        db.createObjectStore(PREVIEW_DB_STORE);
      }
    };

    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(PREVIEW_DB_STORE, 'readwrite');
      tx.objectStore(PREVIEW_DB_STORE).put({
        html,
        savedAt: new Date().toISOString(),
      }, PREVIEW_HTML_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    };
  });
}

async function salvarPreview(html) {
  try {
    sessionStorage.setItem('relatorio_fisico_financeiro_html', html);
  } catch (error) {
    console.warn('Não foi possível salvar a prévia do relatório em sessionStorage:', error);
  }

  try {
    localStorage.setItem('relatorio_fisico_financeiro_html', html);
    localStorage.setItem('relatorio_fisico_financeiro_html_saved_at', new Date().toISOString());
  } catch (error) {
    console.warn('Não foi possível salvar a prévia do relatório em localStorage:', error);
  }

  await savePreviewHtmlToIndexedDb(html);
}

function salvarMetadadosVolume(volumeMeta = {}) {
  const payload = JSON.stringify({
    volumeNumber: Number(volumeMeta.volumeNumber) || Number(volumeMeta.partNumber) || 1,
    totalVolumes: Number(volumeMeta.totalVolumes) || EXPORT_VOLUME_COUNT,
    pageNumberOffset: Number(volumeMeta.pageNumberOffset) || 0,
  });

  try {
    sessionStorage.setItem('relatorio_fisico_financeiro_export_volume', payload);
    localStorage.setItem('relatorio_fisico_financeiro_export_volume', payload);
  } catch (error) {
    console.warn('Não foi possível salvar os metadados do volume:', error);
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
  const [generationMode, setGenerationMode] = useState('all_volumes');
  const [requestedVolumes, setRequestedVolumes] = useState([1]);
  const [requestedVolume, setRequestedVolume] = useState(1);
  const [lastPageVolume1, setLastPageVolume1] = useState('');
  const [lastPageVolume2, setLastPageVolume2] = useState('');
  const [secoes, setSecoes] = useState(buildReportChapterSelectionState());
  const [photoSelectionDialog, setPhotoSelectionDialog] = useState(false);
  const [photoSelectionCandidates, setPhotoSelectionCandidates] = useState([]);
  const [selectedInlinePhotoIds, setSelectedInlinePhotoIds] = useState({});

  const secoesSelecionadas = getSelectedReportChapterIds(secoes);
  const volumeParts = useMemo(
    () => buildVolumeParts(normalizeSelectedReportChapterIds(secoesSelecionadas), {}),
    [secoesSelecionadas]
  );
  const editorialSectionIds = useMemo(
    () => Array.from(new Set(EDITORIAL_VOLUMES.flatMap((volume) => volume.chapters.flatMap((chapter) => chapter.sectionIds)))),
    []
  );
  const allEditorialChapterCount = useMemo(
    () => EDITORIAL_VOLUMES.reduce((sum, volume) => sum + volume.chapters.length, 0),
    []
  );
  const allIdsSelected = (ids = []) => ids.every((id) => secoes[id]);
  const selectedEditorialChapterCount = useMemo(
    () => EDITORIAL_VOLUMES.reduce(
      (sum, volume) => sum + volume.chapters.filter((chapter) => allIdsSelected(chapter.sectionIds)).length,
      0
    ),
    [secoes]
  );

  const toggleSecao = (id) => setSecoes((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTodas = (value) => setSecoes(buildReportChapterSelectionState(value ? editorialSectionIds : []));
  const setIdsSelection = (ids = [], value = true) => {
    setSecoes((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = value;
      });
      return next;
    });
  };
  const selectOnlyIds = (ids = []) => setSecoes(buildReportChapterSelectionState(ids));
  const getModeVolumes = (mode = generationMode) => GENERATION_MODE_OPTIONS.find((item) => item.id === mode)?.volumes || [1, 2, 3];
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
  const getAutomaticPageOffset = (volumeNumber, parts = volumeParts) => {
    if (volumeNumber === 1) return 0;
    return parts
      .filter((part) => part.partNumber < volumeNumber)
      .reduce((sum, part) => sum + Number(part.estimatedPages || 0), 0);
  };

  const openPreview = async (html) => {
    await salvarPreview(html);
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

  const runExportBundle = async (inlinePhotoIds = [], targetVolumes = [1], automaticOffsets = false) => {
    const normalizedSelectedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);
    if (normalizedSelectedSections.length === 0) {
      toast.error('Selecione ao menos um capítulo editorial.');
      return;
    }

    setLoading(true);
    setResultado(null);
    setErro(null);
    updateProgress(8, 'Buscando dados do dashboard', 'Preparando distribuição editorial entre os volumes');

    try {
      const fullData = await gerarRelatorioDoApp(museu, {
        premium: modoPremium,
        secoesSelecionadas: normalizedSelectedSections,
        selectedInlinePhotoIds: inlinePhotoIds,
      });

      const allVolumeParts = buildVolumeParts(normalizedSelectedSections, fullData?.contexto || {});
      const selectedParts = allVolumeParts.filter((part) => targetVolumes.includes(part.partNumber) && part.secoes.length > 0);
      if (selectedParts.length === 0) throw new Error('Nenhum volume possui conteúdo renderizável para a seleção atual.');

      const builtParts = [];
      for (let index = 0; index < selectedParts.length; index += 1) {
        const part = selectedParts[index];
        const pageNumberOffset = automaticOffsets
          ? getAutomaticPageOffset(part.partNumber, allVolumeParts)
          : getVolumePageOffset(part.partNumber);

        if (pageNumberOffset === null) {
          setLoading(false);
          return;
        }

        updateProgress(42 + ((index + 1) / selectedParts.length) * 42, `Gerando Volume ${part.partNumber}`, part.secoes.map(getCapituloLabel).join(', '));
        const splitContext = {
          enabled: true,
          partNumber: part.partNumber,
          totalParts: EXPORT_VOLUME_COUNT,
          sectionLabels: part.secoes.map(getCapituloLabel),
          pageNumberOffset,
          subdivisionOf: null,
        };
        const localPart = await gerarRelatorioDoApp(museu, {
          premium: modoPremium,
          secoesSelecionadas: part.secoes,
          splitContext,
          selectedInlinePhotoIds: inlinePhotoIds,
        });

        const htmlPart = injectPartMetadata(localPart.html, {
          partNumber: part.partNumber,
          totalParts: EXPORT_VOLUME_COUNT,
          sectionLabels: splitContext.sectionLabels,
          pageNumberOffset,
        });
        validateBeforeExport(htmlPart, part.secoes, localPart.contexto);

        builtParts.push({
          partNumber: part.partNumber,
          totalParts: EXPORT_VOLUME_COUNT,
          fileName: buildPartFileName(part.partNumber),
          html: htmlPart,
          sizeBytes: new Blob([htmlPart], { type: 'text/html;charset=utf-8' }).size,
          sectionLabels: splitContext.sectionLabels,
          secoes: part.secoes,
          pageNumberOffset,
        });
      }

      const firstPart = builtParts[0];
      salvarMetadadosVolume({
        volumeNumber: firstPart.partNumber,
        totalVolumes: EXPORT_VOLUME_COUNT,
        pageNumberOffset: firstPart.pageNumberOffset,
      });
      setResultado({
        html: firstPart.html,
        contexto: fullData.contexto,
        fonte: modoPremium ? 'premium_app' : 'frontend_ia',
        exportMode: builtParts.length > 1 ? 'split' : 'volume',
        htmlSize: firstPart.sizeBytes,
        volumeNumber: firstPart.partNumber,
        pageNumberOffset: firstPart.pageNumberOffset,
        parts: builtParts,
      });

      updateProgress(100, 'Relatório concluído', builtParts.length > 1 ? 'Volumes preparados para exportação HTML/PDF.' : `Volume ${firstPart.partNumber} pronto para visualização e PDF`);
      await openPreview(firstPart.html);
      setDialogAberto(false);
      toast.success(builtParts.length > 1 ? 'Relatório preparado em 3 volumes editoriais.' : `Volume ${firstPart.partNumber} gerado com dados reais do aplicativo.`);
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Não foi possível gerar os volumes do relatório.');
      toast.error('Não foi possível gerar os volumes do relatório.');
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 1200);
    }
  };

  const runExport = async (inlinePhotoIds = [], volumeNumber = requestedVolume) => {
    const normalizedSelectedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);
    let allVolumeParts = buildVolumeParts(normalizedSelectedSections, {});
    let selectedVolume = allVolumeParts.find((part) => part.partNumber === volumeNumber);
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

    salvarMetadadosVolume({
      volumeNumber,
      totalVolumes: EXPORT_VOLUME_COUNT,
      pageNumberOffset,
    });

    try {
      sessionStorage.setItem('relatorio_fisico_financeiro_selected_chapters', JSON.stringify(selectedVolume.secoes));
      sessionStorage.setItem('relatorio_fisico_financeiro_all_chapters', JSON.stringify(normalizedSelectedSections));
      sessionStorage.setItem('relatorio_fisico_financeiro_export_mode', 'volume');
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
      updateProgress(46, 'Analisando evidências visuais vinculadas às atividades...', 'Detectando imagens repetidas e aplicando uso único');
      allVolumeParts = buildVolumeParts(normalizedSelectedSections, fullData?.contexto || {});
      selectedVolume = allVolumeParts.find((part) => part.partNumber === volumeNumber);
      if (!selectedVolume || selectedVolume.secoes.length === 0) {
        throw new Error(`Volume ${volumeNumber} sem capítulos após planejamento editorial.`);
      }
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
      updateProgress(84, 'Distribuindo imagens junto das atividades...', 'Gerando plano de uso único das imagens');

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
      await openPreview(htmlPart);
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

  const pesquisarEChecarDados = async () => {
    const normalizedSelectedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);
    if (normalizedSelectedSections.length === 0) {
      toast.error('Selecione ao menos um capítulo editorial.');
      return null;
    }
    setLoading(true);
    setErro(null);
    updateProgress(12, 'Pesquisando e checando dados', 'Consolidando dashboard, relatórios, rubricas, programação e evidências');
    try {
      const { contexto } = await carregarContextoRelatorioDoApp(museu, {
        secoesSelecionadas: normalizedSelectedSections,
        selectedInlinePhotoIds: getSelectedInlineIds(),
      });
      updateProgress(36, 'Pesquisa concluída', 'Dados reais do app consolidados para o plano editorial');
      toast.success('Pesquisa e checagem concluídas.');
      return contexto;
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Não foi possível pesquisar e checar os dados.');
      toast.error('Não foi possível pesquisar e checar os dados.');
      return null;
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 900);
    }
  };

  const gerarPlanoDosVolumes = async () => {
    const contexto = await pesquisarEChecarDados();
    if (!contexto) return;
    const parts = buildVolumeParts(normalizeSelectedReportChapterIds(secoesSelecionadas), contexto);
    toast.success(`Plano editorial gerado em ${parts.filter((part) => part.secoes.length > 0).length} volumes.`);
  };

  const getSelectedInlineIds = () => Object.entries(selectedInlinePhotoIds)
    .filter(([, selected]) => selected)
    .map(([photoId]) => photoId);

  const handleGerar = async (volumeNumber) => {
    const mode = volumeNumber ? `volume_${volumeNumber}` : generationMode;
    const targetVolumes = volumeNumber ? [volumeNumber] : getModeVolumes(mode);
    setGenerationMode(mode);
    setRequestedVolume(targetVolumes[0] || 1);
    setRequestedVolumes(targetVolumes);
    if (targetVolumes.length === 1 && getVolumePageOffset(targetVolumes[0]) === null) return;

    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos um capítulo.');
      return;
    }

    const selectedTargets = volumeParts.filter((part) => targetVolumes.includes(part.partNumber) && part.secoes.length > 0);
    if (selectedTargets.length === 0) {
      toast.error(targetVolumes.length > 1 ? 'Os volumes selecionados não possuem capítulos editoriais.' : `O Volume ${targetVolumes[0]} nao possui capitulos selecionados.`);
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

      if (targetVolumes.length > 1) {
        await runExportBundle(selectedIds, targetVolumes, true);
      } else {
        await runExport(selectedIds, targetVolumes[0]);
      }
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
              Selecione quais fotos devem ser impressas no corpo das atividades. Cada imagem sera usada uma unica vez no relatorio, sem repeticao entre capa, atividades e volumes.
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
                  {activity.photos.filter(Boolean).filter((photo) => photo?.imageUrl).map((photo) => (
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
                if (requestedVolumes.length > 1) {
                  await runExportBundle(selectedIds, requestedVolumes, true);
                } else {
                  await runExport(selectedIds, requestedVolume);
                }
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
            <DialogTitle>Escolha os conteudos do relatorio</DialogTitle>
            <p className="text-sm text-slate-500">
              Selecione o museu, o formato editorial e os conteudos que serao distribuidos nos tres volumes do relatorio. Os volumes sao complementares e sequenciais: o Volume 1 abre a publicacao, o Volume 2 continua com a execucao financeira e documental, e o Volume 3 encerra com sistema, auditoria, anexos e conclusao.
            </p>
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div>
                <Label>Modo de geracao dos volumes</Label>
                <div className="mt-3 space-y-2">
                  {GENERATION_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setGenerationMode(option.id)}
                      className={`w-full rounded-xl border p-3 text-left ${generationMode === option.id ? 'border-slate-900 bg-white' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Paginacao continua</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Os volumes serao exportados como partes sequenciais de uma mesma publicacao. O Volume 1 comeca na pagina 1. O Volume 2 comeca na pagina seguinte a ultima pagina real do Volume 1. O Volume 3 comeca na pagina seguinte a ultima pagina real do Volume 2.
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Capa, expediente, sumario executivo geral e introducao institucional aparecem apenas no Volume 1.
                </p>
              </div>

              {(generationMode === 'volume_2' || generationMode === 'volume_3') && (
                <div className="grid md:grid-cols-2 gap-4">
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
                  {generationMode === 'volume_3' && (
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
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="space-y-2">
                <Label>Volumes e capitulos editoriais</Label>
                <p className="text-xs leading-5 text-slate-600">
                  Todo conteudo selecionado sera usado uma unica vez. As imagens serao vinculadas as atividades correspondentes, preservando creditos, GPS e legendas quando disponiveis. Nao havera repeticao de capitulos, paginas institucionais ou imagens entre os volumes.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button type="button" variant="outline" size="sm" onClick={() => toggleTodas(true)}>Selecionar todos os volumes</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setGenerationMode('volume_1'); selectOnlyIds(Array.from(new Set(EDITORIAL_VOLUMES[0].chapters.flatMap((chapter) => chapter.sectionIds)))); }}>Selecionar apenas Volume 1</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setGenerationMode('volume_2'); selectOnlyIds(Array.from(new Set(EDITORIAL_VOLUMES[1].chapters.flatMap((chapter) => chapter.sectionIds)))); }}>Selecionar apenas Volume 2</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setGenerationMode('volume_3'); selectOnlyIds(Array.from(new Set(EDITORIAL_VOLUMES[2].chapters.flatMap((chapter) => chapter.sectionIds)))); }}>Selecionar apenas Volume 3</Button>
                <button type="button" onClick={() => toggleTodas(false)} className="ml-auto text-slate-500 hover:underline">Limpar selecao</button>
              </div>
              <div className="space-y-4">
                {EDITORIAL_VOLUMES.map((volume) => {
                  const volumeSectionIds = Array.from(new Set(volume.chapters.flatMap((chapter) => chapter.sectionIds)));
                  const volumeChecked = allIdsSelected(volumeSectionIds);
                  const part = volumeParts.find((item) => item.partNumber === volume.number);
                  return (
                    <div key={`editorial-volume-${volume.number}`} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{volume.title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{volume.description}</p>
                        </div>
                        <Checkbox checked={volumeChecked} onCheckedChange={(value) => setIdsSelection(volumeSectionIds, !!value)} />
                      </div>
                      <div className="grid gap-2">
                        {volume.chapters.map((chapter) => (
                          <label key={`${volume.number}-${chapter.code}-${chapter.title}`} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 cursor-pointer">
                            <Checkbox checked={allIdsSelected(chapter.sectionIds)} onCheckedChange={(value) => setIdsSelection(chapter.sectionIds, !!value)} className="mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">{chapter.code}. {chapter.title}</p>
                              <p className="mt-1 text-[11px] leading-5 text-slate-500">{chapter.sectionIds.map(getCapituloLabel).join(' • ')}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      {part && (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                          <div><p className="font-medium text-slate-900">Capitulos</p><p>{volume.chapters[0]?.code} a {volume.chapters[volume.chapters.length - 1]?.code}</p></div>
                          <div><p className="font-medium text-slate-900">Paginas estimadas</p><p>{part.estimatedPages}</p></div>
                          <div><p className="font-medium text-slate-900">Imagens estimadas</p><p>{part.estimatedImages}</p></div>
                          <div><p className="font-medium text-slate-900">Tamanho estimado</p><p>{part.estimatedMB} MB - {part.status}</p></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Uso das imagens</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">As imagens serao usadas como evidencias das atividades as quais estao vinculadas nos relatorios da equipe. Cada imagem sera usada uma unica vez no relatorio inteiro. Imagens usadas na capa, em abertura de volume ou em uma atividade nao serao repetidas em outro capitulo ou volume.</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">A antiga galeria final sera substituida pela distribuicao das imagens junto as atividades correspondentes, preservando creditos, GPS, legenda e fonte quando disponiveis.</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {selectedEditorialChapterCount === allEditorialChapterCount ? (
                <>
                  <p className="text-sm font-semibold text-slate-900">{allEditorialChapterCount} capitulos editoriais selecionados em 3 volumes.</p>
                  <p className="mt-1 text-xs text-slate-600">100% do conteudo antigo sera redistribuido.</p>
                  <p className="mt-1 text-xs text-slate-600">Imagens serao usadas uma unica vez, vinculadas as atividades.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-900">{selectedEditorialChapterCount} de {allEditorialChapterCount} capitulos editoriais selecionados.</p>
                  <p className="mt-1 text-xs text-amber-700">Atencao: alguns conteudos antigos poderao ficar fora da geracao.</p>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={loading}>Cancelar</Button>
            <Button variant="outline" onClick={pesquisarEChecarDados} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Pesquisar e checar dados
            </Button>
            <Button variant="outline" onClick={gerarPlanoDosVolumes} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Gerar plano dos volumes
            </Button>
            <Button onClick={() => handleGerar()} disabled={loading || secoesSelecionadas.length === 0}>
              {loading && generationMode === 'all_volumes' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Gerar relatorio em 3 volumes
            </Button>
            {[1, 2, 3].map((volumeNumber) => {
              const volume = volumeParts.find((part) => part.partNumber === volumeNumber);
              const disabled = loading || secoesSelecionadas.length === 0 || !volume || volume.secoes.length === 0;
              return (
                <Button key={volumeNumber} variant="outline" onClick={() => handleGerar(volumeNumber)} disabled={disabled}>
                  {loading && requestedVolume === volumeNumber && requestedVolumes.length === 1 ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                  {`Gerar apenas Volume ${volumeNumber}`}
                </Button>
              );
            })}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
