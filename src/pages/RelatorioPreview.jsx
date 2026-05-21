import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileDown, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { REPORT_CHAPTERS, REPORT_CHAPTER_IDS } from '@/config/reportChapters';
import {
  REPORT_PREVIEW_VARIANTS,
  SINGLE_REPORT_FILENAME,
  exportSingleReportPdf,
  getReportPreview,
  getSingleReportPreview,
  repairReportEncoding,
} from '@/services/reportExportPipeline';

const MAX_EXPORT_PART_SIZE_BYTES = Number.MAX_SAFE_INTEGER;

const PDF_VOLUME_COUNT = 1;
const PDF_PAGE_WIDTH_PX = 794;
const PDF_PAGE_HEIGHT_PX = 1123;
const PDF_PAGE_SAFE_CONTENT_HEIGHT_PX = 940;
const filenameForReport = (variant = 'single') => REPORT_PREVIEW_VARIANTS[variant]?.filename || SINGLE_REPORT_FILENAME;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
      const timeout = setTimeout(resolve, 12000);
      const finish = () => {
        clearTimeout(timeout);
        resolve();
      };
      image.onerror = finish;
      image.onload = finish;
    });
  }));

  await delay(150);
}

function createHiddenReportIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');

  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(String(html || ''));
  iframe.contentDocument.close();

  return iframe;
}

function hasUsefulPdfDomContent(element) {
  if (!element) return false;
  const clone = element.cloneNode(true);
  clone.querySelectorAll?.('.report-pdf-institutional-header, script, style, noscript').forEach((node) => node.remove());
  const text = String(clone.innerText || clone.textContent || '').replace(/\s+/g, '').trim();
  const hasVisual = clone.querySelector?.('img, table, canvas, svg, figure, article, .premium-metric, .premium-infographic-card, .premium-activity-card');
  return text.length > 0 || Boolean(hasVisual);
}

function getOuterHeightForPdf(element) {
  if (!element?.getBoundingClientRect) return 0;
  const rect = element.getBoundingClientRect();
  const view = element.ownerDocument?.defaultView;
  const styles = view?.getComputedStyle ? view.getComputedStyle(element) : null;
  const marginTop = Number.parseFloat(styles?.marginTop || '0') || 0;
  const marginBottom = Number.parseFloat(styles?.marginBottom || '0') || 0;
  return Math.ceil(rect.height + marginTop + marginBottom);
}

function cloneSectionForPdf(section) {
  const clone = section.cloneNode(false);
  clone.setAttribute('data-pdf-fragment', 'true');
  clone.style.breakBefore = 'auto';
  clone.style.pageBreakBefore = 'auto';
  clone.style.breakAfter = 'auto';
  clone.style.pageBreakAfter = 'auto';
  clone.style.minHeight = 'auto';
  clone.style.height = 'auto';
  clone.style.overflow = 'visible';
  return clone;
}

function splitOversizedPremiumSectionsForPdf(doc) {
  if (!doc) return;

  const selector = [
    '.premium-expediente',
    '.premium-section',
    '.premium-museum-block',
    '.premium-communication',
  ].join(', ');

  Array.from(doc.querySelectorAll(selector)).forEach((section) => {
    if (section.closest('[data-pdf-fragment="true"]')) return;
    if (section.classList?.contains('premium-cover') || section.classList?.contains('premium-closing')) return;

    const children = Array.from(section.children || []).filter(hasUsefulPdfDomContent);
    if (children.length <= 1) return;

    const rect = section.getBoundingClientRect();
    const scrollHeight = Math.max(section.scrollHeight || 0, rect.height || 0);
    if (scrollHeight <= PDF_PAGE_HEIGHT_PX * 0.98) return;

    const fragments = [];
    let current = cloneSectionForPdf(section);
    let currentHeight = 0;

    const pushCurrent = () => {
      if (current.children.length > 0) {
        fragments.push(current);
      }
      current = cloneSectionForPdf(section);
      currentHeight = 0;
    };

    children.forEach((child) => {
      const childHeight = Math.max(24, getOuterHeightForPdf(child));
      const shouldBreak = current.children.length > 0
        && currentHeight + childHeight > PDF_PAGE_SAFE_CONTENT_HEIGHT_PX;

      if (shouldBreak) pushCurrent();

      current.appendChild(child.cloneNode(true));
      currentHeight += childHeight;

      if (childHeight > PDF_PAGE_SAFE_CONTENT_HEIGHT_PX && current.children.length > 0) {
        pushCurrent();
      }
    });

    pushCurrent();

    if (fragments.length <= 1) return;

    const parent = section.parentNode;
    fragments.forEach((fragment) => parent.insertBefore(fragment, section));
    section.remove();
  });
}

function normalizeReportDomForPdf(doc) {
  if (!doc) return;

  doc.querySelectorAll('script, noscript, .report-pdf-institutional-header, .report-header, .report-footer, .legacy-gallery-intro').forEach((node) => node.remove());

  let style = doc.getElementById('pdf-export-a4-normalizer');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'pdf-export-a4-normalizer';
    doc.head.appendChild(style);
  }

  style.textContent = `
    @page { size: A4; margin: 0; }
    html, body {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      min-width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow-x: hidden !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      zoom: 1 !important;
    }
    main.premium-report,
    .premium-report {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      min-width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      margin: 0 auto !important;
      overflow: visible !important;
      background: #f7f3eb !important;
      transform: none !important;
    }
    .premium-cover {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      height: ${PDF_PAGE_HEIGHT_PX}px !important;
      min-height: ${PDF_PAGE_HEIGHT_PX}px !important;
      max-height: ${PDF_PAGE_HEIGHT_PX}px !important;
      padding: 0 !important;
      overflow: hidden !important;
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .premium-cover img {
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      object-fit: cover !important;
      transform: none !important;
    }
    .premium-section,
    .premium-expediente,
    .premium-museum-block,
    .premium-communication,
    .premium-closing {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      min-height: auto !important;
      height: auto !important;
      padding: 68px 57px 68px !important;
      margin: 0 !important;
      overflow: visible !important;
      transform: none !important;
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .premium-closing {
      min-height: ${PDF_PAGE_HEIGHT_PX}px !important;
      background: #171717 !important;
      color: #f7f3eb !important;
    }
    .premium-report img,
    .premium-section img,
    .premium-museum-block img,
    .premium-communication img {
      max-width: 100% !important;
      max-height: 454px !important;
      height: auto !important;
      object-fit: contain !important;
      transform: none !important;
    }
    .premium-activity-photos,
    .premium-activity-photo-strip,
    .activity-image-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }
    .premium-activity-photos img,
    .premium-activity-photo-strip img,
    .activity-image-grid img {
      width: 100% !important;
      height: 265px !important;
      object-fit: cover !important;
    }
    .premium-table-wrap,
    .premium-table,
    .budget-table,
    .documents-table,
    .premium-rubrica-table,
    table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      overflow: visible !important;
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    thead { display: table-header-group !important; }
    tfoot { display: table-footer-group !important; }
    tr {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    th, td {
      overflow-wrap: break-word !important;
      word-break: normal !important;
    }
    .premium-metric,
    .premium-method-card,
    .premium-infographic-card,
    .premium-meta-card,
    .premium-callout,
    .premium-finance-summary-card,
    .premium-report-note,
    .premium-expediente-block,
    .premium-expediente-people article,
    .catalog-toc li {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .premium-page-break {
      break-before: auto !important;
      page-break-before: auto !important;
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .report-shell {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      margin: 0 auto !important;
      overflow: visible !important;
      background: #ffffff !important;
    }
    .report-content {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      padding: 34px 42px 42px !important;
      margin: 0 !important;
      overflow: visible !important;
    }
    .gallery-cover,
    .gallery-activity,
    .intro {
      width: ${PDF_PAGE_WIDTH_PX}px !important;
      max-width: ${PDF_PAGE_WIDTH_PX}px !important;
      margin: 0 !important;
      overflow: visible !important;
      transform: none !important;
    }
    .gallery-activity {
      padding: 28px 0 34px !important;
    }
    .gallery-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
    }
    .gallery-grid img {
      width: 100% !important;
      height: 240px !important;
      max-height: 240px !important;
      object-fit: cover !important;
    }

    .premium-report,
    .premium-report * {
      word-break: normal !important;
      overflow-wrap: break-word !important;
      hyphens: auto !important;
    }

    .premium-internal-page-header {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 18px !important;
      width: 100% !important;
      min-width: 0 !important;
      padding: 0 0 18px !important;
      margin-bottom: 22px !important;
      border-bottom: 1px solid rgba(0,0,0,.08) !important;
    }

    .premium-internal-page-header-logo {
      display: block !important;
      width: 128px !important;
      min-width: 128px !important;
      height: 68px !important;
      flex: 0 0 128px !important;
      background-image: url('/viaduto-logo.png') !important;
      background-repeat: no-repeat !important;
      background-position: left center !important;
      background-size: contain !important;
    }

    .premium-internal-page-header-logo img {
      max-width: 128px !important;
      max-height: 68px !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
    }

    .premium-internal-page-header-text {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      text-align: right !important;
      white-space: normal !important;
    }

    .premium-activity-grid,
    .premium-month-grid,
    .premium-report-archive,
    .premium-museum-block,
    .premium-section {
      min-width: 0 !important;
      max-width: 100% !important;
    }

    .premium-activity-card {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      overflow: visible !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    .premium-activity-card > *,
    .premium-activity-card article,
    .premium-activity-card div,
    .activity-card-meta,
    .activity-card-title,
    .activity-card-body,
    .premium-activity-card h3,
    .premium-activity-card h4,
    .premium-activity-card p,
    .premium-month-card h3,
    .premium-month-card p,
    .premium-card-header,
    .premium-card-header *,
    .premium-card-facts,
    .premium-card-facts *,
    .premium-card-footer,
    .premium-card-footer * {
      min-width: 0 !important;
      max-width: 100% !important;
      white-space: normal !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      transform: none !important;
      letter-spacing: normal !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
    }

    .premium-month-card,
    .premium-month-card * {
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      transform: none !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      max-width: 100% !important;
    }

    .premium-month-card {
      overflow: hidden !important;
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .premium-activity-index {
      display: inline-block !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      margin: 0 8px 8px 0 !important;
      white-space: normal !important;
      overflow-wrap: normal !important;
      word-break: normal !important;
      text-align: left !important;
    }

    .premium-card-header {
      display: block !important;
    }

    .premium-card-facts,
    .premium-card-footer {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }
  `;

  doc.querySelectorAll('[style]').forEach((node) => {
    const styleValue = String(node.getAttribute('style') || '')
      .replace(/transform\s*:[^;]+;?/gi, '')
      .replace(/zoom\s*:[^;]+;?/gi, '')
      .replace(/max-width\s*:\s*none\s*;?/gi, '')
      .replace(/break-after\s*:\s*page\s*;?/gi, '')
      .replace(/page-break-after\s*:\s*always\s*;?/gi, '');
    node.setAttribute('style', styleValue);
  });

  doc.querySelectorAll('section, article, div').forEach((node) => {
    const className = String(node.getAttribute('class') || '');
    if (!/premium|report|section|page|activity|metric|infographic/i.test(className)) return;
    if (!hasUsefulPdfDomContent(node)) node.remove();
  });

  splitOversizedPremiumSectionsForPdf(doc);
}

function hasRenderablePdfContent(element) {
  if (!element) return false;
  if (element.closest?.('.report-pdf-institutional-header')) return false;
  if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const text = String(element.innerText || element.textContent || '').trim();
  const visualCount = element.querySelectorAll?.('img, table, canvas, svg, figure, article').length || 0;

  return text.length > 24 || visualCount > 0;
}

function uniquePdfElements(elements = []) {
  const seen = new Set();
  return elements.filter((element) => {
    if (!element || seen.has(element)) return false;
    seen.add(element);
    return true;
  });
}

function removeNestedPdfTargets(elements = []) {
  return elements.filter((element) =>
    !elements.some((candidate) => candidate !== element && candidate.contains(element))
  );
}

function getPdfRenderTargets(root, reportVariant = 'single') {
  if (reportVariant === 'galeria') {
    const galleryTargets = Array.from(
      root?.querySelectorAll?.('.gallery-cover, .gallery-intro, .gallery-section, .gallery-page, .gallery-activity') || []
    ).filter(hasRenderablePdfContent);
    if (galleryTargets.length > 0) {
      return removeNestedPdfTargets(uniquePdfElements(galleryTargets));
    }
  }

  const MAX_SECTION_HEIGHT = PDF_PAGE_HEIGHT_PX * 1.25;
  const result = [];
  const majorSelector = [
    '.premium-cover',
    '.premium-expediente',
    '.premium-section',
    '.premium-museum-block',
    '.premium-communication',
    '.premium-closing',
    '.premium-activity-card',
    '.premium-month-card',
    '.gallery-cover',
    '.report-content',
    '.gallery-activity',
    '.intro',
  ].join(', ');

  function collect(element) {
    if (!element) return;
    if (element.classList?.contains('report-pdf-institutional-header')) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const children = Array.from(element.children || []).filter((child) => {
      const childRect = child.getBoundingClientRect();
      return childRect.width > 0 && childRect.height > 0 && hasRenderablePdfContent(child);
    });

    if (element.scrollHeight > MAX_SECTION_HEIGHT && children.length > 0) {
      children.forEach(collect);
      return;
    }

    if (hasRenderablePdfContent(element)) {
      result.push(element);
    }
  }

  const directMajorSections = Array.from(root?.children || [])
    .filter((element) => element.matches?.(majorSelector))
    .filter(hasRenderablePdfContent);
  directMajorSections.forEach(collect);

  let targets = removeNestedPdfTargets(uniquePdfElements(result));

  if (targets.length < 4) {
    const semanticSections = Array.from(root?.querySelectorAll?.(majorSelector) || [])
      .filter(hasRenderablePdfContent);
    targets = removeNestedPdfTargets(uniquePdfElements([...targets, ...semanticSections]));
  }

  return targets.length > 0 ? targets : [root].filter(hasRenderablePdfContent);
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
    const shouldDrawHeader = !(Number(options.volumeNumber) === 1 && pageIndex === 1);
    if (shouldDrawHeader) {
      pdf.text(
        'Viaduto das Artes - Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG - viadutodasartes@gmail.com',
        pageWidth / 2,
        5,
        { align: 'center' }
      );
    }

    const label = volumeNumber && totalVolumes
      ? `Volume ${volumeNumber}/${totalVolumes} · página ${pageNumber}`
      : `página ${pageNumber}`;
    const footerLabel = options.reportTitle
      ? `${options.reportTitle} | Pagina ${pageNumber}`
      : volumeNumber
        ? `Museus Centro - Relatorio Institucional - Volume ${Number(options.volumeNumber)} | Pagina ${pageNumber}`
        : label;
    pdf.text(repairReportEncoding(footerLabel), pageWidth / 2, pageHeight - 6, { align: 'center' });
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

  const iframe = createHiddenReportIframe(repairReportEncoding(html));

  try {
    normalizeReportDomForPdf(iframe.contentDocument);
    await waitForIframeAssets(iframe);
    normalizeReportDomForPdf(iframe.contentDocument);

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
    const reportVariant = options?.meta?.reportVariant || 'single';
    const renderTargets = getPdfRenderTargets(target, reportVariant);
    if (!renderTargets.length) {
      throw new Error('Nenhuma secao renderizavel encontrada para o PDF.');
    }

    const oversized = reportVariant === 'galeria'
      ? []
      : renderTargets
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.width > 860 || rect.height > 16000);

    if (oversized.length > 0) {
      console.warn('Elementos fora da escala A4 detectados:', oversized.map(({ element, rect }) => ({
        tag: element.tagName,
        className: element.className,
        width: rect.width,
        height: rect.height,
      })));
      throw new Error('Foram encontrados elementos fora da escala A4. A exportacao foi interrompida para evitar PDF invalido.');
    }

    let hasPageContent = false;

    for (const element of renderTargets) {
      let canvas = null;
      try {
        canvas = await html2canvas(element, {
          scale: 1.35,
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

        if (isCanvasSliceMostlyBlank(pageCanvas)) {
          continue;
        }

        if (hasPageContent) pdf.addPage();

        try {
          const imageData = pageCanvas.toDataURL('image/jpeg', 0.75);
          const imageHeight = (sliceHeight * pageWidth) / canvas.width;
          pdf.addImage(imageData, 'JPEG', 0, 0, pageWidth, imageHeight, undefined, 'MEDIUM');
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

async function getStoredHtml(variant = 'single') {
  try {
    const key = variant === 'dados'
      ? 'relatorio_fisico_financeiro_dados_html'
      : variant === 'galeria'
        ? 'relatorio_fisico_financeiro_galeria_html'
        : variant === 'atividades'
          ? 'relatorio_fisico_financeiro_atividades_html'
        : 'relatorio_fisico_financeiro_html';
    const quickHtml = sessionStorage.getItem(key)
      || localStorage.getItem(key)
      || '';
    if (quickHtml) return quickHtml;
  } catch {
    // IndexedDB below remains the most robust fallback for large reports.
  }

  return getPreviewHtmlFromIndexedDb();
}

async function getAnyStoredReportHtml(preferredVariant = 'single') {
  const variantOrder = preferredVariant === 'dados'
    ? ['dados', 'single', 'galeria']
    : preferredVariant === 'galeria'
      ? ['galeria', 'single', 'dados']
      : preferredVariant === 'atividades'
        ? ['atividades']
      : ['single', 'dados', 'galeria'];

  for (const variant of variantOrder) {
    try {
      const preview = variant === 'single'
        ? await getSingleReportPreview()
        : await getReportPreview(variant);
      const fromPreview = String(preview?.html || '').trim();
      if (fromPreview) return repairReportEncoding(fromPreview);
    } catch {
      // tenta próxima fonte
    }

    try {
      const key = variant === 'dados'
        ? 'relatorio_fisico_financeiro_dados_html'
        : variant === 'galeria'
          ? 'relatorio_fisico_financeiro_galeria_html'
          : variant === 'atividades'
            ? 'relatorio_fisico_financeiro_atividades_html'
          : 'relatorio_fisico_financeiro_html';
      const fromStorage = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
      if (fromStorage) return repairReportEncoding(fromStorage);
    } catch {
      // tenta próxima fonte
    }
  }

  const generic = await getStoredHtml(preferredVariant);
  return repairReportEncoding(String(generic || ''));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function RelatorioPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoExportPdf = searchParams.get('export') === 'pdf';
  const reportVariant = searchParams.get('report') === 'galeria' || searchParams.get('kind') === 'galeria'
    ? 'galeria'
    : searchParams.get('report') === 'dados' || searchParams.get('kind') === 'dados'
      ? 'dados'
      : searchParams.get('report') === 'atividades' || searchParams.get('kind') === 'atividades'
        ? 'atividades'
        : 'single';
  const [html, setHtml] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgressOpen, setExportProgressOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportQueue, setExportQueue] = useState([]);
  const [currentExportFile, setCurrentExportFile] = useState(null);
  const [exportProgressMessage, setExportProgressMessage] = useState('');
  const [exportProgressError, setExportProgressError] = useState(null);
  const [autoExportStarted, setAutoExportStarted] = useState(false);
  const [reportMeta, setReportMeta] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      console.log(`[Preview] Carregando variante: ${reportVariant}`);
      const preview = reportVariant === 'single'
        ? await getSingleReportPreview()
        : await getReportPreview(reportVariant);
      let finalHtml = preview?.html || '';
      // Fallback direto ao localStorage pelas chaves canonicas
      if (!finalHtml && reportVariant === 'dados') {
        finalHtml = localStorage.getItem('relatorio_fisico_financeiro_dados_html') || '';
        if (finalHtml) console.log('[Preview] Fallback: dados do localStorage');
      } else if (!finalHtml && reportVariant === 'galeria') {
        finalHtml = localStorage.getItem('relatorio_fisico_financeiro_galeria_html') || '';
        if (finalHtml) console.log('[Preview] Fallback: galeria do localStorage');
      } else if (!finalHtml && reportVariant === 'atividades') {
        finalHtml = localStorage.getItem('relatorio_fisico_financeiro_atividades_html') || '';
        if (finalHtml) console.log('[Preview] Fallback: atividades do localStorage');
      } else if (!finalHtml) {
        finalHtml = await getStoredHtml(reportVariant);
      }
      if (!finalHtml && reportVariant !== 'atividades') {
        finalHtml = await getAnyStoredReportHtml(reportVariant);
      }
      if (!finalHtml) console.error(`[Preview] HTML nao encontrado para variante "${reportVariant}". Verifique se a geracao foi concluida.`);
      if (!cancelled) { setReportMeta(preview?.meta || {}); setHtml(repairReportEncoding(finalHtml)); }
    }
    load();
    return () => { cancelled = true; };
  }, [reportVariant]);

  const iframeSrcDoc = useMemo(
    () =>
      repairReportEncoding(html) ||
      '<html><body><p>Prévia não encontrada.</p></body></html>',
    [html]
  );
  const previewTitle = reportVariant === 'galeria'
    ? 'Prévia do Relatório Galeria'
    : reportVariant === 'dados'
      ? 'Prévia do Relatório Principal'
      : reportVariant === 'atividades'
        ? 'Prévia do Relatório de Atividades'
        : 'Prévia do Relatório Físico-Financeiro';

  useEffect(() => {
    if (!autoExportPdf || !html || isExportingPdf || autoExportStarted) return;
    setAutoExportStarted(true);
    const timer = setTimeout(() => {
      handleExportPdf();
    }, 600);
    return () => clearTimeout(timer);
  }, [autoExportPdf, html, isExportingPdf, autoExportStarted]);

async function getHtmlForExport() {
    if (String(html || '').trim()) return repairReportEncoding(html);

    const preview = reportVariant === 'single'
      ? await getSingleReportPreview()
      : await getReportPreview(reportVariant);
    const directHtml = repairReportEncoding(preview.html || (await getStoredHtml(reportVariant)) || '');
    if (String(directHtml || '').trim()) return directHtml;
    return getAnyStoredReportHtml(reportVariant);
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
      toast.error(
        reportVariant === 'atividades'
          ? 'Nenhum Relatório de Atividades atualizado foi encontrado. Volte ao gerador e clique em Gerar relatórios.'
          : 'HTML do relatório não encontrado. Gere o relatório novamente.'
      );
      return;
    }

    const filename = filenameForReport(reportVariant);
    setIsExportingPdf(true);
    setExportProgressOpen(true);
    setExportProgress(8);
    setCurrentExportFile(filename);
    setExportProgressError(null);
    setExportProgressMessage('Preparando HTML e layout A4 para exportacao.');
    toast.info('Gerando PDF...');

    try {
      setExportProgress(22);
      setExportProgressMessage('Otimizando o documento para impressao em PDF.');
      await delay(120);

      setExportProgress(48);
      setExportProgressMessage('Renderizando paginas. Esta etapa pode demorar em relatorios com muitas imagens ou tabelas.');
      const blob = await exportSingleReportPdf({
        html: exportHtml,
        meta: {
          ...reportMeta,
          reportVariant,
        },
        exporter: exportHtmlToPdfBlob,
      });

      setExportProgress(86);
      setExportProgressMessage('Preparando download do arquivo PDF.');
      await downloadPdfBlob(blob, filename);

      setExportProgress(100);
      setExportProgressMessage('Download iniciado. Verifique a pasta de downloads do navegador.');
      toast.success('PDF exportado com sucesso.');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      setExportProgressError(error?.message || 'Erro ao exportar PDF.');
      setExportProgressMessage('A exportacao foi interrompida antes do download.');
      toast.error('Erro ao exportar PDF.');
    } finally {
      setIsExportingPdf(false);
      setCurrentExportFile(null);
    }

    return;
  }

  async function handleDownloadHtml() {
    const storedPreview = reportVariant === 'single'
      ? await getSingleReportPreview()
      : await getReportPreview(reportVariant);
    let htmlForDownload = html || storedPreview.html || (await getStoredHtml(reportVariant)) || '';
    if (!String(htmlForDownload || '').trim()) {
      htmlForDownload = await getAnyStoredReportHtml(reportVariant);
    }
    if (!String(htmlForDownload || '').trim()) {
      toast.error(
        reportVariant === 'atividades'
          ? 'Nenhum Relatório de Atividades atualizado foi encontrado. Volte ao gerador e clique em Gerar relatórios.'
          : 'HTML do relatório não encontrado. Gere o relatório novamente.'
      );
      return;
    }

    const blob = new Blob([htmlForDownload], {
      type: 'text/html;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `relatorio_fisico_financeiro_${reportVariant}_${new Date()
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
              {previewTitle}
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
                  <p className="text-base font-semibold text-black">
                    {reportVariant === 'atividades'
                      ? 'Nenhum Relatório de Atividades atualizado foi encontrado.'
                      : 'Nenhuma prévia carregada.'}
                  </p>

                  <p className="text-sm text-gray-500 mt-1">
                    {reportVariant === 'atividades'
                      ? 'Volte ao gerador e clique em Gerar relatórios.'
                      : 'Gere a prévia pelo botão Relatório Físico-Financeiro em Relatórios.'}
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
            <DialogTitle>Exportando PDF</DialogTitle>
            <DialogDescription>
              O arquivo esta sendo preparado e sera enviado para a pasta de downloads do navegador.
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
                    {currentExportFile ? `Arquivo: ${currentExportFile}` : exportProgress >= 100 ? 'Exportacao concluida' : 'Preparando exportacao'}
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
