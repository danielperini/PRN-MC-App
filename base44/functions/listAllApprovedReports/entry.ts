import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar todos os relatórios aprovados
    const approvedReports = await base44.asServiceRole.entities.Report.filter(
      { status: 'APPROVED' },
      '-updated_date',
      1000
    );

    // Enriquecer com informações adicionais
    const enriched = approvedReports.map(report => ({
      id: report.id,
      numero_protocolo: report.numero_protocolo,
      author_name: report.author_name,
      funcao: report.funcao,
      museu: report.museu,
      equipe: report.equipe,
      mes_referencia: report.mes_referencia,
      ano: report.ano,
      status: report.status,
      review_status: report.review_status,
      created_date: report.created_date,
      updated_date: report.updated_date,
      resumo_executivo: report.resumo_executivo?.slice(0, 150) || '-'
    }));

    return Response.json({
      success: true,
      total: enriched.length,
      relatorios: enriched,
      data_consulta: new Date().toISOString()
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});