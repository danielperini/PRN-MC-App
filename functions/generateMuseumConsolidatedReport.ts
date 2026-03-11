import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { dateFrom, dateTo, museum } = payload;

    if (!dateFrom || !dateTo || !museum) {
      return Response.json({ error: 'Informe dateFrom, dateTo e museum' }, { status: 400 });
    }

    // Fetch reports within the date range for the museum
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 500);
    const filteredReports = reports.filter(r => r.museu === museum);

    // Fetch purchase requests for the museum and date range
    const purchaseRequests = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
    const filteredPurchases = purchaseRequests.filter(pr => {
      if (pr.centro_custo !== museum) return false;
      const createdDate = new Date(pr.created_date);
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      return createdDate >= from && createdDate <= to;
    }).filter(Boolean);

    // Aggregate activities and calculate totals
    const allActivities = filteredReports.flatMap(r => {
      return (r.atividades || []).map(a => ({
        ...a,
        report_id: r.id,
        author_name: r.author_name,
        mes_referencia: r.mes_referencia
      }));
    }).filter(Boolean);

    const totalActivities = allActivities.length;
    const totalPublic = allActivities.reduce((sum, a) => sum + (Number(a.publico_estimado) || 0), 0);
    const totalExpenses = filteredPurchases.reduce((sum, pr) => sum + (Number(pr.valor_solicitado) || 0), 0);
    const totalApproved = filteredPurchases
      .filter(pr => pr.status === 'APROVADO_ADMIN' || pr.status === 'PAGO')
      .reduce((sum, pr) => sum + (Number(pr.valor_aprovado_admin) || Number(pr.valor_solicitado) || 0), 0);

    // Build report content
    const reportContent = {
      title: `Relatório Consolidado - ${museum}`,
      period: `${dateFrom} a ${dateTo}`,
      summary: {
        total_reports: filteredReports.length,
        total_activities: totalActivities,
        total_public: totalPublic,
        total_expenses: totalExpenses,
        total_approved: totalApproved
      },
      activities_by_classification: {
        meta: allActivities.filter(a => a.classificacao === 'META').length,
        rotina: allActivities.filter(a => a.classificacao === 'ROTINA').length,
        extra: allActivities.filter(a => a.classificacao === 'EXTRA').length
      },
      purchase_summary: {
        total_requests: filteredPurchases.length,
        approved_requests: filteredPurchases.filter(pr => pr.status === 'APROVADO_ADMIN' || pr.status === 'PAGO').length,
        pending_requests: filteredPurchases.filter(pr => ['SOLICITADO', 'APROVADO_COORD'].includes(pr.status)).length,
        rejected_requests: filteredPurchases.filter(pr => pr.status === 'RECUSADO').length
      }
    };

    // Try to use the PDF generation function
    try {
      const pdfResponse = await base44.asServiceRole.functions.invoke('generateCustomPDF', {
        title: reportContent.title,
        content: formatReportContent(reportContent, allActivities, filteredPurchases),
        format: 'A4'
      });
      
      if (pdfResponse.data?.url) {
        return Response.json({ pdf_url: pdfResponse.data.url });
      }
    } catch (pdfErr) {
      console.error('PDF generation error:', pdfErr.message);
    }

    // Return summary as fallback
    return Response.json({
      success: true,
      report: reportContent,
      activities: allActivities,
      purchases: filteredPurchases
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function formatReportContent(reportContent, activities, purchases) {
  const lines = [
    `# ${reportContent.title}`,
    `Período: ${reportContent.period}`,
    '',
    '## Resumo Executivo',
    `- **Relatórios Submetidos**: ${reportContent.summary.total_reports}`,
    `- **Total de Atividades**: ${reportContent.summary.total_activities}`,
    `- **Público Total**: ${reportContent.summary.total_public.toLocaleString('pt-BR')}`,
    `- **Gastos Solicitados**: R$ ${reportContent.summary.total_expenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
    `- **Gastos Aprovados**: R$ ${reportContent.summary.total_approved.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`,
    '',
    '## Atividades por Classificação',
    `- **META**: ${reportContent.activities_by_classification.meta}`,
    `- **ROTINA**: ${reportContent.activities_by_classification.rotina}`,
    `- **EXTRA**: ${reportContent.activities_by_classification.extra}`,
    '',
    '## Compras e Contratações',
    `- **Total de Solicitações**: ${reportContent.purchase_summary.total_requests}`,
    `- **Aprovadas**: ${reportContent.purchase_summary.approved_requests}`,
    `- **Pendentes**: ${reportContent.purchase_summary.pending_requests}`,
    `- **Rejeitadas**: ${reportContent.purchase_summary.rejected_requests}`,
    ''
  ];

  if (activities.length > 0) {
    lines.push('## Principais Atividades');
    activities.slice(0, 10).forEach(a => {
      lines.push(`- ${a.titulo || a.nome || 'Sem título'} (${a.mes_referencia}) - Público: ${a.publico_estimado || 0}`);
    });
    lines.push('');
  }

  if (purchases.length > 0) {
    lines.push('## Principais Gastos');
    purchases.slice(0, 10).forEach(p => {
      lines.push(`- ${p.descricao_item} - R$ ${(p.valor_solicitado || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${p.status})`);
    });
  }

  return lines.join('\n');
}