import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function computeSaldo(source: any) {
  const total = toNumber(source?.valor_total);
  const utilizado = toNumber(source?.valor_utilizado);
  const comprometido = toNumber(source?.saldo_comprometido);
  return total - utilizado - comprometido;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const valor = toNumber(body?.valor);
    const contexto = String(body?.contexto || '').toUpperCase();
    const userEmail = String(body?.user_email || '');

    if (!valor) {
      return Response.json({ ok: true });
    }

    const member = (await base44.entities.TeamMember.filter({ user_email: userEmail }))?.[0];

    const rubricaId = member?.rubrica_id;
    if (!rubricaId) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: true,
        saldo_insuficiente: false
      });
    }

    const rubrica = await base44.entities.Rubrica.get(rubricaId);

    const saldo = computeSaldo(rubrica);

    if (saldo < valor) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: false,
        saldo_insuficiente: true,
        saldo_disponivel: saldo
      });
    }

    return Response.json({
      ok: true,
      blocked_by_rubrica: false,
      saldo_insuficiente: false,
      saldo_disponivel: saldo,
      rubrica_id: rubricaId
    });

  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
});
