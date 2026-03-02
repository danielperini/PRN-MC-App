import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(String(text || ''), maxWidth);
  lines.forEach(line => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function sectionHeader(doc, title, y) {
  if (y > 255) { doc.addPage(); y = 20; }
  doc.setFillColor(30, 30, 30);
  doc.rect(14, y - 5, 182, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 16, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

function labelValue(doc, label, value, x, y, maxWidth = 80) {
  if (y > 270) { doc.addPage(); y = 20; }
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(label + ':', x, y);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(String(value || '—'), maxWidth);
  lines.forEach((line, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(line, x, y + 4 + i * 4);
  });
  return y + 4 + lines.length * 4;
}

export default function ExportPDF({ report, reportId }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // Fetch attachments
      let attachments = [];
      if (reportId) {
        attachments = await base44.entities.Attachment.filter({ report_id: reportId }, '-created_date');
      }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      // ── COVER ──────────────────────────────────────────────
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, 210, 50, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('MUSEUS CENTRO', margin, 22);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Relatório Mensal Individual', margin, 32);
      doc.setFontSize(10);
      doc.text(`${report.mes_referencia || ''} ${report.ano || 2026}`, margin, 40);
      doc.setTextColor(0, 0, 0);
      y = 60;

      // ── IDENTIFICAÇÃO ──────────────────────────────────────
      y = sectionHeader(doc, 'IDENTIFICAÇÃO', y);
      y += 4;

      const idFields = [
        ['Profissional', report.author_name],
        ['Função', report.funcao],
        ['Museu Principal', report.museu],
        ['Equipe', report.equipe],
        ['Mês de Referência', `${report.mes_referencia} / ${report.ano}`],
        ['Status', report.status],
      ];

      // Two-column layout
      for (let i = 0; i < idFields.length; i += 2) {
        const [l1, v1] = idFields[i];
        const [l2, v2] = idFields[i + 1] || [];
        const yBefore = y;
        const y1 = labelValue(doc, l1, v1, margin, y, 80);
        if (l2) {
          const y2 = labelValue(doc, l2, v2, margin + 95, yBefore, 80);
          y = Math.max(y1, y2) + 2;
        } else {
          y = y1 + 2;
        }
      }
      y += 4;

      // ── RESUMO EXECUTIVO ──────────────────────────────────
      if (report.resumo_executivo) {
        y = sectionHeader(doc, 'RESUMO EXECUTIVO', y);
        y += 4;
        doc.setFontSize(9);
        y = addWrappedText(doc, report.resumo_executivo, margin, y, contentWidth, 5);
        y += 6;
      }

      // ── ATIVIDADES EXECUTADAS ─────────────────────────────
      const atividades = report.atividades || [];
      if (atividades.length > 0) {
        y = sectionHeader(doc, `ATIVIDADES EXECUTADAS (${atividades.length})`, y);
        y += 4;

        atividades.forEach((ativ, idx) => {
          if (y > 260) { doc.addPage(); y = 20; }

          // Atividade sub-header
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, y - 4, contentWidth, 7, 'F');
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`Atividade ${idx + 1}${ativ.nome ? ' — ' + ativ.nome : ''}`, margin + 2, y);
          doc.setFont('helvetica', 'normal');
          y += 7;

          const fields = [
            ['Data início', ativ.data_inicio],
            ['Data fim', ativ.data_fim],
            ['Museu / Local', ativ.museu],
            ['Tipo de ação', ativ.tipo_acao],
            ['Equipe responsável', ativ.equipe_responsavel],
            ['Público estimado', ativ.publico_estimado],
            ['Produto realizado', ativ.produto_realizado],
            ['Quantidade', ativ.quantidade_produto],
          ];

          for (let i = 0; i < fields.length; i += 2) {
            const [l1, v1] = fields[i];
            const [l2, v2] = fields[i + 1] || [];
            const yBefore = y;
            const y1 = labelValue(doc, l1, v1, margin, y, 78);
            if (l2) {
              const y2 = labelValue(doc, l2, v2, margin + 95, yBefore, 78);
              y = Math.max(y1, y2) + 1;
            } else {
              y = y1 + 1;
            }
          }

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
            if (y > 268) { doc.addPage(); y = 20; }
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(label + ':', margin, y);
            doc.setFont('helvetica', 'normal');
            y += 4;
            y = addWrappedText(doc, value, margin + 2, y, contentWidth - 4, 4.5);
          });

          y += 4;
        });
      }

      // ── OPORTUNIDADES ────────────────────────────────────
      const oportunidades = report.oportunidades || [];
      if (oportunidades.length > 0) {
        y = sectionHeader(doc, `OPORTUNIDADES IDENTIFICADAS (${oportunidades.length})`, y);
        y += 4;
        oportunidades.forEach((op, idx) => {
          if (y > 268) { doc.addPage(); y = 20; }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`Oportunidade ${idx + 1}`, margin, y);
          doc.setFont('helvetica', 'normal');
          y += 5;
          if (op.categoria || op.impacto) {
            doc.setFontSize(8);
            doc.text(`Categoria: ${op.categoria || '—'}   |   Impacto: ${op.impacto || '—'}`, margin, y);
            y += 5;
          }
          if (op.descricao) {
            y = addWrappedText(doc, op.descricao, margin + 2, y, contentWidth - 4, 4.5);
          }
          y += 3;
        });
        y += 3;
      }

      // ── AVALIAÇÃO ─────────────────────────────────────────
      const hasAvaliacao = report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes;
      if (hasAvaliacao) {
        y = sectionHeader(doc, 'AVALIAÇÃO DO MÊS', y);
        y += 4;
        const avalFields = [
          ['Pontos Positivos', report.avaliacao_pontos_positivos],
          ['Dificuldades', report.avaliacao_desafios],
          ['Sugestões', report.avaliacao_sugestoes],
        ];
        avalFields.forEach(([label, value]) => {
          if (!value) return;
          if (y > 268) { doc.addPage(); y = 20; }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(label + ':', margin, y);
          doc.setFont('helvetica', 'normal');
          y += 5;
          y = addWrappedText(doc, value, margin + 2, y, contentWidth - 4, 4.5);
          y += 4;
        });
      }

      // ── ANEXOS ────────────────────────────────────────────
      if (attachments.length > 0) {
        if (y > 255) { doc.addPage(); y = 20; }
        y = sectionHeader(doc, `ANEXOS (${attachments.length})`, y);
        y += 4;
        attachments.forEach((att, idx) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(`${idx + 1}. `, margin, y);
          doc.setFont('helvetica', 'normal');
          doc.text(att.file_name || 'Arquivo', margin + 6, y);
          if (att.file_url) {
            doc.setTextColor(0, 0, 200);
            doc.textWithLink('(abrir)', margin + 6 + doc.getTextWidth(att.file_name || 'Arquivo') + 2, y, { url: att.file_url });
            doc.setTextColor(0, 0, 0);
          }
          y += 5;
        });
      }

      // ── FOOTER on last page ───────────────────────────────
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Museus Centro — Relatório Mensal Individual ${report.mes_referencia || ''} ${report.ano || 2026}`, margin, 290);
        doc.text(`Página ${p} / ${totalPages}`, pageWidth - margin - 18, 290);
        doc.setTextColor(0, 0, 0);
      }

      const fileName = `relatorio_${(report.mes_referencia || 'mensal').toLowerCase()}_${report.ano || 2026}_${(report.author_name || 'profissional').replace(/\s+/g, '_').toLowerCase()}.pdf`;
      doc.save(fileName);
      toast.success('PDF exportado com sucesso');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar PDF');
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