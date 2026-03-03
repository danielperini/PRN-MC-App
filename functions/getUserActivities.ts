import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Retorna as atividades de um usuário:
 * 1. Atividades do seu próprio relatório
 * 2. Atividades em que foi adicionado como membro da equipe
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar relatórios do usuário
    const userReports = await base44.entities.Report.filter({
      created_by: user.email
    }, '-created_date');

    // Buscar todas as atividades
    const allReports = await base44.entities.Report.list('-created_date', 500);
    
    // Coletar atividades do usuário
    const userActivities = [];

    // 1. Atividades dos relatórios do usuário
    userReports.forEach(report => {
      (report.atividades || []).forEach(activity => {
        userActivities.push({
          ...activity,
          report_id: report.id,
          report_author: user.full_name,
          report_mes: report.mes_referencia,
          report_ano: report.ano,
          origem: 'proprio'
        });
      });
    });

    // 2. Atividades em que o usuário foi adicionado como membro
    allReports.forEach(report => {
      (report.atividades || []).forEach(activity => {
        const equipeEnvolvida = activity.equipe_envolvida_lista || [];
        if (Array.isArray(equipeEnvolvida) && equipeEnvolvida.includes(user.email)) {
          userActivities.push({
            ...activity,
            report_id: report.id,
            report_author: report.author_name,
            report_mes: report.mes_referencia,
            report_ano: report.ano,
            origem: 'equipe'
          });
        }
      });
    });

    // Remover duplicatas
    const seen = new Set();
    const deduped = userActivities.filter(a => {
      const key = `${a.report_id}:${a.activity_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return Response.json({
      success: true,
      total: deduped.length,
      atividades: deduped.sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});