import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportId } = await req.json();
    
    if (!reportId) {
      return Response.json({ error: 'reportId obrigatório' }, { status: 400 });
    }

    const report = await base44.asServiceRole.entities.Report.get(reportId);
    if (!report) {
      return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });
    }

    // Buscar coordenadores do museu
    const coordinators = await base44.asServiceRole.entities.User.filter({
      role: 'COORDENADOR',
      museu: report.museu
    });

    const subject = `Novo Relatório Enviado para Revisão — ${report.author_name}`;
    const body = `Olá,\n\nUm novo relatório foi enviado e aguarda sua revisão:\n\n` +
      `Profissional: ${report.author_name}\n` +
      `Museu: ${report.museu}\n` +
      `Período: ${report.mes_referencia}/${report.ano}\n` +
      `Atividades: ${(report.atividades || []).length}\n\n` +
      `Acesse a plataforma para revisar: https://seu-app.com/CoordReview\n\n` +
      `Abraços,\nSistema de Relatórios`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    const allowedCoords = coordinators.filter(c => { if (c.email !== ALLOWED_EMAIL) { console.log('Email bloqueado:', c.email); return false; } return true; });

    // Enviar emails para todos os coordenadores do museu
    await Promise.all(
      allowedCoords.map(coord =>
        base44.integrations.Core.SendEmail({
          to: coord.email,
          subject,
          body,
          from_name: 'Museus Centro'
        })
      )
    );

    return Response.json({ success: true, coordsNotified: coordinators.length });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});