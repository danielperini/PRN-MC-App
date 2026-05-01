import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { report_id } = await req.json();

    const report = await base44.asServiceRole.entities.Report.read(report_id);

    // Somar público de todas as atividades
    let totalPublico = 0;
    if (report.atividades && Array.isArray(report.atividades)) {
      totalPublico = report.atividades.reduce((sum, atividade) => {
        return sum + (atividade.publico_total || 0);
      }, 0);
    }

    // Atualizar relatório com o total calculado
    await base44.asServiceRole.entities.Report.update(report_id, {
      publico_total_contabilizado: totalPublico,
      data_contabilizacao_publico: new Date().toISOString(),
    });

    // Registrar auditoria
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'CONTABILIZAR_PUBLICO',
      entity_type: 'REPORT',
      entity_id: report_id,
      actor_email: 'sistema@automatico',
      actor_name: 'Sistema Automático',
      details: `Público total contabilizado: ${totalPublico} pessoas`,
    });

    return Response.json({
      sucesso: true,
      report_id,
      publico_contabilizado: totalPublico,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});