import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { year, museu } = await req.json();

    if (!year || !museu) {
      return Response.json({ error: 'year e museu são obrigatórios' }, { status: 400 });
    }

    // Busca todos os relatórios aprovados do ano
    const approvedReports = await base44.entities.Report.filter({
      ano: year,
      museu: museu,
      status: 'APPROVED'
    }, '-mes_referencia', 100);

    if (approvedReports.length === 0) {
      return Response.json({ error: 'Nenhum relatório aprovado encontrado para esse período' }, { status: 404 });
    }

    // Calcula métricas consolidadas
    const metrics = {
      totalActivities: 0,
      totalPublic: 0,
      metaActivities: 0,
      routineActivities: 0,
      extraActivities: 0,
      museuName: museu,
      year: year,
      monthsWithReports: 0
    };

    const monthlyData = [];

    for (const report of approvedReports) {
      metrics.monthsWithReports++;
      
      const activities = report.atividades || [];
      metrics.totalActivities += activities.length;

      activities.forEach(activity => {
        metrics.totalPublic += (activity.publico_total || 0);
        
        if (activity.classificacao === 'META') metrics.metaActivities++;
        else if (activity.classificacao === 'ROTINA') metrics.routineActivities++;
        else if (activity.classificacao === 'EXTRA') metrics.extraActivities++;
      });

      monthlyData.push({
        mes: report.mes_referencia,
        activities: activities.length,
        public: activities.reduce((sum, a) => sum + (a.publico_total || 0), 0),
        author: report.author_name
      });
    }

    // Gera PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Cabeçalho
    doc.setFontSize(20);
    doc.text('PRESTAÇÃO DE CONTAS ANUAL', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(14);
    doc.text(`${metrics.museuName} - ${metrics.year}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 20;

    // Resumo executivo
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('RESUMO EXECUTIVO', 20, yPos);
    yPos += 8;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(`Período: ${metrics.year}`, 20, yPos);
    yPos += 6;
    doc.text(`Meses com relatórios aprovados: ${metrics.monthsWithReports}/12`, 20, yPos);
    yPos += 10;

    // Métricas principais
    doc.setFont(undefined, 'bold');
    doc.text('MÉTRICAS CONSOLIDADAS', 20, yPos);
    yPos += 8;

    doc.setFont(undefined, 'normal');
    const metricsData = [
      `Total de Atividades: ${metrics.totalActivities}`,
      `Público Total Impactado: ${metrics.totalPublic}`,
      `Atividades META: ${metrics.metaActivities}`,
      `Atividades ROTINA: ${metrics.routineActivities}`,
      `Atividades EXTRA: ${metrics.extraActivities}`
    ];

    metricsData.forEach(metric => {
      doc.text(metric, 20, yPos);
      yPos += 6;
    });

    yPos += 8;

    // Detalhamento mensal
    doc.setFont(undefined, 'bold');
    doc.text('DETALHAMENTO MENSAL', 20, yPos);
    yPos += 8;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);

    monthlyData.forEach(month => {
      if (yPos > pageHeight - 30) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(`${month.mes}/${metrics.year}`, 20, yPos);
      doc.text(`Atividades: ${month.activities}`, 80, yPos);
      doc.text(`Público: ${month.public}`, 140, yPos);
      yPos += 6;
    });

    // Rodapé
    yPos = pageHeight - 20;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Relatório gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, yPos, { align: 'center' });

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=prestacao_contas_${museu}_${year}.pdf`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});