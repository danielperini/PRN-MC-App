import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, Download, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import { validateReportBeforeExport } from '@/utils/reportDataNormalizer';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';
import { montarHtmlRelatorioPremium } from '@/components/reports/premium/PremiumReportLayout';
import { revisarHtmlRelatorioAntesDaExportacao } from '@/services/reportEditorialReview';
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
import {
  buildEditorialVolumePlan as buildPipelineVolumeParts,
  buildActivitiesReport,
  buildPartFileName as buildPipelinePartFileName,
  buildReportDataContext as buildPipelineReportDataContext,
  buildSeparatedReportsHtml,
  buildSingleReportHtml,
  buildVolumeHtml as buildPipelineVolumeHtml,
  buildVolumeMeta,
  clearReportDataCache,
  cleanEmptyReportSections,
  saveReportPreview,
  saveSingleReportPreview,
  saveVolumePreview,
} from '@/services/reportExportPipeline';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];
const EXPORT_VOLUME_COUNT = 3;
const EXPORT_FILENAME_BASE = 'Museus-Centro-Relatorio';
const SECOES_RELATORIO = REPORT_CHAPTER_IDS;
const SECOES_RELATORIO_COMPLETO = normalizeSelectedReportChapterIds(REPORT_CHAPTER_IDS);
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
    title: 'Volume 1 â€” Abertura institucional, comunicação e orçamento por museu',
    description: 'Este volume abre a publicação e apresenta a leitura institucional do período, comunicação e análise orçamentária por museu.',
    chapters: [
      { code: '1', title: 'Capa editorial', sectionIds: ['capa'] },
      { code: '2', title: 'Expediente institucional', sectionIds: ['expediente'] },
      { code: '3', title: 'Sumario executivo', sectionIds: ['sumario_executivo', 'indicadores_premium', 'resumo_geral'] },
      { code: '4', title: 'Introducao institucional', sectionIds: ['introducao', 'territorio', 'publico'] },
      { code: '6', title: 'Comunicacao, registros e evidencias', sectionIds: ['comunicacao'] },
      { code: '7', title: 'Orcamento por Museu', sectionIds: ['orcamento_museu'] },
    ],
  },
  {
    number: 2,
    title: 'Volume 2 â€” Execucao financeira, prestacao de contas e documentos',
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
    title: 'Volume 3 â€” Sistema, auditoria, anexos e conclusao',
    description: 'Este volume encerra o relatorio com sistema, governanca de dados, auditoria operacional, anexos analiticos e conclusao institucional.',
    chapters: [
      { code: '14', title: 'Museu Centro APP', sectionIds: ['app_museu_centro', 'sistema_governanca'] },
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
  return buildPipelinePartFileName(partNumber, extension);
}

function buildDivisionSummary(parts = []) {
  if (!Array.isArray(parts) || parts.length <= 1) return '';

  const linhas = parts.map((part) => {
    const titulos = (part.sectionLabels || []).join(', ');
    return `Volume ${String(part.partNumber).padStart(2, '0')} â€” ${titulos}`;
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
  return buildPipelineVolumeParts(sectionIds, context);
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
        <p style="margin:4px 0 0;font-size:11.5px;line-height:1.5;">Continuação do Volume ${String(Math.max(1, Number(partNumber) - 1)).padStart(2, '0')} Â· início na página ${startPage}</p>
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
  return buildPipelineReportDataContext({
    museu,
    secoesSelecionadas,
    splitContext,
    selectedInlinePhotoIds,
  });
}

async function gerarRelatorioDoApp(museu, { premium = false, secoesSelecionadas = SECOES_RELATORIO, splitContext = null, selectedInlinePhotoIds = [] } = {}) {
  return buildPipelineVolumeHtml({
    museu,
    premium,
    secoesSelecionadas,
    splitContext,
    selectedInlinePhotoIds,
  });
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

  const getVolumePageOffset = (volumeNumber, overrideValue = undefined) => {
    if (volumeNumber === 1) return 0;

    const inputValue = overrideValue ?? (volumeNumber === 2 ? lastPageVolume1 : lastPageVolume2);
    const parsed = parsePositiveInteger(inputValue);

    if (!parsed) {
      toast.error(volumeNumber === 2
        ? 'Informe a última página do Volume 1 para gerar o Volume 2.'
        : 'Informe a última página do Volume 2 para gerar o Volume 3.');
      return null;
    }

    return parsed;
  };

  const promptVolumePageOffset = (volumeNumber) => {
    if (volumeNumber === 1) return 0;

    const label = volumeNumber === 2 ? 'Volume 1' : 'Volume 2';
    const value = window.prompt(`Informe a ultima pagina do ${label} para gerar o Volume ${volumeNumber}:`);
    if (value === null) return null;

    return getVolumePageOffset(volumeNumber, value);
  };
  const getAutomaticPageOffset = (volumeNumber, parts = volumeParts) => {
    if (volumeNumber === 1) return 0;
    return parts
      .filter((part) => part.partNumber < volumeNumber)
      .reduce((sum, part) => sum + Number(part.estimatedPages || 0), 0);
  };

  const openPreview = async (reportVariant = 'single', autoExportPdf = false) => {
    const params = new URLSearchParams();
    if (reportVariant && reportVariant !== 'single') params.set('report', reportVariant);
    if (autoExportPdf) params.set('export', 'pdf');
    const query = params.toString();
    const preview = window.open(`/RelatorioPreview${query ? `?${query}` : ''}`, '_blank', 'width=1200,height=900');
    if (preview) return null;
    toast.error('Nao foi possivel abrir a previa do relatorio.');
    return null;
  };

  const syncDashboardDataBeforeReport = async () => {
    if (typeof window === 'undefined') return;
    if (typeof window.museusCentroHardRefresh !== 'function') return;
    try {
      await window.museusCentroHardRefresh();
    } catch (error) {
      console.warn('Falha ao sincronizar dashboard antes do relatório. Seguindo com dados disponíveis.', error);
    }
  };

  const clearReportPreviewCache = async () => {
    clearReportDataCache();

    const previewKeys = [
      'relatorio_fisico_financeiro_html',
      'relatorio_fisico_financeiro_meta',
      'relatorio_fisico_financeiro_dados_html',
      'relatorio_fisico_financeiro_dados_meta',
      'relatorio_fisico_financeiro_galeria_html',
      'relatorio_fisico_financeiro_galeria_meta',
      'relatorio_fisico_financeiro_atividades_html',
      'relatorio_fisico_financeiro_atividades_meta',
      'relatorio_fisico_financeiro_html_saved_at',
      'relatorio_fisico_financeiro_dados_html_saved_at',
      'relatorio_fisico_financeiro_galeria_html_saved_at',
      'relatorio_fisico_financeiro_atividades_html_saved_at',
      'relatorio_fisico_financeiro_selected_chapters',
      'relatorio_fisico_financeiro_all_chapters',
      'relatorio_fisico_financeiro_export_mode',
      'relatorio_fisico_financeiro_export_volume',
    ];

    previewKeys.forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        console.warn(`Nao foi possivel remover ${key} do sessionStorage:`, error);
      }

      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`Nao foi possivel remover ${key} do localStorage:`, error);
      }
    });

    if (typeof indexedDB === 'undefined') return;

    try {
      await new Promise((resolve) => {
        const request = indexedDB.open(PREVIEW_DB_NAME, 1);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) {
            db.createObjectStore(PREVIEW_DB_STORE);
          }
        };

        request.onerror = () => {
          console.warn('Nao foi possivel abrir o IndexedDB de pre-visualizacao para limpeza.');
          resolve(false);
        };

        request.onsuccess = () => {
          const db = request.result;
          let settled = false;
          const finalize = () => {
            if (settled) return;
            settled = true;
            db.close();
            resolve(true);
          };

          try {
            const tx = db.transaction(PREVIEW_DB_STORE, 'readwrite');
            tx.objectStore(PREVIEW_DB_STORE).clear();
            tx.oncomplete = finalize;
            tx.onerror = () => {
              console.warn('Nao foi possivel limpar a store de pre-visualizacao no IndexedDB.');
              finalize();
            };
            tx.onabort = () => {
              console.warn('A limpeza da store de pre-visualizacao foi abortada no IndexedDB.');
              finalize();
            };
          } catch (error) {
            console.warn('Falha ao limpar a store de pre-visualizacao no IndexedDB:', error);
            finalize();
          }
        };
      });
    } catch (error) {
      console.warn('Nao foi possivel limpar o cache de pre-visualizacao no IndexedDB:', error);
    }
  };

  const pesquisarDadosEAtualizarRelatorio = async () => {
    // Pesquisa sempre completa: reseta cache e reconsolida 100% dos capitulos editoriais
    // para que o relatorio volte ao estado completo com dados atuais do dashboard.
    const normalizedSelectedSections = SECOES_RELATORIO_COMPLETO;
    if (normalizedSelectedSections.length === 0) {
      toast.error('Selecione ao menos um capitulo editorial.');
      return null;
    }

    const selectedIds = getSelectedInlineIds();

    setLoading(true);
    setErro(null);
    setResultado(null);
    updateProgress(5, 'Limpando previas antigas', 'Removendo HTML e PDF gerados anteriormente', 'pesquisa');

    try {
      updateProgress(10, 'Sincronizando dados do dashboard', 'Forçando atualização da base antes de pesquisar dados', 'pesquisa');
      await syncDashboardDataBeforeReport();
      await clearReportPreviewCache();

      updateProgress(15, 'Pesquisando dados reais do app', 'Relatorios, programacao, rubricas, metas, documentos, equipe e evidencias', 'pesquisa');
      const { contexto } = await carregarContextoRelatorioDoApp(museu, {
        secoesSelecionadas: normalizedSelectedSections,
        selectedInlinePhotoIds: selectedIds,
      });
      const dashboardMetrics = contexto?.dashboard_metrics || contexto?.dashboardMetrics || contexto?.metricas_dashboard || null;

      updateProgress(48, 'Recalculando metricas oficiais', 'Consolidando indicadores oficiais do dashboard e do periodo', 'pesquisa');

      updateProgress(65, 'Regerando HTML do relatorio', 'Atualizando relatorio principal, dados e galeria', 'pesquisa');
      const separated = await buildSeparatedReportsHtml({
        museu,
        premium: modoPremium,
        secoesSelecionadas: normalizedSelectedSections,
        selectedInlinePhotoIds: selectedIds,
      });

      const refreshedAt = new Date().toISOString();

      if (separated?.data?.html) {
        updateProgress(78, 'Salvando nova previa principal', 'Persistindo relatorio principal atualizado', 'pesquisa');
        await saveReportPreview('dados', {
          html: separated.data.html,
          meta: {
            ...separated.data.meta,
            selectedChapters: normalizedSelectedSections.filter((sectionId) => !['galeria_evidencias', 'galeria_premium'].includes(sectionId)),
            refreshedAt,
            forcedRefresh: true,
            metricsForcedRefresh: true,
            reportVariant: 'dados',
            dashboardMetrics,
          },
        });
      }

      if (separated?.gallery?.html) {
        updateProgress(88, 'Salvando nova previa galeria', 'Persistindo relatorio galeria atualizado', 'pesquisa');
        await saveReportPreview('galeria', {
          html: separated.gallery.html,
          meta: {
            ...separated.gallery.meta,
            selectedChapters: normalizedSelectedSections,
            refreshedAt,
            forcedRefresh: true,
            metricsForcedRefresh: true,
            reportVariant: 'galeria',
            dashboardMetrics,
          },
        });
      }

      const mainHtml = separated?.data?.html || separated?.single?.html || '';
      const mainContext = separated?.data?.contexto || separated?.single?.contexto || separated?.contexto || contexto;
      const refreshedDashboardMetrics = mainContext?.dashboard_metrics || mainContext?.dashboardMetrics || dashboardMetrics;
      if (!String(mainHtml || '').trim()) {
        throw new Error('A pesquisa foi concluida, mas nenhum HTML atualizado foi gerado.');
      }

      setResultado({
        html: mainHtml,
        galleryHtml: separated?.gallery?.html || '',
        contexto: mainContext,
        fonte: modoPremium ? 'premium_app_forced_refresh' : 'frontend_ia_forced_refresh',
        exportMode: 'data_pdf',
        htmlSize: new Blob([mainHtml], { type: 'text/html;charset=utf-8' }).size,
        galleryHtmlSize: separated?.gallery?.html
          ? new Blob([separated.gallery.html], { type: 'text/html;charset=utf-8' }).size
          : 0,
        meta: {
          ...separated?.data?.meta,
          refreshedAt,
          forcedRefresh: true,
          metricsForcedRefresh: true,
          reportVariant: 'dados',
          dashboardMetrics: refreshedDashboardMetrics,
        },
        galleryMeta: separated?.gallery?.meta
          ? {
              ...separated.gallery.meta,
              refreshedAt,
              forcedRefresh: true,
              metricsForcedRefresh: true,
              reportVariant: 'galeria',
            }
          : null,
        refreshedAt,
        metricsForcedRefresh: true,
      });

      updateProgress(100, 'PDF pronto para exportacao com dados atualizados', 'HTML e PDF agora usam as metricas recem-pesquisadas', 'pesquisa');
      toast.success('Dados, metricas, HTML e PDF foram atualizados com informacoes reais do app.');
      return {
        ...mainContext,
      };
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Nao foi possivel pesquisar e checar os dados.');
      toast.error('Nao foi possivel atualizar os dados do relatorio.');
      return null;
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 1200);
    }
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

  const updateProgress = (percent, label, detail = '', flow = 'exportacao') => {
    setExportProgress({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      label,
      detail,
      flow,
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

        const htmlPart = cleanEmptyReportSections(injectPartMetadata(localPart.html, {
          partNumber: part.partNumber,
          totalParts: EXPORT_VOLUME_COUNT,
          sectionLabels: splitContext.sectionLabels,
          pageNumberOffset,
        }));
        validateBeforeExport(htmlPart, part.secoes, localPart.contexto);
        const volumeMeta = buildVolumeMeta(part, { pageNumberOffset });
        await saveVolumePreview({
          volumeNumber: part.partNumber,
          html: htmlPart,
          meta: volumeMeta,
        });

        builtParts.push({
          partNumber: part.partNumber,
          totalParts: EXPORT_VOLUME_COUNT,
          fileName: buildPartFileName(part.partNumber),
          html: htmlPart,
          sizeBytes: new Blob([htmlPart], { type: 'text/html;charset=utf-8' }).size,
          sectionLabels: splitContext.sectionLabels,
          secoes: part.secoes,
          pageNumberOffset,
          estimatedPages: part.estimatedPages,
          estimatedMB: part.estimatedMB,
          meta: volumeMeta,
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

  const runExport = async (inlinePhotoIds = [], volumeNumber = requestedVolume, pageNumberOffsetOverride = undefined) => {
    const normalizedSelectedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);
    let allVolumeParts = buildVolumeParts(normalizedSelectedSections, {});
    let selectedVolume = allVolumeParts.find((part) => part.partNumber === volumeNumber);
    const pageNumberOffset = getVolumePageOffset(volumeNumber, pageNumberOffsetOverride);

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
      updateProgress(46, 'Analisando evidências visuais vinculadas Ã s atividades...', 'Detectando imagens repetidas e aplicando uso único');
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

      const htmlPart = cleanEmptyReportSections(injectPartMetadata(localPart.html, {
        partNumber: volumeNumber,
        totalParts: EXPORT_VOLUME_COUNT,
        sectionLabels: splitContext.sectionLabels,
        summaryHtml,
        pageNumberOffset,
      }));
      validateBeforeExport(htmlPart, selectedVolume.secoes, localPart.contexto);
      const volumeMeta = buildVolumeMeta(selectedVolume, { pageNumberOffset });
      await saveVolumePreview({
        volumeNumber,
        html: htmlPart,
        meta: volumeMeta,
      });

      const finalPart = {
        partNumber: volumeNumber,
        totalParts: EXPORT_VOLUME_COUNT,
        fileName: buildPartFileName(volumeNumber),
        html: htmlPart,
        sizeBytes: new Blob([htmlPart], { type: 'text/html;charset=utf-8' }).size,
        sectionLabels: splitContext.sectionLabels,
        secoes: selectedVolume.secoes,
        pageNumberOffset,
        estimatedPages: selectedVolume.estimatedPages,
        estimatedMB: selectedVolume.estimatedMB,
        meta: volumeMeta,
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
      await openPreview(volumeNumber);
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

  const pesquisarEChecarDados = async () => pesquisarDadosEAtualizarRelatorio();

  const resetarCacheERegerar = async () => {
    const normalizedSelectedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);
    if (normalizedSelectedSections.length === 0) {
      toast.error('Selecione ao menos um capitulo editorial.');
      return;
    }

    try {
      setLoading(true);
      setErro(null);
      updateProgress(4, 'Limpando previas antigas', 'Removendo cache local antes da nova geracao');
      await clearReportPreviewCache();
      updateProgress(12, 'Sincronizando dashboard', 'Buscando dados mais recentes antes de regerar');
      await syncDashboardDataBeforeReport();
    } catch (error) {
      console.warn('Falha ao resetar cache/sincronizar antes da regeracao:', error);
    } finally {
      setLoading(false);
    }

    await handleGerarUnico();
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
    updateProgress(4, 'Analisando fotos vinculadas', 'Verificando imagens vinculadas Ã s atividades');

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

  const generateSingleReport = async (selectedIds = getSelectedInlineIds()) => {
    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos um capitulo.');
      return;
    }

    setErro(null);
    setLoading(true);
    updateProgress(8, 'Gerando relatorio unico', 'Consolidando dados, textos, tabelas e imagens otimizadas');

    try {
      const result = await buildSingleReportHtml({
        museu,
        premium: modoPremium,
        secoesSelecionadas: normalizeSelectedReportChapterIds(secoesSelecionadas),
        selectedInlinePhotoIds: selectedIds,
      });

      updateProgress(82, 'Salvando previa unica', 'Aplicando limpeza editorial e preparando exportacao PDF A4');
      await saveSingleReportPreview({
        html: result.html,
        meta: {
          ...result.meta,
          selectedChapters: normalizeSelectedReportChapterIds(secoesSelecionadas),
        },
      });

      setResultado({
        html: result.html,
        contexto: result.contexto,
        fonte: modoPremium ? 'premium_app' : 'frontend_ia',
        exportMode: 'single_pdf',
        htmlSize: new Blob([result.html], { type: 'text/html;charset=utf-8' }).size,
        meta: result.meta,
      });
      updateProgress(100, 'Relatorio unico concluido', 'Pronto para previa e exportacao em PDF unico');
      setDialogAberto(false);
      toast.success('Relatorio Fisico-Financeiro gerado em arquivo unico.');
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Nao foi possivel gerar o relatorio.');
      toast.error('Nao foi possivel gerar o relatorio.');
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 1200);
    }
  };

  const generateSeparatedReports = async () => {
    const normalizedSections = normalizeSelectedReportChapterIds(REPORT_CHAPTER_IDS);

setErro(null);
    setLoading(true);
    updateProgress(5, 'Iniciando geração', 'Preparando pipeline de dois relatórios separados', 'geracao');
    updateProgress(9, 'Sincronizando dados do dashboard', 'Forçando atualização da base antes da geração', 'geracao');
    await syncDashboardDataBeforeReport();
    await clearReportPreviewCache();

    try {
      // â”€â”€ ETAPA 1: carregar dados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('[Relatorio] ETAPA 1: carregando dados do app...');
      updateProgress(12, 'Carregando dados do app', 'Relatórios, rubricas, compras, programação, fotos e metas', 'geracao');
      const selectedIds = getSelectedInlineIds();

      let result;
      try {
        result = await buildSeparatedReportsHtml({
          museu,
          premium: modoPremium,
          secoesSelecionadas: normalizedSections,
          selectedInlinePhotoIds: selectedIds,
        });
        console.log('[Relatorio] ETAPA 1 concluída. Dados carregados.');
      } catch (dataErr) {
        console.error('[Relatorio] ETAPA 1 FALHOU ao carregar dados:', dataErr);
        throw new Error(`Falha ao carregar dados: ${dataErr.message}`);
      }

      // â”€â”€ ETAPA 2: montar HTML principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('[Relatorio] ETAPA 2: montando HTML principal...');
      updateProgress(40, 'Montando HTML principal', 'Dados, textos, tabelas, gráficos, metas e 100% das atividades', 'geracao');
      const dadosHtml = result?.data?.html || '';
      if (!dadosHtml.trim()) {
        console.error('[Relatorio] ETAPA 2 FALHOU: HTML principal vazio após buildSeparatedReportsHtml');
        throw new Error('Não foi possível montar o HTML do relatório principal.');
      }
      console.log(`[Relatorio] ETAPA 2 concluída. HTML principal: ${Math.round(dadosHtml.length / 1024)} KB`);

      // â”€â”€ ETAPA 3: montar HTML galeria â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('[Relatorio] ETAPA 3: montando HTML galeria...');
      updateProgress(55, 'Montando HTML galeria', 'Imagens organizadas por atividade, sem repetição', 'geracao');
      const galeriaHtml = result?.gallery?.html || '';
      if (!galeriaHtml.trim()) {
        console.error('[Relatorio] ETAPA 3 FALHOU: HTML galeria vazio após buildSeparatedReportsHtml');
        throw new Error('Não foi possível montar o HTML do relatório galeria.');
      }
      console.log(`[Relatorio] ETAPA 3 concluída. HTML galeria: ${Math.round(galeriaHtml.length / 1024)} KB`);

      // â”€â”€ ETAPA 3.1: montar HTML atividades â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('[Relatorio] ETAPA 3.1: montando HTML atividades...');
      updateProgress(64, 'Montando HTML atividades', 'Consolidando relatórios aprovados e atividades integrais', 'geracao');
      const activitiesResult = await buildActivitiesReport({ museu });
      const atividadesHtml = activitiesResult?.html || '';
      if (!atividadesHtml.trim()) {
        throw new Error('Não foi possível montar o HTML do relatório de atividades.');
      }
      console.log(`[Relatorio] ETAPA 3.1 concluída. HTML atividades: ${Math.round(atividadesHtml.length / 1024)} KB`);

      // â”€â”€ ETAPA 4: salvar localStorage + IndexedDB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('[Relatorio] ETAPA 4: salvando HTMLs em localStorage e IndexedDB...');
      updateProgress(72, 'Salvando relatórios', 'Persistindo HTML principal, galeria e atividades para a prévia', 'geracao');
      let localStorageSaved = false;
      try {
        if (dadosHtml.length <= 1500000) {
          localStorage.setItem('relatorio_fisico_financeiro_dados_html', dadosHtml);
        }
        if (atividadesHtml.length <= 1500000) {
          localStorage.setItem('relatorio_fisico_financeiro_atividades_html', atividadesHtml);
        }
        localStorage.setItem('relatorio_fisico_financeiro_dados_html_saved_at', new Date().toISOString());
        localStorage.setItem('relatorio_fisico_financeiro_galeria_html_storage', 'indexeddb');
        localStorage.setItem('relatorio_fisico_financeiro_galeria_html_saved_at', new Date().toISOString());
        localStorage.setItem('relatorio_fisico_financeiro_atividades_html_saved_at', new Date().toISOString());
        // Verify write
        const verify = localStorage.getItem('relatorio_fisico_financeiro_dados_html') || '';
        localStorageSaved = verify.length > 100;
        console.log(`[Relatorio] ETAPA 4a: localStorage ${localStorageSaved ? 'salvo com sucesso' : 'falhou na verificação'}`);
      } catch (lsErr) {
        console.warn('[Relatorio] ETAPA 4a FALHOU: localStorage quota ou erro:', lsErr);
      }

      // â”€â”€ ETAPA 5: salvar IndexedDB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('[Relatorio] ETAPA 5: salvando em IndexedDB...');
      try {
        await Promise.all([
          saveReportPreview('dados', {
            html: dadosHtml,
            meta: {
              ...result.data.meta,
              selectedChapters: normalizedSections.filter((sectionId) => !['galeria_evidencias', 'galeria_premium'].includes(sectionId)),
              reportVariant: 'dados',
            },
          }),
          saveReportPreview('galeria', {
            html: galeriaHtml,
            meta: {
              ...result.gallery.meta,
              selectedChapters: normalizedSections,
              reportVariant: 'galeria',
            },
          }),
          saveReportPreview('atividades', {
            html: atividadesHtml,
            meta: {
              ...(activitiesResult?.meta || {}),
              reportVariant: 'atividades',
              selectedChapters: normalizedSections,
            },
          }),
        ]);
        console.log('[Relatorio] ETAPA 5 concluída: IndexedDB salvo.');
      } catch (idbErr) {
        console.error('[Relatorio] ETAPA 5 FALHOU ao salvar IndexedDB:', idbErr);
        if (!localStorageSaved) {
          throw new Error(`Falha ao salvar IndexedDB: ${idbErr.message}. localStorage também falhou.`);
        }
        console.warn('[Relatorio] ETAPA 5: IndexedDB falhou mas localStorage está disponível.');
      }

      // â”€â”€ ETAPA 6: verificar prévia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('[Relatorio] ETAPA 6: verificando prévia salva...');
      updateProgress(90, 'Verificando prévia', 'Confirmando que os HTMLs estão disponíveis para abertura', 'geracao');
      const checkDados = localStorage.getItem('relatorio_fisico_financeiro_dados_html') || '';
      const checkGaleria = localStorage.getItem('relatorio_fisico_financeiro_galeria_html') || '';
      const checkAtividades = localStorage.getItem('relatorio_fisico_financeiro_atividades_html') || '';
      if (!checkDados.trim() && !checkGaleria.trim() && !checkAtividades.trim()) {
        console.warn('[Relatorio] ETAPA 6: HTMLs não encontrados no localStorage; seguindo com IndexedDB.');
      }
      console.log('[Relatorio] ETAPA 6 concluída: prévia verificada e disponível.');

      setResultado({
        html: dadosHtml,
        galleryHtml: galeriaHtml,
        activitiesHtml: atividadesHtml,
        contexto: result.data.contexto,
        fonte: modoPremium ? 'premium_app' : 'frontend_ia',
        exportMode: 'three_reports',
        htmlSize: new Blob([dadosHtml], { type: 'text/html;charset=utf-8' }).size,
        galleryHtmlSize: new Blob([galeriaHtml], { type: 'text/html;charset=utf-8' }).size,
        activitiesHtmlSize: new Blob([atividadesHtml], { type: 'text/html;charset=utf-8' }).size,
        meta: result.data.meta,
        galleryMeta: result.gallery.meta,
        activitiesMeta: activitiesResult?.meta || {},
      });
      updateProgress(100, 'Relatórios prontos', 'Principal, galeria e atividades salvos e disponíveis para prévia e PDF', 'geracao');
      setDialogAberto(false);
      toast.success('Relatórios gerados: principal, galeria e atividades.');
    } catch (err) {
      console.error('[Relatorio] Geração falhou:', err);
      setErro(err.message || 'Nao foi possivel gerar os relatorios.');
      toast.error(err.message || 'Nao foi possivel gerar os relatorios.');
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 1200);
    }
  };

  const handleGerarUnico = async () => {

    await generateSeparatedReports();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gerar Relatório</h2>
          <p className="text-sm text-slate-500">Relatório principal de dados, relatório galeria e relatório de atividades integrais.</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <img src="/viaduto-logo.png" alt="Viaduto das Artes" className="h-12 w-12 object-contain rounded bg-white p-1 border border-slate-200" />
          <div className="text-[11px] leading-4 text-slate-700">
            <p className="font-semibold text-slate-900">Viaduto das Artes - Fundado em 16 de junho de 2015</p>
            <p>Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG</p>
            <p>CEP 30640-010 - E-mail: viadutodasartes@gmail.com</p>
          </div>
        </div>
      </div>

      {exportProgress && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {exportProgress.flow === 'pesquisa' ? 'Progresso da Pesquisa e Atualização' : 'Progresso da Geração dos Relatórios'}
              </p>
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
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Carregando dados do relatório</p>
            <span className="text-xs font-medium text-slate-600">{exportProgress?.percent ?? 0}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-300"
              style={{ width: `${exportProgress?.percent ?? 12}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {exportProgress?.label || 'Consolidando dados reais do app...'}
          </p>
        </div>
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
              {resultado.exportMode === 'three_reports' && (
                <p className="text-xs text-green-700 mt-1">
                  Resultado esperado: um PDF principal de dados, um PDF galeria e um PDF de atividades integrais.
                </p>
              )}
              {false && resultado.exportMode === 'split' && Array.isArray(resultado.parts) && resultado.parts.length > 1 && (
                <p className="text-xs text-green-700 mt-1">
                  Exportação preparada em {resultado.parts.length} volumes balanceados, respeitando a ordem dos capítulos selecionados.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            {false && resultado.exportMode === 'split' && Array.isArray(resultado.parts) && resultado.parts.length > 1 ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resultado.parts.forEach((part) => downloadNamedHtml(part.html, part.fileName))}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar todos os volumes
                </Button>
                {resultado.parts.map((part) => (
                  <div key={part.fileName} className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreview(part.partNumber, true)}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {`Abrir previa Volume ${String(part.partNumber).padStart(2, '0')}`}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreview(part.partNumber)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {`Exportar PDF Volume ${String(part.partNumber).padStart(2, '0')}`}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadNamedHtml(part.html, part.fileName)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      HTML
                    </Button>
                  </div>
                ))}
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => openPreview('dados')}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir principal
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadHtml(resultado.html)}>
                  <Download className="w-4 h-4 mr-2" />
                  HTML principal
                </Button>
                <Button variant="outline" size="sm" onClick={() => openPreview('dados', true)}>
                  <Download className="w-4 h-4 mr-2" />
                  PDF principal
                </Button>
                {resultado.galleryHtml && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openPreview('galeria')}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir galeria
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadNamedHtml(resultado.galleryHtml, `relatorio-galeria-${Date.now()}.html`)}>
                      <Download className="w-4 h-4 mr-2" />
                      HTML galeria
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openPreview('galeria', true)}>
                      <Download className="w-4 h-4 mr-2" />
                      PDF galeria
                    </Button>
                  </>
                )}
                {resultado.activitiesHtml && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openPreview('atividades')}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir atividades
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadNamedHtml(resultado.activitiesHtml, `relatorio-atividades-${Date.now()}.html`)}>
                      <Download className="w-4 h-4 mr-2" />
                      HTML atividades
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openPreview('atividades', true)}>
                      <Download className="w-4 h-4 mr-2" />
                      PDF atividades
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={false && photoSelectionDialog} onOpenChange={setPhotoSelectionDialog}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fotos vinculadas Ã s atividades</DialogTitle>
            <DialogDescription className="sr-only">
              Janela de visualizacao, confirmacao ou exportacao do relatorio.
            </DialogDescription>
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
                        .join(' â€¢ ')}
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
                await generateSingleReport(selectedIds);
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
            <DialogDescription className="sr-only">
              Janela de visualizacao, confirmacao ou exportacao do relatorio.
            </DialogDescription>
            <p className="text-sm text-slate-500">
              Selecione o museu, o formato editorial e os capitulos que serao consolidados em tres arquivos: relatorio principal, relatorio galeria e relatorio de atividades.
            </p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {loading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Carregando dados do relatório</p>
                  <span className="text-xs font-medium text-slate-600">{exportProgress?.percent ?? 0}%</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all duration-300"
                    style={{ width: `${exportProgress?.percent ?? 12}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {exportProgress?.label || 'Consolidando dados reais do app...'}
                </p>
              </div>
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

            {false && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
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
            </div>}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="space-y-2">
                <Label>Capitulos editoriais</Label>
                <p className="text-xs leading-5 text-slate-600">
                  Todo conteudo selecionado sera preservado. O relatorio principal organiza dados e sintese, a galeria organiza imagens e o relatorio de atividades preserva integralmente os registros aprovados.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button type="button" variant="outline" size="sm" onClick={() => toggleTodas(true)}>Selecionar todos</Button>
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
                          <p className="text-sm font-semibold text-slate-900">{volume.title.replace(/Volume \d+\s*[â€”-]\s*/, 'Bloco editorial - ')}</p>
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
                              <p className="mt-1 text-[11px] leading-5 text-slate-500">{chapter.sectionIds.map(getCapituloLabel).join(' â€¢ ')}</p>
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
              <p className="text-sm font-semibold text-slate-900">Capítulos que serão gerados</p>
              <p className="mt-1 text-xs text-slate-600">
                {selectedEditorialChapterCount} de {allEditorialChapterCount} capítulos editoriais selecionados.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {EDITORIAL_VOLUMES.flatMap((volume) => volume.chapters)
                  .filter((chapter) => allIdsSelected(chapter.sectionIds))
                  .map((chapter) => (
                    <div
                      key={`chapter-selected-${chapter.code}-${chapter.title}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                    >
                      <span className="font-semibold">{chapter.code}.</span> {chapter.title}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={loading}>Cancelar</Button>
            <Button variant="outline" onClick={resetarCacheERegerar} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Resetar cache e regerar
            </Button>
            <Button variant="outline" onClick={pesquisarDadosEAtualizarRelatorio} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Pesquisar dados e atualizar relatorio
            </Button>
            <Button onClick={() => handleGerarUnico()} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Gerar relatórios
            </Button>
            {false && [1, 2, 3].map((volumeNumber) => {
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

