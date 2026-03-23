import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@4.0.0';
import 'npm:jspdf-autotable@3.5.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { startDate, endDate, equipe, museu } = await req.json();

    if (!startDate || !endDate) {
      return Response.json({ error: 'startDate e endDate são obrigatórios' }, { status: 400 });
    }

    // Buscar contratos (TeamMember)
    const allMembers = await base44.entities.TeamMember.list('-created_date', 200);
    const filteredMembers = allMembers.filter(m => {
      const createdDate = new Date(m.created_date || m.data_criacao);
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (createdDate < start || createdDate > end) return false;
      if (equipe && m.funcao !== equipe) return false;
      return true;
    });

    // Buscar relatórios (atividades)
    const allReports = await base44.entities.Report.list('-created_date', 200);
    const filteredReports = allReports.filter(r => {
      const createdDate = new Date(r.created_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (createdDate < start || createdDate > end) return false;
      if (museu && r.museu !== museu) return false;
      if (equipe && r.equipe !== equipe) return false;
      return true;
    });

    // Buscar anexos
    const allAttachments = await base44.entities.Attachment.list('-created_date', 500);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;

    // ===== CAPA =====
    doc.setFillColor(70, 130, 180);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont(undefined, 'bold');
    doc.text('MUSEUS CENTRO', pageWidth / 2, pageHeight / 2 - 40, { align: 'center' });

    doc.setFontSize(18);
    doc.setFont(undefined, 'normal');
    doc.text('Relatório de Contratos e Atividades', pageWidth / 2, pageHeight / 2 - 10, { align: 'center' });

    doc.setFontSize(12);
    const startFormatted = new Date(startDate).toLocaleDateString('pt-BR');
    const endFormatted = new Date(endDate).toLocaleDateString('pt-BR');
    doc.text(`Período: ${startFormatted} a ${endFormatted}`, pageWidth / 2, pageHeight / 2 + 20, { align: 'center' });

    if (museu) {
      doc.setFontSize(11);
      doc.text(`Museu: ${museu}`, pageWidth / 2, pageHeight / 2 + 30, { align: 'center' });
    }
    if (equipe) {
      doc.setFontSize(11);
      doc.text(`Equipe: ${equipe}`, pageWidth / 2, pageHeight / 2 + 40, { align: 'center' });
    }

    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 
      pageWidth / 2, pageHeight - 30, { align: 'center' });

    doc.addPage();
    yPosition = 15;

    // ===== RESUMO EXECUTIVO =====
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('RESUMO EXECUTIVO', 15, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const summaryData = [
      { label: 'Total de Contratos:', value: filteredMembers.length },
      { label: 'Valor Total de Contratos:', value: `R$ ${filteredMembers.reduce((sum, m) => sum + (m.valor_total || 0), 0).toFixed(2)}` },
      { label: 'Total de Relatórios:', value: filteredReports.length },
      { label: 'Total de Atividades:', value: filteredReports.reduce((sum, r) => sum + (Array.isArray(r.atividades) ? r.atividades.length : 0), 0) }
    ];

    summaryData.forEach(item => {
      doc.setFont(undefined, 'bold');
      doc.text(item.label, 15, yPosition);
      doc.setFont(undefined, 'normal');
      doc.text(String(item.value), 85, yPosition);
      yPosition += 6;
    });

    yPosition += 8;

    // ===== SEÇÃO: CONTRATOS =====
    if (filteredMembers.length > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 15;
      }

      doc.setFillColor(70, 130, 180);
      doc.rect(10, yPosition - 4, pageWidth - 20, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`CONTRATOS (${filteredMembers.length})`, 15, yPosition + 1);

      yPosition += 12;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);

      filteredMembers.forEach((member, idx) => {
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 15;
        }

        doc.setFont(undefined, 'bold');
        doc.text(`${idx + 1}. ${member.user_name || 'Sem nome'}`, 15, yPosition);
        yPosition += 4;

        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        const contractDetails = [
          `Função: ${member.funcao || 'N/A'}`,
          `Tipo: ${member.tipo_pessoa || 'N/A'}`,
          `${member.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'}: ${member.cpf || member.cnpj || 'N/A'}`,
          `Valor Total: R$ ${(member.valor_total || 0).toFixed(2)}`,
          `Parcelas: ${member.numero_parcelas || 1} × R$ ${(member.valor_parcela || 0).toFixed(2)}`,
          `Vigência: ${member.data_inicio_contrato || 'N/A'} a ${member.data_fim_contrato || 'N/A'}`
        ];

        contractDetails.forEach(detail => {
          doc.text(detail, 20, yPosition);
          yPosition += 3;
        });

        if (member.objeto_contrato) {
          doc.setFontSize(7);
          doc.setFont(undefined, 'italic');
          const objSplit = doc.splitTextToSize(member.objeto_contrato.substring(0, 150), pageWidth - 40);
          doc.text('Objeto:', 20, yPosition);
          yPosition += 2.5;
          doc.text(objSplit, 25, yPosition);
          yPosition += objSplit.length * 2.5 + 2;
        }

        yPosition += 2;
      });
    }

    // ===== SEÇÃO: RELATÓRIOS E ATIVIDADES =====
    if (filteredReports.length > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 15;
      } else {
        yPosition += 8;
      }

      doc.setFillColor(70, 130, 180);
      doc.rect(10, yPosition - 4, pageWidth - 20, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`RELATÓRIOS E ATIVIDADES (${filteredReports.length})`, 15, yPosition + 1);

      yPosition += 12;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);

      filteredReports.forEach((report, rIdx) => {
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 15;
        }

        doc.setFont(undefined, 'bold');
        doc.setTextColor(70, 130, 180);
        doc.text(`${rIdx + 1}. ${report.author_name || 'Sem nome'} — ${report.mes_referencia}/${report.ano}`, 15, yPosition);
        yPosition += 4;

        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.text(`Museu: ${report.museu || 'N/A'} | Equipe: ${report.equipe || 'N/A'} | Status: ${report.status || 'N/A'}`, 20, yPosition);
        yPosition += 3;

        const atividades = Array.isArray(report.atividades) ? report.atividades : [];
        if (atividades.length > 0) {
          doc.setFontSize(7);
          doc.setFont(undefined, 'italic');
          doc.text(`Atividades: ${atividades.length}`, 20, yPosition);
          yPosition += 2.5;

          atividades.slice(0, 2).forEach((activity, aIdx) => {
            const title = activity.titulo || 'Sem título';
            const truncated = title.length > 60 ? title.substring(0, 60) + '...' : title;
            doc.text(`  • ${truncated}`, 25, yPosition);
            yPosition += 2.5;
          });

          if (atividades.length > 2) {
            doc.setFont(undefined, 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text(`  (+ ${atividades.length - 2} outras)`, 25, yPosition);
            yPosition += 2.5;
          }
        }

        const reportAttachments = allAttachments.filter(att => att.report_id === report.id);
        if (reportAttachments.length > 0) {
          doc.setTextColor(60, 120, 60);
          doc.setFont(undefined, 'normal');
          doc.setFontSize(7);
          doc.text(`Anexos: ${reportAttachments.length}`, 20, yPosition);
          yPosition += 2.5;
        }

        doc.setTextColor(0, 0, 0);
        yPosition += 2;
      });
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
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-contratos-atividades-${new Date().toISOString().slice(0, 10)}.pdf"`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});