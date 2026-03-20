import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildRubricaKey(r) {
  return `${normalizeString(r?.grupo)}__${normalizeString(
    r?.rubrica || r?.nome || r?.descricao
  )}`;
}

async function listAll(api, orderBy = '', pageSize = 500) {
  let all = [];
  let page = 0;

  while (true) {
    const batch = await api.list(orderBy, pageSize, page * pageSize);
    if (!batch?.length) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

function resolveRubrica(purchase, rubricas, budgetLineById) {
  // 1. já tem rubrica
  if (purchase.rubrica_id) {
    return purchase.rubrica_id;
  }

  const blId =
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id;

  if (blId) {
    const bl = budgetLineById[blId];

    if (bl?.rubrica_id) {
      return bl.rubrica_id;
    }

    // tentativa por nome
    const nomeBL = normalizeString(
      bl?.descricao || bl?.nome || bl?.rubrica || ''
    );

    if (nomeBL) {
      const matches = rubricas.filter((r) => {
        const nomeR = normalizeString(
          r?.rubrica || r?.nome || r?.descricao
        );
        return nomeR === nomeBL;
      });

      if (matches.length === 1) {
        return matches[0].id;
      }
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [purchases, rubricasRaw, budgetLines] = await Promise.all([
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date'),
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao'),
      listAll(base44.asServiceRole.entities.BudgetLine, 'descricao')
    ]);

    // 🔥 remover duplicadas
    const rubricasMap = new Map();
    for (const r of rubricasRaw) {
      const key = r.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      }
    }

    const rubricas = Array.from(rubricasMap.values());

    const budgetLineById = {};
    for (const bl of budgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const corrigidas = [];
    const ignoradas = [];

    for (const p of purchases) {
      const status = String(p.status || '').toUpperCase();

      const precisaCorrigir =
        (status === 'PAGO' ||
          status === 'APROVADO_COORD' ||
          status === 'APROVADO_ADMIN') &&
        !p.rubrica_id;

      if (!precisaCorrigir) continue;

      const rubricaId = resolveRubrica(p, rubricas, budgetLineById);

      if (!rubricaId) {
        ignoradas.push({
          id: p.id,
          motivo: 'Não foi possível resolver'
        });
        continue;
      }

      try {
        await base44.asServiceRole.entities.PurchaseRequest.update(p.id, {
          rubrica_id: rubricaId
        });

        corrigidas.push({
          id: p.id,
          rubrica_id: rubricaId
        });

      } catch (e) {
        ignoradas.push({
          id: p.id,
          motivo: e.message
        });
      }
    }

    // 🔁 RECALCULAR TUDO
    try {
      await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
        trigger: 'fix_rubricas'
      });
    } catch (e) {
      console.error('Erro ao recalcular:', e.message);
    }

    return Response.json({
      success: true,
      total_analisadas: purchases.length,
      corrigidas: corrigidas.length,
      ignoradas: ignoradas.length,
      detalhes_corrigidas: corrigidas,
      detalhes_ignoradas: ignoradas
    });

  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});
