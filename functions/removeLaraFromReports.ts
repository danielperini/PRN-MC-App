import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Busca todos os relatórios com author_name = "Lara"
    const reports = await base44.asServiceRole.entities.Report.filter({ author_name: "Lara" });

    if (reports.length === 0) {
      return Response.json({ message: 'Nenhum relatório encontrado com o nome Lara', removed: 0 });
    }

    // Remove o nome de cada relatório
    for (const report of reports) {
      await base44.asServiceRole.entities.Report.update(report.id, {
        author_name: "[Removido]"
      });
    }

    return Response.json({ 
      message: `${reports.length} relatório(s) atualizado(s)`,
      removed: reports.length,
      reportIds: reports.map(r => r.id)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});