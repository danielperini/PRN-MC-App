import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import jsPDFModule from 'npm:jspdf@4.0.0';

const { jsPDF } = jsPDFModule;

const COLORS = {
  primary: '#1F2937',
  secondary: '#6B7280',
  accent: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  border: '#E5E7EB',
  lightBg: '#F9FAFB',
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const LINE_HEIGHT = 5;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportId } = await req.json();

    if (!reportId) {
      return Response.json({ error: 'reportId required' }, { status: 400 });
    }

    const report = await base44.asServiceRole.entities.Report.get(reportId);
    if (!report) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    // Busca atividades e comentários
    const atividades = await base44.asServiceRole.entities.Activity.filter({ report_id: reportId });
    const comentarios = await base44.asServiceRole.entities.Comment.filter({ report_id: reportId });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let currentY = MARGIN;

    // ========== HELPER FUNCTIONS ==========
    const addTitle = (text, size = 18) => {
      pdf.setFontSize(size);
      pdf.setTextColor(COLORS.primary);
      pdf.setFont(undefined, 'bold');
      const lines = pdf.splitTextToSize(text, CONTENT_WIDTH);
      pdf.text(lines, MARGIN, currentY);
      currentY += (lines.length * LINE_HEIGHT) + 5;
      if (currentY > PAGE_HEIGHT - MARGIN) pdf.addPage();
    };

    const addHeading = (text) => {
      pdf.setFontSize(12);
      pdf.setTextColor(COLORS.primary);
      pdf.setFont(undefined, 'bold');
      pdf.text(text, MARGIN, currentY);
      currentY += 7;
      pdf.setDrawColor(COLORS.accent);
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN, currentY, PAGE_WIDTH - MARGIN, currentY);
      currentY += 4;
      if (currentY > PAGE_HEIGHT - MARGIN) pdf.addPage();
    };

    const addText = (text, size = 10, bold = false) => {
      pdf.setFontSize(size);
      pdf.setTextColor(COLORS.secondary);
      pdf.setFont(undefined, bold ? 'bold' : 'normal');
      const lines = pdf.splitTextToSize(text, CONTENT_WIDTH);
      pdf.text(lines, MARGIN, currentY);
      currentY += (lines.length * LINE_HEIGHT) + 2;
      if (currentY > PAGE_HEIGHT - MARGIN) pdf.addPage();
    };

    const addField = (label, value) => {
      pdf.setFontSize(9);
      pdf.setTextColor(COLORS.secondary);
      pdf.setFont(undefined, 'bold');
      pdf.text(label, MARGIN, currentY);
      currentY += 4;
      pdf.setFont(undefined, 'normal');
      const lines = pdf.splitTextToSize(value || '—', CONTENT_WIDTH - 5);
      pdf.text(lines, MARGIN + 5, currentY);
      currentY += (lines.length * LINE_HEIGHT) + 3;
      if (currentY > PAGE_HEIGHT - MARGIN) pdf.addPage();
    };

    const addSeparator = () => {
      pdf.setDrawColor(COLORS.border);
      pdf.setLineWidth(0.3);
      pdf.line(MARGIN, currentY, PAGE_WIDTH - MARGIN, currentY);
      currentY += 4;
    };

    // ========== CAPA ==========
    addTitle('RELATÓRIO MENSAL', 20);
    currentY += 5;

    addText(`${report.mes_referencia} de ${report.ano}`, 14, true);
    currentY += 8;

    pdf.setFontSize(11);
    pdf.setTextColor(COLORS.secondary);
    pdf.setFont(undefined, 'normal');
    pdf.text('Protocolo:', MARGIN, currentY);
    pdf.setTextColor(COLORS.primary);
    pdf.setFont(undefined, 'bold');
    pdf.text(report.numero_protocolo || '—', MARGIN + 30, currentY);
    currentY += 8;

    addField('Profissional', report.author_name);
    addField('Função', report.funcao);
    addField('Museu', report.museu);
    addField('Equipe', report.equipe);

    currentY += 10;
    pdf.setDrawColor(COLORS.border);
    pdf.setLineWidth(1);
    pdf.rect(MARGIN, currentY - 5, CONTENT_WIDTH, 0.5);

    // ========== RESUMO EXECUTIVO ==========
    pdf.addPage();
    currentY = MARGIN;

    addHeading('Resumo Executivo');
    if (report.resumo_executivo) {
      // Remove HTML tags se houver
      const cleanText = report.resumo_executivo.replace(/<[^>]*>/g, '');
      addText(cleanText);
    } else {
      addText('Não informado');
    }

    // ========== ATIVIDADES ==========
    currentY += 5;
    addHeading('Atividades Realizadas');

    if (!atividades || atividades.length === 0) {
      addText('Nenhuma atividade registrada.');
    } else {
      atividades.forEach((ativ, idx) => {
        pdf.setFontSize(10);
        pdf.setTextColor(COLORS.primary);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${idx + 1}. ${ativ.titulo}`, MARGIN, currentY);
        currentY += 6;

        pdf.setFontSize(9);
        pdf.setTextColor(COLORS.secondary);
        pdf.setFont(undefined, 'normal');
        const fields = [
          ['Tipo', ativ.tipo_equipe],
          ['Classificação', ativ.classificacao],
          ['Data', ativ.data_realizacao ? new Date(ativ.data_realizacao).toLocaleDateString('pt-BR') : '—'],
          ['Público', `${ativ.publico_total || 0} pessoas`],
        ];

        fields.forEach(([label, value]) => {
          pdf.text(`${label}: `, MARGIN + 5, currentY);
          pdf.setFont(undefined, 'bold');
          pdf.text(String(value), MARGIN + 35, currentY);
          pdf.setFont(undefined, 'normal');
          currentY += 4;
        });

        if (ativ.descricao) {
          const lines = pdf.splitTextToSize(ativ.descricao, CONTENT_WIDTH - 10);
          pdf.text(lines, MARGIN + 5, currentY);
          currentY += (lines.length * 3.5) + 2;
        }

        currentY += 3;
        if (currentY > PAGE_HEIGHT - MARGIN - 10) {
          pdf.addPage();
          currentY = MARGIN;
        }
      });
    }

    // ========== AVALIAÇÃO ==========
    if (currentY > PAGE_HEIGHT - MARGIN - 30) pdf.addPage();
    currentY = Math.max(currentY, MARGIN);

    addHeading('Avaliação do Período');

    if (report.avaliacao_pontos_positivos) {
      pdf.setFontSize(10);
      pdf.setTextColor(COLORS.success);
      pdf.setFont(undefined, 'bold');
      pdf.text('✓ Pontos Positivos', MARGIN, currentY);
      currentY += 5;
      const cleanText = report.avaliacao_pontos_positivos.replace(/<[^>]*>/g, '');
      addText(cleanText);
    }

    if (report.avaliacao_desafios) {
      pdf.setFontSize(10);
      pdf.setTextColor(COLORS.warning);
      pdf.setFont(undefined, 'bold');
      pdf.text('⚠ Dificuldades', MARGIN, currentY);
      currentY += 5;
      const cleanText = report.avaliacao_desafios.replace(/<[^>]*>/g, '');
      addText(cleanText);
    }

    if (report.avaliacao_sugestoes) {
      pdf.setFontSize(10);
      pdf.setTextColor(COLORS.accent);
      pdf.setFont(undefined, 'bold');
      pdf.text('💡 Sugestões de Melhoria', MARGIN, currentY);
      currentY += 5;
      const cleanText = report.avaliacao_sugestoes.replace(/<[^>]*>/g, '');
      addText(cleanText);
    }

    // ========== COMENTÁRIOS (se houver) ==========
    if (comentarios && comentarios.length > 0) {
      if (currentY > PAGE_HEIGHT - MARGIN - 30) pdf.addPage();
      currentY = Math.max(currentY, MARGIN);

      addHeading('Feedback e Comentários');
      const rootComments = comentarios.filter(c => !c.eh_resposta_a);

      rootComments.forEach((comment) => {
        pdf.setFontSize(9);
        pdf.setTextColor(COLORS.secondary);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${comment.author_name} (${comment.author_role})`, MARGIN, currentY);
        currentY += 4;

        const lines = pdf.splitTextToSize(comment.conteudo, CONTENT_WIDTH - 5);
        pdf.setFont(undefined, 'normal');
        pdf.text(lines, MARGIN + 5, currentY);
        currentY += (lines.length * 3.5) + 3;

        if (currentY > PAGE_HEIGHT - MARGIN - 20) {
          pdf.addPage();
          currentY = MARGIN;
        }
      });
    }

    // ========== RODAPÉ ==========
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(COLORS.secondary);
      pdf.text(
        `Página ${i} de ${pageCount}`,
        PAGE_WIDTH / 2,
        PAGE_HEIGHT - 8,
        { align: 'center' }
      );
      pdf.text(
        `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,
        PAGE_WIDTH / 2,
        PAGE_HEIGHT - 5,
        { align: 'center' }
      );
    }

    const pdfBytes = pdf.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Relatorio_${report.mes_referencia}_${report.ano}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});