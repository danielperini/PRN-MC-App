import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@4.0.0';
import 'npm:jspdf-autotable@3.5.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportIds } = await req.json();

    if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
      return Response.json({ error: 'reportIds é obrigatório e deve ser um array' }, { status: 400 });
    }

    // Buscar todos os relatórios
    const reports = await Promise.all(
      reportIds.map(id => base44.entities.Report.get(id))
    );

    const validReports = reports.filter(r => r);
    if (validReports.length === 0) {
      return Response.json({ error: 'Nenhum relatório encontrado' }, { status: 404 });
    }

    // Buscar todos os anexos
    const allAttachments = await base44.entities.Attachment.list('-created_date', 500);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;
    let isFirstPage = true;

    // ===== CAPA =====
    doc.setFillColor(70, 130, 180);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont(undefined, 'bold');
    doc.text('MUSEUS CENTRO', pageWidth / 2, pageHeight / 2 - 30, { align: 'center' });

    doc.setFontSize(20);
    doc.setFont(undefined, 'normal');
    doc.text('Relatório Consolidado', pageWidth / 2, pageHeight / 2 + 10, { align: 'center' });

    doc.setFontSize(12);
    doc.text(`${validReports.length} relatório(s)`, pageWidth / 2, pageHeight / 2 + 30, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 
      pageWidth / 2, pageHeight - 30, { align: 'center' });

    doc.addPage();
    yPosition = 15;

    // ===== ÍNDICE =====
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('ÍNDICE DE RELATÓRIOS', 15, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    validReports.forEach((report, idx) => {
      doc.text(`${idx + 1}. ${report.author_name} — ${report.mes_referencia}/${report.ano}`, 20, yPosition);
      yPosition += 6;
    });

    yPosition += 10;

    // ===== RELATÓRIOS =====
    validReports.forEach((report, reportIdx) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 15;
      }

      // Divisor entre relatórios
      if (reportIdx > 0) {
        doc.setDrawColor(200, 200, 200);
        doc.line(10, yPosition, pageWidth - 10, yPosition);
        yPosition += 8;
      }

      // Cabeçalho do relatório
      doc.setFillColor(230, 240, 250);
      doc.rect(10, yPosition - 3, pageWidth - 20, 8, 'F');
      doc.setTextColor(40, 80, 120);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`${reportIdx + 1}. ${report.author_name} — ${report.mes_referencia}/${report.ano}`, 15, yPosition + 2);
      yPosition += 10;

      // Identificação
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');

      const identData = [
        { label: 'Museu:', value: report.museu || 'N/A' },
        { label: 'Equipe:', value: report.equipe || 'N/A' },
        { label: 'Função:', value: report.funcao || 'N/A' },
        { label: 'Status:', value: report.status || 'DRAFT' }
      ];

      identData.forEach(item => {
        doc.setFont(undefined, 'bold');
        doc.text(item.label, 15, yPosition);
        doc.setFont(undefined, 'normal');
        doc.text(String(item.value), 50, yPosition);
        yPosition += 4;
      });

      yPosition += 3;

      // Resumo Executivo
      if (report.resumo_executivo) {
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 15;
        }
        doc.setFont(undefined, 'bold');
        doc.setFontSize(10);
        doc.text('Resumo Executivo:', 15, yPosition);
        yPosition += 4;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        const splitText = doc.splitTextToSize(report.resumo_executivo, pageWidth - 30);
        doc.text(splitText, 15, yPosition);
        yPosition += splitText.length * 3.5 + 3;
      }

      // Atividades (resumido)
      if (report.atividades && report.atividades.length > 0) {
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 15;
        }
        doc.setFont(undefined, 'bold');
        doc.setFontSize(10);
        doc.text(`Atividades (${report.atividades.length}):`, 15, yPosition);
        yPosition += 4;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);

        report.atividades.slice(0, 3).forEach((activity, idx) => {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 15;
          }
          const title = activity.titulo || 'Sem título';
          const truncated = title.length > 50 ? title.substring(0, 50) + '...' : title;
          doc.text(`• ${truncated}`, 20, yPosition);
          yPosition += 3;
        });

        if (report.atividades.length > 3) {
          doc.setFont(undefined, 'italic');
          doc.setTextColor(100, 100, 100);
          doc.text(`(+ ${report.atividades.length - 3} outras atividades)`, 20, yPosition);
          yPosition += 3;
        }
        doc.setTextColor(0, 0, 0);
      }

      yPosition += 4;

      // Anexos deste relatório
      const reportAttachments = allAttachments.filter(att => att.report_id === report.id);
      if (reportAttachments.length > 0) {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 15;
        }
        doc.setFont(undefined, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(60, 120, 60);
        doc.text(`Anexos: ${reportAttachments.length} arquivo(s)`, 15, yPosition);
        yPosition += 3;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);

        reportAttachments.slice(0, 5).forEach(att => {
          if (yPosition > pageHeight - 10) {
            doc.addPage();
            yPosition = 15;
          }
          doc.text(`• ${att.file_name} (${(att.file_size / 1024 / 1024).toFixed(1)}MB)`, 20, yPosition);
          yPosition += 3;
        });

        if (reportAttachments.length > 5) {
          doc.setFont(undefined, 'italic');
          doc.setTextColor(100, 100, 100);
          doc.text(`(+ ${reportAttachments.length - 5} outros arquivos)`, 20, yPosition);
        }
      }
    });

    // ===== RODAPÉ =====
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorios-consolidado-${new Date().toISOString().slice(0, 10)}.pdf"`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar PDF consolidado:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});