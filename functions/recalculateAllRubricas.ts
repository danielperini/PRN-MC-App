import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // No auth required - recalculation is safe read/write operation

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 200);
    const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.list('-created_date', 1000);

    const results = [];
    for (const rubrica of rubricas) {
      const rubricaLancamentos = lancamentos.filter(l => l.rubrica_id === rubrica.id);
      const valorUtilizado = rubricaLancamentos.reduce((sum, l) => sum + (l.valor || 0), 0);
      const saldo = (rubrica.valor_rubrica || 0) - valorUtilizado;
      const percentualUtilizado = rubrica.valor_rubrica > 0
        ? parseFloat(((valorUtilizado / rubrica.valor_rubrica) * 100).toFixed(2))
        : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: Math.max(0, valorUtilizado),
        saldo,
        percentual_utilizado: percentualUtilizado,
      });

      results.push({ rubrica: rubrica.rubrica, valor_utilizado: valorUtilizado, saldo, percentual_utilizado: percentualUtilizado });
    }

    return Response.json({ success: true, total_recalculadas: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});