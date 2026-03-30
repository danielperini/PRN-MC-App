import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DEFAULT_MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value) {
  const raw = normalizeString(value);
  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw.includes('museu da imagem e do som') || raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('historico abilio barreto') || raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';
  return String(value || '').trim().toUpperCase();
}

function buildRubricaKey(rubrica) {
  const grupo = normalizeString(rubrica?.grupo || '');
  const nome = normalizeString(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '');
  const museu = normalizeMuseu(rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || '');
  return `${grupo}__${nome}__${museu || 'GLOBAL'}`;
}

function buildRubricaMuseuKey(rubricaId, museu) {
  return `${rubricaId}__${normalizeMuseu(museu) || 'SEM_MUSEU'}`;
}

function getPurchaseValue(purchase) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getPurchaseCentroCusto(purchase) {
  return normalizeMuseu(purchase?.centro_custo || purchase?.museu || purchase?.museu_codigo || purchase?.unidade || '');
}

function getRubricaCentroCusto(rubrica) {
  return normalizeMuseu(rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || rubrica?.unidade || '');
}

function getBudgetLineCentroCusto(bl) {
  return normalizeMuseu(bl?.centro_custo || bl?.museu || bl?.museu_codigo || bl?.unidade || '');
}

function getLancamentoCentroCusto(l) {
  return normalizeMuseu(l?.centro_custo || l?.museu || l?.museu_codigo || l?.unidade || '');
}

function sameMuseuOrGlobal(entityMuseu, itemMuseu) {
  if (!itemMuseu) return true;
  if (!entityMuseu) return true;
  return entityMuseu === itemMuseu;
}

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractPlanValueFromObject(obj, museu) {
  if (!obj) return 0;
  const nm = normalizeMuseu(museu);
  for (const key of [nm, nm.toLowerCase(), nm.toUpperCase()]) {
    if (key in obj) return toNumber(obj[key]);
  }
  return 0;
}

function isEquipeEGestao(rubrica) {
  const grupo = normalizeString(rubrica?.grupo || '');
  return grupo.includes('equipe') || grupo.includes('gestao') || grupo.includes('gestão');
}

function getRubricaPlannedDistribution(rubrica, options) {
  const museusBase = Array.from(
    new Set((options?.museusConsiderados || DEFAULT_MUSEUS).map((m) => normalizeMuseu(m)).filter(Boolean))
  );
  const totalRubrica = toNumber(rubrica?.valor_rubrica);

  const explicitMap = {
    MIS: toNumber(rubrica?.valor_mis ?? rubrica?.orcado_mis ?? rubrica?.planejado_mis),
    MHAB: toNumber(rubrica?.valor_mhab ?? rubrica?.orcado_mhab ?? rubrica?.planejado_mhab),
    MUMO: toNumber(rubrica?.valor_mumo ?? rubrica?.orcado_mumo ?? rubrica?.planejado_mumo),
  };

  const jsonDistribuicao =
    safeJsonParse(rubrica?.distribuicao_por_museu_json) ||
    safeJsonParse(rubrica?.rateio_por_museu_json) ||
    safeJsonParse(rubrica?.orcamento_por_museu_json) ||
    safeJsonParse(rubrica?.saldo_por_museu_json);

  const distribuicao = {};
  let hasExplicit = false;
  for (const museu of museusBase) {
    const v = explicitMap[museu] || extractPlanValueFromObject(jsonDistribuicao, museu);
    if (v > 0) { distribuicao[museu] = v; hasExplicit = true; }
  }
  if (hasExplicit) return { mode: 'explicit', total: totalRubrica, byMuseu: distribuicao };

  const rubricaMuseu = getRubricaCentroCusto(rubrica);
  if (rubricaMuseu) return { mode: 'single_museu', total: totalRubrica, byMuseu: { [rubricaMuseu]: totalRubrica } };

  if (options?.splitEvenlyByMuseu && museusBase.length > 0) {
    const valorBase = Number((totalRubrica / museusBase.length).toFixed(2));
    const dist = {};
    let acc = 0;
    museusBase.forEach((museu, i) => {
      if (i === museusBase.length - 1) { dist[museu] = Number((totalRubrica - acc).toFixed(2)); }
      else { dist[museu] = valorBase; acc += valorBase; }
    });
    return { mode: 'equal_split', total: totalRubrica, byMuseu: dist };
  }

  return { mode: 'global_only', total: totalRubrica, byMuseu: {} };
}

async function listAll(entityApi, orderBy, pageSize = 500) {
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

function resolveRubricaFromPurchase(purchase, rubricas, budgetLineById) {
  const purchaseMuseu = getPurchaseCentroCusto(purchase);

  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);
    if (rubrica) {
      const rubricaMuseu = getRubricaCentroCusto(rubrica);
      if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
        return { rubricaId: null, rubricaMuseu: null, purchaseMuseu, origem: 'rubrica_id_incompativel_museu', motivo: `Rubrica no museu ${rubricaMuseu}, compra em ${purchaseMuseu}` };
      }
      return { rubricaId: rubrica.id, rubricaMuseu, purchaseMuseu, origem: 'rubrica_id', motivo: null };
    }
  }

  const blId = purchase?.budgetline_id || purchase?.budget_line_id || purchase?.linha_orcamentaria_id;
  if (blId) {
    const bl = budgetLineById[blId];
    if (!bl) return { rubricaId: null, rubricaMuseu: null, purchaseMuseu, origem: 'budgetline_nao_encontrada', motivo: 'BudgetLine não encontrada' };
    const budgetMuseu = getBudgetLineCentroCusto(bl);
    if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
      return { rubricaId: null, rubricaMuseu: null, purchaseMuseu, origem: 'budgetline_incompativel_museu', motivo: `BudgetLine no museu ${budgetMuseu}, compra em ${purchaseMuseu}` };
    }
    if (bl?.rubrica_id) {
      const rubrica = rubricas.find((r) => r.id === bl.rubrica_id);
      if (rubrica) {
        const rubricaMuseu = getRubricaCentroCusto(rubrica);
        if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
          return { rubricaId: null, rubricaMuseu: null, purchaseMuseu, origem: 'budgetline_rubrica_incompativel_museu', motivo: `Rubrica da BudgetLine no museu ${rubricaMuseu}` };
        }
        return { rubricaId: rubrica.id, rubricaMuseu, purchaseMuseu, origem: 'budgetline_id', motivo: null };
      }
    }
  }

  return { rubricaId: null, rubricaMuseu: null, purchaseMuseu, origem: 'nao_encontrada', motivo: 'Rubrica não resolvida' };
}

// ──────────────────────────────────────────────────────────────────────────────
// DEDUP de TeamPayment para rubricas de Equipe e Gestão
// Chave única: team_member_id + mes_referencia + ano
// Impede que a mesma parcela seja somada duas vezes para o mesmo profissional
// ──────────────────────────────────────────────────────────────────────────────
function buildTeamPaymentDeduped(allTeamPayments) {
  const seen = new Set();
  const deduped = [];
  const APPROVED_STATUSES = new Set([
    'APROVADO', 'PAGO', 'APROVADO_COORD',
    'ENCAMINHADO_COORD_ADMIN', 'APROVADO_ADMIN', 'FINALIZADO',
  ]);

  for (const tp of allTeamPayments) {
    const status = normalizeStatus(tp.status);
    if (!APPROVED_STATUSES.has(status)) continue;

    const key = `${tp.team_member_id}__${String(tp.mes_referencia || '').toLowerCase()}__${tp.ano}`;
    if (seen.has(key)) continue; // duplicata: mesma pessoa, mesmo período

    seen.add(key);
    deduped.push(tp);
  }

  return deduped;
}

// Mapeia team_member_id → rubrica_id via TeamMember.rubrica_id ou por correspondência de função
function buildTeamPaymentByRubrica(dedupedPayments, teamMemberById) {
  const byRubrica = {};

  for (const tp of dedupedPayments) {
    const member = teamMemberById[tp.team_member_id];
    const rubricaId = tp.rubrica_id || member?.rubrica_id || null;

    if (!rubricaId) continue;

    if (!byRubrica[rubricaId]) byRubrica[rubricaId] = [];

    const valor =
      toNumber(tp.valor_nf) ||
      toNumber(tp.valor_parcela_previsto) ||
      toNumber(tp.nf_valor_extraido) ||
      0;

    byRubrica[rubricaId].push({ team_payment_id: tp.id, valor, member_id: tp.team_member_id });
  }

  return byRubrica;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const splitEvenlyByMuseu = Boolean(body?.split_evenly_by_museu);

    const [rubricasRaw, allLancamentos, allPurchases, allBudgetLines, allTeamPayments, allTeamMembers] =
      await Promise.all([
        listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
        listAll(base44.asServiceRole.entities.LancamentoRubrica, '-created_date', 500),
        listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
        listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
        listAll(base44.asServiceRole.entities.TeamPayment, '-created_date', 500),
        listAll(base44.asServiceRole.entities.TeamMember, 'nome', 500),
      ]);

    // Dedup de rubricas
    const rubricasMap = new Map();
    const rubricasDuplicadas = [];
    for (const r of rubricasRaw) {
      const key = r?.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) rubricasMap.set(key, r);
      else rubricasDuplicadas.push(r);
    }
    const rubricas = Array.from(rubricasMap.values());

    const rubricaById = {};
    for (const r of rubricas) { if (r?.id) rubricaById[r.id] = r; }

    const budgetLineById = {};
    for (const bl of allBudgetLines) { if (bl?.id) budgetLineById[bl.id] = bl; }

    const teamMemberById = {};
    for (const tm of allTeamMembers) { if (tm?.id) teamMemberById[tm.id] = tm; }

    // TeamPayments dedupados por pessoa+período (máx 1 por profissional por competência)
    const dedupedTeamPayments = buildTeamPaymentDeduped(allTeamPayments);
    const teamPaymentsByRubrica = buildTeamPaymentByRubrica(dedupedTeamPayments, teamMemberById);

    // Museus detectados
    const museusDetectados = new Set(DEFAULT_MUSEUS);
    for (const p of allPurchases) { const m = getPurchaseCentroCusto(p); if (m) museusDetectados.add(m); }
    for (const r of rubricas) { const m = getRubricaCentroCusto(r); if (m) museusDetectados.add(m); }
    for (const bl of allBudgetLines) { const m = getBudgetLineCentroCusto(bl); if (m) museusDetectados.add(m); }
    const allMuseus = Array.from(museusDetectados).filter(Boolean);

    // Lançamentos por rubrica
    const lancamentosPorRubrica = {};
    const lancamentosPorRubricaMuseu = {};
    const lancamentosSemRubrica = [];
    const lancamentosInconsistentesMuseu = [];

    for (const l of allLancamentos) {
      if (!l?.rubrica_id) { lancamentosSemRubrica.push(l); continue; }
      const rubrica = rubricaById[l.rubrica_id];
      if (!rubrica) { lancamentosSemRubrica.push(l); continue; }

      const lancMuseu = getLancamentoCentroCusto(l);
      const rubMuseu = getRubricaCentroCusto(rubrica);
      if (lancMuseu && rubMuseu && lancMuseu !== rubMuseu) { lancamentosInconsistentesMuseu.push(l); continue; }

      // Para rubricas de Equipe e Gestão, NÃO somar lançamentos que já estão
      // cobertos pelos TeamPayments dedupados (evita dupla contagem)
      if (isEquipeEGestao(rubrica) && teamPaymentsByRubrica[l.rubrica_id]?.length > 0) {
        // Lançamento referente a equipe já contabilizado via TeamPayment — ignorar
        continue;
      }

      if (!lancamentosPorRubrica[l.rubrica_id]) lancamentosPorRubrica[l.rubrica_id] = [];
      lancamentosPorRubrica[l.rubrica_id].push(l);

      if (lancMuseu) {
        const ck = buildRubricaMuseuKey(l.rubrica_id, lancMuseu);
        if (!lancamentosPorRubricaMuseu[ck]) lancamentosPorRubricaMuseu[ck] = [];
        lancamentosPorRubricaMuseu[ck].push(l);
      }
    }

    // Compras por rubrica
    const comprasPagasPorRubrica = {};
    const comprasAprovadasPorRubrica = {};
    const comprasPagasPorRubricaMuseu = {};
    const comprasAprovadasPorRubricaMuseu = {};
    const unmatchedPaidPurchases = [];
    const inconsistentMuseuPurchases = [];

    for (const purchase of allPurchases) {
      const status = normalizeStatus(purchase.status);
      const resolved = resolveRubricaFromPurchase(purchase, rubricas, budgetLineById);

      if (!resolved.rubricaId) {
        const issue = { purchase_id: purchase.id, titulo: purchase.titulo || '', valor: getPurchaseValue(purchase), status: purchase.status, motivo: resolved.motivo, origem: resolved.origem };
        if (status === 'PAGO') unmatchedPaidPurchases.push(issue);
        else inconsistentMuseuPurchases.push(issue);
        continue;
      }

      const rubricaId = resolved.rubricaId;
      const rubrica = rubricaById[rubricaId];
      const purchaseMuseu = resolved.purchaseMuseu || '';
      const ck = purchaseMuseu ? buildRubricaMuseuKey(rubricaId, purchaseMuseu) : '';

      // Para rubricas de Equipe e Gestão, compras também podem representar pagamentos de equipe —
      // só soma se já não há TeamPayments dedupados cobrindo essa rubrica
      const skipEquipe = isEquipeEGestao(rubrica) && (teamPaymentsByRubrica[rubricaId]?.length > 0);

      if (!skipEquipe) {
        if (status === 'PAGO') {
          if (!comprasPagasPorRubrica[rubricaId]) comprasPagasPorRubrica[rubricaId] = [];
          comprasPagasPorRubrica[rubricaId].push(purchase);
          if (ck) {
            if (!comprasPagasPorRubricaMuseu[ck]) comprasPagasPorRubricaMuseu[ck] = [];
            comprasPagasPorRubricaMuseu[ck].push(purchase);
          }
        }
        if (status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD') {
          if (!comprasAprovadasPorRubrica[rubricaId]) comprasAprovadasPorRubrica[rubricaId] = [];
          comprasAprovadasPorRubrica[rubricaId].push(purchase);
          if (ck) {
            if (!comprasAprovadasPorRubricaMuseu[ck]) comprasAprovadasPorRubricaMuseu[ck] = [];
            comprasAprovadasPorRubricaMuseu[ck].push(purchase);
          }
        }
      }
    }

    // Cálculo por rubrica
    const results = [];
    const overviewByMuseu = {};
    for (const museu of allMuseus) {
      overviewByMuseu[museu] = { valor_orcado: 0, valor_pago: 0, valor_comprometido: 0, valor_lancamentos: 0, valor_utilizado: 0, saldo: 0, total_rubricas: 0 };
    }

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;
      const rubricaKey = rubrica.rubrica_key || buildRubricaKey(rubrica);

      const lans = lancamentosPorRubrica[rubricaId] || [];
      const comprasPagas = comprasPagasPorRubrica[rubricaId] || [];
      const comprasAprovadas = comprasAprovadasPorRubrica[rubricaId] || [];

      // Para Equipe e Gestão: valor vem dos TeamPayments dedupados (1 por pessoa por período)
      // Para demais grupos: valor vem de compras + lançamentos normalmente
      let valorEquipe = 0;
      if (isEquipeEGestao(rubrica) && teamPaymentsByRubrica[rubricaId]?.length > 0) {
        valorEquipe = Number(
          teamPaymentsByRubrica[rubricaId].reduce((s, tp) => s + tp.valor, 0).toFixed(2)
        );
      }

      const valorLancamentos = Number(lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2));
      const valorPago = Number(comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
      const valorComprometido = Number(comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));

      // REGRA CRÍTICA: Para Equipe e Gestão, APENAS TeamPayments PAGO (máx 1 por pessoa/período)
      // Não soma compras + lançamentos + comprometido nessas rubricas
      const valorUtilizado = isEquipeEGestao(rubrica)
        ? valorEquipe
        : Number((valorEquipe + valorPago + valorComprometido + valorLancamentos).toFixed(2));

      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const saldo = Number((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado = valorRubrica > 0 ? Number(((valorUtilizado / valorRubrica) * 100).toFixed(2)) : 0;

      const distribution = getRubricaPlannedDistribution(rubrica, { splitEvenlyByMuseu, museusConsiderados: allMuseus });

      const detalhamentoPorMuseu = allMuseus.map((museu) => {
        const ck = buildRubricaMuseuKey(rubricaId, museu);
        const lansMuseu = lancamentosPorRubricaMuseu[ck] || [];
        const cpMuseu = comprasPagasPorRubricaMuseu[ck] || [];
        const caMuseu = comprasAprovadasPorRubricaMuseu[ck] || [];

        const vlMuseu = Number(lansMuseu.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2));
        const vpMuseu = Number(cpMuseu.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
        const vcMuseu = Number(caMuseu.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
        const vuMuseu = Number((vpMuseu + vcMuseu + vlMuseu).toFixed(2));

        const vpPlanejado = Number(toNumber(distribution.byMuseu[museu] ?? 0).toFixed(2));
        const saldoMuseu = vpPlanejado > 0 ? Number((vpPlanejado - vuMuseu).toFixed(2)) : null;
        const percMuseu = vpPlanejado > 0 ? Number(((vuMuseu / vpPlanejado) * 100).toFixed(2)) : null;

        if (vpPlanejado > 0 || vuMuseu > 0) {
          if (!overviewByMuseu[museu]) overviewByMuseu[museu] = { valor_orcado: 0, valor_pago: 0, valor_comprometido: 0, valor_lancamentos: 0, valor_utilizado: 0, saldo: 0, total_rubricas: 0 };
          overviewByMuseu[museu].valor_orcado = Number((overviewByMuseu[museu].valor_orcado + vpPlanejado).toFixed(2));
          overviewByMuseu[museu].valor_pago = Number((overviewByMuseu[museu].valor_pago + vpMuseu).toFixed(2));
          overviewByMuseu[museu].valor_comprometido = Number((overviewByMuseu[museu].valor_comprometido + vcMuseu).toFixed(2));
          overviewByMuseu[museu].valor_lancamentos = Number((overviewByMuseu[museu].valor_lancamentos + vlMuseu).toFixed(2));
          overviewByMuseu[museu].valor_utilizado = Number((overviewByMuseu[museu].valor_utilizado + vuMuseu).toFixed(2));
          overviewByMuseu[museu].saldo = Number((overviewByMuseu[museu].saldo + (saldoMuseu ?? 0)).toFixed(2));
          overviewByMuseu[museu].total_rubricas += 1;
        }

        return { museu, valor_planejado: vpPlanejado, valor_pago: vpMuseu, valor_comprometido: vcMuseu, valor_lancamentos: vlMuseu, valor_utilizado: vuMuseu, saldo: saldoMuseu, percentual_utilizado: percMuseu, distribuicao_mode: distribution.mode };
      });

      results.push({
        rubrica_id: rubricaId,
        rubrica: rubrica.rubrica || rubrica.nome || null,
        grupo: rubrica.grupo || null,
        rubrica_key: rubricaKey,
        centro_custo: getRubricaCentroCusto(rubrica) || null,
        eh_equipe_gestao: isEquipeEGestao(rubrica),
        num_team_payments_deduped: (teamPaymentsByRubrica[rubricaId] || []).length,
        valor_equipe_deduped: isEquipeEGestao(rubrica) ? valorEquipe : null,
        num_compras_pagas: comprasPagas.length,
        num_compras_aprovadas: comprasAprovadas.length,
        num_lancamentos: lans.length,
        valor_pago: valorPago,
        valor_comprometido: valorComprometido,
        valor_lancamentos: valorLancamentos,
        valor_utilizado: valorUtilizado,
        valor_rubrica: valorRubrica,
        saldo,
        percentual_utilizado: percentualUtilizado,
        distribuicao_mode: distribution.mode,
        detalhamento_por_museu: detalhamentoPorMuseu,
        _update: { valor_utilizado: valorUtilizado, saldo, percentual_utilizado: percentualUtilizado, rubrica_key: rubricaKey },
      });
    }

    // Persistir
    const BATCH = 5;
    let updated = 0;
    for (let i = 0; i < results.length; i += BATCH) {
      const lote = results.slice(i, i + BATCH);
      try {
        await Promise.all(lote.map((r) => base44.asServiceRole.entities.Rubrica.update(r.rubrica_id, r._update)));
        updated += lote.length;
      } catch (e) {
        console.error('Erro ao atualizar lote:', e?.message || e);
      }
    }

    const valor_total_orcado = Number(results.reduce((s, r) => s + toNumber(r.valor_rubrica), 0).toFixed(2));
    const valor_total_utilizado = Number(results.reduce((s, r) => s + toNumber(r.valor_utilizado), 0).toFixed(2));
    const valor_total_saldo = Number(results.reduce((s, r) => s + toNumber(r.saldo), 0).toFixed(2));

    const TETO_CORRETO = 1320000;
    const diferenca_total = Number((valor_total_orcado - TETO_CORRETO).toFixed(2));

    return Response.json({
      success: true,
      trigger: body?.trigger || null,
      sumario: {
        total_rubricas_raw: rubricasRaw.length,
        total_rubricas_unicas: results.length,
        total_duplicadas_detectadas: rubricasDuplicadas.length,
        total_atualizadas: updated,
        total_compras: allPurchases.length,
        total_lancamentos: allLancamentos.length,
        total_team_payments: allTeamPayments.length,
        total_team_payments_deduped: dedupedTeamPayments.length,
        valor_total_orcado,
        valor_total_utilizado,
        valor_total_saldo,
        teto_correto: TETO_CORRETO,
        diferenca_total,
        total_esta_correto: Math.abs(diferenca_total) < 0.01,
        compras_pagas_nao_vinculadas: unmatchedPaidPurchases.length,
        compras_inconsistentes_museu: inconsistentMuseuPurchases.length,
        lancamentos_sem_rubrica: lancamentosSemRubrica.length,
        lancamentos_inconsistentes_museu: lancamentosInconsistentesMuseu.length,
        museus_detectados: allMuseus,
        sumario_por_museu: Object.entries(overviewByMuseu).map(([museu, d]) => ({ museu, ...d })).sort((a, b) => a.museu.localeCompare(b.museu)),
        split_evenly_by_museu: splitEvenlyByMuseu,
      },
      inconsistencias: {
        compras_pagas_nao_vinculadas: unmatchedPaidPurchases,
        compras_inconsistentes_museu: inconsistentMuseuPurchases,
        lancamentos_sem_rubrica: lancamentosSemRubrica,
        lancamentos_inconsistentes_museu: lancamentosInconsistentesMuseu,
      },
      duplicadas: rubricasDuplicadas.map((r) => ({ id: r.id, grupo: r.grupo || null, rubrica: r.rubrica || r.nome || null, rubrica_key: r.rubrica_key || buildRubricaKey(r) })),
      results,
    });
  } catch (error) {
    console.error('recalculateAllRubricas error:', error);
    return Response.json({ error: error?.message || String(error), success: false }, { status: 500 });
  }
});