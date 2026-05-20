import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileDown, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { REPORT_CHAPTERS, REPORT_CHAPTER_IDS } from '@/config/reportChapters';

const MAX_EXPORT_PART_SIZE_BYTES = 200 * 1024 * 1024;
const PDF_VOLUME_COUNT = 3;
const EXPORT_FILENAME_BASE = 'Museus-Centro-Relatorio';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function loadSelectedChapterIds() {
  try {
    const raw = sessionStorage.getItem('relatorio_fisico_financeiro_selected_chapters');
    const parsed = JSON.parse(raw || '[]');
    const set = new Set(Array.isArray(parsed) ? parsed : []);
    const ordered = REPORT_CHAPTER_IDS.filter((id) => set.has(id));
    return ordered.length > 0 ? ordered : REPORT_CHAPTER_IDS;
  } catch {
    return REPORT_CHAPTER_IDS;
  }
}

function chapterLabel(chapterId) {
  const chapter = REPORT_CHAPTERS.find((item) => item.id === chapterId);
  return chapter?.title || chapterId;
}

function chapterRenderSignals(chapterId) {
  const chapter = REPORT_CHAPTERS.find((item) => item.id === chapterId);
  const signals = [
    chapter?.renderTitle,
    chapter?.title,
  ].filter(Boolean).map(normalizeText);
  return Array.from(new Set(signals));
}

function filenameForPart(partNumber) {
  return `${EXPORT_FILENAME_BASE}-Volume-${partNumber}.pdf`;
}

const EXPORT_STATUS_LABELS = {
  waiting: 'Aguardando',
  exporting: 'Exportando...',
  preparing_download: 'Preparando download...',
  download_started: 'Download iniciado',
  done: 'ConcluÃ­do',
  error: 'Erro',
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeChapterTitles(chapters = []) {
  const titles = chapters.map((chapter) => chapter?.title).filter(Boolean);
  if (titles.length <= 3) return titles.join(', ');
  return `${titles.slice(0, 3).join(', ')} + ${titles.length - 3} capÃ­tulo(s)`;
}

function extractDocumentParts(html, selectedChapterIds) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  const headHtml = doc.head?.innerHTML || '';
  const reportRoot = doc.querySelector('main.premium-report');
  const root = reportRoot || doc.body;
  const children = Array.from(root?.children || []);

  if (children.length === 0) return null;

  const headerNode = children.find((node) => node.classList?.contains('report-pdf-institutional-header')) || null;
  const contentNodes = children.filter((node) => node !== headerNode);

  const chapters = [];
  let cursor = 0;
  let currentChapter = null;

  const chapterIds = Array.isArray(selectedChapterIds) && selectedChapterIds.length > 0
    ? selectedChapterIds
    : REPORT_CHAPTER_IDS;

  const tryMatchChapterId = (node) => {
    const headingText = [
      node.querySelector('h1')?.textContent,
      node.querySelector('h2')?.textContent,
      node.querySelector('h3')?.textContent,
      node.getAttribute('data-chapter'),
      node.textContent?.slice(0, 600),
    ].filter(Boolean).join(' ');
    const normalizedHeading = normalizeText(headingText);

    if (!normalizedHeading) return null;

    for (let i = cursor; i < chapterIds.length; i += 1) {
      const candidateId = chapterIds[i];
      const signals = chapterRenderSignals(candidateId);
      const matched = signals.some((signal) => signal && normalizedHeading.includes(signal));
      if (matched) {
        cursor = i + 1;
        return candidateId;
      }
    }
    return null;
  };

  contentNodes.forEach((node) => {
    const matchedChapterId = tryMatchChapterId(node);

    if (matchedChapterId) {
      currentChapter = {
        id: matchedChapterId,
        title: chapterLabel(matchedChapterId),
        canBeSplit: REPORT_CHAPTERS.find((item) => item.id === matchedChapterId)?.canBeSplit !== false,
        nodes: [node.outerHTML],
      };
      chapters.push(currentChapter);
      return;
    }

    if (!currentChapter) {
      currentChapter = {
        id: 'prefacio',
        title: 'Abertura',
        canBeSplit: true,
        nodes: [node.outerHTML],
      };
      chapters.push(currentChapter);
      return;
    }

    currentChapter.nodes.push(node.outerHTML);
  });

  if (chapters.length === 0) return null;

  const normalizedChapters = chapters.map((chapter) => {
    const htmlContent = chapter.nodes.join('\n');
    return {
      ...chapter,
      html: htmlContent,
      sizeBytes: new Blob([htmlContent], { type: 'text/html;charset=utf-8' }).size,
    };
  });

  return {
    headHtml,
    headerHtml: headerNode?.outerHTML || '',
    chapters: normalizedChapters,
  };
}

function buildSplitParts(chapters) {
  const source = Array.isArray(chapters) ? chapters.filter(Boolean) : [];
  if (source.length > 0) {
    const volumeCount = Math.min(PDF_VOLUME_COUNT, source.length);
    const totalSize = source.reduce((sum, item) => sum + (item.sizeBytes || 1), 0);
    const targetSize = Math.max(1, Math.ceil(totalSize / volumeCount));
    const fixedParts = Array.from({ length: volumeCount }, () => ({
      chapters: [],
      sizeBytes: 0,
    }));

    let partIndex = 0;
    source.forEach((chapter, index) => {
      const remainingChapters = source.length - index;
      const remainingParts = volumeCount - partIndex;
      const chapterSize = chapter.sizeBytes || 1;
      const current = fixedParts[partIndex];
      const shouldAdvance =
        partIndex < volumeCount - 1 &&
        current.chapters.length > 0 &&
        current.sizeBytes + chapterSize > targetSize &&
        remainingChapters > remainingParts;

      if (shouldAdvance) partIndex += 1;

      fixedParts[partIndex].chapters.push(chapter);
      fixedParts[partIndex].sizeBytes += chapterSize;
    });

    const parts = fixedParts.filter((part) => part.chapters.length > 0);
    const warnings = [];
    if (parts.length !== PDF_VOLUME_COUNT) {
      warnings.push(`O relatório possui ${source.length} capítulo(s) selecionado(s), por isso foram gerados ${parts.length} volume(s).`);
    }
    return { parts, warnings };
  }

  const parts = [];
  let current = [];
  let currentSize = 0;
  const warnings = [];

  const splitOversizedChapter = (chapter) => {
    if (!chapter?.canBeSplit) return [];

    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<body>${chapter.html || ''}</body>`, 'text/html');
    const container = parsed.body;

    const selectors = [
      '.premium-photo-index-item',
      '.premium-report-note',
      '.premium-activity-card',
      '.premium-timeline-item',
      'tbody tr',
      '.premium-meta-card',
    ];

    let selectedNodes = [];
    for (const selector of selectors) {
      const nodes = Array.from(container.querySelectorAll(selector));
      if (nodes.length >= 2) {
        selectedNodes = nodes;
        break;
      }
    }

    if (selectedNodes.length < 2) return [];

    selectedNodes.forEach((node, index) => {
      node.setAttribute('data-split-item', String(index));
    });

    const markedHtml = container.innerHTML;
    const selectedSizeLimit = Math.max(1, Math.floor(MAX_EXPORT_PART_SIZE_BYTES * 0.92));

    const chunkIds = [];
    let currentIds = [];
    let currentChunkSize = 0;
    selectedNodes.forEach((node, index) => {
      const nodeSize = new Blob([node.outerHTML || ''], { type: 'text/html;charset=utf-8' }).size;
      if (currentIds.length > 0 && currentChunkSize + nodeSize > selectedSizeLimit) {
        chunkIds.push(currentIds);
        currentIds = [];
        currentChunkSize = 0;
      }
      currentIds.push(index);
      currentChunkSize += nodeSize;
    });
    if (currentIds.length > 0) chunkIds.push(currentIds);

    if (chunkIds.length <= 1) return [];

    return chunkIds.map((ids, chunkIndex) => {
      const chunkDoc = parser.parseFromString(`<body>${markedHtml}</body>`, 'text/html');
      const allChunkNodes = Array.from(chunkDoc.body.querySelectorAll('[data-split-item]'));

      allChunkNodes.forEach((node) => {
        const nodeId = Number(node.getAttribute('data-split-item'));
        if (!ids.includes(nodeId)) {
          node.remove();
          return;
        }
        node.removeAttribute('data-split-item');
      });

      const htmlChunk = chunkDoc.body.innerHTML;
      return {
        ...chapter,
        id: `${chapter.id}__parte_${chunkIndex + 1}`,
        title: `${chapter.title} — Parte ${String(chunkIndex + 1).padStart(2, '0')}`,
        html: htmlChunk,
        sizeBytes: new Blob([htmlChunk], { type: 'text/html;charset=utf-8' }).size,
      };
    });
  };

  const pushCurrent = () => {
    if (current.length === 0) return;
    const sizeBytes = current.reduce((sum, item) => sum + item.sizeBytes, 0);
    parts.push({
      chapters: current,
      sizeBytes,
    });
    current = [];
    currentSize = 0;
  };

  chapters.forEach((chapter) => {
    if (chapter.sizeBytes <= MAX_EXPORT_PART_SIZE_BYTES) {
      const nextWouldOverflow = current.length > 0 && (currentSize + chapter.sizeBytes > MAX_EXPORT_PART_SIZE_BYTES);
      if (nextWouldOverflow) pushCurrent();
      current.push(chapter);
      currentSize += chapter.sizeBytes;
      return;
    }

    const splitChunks = splitOversizedChapter(chapter);
    if (splitChunks.length > 1) {
      pushCurrent();
      splitChunks.forEach((splitChunk) => {
        parts.push({
          chapters: [splitChunk],
          sizeBytes: splitChunk.sizeBytes,
          oversizedSingleChapter: true,
          internallySplit: true,
        });
      });
      warnings.push(`O capítulo ${chapter.title} excedeu o limite técnico legado e foi dividido em subpartes para preservar a integridade do PDF.`);
      return;
    }

    pushCurrent();
    parts.push({
      chapters: [chapter],
      sizeBytes: chapter.sizeBytes,
      oversizedSingleChapter: true,
    });

    warnings.push(`O capítulo ${chapter.title} excede o limite técnico legado e foi exportado em arquivo próprio para preservar a integridade do PDF.`);
  });

  pushCurrent();

  return { parts, warnings };
}

function buildPartSummary(parts) {
  if (!Array.isArray(parts) || parts.length <= 1) return '';
  return `
    <section style="max-width:210mm;margin:0 auto 16px;padding:0 20px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:14px 16px;background:#fff;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;">Sumário comum dos volumes</p>
        <p style="margin:0 0 8px;font-size:11.5px;line-height:1.45;">Os três volumes preservam este mesmo sumário e usam paginação contínua no rodapé para posterior junção externa.</p>
        <ul style="margin:0;padding-left:18px;font-size:11.5px;line-height:1.5;">
          ${parts.map((part, index) => `<li>Volume ${String(index + 1).padStart(2, '0')} — ${part.chapters.map((chapter) => escapeHtml(chapter.title)).join(', ')}</li>`).join('')}
        </ul>
      </div>
    </section>
  `;
}

function buildPartHtml(documentParts, part, partIndex, totalParts, summaryHtml = '') {
  const partHeader = `
    <section style="max-width:210mm;margin:0 auto 14px;padding:0 20px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:12px 14px;background:#fff;">
        <p style="margin:0;font-size:13px;font-weight:700;">Relatório Museus Centro — Volume ${String(partIndex).padStart(2, '0')} de ${String(totalParts).padStart(2, '0')}</p>
        <p style="margin:6px 0 0;font-size:11.5px;line-height:1.45;">Capítulos: ${part.chapters.map((chapter) => escapeHtml(chapter.title)).join(', ')}</p>
      </div>
    </section>
  `;

  return `<!doctype html>
<html lang="pt-BR">
<head>${documentParts.headHtml}</head>
<body>
  <main class="premium-report">
    ${documentParts.headerHtml || ''}
    ${summaryHtml || ''}
    ${partHeader}
    ${part.chapters.map((chapter) => chapter.html).join('\n')}
  </main>
</body>
</html>`;
}

async function waitForIframeAssets(iframe) {
  const doc = iframe?.contentDocument;
  if (!doc) return;

  try {
    await doc.fonts?.ready;
  } catch {}

  const images = Array.from(doc.images || []);
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }));

  await delay(150);
}

function createHiddenReportIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '1024px';
  iframe.style.height = '1448px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');

  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(String(html || ''));
  iframe.contentDocument.close();

  return iframe;
}

function getPdfRenderTargets(root) {
  const MAX_SECTION_HEIGHT = 5200;
  const result = [];

  function collect(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const children = Array.from(element.children || []).filter((child) => {
      const childRect = child.getBoundingClientRect();
      return childRect.width > 0 && childRect.height > 0;
    });

    if (element.scrollHeight > MAX_SECTION_HEIGHT && children.length > 0) {
      children.forEach(collect);
      return;
    }

    result.push(element);
  }

  const children = Array.from(root?.children || []).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  (children.length > 0 ? children : [root]).forEach(collect);
  return result;
}

function extractSearchableReportText(doc) {
  const clone = doc.body?.cloneNode(true);
  if (!clone) return '';

  clone.querySelectorAll('script, style, noscript, iframe, svg').forEach((node) => node.remove());

  const text = String(clone.innerText || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return text;
}

function addSearchableTextAppendix(pdf, text, options = {}) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 4.6;
  const footerY = pageHeight - 8;
  let y = margin;

  pdf.addPage();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(options.title || 'Anexo textual pesquisável', margin, y);

  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(
    'Este anexo é gerado a partir do HTML completo para preservar busca textual e conteúdo integral do relatório.',
    margin,
    y,
    { maxWidth }
  );

  y += 9;
  pdf.setFontSize(7.5);

  const lines = pdf.splitTextToSize(normalizedText, maxWidth);
  lines.forEach((line) => {
    if (y > pageHeight - margin) {
      pdf.setFontSize(7);
      pdf.text('Anexo textual pesquisável', margin, footerY);
      pdf.addPage();
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  });
}

function addContinuousPageNumbers(pdf, options = {}) {
  const pageCount = pdf.getNumberOfPages();
  const pageOffset = Number(options.pageNumberOffset || 0);
  const volumeNumber = options.volumeNumber ? String(options.volumeNumber).padStart(2, '0') : '';
  const totalVolumes = options.totalVolumes ? String(options.totalVolumes).padStart(2, '0') : '';
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    pdf.setPage(pageIndex);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(90, 90, 90);
    const pageNumber = pageOffset + pageIndex;
    const label = volumeNumber && totalVolumes
      ? `Volume ${volumeNumber}/${totalVolumes} · página ${pageNumber}`
      : `página ${pageNumber}`;
    const footerLabel = volumeNumber
      ? `Museus Centro - Relatorio Institucional - Volume ${Number(options.volumeNumber)} | Pagina ${pageNumber}`
      : label;
    pdf.text(footerLabel, pageWidth / 2, pageHeight - 6, { align: 'center' });
  }
}

async function exportHtmlToPdfBlob(html, options = {}) {
  if (!String(html || '').trim()) {
    throw new Error('HTML do relatorio vazio.');
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const iframe = createHiddenReportIframe(html);

  try {
    await waitForIframeAssets(iframe);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageCanvas = document.createElement('canvas');
    const pageContext = pageCanvas.getContext('2d');
    if (!pageContext) {
      throw new Error('Canvas do PDF indisponivel.');
    }

    const doc = iframe.contentDocument;
    const target = doc.querySelector('main.premium-report') || doc.body;
    const searchableText = extractSearchableReportText(doc);
    const renderTargets = getPdfRenderTargets(target);
    let hasPageContent = false;

    for (const element of renderTargets) {
      let canvas = null;
      try {
        canvas = await html2canvas(element, {
          scale: 1.2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 12000,
          windowWidth: Math.max(element.scrollWidth, target.scrollWidth, 1024),
          windowHeight: Math.max(element.scrollHeight, element.clientHeight, 800),
        });
      } catch (renderError) {
        console.warn('Falha ao renderizar bloco do PDF. O bloco sera ignorado no raster e preservado no fallback textual.', renderError);
        continue;
      }

      if (!canvas.width || !canvas.height) continue;

      const pageCanvasHeight = Math.max(1, Math.floor((canvas.width * pageHeight) / pageWidth));
      pageCanvas.width = canvas.width;

      for (let y = 0; y < canvas.height; y += pageCanvasHeight) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - y);
        pageCanvas.height = sliceHeight;
        pageContext.fillStyle = '#ffffff';
        pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageContext.drawImage(
          canvas,
          0,
          y,
          canvas.width,
          sliceHeight,
          0,
          0,
          pageCanvas.width,
          sliceHeight
        );

        if (hasPageContent) pdf.addPage();

        try {
          const imageData = pageCanvas.toDataURL('image/jpeg', 0.82);
          const imageHeight = (sliceHeight * pageWidth) / canvas.width;
          pdf.addImage(imageData, 'JPEG', 0, 0, pageWidth, imageHeight, undefined, 'FAST');
          hasPageContent = true;
        } catch (imageError) {
          console.warn('Falha ao inserir imagem no PDF. Tentando continuar com os demais blocos.', imageError);
        }
      }
    }

    if (!hasPageContent) {
      if (!searchableText) {
        throw new Error('PDF gerado sem paginas renderizadas.');
      }

      const margin = 14;
      const lineHeight = 5.2;
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
        y += lineHeight;
      });
    } else if (options.includeSearchableAppendix !== false) {
      addSearchableTextAppendix(pdf, searchableText);
    }

    addContinuousPageNumbers(pdf, options);

    const blob = pdf.output('blob');
    if (!blob || blob.size <= 0) {
      throw new Error('PDF gerado sem conteudo.');
    }

    if (options.returnMeta) {
      return {
        blob,
        pageCount: pdf.getNumberOfPages(),
      };
    }

    return blob;
  } finally {
    iframe.remove();
  }
}

async function downloadPdfBlob(blob, filename) {
  if (!blob || blob.size <= 0) {
    throw new Error('PDF nao foi gerado.');
  }

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

const PREVIEW_DB_NAME = 'museus_centro_report_preview';
const PREVIEW_DB_STORE = 'previews';
const PREVIEW_HTML_KEY = 'latest_html';

function getPreviewHtmlFromIndexedDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve('');

  return new Promise((resolve) => {
    const request = indexedDB.open(PREVIEW_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) {
        db.createObjectStore(PREVIEW_DB_STORE);
      }
    };

    request.onerror = () => resolve('');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(PREVIEW_DB_STORE, 'readonly');
      const getRequest = tx.objectStore(PREVIEW_DB_STORE).get(PREVIEW_HTML_KEY);
      getRequest.onsuccess = () => {
        const value = getRequest.result;
        db.close();
        resolve(typeof value === 'string' ? value : value?.html || '');
      };
      getRequest.onerror = () => {
        db.close();
        resolve('');
      };
    };
  });
}

async function getStoredHtml() {
  try {
    const quickHtml = sessionStorage.getItem('relatorio_fisico_financeiro_html')
      || localStorage.getItem('relatorio_fisico_financeiro_html')
      || '';
    if (quickHtml) return quickHtml;
  } catch {
    // IndexedDB below remains the most robust fallback for large reports.
  }

  return getPreviewHtmlFromIndexedDb();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(1).replace('.', ',')}%`;
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isApprovedReport(report) {
  const status = normalizeStatus(report?.status);

  return [
    '',
    'APPROVED',
    'APROVADO',
    'APROVADO_COORD',
    'APROVADO_ADMIN',
    'APROVADO_COORDENACAO',
  ].includes(status);
}

function getApprovedReports(reports = []) {
  return (Array.isArray(reports) ? reports : []).filter(isApprovedReport);
}

function getReportActivities(report) {
  return Array.isArray(report?.atividades) ? report.atividades : [];
}

function getReportPublico(report) {
  const declarado = toNumber(
    report?.publico_geral_declarado ??
      report?.publico_total ??
      report?.publico ??
      0
  );

  if (declarado > 0) return declarado;

  return getReportActivities(report).reduce(
    (sum, activity) => sum + getPublicoAtividade(activity),
    0
  );
}

function summarizeReports(reports = []) {
  const approvedReports = getApprovedReports(reports);
  const allActivities = approvedReports.flatMap(getReportActivities);
  const publicoTotal = approvedReports.reduce(
    (sum, report) => sum + getReportPublico(report),
    0
  );

  const reportsWithPublico = approvedReports.filter(
    (report) => getReportPublico(report) > 0
  ).length;

  const reportsWithActivities = approvedReports.filter(
    (report) => getReportActivities(report).length > 0
  ).length;

  const byMuseu = approvedReports.reduce((acc, report) => {
    const museu =
      report?.museu ||
      report?.equipamento ||
      'Atuacao geral';

    if (!acc[museu]) {
      acc[museu] = {
        museu,
        reports: 0,
        activities: 0,
        publico: 0,
      };
    }

    acc[museu].reports += 1;
    acc[museu].activities += getReportActivities(report).length;
    acc[museu].publico += getReportPublico(report);

    return acc;
  }, {});

  return {
    totalReports: approvedReports.length,
    totalActivities: allActivities.length,
    publicoTotal,
    reportsWithPublico,
    reportsWithActivities,
    publicoCoverage:
      approvedReports.length > 0
        ? (reportsWithPublico / approvedReports.length) * 100
        : 0,
    activityCoverage:
      approvedReports.length > 0
        ? (reportsWithActivities / approvedReports.length) * 100
        : 0,
    byMuseu: Object.values(byMuseu).sort(
      (a, b) => b.reports - a.reports
    ),
  };
}

function renderAnexosExecutiveSummary(reports = []) {
  const summary = summarizeReports(reports);

  if (!summary.totalReports) return '';

  const museuRows = summary.byMuseu
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.museu)}</td>
          <td class="num">${formatInt(item.reports)}</td>
          <td class="num">${formatInt(item.activities)}</td>
          <td class="num">${formatInt(item.publico)}</td>
        </tr>
      `
    )
    .join('');

  const alerts = [
    summary.publicoCoverage < 100
      ? `${formatInt(
          summary.totalReports - summary.reportsWithPublico
        )} relatorio(s) sem publico consolidado.`
      : '',
    summary.activityCoverage < 100
      ? `${formatInt(
          summary.totalReports - summary.reportsWithActivities
        )} relatorio(s) sem atividades detalhadas.`
      : '',
  ].filter(Boolean);

  return `
    <section class="anexos-executive-summary">
      <div class="anexos-section-kicker">
        Sintese de consistencia dos anexos
      </div>

      <h3>Base documental consolidada</h3>

      <p>
        Antes da leitura individual dos anexos, este quadro resume a base
        documental aprovada que sustenta o relatorio geral e ajuda a localizar
        rapidamente lacunas de preenchimento.
      </p>

      <div class="anexos-kpi-grid">
        <div>
          <span>Relatorios aprovados</span>
          <strong>${formatInt(summary.totalReports)}</strong>
        </div>

        <div>
          <span>Atividades detalhadas</span>
          <strong>${formatInt(summary.totalActivities)}</strong>
        </div>

        <div>
          <span>Publico consolidado</span>
          <strong>${formatInt(summary.publicoTotal)}</strong>
        </div>

        <div>
          <span>Cobertura de publico</span>
          <strong>${formatPercent(summary.publicoCoverage)}</strong>
        </div>
      </div>

      ${
        museuRows
          ? `
            <table class="anexos-museu-table">
              <thead>
                <tr>
                  <th>Museu / atuacao</th>
                  <th class="num">Relatorios</th>
                  <th class="num">Atividades</th>
                  <th class="num">Publico</th>
                </tr>
              </thead>
              <tbody>${museuRows}</tbody>
            </table>
          `
          : ''
      }

      ${
        alerts.length
          ? `
            <div class="anexos-alerts">
              <strong>Pontos para revisao editorial</strong>
              <ul>
                ${alerts
                  .map((alert) => `<li>${escapeHtml(alert)}</li>`)
                  .join('')}
              </ul>
            </div>
          `
          : `
            <div class="anexos-ok-note">
              A base aprovada possui atividades e publico informados em todos
              os relatorios individuais localizados para o periodo.
            </div>
          `
      }
    </section>
  `;
}

function parsePtDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);

  if (!match) return null;

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getReportPeriodFromHtml(html) {
  const match = String(html || '').match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);

  return {
    from: parsePtDate(match?.[1]) || '2026-02-02',
    to: parsePtDate(match?.[2]) || '2026-04-30',
  };
}

function filterByPeriod(items, dateFrom, dateTo) {
  if (!Array.isArray(items)) return [];

  return items.filter((item) => {
    const rawDate =
      item?.submitted_at ||
      item?.data_inicio ||
      item?.data_realizacao ||
      item?.data ||
      item?.created_date ||
      item?.updated_date ||
      '';

    const date = String(rawDate).slice(0, 10);

    if (!date) return true;
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;

    return true;
  });
}

function getPublicoAtividade(atividade) {
  const direto = toNumber(
    atividade?.publico_total ??
      atividade?.publico_estimado ??
      atividade?.publico ??
      0
  );

  if (direto > 0) return direto;

  const medio = toNumber(
    atividade?.publico_medio_por_sessao ??
      atividade?.publico_medio ??
      0
  );

  const vezes = Math.max(
    1,
    Math.round(
      toNumber(
        atividade?.quantas_vezes_ocorreu ??
          atividade?.ocorrencias ??
          1
      )
    )
  );

  return medio * vezes;
}

function getReportAuthor(report) {
  return (
    report?.author_name ||
    report?.user_name ||
    report?.created_by ||
    report?.email ||
    'Profissional não identificado'
  );
}

function getReportPeriodLabel(report) {
  return [
    report?.mes_referencia || report?.mes || '',
    report?.ano || '',
  ]
    .filter(Boolean)
    .join('/');
}

function getActivityTitle(activity, index) {
  return (
    activity?.titulo ||
    activity?.nome ||
    activity?.nome_atividade ||
    activity?.atividade ||
    `Atividade ${index + 1}`
  );
}

function stripEditorialMarkers(html) {
  return String(html || '')
    .replace(
      /<p>\s*(?:\*\*)?Par[áa]grafo\s+\d+\s*[—-][^:<]*:?\s*(?:\*\*)?\s*<\/p>/gi,
      ''
    )
    .replace(
      /<p>\s*(?:\*\*)?Par[áa]grafo\s+\d+\s*:?\s*(?:\*\*)?\s*<\/p>/gi,
      ''
    )
    .replace(
      /(<p>\s*)(?:\*\*)?Par[áa]grafo\s+\d+\s*[—-][^:<]*:?\s*(?:\*\*)?\s*/gi,
      '$1'
    )
    .replace(
      /(<p>\s*)(?:\*\*)?Par[áa]grafo\s+\d+\s*:?\s*(?:\*\*)?\s*/gi,
      '$1'
    )
    .replace(/<p>\s*#{1,6}\s*([^<]+)<\/p>/g, '<h3>$1</h3>')
    .replace(/<p>\s*---\s*<\/p>/g, '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function renderTextBlock(label, value) {
  if (!value) return '';

  return `
    <div class="anexo-text-block">
      <strong>${escapeHtml(label)}:</strong>
      <p>${escapeHtml(value)}</p>
    </div>
  `;
}

function renderActivityFiles(activity) {
  const files = [];

  const fotos = Array.isArray(activity?.fotos)
    ? activity.fotos
    : [];

  const anexos = Array.isArray(activity?.anexos)
    ? activity.anexos
    : [];

  const arquivos = Array.isArray(activity?.arquivos)
    ? activity.arquivos
    : [];

  [...fotos, ...anexos, ...arquivos].forEach((file, index) => {
    const url =
      file?.file_url ||
      file?.drive_url ||
      file?.url ||
      file?.arquivo_url ||
      '';

    if (!url) return;

    const label =
      file?.legenda ||
      file?.nome ||
      file?.name ||
      `Arquivo ${index + 1}`;

    files.push(`
      <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        ${escapeHtml(label)}
      </a>
    `);
  });

  if (!files.length) return '';

  return `
    <div class="anexo-files">
      <strong>Arquivos e evidências:</strong>
      ${files.join('')}
    </div>
  `;
}

function buildRelatoriosAnexosHtml(reports = []) {
  const approvedReports = getApprovedReports(reports);

  if (!approvedReports.length) return '';

  const anexos = approvedReports
    .map((report, reportIndex) => {
      const atividades = Array.isArray(report?.atividades)
        ? report.atividades
        : [];

      const author = getReportAuthor(report);

      const periodo =
        getReportPeriodLabel(report) ||
        'Período não informado';

      const publicoDeclarado = toNumber(
        report?.publico_geral_declarado ??
          report?.publico_total ??
          0
      );

      const atividadesHtml = atividades.length
        ? atividades
            .map((activity, index) => {
              return `
                <article class="anexo-atividade">
                  <h4>
                    ${String(index + 1).padStart(2, '0')} ·
                    ${escapeHtml(
                      getActivityTitle(activity, index)
                    )}
                  </h4>

                  <div class="anexo-meta-line">
                    <span>
                      <strong>Data:</strong>
                      ${escapeHtml(
                        activity?.data_realizacao ||
                          activity?.data_inicio ||
                          activity?.data ||
                          '—'
                      )}
                    </span>

                    <span>
                      <strong>Tipo:</strong>
                      ${escapeHtml(
                        activity?.classificacao ||
                          activity?.tipo ||
                          '—'
                      )}
                    </span>

                    <span>
                      <strong>Público:</strong>
                      ${formatInt(
                        getPublicoAtividade(activity)
                      )}
                    </span>
                  </div>

                  ${renderTextBlock(
                    'Objetivo',
                    activity?.objetivo
                  )}

                  ${renderTextBlock(
                    'Descrição do executado',
                    activity?.descricao_executado ||
                      activity?.descricao ||
                      activity?.relato
                  )}

                  ${renderTextBlock(
                    'Resultados e impactos',
                    activity?.resultados_impactos ||
                      activity?.impactos ||
                      activity?.resultado
                  )}

                  ${renderTextBlock(
                    'Problemas',
                    activity?.problemas
                  )}

                  ${renderTextBlock(
                    'Soluções',
                    activity?.solucoes
                  )}

                  ${renderTextBlock(
                    'Depoimentos ou fatos marcantes',
                    activity?.depoimento_participantes ||
                      activity?.depoimentos ||
                      activity?.fatos_marcantes
                  )}

                  ${renderActivityFiles(activity)}
                </article>
              `;
            })
            .join('')
        : '<p>Nenhuma atividade detalhada vinculada a este relatório.</p>';

      return `
        <section class="anexo-relatorio">
          <div class="mini-capa-anexo">
            <div class="anexo-eyebrow">
              ANEXO ${String(reportIndex + 1).padStart(
                2,
                '0'
              )} · Relatório individual da equipe
            </div>

            <h2>${escapeHtml(author)}</h2>

            <p>
              ${escapeHtml(
                report?.funcao ||
                  report?.role ||
                  'Função não informada'
              )}
              ·
              ${escapeHtml(
                report?.museu ||
                  'Museu/atuação não informado'
              )}
              ·
              ${escapeHtml(periodo)}
            </p>
          </div>

          <div class="anexo-resumo-grid">
            <div>
              <span>Atividades</span>
              <strong>${formatInt(
                atividades.length
              )}</strong>
            </div>

            <div>
              <span>Público declarado</span>
              <strong>${formatInt(
                publicoDeclarado
              )}</strong>
            </div>

            <div>
              <span>Status</span>
              <strong>${escapeHtml(
                report?.status || '—'
              )}</strong>
            </div>
          </div>

          ${renderTextBlock(
            'Resumo executivo',
            report?.resumo_executivo
          )}

          ${renderTextBlock(
            'Resumo do período',
            report?.resumo_periodo
          )}

          ${renderTextBlock(
            'Pontos positivos',
            report?.avaliacao_pontos_positivos
          )}

          ${renderTextBlock(
            'Desafios',
            report?.avaliacao_desafios ||
              report?.desafios
          )}

          ${renderTextBlock(
            'Encaminhamentos',
            report?.encaminhamentos ||
              report?.proximos_passos
          )}

          <h3>Atividades detalhadas do relatório</h3>

          ${atividadesHtml}
        </section>
      `;
    })
    .join('');

  return `
    <section class="secao anexos-equipe-section">
      <h2>Anexos — Relatórios Individuais das Equipes</h2>

      <p>
        Esta seção reúne, um a um, os relatórios individuais aprovados
        que fundamentam a síntese institucional do período.
      </p>

      ${renderAnexosExecutiveSummary(approvedReports)}

      ${anexos}
    </section>
  `;
}

function getAnexosCss() {
  return `
    .anexos-equipe-section {
      page-break-before: always;
    }

    .anexos-section-kicker {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .16em;
      color: #777;
      font-weight: 700;
      margin: 22px 0 6px;
    }

    .anexos-executive-summary {
      border: 1.5px solid #d6d6d6;
      border-radius: 14px;
      padding: 20px;
      margin: 24px 0 30px;
      background: #fafafa;
      break-inside: avoid;
    }

    .anexos-executive-summary h3 {
      margin: 0 0 8px;
      font-size: 19px;
    }

    .anexos-executive-summary p {
      margin-bottom: 14px;
    }

    .anexos-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 14px 0 18px;
    }

    .anexos-kpi-grid div {
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }

    .anexos-kpi-grid span {
      display: block;
      font-size: 8.5px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: .1em;
      min-height: 24px;
    }

    .anexos-kpi-grid strong {
      display: block;
      font-size: 18px;
      margin-top: 5px;
    }

    .anexos-museu-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin: 10px 0 14px;
      background: #fff;
      border: 1px solid #e5e5e5;
    }

    .anexos-museu-table th,
    .anexos-museu-table td {
      border-bottom: 1px solid #e5e5e5;
      padding: 8px 10px;
      text-align: left;
    }

    .anexos-museu-table th {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: #666;
      background: #f3f3f3;
    }

    .anexos-museu-table .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .anexos-alerts,
    .anexos-ok-note {
      border-radius: 8px;
      padding: 12px;
      font-size: 10px;
      margin-top: 12px;
    }

    .anexos-alerts {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #7c2d12;
    }

    .anexos-alerts strong {
      display: block;
      margin-bottom: 4px;
    }

    .anexos-alerts ul {
      margin: 0;
      padding-left: 16px;
    }

    .anexos-ok-note {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
    }

    .anexo-relatorio {
      page-break-before: always;
      break-inside: avoid;
    }

    .mini-capa-anexo {
      border: 2px solid #111;
      border-radius: 14px;
      padding: 24px;
      margin: 22px 0 18px;
      background: linear-gradient(
        135deg,
        #f7f7f7 0%,
        #ffffff 100%
      );
    }

    .mini-capa-anexo h2 {
      border-bottom: 0;
      margin: 8px 0 6px;
      padding: 0;
      font-size: 24px;
    }

    .mini-capa-anexo p {
      margin: 0;
      color: #555;
      font-size: 12px;
    }

    .anexo-eyebrow {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .16em;
      color: #777;
      font-weight: 700;
    }

    .anexo-resumo-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 14px 0 18px;
    }

    .anexo-resumo-grid div {
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 10px;
      background: #fafafa;
    }

    .anexo-resumo-grid span {
      display: block;
      font-size: 8.5px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: .1em;
    }

    .anexo-resumo-grid strong {
      font-size: 15px;
    }

    .anexo-text-block {
      margin: 10px 0;
      break-inside: avoid;
    }

    .anexo-text-block strong {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .anexo-text-block p {
      margin: 3px 0 0;
    }

    .anexo-atividade {
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      padding: 14px;
      margin: 12px 0;
      background: #fff;
      break-inside: avoid;
    }

    .anexo-atividade h4 {
      margin: 0 0 8px;
      font-size: 13px;
    }

    .anexo-meta-line {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      font-size: 9.5px;
      color: #555;
      margin-bottom: 8px;
    }

    .anexo-files {
      margin-top: 8px;
      font-size: 10px;
    }

    .anexo-files strong {
      display: block;
      margin-bottom: 4px;
    }

    .anexo-files a {
      display: inline-block;
      margin: 0 6px 6px 0;
      padding: 3px 7px;
      border-radius: 999px;
      background: #f3f3f3;
      color: #111;
      text-decoration: none;
      border: 1px solid #e0e0e0;
    }
  `;
}

function addAnexosCss(html) {
  if (!html || html.includes('.anexos-executive-summary')) {
    return html;
  }

  return html.replace(
    '</style>',
    `${getAnexosCss()}</style>`
  );
}

function addPrintA4Css(html) {
  if (!html || html.includes('relatorio-print-a4-css')) return html;

  const css = `
    <style id="relatorio-print-a4-css">
      @media print {
        @page {
          size: A4;
          margin: 18mm 14mm 18mm 14mm;
        }

        html, body {
          width: 210mm;
          background: #fff !important;
        }

        main.premium-report {
          width: 210mm !important;
          max-width: 210mm !important;
          margin: 0 auto !important;
          background: #fff !important;
        }

        section,
        article,
        table,
        img,
        .premium-section,
        .premium-activity-card,
        .premium-photo-index-item,
        .premium-meta-card,
        .premium-report-note {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        h1, h2, h3 {
          break-after: avoid;
          page-break-after: avoid;
        }

        img {
          max-width: 100% !important;
          height: auto !important;
        }

        table {
          width: 100% !important;
          table-layout: fixed;
        }

        th, td {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
      }
    </style>
  `;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${css}</head>`);
  }

  return html.replace('</style>', `${css}</style>`);
}

function addAnexosToSummary(html) {
  if (
    !html ||
    html.includes('Anexos — Relatórios Individuais')
  ) {
    return html;
  }

  const item = `
    <li>
      <span class="num">AN</span>
      <span class="titulo-item">
        Anexos — Relatórios Individuais
      </span>
    </li>
  `;

  return html.replace('</ol>', `${item}</ol>`);
}

function normalizeHtmlContentKey(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatIsoDateForReport(match, year, month, day, hour, minute) {
  const date = `${day}/${month}/${year}`;
  if (!hour || !minute) return date;
  return `${date}, ${hour}h${minute}`;
}

function cleanVisibleReportText(value = '') {
  return String(value || '')
    .replace(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?Z?/g, formatIsoDateForReport)
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, (_match, year, month, day) => `${day}/${month}/${year}`)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\biaduto das Artes\b/g, 'Viaduto das Artes')
    .replace(/\bEste relatório consolida o 2 de fevereiro\b/g, 'Este relatório consolida o período de 2 de fevereiro')
    .replace(/\bAcompanhameto\b/gi, 'Acompanhamento')
    .replace(/\bdia Da Mulher\b/g, 'Dia da Mulher')
    .replace(/\bdia nacional de libras\b/gi, 'Dia Nacional da Libras')
    .replace(/\ba SEBRAE\b/g, 'o Sebrae')
    .replace(/\bPrestação de contas\b/g, 'prestação de contas')
    .replace(/\bExecução financeira\b/g, 'execução financeira')
    .replace(/\bapp\b/g, 'aplicativo')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ');
}

function normalizeFiscalFileName(value = '') {
  return normalizeHtmlContentKey(value)
    .replace(/^[a-f0-9]{6,}_/i, '')
    .replace(/\.(pdf|xml|jpg|jpeg|png|webp)$/i, '')
    .replace(/\b(documento fiscal|nota fiscal|entradaunica|attachment|abrir arquivo)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanupTextNodesForPdf(doc) {
  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const cleaned = cleanVisibleReportText(node.nodeValue);
    if (cleaned !== node.nodeValue) {
      node.nodeValue = cleaned;
    }
  });
}

function dedupeTableRowsForPdf(doc) {
  doc.querySelectorAll('table').forEach((table) => {
    const seen = new Set();
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = Array.from(row.cells || []).map((cell) => normalizeHtmlContentKey(cell.textContent));
      if (cells.length === 0) return;

      const fiscalLike = cells.length >= 8 && /abrir arquivo|documento fiscal|nota fiscal|xml|pdf|jpeg|jpg/.test(cells.join(' '));
      const key = fiscalLike
        ? [
          normalizeFiscalFileName(cells[1] || cells[0]),
          cells[3] || '',
          cells[4] || '',
          cells[5] || '',
          cells[6] || '',
        ].join('|')
        : cells.join('|');

      if (!key.trim()) return;
      if (seen.has(key)) {
        row.remove();
        return;
      }
      seen.add(key);
    });
  });
}

function dedupeRepeatedBlocksForPdf(doc) {
  const seenByParent = new WeakMap();
  const selectors = [
    '.premium-activity-card',
    '.premium-timeline-item',
    '.premium-report-note',
    '.premium-photo-index-item',
    '.premium-meta-card',
    'li',
  ];

  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((node) => {
      const parent = node.parentElement;
      if (!parent) return;
      let seenKeys = seenByParent.get(parent);
      if (!seenKeys) {
        seenKeys = new Set();
        seenByParent.set(parent, seenKeys);
      }

      const key = normalizeHtmlContentKey(node.textContent).slice(0, 900);
      if (key.length < 24) return;
      if (seenKeys.has(key)) {
        node.remove();
        return;
      }
      seenKeys.add(key);
    });
  });

  doc.querySelectorAll('[data-report-chapter-id], [data-report-chapter-ids]').forEach((section) => {
    const paragraphs = Array.from(section.querySelectorAll('p'));
    const seen = new Set();
    paragraphs.forEach((paragraph) => {
      const key = normalizeHtmlContentKey(paragraph.textContent);
      if (key.length < 70) return;
      if (seen.has(key)) {
        paragraph.remove();
        return;
      }
      seen.add(key);
    });
  });
}

function cleanupReportHtmlForPdf(html = '') {
  if (!String(html || '').trim()) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html), 'text/html');

    cleanupTextNodesForPdf(doc);
    dedupeTableRowsForPdf(doc);
    dedupeRepeatedBlocksForPdf(doc);

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('Falha ao limpar HTML do relatório antes do PDF:', error);
    return html;
  }
}

function prepareFinalHtml(rawHtml, reports = []) {
  let finalHtml = cleanupReportHtmlForPdf(stripEditorialMarkers(rawHtml));

  finalHtml = addAnexosCss(finalHtml);
  finalHtml = addPrintA4Css(finalHtml);
  finalHtml = addAnexosToSummary(finalHtml);

  const anexosHtml =
    buildRelatoriosAnexosHtml(reports);

  if (
    anexosHtml &&
    !finalHtml.includes('anexos-equipe-section')
  ) {
    finalHtml = finalHtml.replace(
      '</body>',
      `${cleanupReportHtmlForPdf(anexosHtml)}</body>`
    );
  }

  finalHtml = cleanupReportHtmlForPdf(finalHtml);

  try {
    sessionStorage.setItem(
      'relatorio_fisico_financeiro_html',
      finalHtml
    );
    localStorage.setItem(
      'relatorio_fisico_financeiro_html',
      finalHtml
    );
    localStorage.setItem(
      'relatorio_fisico_financeiro_html_saved_at',
      new Date().toISOString()
    );
  } catch {}

  return finalHtml;
}

async function loadReportsForHtml(html) {
  try {
    const { from, to } =
      getReportPeriodFromHtml(html);

    const reportsRaw = await base44.entities.Report.list(
      '-updated_date',
      1000
    );

    return filterByPeriod(
      reportsRaw,
      from,
      to
    ).filter(isApprovedReport);
  } catch (error) {
    console.warn(
      'Falha ao carregar anexos individuais dos relatórios:',
      error
    );

    return [];
  }
}

export default function RelatorioPreview() {
  const navigate = useNavigate();
  const [html, setHtml] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgressOpen, setExportProgressOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportQueue, setExportQueue] = useState([]);
  const [currentExportFile, setCurrentExportFile] = useState(null);
  const [exportProgressMessage, setExportProgressMessage] = useState('');
  const [exportProgressError, setExportProgressError] = useState(null);
  const [volumeMeta, setVolumeMeta] = useState({
    volumeNumber: 1,
    totalVolumes: PDF_VOLUME_COUNT,
    pageNumberOffset: 0,
  });

  useEffect(() => {
    let cancelled = false;
    try {
      const storedVolume = JSON.parse(
        sessionStorage.getItem('relatorio_fisico_financeiro_export_volume')
        || localStorage.getItem('relatorio_fisico_financeiro_export_volume')
        || 'null'
      );
      if (storedVolume?.volumeNumber) {
        setVolumeMeta({
          volumeNumber: Number(storedVolume.volumeNumber) || 1,
          totalVolumes: Number(storedVolume.totalVolumes) || PDF_VOLUME_COUNT,
          pageNumberOffset: Number(storedVolume.pageNumberOffset) || 0,
        });
      }
    } catch {}

    async function load() {
      const stored = await getStoredHtml();

      let finalHtml = '';
      try {
        const reports =
          await loadReportsForHtml(stored);

        finalHtml = prepareFinalHtml(
          stored,
          reports
        );
      } catch (error) {
        console.warn('Falha ao preparar prévia completa. Usando HTML salvo para exportação:', error);
        finalHtml = prepareFinalHtml(stored, []);
      }

      if (!cancelled) {
        setHtml(finalHtml);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const iframeSrcDoc = useMemo(
    () =>
      html ||
      '<html><body><p>Prévia não encontrada.</p></body></html>',
    [html]
  );

async function getHtmlForExport() {
    if (String(html || '').trim()) return html;

    const stored = await getStoredHtml();
    if (!String(stored || '').trim()) return '';

    try {
      const reports = await loadReportsForHtml(stored);
      return prepareFinalHtml(stored, reports);
    } catch (error) {
      console.warn('Falha ao carregar dados complementares. Exportando HTML salvo:', error);
      return prepareFinalHtml(stored, []);
    }
  }

  function updateExportQueueItem(index, patch) {
    setExportQueue((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  async function handleExportPdf() {
    const exportHtml = await getHtmlForExport();
    if (!exportHtml) {
      toast.error('HTML do relatório não encontrado. Gere o relatório novamente.');
      return;
    }

    setIsExportingPdf(true);
    toast.info(`Gerando PDF do Volume ${volumeMeta.volumeNumber}...`);

    try {
      const blob = await exportHtmlToPdfBlob(exportHtml, {
        pageNumberOffset: volumeMeta.pageNumberOffset,
        volumeNumber: volumeMeta.volumeNumber,
        totalVolumes: volumeMeta.totalVolumes,
        includeSearchableAppendix: false,
      });
      await downloadPdfBlob(blob, filenameForPart(volumeMeta.volumeNumber));
      toast.success(`Volume ${volumeMeta.volumeNumber} exportado com sucesso.`);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast.error('Erro ao exportar PDF.');
    } finally {
      setIsExportingPdf(false);
    }

    return;
  }

  async function handleDownloadHtml() {
    const htmlForDownload = html || await getStoredHtml();
    if (!String(htmlForDownload || '').trim()) {
      toast.error('HTML do relatório não encontrado. Gere o relatório novamente.');
      return;
    }

    const blob = new Blob([htmlForDownload], {
      type: 'text/html;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `relatorio_fisico_financeiro_${new Date()
      .toISOString()
      .slice(0, 10)}.html`;

    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-black tracking-tight">
              Prévia do Relatório Físico-Financeiro
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              Visualização do documento final.
              Exportação direta do HTML para PDF.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => navigate('/Relatorios')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>

            <Button
              variant="outline"
              onClick={handleDownloadHtml}
              className="gap-2"
              disabled={!html}
            >
              <Download className="w-4 h-4" />
              Baixar HTML
            </Button>

            <Button
              onClick={() => {
                handleExportPdf();
              }}
              className="bg-black hover:bg-gray-800 text-white gap-2"
              disabled={isExportingPdf}
            >
              {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {isExportingPdf ? 'Exportando...' : `Exportar PDF Volume ${volumeMeta.volumeNumber}`}
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
                  <p className="text-base font-semibold text-black">
                    Nenhuma prévia carregada.
                  </p>

                  <p className="text-sm text-gray-500 mt-1">
                    Gere a prévia pelo botão
                    Relatório Físico-Financeiro
                    em Relatórios.
                  </p>
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
            <DialogTitle>Exportando relatÃ³rio em partes</DialogTitle>
            <DialogDescription>
              Cada arquivo serÃ¡ gerado e enviado para download antes do prÃ³ximo comeÃ§ar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Progresso geral</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{exportProgress}%</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {currentExportFile ? `Exportando agora: ${currentExportFile}` : exportProgress >= 100 ? 'ExportaÃ§Ã£o concluÃ­da' : 'Preparando fila'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{exportProgressMessage}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-950 transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>

            {exportProgressError ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{exportProgressError}</p>
              </div>
            ) : null}

            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {exportQueue.map((item) => {
                const isCurrent = item.filename === currentExportFile;
                const isDone = item.status === 'done';
                const isError = item.status === 'error';
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 ${isCurrent ? 'border-black bg-black/5' : isError ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-900">{item.filename}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          CapÃ­tulos: {summarizeChapterTitles((item.chapters || []).map((title) => ({ title }))) || 'Sem capÃ­tulos informados'}
                        </p>
                        {item.error ? <p className="mt-1 text-xs text-red-700">{item.error}</p> : null}
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isError ? 'bg-red-100 text-red-700' : isDone ? 'bg-green-100 text-green-700' : isCurrent ? 'bg-black text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {isDone ? <CheckCircle2 className="h-3 w-3" /> : isCurrent ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {EXPORT_STATUS_LABELS[item.status] || item.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setExportProgressOpen(false)}
              disabled={isExportingPdf}
            >
              {isExportingPdf ? 'Exportando...' : 'Fechar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
