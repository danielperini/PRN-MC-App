import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { rubricaId } = await req.json();

    if (!rubricaId) {
      return Response.json({ error: 'rubricaId required' }, { status: 400 });
    }

    const rubricas = await base44.asServiceRole.entities.Rubrica.filter({ id: rubricaId });
    const rubrica = rubricas?.[0];

    if (!rubrica) {
      return Response.json({ error: 'Rubrica not found' }, { status: 404 });
    }

    // Buscar TODOS os lançamentos da rubrica (sem limite fixo)
    const pageSize = 500;
    let allLancamentos = [];
    let page = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.LancamentoRubrica.filter(
        { rubrica_id: rubricaId },
        '-created_date',
        pageSize,
        page * pageSize
      );
      if (!batch || batch.length === 0) break;
      allLancamentos = allLancamentos.concat(batch);
      if (batch.length < pageSize) break;
      page++;
    }

    const valorUtilizado = parseFloat(
      allLancamentos.reduce((sum, l) => sum + (parseFloat(l.valor) || 0), 0).toFixed(2)
    );
    const valorRubrica = parseFloat(rubrica.valor_rubrica) || 0;
    const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
    const percentualUtilizado = valorRubrica > 0
      ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
      : 0;

    await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
      valor_utilizado: valorUtilizado,
      saldo,
      percentual_utilizado: percentualUtilizado,
    });

    return Response.json({
      success: true,
      rubrica: rubrica.rubrica,
      num_lancamentos: allLancamentos.length,
      valor_rubrica: valorRubrica,
      valor_utilizado: valorUtilizado,
      saldo,
      percentual_utilizado: percentualUtilizado,
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});