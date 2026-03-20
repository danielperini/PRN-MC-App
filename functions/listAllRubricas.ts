import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function listAll(entityApi: any, orderBy = 'ordem_exibicao', pageSize = 200) {
  let all: any[] = [];
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

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
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

    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      200
    );

    const ordenadas = [...rubricas].sort((a, b) => {
      const ordemA = toNumber(a?.ordem_exibicao);
      const ordemB = toNumber(b?.ordem_exibicao);
      if (ordemA !== ordemB) return ordemA - ordemB;

      const grupoA = String(a?.grupo || '').localeCompare(String(b?.grupo || ''), 'pt-BR');
      if (grupoA !== 0) return grupoA;

      return String(a?.rubrica || '').localeCompare(String(b?.rubrica || ''), 'pt-BR');
    });

    const totalPrevisto = ordenadas.reduce(
      (sum, r) => sum + toNumber(r?.valor_rubrica),
      0
    );
    const totalUtilizado = ordenadas.reduce(
      (sum, r) => sum + toNumber(r?.valor_utilizado),
      0
    );
    const saldoTotal = ordenadas.reduce(
      (sum, r) => sum + toNumber(r?.saldo),
      0
    );

    return Response.json({
      success: true,
      total: ordenadas.length,
      total_previsto: totalPrevisto,
      total_utilizado: totalUtilizado,
      saldo_total: saldoTotal,
      rubricas: ordenadas,
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