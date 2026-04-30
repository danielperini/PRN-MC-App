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

function getPurchaseValue(p: any): number {
  return toNumber(
    p?.valor_pago ||
      p?.valor_aprovado_admin ||
      p?.valor_aprovado ||
      p?.valor_final ||
      p?.valor_solicitado ||
      p?.valor_total ||
      p?.valor ||
      p?.rubrica_debitada_valor ||
      0
  );
}

function isStatusAprovado(status: any): boolean {
  return ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(
    String(status || '').trim().toUpperCase()
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rubricas = await base44.asServiceRole.entities.Rubrica.list();
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list();

    const acumulado: Record<string, number> = {};

    for (const p of purchases || []) {
      if (!p?.rubrica_id) continue;
      if (!isStatusAprovado(p.status)) continue;

      const valor = getPurchaseValue(p);
      if (!valor || valor <= 0) continue;

      acumulado[p.rubrica_id] = (acumulado[p.rubrica_id] || 0) + valor;
    }

    for (const r of rubricas || []) {
      const total = toNumber(r.valor_total || r.valor_rubrica);
      const utilizado = toNumber(acumulado[r.id] || 0);
      const saldo = total - utilizado;
      const percentual = total > 0 ? (utilizado / total) * 100 : 0;

      await base44.asServiceRole.entities.Rubrica.update(r.id, {
        valor_utilizado: utilizado,
        saldo_real: saldo,
        saldo,
        percentual_utilizado: percentual
      });
    }

    return json({
      success: true,
      totalRubricas: rubricas.length,
      totalComprasConsideradas: Object.values(acumulado).length,
      regra: 'APROVADO = UTILIZADO'
    });
  } catch (error: any) {
    console.error('recalculateAllRubricas error:', error);

    return json(
      {
        success: false,
        error: error?.message || 'Erro ao recalcular rubricas.'
      },
      500
    );
  }
});
