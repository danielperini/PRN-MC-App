import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import jsPDF from 'npm:jspdf@4.0.0';
import autoTable from 'npm:jspdf-autotable@3.5.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportIds = [], config = {} } = await req.json();

    if (!reportIds.length) {
      return Response.json({ error: 'Nenhum relatório selecionado' }, { status: 400 });
    }

    // Fetch reports
    const reports = await Promise.all(
      reportIds.map(id => base44.entities.Report.list().then(all => all.find(r => r.id === id)))
    );

    const validReports = reports.filter(Boolean);
    if (!validReports.length) {
      return Response.json({ error: 'Nenhum relatório encontrado' }, { status: 404 });
    }

    // Fetch purchases if needed
    let purchases = [];
    if (config.incluirGastos) {
      purchases = await base44.entities.PurchaseRequest.list('-created_date', 1000);
    }

    // Create PDF
    const doc = new jsPDF('pt', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = 20;

    // Helper functions
    const addPage = () => {
      doc.addPage();
      currentY = 20;
    };

    const addTitle = (text, y = currentY, size = 24) => {
      doc.setFontSize(size);
      doc.setFont(undefined, 'bold');
      doc.text(text, pageWidth / 2, y, { align: 'center' });
      return y + 15;
    };

    const addText = (text, y = currentY, size = 12, bold = false) => {
      doc.setFontSize(size);
      doc.setFont(undefined, bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, pageWidth - 40);
      doc.text(lines, 20, y);
      return y + (lines.length * 6);
    };

    // PAGE 1: Cover
    currentY = addTitle(config.titulo || 'Relatório Consolidado', 60, 28);
    currentY = addText(config.subtitle || '', currentY + 20, 14, false);
    currentY = addText(`Data: ${config.dataRelatorio || new Date().toLocaleDateString('pt-BR')}`, currentY + 40, 12);
    const museus = [...new Set(validReports.map(r => r.museu))];
    currentY = addText(`Museus: ${museus.join(', ')}`, currentY + 10, 11);
    currentY = addText(`Período: ${validReports.map(r => r.mes_referencia).join(', ')} ${validReports[0]?.ano || ''}`, currentY + 10, 11);

    // PAGE 2: Table of Contents (if enabled)
    if (config.incluirSumario) {
      addPage();
      addTitle('Sumário', 20, 18);
      currentY = 50;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      let pageNum = 3;
      
      doc.text(`1. Atividades e Resumos............................. Página ${pageNum}`, 30, currentY);
      currentY += 10;
      
      if (config.incluirGastos) {
        pageNum += 2;
        doc.text(`2. Gastos e Despesas............................. Página ${pageNum}`, 30, currentY);
        currentY += 10;
      }
      
      if (config.incluirObservacoes) {
        pageNum += 2;
        doc.text(`3. Observações dos Coordenadores............................. Página ${pageNum}`, 30, currentY);
      }
    }

    // PAGE 3+: Activities by Museum
    if (config.incluirAtividades) {
      addPage();
      addTitle('Atividades e Resumos por Museu', 20, 16);
      currentY = 40;

      for (const museo of museus) {
        const museumReports = validReports.filter(r => r.museu === museo);
        
        // Museum section
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.text(`${museo}`, 20, currentY);
        currentY += 12;

        // Activities table
        const activities = [];
        let totalPublico = 0;

        museumReports.forEach(report => {
          const atividades = Array.isArray(report.atividades) ? report.atividades : [];
          atividades.forEach(a => {
            if (a) {
              const publico = a.publico_estimado || 0;
              totalPublico += publico;
              activities.push([
                a.titulo || a.nome || '',
                a.classificacao || '',
                a.equipe_responsavel || '',
                publico.toString(),
                report.mes_referencia
              ]);
            }
          });
        });

        if (activities.length > 0) {
          autoTable(doc, {
            head: [['Atividade', 'Classificação', 'Equipe', 'Público', 'Mês']],
            body: activities,
            startY: currentY,
            margin: 20,
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: '#000000', textColor: '#ffffff', fontStyle: 'bold' },
            alternateRowStyles: { fillColor: '#f5f5f5' },
          });
          
          currentY = (doc.lastAutoTable?.finalY || currentY) + 10;

          // Summary
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.text(`Total de Atividades: ${activities.length} | Total de Público: ${totalPublico.toLocaleString('pt-BR')}`, 20, currentY);
          currentY += 15;
        }

        if (currentY > pageHeight - 40) {
          addPage();
        }
      }
    }

    // PAGE: Gastos
    if (config.incluirGastos && purchases.length > 0) {
      addPage();
      addTitle('Gastos e Despesas', 20, 16);
      currentY = 40;

      for (const museo of museus) {
        const museumReports = validReports.filter(r => r.museu === museo);
        const museumPurchases = purchases.filter(p => {
          const report = validReports.find(r => r.id === p.report_id);
          return report && museumReports.some(mr => mr.id === report.id);
        });

        if (museumPurchases.length > 0) {
          doc.setFontSize(13);
          doc.setFont(undefined, 'bold');
          doc.text(`Gastos - ${museo}`, 20, currentY);
          currentY += 10;

          const expenses = museumPurchases.map(p => [
            p.descricao_item || '',
            p.categoria || '',
            p.status || '',
            `R$ ${(p.valor_aprovado_admin || p.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          ]);

          autoTable(doc, {
            head: [['Descrição', 'Categoria', 'Status', 'Valor']],
            body: expenses,
            startY: currentY,
            margin: 20,
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: '#333333', textColor: '#ffffff', fontStyle: 'bold' },
            alternateRowStyles: { fillColor: '#f5f5f5' },
          });

          currentY = (doc.lastAutoTable?.finalY || currentY) + 10;

          const total = museumPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.text(`Total: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, currentY);
          currentY += 15;

          if (currentY > pageHeight - 40) {
            addPage();
          }
        }
      }
    }

    // PAGE: Observações
    if (config.incluirObservacoes) {
      addPage();
      addTitle('Observações dos Coordenadores', 20, 16);
      currentY = 40;

      validReports.forEach(report => {
        if (report.return_comment || report.avaliacao_sugestoes || report.avaliacao_desafios) {
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text(`${report.author_name} - ${report.mes_referencia} ${report.ano}`, 20, currentY);
          currentY += 8;

          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          
          if (report.avaliacao_desafios) {
            currentY = addText(`Desafios: ${report.avaliacao_desafios}`, currentY, 9);
          }
          if (report.avaliacao_sugestoes) {
            currentY = addText(`Sugestões: ${report.avaliacao_sugestoes}`, currentY, 9);
          }
          if (report.return_comment) {
            currentY = addText(`Comentários: ${report.return_comment}`, currentY, 9);
          }

          currentY += 10;

          if (currentY > pageHeight - 40) {
            addPage();
          }
        }
      });
    }

    // Save PDF
    const fileName = `relatorio_consolidado_${new Date().toISOString().slice(0, 10)}.pdf`;
    const pdfData = doc.output('arraybuffer');

    // Try to upload to drive if available
    try {
      await base44.functions.invoke('uploadExportedReportToDrive', {
        fileName: fileName,
        pdfBuffer: Array.from(new Uint8Array(pdfData))
      });
    } catch (e) {
      // Silent fail for drive upload
    }

    return new Response(pdfData, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});