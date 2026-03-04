import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Apenas verificar se é admin
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Calcular últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Buscar relatórios dos últimos 30 dias
    const reports = await base44.asServiceRole.entities.Report.list('-updated_date', 500);
    const recentReports = reports.filter(r => {
      const updatedDate = new Date(r.updated_date);
      return updatedDate >= thirtyDaysAgo;
    });

    // Buscar atividades associadas
    const activityIds = [];
    for (const report of recentReports) {
      if (Array.isArray(report.atividades)) {
        report.atividades.forEach(a => {
          if (a.id) activityIds.push(a.id);
        });
      }
    }

    // Log de sucesso
    console.log(`[DASHBOARD REFRESH] ${recentReports.length} relatórios atualizados (últimos 30 dias)`);

    return Response.json({ 
      success: true, 
      reportsCount: recentReports.length,
      activitiesCount: activityIds.length,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao atualizar dashboard:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});