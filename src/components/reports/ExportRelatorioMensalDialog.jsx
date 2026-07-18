import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileDown, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, convertInchesToTwip, Header, Footer, PageBreak } from 'docx';

// ── PDF helpers (replicados do ExportPDF.jsx) ──────────────────────────────────

const M = 14, CW = 182, PH = 287, FOOTER_H = 8;

function checkBreak(doc, y, needed = 12) {
  if (y + needed > PH - FOOTER_H) { doc.addPage(); return 18; }
  return y;
}

function wrap(doc, text, x, y, maxW, lh = 4.2) {
  const lines = doc.splitTextToSize(String(text || '—'), maxW);
  lines.forEach(line => { y = checkBreak(doc, y, lh + 1); doc.text(line, x, y); y += lh; });
  return y;
}

function secHeader(doc, title, y) {
  y = checkBreak(doc, y, 10);
  doc.setFillColor(30, 30, 30); doc.rect(M, y - 4, 3, 7, 'F');
  doc.setFillColor(245, 245, 245); doc.rect(M + 3, y - 4, CW - 3, 7, 'F');
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text(title, M + 6, y + 0.5);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  return y + 8;
}

function addPageHeader(doc, report, section, docStatus, statusColor) {
  doc.setFontSize(6.5); doc.setTextColor(140, 140, 140); doc.setFont('helvetica', 'normal');
  doc.text(`${report.mes_referencia || ''} ${report.ano || 2026}  ·  ${report.author_name || ''}  ·  ${section}`, M, 8);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...statusColor);
  const sw = doc.getTextWidth(docStatus);
  doc.text(docStatus, 210 - M - sw, 8);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  doc.setDrawColor(210, 210, 210); doc.line(M, 10, 210 - M, 10);
  return 18;
}

function addFooter(doc, report, reportId, geradoEm, totalPages, docStatus, statusColor, periodoLabel) {
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 200); doc.line(M, PH - FOOTER_H + 1, 210 - M, PH - FOOTER_H + 1);
    doc.setFontSize(6.5); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
    doc.text(`Museus Centro — FMC/PBH  |  ${periodoLabel}  |  ${report.author_name || ''}  |  ID: ${reportId || '—'}  |  Gerado: ${geradoEm}`, M, PH - 2);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...statusColor);
    const sw = doc.getTextWidth(docStatus);
    doc.text(docStatus, 210 - M - sw - 16, PH - 2);
    doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
    doc.text(`${p}/${totalPages}`, 210 - M, PH - 2, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
}

async function loadImageAsBase64(url) {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── Gerador PDF Mensal SUCC ────────────────────────────────────────────────────

async function gerarPDFMensal(report, reportId, periodoLabel) {
  const atividades = Array.isArray(report.atividades) ? report.atividades : [];
  let attachments = [];
  if (reportId) {
    try { attachments = await base44.entities.Attachment.filter({ report_id: reportId }, '-created_date') || []; } catch (_) {}
  }
  let reportPhotos = [];
  if (reportId) {
    try {
      const rp = await base44.entities.ReportPhoto.filter({ report_id: reportId }, 'ordem', 200);
      reportPhotos = (rp || []).filter(p => p.file_url && !p.galeria_oculta);
    } catch (_) {}
  }

  const isOfficial = ['APPROVED', 'ARCHIVED'].includes(report.status);
  const docStatus = isOfficial ? 'DOCUMENTO OFICIAL' : 'RASCUNHO';
  const statusColor = isOfficial ? [0, 110, 0] : [160, 70, 0];
  const now = new Date();
  const geradoEm = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── CAPA ─────────────────────────────────────────────────────────────────────
  doc.setFillColor(12, 12, 12); doc.rect(0, 0, 210, 32, 'F');
  doc.setFillColor(255, 255, 255); doc.rect(0, 31.5, 210, 0.5, 'F');
  doc.setFillColor(220, 220, 220); doc.rect(M, 6, 0.5, 20, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('MUSEUS CENTRO', M + 5, 14);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
  doc.text('RELATÓRIO MENSAL INDIVIDUAL  ·  FUNDAÇÃO MUNICIPAL DE CULTURA / PBH', M + 5, 21);
  const statusBg = isOfficial ? [0, 110, 0] : [160, 70, 0];
  doc.setFillColor(...statusBg);
  const docStatusW = doc.getTextWidth(docStatus) + 8;
  doc.roundedRect(210 - M - docStatusW, 7.5, docStatusW, 7, 1.5, 1.5, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(docStatus, 210 - M - docStatusW / 2 - 0.5, 12.5, { align: 'center' });
  doc.setFillColor(230, 230, 230); doc.rect(0, 32, 210, 7, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
  const proto = report.numero_protocolo ? `Protocolo: ${report.numero_protocolo}   ·   ` : '';
  doc.text(`${proto}Gerado em: ${geradoEm}   ·   Período: ${periodoLabel}`, M, 37);
  doc.setTextColor(0, 0, 0);
  let y = 44;

  // Grid identificação
  doc.setFillColor(250, 250, 250); doc.rect(M, y - 3, CW, 26, 'F');
  doc.setDrawColor(220, 220, 220); doc.rect(M, y - 3, CW, 26, 'S');
  doc.setDrawColor(230, 230, 230);
  doc.line(M + CW / 3, y - 3, M + CW / 3, y + 23);
  doc.line(M + 2 * CW / 3, y - 3, M + 2 * CW / 3, y + 23);
  doc.line(M, y + 11, M + CW, y + 11);
  const idGrid = [
    ['Profissional', report.author_name], ['Função', report.funcao], ['Museu', report.museu],
    ['Período de referência', periodoLabel], ['Status do relatório', report.status], ['Equipe', report.equipe || '—'],
  ];
  const colW3 = CW / 3;
  idGrid.forEach(([label, value], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const gx = M + col * colW3 + 4, gy = y + row * 13;
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), gx, gy + 1.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(10, 10, 10);
    doc.text(String(value || '—').substring(0, 25), gx, gy + 7.5);
  });
  y += 30;

  // Stats strip
  const totalPublico = atividades.reduce((s, a) => s + (Number(a.publico_total) || Number(a.publico_estimado) || 0), 0);
  const metaCount = atividades.filter(a => a.classificacao === 'META').length;
  const stats = [['Atividades', atividades.length], ['Público Total', totalPublico || '—'], ['Metas', metaCount], ['Fotos', reportPhotos.length]];
  const statW = CW / stats.length;
  doc.setFillColor(12, 12, 12); doc.rect(M, y, CW, 18, 'F');
  doc.setDrawColor(50, 50, 50);
  for (let i = 1; i < stats.length; i++) doc.line(M + i * statW, y + 2, M + i * statW, y + 16);
  stats.forEach(([label, value], i) => {
    const sx = M + i * statW + statW / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
    doc.text(String(value), sx, y + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(140, 140, 140);
    doc.text(label.toUpperCase(), sx, y + 15.5, { align: 'center' });
  });
  y += 24;

  // Índice atividades
  y = secHeader(doc, 'ÍNDICE DE ATIVIDADES', y);
  doc.setFillColor(235, 235, 235); doc.rect(M, y - 3, CW, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50); doc.setFontSize(7.5);
  doc.text('#', M + 2, y + 0.5); doc.text('Título', M + 12, y + 0.5);
  doc.text('Museu', M + 90, y + 0.5); doc.text('Classificação', M + 130, y + 0.5); doc.text('Público', M + 170, y + 0.5);
  y += 5;
  atividades.forEach((a, idx) => {
    y = checkBreak(doc, y, 6);
    if (idx % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(M, y - 3, CW, 5.5, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
    doc.text(`A${String(idx + 1).padStart(2, '0')}`, M + 2, y + 0.5);
    doc.text(doc.splitTextToSize(a.titulo || a.nome || '—', 74)[0], M + 12, y + 0.5);
    doc.text(String(a.museu || '—').substring(0, 12), M + 90, y + 0.5);
    const cl = a.classificacao || '—';
    const clColor = cl === 'META' ? [20, 60, 150] : cl === 'ROTINA' ? [20, 100, 40] : [150, 60, 20];
    doc.setTextColor(...clColor); doc.setFont('helvetica', 'bold');
    doc.text(cl, M + 130, y + 0.5);
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    doc.text(String(a.publico_total || a.publico_estimado || '—'), M + 170, y + 0.5);
    y += 5.5;
  });
  y += 4;

  // Resumo executivo
  if (report.resumo_executivo) {
    y = checkBreak(doc, y, 20);
    y = secHeader(doc, 'RESUMO EXECUTIVO', y);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    y = wrap(doc, report.resumo_executivo, M, y, CW, 4.5);
    y += 4;
  }

  if (report.resumo_periodo) {
    y = checkBreak(doc, y, 12);
    y = secHeader(doc, 'RESUMO DO PERÍODO', y);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    y = wrap(doc, report.resumo_periodo, M, y, CW, 4.5);
    y += 4;
  }

  // ── ATIVIDADES detalhadas ────────────────────────────────────────────────────
  atividades.forEach((ativ, idx) => {
    doc.addPage();
    y = addPageHeader(doc, report, `Atividade A${String(idx + 1).padStart(2, '0')}`, docStatus, statusColor);
    const code = `A${String(idx + 1).padStart(2, '0')}`;
    const cl = ativ.classificacao || '';
    const clColor = cl === 'META' ? [20, 60, 150] : cl === 'ROTINA' ? [20, 100, 40] : [150, 60, 20];
    doc.setFillColor(30, 30, 30); doc.rect(M, y - 4, CW, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(`${code}  —  ${ativ.titulo || ativ.nome || 'Sem título'}`, M + 3, y + 1.5);
    if (cl) {
      doc.setFontSize(7); doc.setTextColor(...clColor.map(v => Math.max(v + 100, 180)));
      doc.text(`[${cl}]`, 210 - M - doc.getTextWidth(`[${cl}]`) - 3, y + 1.5);
    }
    doc.setTextColor(0, 0, 0); y += 10;

    const basicFields = [
      ['Data Início', ativ.data_inicio || ativ.data_realizacao], ['Data Fim', ativ.data_fim],
      ['Museu / Local', ativ.museu], ['Tipo de Ação', ativ.tipo_acao || ativ.tipo_atividade],
      ['Público Total', ativ.publico_total || ativ.publico_estimado], ['Acessibilidade', ativ.acessibilidade],
      ['Parceria', ativ.parceria], ['Parceiro', ativ.parceiro_nome],
    ];
    const bColW = CW / 3;
    doc.setFillColor(248, 248, 248);
    const gridRows = Math.ceil(basicFields.length / 3);
    doc.rect(M, y - 2, CW, gridRows * 12 + 2, 'F');
    doc.setDrawColor(225, 225, 225); doc.rect(M, y - 2, CW, gridRows * 12 + 2, 'S');
    basicFields.forEach(([label, value], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const gx = M + col * bColW + 3, gy = y + row * 12;
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
      doc.text(label.toUpperCase(), gx, gy + 1);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
      doc.text(String(value || '—').substring(0, 26), gx, gy + 6.5);
    });
    y += gridRows * 12 + 5;

    // META block
    if (cl === 'META') {
      y = checkBreak(doc, y, 10);
      doc.setFillColor(235, 240, 255); doc.rect(M, y - 2, CW, 32, 'F');
      doc.setDrawColor(180, 195, 235); doc.rect(M, y - 2, CW, 32, 'S');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 60, 150);
      doc.text('▸  DADOS DA META — 3º TERMO ADITIVO', M + 3, y + 2);
      doc.setTextColor(0, 0, 0); y += 6;
      const mFields = [
        ['Código da Meta', ativ.meta_codigo], ['Status da Meta', ativ.status_meta],
        ['Indicador Previsto', ativ.indicador_previsto], ['Meta Quantitativa', ativ.meta_quantitativa],
        ['Resultado Alcançado', ativ.resultado_alcancado], ['Justificativa Técnica', ativ.justificativa_tecnica],
      ];
      const mColW = CW / 2 - 3;
      for (let i = 0; i < mFields.length; i += 2) {
        const [l1, v1] = mFields[i], [l2, v2] = mFields[i + 1] || ['', ''];
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
        if (l1) doc.text(l1.toUpperCase(), M + 3, y); if (l2) doc.text(l2.toUpperCase(), M + CW / 2 + 2, y);
        y += 3.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
        if (v1) doc.text(String(v1 || '—').substring(0, 32), M + 3, y);
        if (v2) doc.text(String(v2 || '—').substring(0, 32), M + CW / 2 + 2, y);
        y += 5;
      }
      y += 2;
    }

    // Texto descricao
    if (ativ.descricao) {
      y = checkBreak(doc, y, 10);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
      doc.text('Descrição:', M, y); y += 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
      y = wrap(doc, ativ.descricao, M + 2, y, CW - 4, 4.2); y += 2;
    }
    if (ativ.observacoes) {
      y = checkBreak(doc, y, 10);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
      doc.text('Observações:', M, y); y += 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
      y = wrap(doc, ativ.observacoes, M + 2, y, CW - 4, 4.2); y += 2;
    }
  });

  // ── GALERIA FOTOGRÁFICA ──────────────────────────────────────────────────────
  const fotosAtividades = [];
  atividades.forEach((ativ, aidx) => {
    (Array.isArray(ativ.fotos) ? ativ.fotos : []).forEach(f => {
      if (f.file_url) fotosAtividades.push({ ...f, _tit: ativ.titulo || `A${aidx + 1}`, _meta: ativ.meta_codigo || '' });
    });
  });
  const urlsUsadas = new Set(reportPhotos.map(p => p.file_url));
  fotosAtividades.forEach(f => { if (f.file_url && !urlsUsadas.has(f.file_url)) { reportPhotos.push(f); urlsUsadas.add(f.file_url); } });

  if (reportPhotos.length > 0) {
    doc.addPage();
    y = addPageHeader(doc, report, 'Comprovação Fotográfica — SUCC', docStatus, statusColor);
    doc.setFillColor(20, 40, 100); doc.rect(M, y - 4, CW, 12, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('COMPROVAÇÃO FOTOGRÁFICA — SUCC / FMC-PBH', M + 4, y + 3);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 200, 255);
    doc.text(`${reportPhotos.length} foto(s)  ·  ${report.mes_referencia || ''} ${report.ano || 2026}  ·  ${report.museu || ''}`, M + 4, y + 8);
    doc.setTextColor(0, 0, 0); y += 14;

    const fotosParaEmbed = reportPhotos.slice(0, 40);
    const imgDataMap = {};
    await Promise.all(fotosParaEmbed.map(async (foto) => {
      const b64 = await loadImageAsBase64(foto.file_url);
      if (b64) imgDataMap[foto.file_url] = b64;
    }));

    const colW2 = (CW - 6) / 2, fotoH = 52, captionH = 16, blockH = fotoH + captionH + 3;
    let col = 0, rowStartY = y;
    fotosParaEmbed.forEach((foto, fi) => {
      const tx = M + col * (colW2 + 6), ty = rowStartY;
      doc.setDrawColor(180, 195, 220); doc.setFillColor(245, 247, 252);
      doc.rect(tx, ty, colW2, fotoH + captionH + 2, 'F');
      doc.rect(tx, ty, colW2, fotoH + captionH + 2, 'S');
      const b64 = imgDataMap[foto.file_url];
      if (b64) {
        try { doc.addImage(b64, 'JPEG', tx + 1, ty + 1, colW2 - 2, fotoH - 2, undefined, 'MEDIUM'); }
        catch (_) { doc.setFillColor(220, 225, 235); doc.rect(tx + 1, ty + 1, colW2 - 2, fotoH - 2, 'F'); }
      } else {
        doc.setFillColor(220, 225, 235); doc.rect(tx + 1, ty + 1, colW2 - 2, fotoH - 2, 'F');
        doc.setFontSize(7); doc.setTextColor(120, 130, 150);
        doc.text('[Sem imagem]', tx + colW2 / 2, ty + fotoH / 2, { align: 'center' });
      }
      const cy = ty + fotoH + 1;
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 40, 100);
      const metaCod = foto.meta_id || foto._meta || '';
      doc.text(`Foto ${fi + 1}${metaCod ? `  ·  ${metaCod}` : ''}`, tx + 2, cy + 3.5);
      const legenda = foto.caption || foto.legenda || foto._tit || '';
      if (legenda) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(30, 30, 30);
        doc.splitTextToSize(legenda, colW2 - 4).slice(0, 2).forEach((line, li) => doc.text(line, tx + 2, cy + 7.5 + li * 4));
      }
      doc.setFont('helvetica', 'italic'); doc.setFontSize(5.5); doc.setTextColor(100, 110, 130);
      doc.text(`Foto: ${foto.author || foto.autor || 'Museus Centro'}`, tx + 2, cy + captionH - 2);
      doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
      col++;
      if (col >= 2) {
        col = 0; rowStartY += blockH + 4;
        if (rowStartY + blockH > PH - FOOTER_H - 10) {
          doc.addPage();
          y = addPageHeader(doc, report, 'Comprovação Fotográfica (cont.)', docStatus, statusColor);
          rowStartY = y;
        }
      }
    });
    y = rowStartY + (col > 0 ? blockH + 4 : 0) + 4;

    // Nota regulatória SUCC
    y = checkBreak(doc, y, 16);
    doc.setFillColor(235, 240, 255); doc.setDrawColor(160, 180, 230);
    doc.rect(M, y, CW, 12, 'F'); doc.rect(M, y, CW, 12, 'S');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 40, 100);
    doc.text('NOTA SUCC — Comprovação Regulatória', M + 3, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(40, 50, 100);
    doc.text('As fotografias acima constituem evidência documental das atividades executadas conforme o Plano de Trabalho do Contrato de Gestão FMC/PBH — 3º Termo Aditivo.', M + 3, y + 10, { maxWidth: CW - 6 });
    y += 16;
  }

  // ── AVALIAÇÃO ────────────────────────────────────────────────────────────────
  if (report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes) {
    doc.addPage();
    y = addPageHeader(doc, report, 'Avaliação do Mês', docStatus, statusColor);
    y = secHeader(doc, 'AVALIAÇÃO DO MÊS', y);
    [
      ['Pontos Positivos', report.avaliacao_pontos_positivos, [20, 100, 40]],
      ['Desafios Enfrentados', report.avaliacao_desafios, [160, 60, 20]],
      ['Sugestões de Melhoria', report.avaliacao_sugestoes, [20, 60, 150]],
      ['Comentários Gerais', report.comentarios_gerais, [80, 80, 80]],
    ].forEach(([label, value, color]) => {
      if (!value) return;
      y = checkBreak(doc, y, 12);
      doc.setFillColor(...color.map(v => Math.min(v + 220, 245))); doc.rect(M, y - 3, 3, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...color);
      doc.text(label, M + 5, y + 1); doc.setTextColor(0, 0, 0); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      y = wrap(doc, value, M + 5, y, CW - 7, 4.2); y += 5;
    });
  }

  // ── ASSINATURA ───────────────────────────────────────────────────────────────
  doc.addPage();
  y = addPageHeader(doc, report, 'Declaração e Assinatura', docStatus, statusColor);
  y = secHeader(doc, 'DECLARAÇÃO DE RESPONSABILIDADE', y); y += 2;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  const declaracaoText =
    `Eu, ${report.author_name || '___________________________'}, inscrito(a) na função de ${report.funcao || '___________________'}, ` +
    `vinculado(a) ao ${report.museu || '_______________'}, declaro que as informações registradas neste Relatório Mensal Individual ` +
    `referente ao mês de ${report.mes_referencia || '___________'} de ${report.ano || 2026} são verídicas, completas e de minha ` +
    `inteira responsabilidade, nos termos do Contrato de Gestão com a Fundação Municipal de Cultura de Belo Horizonte (FMC/PBH).`;
  y = wrap(doc, declaracaoText, M, y, CW, 5); y += 10;

  const boxW = 82, boxGap = CW - 2 * boxW;
  doc.setDrawColor(100, 100, 100); doc.line(M, y, M + boxW, y);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
  doc.text(report.author_name || 'Profissional', M, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
  doc.text(report.funcao || '', M, y + 9);
  doc.text(`${report.museu || ''}  ·  ${periodoLabel}`, M, y + 13);
  doc.text('Data: _____ / _____ / __________', M, y + 18);
  const cx = M + boxW + boxGap;
  doc.setDrawColor(100, 100, 100); doc.line(cx, y, cx + boxW, y);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
  doc.text(report.reviewer_name || 'Coordenador(a) Responsável', cx, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
  doc.text('Coordenação — Museus Centro / FMC-PBH', cx, y + 9);
  doc.text('Data: _____ / _____ / __________', cx, y + 18);
  y += 28;

  if (report.status === 'APPROVED' || report.status === 'ARCHIVED') {
    y = checkBreak(doc, y, 20);
    doc.setFillColor(230, 250, 230); doc.setDrawColor(100, 180, 100);
    doc.rect(M, y, CW, 16, 'F'); doc.rect(M, y, CW, 16, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0, 120, 0);
    const approvalDate = report.updated_date ? new Date(report.updated_date).toLocaleDateString('pt-BR') : '—';
    doc.text(`✓ RELATÓRIO APROVADO`, M + 4, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(40, 80, 40);
    doc.text(`Data: ${approvalDate}  ·  Coordenador(a): ${report.reviewer_name || '—'}`, M + 4, y + 11);
  }

  addFooter(doc, report, reportId, geradoEm, doc.getNumberOfPages(), docStatus, statusColor, periodoLabel);

  const safeName = (report.author_name || 'profissional').replace(/\s+/g, '_').toUpperCase();
  doc.save(`MC_RELATORIO_${report.ano || 2026}_${(report.mes_referencia || 'MES').toUpperCase()}_${safeName}.pdf`);

  try {
    await base44.entities.AuditLog.create({
      action: 'UPDATE', entity_type: 'REPORT', entity_id: reportId || '',
      actor_email: report.created_by || '', actor_name: report.author_name || '',
      details: `PDF SUCC exportado — ${report.mes_referencia} ${report.ano} — ${atividades.length} atividade(s)`,
    });
  } catch (_) {}
}

// ── Gerador DOCX Mensal SUCC ───────────────────────────────────────────────────

const FONT = 'Arial';
const COLOR_DARK = '1A1A2E';
const COLOR_BLUE_HDR = '142864';
const COLOR_WHITE_STR = 'FFFFFF';
const COLOR_LIGHT_BG = 'F5F5F5';

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: COLOR_WHITE_STR, size: 22, font: FONT })],
    shading: { type: ShadingType.SOLID, color: COLOR_DARK, fill: COLOR_DARK },
    spacing: { before: 200, after: 80 }, indent: { left: convertInchesToTwip(0.1) },
  });
}
function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 19, font: FONT })],
    shading: { type: ShadingType.SOLID, color: 'E1E1E1', fill: 'E1E1E1' },
    spacing: { before: 120, after: 60 },
  });
}
function para(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text: String(text || ''), size: 18, font: FONT, ...opts })], spacing: { after: 60 } });
}
function labelVal(label, value) {
  return new Paragraph({
    children: [new TextRun({ text: label + ': ', bold: true, size: 18, font: FONT }), new TextRun({ text: String(value || '—'), size: 18, font: FONT })],
    spacing: { after: 60 },
  });
}
function emptyP() { return new Paragraph({ children: [new TextRun('')], spacing: { after: 60 } }); }
function pgBreak() { return new Paragraph({ children: [new PageBreak()] }); }
function allBorders(color = 'CCCCCC') {
  const b = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: b, bottom: b, left: b, right: b, insideH: b, insideV: b };
}
function makeTable(headers, rows, colWidths) {
  const pct = colWidths || headers.map(() => Math.floor(100 / headers.length));
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: pct[i], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: COLOR_BLUE_HDR, fill: COLOR_BLUE_HDR },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: COLOR_WHITE_STR, size: 15, font: FONT })], alignment: AlignmentType.LEFT })],
      borders: allBorders(),
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      width: { size: pct[ci], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? COLOR_LIGHT_BG : COLOR_WHITE_STR, fill: ri % 2 === 0 ? COLOR_LIGHT_BG : COLOR_WHITE_STR },
      children: [new Paragraph({ children: [new TextRun({ text: String(cell || '—'), size: 16, font: FONT })], alignment: AlignmentType.LEFT })],
      borders: allBorders(),
    })),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

async function gerarDOCXMensal(report, reportId, periodoLabel) {
  const atividades = Array.isArray(report.atividades) ? report.atividades : [];
  const now = new Date().toLocaleString('pt-BR');
  const isOfficial = ['APPROVED', 'ARCHIVED'].includes(report.status);
  const docStatusLabel = isOfficial ? 'DOCUMENTO OFICIAL' : 'RASCUNHO';

  const sections = [
    // Capa
    new Paragraph({
      children: [new TextRun({ text: 'MUSEUS CENTRO — FUNDAÇÃO MUNICIPAL DE CULTURA / PBH', bold: true, size: 28, color: COLOR_WHITE_STR, font: FONT })],
      shading: { type: ShadingType.SOLID, color: COLOR_DARK, fill: COLOR_DARK },
      alignment: AlignmentType.CENTER, spacing: { before: 200, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'RELATÓRIO MENSAL INDIVIDUAL', bold: true, size: 24, font: FONT })],
      alignment: AlignmentType.CENTER, spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `${periodoLabel}  ·  ${docStatusLabel}`, size: 18, color: '555555', font: FONT })],
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
    }),
    emptyP(),

    // Identificação
    h1('1. IDENTIFICAÇÃO'),
    labelVal('Profissional', report.author_name),
    labelVal('Função', report.funcao),
    labelVal('Museu', report.museu),
    labelVal('Equipe', report.equipe),
    labelVal('Período de referência', periodoLabel),
    labelVal('Status', report.status),
    report.numero_protocolo ? labelVal('Protocolo', report.numero_protocolo) : emptyP(),
    emptyP(),

    // Resumo
    h1('2. RESUMO DO PERÍODO'),
    para(report.resumo_periodo || '—'),
    emptyP(),

    h1('3. RESUMO EXECUTIVO'),
    para(report.resumo_executivo || '—'),
    emptyP(),

    // Atividades — tabela índice
    pgBreak(),
    h1(`4. ATIVIDADES REALIZADAS (${atividades.length})`),
  ];

  if (atividades.length > 0) {
    sections.push(
      makeTable(
        ['Código', 'Título', 'Classificação', 'Museu', 'Público', 'Data'],
        atividades.map((a, i) => [
          `A${String(i + 1).padStart(2, '0')}`,
          a.titulo || a.nome || '—',
          a.classificacao || '—',
          a.museu || '—',
          String(a.publico_total || a.publico_estimado || 0),
          a.data_realizacao || a.data_inicio || '—',
        ]),
        [8, 30, 14, 14, 10, 14]
      ),
      emptyP(),
    );

    // Atividades detalhadas
    sections.push(h2('Detalhamento por Atividade'));
    atividades.forEach((ativ, idx) => {
      const code = `A${String(idx + 1).padStart(2, '0')}`;
      const cl = ativ.classificacao || '';
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: `${code} — ${ativ.titulo || ativ.nome || 'Sem título'}  [${cl}]`, bold: true, size: 20, font: FONT, color: cl === 'META' ? '14203C' : cl === 'ROTINA' ? '145028' : '963C14' })],
          shading: { type: ShadingType.SOLID, color: cl === 'META' ? 'EBF0FF' : cl === 'ROTINA' ? 'EBFFF0' : 'FFF5EB', fill: cl === 'META' ? 'EBF0FF' : cl === 'ROTINA' ? 'EBFFF0' : 'FFF5EB' },
          spacing: { before: 160, after: 60 },
        }),
        labelVal('Data', ativ.data_realizacao || ativ.data_inicio || '—'),
        labelVal('Público Total', String(ativ.publico_total || ativ.publico_estimado || 0)),
        labelVal('Acessibilidade', ativ.acessibilidade || '—'),
        labelVal('Parceria', ativ.parceria || 'Não'),
      );
      if (cl === 'META') {
        sections.push(
          labelVal('Código da Meta', ativ.meta_codigo || '—'),
          labelVal('Indicador Previsto', ativ.indicador_previsto || '—'),
          labelVal('Meta Quantitativa', ativ.meta_quantitativa || '—'),
          labelVal('Resultado Alcançado', ativ.resultado_alcancado || '—'),
          labelVal('Status da Meta', ativ.status_meta || '—'),
        );
      }
      if (ativ.descricao) sections.push(labelVal('Descrição', ativ.descricao));
      if (ativ.justificativa_tecnica) sections.push(labelVal('Justificativa Técnica', ativ.justificativa_tecnica));
      sections.push(emptyP());
    });
  } else {
    sections.push(para('Nenhuma atividade registrada para este período.', { italics: true }));
  }

  // Avaliação
  sections.push(
    pgBreak(),
    h1('5. AVALIAÇÃO DO PERÍODO'),
    labelVal('Pontos Positivos', report.avaliacao_pontos_positivos || '—'),
    emptyP(),
    labelVal('Desafios Enfrentados', report.avaliacao_desafios || '—'),
    emptyP(),
    labelVal('Sugestões de Melhoria', report.avaliacao_sugestoes || '—'),
    emptyP(),
    labelVal('Comentários Gerais', report.comentarios_gerais || '—'),
    emptyP(),

    // Assinatura
    pgBreak(),
    h1('6. DECLARAÇÃO E ASSINATURA'),
    para(
      `Eu, ${report.author_name || '___________________________'}, inscrito(a) na função de ${report.funcao || '___________________'}, ` +
      `vinculado(a) ao ${report.museu || '_______________'}, declaro que as informações registradas neste Relatório Mensal Individual ` +
      `referente ao mês de ${report.mes_referencia || '___________'} de ${report.ano || 2026} são verídicas e de minha inteira responsabilidade, ` +
      `nos termos do Contrato de Gestão com a Fundação Municipal de Cultura de Belo Horizonte (FMC/PBH).`,
      { italics: true }
    ),
    emptyP(),
    emptyP(),
    para('Belo Horizonte, _______ de ___________________________ de 20______'),
    emptyP(),
    para(`${report.author_name || '___________________________'}  —  ${report.funcao || ''}  —  ${report.museu || ''}`),
    para('Assinatura: ______________________________________________'),
    emptyP(),
    para('Coordenador(a) Responsável — Museus Centro / FMC-PBH'),
    para('Assinatura: ______________________________________________'),
  );

  const doc = new Document({
    creator: 'Museus Centro App',
    title: `Relatório Mensal — ${periodoLabel} — ${report.author_name || ''}`,
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2) } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: `MUSEUS CENTRO  ·  Relatório Mensal  ·  ${periodoLabel}  ·  ${docStatusLabel}`, size: 14, color: '888888', font: FONT })], alignment: AlignmentType.RIGHT })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: `Gerado em ${now}  ·  ${report.author_name || ''}  ·  ${report.museu || ''}  ·  FMC/PBH`, size: 14, color: '999999', font: FONT })], alignment: AlignmentType.CENTER })] }) },
      children: sections,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = (report.author_name || 'profissional').replace(/\s+/g, '_').toUpperCase();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `MC_RELATORIO_${report.ano || 2026}_${(report.mes_referencia || 'MES').toUpperCase()}_${safeName}.docx`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

  try {
    await base44.entities.AuditLog.create({
      action: 'UPDATE', entity_type: 'REPORT', entity_id: reportId || '',
      actor_email: report.created_by || '', actor_name: report.author_name || '',
      details: `DOCX SUCC exportado — ${report.mes_referencia} ${report.ano} — ${atividades.length} atividade(s)`,
    });
  } catch (_) {}
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ExportRelatorioMensalDialog({ report, reportId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null); // 'pdf' | 'docx' | null

  const periodoLabel = `${report?.mes_referencia || '—'} / ${report?.ano || 2026}`;

  const handleExport = async (formato) => {
    setOpen(false);
    setLoading(formato);
    try {
      if (formato === 'pdf') {
        await gerarPDFMensal(report, reportId, periodoLabel);
        toast.success('📄 PDF SUCC exportado com sucesso!');
      } else {
        await gerarDOCXMensal(report, reportId, periodoLabel);
        toast.success('📝 DOCX SUCC exportado com sucesso!');
      }
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao exportar ${formato.toUpperCase()}: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!!loading} className="gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        {loading === 'pdf' ? 'Gerando PDF...' : loading === 'docx' ? 'Gerando DOCX...' : 'Exportar'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar Relatório SUCC</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-500">Período: <strong>{periodoLabel}</strong></p>
            <p className="text-xs text-gray-400">Selecione o formato. O documento inclui identificação, atividades, comprovação fotográfica, avaliação e declaração de responsabilidade conforme normas SUCC/FMC-PBH.</p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleExport('pdf')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-black hover:bg-gray-50 transition-all"
              >
                <FileDown className="w-8 h-8 text-red-500" />
                <span className="font-semibold text-sm">PDF</span>
                <span className="text-xs text-gray-400">Impressão / Assinatura</span>
              </button>
              <button
                onClick={() => handleExport('docx')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-black hover:bg-gray-50 transition-all"
              >
                <FileText className="w-8 h-8 text-blue-500" />
                <span className="font-semibold text-sm">DOCX</span>
                <span className="text-xs text-gray-400">Edição / Word</span>
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}