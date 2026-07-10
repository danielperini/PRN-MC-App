import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, grupo, rubrica, centro_custo, valor_rubrica, valor_utilizado } = body;

    if (!id) return Response.json({ error: 'id é obrigatório' }, { status: 400 });

    const vr = Number(valor_rubrica) || 0;
    const vu = Number(valor_utilizado) || 0;
    const saldo = vr - vu;
    const percentual_utilizado = vr > 0 ? (vu / vr) * 100 : 0;

    const updated = await base44.asServiceRole.entities.Rubrica.update(id, {
      grupo,
      rubrica,
      centro_custo,
      valor_rubrica: vr,
      valor_utilizado: vu,
      saldo,
      saldo_real: saldo,
      percentual_utilizado,
    });

    return Response.json({ success: true, rubrica: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});