import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileDown, Loader2, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { REPORT_CHAPTERS, REPORT_CHAPTER_IDS } from '@/config/reportChapters';

const MAX_EXPORT_PART_SIZE_BYTES = 200 * 1024 * 1024;
const EXPORT_FILENAME_BASE = 'Relatorio_Museus_Centro';

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
  return `${EXPORT_FILENAME_BASE}_parte_${String(partNumber).padStart(2, '0')}.pdf`;
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
      warnings.push(`O capítulo ${chapter.title} excedeu 200 MB e foi dividido em subpartes para preservar a integridade do PDF.`);
      return;
    }

    pushCurrent();
    parts.push({
      chapters: [chapter],
      sizeBytes: chapter.sizeBytes,
      oversizedSingleChapter: true,
    });

    warnings.push(`O capítulo ${chapter.title} excede 200 MB e foi exportado em arquivo próprio para preservar a integridade do PDF.`);
  });

  pushCurrent();

  return { parts, warnings };
}

function buildPartSummary(parts) {
  if (!Array.isArray(parts) || parts.length <= 1) return '';
  return `
    <section style="max-width:210mm;margin:0 auto 16px;padding:0 20px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:14px 16px;background:#fff;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;">Relatório dividido em arquivos</p>
        <ul style="margin:0;padding-left:18px;font-size:11.5px;line-height:1.5;">
          ${parts.map((part, index) => `<li>Parte ${String(index + 1).padStart(2, '0')} — ${part.chapters.map((chapter) => escapeHtml(chapter.title)).join(', ')}</li>`).join('')}
        </ul>
      </div>
    </section>
  `;
}

function buildPartHtml(documentParts, part, partIndex, totalParts, summaryHtml = '') {
  const partHeader = `
    <section style="max-width:210mm;margin:0 auto 14px;padding:0 20px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:12px 14px;background:#fff;">
        <p style="margin:0;font-size:13px;font-weight:700;">Relatório Museus Centro — Parte ${String(partIndex).padStart(2, '0')} de ${String(totalParts).padStart(2, '0')}</p>
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
    ${partIndex === 1 ? summaryHtml : ''}
    ${partHeader}
    ${part.chapters.map((chapter) => chapter.html).join('\n')}
  </main>
</body>
</html>`;
}

function openPrintWindow(html, filename) {
  const printWindow = window.open('', '_blank', 'width=1280,height=900');
  if (!printWindow) return false;

  const finalHtml = String(html || '').replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(filename)}</title>`);
  printWindow.document.open();
  printWindow.document.write(finalHtml);
  printWindow.document.close();

  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {}
  }, 300);

  return true;
}

function getStoredHtml() {
  try {
    return sessionStorage.getItem('relatorio_fisico_financeiro_html') || '';
  } catch {
    return '';
  }
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

function prepareFinalHtml(rawHtml, reports = []) {
  let finalHtml = stripEditorialMarkers(rawHtml);

  finalHtml = addAnexosCss(finalHtml);
  finalHtml = addAnexosToSummary(finalHtml);

  const anexosHtml =
    buildRelatoriosAnexosHtml(reports);

  if (
    anexosHtml &&
    !finalHtml.includes('anexos-equipe-section')
  ) {
    finalHtml = finalHtml.replace(
      '</body>',
      `${anexosHtml}</body>`
    );
  }

  try {
    sessionStorage.setItem(
      'relatorio_fisico_financeiro_html',
      finalHtml
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
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState('single');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgressOpen, setExportProgressOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportQueue, setExportQueue] = useState([]);
  const [currentExportFile, setCurrentExportFile] = useState(null);
  const [exportProgressMessage, setExportProgressMessage] = useState('');
  const [exportProgressError, setExportProgressError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const stored = getStoredHtml();

      const reports =
        await loadReportsForHtml(stored);

      const finalHtml = prepareFinalHtml(
        stored,
        reports
      );

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

  function handlePrint() {
    const iframe = document.getElementById(
      'relatorio-preview-frame'
    );

    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    }

    window.print();
  }

  function updateExportQueueItem(index, patch) {
    setExportQueue((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  async function handleExportPdf() {
    if (!html) return;

    setIsExportingPdf(true);
    toast.info('Preparando relatório para exportação...');

    try {
      if (exportMode === 'single') {
        toast.info('Gerando PDF em arquivo único...');
        handlePrint();
        toast.success('Relatório exportado com sucesso.');
        setExportDialogOpen(false);
        return;
      }

      toast.info('Gerando PDF dividido em partes...');
      const selectedChapterIds = loadSelectedChapterIds();
      const documentParts = extractDocumentParts(html, selectedChapterIds);

      if (!documentParts || !Array.isArray(documentParts.chapters) || documentParts.chapters.length === 0) {
        toast.error('Não foi possível dividir o relatório por capítulos. Tente novamente.');
        return;
      }

      const { parts, warnings } = buildSplitParts(documentParts.chapters);
      if (!Array.isArray(parts) || parts.length === 0) {
        toast.error('Não foi possível montar partes válidas para exportação.');
        return;
      }

      const queue = parts.map((part, index) => ({
        id: `parte-${String(index + 1).padStart(2, '0')}`,
        filename: filenameForPart(index + 1),
        status: 'waiting',
        chapters: part.chapters.map((chapter) => chapter.title),
        blobSize: null,
        error: null,
      }));

      setExportQueue(queue);
      setExportProgress(0);
      setCurrentExportFile(null);
      setExportProgressError(null);
      setExportProgressMessage('Os arquivos estÃ£o sendo gerados em sequÃªncia. Cada arquivo serÃ¡ enviado para download antes do prÃ³ximo comeÃ§ar.');
      setExportDialogOpen(false);
      setExportProgressOpen(true);

      const summaryHtml = buildPartSummary(parts);
      const totalParts = parts.length;

      for (let i = 0; i < parts.length; i += 1) {
        const partNumber = i + 1;
        const queuedFilename = queue[i].filename;
        setCurrentExportFile(queuedFilename);
        updateExportQueueItem(i, { status: 'exporting', error: null });
        toast.info(`Exportando ${queuedFilename}...`);
        const partHtml = buildPartHtml(documentParts, parts[i], partNumber, totalParts, summaryHtml);
        const filename = queuedFilename;
        const blobSize = new Blob([partHtml], { type: 'text/html;charset=utf-8' }).size;

        updateExportQueueItem(i, { status: 'preparing_download', blobSize });

        const ok = openPrintWindow(partHtml, filename);
        if (!ok) {
          toast.error(`Não foi possível abrir a parte ${String(partNumber).padStart(2, '0')} para impressão.`);
          const errorMessage = `Erro ao exportar ${filename}. A exportaÃ§Ã£o foi interrompida para evitar arquivos incompletos.`;
          updateExportQueueItem(i, { status: 'error', blobSize, error: errorMessage });
          setCurrentExportFile(null);
          setExportProgressError('O navegador pode ter bloqueado downloads mÃºltiplos. Permita downloads automÃ¡ticos para este site e tente novamente.');
          throw new Error(errorMessage);
        }

        updateExportQueueItem(i, { status: 'download_started', blobSize });
        await delay(300);
        updateExportQueueItem(i, { status: 'done', blobSize });
        setExportProgress(Math.round((partNumber / totalParts) * 100));
        toast.success(`Parte ${String(partNumber).padStart(2, '0')} preparada.`);
      }

      setCurrentExportFile(null);
      setExportProgress(100);
      setExportProgressMessage('ExportaÃ§Ã£o concluÃ­da. Todos os arquivos foram enviados para download.');

      if (warnings.length > 0) {
        warnings.forEach((warningMessage) => toast.warning(warningMessage));
        toast.warning('Exportação concluída com avisos.');
      } else {
        toast.success('Relatório exportado com sucesso.');
      }

      setExportDialogOpen(false);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast.error('Erro ao exportar PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  }

  function handleDownloadHtml() {
    const blob = new Blob([html || ''], {
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
              Use imprimir para salvar como PDF.
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
              onClick={() => setExportDialogOpen(true)}
              className="bg-black hover:bg-gray-800 text-white gap-2"
              disabled={!html || isExportingPdf}
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

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar relatório em PDF</DialogTitle>
            <DialogDescription>
              Escolha se deseja gerar o relatório em um único arquivo ou em partes de até 200 MB.
              No modo dividido, os capítulos serão mantidos inteiros sempre que possível.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setExportMode('single')}
              disabled={isExportingPdf}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${exportMode === 'single' ? 'border-black bg-black/5' : 'border-slate-200 bg-white'}`}
            >
              <p className="text-sm font-semibold text-slate-900">Arquivo único</p>
              <p className="text-xs text-slate-500 mt-1">Mantém o comportamento atual em um único PDF.</p>
            </button>

            <button
              type="button"
              onClick={() => setExportMode('split')}
              disabled={isExportingPdf}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${exportMode === 'split' ? 'border-black bg-black/5' : 'border-slate-200 bg-white'}`}
            >
              <p className="text-sm font-semibold text-slate-900">Vários arquivos de até 200 MB</p>
              <p className="text-xs text-slate-500 mt-1">Agrupa capítulos inteiros em partes, respeitando o limite sempre que possível.</p>
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} disabled={isExportingPdf}>
              Cancelar
            </Button>
            <Button onClick={handleExportPdf} disabled={!html || isExportingPdf} className="gap-2">
              {isExportingPdf ? <Printer className="w-4 h-4 animate-pulse" /> : <FileDown className="w-4 h-4" />}
              {isExportingPdf ? 'Exportando...' : 'Exportar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
