import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a admins' }, { status: 403 });
    }

    // Buscar todos os relatórios
    const allReports = await base44.asServiceRole.entities.Report.list('-updated_date', 2000);
    
    // Buscar relatórios de Wanda e outros que foram "perdidos" (status ≠ APPROVED)
    const lostReports = allReports.filter(r => 
      r.author_name?.toLowerCase().includes('wanda') || 
      r.review_status === 'revisao_concluida' ||
      (r.status !== 'APPROVED' && r.status !== 'DRAFT' && r.status !== 'ARCHIVED')
    );

    // Recuperar - marcar como APPROVED e registrar
    const recovered = [];
    const errors = [];

    for (const report of lostReports) {
      try {
        if (report.status !== 'APPROVED') {
          await base44.asServiceRole.entities.Report.update(report.id, {
            status: 'APPROVED',
            review_status: 'revisao_concluida'
          });
          
          recovered.push({
            id: report.id,
            numero_protocolo: report.numero_protocolo,
            author_name: report.author_name,
            mes_referencia: report.mes_referencia,
            ano: report.ano,
            status_anterior: report.status
          });
        }
      } catch (e) {
        errors.push({
          report_id: report.id,
          error: e.message
        });
      }
    }

    return Response.json({
      success: true,
      message: `${recovered.length} relatórios aprovados resgatados`,
      recovered,
      errors,
      total_lost_found: lostReports.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});