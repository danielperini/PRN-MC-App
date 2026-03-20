import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function listAll(entityApi, orderBy = 'ordem_exibicao', pageSize = 200) {
  let all = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);

    if (!batch || batch.length === 0) break;

    all = all.concat(batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    let rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      200
    );

    rubricas = (rubricas || []).sort((a, b) => {
      const ordemA = toNumber(a?.ordem_exibicao);
      const ordemB = toNumber(b?.ordem_exibicao);
      if (ordemA !== ordemB) return ordemA - ordemB;

      return String(a?.rubrica || '').localeCompare(
        String(b?.rubrica || ''),
        'pt-BR'
      );
    });

    const total_previsto = rubricas.reduce(
      (sum, r) => sum + toNumber(r?.valor_rubrica),
      0
    );

    const total_utilizado = rubricas.reduce(
      (sum, r) => sum + toNumber(r?.valor_utilizado),
      0
    );

    const saldo_total = rubricas.reduce(
      (sum, r) => sum + toNumber(r?.saldo),
      0
    );

    return Response.json({
      success: true,
      total: rubricas.length,
      total_previsto,
      total_utilizado,
      saldo_total,
      rubricas,
    });
  } catch (error) {
    console.error('listAllRubricas error:', error);

    return Response.json(
      {
        success: false,
        error: error?.message || 'Erro ao listar rubricas',
      },
      { status: 500 }
    );
  }
});