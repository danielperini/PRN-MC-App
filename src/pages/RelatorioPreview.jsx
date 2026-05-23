import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileDown, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import {
  REPORT_PREVIEW_VARIANTS,
  SINGLE_REPORT_FILENAME,
  exportSingleReportPdf,
  getReportPreview,
  getSingleReportPreview,
  repairReportEncoding,
  sanitizeReportHtmlBeforeSave,
} from '@/services/reportExportPipeline';

const PDF_PAGE_WIDTH_PX = 794;
const PDF_PAGE_HEIGHT_PX = 1123;
const PREVIEW_DB_NAME = 'museus_centro_report_preview';
const PREVIEW_DB_STORE = 'previews';
const LEGACY_PREVIEW_HTML_KEY = 'latest_html';
let rubricasReportCache = null;
let rubricasReportCacheAt = 0;

const filenameForReport = (variant = 'single') => REPORT_PREVIEW_VARIANTS[variant]?.filename || SINGLE_REPORT_FILENAME;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getVariantFromSearch(searchParams) {
  if (searchParams.get('report') === 'galeria' || searchParams.get('kind') === 'galeria') return 'galeria';
  if (searchParams.get('report') === 'dados' || searchParams.get('kind') === 'dados') return 'dados';
  if (searchParams.get('report') === 'atividades' || searchParams.get('kind') === 'atividades') return 'atividades';
  return 'single';
}

function getPreviewTitle(variant) {
  if (variant === 'galeria') return 'Prévia do Relatório Galeria';
  if (variant === 'dados') return 'Prévia do Relatório Principal';
  if (variant === 'atividades') return 'Prévia do Relatório de Atividades';
  return 'Prévia do Relatório Físico-Financeiro';
}

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatReportMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'R$ 0,00';
}

function getRubricaValue(rubrica, keys = []) {
  for (const key of keys) {
    const value = rubrica?.[key];
    if (value !== undefined && value !== null && value !== '') return Number(value) || 0;
  }
  return 0;
}

async function loadRubricasForReport() {
  if (Array.isArray(rubricasReportCache) && Date.now() - rubricasReportCacheAt < 2 * 60 * 1000) {
    return rubricasReportCache;
  }
  try {
    const rubricas = await base44.entities.Rubrica.list('ordem_exibicao', 3000);
    rubricasReportCache = Array.isArray(rubricas) ? rubricas : [];
    rubricasReportCacheAt = Date.now();
    return rubricasReportCache;
  } catch (error) {
    console.warn('[Relatório] Não foi possível carregar rubricas para tabela completa.', error);
    return Array.isArray(rubricasReportCache) ? rubricasReportCache : [];
  }
}

function buildRubricasTableSection(rubricas = []) {
  const rows = rubricas.map((rubrica) => {
    const previsto = getRubricaValue(rubrica, ['valor_rubrica', 'valor_total', 'previsto', 'valor']);
    const utilizado = getRubricaValue(rubrica, ['valor_utilizado', 'utilizado', 'valor_pago', 'valor_aprovado']);
    const saldo = Math.max(0, previsto - utilizado);
    const percentual = previsto > 0 ? ((utilizado / previsto) * 100).toFixed(1) : '0.0';
    return `
      <tr>
        <td>${escapeHtml(rubrica.grupo || rubrica.categoria || rubrica.eixo || '-')}</td>
        <td>${escapeHtml(rubrica.nome || rubrica.rubrica || rubrica.descricao || rubrica.descrição || '-')}</td>
        <td>${formatReportMoney(previsto)}</td>
        <td>${formatReportMoney(utilizado)}</td>
        <td>${formatReportMoney(saldo)}</td>
        <td>${percentual}%</td>
      </tr>`;
  }).join('');

  return `
    <section class="premium-section premium-rubricas-completas report-rubricas-completas">
      <p class="premium-kicker">Tabela de rubricas</p>
      <h2>Rubricas completas do 3º Aditivo</h2>
      <p>
        A tabela abaixo consolida as rubricas registradas no aplicativo, apresentando valor previsto,
        valor utilizado, saldo e percentual de execução. A rubrica permanece como fonte de verdade
        para a leitura físico-financeira do projeto.
      </p>
      <div class="premium-table-wrap report-rubricas-table-wrap">
        <table class="premium-rubrica-table report-rubricas-table">
          <thead>
            <tr>
              <th>Grupo</th>
              <th>Rubrica</th>
              <th>Valor previsto</th>
              <th>Valor utilizado</th>
              <th>Saldo</th>
              <th>% utilizado</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

async function ensureRubricasTableInHtml(html = '', variant = 'single') {
  if (!['dados', 'single'].includes(variant)) return html;
  if (!String(html || '').trim() || typeof DOMParser === 'undefined') return html;
  if (String(html).includes('report-rubricas-completas') || String(html).includes('premium-rubricas-completas')) return html;

  const rubricas = await loadRubricasForReport();
  if (!rubricas.length) return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let style = doc.getElementById('report-rubricas-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'report-rubricas-style';
      style.textContent = `
        .report-rubricas-completas { background:#fff; }
        .report-rubricas-table-wrap { width:100%; overflow:visible; margin-top:18px; }
        .report-rubricas-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:10px; line-height:1.32; }
        .report-rubricas-table th { background:#171717; color:#fff; text-align:left; padding:7px 8px; text-transform:uppercase; letter-spacing:.04em; font-size:8px; }
        .report-rubricas-table td { border:1px solid rgba(23,23,23,.12); padding:6px 8px; vertical-align:top; overflow-wrap:anywhere; }
        .report-rubricas-table tbody tr:nth-child(even) td { background:rgba(23,23,23,.035); }
      `;
      doc.head.appendChild(style);
    }

    const section = doc.createRange().createContextualFragment(buildRubricasTableSection(rubricas));
    const main = doc.querySelector('main') || doc.body;
    const anchors = Array.from(doc.querySelectorAll('section, article, div'));
    const anchor = anchors.find((node) => /orçamento geral|orcamento geral|execução financeira|execucao financeira|consolidação completa|consolidacao completa/i.test(node.textContent || ''));

    if (anchor?.parentNode) anchor.parentNode.insertBefore(section, anchor.nextSibling);
    else main.appendChild(section);

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('[Relatório] Falha ao inserir tabela de rubricas no HTML.', error);
    return `${html}\n${buildRubricasTableSection(rubricas)}`;
  }
}

function cleanLegendText(value = '', fallback = 'Registro fotográfico') {
  const cleaned = String(value || '')
    .replace(/\.[a-z0-9]{3,5}(\?|#|$)?/gi, '')
    .replace(/[_-]?\d{8,}[^\s]*/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 3) return fallback;
  if (/^(img|image|foto|dsc|whatsapp|screenshot|download)\s*\d*$/i.test(cleaned)) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function improveGalleryLegendsInHtml(html = '', variant = 'single') {
  if (variant !== 'galeria' || !String(html || '').trim() || typeof DOMParser === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let style = doc.getElementById('report-gallery-legend-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'report-gallery-legend-style';
      style.textContent = `
        .gallery-card figcaption, .gallery-caption, figcaption { font-size:9px; line-height:1.35; color:#403a35; }
        .gallery-card figcaption strong, .gallery-caption strong, figcaption strong { display:block; font-size:11px; color:#111; margin-bottom:4px; }
        .gallery-file-name, .technical-file-name { display:none !important; }
      `;
      doc.head.appendChild(style);
    }

    doc.querySelectorAll('.gallery-file-name, .technical-file-name').forEach((node) => node.remove());

    const cards = Array.from(doc.querySelectorAll('.gallery-card, figure, .gallery-grid article'));
    cards.forEach((card, index) => {
      const img = card.querySelector('img');
      const caption = card.querySelector('figcaption, .gallery-caption, div') || card;
      const sourceText = caption.querySelector('strong')?.textContent || img?.getAttribute('alt') || caption.textContent || '';
      const legend = cleanLegendText(sourceText, `Registro fotográfico ${index + 1}`);

      let strong = caption.querySelector('strong');
      if (!strong) {
        strong = doc.createElement('strong');
        caption.insertBefore(strong, caption.firstChild);
      }
      strong.textContent = legend;

      Array.from(caption.querySelectorAll('span, small, p, div')).forEach((node) => {
        const text = String(node.textContent || '');
        if (/\.(jpe?g|png|webp|gif|heic|avif)/i.test(text) || /arquivo\s*:/i.test(text)) {
          node.textContent = 'Arquivo original preservado no app';
        }
      });

      if (img) img.setAttribute('alt', legend);
    });

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('[Relatório] Falha ao limpar legendas da galeria.', error);
    return html;
  }
}

async function enhanceReportHtml(html = '', variant = 'single') {
  let output = repairReportEncoding(html);
  output = await ensureRubricasTableInHtml(output, variant);
  output = improveGalleryLegendsInHtml(output, variant);
  return sanitizeReportHtmlBeforeSave(repairReportEncoding(output));
}

function getPreviewHtmlFromIndexedDb(key) {
  if (typeof indexedDB === 'undefined') return Promise.resolve('');

  return new Promise((resolve) => {
    const request = indexedDB.open(PREVIEW_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) db.createObjectStore(PREVIEW_DB_STORE);
    };

    request.onerror = () => resolve('');
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(PREVIEW_DB_STORE, 'readonly');
        const getRequest = tx.objectStore(PREVIEW_DB_STORE).get(key);
        getRequest.onsuccess = () => {
          const value = getRequest.result;
          db.close();
          resolve(typeof value === 'string' ? value : value?.html || '');
        };
        getRequest.onerror = () => {
          db.close();
          resolve('');
        };
      } catch {
        db.close();
        resolve('');
      }
    };
  });
}

async function getStoredHtml(variant = 'single') {
  const key = storageKeyForVariant(variant);
  try {
    const quickHtml = sessionStorage.getItem(key) || localStorage.getItem(key) || '';
    if (quickHtml) return quickHtml;
  } catch {
    // IndexedDB abaixo preserva relatórios grandes.
  }

  const fromIndexedDb = await getPreviewHtmlFromIndexedDb(key);
  if (fromIndexedDb) return fromIndexedDb;

  return getPreviewHtmlFromIndexedDb(LEGACY_PREVIEW_HTML_KEY);
}

async function getAnyStoredReportHtml(preferredVariant = 'single') {
  const variantOrder = preferredVariant === 'dados'
    ? ['dados', 'single', 'galeria', 'atividades']
    : preferredVariant === 'galeria'
      ? ['galeria', 'single', 'dados']
      : preferredVariant === 'atividades'
        ? ['atividades', 'single', 'dados']
        : ['single', 'dados', 'galeria', 'atividades'];

  for (const variant of variantOrder) {
    try {
      const preview = variant === 'single'
        ? await getSingleReportPreview()
        : await getReportPreview(variant);
      const fromPreview = String(preview?.html || '').trim();
      if (fromPreview) return repairReportEncoding(fromPreview);
    } catch {
      // tenta a próxima fonte
    }

    try {
      const fromStorage = String(sessionStorage.getItem(storageKeyForVariant(variant)) || localStorage.getItem(storageKeyForVariant(variant)) || '').trim();
      if (fromStorage) return repairReportEncoding(fromStorage);
    } catch {
      // tenta a próxima fonte
    }

    try {
      const fromIndexedDb = String(await getPreviewHtmlFromIndexedDb(storageKeyForVariant(variant)) || '').trim();
      if (fromIndexedDb) return repairReportEncoding(fromIndexedDb);
    } catch {
      // tenta a próxima fonte
    }
  }

  return repairReportEncoding(await getStoredHtml(preferredVariant));
}

function formatDuration(ms) {
  const seconds = Math.max(1, Math.ceil((Number(ms) || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
}

function estimateRemaining(startedAt, percent) {
  const safePercent = Math.max(1, Math.min(98, Number(percent) || 1));
  const elapsed = Date.now() - Number(startedAt || Date.now());
  const totalEstimated = (elapsed / safePercent) * 100;
  return Math.max(1000, totalEstimated - elapsed);
}

function createHiddenReportIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-12000px';
  iframe.style.top = '0';
  iframe.style.width = `${PDF_PAGE_WIDTH_PX}px`;
  iframe.style.height = `${PDF_PAGE_HEIGHT_PX}px`;
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');

  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(String(html || ''));
  iframe.contentDocument.close();

  return iframe;
}

async function waitForIframeAssets(iframe) {
  const doc = iframe?.contentDocument;
  if (!doc) return;

  try {
    await doc.fonts?.ready;
  } catch {
    // fonte indisponível não bloqueia exportação
  }

  const images = Array.from(doc.images || []);
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 12000);
      const finish = () => {
        clearTimeout(timeout);
        resolve();
      };
      image.onerror = finish;
      image.onload = finish;
    });
  }));

  await delay(180);
}

function extractSearchableReportText(doc) {
  const clone = doc.body?.cloneNode(true);
  if (!clone) return '';
  clone.querySelectorAll('script, style, noscript, iframe, svg').forEach((node) => node.remove());
  return String(clone.innerText || clone.textContent || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function applyMinimalA4ExportNormalizer(doc) {
  if (!doc) return;

  doc.querySelectorAll('script, noscript, .legacy-gallery-intro').forEach((node) => node.remove());

  let style = doc.getElementById('pdf-export-a4-minimal-normalizer');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'pdf-export-a4-minimal-normalizer';
    doc.head.appendChild(style);
  }

  style.textContent = `
    @page { size: A4; margin: 0; }
    html, body {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      margin: 0 !important;
      overflow-x: hidden !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body, body * {
      box-sizing: border-box !important;
      max-width: 100% !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
    }
    main, .premium-report, .report-shell, .gallery-report, .activities-report {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      overflow: visible !important;
      transform: none !important;
    }
    img, svg, canvas, video {
      max-width: 100% !important;
      object-fit: contain;
      transform: none !important;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
    }
    thead { display: table-header-group !important; }
    tr, article, figure, .avoid-break, .gallery-card, .activity-full-card, .approved-report-card,
    .premium-metric, .premium-method-card, .premium-infographic-card, .premium-meta-card,
    .premium-finance-summary-card, .premium-report-note {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    th, td {
      overflow-wrap: anywhere !important;
      word-break: normal !important;
      vertical-align: top !important;
    }
    .premium-closing:empty,
    .premium-page-break:empty {
      display: none !important;
    }
  `;

  doc.querySelectorAll('[style]').forEach((node) => {
    const styleValue = String(node.getAttribute('style') || '')
      .replace(/zoom\s*:[^;]+;?/gi, '')
      .replace(/transform\s*:\s*scale\([^;]+;?/gi, '')
      .replace(/max-width\s*:\s*none\s*;?/gi, '');
    node.setAttribute('style', styleValue);
  });

  doc.querySelectorAll('.premium-closing, section, article, div').forEach((node) => {
    const text = String(node.textContent || '').replace(/\s+/g, '').trim();
    const hasVisual = node.querySelector?.('img, table, canvas, svg, figure, article');
    const rect = node.getBoundingClientRect?.();
    if (!hasVisual && text.length === 0 && rect && rect.height > 240) node.remove();
    if (node.classList?.contains('premium-closing') && !hasVisual && text.length < 80) node.remove();
  });
}

function getRenderRoot(doc) {
  return doc.querySelector('main.premium-report')
    || doc.querySelector('main.gallery-report')
    || doc.querySelector('main.activities-report')
    || doc.querySelector('.report-shell')
    || doc.querySelector('.report-content')
    || doc.body;
}

function hasRenderableContent(element) {
  if (!element || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) return false;
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const text = String(element.innerText || element.textContent || '').trim();
  const visualCount = element.querySelectorAll?.('img, table, canvas, svg, figure, article').length || 0;
  return text.length > 16 || visualCount > 0;
}

function getRenderTargets(root) {
  const direct = Array.from(root?.children || []).filter(hasRenderableContent);
  if (direct.length > 0) return direct;
  return [root].filter(hasRenderableContent);
}

function isCanvasSliceMostlyBlank(canvas) {
  const context = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return true;

  const stepX = Math.max(8, Math.floor(canvas.width / 28));
  const stepY = Math.max(8, Math.floor(canvas.height / 40));
  let samples = 0;
  let nonWhite = 0;

  for (let y = 0; y < canvas.height; y += stepY) {
    for (let x = 0; x < canvas.width; x += stepX) {
      const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
      samples += 1;
      if (a > 12 && (r < 245 || g < 245 || b < 245)) nonWhite += 1;
    }
  }

  return samples > 0 && nonWhite / samples < 0.006;
}

function addContinuousPageNumbers(pdf, options = {}) {
  const pageCount = pdf.getNumberOfPages();
  const pageOffset = Number(options.pageNumberOffset || 0);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const reportTitle = repairReportEncoding(options.reportTitle || 'Museus Centro - Relatório');

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    if (pageIndex === 1) continue;
    pdf.setPage(pageIndex);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(90, 90, 90);
    pdf.text('Viaduto das Artes - Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG - viadutodasartes@gmail.com', pageWidth / 2, 5, { align: 'center' });
    pdf.text(`${reportTitle} | Página ${pageOffset + pageIndex} de ${pageOffset + pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
  }
}

async function renderTargetToPdfPages({ html2canvas, pdf, target, progressCallback }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageCanvas = document.createElement('canvas');
  const pageContext = pageCanvas.getContext('2d');
  if (!pageContext) throw new Error('Canvas do PDF indisponível.');

  const canvas = await html2canvas(target, {
    scale: 1.25,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 12000,
    scrollX: 0,
    scrollY: 0,
    windowWidth: PDF_PAGE_WIDTH_PX,
    windowHeight: PDF_PAGE_HEIGHT_PX,
  });

  if (!canvas.width || !canvas.height) return 0;

  const sliceHeight = Math.max(1, Math.floor((canvas.width * pageHeight) / pageWidth));
  pageCanvas.width = canvas.width;

  let pagesAdded = 0;
  for (let y = 0; y < canvas.height; y += sliceHeight) {
    const currentSliceHeight = Math.min(sliceHeight, canvas.height - y);
    pageCanvas.height = currentSliceHeight;
    pageContext.fillStyle = '#ffffff';
    pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageContext.drawImage(canvas, 0, y, canvas.width, currentSliceHeight, 0, 0, pageCanvas.width, currentSliceHeight);

    if (isCanvasSliceMostlyBlank(pageCanvas)) continue;

    if (pdf.__hasContent) pdf.addPage();
    const imageData = pageCanvas.toDataURL('image/jpeg', 0.78);
    const imageHeight = (currentSliceHeight * pageWidth) / canvas.width;
    pdf.addImage(imageData, 'JPEG', 0, 0, pageWidth, imageHeight, undefined, 'MEDIUM');
    pdf.__hasContent = true;
    pagesAdded += 1;
    progressCallback?.(pagesAdded);
  }

  return pagesAdded;
}

async function exportHtmlToPdfBlob(html, options = {}) {
  if (!String(html || '').trim()) throw new Error('HTML do relatório vazio.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const iframe = createHiddenReportIframe(repairReportEncoding(html));

  try {
    applyMinimalA4ExportNormalizer(iframe.contentDocument);
    await waitForIframeAssets(iframe);
    applyMinimalA4ExportNormalizer(iframe.contentDocument);

    const doc = iframe.contentDocument;
    const root = getRenderRoot(doc);
    const targets = getRenderTargets(root);
    const searchableText = extractSearchableReportText(doc);

    if (!targets.length) throw new Error('Nenhuma seção renderizável encontrada para o PDF.');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    let renderedPages = 0;
    for (let index = 0; index < targets.length; index += 1) {
      try {
        renderedPages += await renderTargetToPdfPages({
          html2canvas,
          pdf,
          target: targets[index],
          progressCallback: () => options.onProgress?.(Math.min(90, 40 + Math.round(((index + 1) / targets.length) * 48))),
        });
      } catch (renderError) {
        console.warn('Falha ao renderizar bloco do PDF. O bloco será ignorado no raster e preservado na prévia HTML.', renderError);
      }
    }

    if (!renderedPages) {
      if (!searchableText) throw new Error('PDF gerado sem páginas renderizadas.');
      const margin = 14;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const maxWidth = pageWidth - margin * 2;
      const lines = pdf.splitTextToSize(searchableText, maxWidth);
      let y = margin;
      lines.forEach((line) => {
        if (y > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.setFontSize(9);
        pdf.text(line, margin, y);
        y += 5.2;
      });
    }

    addContinuousPageNumbers(pdf, options);

    const blob = pdf.output('blob');
    if (!blob || blob.size <= 0) throw new Error('PDF gerado sem conteúdo.');

    if (options.returnMeta) return { blob, pageCount: pdf.getNumberOfPages() };
    return blob;
  } finally {
    iframe.remove();
  }
}

async function downloadPdfBlob(blob, filename) {
  if (!blob || blob.size <= 0) throw new Error('PDF não foi gerado.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  await delay(500);
  URL.revokeObjectURL(url);
}

export default function RelatorioPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoExportPdf = searchParams.get('export') === 'pdf';
  const reportVariant = getVariantFromSearch(searchParams);
  const [html, setHtml] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgressOpen, setExportProgressOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [currentExportFile, setCurrentExportFile] = useState(null);
  const [exportProgressMessage, setExportProgressMessage] = useState('');
  const [exportProgressError, setExportProgressError] = useState(null);
  const [autoExportStarted, setAutoExportStarted] = useState(false);
  const [reportMeta, setReportMeta] = useState({});
  const [exportStartedAt, setExportStartedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const preview = reportVariant === 'single'
        ? await getSingleReportPreview()
        : await getReportPreview(reportVariant);
      let finalHtml = preview?.html || '';
      if (!finalHtml) finalHtml = await getStoredHtml(reportVariant);
      if (!finalHtml) finalHtml = await getAnyStoredReportHtml(reportVariant);
      finalHtml = await enhanceReportHtml(finalHtml, reportVariant);
      let finalMeta = preview?.meta || {};
      try {
        const metaRaw = sessionStorage.getItem(metaKeyForVariant(reportVariant)) || localStorage.getItem(metaKeyForVariant(reportVariant));
        if (metaRaw) finalMeta = { ...finalMeta, ...JSON.parse(metaRaw) };
      } catch {
        // meta é opcional
      }
      if (!cancelled) {
        setReportMeta(finalMeta);
        setHtml(repairReportEncoding(finalHtml));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reportVariant]);

  const iframeSrcDoc = useMemo(
    () => repairReportEncoding(html) || '<html><body><p>Prévia não encontrada.</p></body></html>',
    [html]
  );
  const previewTitle = getPreviewTitle(reportVariant);

  useEffect(() => {
    if (!autoExportPdf || !html || isExportingPdf || autoExportStarted) return;
    setAutoExportStarted(true);
    const timer = setTimeout(() => handleExportPdf(), 600);
    return () => clearTimeout(timer);
  }, [autoExportPdf, html, isExportingPdf, autoExportStarted]);

  async function getHtmlForExport() {
    if (String(html || '').trim()) return sanitizeReportHtmlBeforeSave(repairReportEncoding(await enhanceReportHtml(html, reportVariant)));

    const preview = reportVariant === 'single'
      ? await getSingleReportPreview()
      : await getReportPreview(reportVariant);
    const directHtml = repairReportEncoding(preview?.html || (await getStoredHtml(reportVariant)) || '');
    if (String(directHtml || '').trim()) return sanitizeReportHtmlBeforeSave(await enhanceReportHtml(directHtml, reportVariant));
    return sanitizeReportHtmlBeforeSave(await enhanceReportHtml(await getAnyStoredReportHtml(reportVariant), reportVariant));
  }

  function setProgress(percent, message) {
    setExportProgress(percent);
    if (message) setExportProgressMessage(message);
  }

  async function handleExportPdf() {
    const exportHtml = await getHtmlForExport();
    if (!exportHtml) {
      toast.error('HTML do relatório não encontrado. Gere o relatório novamente.');
      return;
    }

    const filename = filenameForReport(reportVariant);
    const startedAt = Date.now();
    setExportStartedAt(startedAt);
    setIsExportingPdf(true);
    setExportProgressOpen(true);
    setCurrentExportFile(filename);
    setExportProgressError(null);
    setProgress(8, 'Preparando HTML original para exportação A4.');
    toast.info('Gerando PDF...');

    try {
      setProgress(24, 'Carregando imagens, fontes e estilos do HTML.');
      await delay(120);

      setProgress(40, 'Renderizando o layout do HTML em páginas A4.');
      const blob = await exportSingleReportPdf({
        html: exportHtml,
        meta: { ...reportMeta, reportVariant },
        exporter: (payloadHtml, payloadOptions = {}) => exportHtmlToPdfBlob(payloadHtml, {
          ...payloadOptions,
          onProgress: (percent) => setProgress(percent),
          includeSearchableAppendix: false,
          meta: { ...reportMeta, reportVariant },
        }),
      });

      setProgress(92, 'Preparando download do arquivo PDF.');
      await downloadPdfBlob(blob, filename);

      setProgress(100, 'Download iniciado. Verifique a pasta de downloads do navegador.');
      toast.success('PDF exportado com sucesso.');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      setExportProgressError(error?.message || 'Erro ao exportar PDF.');
      setExportProgressMessage('A exportação foi interrompida antes do download.');
      toast.error('Erro ao exportar PDF.');
    } finally {
      setIsExportingPdf(false);
      setCurrentExportFile(null);
    }
  }

  async function handleDownloadHtml() {
    let htmlForDownload = html || (await getStoredHtml(reportVariant)) || '';
    if (!String(htmlForDownload || '').trim()) htmlForDownload = await getAnyStoredReportHtml(reportVariant);
    htmlForDownload = await enhanceReportHtml(htmlForDownload, reportVariant);
    htmlForDownload = sanitizeReportHtmlBeforeSave(repairReportEncoding(htmlForDownload));
    if (!String(htmlForDownload || '').trim()) {
      toast.error('HTML do relatório não encontrado. Gere o relatório novamente.');
      return;
    }

    const blob = new Blob([htmlForDownload], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_fisico_financeiro_${reportVariant}_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const eta = exportStartedAt && isExportingPdf && exportProgress > 0 && exportProgress < 100
    ? formatDuration(estimateRemaining(exportStartedAt, exportProgress))
    : null;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-black tracking-tight">{previewTitle}</h1>
            <p className="text-sm text-gray-500 mt-1">Visualização do documento final. O PDF preserva o layout HTML, aplica rubricas no relatório principal e limpa legendas da galeria.</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => navigate('/Relatorios')} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>

            <Button variant="outline" onClick={handleDownloadHtml} className="gap-2" disabled={!html}>
              <Download className="w-4 h-4" />
              Baixar HTML
            </Button>

            <Button onClick={handleExportPdf} className="bg-black hover:bg-gray-800 text-white gap-2" disabled={isExportingPdf}>
              {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {isExportingPdf ? 'Exportando...' : 'Exportar PDF'}
            </Button>
          </div>
        </div>

        <Card className="rounded-2xl border-gray-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {html ? (
              <iframe
                id="relatorio-preview-frame"
                title="Prévia do relatório físico-financeiro"
                srcDoc={iframeSrcDoc}
                className="w-full h-[calc(100vh-180px)] bg-gray-100"
              />
            ) : (
              <div className="min-h-[420px] flex items-center justify-center text-center p-8">
                <div>
                  <p className="text-base font-semibold text-black">Nenhuma prévia carregada.</p>
                  <p className="text-sm text-gray-500 mt-1">Gere a prévia pelo botão Relatório Físico-Financeiro em Relatórios.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={exportProgressOpen}
        onOpenChange={(open) => {
          if (!isExportingPdf) setExportProgressOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Exportando PDF</DialogTitle>
            <DialogDescription>O arquivo está sendo preparado a partir do layout HTML atual.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Progresso geral</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{exportProgress}%</p>
                  {eta ? <p className="mt-1 text-xs font-semibold text-slate-600">Tempo estimado: {eta}</p> : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {currentExportFile ? `Arquivo: ${currentExportFile}` : exportProgress >= 100 ? 'Exportação concluída' : 'Preparando exportação'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{exportProgressMessage}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${exportProgress}%` }} />
              </div>
            </div>

            {exportProgressError ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{exportProgressError}</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>Exportação A4 preservando o HTML: sem bloqueio por elementos grandes e sem redesenhar o relatório.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setExportProgressOpen(false)} disabled={isExportingPdf}>
              {isExportingPdf ? 'Exportando...' : 'Fechar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
