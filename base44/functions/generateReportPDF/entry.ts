import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jsPDF } from 'npm:jspdf@4.0.0';
import 'npm:jspdf-autotable@3.5.31';

const BASE_FONT = 12;
const SECTION_FONT = 13;
const LABEL_FONT = 11;

function sectionHeader(doc, text, y, pageWidth) {
  doc.setFillColor(30, 64, 120);
  doc.rect(10, y - 5, pageWidth - 20, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(SECTION_FONT);
  doc.setFont(undefined, 'bold');
  doc.text(text, 15, y + 1);
  return y + 10;
}

function checkPage(doc, y, pageHeight) {
  if (y > pageHeight - 40) {
    doc.addPage();
    return 20;
  }
  return y;
}

async function fetchImageBase64(url) {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportId, selectedFields = [], assinatura = '', coverPhotoIds = [] } = await req.json();

    if (!reportId) return Response.json({ error: 'reportId é obrigatório' }, { status: 400 });

    const report = await base44.entities.Report.get(reportId);
    if (!report) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const include = (field) => selectedFields.length === 0 || selectedFields.includes(field);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 15;

    // ===== CABEÇALHO =====
    doc.setFillColor(245, 247, 252);
    doc.rect(0, 0, pageWidth, 38, 'F');
    doc.setTextColor(30, 64, 120);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('MUSEUS CENTRO', 15, y + 6);
    doc.setFontSize(BASE_FONT - 2);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Relatório Executivo Mensal — Belo Horizonte', 15, y + 13);
    doc.setFontSize(BASE_FONT - 3);
    doc.setFont(undefined, 'italic');
    doc.text(`Protocolo: ${report.numero_protocolo || '-'}   |   Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, 15, y + 19);
    doc.setDrawColor(30, 64, 120);
    doc.setLineWidth(0.5);
    doc.line(10, y + 22, pageWidth - 10, y + 22);
    y += 30;

    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');

    // ===== IDENTIFICAÇÃO =====
    if (include('identificacao')) {
      y = sectionHeader(doc, 'IDENTIFICAÇÃO DO RELATÓRIO', y, pageWidth);
      const fields = [
        ['Profissional', report.author_name || '-'],
        ['Função', report.funcao || '-'],
        ['Museu', report.museu || '-'],
        ['Museu Secundário', report.museu_secundario || '-'],
        ['Equipe', report.equipe || '-'],
        ['Período', `${report.mes_referencia || '-'} / ${report.ano || '-'}`],
        ['Status', report.status || 'DRAFT'],
      ];
      doc.setFontSize(BASE_FONT);
      for (const [label, value] of fields) {
        y = checkPage(doc, y, pageHeight);
        doc.setFont(undefined, 'bold');
        doc.text(`${label}:`, 15, y);
        doc.setFont(undefined, 'normal');
        doc.text(String(value), 60, y);
        y += 6;
      }
      y += 4;
    }

    // ===== RESUMO EXECUTIVO =====
    if (include('resumo') && report.resumo_executivo) {
      y = checkPage(doc, y, pageHeight);
      y = sectionHeader(doc, 'RESUMO EXECUTIVO', y, pageWidth);
      doc.setFontSize(BASE_FONT);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(report.resumo_executivo, pageWidth - 30);
      for (const line of lines) {
        y = checkPage(doc, y, pageHeight);
        doc.text(line, 15, y);
        y += 6;
      }
      y += 4;
      doc.setTextColor(0, 0, 0);
    }

    // ===== ATIVIDADES =====
    if (include('atividades') && report.atividades?.length > 0) {
      y = checkPage(doc, y, pageHeight);
      y = sectionHeader(doc, 'ATIVIDADES REALIZADAS', y, pageWidth);

      for (let idx = 0; idx < report.atividades.length; idx++) {
        const act = report.atividades[idx];
        y = checkPage(doc, y, pageHeight);

        doc.setFontSize(BASE_FONT);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 64, 120);
        doc.text(`${idx + 1}. ${act.nome || act.titulo || 'Sem título'}`, 15, y);
        y += 6;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(LABEL_FONT);

        const details = [
          ['Classificação', act.classificacao || '-'],
          ['Museu/Local', Array.isArray(act.museu_lista) ? act.museu_lista.join(', ') : (act.museu || '-')],
          ['Tipo de ação', Array.isArray(act.tipo_acao_lista) ? act.tipo_acao_lista.join(', ') : (act.tipo_acao || '-')],
          ['Público total', String(act.publico_total || act.publico_estimado || 0)],
          ['Ocorrências', String(act.quantidade_ocorrencias || 1)],
        ];

        for (const [label, val] of details) {
          y = checkPage(doc, y, pageHeight);
          doc.setFont(undefined, 'bold');
          doc.text(`${label}:`, 20, y);
          doc.setFont(undefined, 'normal');
          doc.text(String(val), 65, y);
          y += 5;
        }

        if (act.descricao) {
          y = checkPage(doc, y, pageHeight);
          doc.setFont(undefined, 'bold');
          doc.text('Descrição:', 20, y);
          y += 5;
          doc.setFont(undefined, 'normal');
          const dLines = doc.splitTextToSize(act.descricao, pageWidth - 45);
          for (const dl of dLines) {
            y = checkPage(doc, y, pageHeight);
            doc.text(dl, 25, y);
            y += 5;
          }
        }

        // Miniaturas de fotos da atividade
        if (include('fotos') && act.fotos?.length > 0) {
          y = checkPage(doc, y + 2, pageHeight);
          doc.setFont(undefined, 'italic');
          doc.setFontSize(10);
          doc.text('Evidências fotográficas:', 20, y);
          y += 4;
          const thumbSize = 28;
          const gap = 4;
          let xThumb = 20;
          for (const foto of act.fotos.slice(0, 4)) {
            const att = foto.file_url ? foto : null;
            const fileUrl = att?.file_url || foto?.url;
            if (!fileUrl) continue;
            const b64 = await fetchImageBase64(fileUrl);
            if (b64) {
              y = checkPage(doc, y, pageHeight);
              doc.addImage(`data:image/jpeg;base64,${b64}`, 'JPEG', xThumb, y, thumbSize, thumbSize * 0.75);
              xThumb += thumbSize + gap;
              if (xThumb > pageWidth - 30) { xThumb = 20; y += thumbSize * 0.75 + gap; }
            }
          }
          y += thumbSize * 0.75 + gap;
        }

        // Linha separadora leve
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(15, y + 1, pageWidth - 15, y + 1);
        y += 6;
      }
    }

    // ===== AVALIAÇÃO =====
    if (include('avaliacao') && (report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes)) {
      y = checkPage(doc, y, pageHeight);
      y = sectionHeader(doc, 'AVALIAÇÃO', y, pageWidth);
      doc.setFontSize(BASE_FONT);

      const avaliacoes = [
        ['Pontos Positivos', report.avaliacao_pontos_positivos],
        ['Desafios', report.avaliacao_desafios],
        ['Sugestões de Melhoria', report.avaliacao_sugestoes],
      ];

      for (const [label, val] of avaliacoes) {
        if (!val) continue;
        y = checkPage(doc, y, pageHeight);
        doc.setFont(undefined, 'bold');
        doc.text(`${label}:`, 15, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        const lns = doc.splitTextToSize(val, pageWidth - 30);
        for (const ln of lns) {
          y = checkPage(doc, y, pageHeight);
          doc.text(ln, 15, y);
          y += 5;
        }
        y += 2;
      }
    }

    // ===== OPORTUNIDADES =====
    if (include('oportunidades') && report.oportunidades?.length > 0) {
      y = checkPage(doc, y, pageHeight);
      y = sectionHeader(doc, 'OPORTUNIDADES', y, pageWidth);
      doc.setFontSize(BASE_FONT);
      report.oportunidades.forEach((op, i) => {
        y = checkPage(doc, y, pageHeight);
        doc.setFont(undefined, 'bold');
        doc.text(`${i + 1}. ${op.titulo || op.nome || 'Oportunidade'}`, 15, y);
        y += 5;
        if (op.descricao) {
          doc.setFont(undefined, 'normal');
          const lns = doc.splitTextToSize(op.descricao, pageWidth - 30);
          for (const ln of lns) { y = checkPage(doc, y, pageHeight); doc.text(ln, 20, y); y += 5; }
        }
        y += 2;
      });
    }

    // ===== DEPOIMENTOS =====
    if (include('depoimentos') && report.depoimentos?.length > 0) {
      y = checkPage(doc, y, pageHeight);
      y = sectionHeader(doc, 'DEPOIMENTOS', y, pageWidth);
      doc.setFontSize(BASE_FONT);
      report.depoimentos.forEach((dep, i) => {
        y = checkPage(doc, y, pageHeight);
        doc.setFont(undefined, 'italic');
        const lns = doc.splitTextToSize(`"${dep.texto || ''}"`, pageWidth - 40);
        for (const ln of lns) { y = checkPage(doc, y, pageHeight); doc.text(ln, 20, y); y += 5; }
        if (dep.autor) {
          doc.setFont(undefined, 'bold');
          doc.text(`— ${dep.autor}`, pageWidth - 20, y, { align: 'right' });
          y += 6;
        }
        y += 2;
      });
    }

    // ===== ASSINATURA =====
    y = checkPage(doc, y + 10, pageHeight);
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    doc.line(15, y, 100, y);
    y += 5;
    doc.setFontSize(BASE_FONT);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(assinatura || report.author_name || '_______________________________', 15, y);
    y += 5;
    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text(`Profissional responsável — ${report.mes_referencia || ''}/${report.ano || ''}`, 15, y);
    y += 8;

    // ===== MENSAGEM DE PRAZO =====
    doc.setFillColor(255, 248, 225);
    doc.setDrawColor(200, 150, 0);
    doc.setLineWidth(0.4);
    doc.rect(10, y, pageWidth - 20, 14, 'FD');
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(120, 80, 0);
    doc.text('⚠ ATENÇÃO: PRAZO DE ENVIO', 15, y + 5);
    doc.setFont(undefined, 'normal');
    doc.text(`Este relatório deve ser enviado ao coordenador até o dia 15 do mês seguinte ao período de referência (${report.mes_referencia || '...'}).`, 15, y + 10, { maxWidth: pageWidth - 30 });

    // ===== RODAPÉ =====
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      doc.text('Plataforma Museus Centro — Relatório Oficial', pageWidth / 2, pageHeight - 4, { align: 'center' });
    }

    const pdfBytes = doc.output('arraybuffer');
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-${report.numero_protocolo || reportId}.pdf"`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});