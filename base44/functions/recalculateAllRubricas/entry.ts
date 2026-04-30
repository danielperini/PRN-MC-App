import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function toNumber(value: any): number {
  const raw = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(p: any) {
  return toNumber(
    p?.valor_pago ||
    p?.valor_aprovado_admin ||
    p?.valor_aprovado ||
    p?.valor_final ||
    p?.valor_solicitado ||
    p?.valor_total ||
    p?.valor ||
    0
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Buscar todas rubricas
    const rubricas = await base44.asServiceRole.entities.Rubrica.list();

    // 2. Zerar tudo
    for (const r of rubricas) {
      const total = toNumber(r.valor_total || r.valor_rubrica);

      await base44.asServiceRole.entities.Rubrica.update(r.id, {
        valor_utilizado: 0,
        saldo_comprometido: 0,
        saldo_real: total,
        saldo: total,
        percentual_utilizado: 0
      });
    }

    // 3. Buscar todas compras aprovadas
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list();

    const aprovadas = purchases.filter(p =>
      ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(
        String(p.status || '').toUpperCase()
      )
    );

    // 4. Agrupar por rubrica
    const acumulado: Record<string, number> = {};

    for (const p of aprovadas) {
      if (!p.rubrica_id) continue;

      const valor = getPurchaseValue(p);

      acumulado[p.rubrica_id] =
        (acumulado[p.rubrica_id] || 0) + valor;
    }

    // 5. Atualizar rubricas
    for (const rubricaId of Object.keys(acumulado)) {
      const r = rubricas.find(x => x.id === rubricaId);
      if (!r) continue;

      const total = toNumber(r.valor_total || r.valor_rubrica);
      const utilizado = acumulado[rubricaId];

      const saldo = total - utilizado;
      const percentual = total > 0 ? (utilizado / total) * 100 : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado: utilizado,
        saldo_comprometido: 0,
        saldo_real: saldo,
        saldo: saldo,
        percentual_utilizado: percentual
      });
    }

    return json({
      success: true,
      totalRubricas: rubricas.length,
      totalComprasConsideradas: aprovadas.length
    });

  } catch (error: any) {
    return json({
      success: false,
      error: error.message
    }, 500);
  }
});
