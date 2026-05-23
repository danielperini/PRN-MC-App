import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Download, ExternalLink, FileText, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import ReportDeliveryFormatsPanel from '@/components/reports/ReportDeliveryFormatsPanel';
import {
  REPORT_CHAPTER_IDS,
  normalizeSelectedReportChapterIds,
} from '@/config/reportChapters';
import {
  buildActivitiesReport,
  buildSeparatedReportsHtml,
  clearReportDataCache,
  repairReportEncoding,
  sanitizeReportHtmlBeforeSave,
  saveReportPreview,
} from '@/services/reportExportPipeline';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];
const PREVIEW_DB_NAME = 'museus_centro_report_preview';
const PREVIEW_DB_STORE = 'previews';

const FORMAT_CONFIGS = {
  geral: {
    label: 'Relatório geral completo',
    kind: 'complete_bundle',
    primaryVariant: 'dados',
    sections: REPORT_CHAPTER_IDS,
  },
  editorial: {
    label: 'Relatório editorial',
    kind: 'data_report',
    primaryVariant: 'dados',
    sections: [
      'capa',
      'expediente',
      'sumario_executivo',
      'introducao',
      'territorio',
      'indicadores_premium',
      'resumo_geral',
      'programacao',
      'timeline_premium',
      'comunicacao',
      'comunicacao_premium',
      'app_museu_centro',
      'sistema_governanca',
      'conclusao',
    ],
  },
  fisico_financeiro: {
    label: 'Relatório físico-financeiro',
    kind: 'data_report',
    primaryVariant: 'dados',
    sections: [
      'capa',
      'sumario_executivo',
      'indicadores_premium',
      'financeiro',
      'rubricas',
      'orcamento_museu',
      'orcamento_geral',
      'prestacao',
      'notas-fiscais-contratos',
      'governanca_documental',
      'conclusao',
    ],
  },
  galeria: {
    label: 'Relatório de galeria',
    kind: 'gallery_report',
    primaryVariant: 'galeria',
    sections: ['capa', 'galeria_evidencias', 'galeria_premium'],
  },
  museu: {
    label: 'Relatório por museu',
    kind: 'data_report',
    primaryVariant: 'dados',
    sections: [
      'capa',
      'sumario_executivo',
      'publico',
      'programacao',
      'agenda_programacao',
      'museus_premium',
      'galeria_evidencias',
      'financeiro',
      'rubricas',
      'orcamento_museu',
      'conclusao',
    ],
  },
  atividade: {
    label: 'Relatório por atividade',
    kind: 'activities_report',
    primaryVariant: 'atividades',
    sections: ['agenda_programacao', 'atividades_museu', 'museus_premium', 'relatorios_completos', 'galeria_evidencias'],
  },
  periodo: {
    label: 'Relatório por período',
    kind: 'data_report',
    primaryVariant: 'dados',
    sections: REPORT_CHAPTER_IDS,
  },
  fotos: {
    label: 'Relatório com fotos',
    kind: 'gallery_report',
    primaryVariant: 'galeria',
    sections: ['capa', 'museus_premium', 'galeria_evidencias', 'galeria_premium'],
  },
  gps: {
    label: 'Relatório com GPS',
    kind: 'gallery_report',
    primaryVariant: 'galeria',
    sections: ['capa', 'galeria_evidencias', 'galeria_premium'],
  },
  publico: {
    label: 'Relatório com público',
    kind: 'data_report',
    primaryVariant: 'dados',
    sections: ['capa', 'sumario_executivo', 'indicadores_premium', 'publico', 'programacao', 'agenda_programacao', 'museus_premium', 'conclusao'],
  },
  metas: {
    label: 'Relatório com metas',
    kind: 'data_report',
    primaryVariant: 'dados',
    sections: ['capa', 'sumario_executivo', 'indicadores_premium', 'metas', 'programacao', 'financeiro', 'rubricas', 'conclusao'],
  },
  documentos: {
    label: 'Relatório com documentos fiscais',
    kind: 'data_report',
    primaryVariant: 'dados',
    sections: ['capa', 'financeiro', 'prestacao', 'notas-fiscais-contratos', 'governanca_documental', 'conclusao'],
  },
  volumes: {
    label: 'Volumes em PDF',
    kind: 'volume_bundle',
    primaryVariant: 'dados',
    sections: REPORT_CHAPTER_IDS,
  },
};

function storageKeyForVariant(variant = 'single') {
  if (variant === 'dados') return 'relatorio_fisico_financeiro_dados_html';
  if (variant === 'galeria') return 'relatorio_fisico_financeiro_galeria_html';
  if (variant === 'atividades') return 'relatorio_fisico_financeiro_atividades_html';
  return 'relatorio_fisico_financeiro_html';
}

function metaKeyForVariant(variant = 'single') {
  if (variant === 'dados') return 'relatorio_fisico_financeiro_dados_meta';
  if (variant === 'galeria') return 'relatorio_fisico_financeiro_galeria_meta';
  if (variant === 'atividades') return 'relatorio_fisico_financeiro_atividades_meta';
  return 'relatorio_fisico_financeiro_meta';
}

function clearPreviewStorageKeys() {
  const keys = [
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

  keys.forEach((key) => {
    try { sessionStorage.removeItem(key); } catch {}
    try { localStorage.removeItem(key); } catch {}
  });
}

function clearPreviewIndexedDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const request = indexedDB.open(PREVIEW_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) db.createObjectStore(PREVIEW_DB_STORE);
    };

    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(PREVIEW_DB_STORE, 'readwrite');
        tx.objectStore(PREVIEW_DB_STORE).clear();
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch {
        db.close();
        resolve(false);
      }
    };
  });
}

async function resetReportGenerationState() {
  clearReportDataCache();
  clearPreviewStorageKeys();
  await clearPreviewIndexedDb();
}

async function syncDashboardDataBeforeReport() {
  if (typeof window === 'undefined') return;
  if (typeof window.museusCentroHardRefresh !== 'function') return;

  try {
    await window.museusCentroHardRefresh();
  } catch (error) {
    console.warn('[Relatório] Falha ao sincronizar dashboard antes da geração. Seguindo com dados disponíveis.', error);
  }
}

function isCoverImageCandidate(src = '') {
  const value = String(src || '').toLowerCase();
  if (!value) return false;
  if (value.includes('viaduto-logo')) return false;
  if (value.includes('data:image/svg')) return false;
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(value) || value.startsWith('data:image/');
}

function injectCoverPhotoLayout(html = '', title = 'Relatório Museus Centro') {
  if (!String(html || '').trim() || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(repairReportEncoding(String(html)), 'text/html');
    const cover = doc.querySelector('.premium-cover, .report-cover, .activities-cover, .gallery-cover') || doc.querySelector('main > section:first-child');
    if (!cover) return sanitizeReportHtmlBeforeSave(repairReportEncoding(html));

    const existingCoverPhoto = cover.querySelector('.generated-report-cover-photo, img:not([src*="viaduto-logo"])');
    const firstPhoto = Array.from(doc.querySelectorAll('img[src]')).find((img) => isCoverImageCandidate(img.getAttribute('src')));
    const src = existingCoverPhoto?.getAttribute?.('src') || firstPhoto?.getAttribute?.('src') || '';

    cover.classList.add('generated-report-cover');
    cover.setAttribute('data-cover-title', title);

    if (src && !cover.querySelector('.generated-report-cover-photo')) {
      const image = doc.createElement('img');
      image.className = 'generated-report-cover-photo';
      image.src = src;
      image.alt = title;
      image.setAttribute('loading', 'eager');
      image.setAttribute('decoding', 'async');
      cover.insertBefore(image, cover.firstChild);
    }

    let style = doc.getElementById('generated-report-cover-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'generated-report-cover-style';
      doc.head.appendChild(style);
    }

    style.textContent = `
      .generated-report-cover {
        position: relative !important;
        overflow: hidden !important;
        min-height: 297mm !important;
        background: #141414 !important;
        color: #fff !important;
        isolation: isolate !important;
      }
      .generated-report-cover::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 1;
        background: linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,.42) 50%, rgba(0,0,0,.82) 100%);
        pointer-events: none;
      }
      .generated-report-cover::after {
        content: "";
        position: absolute;
        inset: auto 0 0 0;
        height: 42mm;
        z-index: 2;
        background: linear-gradient(0deg, rgba(0,0,0,.92), rgba(0,0,0,0));
        pointer-events: none;
      }
      .generated-report-cover-photo {
        position: absolute !important;
        inset: 0 !important;
        z-index: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        object-fit: cover !important;
        opacity: .86 !important;
      }
      .generated-report-cover > *:not(.generated-report-cover-photo) {
        position: relative;
        z-index: 3;
      }
    `;

    return sanitizeReportHtmlBeforeSave(`<!doctype html>\n${doc.documentElement.outerHTML}`);
  } catch (error) {
    console.warn('[Relatório] Não foi possível aplicar foto de capa no HTML.', error);
    return html;
  }
}

function buildPreviewUrl(variant = 'dados', autoExportPdf = false) {
  const params = new URLSearchParams();
  if (variant && variant !== 'single') params.set('report', variant);
  if (autoExportPdf) params.set('export', 'pdf');
  const query = params.toString();
  return `/RelatorioPreview${query ? `?${query}` : ''}`;
}

function downloadHtml(html = '', fileName = 'relatorio-museus-centro.html') {
  if (!html) return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugifyFileName(value = 'relatorio') {
  return String(value || 'relatorio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'relatorio';
}

export default function ReportCardGeneratorDashboard() {
  const [museu, setMuseu] = useState('Todos');
  const [loading, setLoading] = useState(false);
  const [activeFormat, setActiveFormat] = useState(null);
  const [progress, setProgress] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  const selectedMuseumLabel = useMemo(() => (museu === 'Todos' ? 'Todos os museus' : museu), [museu]);

  const openPreview = (variant = 'dados', autoExportPdf = false) => {
    const url = buildPreviewUrl(variant, autoExportPdf);
    const opened = window.open(url, '_blank', 'width=1200,height=900');
    if (!opened) toast.error('Não foi possível abrir a prévia. Verifique bloqueio de pop-up.');
  };

  const saveOutput = async ({ variant, html, meta = {}, title }) => {
    const finalHtml = injectCoverPhotoLayout(html, title);
    await saveReportPreview(variant, {
      html: finalHtml,
      meta: {
        ...meta,
        reportVariant: variant,
        museu,
        generatedFromCard: true,
        generatedAt: new Date().toISOString(),
      },
    });
    return finalHtml;
  };

  const buildDataAndGalleryOutputs = async (config, sections) => {
    const separated = await buildSeparatedReportsHtml({
      museu,
      premium: true,
      secoesSelecionadas: sections,
      selectedInlinePhotoIds: [],
    });

    const outputs = [];

    if (config.kind !== 'gallery_report' && separated?.data?.html) {
      const dataHtml = await saveOutput({
        variant: 'dados',
        html: separated.data.html,
        meta: {
          ...(separated.data.meta || {}),
          selectedChapters: sections.filter((sectionId) => !['galeria_evidencias', 'galeria_premium'].includes(sectionId)),
        },
        title: config.label,
      });
      outputs.push({
        variant: 'dados',
        label: config.kind === 'volume_bundle' ? 'Volume 1 — Relatório principal' : 'Relatório principal',
        html: dataHtml,
        htmlKey: storageKeyForVariant('dados'),
        metaKey: metaKeyForVariant('dados'),
      });
    }

    if (['complete_bundle', 'gallery_report', 'volume_bundle'].includes(config.kind) && separated?.gallery?.html) {
      const galleryHtml = await saveOutput({
        variant: 'galeria',
        html: separated.gallery.html,
        meta: {
          ...(separated.gallery.meta || {}),
          selectedChapters: sections,
        },
        title: config.kind === 'volume_bundle' ? 'Volume 2 — Relatório Galeria' : config.label,
      });
      outputs.push({
        variant: 'galeria',
        label: config.kind === 'volume_bundle' ? 'Volume 2 — Galeria de evidências' : 'Relatório de galeria',
        html: galleryHtml,
        htmlKey: storageKeyForVariant('galeria'),
        metaKey: metaKeyForVariant('galeria'),
      });
    }

    return { separated, outputs };
  };

  const generateFormat = async (formatId, options = {}) => {
    const config = FORMAT_CONFIGS[formatId] || FORMAT_CONFIGS.geral;
    const sections = normalizeSelectedReportChapterIds(config.sections || REPORT_CHAPTER_IDS);
    const {
      fromQueue = false,
      queuePosition = 1,
      queueTotal = 1,
      openPreview: shouldOpenPreview = true,
    } = options || {};
    const queuePrefix = fromQueue ? `Fila ${queuePosition}/${queueTotal} · ` : '';
    let previewWindow = null;

    setLoading(true);
    setActiveFormat(formatId);
    setErro(null);
    if (!fromQueue || queuePosition === 1) setResultado(null);
    setProgress({
      percent: 4,
      label: `${queuePrefix}Resetando geração anterior`,
      detail: 'Limpando cache local, localStorage, sessionStorage e IndexedDB.',
    });

    if (shouldOpenPreview && !fromQueue) {
      try {
        previewWindow = window.open('', '_blank', 'width=1200,height=900');
        if (previewWindow) {
          previewWindow.document.write('<p style="font-family:Arial;padding:24px">Gerando relatório. A prévia será carregada automaticamente...</p>');
        }
      } catch {
        previewWindow = null;
      }
    }

    try {
      await resetReportGenerationState();
      setProgress({ percent: 10, label: `${queuePrefix}Sincronizando Dashboard`, detail: 'Atualizando dados antes da geração do relatório.' });
      await syncDashboardDataBeforeReport();
      setProgress({ percent: 12, label: `${queuePrefix}Buscando dados reais do app`, detail: `${config.label} · ${selectedMuseumLabel}` });

      let outputs = [];
      let context = null;

      if (config.kind === 'activities_report') {
        setProgress({ percent: 44, label: `${queuePrefix}Montando relatório de atividades`, detail: 'Consolidando atividades e relatórios aprovados.' });
        const activitiesResult = await buildActivitiesReport({ museu });
        const html = await saveOutput({
          variant: 'atividades',
          html: activitiesResult.html,
          meta: {
            ...(activitiesResult.meta || {}),
            selectedChapters: sections,
          },
          title: config.label,
        });
        outputs = [{
          variant: 'atividades',
          label: 'Relatório de atividades',
          html,
          htmlKey: storageKeyForVariant('atividades'),
          metaKey: metaKeyForVariant('atividades'),
        }];
        context = activitiesResult.data || null;
      } else {
        setProgress({ percent: 38, label: `${queuePrefix}Montando HTML editorial`, detail: 'Gerando relatório principal, galeria ou volumes conforme o card selecionado.' });
        const built = await buildDataAndGalleryOutputs(config, sections);
        outputs = built.outputs;
        context = built.separated?.data?.contexto || built.separated?.gallery?.contexto || null;

        if (['complete_bundle', 'volume_bundle'].includes(config.kind)) {
          setProgress({ percent: 68, label: `${queuePrefix}Montando volume de atividades`, detail: 'Criando terceiro PDF com atividades integrais.' });
          const activitiesResult = await buildActivitiesReport({ museu });
          if (activitiesResult?.html) {
            const activitiesHtml = await saveOutput({
              variant: 'atividades',
              html: activitiesResult.html,
              meta: {
                ...(activitiesResult.meta || {}),
                reportVariant: 'atividades',
                selectedChapters: sections,
              },
              title: config.kind === 'volume_bundle' ? 'Volume 3 — Relatório de Atividades' : 'Relatório de Atividades',
            });
            outputs.push({
              variant: 'atividades',
              label: config.kind === 'volume_bundle' ? 'Volume 3 — Atividades integrais' : 'Relatório de atividades',
              html: activitiesHtml,
              htmlKey: storageKeyForVariant('atividades'),
              metaKey: metaKeyForVariant('atividades'),
            });
          }
        }
      }

      if (outputs.length === 0) throw new Error('Nenhum HTML foi gerado para o card selecionado.');

      const primary = outputs.find((output) => output.variant === config.primaryVariant) || outputs[0];
      const generatedPayload = {
        formatId,
        title: config.label,
        outputs,
        context,
        generatedAt: new Date().toISOString(),
        queuePosition,
        queueTotal,
      };

      setResultado((current) => {
        if (!fromQueue) return generatedPayload;

        const previousQueue = Array.isArray(current?.queueResults)
          ? current.queueResults.filter((item) => item.formatId !== formatId)
          : [];
        const queueResults = [...previousQueue, generatedPayload]
          .sort((a, b) => Number(a.queuePosition || 0) - Number(b.queuePosition || 0));

        return {
          formatId: 'fila_relatorios',
          title: queueTotal > 1
            ? `${queueResults.length} de ${queueTotal} relatórios gerados`
            : config.label,
          outputs: queueResults.flatMap((item) => (item.outputs || []).map((output) => ({
            ...output,
            reportTitle: item.title,
            queuePosition: item.queuePosition,
            uniqueKey: `${item.formatId}-${item.queuePosition}-${output.variant}`,
          }))),
          queueResults,
          context,
          generatedAt: new Date().toISOString(),
        };
      });

      setProgress({ percent: 100, label: `${queuePrefix}Relatório gerado`, detail: `${outputs.length} arquivo(s) preparado(s) para prévia e PDF.` });
      toast.success(fromQueue ? `${config.label} gerado (${queuePosition}/${queueTotal}).` : `${config.label} gerado com sucesso.`);

      if (previewWindow && primary?.variant) {
        previewWindow.location.href = buildPreviewUrl(primary.variant, false);
      }
    } catch (error) {
      console.error('[Relatório] Falha na geração por card:', error);
      setErro(error?.message || `Não foi possível gerar ${config.label}.`);
      toast.error(error?.message || `Não foi possível gerar ${config.label}.`);
      try { previewWindow?.close?.(); } catch {}
    } finally {
      const shouldFinishLoading = !fromQueue || queuePosition === queueTotal;
      if (shouldFinishLoading) {
        setLoading(false);
        setActiveFormat(null);
        setTimeout(() => setProgress(null), 1400);
      }
    }
  };

  const handleResetOnly = async () => {
    setLoading(true);
    setActiveFormat(null);
    setErro(null);
    setResultado(null);
    setProgress({ percent: 10, label: 'Resetando prévias', detail: 'Limpando todos os relatórios salvos localmente.' });
    try {
      await resetReportGenerationState();
      await syncDashboardDataBeforeReport();
      setProgress({ percent: 100, label: 'Reset concluído', detail: 'Cache limpo e Dashboard sincronizado.' });
      toast.success('Cache de relatórios limpo.');
    } catch (error) {
      console.warn('[Relatório] Falha ao resetar cache.', error);
      toast.error('Não foi possível limpar todo o cache local.');
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(null), 900);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Geração por fila</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-black">Selecione os cards e gere na ordem desejada</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Os cards abaixo funcionam como seletores de relatórios. A ordem dos cliques define a fila de geração.
              O botão Gerar relatórios mantém reset de cache, atualização de dados e sincronia com o Dashboard.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[180px_auto]">
            <div>
              <Label className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Museu</Label>
              <Select value={museu} onValueChange={setMuseu} disabled={loading}>
                <SelectTrigger className="mt-1 h-11 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUSEUS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="h-11 self-end gap-2" onClick={handleResetOnly} disabled={loading}>
              {loading && !activeFormat ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Resetar
            </Button>
          </div>
        </div>
      </div>

      {progress && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Progresso da geração</p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-4xl font-bold leading-none text-black tabular-nums">{progress.percent}%</span>
                <span className="pb-1 text-sm text-slate-500">concluído</span>
              </div>
            </div>
            <div className="md:text-right">
              <p className="text-sm font-semibold text-slate-900">{progress.label}</p>
              <p className="text-xs text-slate-500">{progress.detail}</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-black transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      <ReportDeliveryFormatsPanel
        onGenerate={generateFormat}
        loading={loading}
        activeFormat={activeFormat}
      />

      {erro && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Não foi possível gerar o relatório</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">{erro}</p>
            </div>
          </div>
        </div>
      )}

      {resultado && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-4 flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">{resultado.title} com sucesso</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                Foram preparados {resultado.outputs.length} arquivo(s). Use os botões abaixo para abrir a prévia, exportar PDF ou baixar o HTML.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {resultado.outputs.map((output) => {
              const safeTitle = slugifyFileName(output.reportTitle || resultado.title || 'relatorio');
              return (
                <div key={`${resultado.formatId}-${output.uniqueKey || output.variant}`} className="rounded-xl border border-emerald-200 bg-white p-3">
                  {output.reportTitle && (
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Fila {output.queuePosition} · {output.reportTitle}
                    </p>
                  )}
                  <p className="text-sm font-bold text-slate-900">{output.label}</p>
                  <p className="mt-1 text-xs text-slate-500">Prévia salva em {output.variant}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => openPreview(output.variant, false)}>
                      <ExternalLink className="h-4 w-4" />
                      Prévia
                    </Button>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => openPreview(output.variant, true)}>
                      <Download className="h-4 w-4" />
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => downloadHtml(output.html, `museus-centro-${safeTitle}-${output.variant}-${Date.now()}.html`)}
                    >
                      <FileText className="h-4 w-4" />
                      HTML
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
