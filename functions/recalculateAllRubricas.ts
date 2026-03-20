import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(v) {
  return String(v || '').trim().toUpperCase();
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
  return `${normalizeString(r?.grupo)}__${normalizeString(r?.rubrica)}`;
}

function getPurchaseValue(p) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_solicitado) ||
    0
  );
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [rubricasRaw, compras, lancamentos] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao'),
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date'),
      listAll(base44.asServiceRole.entities.LancamentoRubrica, '-created_date')
    ]);

    // 🔥 REMOVE DUPLICADAS (CORE)
    const rubricasMap = new Map();

    for (const r of rubricasRaw) {
      const key = r.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      }
    }

    const rubricas = Array.from(rubricasMap.values());

    // 🔥 INDEXAÇÃO
    const comprasPorRubrica = {};
    const comprasAprovadasPorRubrica = {};
    const lancamentosPorRubrica = {};

    for (const l of lancamentos) {
      if (!l.rubrica_id) continue;
      if (!lancamentosPorRubrica[l.rubrica_id]) {
        lancamentosPorRubrica[l.rubrica_id] = [];
      }
      lancamentosPorRubrica[l.rubrica_id].push(l);
    }

    for (const p of compras) {
      const status = normalizeStatus(p.status);
      const rubricaId = p.rubrica_id;

      if (!rubricaId) continue;

      if (status === 'PAGO') {
        if (!comprasPorRubrica[rubricaId]) {
          comprasPorRubrica[rubricaId] = [];
        }
        comprasPorRubrica[rubricaId].push(p);
      }

      if (status === 'APROVADO_COORD' || status === 'APROVADO_ADMIN') {
        if (!comprasAprovadasPorRubrica[rubricaId]) {
          comprasAprovadasPorRubrica[rubricaId] = [];
        }
        comprasAprovadasPorRubrica[rubricaId].push(p);
      }
    }

    const results = [];

    for (const r of rubricas) {
      const id = r.id;

      const pagos = comprasPorRubrica[id] || [];
      const aprovados = comprasAprovadasPorRubrica[id] || [];
      const lans = lancamentosPorRubrica[id] || [];

      // 🔥 CORREÇÃO CRÍTICA: SEM DUPLA CONTAGEM
      const valorPago = pagos.reduce((s, p) => s + getPurchaseValue(p), 0);
      const valorComprometido = aprovados.reduce((s, p) => s + getPurchaseValue(p), 0);
      const valorLanc = lans.reduce((s, l) => s + toNumber(l.valor), 0);

      const valorUtilizado = valorPago + valorComprometido + valorLanc;

      const total = toNumber(r.valor_rubrica);
      const saldo = total - valorUtilizado;

      const percentual = total > 0 ? (valorUtilizado / total) * 100 : 0;

      results.push({
        id,
        valor_utilizado: Number(valorUtilizado.toFixed(2)),
        saldo: Number(saldo.toFixed(2)),
        percentual_utilizado: Number(percentual.toFixed(2))
      });
    }

    // 🔥 UPDATE SEGURO
    for (const r of results) {
      try {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          valor_utilizado: r.valor_utilizado,
          saldo: r.saldo,
          percentual_utilizado: r.percentual_utilizado
        });
      } catch {}
    }

    return Response.json({
      success: true,
      total_rubricas: results.length
    });

  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});