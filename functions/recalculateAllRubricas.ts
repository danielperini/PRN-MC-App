import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas as rubricas
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);

    // Buscar TODOS os lançamentos com paginação
    const pageSize = 500;
    let allLancamentos = [];
    let page = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.LancamentoRubrica.list('-created_date', pageSize, page * pageSize);
      if (!batch || batch.length === 0) break;
      allLancamentos = allLancamentos.concat(batch);
      if (batch.length < pageSize) break;
      page++;
    }

    // Indexar lançamentos por rubrica_id para eficiência
    const lancamentosPorRubrica = {};
    for (const l of allLancamentos) {
      if (!lancamentosPorRubrica[l.rubrica_id]) {
        lancamentosPorRubrica[l.rubrica_id] = [];
      }
      lancamentosPorRubrica[l.rubrica_id].push(l);
    }

    const results = [];
    for (const rubrica of rubricas) {
      const lans = lancamentosPorRubrica[rubrica.id] || [];

      const valorUtilizado = parseFloat(
        lans.reduce((sum, l) => sum + (parseFloat(l.valor) || 0), 0).toFixed(2)
      );
      const valorRubrica = parseFloat(rubrica.valor_rubrica) || 0;
      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado = valorRubrica > 0
        ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
        : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
      });

      results.push({
        rubrica: rubrica.rubrica,
        grupo: rubrica.grupo,
        num_lancamentos: lans.length,
        valor_rubrica: valorRubrica,
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
      });
    }

    const sumario = {
      total_rubricas: results.length,
      total_lancamentos: allLancamentos.length,
      valor_total_orcado: parseFloat(results.reduce((s, r) => s + r.valor_rubrica, 0).toFixed(2)),
      valor_total_utilizado: parseFloat(results.reduce((s, r) => s + r.valor_utilizado, 0).toFixed(2)),
      valor_total_saldo: parseFloat(results.reduce((s, r) => s + r.saldo, 0).toFixed(2)),
    };

    return Response.json({ success: true, sumario, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});