import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

// ─── helpers ──────────────────────────────────────────────────────────────────

const M = 14;       // left margin
const CW = 182;     // content width
const PH = 287;     // page height
const FOOTER_H = 8; // footer reserved height

function checkBreak(doc, y, needed = 12) {
  if (y + needed > PH - FOOTER_H) {
    doc.addPage();
    return 18;
  }
  return y;
}

function wrap(doc, text, x, y, maxW, lh = 4.2) {
  const lines = doc.splitTextToSize(String(text || '—'), maxW);
  lines.forEach(line => {
    y = checkBreak(doc, y, lh + 1);
    doc.text(line, x, y);
    y += lh;
  });
  return y;
}

// Thin section header — dark bar left accent
function secHeader(doc, title, y, accent = [30, 30, 30]) {
  y = checkBreak(doc, y, 10);
  doc.setFillColor(...accent);
  doc.rect(M, y - 4, 3, 7, 'F');
  doc.setFillColor(245, 245, 245);
  doc.rect(M + 3, y - 4, CW - 3, 7, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(title, M + 6, y + 0.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

// Key-value pair inline
function kv(doc, label, value, x, y, maxW = 82) {
  y = checkBreak(doc, y, 8);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text(label.toUpperCase(), x, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  y += 3.5;
  const lines = doc.splitTextToSize(String(value || '—'), maxW);
  lines.forEach(line => {
    y = checkBreak(doc, y, 4.5);
    doc.text(line, x, y);
    y += 4;
  });
  return y + 1.5;
}

function rowKV(doc, pairs, y) {
  // pairs = [[label, value], [label, value]] → two columns
  const colW = CW / 2 - 4;
  let yMax = y;
  pairs.forEach(([label, value], i) => {
    const x = M + i * (CW / 2 + 2);
    const yEnd = kv(doc, label, value, x, y, colW);
    if (yEnd > yMax) yMax = yEnd;
  });
  return yMax;
}

function addPageHeader(doc, report, section, statusLabel, statusColor) {
  doc.setFontSize(6.5);
  doc.setTextColor(140, 140, 140);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.mes_referencia || ''} ${report.ano || 2026}  ·  ${report.author_name || ''}  ·  ${section}`, M, 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...statusColor);
  const sw = doc.getTextWidth(statusLabel);
  doc.text(statusLabel, 210 - M - sw, 8);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  // thin rule
  doc.setDrawColor(210, 210, 210);
  doc.line(M, 10, 210 - M, 10);
  return 18;
}

function addFooter(doc, report, reportId, geradoEm, totalPages, docStatus, statusColor, periodoLabel) {
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PH - FOOTER_H + 1, 210 - M, PH - FOOTER_H + 1);
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Museus Centro — FMC/PBH  |  ${periodoLabel || ''}  |  ${report.author_name || ''}  |  ID: ${reportId || '—'}  |  Gerado: ${geradoEm}`,
      M, PH - 2
    );
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...statusColor);
    const sw = doc.getTextWidth(docStatus);
    doc.text(docStatus, 210 - M - sw - 16, PH - 2);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(`${p}/${totalPages}`, 210 - M, PH - 2, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
}

// Load image from URL to base64 for jsPDF
async function loadImageAsBase64(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function isImageType(fileType) {
  return fileType && (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileType));
}

// ─── main component ────────────────────────────────────────────────────────────

export default function ExportPDF({ report, reportId }) {
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [periodoMode, setPeriodoMode] = useState('mes'); // 'mes' | 'custom'
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const openDialog = () => {
    setPeriodoMode('mes');
    setDataInicio('');
    setDataFim('');
    setShowDialog(true);
  };

  const handleExport = async () => {
    setShowDialog(false);
    setLoading(true);
    try {
      const atividades = Array.isArray(report.atividades) ? report.atividades : [];
      let attachments = [];
      if (reportId) {
        attachments = await base44.entities.Attachment.filter({ report_id: reportId }, '-created_date');
      }

      // Period label for the PDF
      const periodoLabel = periodoMode === 'custom' && dataInicio && dataFim
        ? `${dataInicio} a ${dataFim}`
        : `${report.mes_referencia || '—'} / ${report.ano || 2026}`;

      const isOfficial = ['APPROVED', 'ARCHIVED'].includes(report.status);
      const docStatus = isOfficial ? 'DOCUMENTO OFICIAL' : 'RASCUNHO';
      const statusColor = isOfficial ? [0, 110, 0] : [160, 70, 0];

      const now = new Date();
      const geradoEm = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      let y = 20;

      // ── CAPA refinada ──────────────────────────────────────────────────────
      // Top bar dark
      doc.setFillColor(12, 12, 12);
      doc.rect(0, 0, 210, 32, 'F');
      // Thin accent line at bottom of bar
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 31.5, 210, 0.5, 'F');

      // Vertical accent left
      doc.setFillColor(220, 220, 220);
      doc.rect(M, 6, 0.5, 20, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('MUSEUS CENTRO', M + 5, 14);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text('RELATÓRIO MENSAL INDIVIDUAL  ·  FUNDAÇÃO MUNICIPAL DE CULTURA / PBH', M + 5, 21);

      // Status pill top right
      const statusBg = isOfficial ? [0, 110, 0] : [160, 70, 0];
      doc.setFillColor(...statusBg);
      const docStatusW = doc.getTextWidth(docStatus) + 8;
      doc.roundedRect(210 - M - docStatusW, 7.5, docStatusW, 7, 1.5, 1.5, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(docStatus, 210 - M - docStatusW / 2 - 0.5, 12.5, { align: 'center' });

      // Protocol row
      doc.setFillColor(230, 230, 230);
      doc.rect(0, 32, 210, 7, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const proto = report.numero_protocolo ? `Protocolo: ${report.numero_protocolo}   ·   ` : '';
      doc.text(`${proto}Gerado em: ${geradoEm}   ·   Período: ${periodoLabel}`, M, 37);

      doc.setTextColor(0, 0, 0);
      y = 44;

      // Identification block (compact 3-column grid)
      doc.setFillColor(250, 250, 250);
      doc.rect(M, y - 3, CW, 26, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.rect(M, y - 3, CW, 26, 'S');
      // Vertical dividers
      doc.setDrawColor(230, 230, 230);
      doc.line(M + CW / 3, y - 3, M + CW / 3, y + 23);
      doc.line(M + 2 * CW / 3, y - 3, M + 2 * CW / 3, y + 23);
      doc.line(M, y + 11, M + CW, y + 11);

      const idGrid = [
        ['Profissional', report.author_name],
        ['Função', report.funcao],
        ['Museu', report.museu],
        ['Período de referência', periodoLabel],
        ['Status do relatório', report.status],
        ['Equipe', report.equipe || '—'],
      ];
      const colW3 = CW / 3;
      idGrid.forEach(([label, value], i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const gx = M + col * colW3 + 4;
        const gy = y + row * 13;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(120, 120, 120);
        doc.text(label.toUpperCase(), gx, gy + 1.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(10, 10, 10);
        doc.text(String(value || '—').substring(0, 25), gx, gy + 7.5);
      });
      y += 30;

      // Summary stats strip
      const totalPublico = atividades.reduce((s, a) => s + (Number(a.publico_estimado) || 0) * (Number(a.quantas_repeticoes) || 1), 0);
      const metaCount = atividades.filter(a => a.classificacao === 'META').length;
      const stats = [
        ['Atividades', atividades.length],
        ['Público Total', totalPublico || '—'],
        ['Metas', metaCount],
        ['Anexos', attachments.length],
      ];
      const statW = CW / stats.length;
      doc.setFillColor(12, 12, 12);
      doc.rect(M, y, CW, 18, 'F');
      // Dividers
      doc.setDrawColor(50, 50, 50);
      for (let i = 1; i < stats.length; i++) {
        doc.line(M + i * statW, y + 2, M + i * statW, y + 16);
      }
      stats.forEach(([label, value], i) => {
        const sx = M + i * statW + statW / 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text(String(value), sx, y + 10, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(140, 140, 140);
        doc.text(label.toUpperCase(), sx, y + 15.5, { align: 'center' });
      });
      y += 24;

      // Activity list table
      y = secHeader(doc, 'ÍNDICE DE ATIVIDADES', y);
      doc.setFontSize(7.5);

      // Table header
      doc.setFillColor(235, 235, 235);
      doc.rect(M, y - 3, CW, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text('#', M + 2, y + 0.5);
      doc.text('Título', M + 12, y + 0.5);
      doc.text('Museu', M + 90, y + 0.5);
      doc.text('Tipo', M + 115, y + 0.5);
      doc.text('Classificação', M + 145, y + 0.5);
      doc.text('Público', M + 170, y + 0.5);
      y += 5;

      atividades.forEach((a, idx) => {
        y = checkBreak(doc, y, 6);
        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(M, y - 3, CW, 5.5, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(`A${String(idx + 1).padStart(2, '0')}`, M + 2, y + 0.5);
        doc.text(doc.splitTextToSize(a.titulo || a.nome || '—', 74)[0], M + 12, y + 0.5);
        doc.text(String(a.museu || '—').substring(0, 10), M + 90, y + 0.5);
        doc.text(String(a.tipo_acao || a.tipo_atividade || '—').substring(0, 14), M + 115, y + 0.5);
        const cl = a.classificacao || '—';
        const clColor = cl === 'META' ? [20, 60, 150] : cl === 'ROTINA' ? [20, 100, 40] : [150, 60, 20];
        doc.setTextColor(...clColor);
        doc.setFont('helvetica', 'bold');
        doc.text(cl, M + 145, y + 0.5);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.text(String(a.publico_estimado || '—'), M + 170, y + 0.5);
        y += 5.5;
      });
      y += 4;

      // Resumo executivo on cover if present
      if (report.resumo_executivo) {
        y = checkBreak(doc, y, 20);
        y = secHeader(doc, 'RESUMO EXECUTIVO', y);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        y = wrap(doc, report.resumo_executivo, M, y, CW, 4.5);
        y += 4;
      }

      // ── ATIVIDADES ────────────────────────────────────────────────────────
      atividades.forEach((ativ, idx) => {
        doc.addPage();
        y = addPageHeader(doc, report, `Atividade A${String(idx + 1).padStart(2, '0')}`, docStatus, statusColor);

        const code = `A${String(idx + 1).padStart(2, '0')}`;
        const cl = ativ.classificacao || '';
        const clColor = cl === 'META' ? [20, 60, 150] : cl === 'ROTINA' ? [20, 100, 40] : [150, 60, 20];

        // Activity title bar
        doc.setFillColor(30, 30, 30);
        doc.rect(M, y - 4, CW, 9, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`${code}  —  ${ativ.titulo || ativ.nome || 'Sem título'}`, M + 3, y + 1.5);
        if (cl) {
          doc.setFontSize(7);
          doc.setTextColor(...clColor.map(v => Math.max(v + 100, 180)));
          doc.text(`[${cl}]`, 210 - M - doc.getTextWidth(`[${cl}]`) - 3, y + 1.5);
        }
        doc.setTextColor(0, 0, 0);
        y += 10;

        // Basic info grid (3-col)
        const basicFields = [
          ['Data Início', ativ.data_inicio],
          ['Data Fim', ativ.data_fim],
          ['Museu / Local', ativ.museu],
          ['Tipo de Ação', ativ.tipo_acao || ativ.tipo_atividade],
          ['Equipe Responsável', ativ.equipe_responsavel],
          ['Público Estimado', ativ.publico_estimado],
          ['Produto Realizado', ativ.produto_realizado],
          ['Quantidade', ativ.quantidade_produto],
          ['Acessibilidade', ativ.acessibilidade],
        ];
        const bColW = CW / 3;
        doc.setFillColor(248, 248, 248);
        const gridRows = Math.ceil(basicFields.length / 3);
        doc.rect(M, y - 2, CW, gridRows * 12 + 2, 'F');
        doc.setDrawColor(225, 225, 225);
        doc.rect(M, y - 2, CW, gridRows * 12 + 2, 'S');

        basicFields.forEach(([label, value], i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const gx = M + col * bColW + 3;
          const gy = y + row * 12;
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(100, 100, 100);
          doc.text(label.toUpperCase(), gx, gy + 1);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(String(value || '—').substring(0, 26), gx, gy + 6.5);
        });
        y += gridRows * 12 + 5;

        // META block
        if (cl === 'META') {
          y = checkBreak(doc, y, 10);
          doc.setFillColor(235, 240, 255);
          doc.rect(M, y - 2, CW, 28, 'F');
          doc.setDrawColor(180, 195, 235);
          doc.rect(M, y - 2, CW, 28, 'S');
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(20, 60, 150);
          doc.text('▸  DADOS DA META — 3º TERMO ADITIVO', M + 3, y + 2);
          doc.setTextColor(0, 0, 0);
          y += 6;
          const metaFields = [
            ['Código', ativ.meta_codigo], ['Status da Meta', ativ.status_meta],
            ['Indicador Previsto', ativ.indicador_previsto], ['Meta Quantitativa', ativ.meta_quantitativa],
            ['Resultado Alcançado', ativ.resultado_alcancado], ['', ''],
          ];
          const mColW = CW / 2 - 3;
          for (let i = 0; i < metaFields.length; i += 2) {
            const [l1, v1] = metaFields[i];
            const [l2, v2] = metaFields[i + 1] || ['', ''];
            const yb = y;
            if (l1) kv(doc, l1, v1, M + 3, yb, mColW);
            if (l2) y = kv(doc, l2, v2, M + CW / 2 + 2, yb, mColW);
            else y = yb + 8;
          }
          y += 2;
        }

        // ROTINA / EXTRA justificativa
        if (cl === 'ROTINA' || cl === 'EXTRA') {
          y = checkBreak(doc, y, 10);
          const fillC = cl === 'ROTINA' ? [235, 248, 238] : [255, 245, 235];
          const borderC = cl === 'ROTINA' ? [180, 220, 185] : [235, 200, 165];
          const textC = cl === 'ROTINA' ? [20, 100, 40] : [150, 60, 20];
          doc.setFillColor(...fillC);
          doc.rect(M, y - 2, CW, 6, 'F');
          doc.setDrawColor(...borderC);
          doc.rect(M, y - 2, CW, 6, 'S');
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...textC);
          doc.text(`▸  JUSTIFICATIVA TÉCNICA  [${cl}]`, M + 3, y + 2);
          doc.setTextColor(0, 0, 0);
          y += 7;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          y = wrap(doc, ativ.justificativa_tecnica, M + 2, y, CW - 4, 4.2);
          y += 3;
        }

        // Text fields
        const textFields = [
          ['Objetivo', ativ.objetivo],
          ['Descrição do Executado', ativ.descricao_executado],
          ['Equipe Envolvida', ativ.equipe_envolvida || (Array.isArray(ativ.equipe_envolvida_lista) ? ativ.equipe_envolvida_lista.join(', ') : null)],
          ['Resultados e Impactos', ativ.resultados_impactos],
          ['Problemas Identificados', ativ.problemas],
          ['Encaminhamentos / Soluções', ativ.solucoes],
          ['Observações', ativ.observacoes],
        ];

        textFields.forEach(([label, value]) => {
          if (!value) return;
          y = checkBreak(doc, y, 10);
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(40, 40, 40);
          doc.text(label + ':', M, y);
          y += 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          y = wrap(doc, value, M + 2, y, CW - 4, 4.2);
          y += 2;
        });
      });

      // ── OPORTUNIDADES ─────────────────────────────────────────────────────
      const oportunidades = report.oportunidades || [];
      if (oportunidades.length > 0) {
        doc.addPage();
        y = addPageHeader(doc, report, 'Oportunidades Identificadas', docStatus, statusColor);
        y = secHeader(doc, `OPORTUNIDADES IDENTIFICADAS  (${oportunidades.length})`, y);

        oportunidades.forEach((op, idx) => {
          y = checkBreak(doc, y, 14);
          doc.setFillColor(248, 248, 248);
          doc.rect(M, y - 3, CW, 7, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(`${idx + 1}.  ${op.categoria || 'Oportunidade'}`, M + 2, y + 1);
          if (op.impacto) {
            const impW = doc.getTextWidth(`Impacto: ${op.impacto}`);
            doc.setFontSize(7);
            doc.setTextColor(80, 80, 80);
            doc.text(`Impacto: ${op.impacto}`, 210 - M - impW - 2, y + 1);
          }
          doc.setTextColor(0, 0, 0);
          y += 7;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          y = wrap(doc, op.descricao, M + 3, y, CW - 6, 4.2);
          y += 4;
        });
      }

      // ── AVALIAÇÃO ─────────────────────────────────────────────────────────
      const hasAv = report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes;
      if (hasAv) {
        doc.addPage();
        y = addPageHeader(doc, report, 'Avaliação do Mês', docStatus, statusColor);
        y = secHeader(doc, 'AVALIAÇÃO DO MÊS', y);

        const avItems = [
          ['Pontos Positivos', report.avaliacao_pontos_positivos, [20, 100, 40]],
          ['Dificuldades Enfrentadas', report.avaliacao_desafios, [160, 60, 20]],
          ['Sugestões de Melhoria', report.avaliacao_sugestoes, [20, 60, 150]],
        ];
        avItems.forEach(([label, value, color]) => {
          if (!value) return;
          y = checkBreak(doc, y, 12);
          doc.setFillColor(...color.map(v => Math.min(v + 220, 245)));
          doc.rect(M, y - 3, 3, 7 + wrap.length * 4, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(...color);
          doc.text(label, M + 5, y + 1);
          doc.setTextColor(0, 0, 0);
          y += 5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          y = wrap(doc, value, M + 5, y, CW - 7, 4.2);
          y += 5;
        });
      }

      // ── ANEXOS com miniaturas ──────────────────────────────────────────────
      if (attachments.length > 0) {
        doc.addPage();
        y = addPageHeader(doc, report, 'Evidências e Anexos', docStatus, statusColor);
        y = secHeader(doc, `EVIDÊNCIAS / ANEXOS  (${attachments.length})`, y, [80, 40, 0]);

        // Load images in parallel
        const imageData = {};
        await Promise.all(
          attachments
            .filter(att => isImageType(att.file_type))
            .map(async (att) => {
              const b64 = await loadImageAsBase64(att.file_url);
              if (b64) imageData[att.id] = b64;
            })
        );

        // Render images in a grid (3 per row)
        const imgAtts = attachments.filter(att => isImageType(att.file_type) && imageData[att.id]);
        if (imgAtts.length > 0) {
          const thumbW = 55;
          const thumbH = 38;
          const cols = 3;
          const gap = 4;

          y = checkBreak(doc, y, thumbH + 20);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(60, 60, 60);
          doc.text('MINIATURAS DOS ARQUIVOS DE IMAGEM', M, y);
          y += 4;

          imgAtts.forEach((att, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            if (col === 0 && row > 0) y = checkBreak(doc, y, thumbH + 14);
            const tx = M + col * (thumbW + gap);
            const ty = y + row * (thumbH + 14);

            doc.setDrawColor(200, 200, 200);
            doc.rect(tx, ty, thumbW, thumbH, 'S');
            try {
              doc.addImage(imageData[att.id], 'JPEG', tx, ty, thumbW, thumbH, undefined, 'MEDIUM');
            } catch (e) { /* skip if image fails */ }
            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80, 80, 80);
            const fname = String(att.file_name || '').substring(0, 24);
            doc.text(fname, tx, ty + thumbH + 4);
          });

          const imgRows = Math.ceil(imgAtts.length / cols);
          y += imgRows * (thumbH + 14) + 6;
        }

        // File list
        y = checkBreak(doc, y, 12);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text('LISTA COMPLETA DE ANEXOS', M, y);
        y += 5;

        attachments.forEach((att, idx) => {
          y = checkBreak(doc, y, 10);
          doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 248 : 255);
          doc.rect(M, y - 3, CW, 8, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(0, 0, 0);
          doc.text(`${idx + 1}.  ${String(att.file_name || 'Arquivo').substring(0, 50)}`, M + 2, y + 1);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 100, 100);
          const size = att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : '';
          const details = [
            att.file_type || '',
            size,
            att.created_date ? att.created_date.substring(0, 10) : '',
            att.activity_id ? 'Vinculado à atividade' : 'Geral',
          ].filter(Boolean).join('  ·  ');
          doc.text(details, M + 2, y + 5.5);

          if (att.file_url) {
            doc.setTextColor(0, 80, 180);
            doc.textWithLink('Acessar →', 210 - M - 18, y + 1, { url: att.file_url });
          }
          doc.setTextColor(0, 0, 0);
          y += 10;
        });
      }

      // ── ASSINATURA ─────────────────────────────────────────────────────────
      doc.addPage();
      y = addPageHeader(doc, report, 'Declaração e Assinatura', docStatus, statusColor);

      y = secHeader(doc, 'DECLARAÇÃO DE RESPONSABILIDADE', y, [30, 30, 30]);
      y += 2;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      const declaracaoText =
        `Eu, ${report.author_name || '___________________________'}, inscrito(a) na função de ${report.funcao || '___________________'}, ` +
        `vinculado(a) ao ${report.museu || '_______________'}, declaro que as informações registradas neste Relatório Mensal Individual ` +
        `referente ao mês de ${report.mes_referencia || '___________'} de ${report.ano || 2026} são verídicas, completas e de minha ` +
        `inteira responsabilidade. Estou ciente de que o envio deste documento constitui comprometimento formal com os dados informados, ` +
        `nos termos do Contrato de Gestão com a Fundação Municipal de Cultura de Belo Horizonte (FMC/PBH).`;
      y = wrap(doc, declaracaoText, M, y, CW, 5);
      y += 10;

      // Signature boxes
      const boxW = 82;
      const boxGap = CW - 2 * boxW;

      // Professional signature
      doc.setDrawColor(100, 100, 100);
      doc.line(M, y, M + boxW, y);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(report.author_name || 'Profissional', M, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(report.funcao || 'Função', M, y + 9);
      doc.text(`${report.museu || ''}  ·  ${report.mes_referencia || ''} / ${report.ano || 2026}`, M, y + 13);
      doc.text('Data: _____ / _____ / __________', M, y + 18);

      // Coordinator signature
      const cx = M + boxW + boxGap;
      doc.setDrawColor(100, 100, 100);
      doc.line(cx, y, cx + boxW, y);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(report.reviewer_name || 'Coordenador(a) Responsável', cx, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text('Coordenação — Museus Centro / FMC-PBH', cx, y + 9);
      doc.text('Data: _____ / _____ / __________', cx, y + 18);

      y += 28;

      // Approval notice
      y = checkBreak(doc, y, 30);
      doc.setFillColor(240, 244, 255);
      doc.setDrawColor(180, 195, 235);
      doc.rect(M, y, CW, 22, 'F');
      doc.rect(M, y, CW, 22, 'S');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 60, 150);
      doc.text('IMPORTANTE — APROVAÇÃO OBRIGATÓRIA PELO COORDENADOR', M + 4, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 80);
      const noticeText =
        'Todo novo usuário e todo relatório submetido nesta plataforma requerem aprovação obrigatória do Coordenador ' +
        'responsável antes de produzir qualquer efeito formal. O documento só terá validade após revisão e aprovação pelo ' +
        'Coordenador(a) vinculado ao seu museu, nos termos do Contrato de Gestão FMC/PBH.';
      wrap(doc, noticeText, M + 4, y + 12, CW - 8, 4.2);
      y += 26;

      // Reviewer info if available
      if (report.reviewer_name || report.reviewer_email) {
        y = checkBreak(doc, y, 20);
        doc.setFillColor(245, 255, 245);
        doc.setDrawColor(180, 220, 185);
        doc.rect(M, y, CW, 16, 'F');
        doc.rect(M, y, CW, 16, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(20, 100, 40);
        doc.text('Coordenador(a) designado(a) para este relatório:', M + 4, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(`${report.reviewer_name || ''}${report.reviewer_email ? '  <' + report.reviewer_email + '>' : ''}`, M + 4, y + 12);
      }

      // Approval info — appears only if report is APPROVED or ARCHIVED
      if (report.status === 'APPROVED' || report.status === 'ARCHIVED') {
        y = checkBreak(doc, y, 20);
        doc.setFillColor(230, 250, 230);
        doc.setDrawColor(100, 180, 100);
        doc.rect(M, y, CW, 16, 'F');
        doc.rect(M, y, CW, 16, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(0, 120, 0);
        const approvalDate = report.updated_date ? new Date(report.updated_date).toLocaleDateString('pt-BR') : '—';
        const approvalTime = report.updated_date ? new Date(report.updated_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
        doc.text(`✓ RELATÓRIO APROVADO`, M + 4, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`Data: ${approvalDate}  ·  Hora: ${approvalTime}`, M + 4, y + 10);
        doc.text(`Coordenador(a): ${report.reviewer_name || '—'}`, M + 4, y + 14);
      }

      // rodapé adicionado após instrução de assinatura

      // Audit log
      await base44.entities.AuditLog.create({
        action: 'UPDATE',
        entity_type: 'REPORT',
        entity_id: reportId || '',
        actor_email: report.created_by || report.author_name || 'sistema',
        actor_name: report.author_name || '',
        details: `PDF exportado — ${report.mes_referencia || '?'} ${report.ano || 2026} — ${atividades.length} atividade(s) — ${attachments.length} anexo(s)`,
      });

      // ── INSTRUÇÃO DE ASSINATURA ─────────────────────────────────────────────
      y = checkBreak(doc, y, 40);
      y += 8;
      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(217, 180, 60);
      doc.rect(M, y, CW, 36, 'F');
      doc.rect(M, y, CW, 36, 'S');

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(120, 80, 0);
      doc.text('✦  COMO TORNAR ESTE DOCUMENTO VÁLIDO', M + 4, y + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 40, 0);
      doc.text('Opção 1 — Impressão e assinatura manual:', M + 4, y + 15);
      doc.setTextColor(40, 40, 40);
      doc.text('Imprima este PDF, assine à mão nos campos acima e entregue ao coordenador para rubrica e arquivo físico.', M + 4, y + 20);

      doc.setTextColor(60, 40, 0);
      doc.setFont('helvetica', 'normal');
      doc.text('Opção 2 — Assinatura digital (recomendado):', M + 4, y + 27);
      doc.setTextColor(40, 40, 40);
      doc.text('Abra o PDF em Adobe Acrobat, Foxit ou similar e adicione sua assinatura digital certificada (ICP-Brasil ou GOV.BR).', M + 4, y + 32);

      const safeName = (report.author_name || 'profissional').replace(/\s+/g, '_').toUpperCase();
      doc.save(`MC_RELATORIO_${report.ano || 2026}_${(report.mes_referencia || 'MES').toUpperCase()}_${safeName}_${reportId || 'NOVO'}.pdf`);
      toast.success('PDF exportado! Para validade formal, imprima e assine à mão ou adicione assinatura digital (Adobe Acrobat / GOV.BR).', { duration: 8000 });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
        {loading ? 'Gerando PDF...' : 'Exportar PDF'}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-gray-600">Escolha o período que constará no relatório:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPeriodoMode('mes')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${periodoMode === 'mes' ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
              >
                Mês de referência
              </button>
              <button
                onClick={() => setPeriodoMode('custom')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${periodoMode === 'custom' ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
              >
                Período personalizado
              </button>
            </div>

            {periodoMode === 'mes' && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Período: <strong>{report.mes_referencia || '—'} / {report.ano || 2026}</strong>
              </p>
            )}

            {periodoMode === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Data inicial</Label>
                  <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Data final</Label>
                  <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={handleExport}
              disabled={periodoMode === 'custom' && (!dataInicio || !dataFim)}
            >
              <FileDown className="w-4 h-4 mr-2" />
              Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}