import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

const M = 14;
const CW = 182;
const PH = 287;
const FOOTER_H = 9;

const META_LABELS = {
  'MC3A-20': 'Meta 20 — Ação Educativa',
  'MC3A-21': 'Meta 21 — Exposição / Produção Cultural',
  'MC3A-22': 'Meta 22 — Comunicação e Divulgação',
  'MC3A-23': 'Meta 23 — Noturno nos Museus 2026',
  'MC3A-24': 'Meta 24 — Emenda Parlamentar',
  'MC3A-25': 'Meta 25 — Outras Ações',
  'MC3A-EXTRA': 'Ações Extras',
};

function checkBreak(doc, y, needed = 12) {
  if (y + needed > PH - FOOTER_H) { doc.addPage(); return 18; }
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
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(title, M + 6, y + 0.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function addFooter(doc, periodoLabel, geradoEm) {
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PH - FOOTER_H + 1, 210 - M, PH - FOOTER_H + 1);
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(`Museus Centro — FMC/PBH  |  ${periodoLabel}  |  Gerado: ${geradoEm}  |  Relatório por Meta — Físico e Financeiro`, M, PH - 2);
    doc.text(`${p}/${total}`, 210 - M, PH - 2, { align: 'right' });
  }
}

export default function MetaReportExport({ metaData, totals, periodoLabel }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const geradoEm = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      // ── CAPA ─────────────────────────────────────────────────────────────
      doc.setFillColor(12, 12, 12);
      doc.rect(0, 0, 210, 32, 'F');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 31.5, 210, 0.5, 'F');
      doc.setFillColor(220, 220, 220);
      doc.rect(M, 6, 0.5, 20, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('MUSEUS CENTRO', M + 5, 14);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text('RELATÓRIO FÍSICO E FINANCEIRO POR META  ·  FUNDAÇÃO MUNICIPAL DE CULTURA / PBH', M + 5, 21);

      // Protocol row
      doc.setFillColor(230, 230, 230);
      doc.rect(0, 32, 210, 7, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`Período: ${periodoLabel}   ·   Gerado em: ${geradoEm}   ·   3º Termo Aditivo — Contrato de Gestão FMC/PBH`, M, 37);

      let y = 44;

      // ── TOTAIS GERAIS ─────────────────────────────────────────────────────
      const stats = [
        ['Atividades / Meta', totals.atividades],
        ['Público Total', totals.publico.toLocaleString('pt-BR')],
        ['Solicitado', `R$ ${fmt(totals.solicitado)}`],
        ['Aprovado', `R$ ${fmt(totals.aprovado)}`],
        ['Pago', `R$ ${fmt(totals.pago)}`],
      ];
      const statW = CW / stats.length;
      doc.setFillColor(12, 12, 12);
      doc.rect(M, y, CW, 18, 'F');
      doc.setDrawColor(50, 50, 50);
      for (let i = 1; i < stats.length; i++) doc.line(M + i * statW, y + 2, M + i * statW, y + 16);
      stats.forEach(([label, value], i) => {
        const sx = M + i * statW + statW / 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(String(value), sx, y + 10, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(140, 140, 140);
        doc.text(label.toUpperCase(), sx, y + 15.5, { align: 'center' });
      });
      y += 24;

      // ── UMA SEÇÃO POR META ────────────────────────────────────────────────
      for (const md of metaData) {
        y = checkBreak(doc, y, 20);
        const fullLabel = META_LABELS[md.meta] || md.meta;

        // Meta header bar
        doc.setFillColor(30, 30, 30);
        doc.rect(M, y - 4, CW, 10, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(md.meta, M + 3, y + 1.5);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 180, 180);
        doc.text(fullLabel.replace(md.meta + ' — ', ''), M + 3 + doc.getTextWidth(md.meta) + 4, y + 1.5);
        y += 12;

        // KPIs row
        const kpis = [
          ['Atividades', md.atividades.length],
          ['Ocorrências', md.totalOcorrencias],
          ['Público Total', md.totalPublico.toLocaleString('pt-BR')],
          ['Solicitado', `R$ ${fmt(md.totalSolicitado)}`],
          ['Aprovado', `R$ ${fmt(md.totalAprovado)}`],
          ['Pago', `R$ ${fmt(md.totalPago)}`],
        ];
        const kpiW = CW / kpis.length;
        doc.setFillColor(248, 248, 248);
        doc.rect(M, y - 2, CW, 14, 'F');
        doc.setDrawColor(230, 230, 230);
        doc.rect(M, y - 2, CW, 14, 'S');
        for (let i = 1; i < kpis.length; i++) doc.line(M + i * kpiW, y - 2, M + i * kpiW, y + 12);

        kpis.forEach(([label, value], i) => {
          const sx = M + i * kpiW + kpiW / 2;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          doc.text(String(value || '—'), sx, y + 6, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(130, 130, 130);
          doc.text(label.toUpperCase(), sx, y + 11, { align: 'center' });
        });
        y += 18;

        // Financial bars
        if (md.totalSolicitado > 0) {
          const aprvPct = Math.min((md.totalAprovado / md.totalSolicitado) * 100, 100);
          const pagoPct = Math.min((md.totalPago / md.totalSolicitado) * 100, 100);

          doc.setFontSize(6);
          doc.setTextColor(100, 100, 100);
          doc.text(`Aprovado ${aprvPct.toFixed(0)}%`, M, y);
          doc.setFillColor(235, 235, 245);
          doc.rect(M + 22, y - 3, CW - 22, 3.5, 'F');
          doc.setFillColor(100, 80, 200);
          doc.rect(M + 22, y - 3, (CW - 22) * aprvPct / 100, 3.5, 'F');
          y += 5;

          doc.text(`Pago      ${pagoPct.toFixed(0)}%`, M, y);
          doc.setFillColor(235, 245, 235);
          doc.rect(M + 22, y - 3, CW - 22, 3.5, 'F');
          doc.setFillColor(34, 170, 100);
          doc.rect(M + 22, y - 3, (CW - 22) * pagoPct / 100, 3.5, 'F');
          y += 8;
        }

        // ── ATIVIDADES TABLE ─────────────────────────────────────────────
        if (md.atividades.length > 0) {
          y = checkBreak(doc, y, 14);
          doc.setFillColor(240, 240, 240);
          doc.rect(M, y - 3, CW, 6, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(40, 40, 40);
          doc.text('ATIVIDADES FÍSICAS', M + 2, y + 0.5);
          y += 6;

          // Table header
          doc.setFillColor(250, 250, 250);
          doc.rect(M, y - 2, CW, 5.5, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(80, 80, 80);
          doc.text('Título', M + 2, y + 1.5);
          doc.text('Museu', M + 90, y + 1.5);
          doc.text('Ocorr.', M + 130, y + 1.5);
          doc.text('Público', M + 148, y + 1.5);
          doc.text('Status Meta', M + 162, y + 1.5);
          y += 6;

          md.atividades.forEach((a, idx) => {
            y = checkBreak(doc, y, 6);
            if (idx % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(M, y - 2.5, CW, 5.5, 'F'); }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(0, 0, 0);
            doc.text(doc.splitTextToSize(a.titulo || '—', 84)[0], M + 2, y + 0.5);
            doc.text(String(a.museu || '—').substring(0, 15), M + 90, y + 0.5);
            doc.text(String(a.quantas_repeticoes || 1), M + 136, y + 0.5);
            const pub = (Number(a.publico_estimado) || 0) * (Number(a.quantas_repeticoes) || 1);
            doc.text(pub ? pub.toLocaleString('pt-BR') : '—', M + 150, y + 0.5);
            if (a.status_meta) {
              const sColor = a.status_meta === 'Cumprida' || a.status_meta === 'Superada' ? [20, 120, 40] : a.status_meta === 'Parcial' ? [150, 100, 0] : [60, 60, 160];
              doc.setTextColor(...sColor);
              doc.setFont('helvetica', 'bold');
            }
            doc.text(String(a.status_meta || '—'), M + 164, y + 0.5);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            y += 5.5;
          });
          y += 4;
        }

        // ── COMPRAS TABLE ────────────────────────────────────────────────
        if (md.compras.length > 0) {
          y = checkBreak(doc, y, 14);
          doc.setFillColor(240, 240, 240);
          doc.rect(M, y - 3, CW, 6, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(40, 40, 40);
          doc.text('EXECUÇÃO FINANCEIRA', M + 2, y + 0.5);
          y += 6;

          doc.setFillColor(250, 250, 250);
          doc.rect(M, y - 2, CW, 5.5, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(80, 80, 80);
          doc.text('Item', M + 2, y + 1.5);
          doc.text('Categoria', M + 80, y + 1.5);
          doc.text('Solicitado', M + 130, y + 1.5);
          doc.text('Aprovado', M + 153, y + 1.5);
          doc.text('Status', M + 172, y + 1.5);
          y += 6;

          md.compras.forEach((c, idx) => {
            y = checkBreak(doc, y, 6);
            if (idx % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(M, y - 2.5, CW, 5.5, 'F'); }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(0, 0, 0);
            doc.text(doc.splitTextToSize(c.descricao_item || '—', 74)[0], M + 2, y + 0.5);
            doc.text(doc.splitTextToSize(c.categoria || '—', 46)[0], M + 80, y + 0.5);
            doc.text(`R$ ${fmt(c.valor_solicitado)}`, M + 130, y + 0.5);
            doc.text(c.valor_aprovado_admin ? `R$ ${fmt(c.valor_aprovado_admin)}` : '—', M + 153, y + 0.5);

            const isPago = c.status === 'PAGO';
            const isRec = c.status === 'RECUSADO';
            const stColor = isPago ? [20, 120, 40] : isRec ? [180, 30, 30] : [60, 60, 140];
            doc.setTextColor(...stColor);
            doc.setFont('helvetica', 'bold');
            doc.text(c.status || '—', M + 172, y + 0.5);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            y += 5.5;
          });

          // Subtotal row
          y = checkBreak(doc, y, 7);
          doc.setFillColor(235, 235, 235);
          doc.rect(M, y - 2.5, CW, 6, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(20, 20, 20);
          doc.text('TOTAL', M + 2, y + 1);
          doc.text(`R$ ${fmt(md.totalSolicitado)}`, M + 130, y + 1);
          doc.text(`R$ ${fmt(md.totalAprovado)}`, M + 153, y + 1);
          doc.setTextColor(34, 150, 80);
          doc.text(`Pago: R$ ${fmt(md.totalPago)}`, M + 172, y + 1);
          y += 9;
        }

        y += 6; // spacing between metas
      }

      addFooter(doc, periodoLabel, geradoEm);
      doc.save(`MC_RELATORIO_META_${periodoLabel.replace(/\//g, '-').replace(/\s+/g, '_').toUpperCase()}.pdf`);
      toast.success('PDF exportado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={loading}
      className="bg-black hover:bg-gray-800 text-white gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {loading ? 'Gerando...' : 'Exportar PDF'}
    </Button>
  );
}