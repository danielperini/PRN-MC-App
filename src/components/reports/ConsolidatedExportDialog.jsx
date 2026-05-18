import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

// ── helpers ───────────────────────────────────────────────────────────────────
const M = 14;
const CW = 182;
const PH = 287;
const FH = 8;

function safeName(str) {
  return String(str || '').replace(/\s+/g, '_').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9_]/g, '');
}

function checkBreak(doc, y, needed = 12) {
  if (y + needed > PH - FH) { doc.addPage(); return 18; }
  return y;
}

function wrap(doc, text, x, y, maxW, lh = 4.2) {
  const lines = doc.splitTextToSize(String(text || '—'), maxW);
  lines.forEach(line => { y = checkBreak(doc, y, lh + 1); doc.text(line, x, y); y += lh; });
  return y;
}

function secHeader(doc, title, y, accent = [30, 30, 30]) {
  y = checkBreak(doc, y, 10);
  doc.setFillColor(...accent);
  doc.rect(M, y - 4, 3, 7, 'F');
  doc.setFillColor(245, 245, 245);
  doc.rect(M + 3, y - 4, CW - 3, 7, 'F');
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text(title, M + 6, y + 0.5);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  return y + 8;
}

function getAttachmentUrl(att = {}) {
  return att.file_url || att.url || att.download_url || att.arquivo_url || att.public_url || att.file?.url || '';
}

function isImage(fileType, fileName = '') {
  const source = `${fileType || ''} ${fileName || ''}`.trim();
  return /image\//i.test(source) || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(source);
}

function getImageFormat(dataUrl = '') {
  if (/^data:image\/png/i.test(dataUrl)) return 'PNG';
  if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP';
  return 'JPEG';
}

function drawPhotoFallback(doc, x, y, w, h, att = {}) {
  doc.setDrawColor(210, 210, 210);
  doc.setFillColor(248, 248, 248);
  doc.rect(x, y, w, h, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text('Imagem não incorporada', x + w / 2, y + h / 2 - 2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(130, 130, 130);
  doc.text('Arquivo disponível no link', x + w / 2, y + h / 2 + 3, { align: 'center' });
  const url = getAttachmentUrl(att);
  if (url) {
    doc.setTextColor(0, 80, 180);
    doc.textWithLink('Abrir imagem', x + w / 2, y + h / 2 + 9, { url, align: 'center' });
  }
}

async function fetchImageBlob(url) {
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'no-store', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob || !/^image\//i.test(blob.type || '')) return null;
    return blob;
  } catch (_) {
    return null;
  }
}

function readBlobAsDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function normalizeImageToDataUrl(dataUrl, quality = 0.82) {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 1400;
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * ratio));
        canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * ratio));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (_) {
        resolve(dataUrl.startsWith('data:image/') ? dataUrl : null);
      }
    };
    img.onerror = () => resolve(dataUrl.startsWith('data:image/') ? dataUrl : null);
    img.src = dataUrl;
  });
}

async function loadImageAsBase64(url) {
  if (!url) return null;

  const blob = await fetchImageBlob(url);
  if (blob) {
    const blobDataUrl = await readBlobAsDataURL(blob);
    const normalized = await normalizeImageToDataUrl(blobDataUrl);
    if (normalized) return normalized;
  }

  return new Promise((resolve) => {
    const img = new Image();
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      resolve(value);
    };

    const timeout = setTimeout(() => done(null), 12000);
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const maxSide = 1400;
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * ratio));
        canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * ratio));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/jpeg', 0.82));
      } catch (_) {
        done(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timeout);
      done(null);
    };
    img.src = url;
  });
}

const STATUS_LABELS = {
  DRAFT: 'Rascunho', SUBMITTED: 'Enviado', IN_REVIEW: 'Em revisão',
  RETURNED: 'Devolvido', APPROVED: 'Aprovado', ARCHIVED: 'Arquivado',
};
const STATUS_COLORS = {
  APPROVED: [0, 110, 0], ARCHIVED: [0, 80, 0], RETURNED: [150, 60, 0],
  SUBMITTED: [0, 80, 160], IN_REVIEW: [100, 50, 0], DRAFT: [100, 100, 100],
};

// ── main component ────────────────────────────────────────────────────────────
export default function ConsolidatedExportDialog({ open, onClose, currentReport, currentReportId, currentUser }) {
  const [generating, setGenerating] = useState(false);
  const [options, setOptions] = useState({
    incluirResumo: true,
    incluirAtividades: true,
    incluirFotos: true,
    incluirAnexos: true,
    incluirAvaliacao: true,
    incluirAprovacao: true,
    incluirAssinatura: true,
  });

  const toggle = (key) => setOptions(p => ({ ...p, [key]: !p[key] }));

  const userEmail = currentUser?.email || currentReport?.created_by;
  const mes = currentReport?.mes_referencia;
  const ano = currentReport?.ano;

  const { data: allReports = [], isLoading } = useQuery({
    queryKey: ['consolidated-reports', userEmail, mes, ano],
    queryFn: async () => {
      if (!userEmail || !mes || !ano) return [];
      const reports = await base44.entities.Report.filter({
        mes_referencia: mes,
        ano: Number(ano),
      });
      return reports.filter(r => r.created_by === userEmail || r.author_name === currentReport?.author_name);
    },
    enabled: open && !!userEmail && !!mes && !!ano,
    staleTime: 30000,
  });

  const handleGenerate = async () => {
    if (allReports.length === 0) {
      toast.error('Nenhum relatório encontrado para este mês.');
      return;
    }
    setGenerating(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const now = new Date();
      const geradoEm = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const authorName = currentReport?.author_name || currentUser?.full_name || '';
      const periodoLabel = `${mes} / ${ano}`;

      // ── CAPA ──────────────────────────────────────────────────────────────
      doc.setFillColor(12, 12, 12);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20); doc.setFont('helvetica', 'bold');
      doc.text('MUSEUS CENTRO', M + 4, 16);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
      doc.text('RELATÓRIO MENSAL CONSOLIDADO  ·  FMC / PBH', M + 4, 24);
      doc.setFillColor(230, 230, 230);
      doc.rect(0, 40, 210, 7, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
      doc.text(`Profissional: ${authorName}   ·   Período: ${periodoLabel}   ·   Gerado em: ${geradoEm}   ·   ${allReports.length} relatório(s)`, M, 45);
      doc.setTextColor(0, 0, 0);

      let y = 56;

      // ── ÍNDICE ────────────────────────────────────────────────────────────
      y = secHeader(doc, 'ÍNDICE DE RELATÓRIOS DO MÊS', y);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      allReports.forEach((r, i) => {
        y = checkBreak(doc, y, 6);
        const status = STATUS_LABELS[r.status] || r.status;
        doc.text(`Mês ${String(i + 1).padStart(2, '0')}  —  ${r.numero_protocolo || '(sem protocolo)'}  —  Status: ${status}`, M + 2, y);
        y += 5.5;
      });
      y += 4;

      // ── CADA RELATÓRIO ────────────────────────────────────────────────────
      for (let ri = 0; ri < allReports.length; ri++) {
        const r = allReports[ri];
        const label = `MÊS ${String(ri + 1).padStart(2, '0')}`;
        const statusColor = STATUS_COLORS[r.status] || [100, 100, 100];
        const statusLabel = STATUS_LABELS[r.status] || r.status;

        // Load attachments
        let attachments = [];
        try {
          attachments = await base44.entities.Attachment.filter({ report_id: r.id }, '-created_date');
        } catch (_) {}

        // Section divider
        doc.addPage();
        y = 15;
        doc.setFillColor(30, 30, 30);
        doc.rect(0, 0, 210, 14, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text(label, M, 9);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180);
        doc.text(`${r.numero_protocolo || ''}   ·   ${periodoLabel}`, M + 30, 9);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...statusColor.map(v => Math.max(v + 100, 180)));
        const sw = doc.getTextWidth(statusLabel);
        doc.text(statusLabel, 210 - M - sw, 9);
        doc.setTextColor(0, 0, 0);
        y = 20;

        // Identification grid
        const idGrid = [
          ['Profissional', r.author_name], ['Função', r.funcao],
          ['Museu', r.museu], ['Equipe', r.equipe || '—'],
          ['Período', periodoLabel], ['Status', statusLabel],
        ];
        doc.setFillColor(250, 250, 250);
        doc.rect(M, y - 2, CW, 28, 'F');
        doc.setDrawColor(220, 220, 220);
        doc.rect(M, y - 2, CW, 28, 'S');
        const colW3 = CW / 3;
        idGrid.forEach(([label2, value], i) => {
          const col = i % 3; const row = Math.floor(i / 3);
          const gx = M + col * colW3 + 3; const gy = y + row * 13;
          doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
          doc.text(label2.toUpperCase(), gx, gy + 1.5);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(10, 10, 10);
          doc.text(String(value || '—').substring(0, 24), gx, gy + 7.5);
        });
        y += 32;

        // Stats strip
        const atividades = Array.isArray(r.atividades) ? r.atividades : [];
        const totalPub = atividades.reduce((s, a) => s + (Number(a.publico_estimado) || 0) * (Number(a.quantas_vezes_ocorreu) || 1), 0);
        const stats = [['Atividades', atividades.length], ['Público', totalPub || '—'], ['Anexos', attachments.length]];
        const statW = CW / stats.length;
        doc.setFillColor(12, 12, 12);
        doc.rect(M, y, CW, 14, 'F');
        stats.forEach(([lbl, val], i) => {
          const sx = M + i * statW + statW / 2;
          doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
          doc.text(String(val), sx, y + 7.5, { align: 'center' });
          doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(140, 140, 140);
          doc.text(lbl.toUpperCase(), sx, y + 12, { align: 'center' });
        });
        y += 18;

        // Resumo executivo
        if (options.incluirResumo && r.resumo_executivo) {
          y = checkBreak(doc, y, 16);
          y = secHeader(doc, 'RESUMO EXECUTIVO', y);
          doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          y = wrap(doc, r.resumo_executivo, M, y, CW, 4.5);
          y += 4;
        }

        // Atividades
        if (options.incluirAtividades && atividades.length > 0) {
          y = checkBreak(doc, y, 16);
          y = secHeader(doc, `ATIVIDADES (${atividades.length})`, y);

          // Table header
          doc.setFillColor(235, 235, 235);
          doc.rect(M, y - 3, CW, 6, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(50, 50, 50);
          doc.text('#', M + 2, y + 0.5); doc.text('Nome', M + 10, y + 0.5);
          doc.text('Classificação', M + 95, y + 0.5); doc.text('Museu', M + 130, y + 0.5);
          doc.text('Público', M + 162, y + 0.5);
          y += 5;

          atividades.forEach((a, idx) => {
            y = checkBreak(doc, y, 8);
            if (idx % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(M, y - 3, CW, 6, 'F'); }
            const cl = a.classificacao || '—';
            const clColor = cl === 'META' ? [20, 60, 150] : cl === 'ROTINA' ? [20, 100, 40] : [150, 60, 20];
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
            doc.text(`A${String(idx + 1).padStart(2, '0')}`, M + 2, y + 0.5);
            doc.text(doc.splitTextToSize(a.nome || a.titulo || '—', 80)[0], M + 10, y + 0.5);
            doc.setTextColor(...clColor); doc.setFont('helvetica', 'bold');
            doc.text(cl, M + 95, y + 0.5);
            doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
            doc.text(String(a.museu || '—').substring(0, 14), M + 130, y + 0.5);
            doc.text(String(a.publico_estimado || '—'), M + 162, y + 0.5);
            y += 6;

            // Justificativa técnica inline
            if (a.justificativa_tecnica) {
              doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
              y = wrap(doc, `↳ ${a.justificativa_tecnica}`, M + 10, y, CW - 12, 4);
              y += 1;
            }
          });
          y += 4;
        }

        // Fotos/thumbnails
        if (options.incluirFotos && attachments.some(a => isImage(a.file_type, a.file_name))) {
          const imgAtts = attachments.filter(a => isImage(a.file_type, a.file_name));
          y = checkBreak(doc, y, 20);
          y = secHeader(doc, `REGISTROS FOTOGRÁFICOS (${imgAtts.length})`, y, [80, 40, 0]);

          const imageData = {};
          await Promise.all(imgAtts.map(async att => {
            const url = getAttachmentUrl(att);
            const b64 = await loadImageAsBase64(url);
            if (b64) imageData[att.id || url || att.file_name] = b64;
          }));

          const thumbW = 55; const thumbH = 38; const cols = 3; const gap = 4;

          y = checkBreak(doc, y, thumbH + 16);
          imgAtts.forEach((att, i) => {
            const col = i % cols;
            if (col === 0 && i > 0) y = checkBreak(doc, y, thumbH + 16);
            const tx = M + col * (thumbW + gap);
            const ty = y;
            const url = getAttachmentUrl(att);
            const dataKey = att.id || url || att.file_name;
            const dataUrl = imageData[dataKey];

            doc.setDrawColor(200, 200, 200);
            doc.rect(tx, ty, thumbW, thumbH, 'S');

            if (dataUrl) {
              try {
                doc.addImage(dataUrl, getImageFormat(dataUrl), tx, ty, thumbW, thumbH, undefined, 'MEDIUM');
              } catch (_) {
                drawPhotoFallback(doc, tx, ty, thumbW, thumbH, att);
              }
            } else {
              drawPhotoFallback(doc, tx, ty, thumbW, thumbH, att);
            }

            doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
            const displayName = String(att.file_name || 'Registro fotográfico').substring(0, 22);
            if (url) {
              doc.textWithLink(displayName, tx, ty + thumbH + 3.5, { url });
            } else {
              doc.text(displayName, tx, ty + thumbH + 3.5);
            }

            // Link to activity if present
            if (att.activity_id) {
              const actIdx = atividades.findIndex(a => a.id === att.activity_id || a.programacao_id === att.activity_id);
              if (actIdx >= 0) doc.text(`A${String(actIdx + 1).padStart(2, '0')}`, tx + thumbW - 8, ty + thumbH + 3.5);
            }
            if (col === cols - 1 || i === imgAtts.length - 1) y += thumbH + 10;
          });
          y += 4;
        }

        // Anexos
        if (options.incluirAnexos && attachments.length > 0) {
          y = checkBreak(doc, y, 14);
          y = secHeader(doc, `LISTA DE ANEXOS (${attachments.length})`, y);
          doc.setFontSize(7);
          attachments.forEach((att, idx) => {
            y = checkBreak(doc, y, 8);
            if (idx % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(M, y - 3, CW, 7, 'F'); }
            doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
            doc.text(`${idx + 1}.  ${String(att.file_name || 'Arquivo').substring(0, 52)}`, M + 2, y + 0.5);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(100, 100, 100);
            const sz = att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : '';
            doc.text([att.file_type || '', sz, att.created_date?.substring(0, 10) || ''].filter(Boolean).join('  ·  '), M + 2, y + 4.5);
            if (att.file_url) { doc.setTextColor(0, 80, 180); doc.textWithLink('Acessar →', 210 - M - 16, y + 0.5, { url: att.file_url }); }
            doc.setTextColor(0, 0, 0); doc.setFontSize(7);
            y += 8;
          });
          y += 3;
        }

        // Avaliação
        if (options.incluirAvaliacao && (r.avaliacao_pontos_positivos || r.avaliacao_desafios || r.avaliacao_sugestoes)) {
          y = checkBreak(doc, y, 14);
          y = secHeader(doc, 'AVALIAÇÃO DO MÊS', y);
          const avItems = [
            ['Pontos Positivos', r.avaliacao_pontos_positivos, [20, 100, 40]],
            ['Dificuldades', r.avaliacao_desafios, [160, 60, 20]],
            ['Sugestões', r.avaliacao_sugestoes, [20, 60, 150]],
          ];
          avItems.forEach(([lbl, val, color]) => {
            if (!val) return;
            y = checkBreak(doc, y, 10);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...color);
            doc.text(lbl + ':', M, y); y += 4;
            doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
            y = wrap(doc, val, M + 3, y, CW - 5, 4.2);
            y += 3;
          });
        }

        // Aprovação / retorno coordenador
        if (options.incluirAprovacao) {
          const isApproved = r.status === 'APPROVED' || r.status === 'ARCHIVED';
          const isReturned = r.status === 'RETURNED';
          y = checkBreak(doc, y, 18);
          if (isApproved) {
            doc.setFillColor(230, 250, 230); doc.setDrawColor(100, 180, 100);
            doc.rect(M, y, CW, 18, 'F'); doc.rect(M, y, CW, 18, 'S');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(0, 120, 0);
            doc.text('✓ RELATÓRIO APROVADO', M + 4, y + 6);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
            const dt = r.updated_date ? new Date(r.updated_date).toLocaleDateString('pt-BR') : '—';
            doc.text(`Data: ${dt}   ·   Coordenador(a): ${r.reviewer_name || '—'}`, M + 4, y + 12);
            y += 22;
          } else if (isReturned) {
            doc.setFillColor(255, 240, 235); doc.setDrawColor(200, 100, 60);
            doc.rect(M, y, CW, 18, 'F'); doc.rect(M, y, CW, 18, 'S');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(160, 60, 0);
            doc.text('⚠ RELATÓRIO DEVOLVIDO PARA REVISÃO', M + 4, y + 6);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
            const comment = r.return_comment ? doc.splitTextToSize(`Comentário: ${r.return_comment}`, CW - 10)[0] : '';
            if (comment) doc.text(comment, M + 4, y + 12);
            doc.text(`Coordenador(a): ${r.reviewer_name || '—'}`, M + 4, y + 16);
            y += 22;
          } else {
            doc.setFillColor(240, 244, 255); doc.setDrawColor(180, 195, 235);
            doc.rect(M, y, CW, 12, 'F'); doc.rect(M, y, CW, 12, 'S');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(20, 60, 150);
            doc.text(`Status: ${statusLabel}   ·   Aguardando aprovação do coordenador`, M + 4, y + 7);
            y += 16;
          }
        }
      }

      // ── ASSINATURA ─────────────────────────────────────────────────────────
      if (options.incluirAssinatura) {
        doc.addPage();
        y = 18;
        y = secHeader(doc, 'DECLARAÇÃO E ASSINATURA', y, [30, 30, 30]);
        y += 2;
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
        const decl = `Eu, ${authorName || '___________________________'}, declaro que as informações registradas neste Relatório Mensal são verídicas, completas e de minha inteira responsabilidade, referentes ao mês de ${mes} de ${ano}, nos termos do Contrato de Gestão com a Fundação Municipal de Cultura de Belo Horizonte (FMC/PBH).`;
        y = wrap(doc, decl, M, y, CW, 5);
        y += 10;

        const boxW = 82;
        const boxGap = CW - 2 * boxW;
        doc.setDrawColor(100, 100, 100);
        doc.line(M, y, M + boxW, y);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
        doc.text(authorName || 'Profissional', M, y + 5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
        doc.text(`${currentReport?.funcao || ''}   ·   ${currentReport?.museu || ''}`, M, y + 9);
        doc.text(`${mes} / ${ano}`, M, y + 13);
        doc.text('Data: _____ / _____ / __________', M, y + 18);

        const cx = M + boxW + boxGap;
        doc.setDrawColor(100, 100, 100);
        doc.line(cx, y, cx + boxW, y);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
        doc.text(currentReport?.reviewer_name || 'Coordenador(a) Responsável', cx, y + 5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
        doc.text('Coordenação — Museus Centro / FMC-PBH', cx, y + 9);
        doc.text('Data: _____ / _____ / __________', cx, y + 18);
        y += 28;

        doc.setFillColor(255, 251, 235); doc.setDrawColor(217, 180, 60);
        doc.rect(M, y + 4, CW, 28, 'F'); doc.rect(M, y + 4, CW, 28, 'S');
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 80, 0);
        doc.text('✦  COMO TORNAR ESTE DOCUMENTO VÁLIDO', M + 4, y + 12);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(60, 40, 0);
        doc.text('Opção 1 — Impressão e assinatura manual:', M + 4, y + 18);
        doc.setTextColor(40, 40, 40);
        doc.text('Imprima, assine à mão nos campos acima e entregue ao coordenador para arquivo físico.', M + 4, y + 23);
        doc.setTextColor(60, 40, 0);
        doc.text('Opção 2 — Assinatura digital (recomendado):', M + 4, y + 28);
        doc.setTextColor(40, 40, 40);
        doc.text('Use Adobe Acrobat ou GOV.BR para adicionar assinatura digital certificada.', M + 4, y + 33);
      }

      // ── RODAPÉ ────────────────────────────────────────────────────────────
      const totalPages = doc.internal.pages.length - 1;
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(200, 200, 200);
        doc.line(M, PH - FH + 1, 210 - M, PH - FH + 1);
        doc.setFontSize(6); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
        doc.text(`Museus Centro — FMC/PBH  |  ${periodoLabel}  |  ${authorName}  |  Gerado: ${geradoEm}`, M, PH - 2);
        doc.text(`${p}/${totalPages}`, 210 - M, PH - 2, { align: 'right' });
      }

      // ── SALVAR ────────────────────────────────────────────────────────────
      const safeAuthor = safeName(authorName);
      const safeMes = safeName(mes);
      const numRelatorio = String(allReports.findIndex(r => r.id === currentReportId) + 1 || 1).padStart(2, '0');
      doc.save(`${safeAuthor}_${safeMes}-${ano}_RELATORIO-${numRelatorio}.pdf`);
      toast.success('PDF gerado com sucesso!');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar PDF: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const optionsList = [
    { key: 'incluirResumo', label: 'Resumo executivo' },
    { key: 'incluirAtividades', label: 'Tabela de atividades com detalhes' },
    { key: 'incluirFotos', label: 'Miniaturas de fotos vinculadas' },
    { key: 'incluirAnexos', label: 'Lista completa de anexos' },
    { key: 'incluirAvaliacao', label: 'Avaliação do mês (pontos, dificuldades, sugestões)' },
    { key: 'incluirAprovacao', label: 'Status de aprovação e comentário do coordenador' },
    { key: 'incluirAssinatura', label: 'Página de declaração e assinatura' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5" />
            Exportar Relatório Consolidado do Mês
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {mes} / {ano} — {isLoading ? 'Carregando...' : `${allReports.length} relatório(s) encontrado(s)`}
          </p>
        </DialogHeader>

        {!isLoading && allReports.length > 0 && (
          <div className="space-y-1 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
            {allReports.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between">
                <span className="font-medium text-gray-700">
                  Mês {String(i + 1).padStart(2, '0')} — {r.numero_protocolo || r.id?.substring(0, 8)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {STATUS_LABELS[r.status] || r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm font-semibold text-gray-900">Incluir no PDF:</p>
          <div className="space-y-2.5">
            {optionsList.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <Checkbox
                  id={key}
                  checked={options[key]}
                  onCheckedChange={() => toggle(key)}
                />
                <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Nome do arquivo: <code className="bg-gray-100 px-1 rounded">
            {safeName(currentReport?.author_name || '')}_{safeName(mes || '')}-{ano}_RELATORIO-
            {String(allReports.findIndex(r => r.id === currentReportId) + 1 || 1).padStart(2, '0')}.pdf
          </code>
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={generating}>Cancelar</Button>
          <Button
            className="bg-black hover:bg-gray-800 text-white gap-2"
            onClick={handleGenerate}
            disabled={generating || isLoading || allReports.length === 0}
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</>
            ) : (
              <><FileDown className="w-4 h-4" />Gerar PDF</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
