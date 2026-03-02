import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

// ─── helpers ──────────────────────────────────────────────────────────────────

function checkPageBreak(doc, y, needed = 15) {
  if (y + needed > 278) {
    doc.addPage();
    return 20;
  }
  return y;
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 4.5) {
  const lines = doc.splitTextToSize(String(text || ''), maxWidth);
  lines.forEach(line => {
    y = checkPageBreak(doc, y, lineHeight + 2);
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function sectionHeader(doc, title, y, color = [20, 20, 20]) {
  y = checkPageBreak(doc, y, 12);
  doc.setFillColor(...color);
  doc.rect(14, y - 5, 182, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 16, y + 0.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + 10;
}

function lv(doc, label, value, x, y, maxWidth = 80) {
  y = checkPageBreak(doc, y, 10);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(label + ':', x, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  const lines = doc.splitTextToSize(String(value || '—'), maxWidth);
  lines.forEach(line => {
    y = checkPageBreak(doc, y, 5);
    doc.text(line, x, y);
    y += 4.5;
  });
  return y + 1;
}

function addPageHeader(doc, report, pageLabel) {
  const margin = 14;
  doc.setFillColor(245, 245, 245);
  doc.rect(0, 0, 210, 10, 'F');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${report.mes_referencia || ''} ${report.ano || 2026}  |  ${report.author_name || ''}  |  ${pageLabel}`,
    margin, 7
  );
  doc.setTextColor(0, 0, 0);
  return 14;
}

// ─── main component ────────────────────────────────────────────────────────────

export default function ExportPDF({ report, reportId }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    // Validation
    const atividades = Array.isArray(report.atividades) ? report.atividades : [];

    setLoading(true);
    try {
      let attachments = [];
      if (reportId) {
        attachments = await base44.entities.Attachment.filter({ report_id: reportId }, '-created_date');
      }

      const isOfficial = ['APPROVED', 'ARCHIVED'].includes(report.status);
      const isDraft = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED'].includes(report.status);
      const docStatus = isOfficial ? 'DOCUMENTO OFICIAL' : 'RASCUNHO';
      const docStatusColor = isOfficial ? [0, 120, 0] : [180, 80, 0];

      if (attachments.length > 0) {
        toast.info(`${attachments.length} anexo(s) serão incluídos no PDF.`);
      }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 14;
      const contentWidth = 182;
      let y = 20;

      // ── CAPA ──────────────────────────────────────────────────────────────
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, 210, 60, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('MUSEUS CENTRO', margin, 25);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Relatório Mensal Individual — FMC/PBH', margin, 35);
      doc.setFontSize(10);
      doc.text(`${report.mes_referencia || ''} / ${report.ano || 2026}`, margin, 43);
      doc.text(`Profissional: ${report.author_name || ''}`, margin, 51);

      // Status stamp
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...docStatusColor);
      doc.text(docStatus, 210 - margin - doc.getTextWidth(docStatus), 51);
      doc.setTextColor(0, 0, 0);
      y = 70;

      // ── SUMÁRIO ───────────────────────────────────────────────────────────
      y = sectionHeader(doc, 'SUMÁRIO EXECUTIVO', y, [50, 50, 50]);

      // Stats
      const totalPublico = atividades.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);

      const porMuseu = {};
      atividades.forEach(a => { if (a.museu) porMuseu[a.museu] = (porMuseu[a.museu] || 0) + 1; });

      const porEquipe = {};
      atividades.forEach(a => { if (a.equipe_responsavel) porEquipe[a.equipe_responsavel] = (porEquipe[a.equipe_responsavel] || 0) + 1; });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total de atividades:`, margin, y); doc.setFont('helvetica', 'normal'); doc.text(String(atividades.length), margin + 50, y); y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text(`Total de público estimado:`, margin, y); doc.setFont('helvetica', 'normal'); doc.text(String(totalPublico), margin + 50, y); y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text(`Quantidade de anexos:`, margin, y); doc.setFont('helvetica', 'normal'); doc.text(String(attachments.length), margin + 50, y); y += 7;

      // Por museu
      const museuEntries = Object.entries(porMuseu);
      if (museuEntries.length > 0) {
        doc.setFont('helvetica', 'bold'); doc.text('Distribuição por museu:', margin, y); y += 5;
        museuEntries.forEach(([museu, count]) => {
          doc.setFont('helvetica', 'normal');
          doc.text(`  ${museu}: ${count} atividade(s)`, margin, y); y += 4.5;
        });
        y += 2;
      }

      // Por equipe
      const equipeEntries = Object.entries(porEquipe);
      if (equipeEntries.length > 0) {
        doc.setFont('helvetica', 'bold'); doc.text('Distribuição por equipe responsável:', margin, y); y += 5;
        equipeEntries.forEach(([equipe, count]) => {
          doc.setFont('helvetica', 'normal');
          doc.text(`  ${equipe}: ${count} atividade(s)`, margin, y); y += 4.5;
        });
        y += 2;
      }

      // Lista de atividades
      y = checkPageBreak(doc, y, 10);
      doc.setFont('helvetica', 'bold'); doc.text('Lista de atividades:', margin, y); y += 5;
      atividades.forEach((a, idx) => {
        y = checkPageBreak(doc, y, 5);
        doc.setFont('helvetica', 'normal');
        const code = `A${String(idx + 1).padStart(2, '0')}`;
        const row = `${code} — ${a.nome || a.titulo || 'Sem nome'} — ${a.data_inicio || '—'} — ${a.museu || '—'} — ${a.equipe_responsavel || '—'}`;
        y = addWrappedText(doc, row, margin + 2, y, contentWidth - 4, 4.5);
      });

      y += 6;

      // ── IDENTIFICAÇÃO ─────────────────────────────────────────────────────
      doc.addPage();
      y = addPageHeader(doc, report, 'Identificação');
      y = sectionHeader(doc, 'IDENTIFICAÇÃO', y);
      y += 2;

      const idPairs = [
        ['Profissional', report.author_name, 'Função', report.funcao],
        ['Museu Principal', report.museu, 'Equipe', report.equipe],
        ['Mês de Referência', `${report.mes_referencia} / ${report.ano}`, 'Status', report.status],
      ];

      idPairs.forEach(([l1, v1, l2, v2]) => {
        const yBefore = y;
        const y1 = lv(doc, l1, v1, margin, y, 78);
        const y2 = lv(doc, l2, v2, margin + 95, yBefore, 78);
        y = Math.max(y1, y2) + 1;
      });

      y += 4;

      // ── RESUMO EXECUTIVO ──────────────────────────────────────────────────
      if (report.resumo_executivo) {
        y = checkPageBreak(doc, y, 20);
        y = sectionHeader(doc, 'RESUMO EXECUTIVO', y);
        y += 2;
        doc.setFontSize(9);
        y = addWrappedText(doc, report.resumo_executivo, margin, y, contentWidth, 5);
        y += 6;
      }

      // ── ATIVIDADES EXECUTADAS ─────────────────────────────────────────────
      doc.addPage();
      y = addPageHeader(doc, report, 'Atividades Executadas');
      y = sectionHeader(doc, `ATIVIDADES EXECUTADAS (${atividades.length})`, y, [20, 20, 80]);
      y += 2;

      atividades.forEach((ativ, idx) => {
        // Each activity may start a new page if not enough space
        if (idx > 0 && y > 180) {
          doc.addPage();
          y = addPageHeader(doc, report, `Atividade ${idx + 1}`);
        }

        const code = `A${String(idx + 1).padStart(2, '0')}`;

        // Activity sub-header
        y = checkPageBreak(doc, y, 12);
        doc.setFillColor(230, 230, 240);
        doc.rect(margin, y - 5, contentWidth, 8, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`${code} — ${ativ.nome || ativ.titulo || 'Sem nome'}`, margin + 2, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        if (ativ.classificacao) {
          doc.text(`[${ativ.classificacao}]`, 210 - margin - doc.getTextWidth(`[${ativ.classificacao}]`), y);
        }
        y += 8;

        // Dados básicos (two-column)
        const basicPairs = [
          ['Data início', ativ.data_inicio, 'Data fim', ativ.data_fim],
          ['Museu / Local', ativ.museu, 'Tipo de ação', ativ.tipo_acao],
          ['Equipe responsável', ativ.equipe_responsavel, 'Público estimado', ativ.publico_estimado],
          ['Produto realizado', ativ.produto_realizado, 'Quantidade', ativ.quantidade_produto],
        ];

        basicPairs.forEach(([l1, v1, l2, v2]) => {
          const yBefore = y;
          const y1 = lv(doc, l1, v1, margin, y, 78);
          const y2 = lv(doc, l2, v2, margin + 95, yBefore, 78);
          y = Math.max(y1, y2) + 1;
        });

        // Classificação condicional: META
        if (ativ.classificacao === 'META') {
          y = checkPageBreak(doc, y, 8);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(20, 20, 120);
          doc.text('▸ Dados da Meta (3º Termo Aditivo)', margin, y); y += 5;
          doc.setTextColor(0, 0, 0);

          const metaPairs = [
            ['Código da Meta', ativ.meta_codigo, 'Status da Meta', ativ.status_meta],
            ['Indicador Previsto', ativ.indicador_previsto, 'Meta Quantitativa', ativ.meta_quantitativa],
            ['Resultado Alcançado', ativ.resultado_alcancado, '', ''],
          ];
          metaPairs.forEach(([l1, v1, l2, v2]) => {
            const yBefore = y;
            const y1 = lv(doc, l1, v1, margin, y, 78);
            const y2 = l2 ? lv(doc, l2, v2, margin + 95, yBefore, 78) : yBefore;
            y = Math.max(y1, y2) + 1;
          });
        }

        // Classificação condicional: ROTINA / EXTRA
        if (ativ.classificacao === 'ROTINA' || ativ.classificacao === 'EXTRA') {
          y = checkPageBreak(doc, y, 8);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(20, 100, 20);
          doc.text('▸ Justificativa Técnica', margin, y); y += 5;
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          y = addWrappedText(doc, ativ.justificativa_tecnica, margin + 2, y, contentWidth - 4, 4.5);
        }

        // Texto livre
        const textFields = [
          ['Objetivo', ativ.objetivo],
          ['Descrição do executado', ativ.descricao_executado],
          ['Equipe envolvida', ativ.equipe_envolvida],
          ['Resultados e impactos', ativ.resultados_impactos],
          ['Problemas', ativ.problemas],
          ['Soluções', ativ.solucoes],
        ];

        textFields.forEach(([label, value]) => {
          if (!value) return;
          y = checkPageBreak(doc, y, 10);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(label + ':', margin, y); y += 4;
          doc.setFont('helvetica', 'normal');
          y = addWrappedText(doc, value, margin + 2, y, contentWidth - 4, 4.5);
        });

        y += 6;
      });

      // ── OPORTUNIDADES ─────────────────────────────────────────────────────
      const oportunidades = report.oportunidades || [];
      if (oportunidades.length > 0) {
        doc.addPage();
        y = addPageHeader(doc, report, 'Oportunidades');
        y = sectionHeader(doc, `OPORTUNIDADES IDENTIFICADAS (${oportunidades.length})`, y);
        y += 2;
        oportunidades.forEach((op, idx) => {
          y = checkPageBreak(doc, y, 12);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`Oportunidade ${idx + 1}`, margin, y); y += 5;
          doc.setFont('helvetica', 'normal');
          if (op.categoria || op.impacto) {
            doc.setFontSize(8);
            doc.text(`Categoria: ${op.categoria || '—'}   |   Impacto: ${op.impacto || '—'}`, margin, y); y += 5;
          }
          if (op.descricao) y = addWrappedText(doc, op.descricao, margin + 2, y, contentWidth - 4, 4.5);
          y += 3;
        });
        y += 3;
      }

      // ── AVALIAÇÃO ─────────────────────────────────────────────────────────
      const hasAvaliacao = report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes;
      if (hasAvaliacao) {
        y = checkPageBreak(doc, y, 20);
        if (y < 50) y = addPageHeader(doc, report, 'Avaliação');
        y = sectionHeader(doc, 'AVALIAÇÃO DO MÊS', y);
        y += 2;
        [
          ['Pontos Positivos', report.avaliacao_pontos_positivos],
          ['Dificuldades', report.avaliacao_desafios],
          ['Sugestões', report.avaliacao_sugestoes],
        ].forEach(([label, value]) => {
          if (!value) return;
          y = checkPageBreak(doc, y, 12);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(label + ':', margin, y); y += 5;
          doc.setFont('helvetica', 'normal');
          y = addWrappedText(doc, value, margin + 2, y, contentWidth - 4, 4.5);
          y += 4;
        });
      }

      // ── ANEXOS ────────────────────────────────────────────────────────────
      if (attachments.length > 0) {
        doc.addPage();
        y = addPageHeader(doc, report, 'Evidências e Anexos');
        y = sectionHeader(doc, `EVIDÊNCIAS / ANEXOS (${attachments.length})`, y, [80, 40, 0]);
        y += 2;
        attachments.forEach((att, idx) => {
          y = checkPageBreak(doc, y, 8);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(`${idx + 1}. ${att.file_name || 'Arquivo'}`, margin, y);
          doc.setFont('helvetica', 'normal');
          const details = `Tipo: ${att.file_type || '—'}  |  Enviado em: ${att.created_date ? att.created_date.substring(0, 10) : '—'}${att.activity_id ? '  |  Vinculado à atividade' : ''}`;
          y += 4;
          doc.setFontSize(7.5);
          doc.text(details, margin + 3, y);
          if (att.file_url) {
            y += 4;
            doc.setTextColor(0, 0, 200);
            doc.textWithLink('Acessar arquivo →', margin + 3, y, { url: att.file_url });
            doc.setTextColor(0, 0, 0);
          }
          y += 6;
        });
      }

      // ── RODAPÉ em todas as páginas ─────────────────────────────────────────
      const now = new Date();
      const geradoEm = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`;
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Museus Centro — ${report.mes_referencia || ''} ${report.ano || 2026} — Gerado em: ${geradoEm}  |  ID: ${reportId || '—'}`, margin, 290);
        doc.text(`Pág. ${p}/${totalPages}`, 210 - margin - 12, 290);
        // Status watermark
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...docStatusColor);
        doc.text(docStatus, 210 - margin - doc.getTextWidth(docStatus), 7);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
      }

      // Audit log — usa action válido do enum
      await base44.entities.AuditLog.create({
        action: 'UPDATE',
        entity_type: 'REPORT',
        entity_id: reportId || '',
        actor_email: report.created_by || '',
        actor_name: report.author_name || '',
        details: `PDF exportado — ${report.mes_referencia} ${report.ano} — ${atividades.length} atividade(s) — ${attachments.length} anexo(s) — Status: ${docStatus}`,
      });

      const safeName = (report.author_name || 'profissional').replace(/\s+/g, '_').toUpperCase();
      const fileName = `MC_RELATORIO_${report.ano || 2026}_${(report.mes_referencia || 'MES').toUpperCase()}_${safeName}_${reportId || 'NOVO'}.pdf`;
      doc.save(fileName);
      toast.success('PDF exportado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
      {loading ? 'Gerando PDF...' : 'Exportar PDF'}
    </Button>
  );
}