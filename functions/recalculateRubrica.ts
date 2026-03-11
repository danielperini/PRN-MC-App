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

    const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.filter({
      rubrica_id: rubricaId,
    }, '-created_date', 500);

    const valorUtilizado = lancamentos.reduce((sum, l) => sum + (l.valor || 0), 0);
    const saldo = rubrica.valor_rubrica - valorUtilizado;
    const percentualUtilizado = rubrica.valor_rubrica > 0
      ? Math.round((valorUtilizado / rubrica.valor_rubrica) * 100)
      : 0;

    await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
      valor_utilizado: Math.max(0, valorUtilizado),
      saldo: saldo,
      percentual_utilizado: percentualUtilizado,
    });

    return Response.json({ success: true, valor_utilizado: valorUtilizado, saldo, percentual_utilizado: percentualUtilizado });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});