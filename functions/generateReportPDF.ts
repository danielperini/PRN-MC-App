import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@4.0.0';
import 'npm:jspdf-autotable@3.5.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportId, coverPhotoIds } = await req.json();

    if (!reportId) {
      return Response.json({ error: 'reportId é obrigatório' }, { status: 400 });
    }

    const report = await base44.entities.Report.get(reportId);
    if (!report) {
      return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });
    }

    // Buscar fotos selecionadas
    let coverPhotos = [];
    if (coverPhotoIds && coverPhotoIds.length > 0) {
      const attachments = await base44.entities.Attachment.filter(
        { id: { $in: coverPhotoIds } },
        'created_date',
        3
      );
      coverPhotos = attachments || [];
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;

    // ===== CABEÇALHO COM FOTOS =====
    let headerHeight = 40;

    // Se houver fotos, adicionar galeria no topo
    if (coverPhotos.length > 0) {
      const photoWidth = (pageWidth - 30) / Math.min(coverPhotos.length, 3);
      let xPos = 15;

      for (const photo of coverPhotos) {
        try {
          const response = await fetch(photo.file_url);
          const arrayBuffer = await response.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          const imgData = `data:image/jpeg;base64,${base64}`;
          doc.addImage(imgData, 'JPEG', xPos, 15, photoWidth - 2, 20);
          xPos += photoWidth;
        } catch (err) {
          console.error('Erro ao processar foto:', err);
        }
      }
      yPosition += 25;
      headerHeight += 25;
    }

    // Logo e Identificação
    doc.setFillColor(245, 245, 245);
    doc.rect(0, yPosition - 5, pageWidth, 30, 'F');

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('MUSEUS CENTRO', 15, yPosition + 5);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Relatório Executivo | Belo Horizonte', 15, yPosition + 12);

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.text(`Protocolo: ${report.numero_protocolo} | Data: ${new Date().toLocaleDateString('pt-BR')}`, 15, yPosition + 18);

    yPosition += 35;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont(undefined, 'italic');

    yPosition = 35;

    // ===== SEÇÃO: IDENTIFICAÇÃO =====
    doc.setFillColor(70, 130, 180);
    doc.rect(10, yPosition - 4, pageWidth - 20, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('IDENTIFICAÇÃO DO RELATÓRIO', 15, yPosition + 1);

    yPosition += 12;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');

    const identData = [
      ['Profissional:', report.author_name || 'N/A'],
      ['Função:', report.funcao || 'N/A'],
      ['Museu:', report.museu || 'N/A'],
      ['Museu Secundário:', report.museu_secundario || '-'],
      ['Equipe:', report.equipe || 'N/A'],
      ['Período:', `${report.mes_referencia}/${report.ano}`],
      ['Status:', report.status || 'DRAFT']
    ];

    identData.forEach(([label, value]) => {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(9);
      doc.text(label, 15, yPosition);
      doc.setFont(undefined, 'normal');
      doc.text(String(value), 50, yPosition);
      yPosition += 5;
    });

    yPosition += 5;

    // ===== SEÇÃO: RESUMO EXECUTIVO =====
    if (report.resumo_executivo) {
      doc.setFillColor(70, 130, 180);
      doc.rect(10, yPosition - 4, pageWidth - 20, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('RESUMO EXECUTIVO', 15, yPosition + 1);

      yPosition += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      const splitText = doc.splitTextToSize(report.resumo_executivo, pageWidth - 30);
      doc.text(splitText, 15, yPosition);
      yPosition += splitText.length * 5 + 8;
    }

    // ===== SEÇÃO: ATIVIDADES =====
    if (report.atividades && report.atividades.length > 0) {
      if (yPosition > pageHeight - 50) {
        doc.addPage();
        yPosition = 15;
      }

      doc.setFillColor(70, 130, 180);
      doc.rect(10, yPosition - 4, pageWidth - 20, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('ATIVIDADES REALIZADAS', 15, yPosition + 1);

      yPosition += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);

      report.atividades.forEach((activity, idx) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 15;
        }

        doc.setFont(undefined, 'bold');
        doc.text(`${idx + 1}. ${activity.titulo || 'Sem título'}`, 15, yPosition);
        yPosition += 5;

        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);

        const details = [
          `Equipe: ${activity.tipo_equipe || 'N/A'}`,
          `Classificação: ${activity.classificacao || 'N/A'}`,
          `Data: ${activity.data_realizacao || 'N/A'}`,
          `Público: ${activity.publico_total || 0} pessoas`
        ];

        details.forEach(detail => {
          doc.text(detail, 20, yPosition);
          yPosition += 4;
        });

        if (activity.descricao) {
          const descSplit = doc.splitTextToSize(activity.descricao, pageWidth - 40);
          doc.setFontSize(8);
          doc.text('Descrição:', 20, yPosition);
          yPosition += 3;
          doc.text(descSplit, 25, yPosition);
          yPosition += descSplit.length * 3 + 2;
        }

        yPosition += 3;
      });

      yPosition += 2;
    }

    // ===== SEÇÃO: AVALIAÇÃO =====
    const hasEvaluation = report.avaliacao_pontos_positivos || 
                          report.avaliacao_desafios || 
                          report.avaliacao_sugestoes;

    if (hasEvaluation) {
      if (yPosition > pageHeight - 50) {
        doc.addPage();
        yPosition = 15;
      }

      doc.setFillColor(70, 130, 180);
      doc.rect(10, yPosition - 4, pageWidth - 20, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('AVALIAÇÃO', 15, yPosition + 1);

      yPosition += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);

      if (report.avaliacao_pontos_positivos) {
        doc.setFont(undefined, 'bold');
        doc.text('Pontos Positivos:', 15, yPosition);
        yPosition += 5;
        doc.setFont(undefined, 'normal');
        const posSplit = doc.splitTextToSize(report.avaliacao_pontos_positivos, pageWidth - 30);
        doc.setFontSize(9);
        doc.text(posSplit, 15, yPosition);
        yPosition += posSplit.length * 5 + 5;
      }

      if (report.avaliacao_desafios) {
        doc.setFont(undefined, 'bold');
        doc.setFontSize(10);
        doc.text('Desafios:', 15, yPosition);
        yPosition += 5;
        doc.setFont(undefined, 'normal');
        const chalSplit = doc.splitTextToSize(report.avaliacao_desafios, pageWidth - 30);
        doc.setFontSize(9);
        doc.text(chalSplit, 15, yPosition);
        yPosition += chalSplit.length * 5 + 5;
      }

      if (report.avaliacao_sugestoes) {
        doc.setFont(undefined, 'bold');
        doc.setFontSize(10);
        doc.text('Sugestões de Melhoria:', 15, yPosition);
        yPosition += 5;
        doc.setFont(undefined, 'normal');
        const sugSplit = doc.splitTextToSize(report.avaliacao_sugestoes, pageWidth - 30);
        doc.setFontSize(9);
        doc.text(sugSplit, 15, yPosition);
        yPosition += sugSplit.length * 5 + 5;
      }
    }

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
      doc.text(
        'Plataforma Museus Centro - Relatório Oficial',
        pageWidth / 2,
        pageHeight - 4,
        { align: 'center' }
      );
    }

    // Gerar PDF em bytes
    const pdfBytes = doc.output('arraybuffer');

    // Retornar com headers apropriados para download
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-${report.numero_protocolo}-${Date.now()}.pdf"`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});