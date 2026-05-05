import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const KEYWORD_TO_CATEGORIA = [
  ['exposi', 'exposicao'],
  ['expograf', 'exposicao'],
  ['som e luz', 'som_luz'],
  ['som/luz', 'som_luz'],
  ['acao educativa', 'acoes_educativas'],
  ['ações educativas', 'acoes_educativas'],
  ['acoes educativas', 'acoes_educativas'],
  ['diaria', 'diarias_educador'],
  ['diária', 'diarias_educador'],
  ['lanche', 'lanches'],
  ['buffet', 'lanches'],
  ['alimentac', 'alimentacao_cartao'],
  ['material', 'material'],
  ['manutenc', 'manutencao'],
  ['manuten', 'manutencao'],
  ['educador', 'educador'],
  ['noturno', 'noturno'],
  ['publicac', 'publicacoes'],
  ['publicaç', 'publicacoes'],
  ['consult', 'consultorias'],
  ['formac', 'consultorias'],
  ['despesa geral', 'despesas_gerais'],
  ['despesas gerais', 'despesas_gerais'],
  ['equipe', 'equipe'],
  ['coordenador', 'equipe'],
  ['produc', 'equipe'],
  ['designer', 'comunicacao'],
  ['comunic', 'comunicacao'],
  ['imprensa', 'comunicacao'],
  ['fotograf', 'comunicacao'],
];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

  if (raw.includes('museu da imagem e do som')) return 'MIS';
  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('historico abilio barreto')) return 'MHAB';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('museu da moda')) return 'MUMO';
  if (raw.includes('moda')) return 'MUMO';

  const upper = String(value || '').trim().toUpperCase();
  return MUSEUS.includes(upper) ? upper : upper;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getPurchaseValue(p) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_aprovado_admin) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_final) ||
    toNumber(p?.valor_solicitado) ||
    0
  );
}

function getPurchaseBudgetlineId(purchase) {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
  );
}

function inferirCategoria(rubrica, budgetLine) {
  const texto = normalizeString(
    (rubrica?.grupo || '') +
      ' ' +
      (rubrica?.rubrica || rubrica?.nome || '') +
      ' ' +
      (rubrica?.observacao_uso || '') +
      ' ' +
      (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  );

  for (const [keyword, cat] of KEYWORD_TO_CATEGORIA) {
    if (texto.includes(keyword)) return cat;
  }

  return 'outros';
}

// Rubricas compartilhadas: sempre dividir por 3 (todos os museus)
const CATEGORIAS_COMPARTILHADAS = new Set([
  'equipe',
  'alimentacao_cartao',
  'acoes_educativas',
  'educador',
  'lanches',
  'diarias_educador',
  'consultorias',
  'despesas_gerais',
]);

function inferirMuseus(rubrica, budgetLine) {
  const texto = normalizeString(
    (rubrica?.grupo || '') +
      ' ' +
      (rubrica?.rubrica || rubrica?.nome || '') +
      ' ' +
      (rubrica?.observacao_uso || '') +
      ' ' +
      (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  );

  const centroDireto = normalizeMuseu(
    rubrica?.centro_custo ||
      rubrica?.museu ||
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
      budgetLine?.centro_custo ||
      budgetLine?.museu ||
      budgetLine?.museu_codigo ||
      budgetLine?.unidade ||
      ''
  );

  if (centroDireto && MUSEUS.includes(centroDireto)) {
    return [centroDireto];
  }

  if (
    (texto.includes('exposi') || texto.includes('expograf')) &&
    !texto.includes('mis') &&
    !texto.includes('mhab') &&
    !texto.includes('mumo')
  ) {
    return ['MUMO'];
  }

  const museusMencionados = MUSEUS.filter((m) => texto.includes(m.toLowerCase()));
  if (museusMencionados.length === 1) return museusMencionados;

  // Rubricas shared: divide por todos os 3 museus
  return MUSEUS;
}

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getDistribuicaoExplicita(rubrica) {
  const jsonDistribuicao =
    safeJsonParse(rubrica?.detalhamento_por_museu_json) ||
    safeJsonParse(rubrica?.distribuicao_por_museu_json) ||
    safeJsonParse(rubrica?.rateio_por_museu_json) ||
    safeJsonParse(rubrica?.orcamento_por_museu_json) ||
    null;

  if (Array.isArray(jsonDistribuicao)) {
    return jsonDistribuicao
      .map((item) => ({
        museu: normalizeMuseu(item?.museu),
        valor_planejado: toNumber(item?.valor_planejado),
        valor_pago: toNumber(item?.valor_pago),
        valor_comprometido: toNumber(item?.valor_comprometido),
        valor_lancamentos: toNumber(item?.valor_lancamentos),
        valor_utilizado: toNumber(item?.valor_utilizado),
        saldo:
          item?.saldo === null || item?.saldo === undefined
            ? null
            : toNumber(item?.saldo),
        percentual_utilizado:
          item?.percentual_utilizado === null ||
          item?.percentual_utilizado === undefined
            ? null
            : toNumber(item?.percentual_utilizado),
      }))
      .filter((item) => item.museu && MUSEUS.includes(item.museu));
  }

  if (jsonDistribuicao && typeof jsonDistribuicao === 'object') {
    return Object.entries(jsonDistribuicao)
      .map(([key, value]) => ({
        museu: normalizeMuseu(key),
        valor_planejado: toNumber(value),
      }))
      .filter((item) => item.museu && MUSEUS.includes(item.museu));
  }

  return [];
}

async function listAll(entityApi, orderBy = '', pageSize = 500) {
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

function resolveRubricaFromPurchase(purchase, rubricasById, budgetLineById) {
  if (purchase?.rubrica_id && rubricasById[purchase.rubrica_id]) {
    return rubricasById[purchase.rubrica_id];
  }

  const blId = getPurchaseBudgetlineId(purchase);
  if (!blId) return null;

  const bl = budgetLineById[blId];
  if (!bl) return null;

  if (bl?.rubrica_id && rubricasById[bl.rubrica_id]) {
    return rubricasById[bl.rubrica_id];
  }

  return null;
}

function detectMuseuFromPurchase(purchase, rubrica, budgetLine) {
  const candidatos = [
    purchase?.museu,
    purchase?.museu_codigo,
    purchase?.unidade,
    purchase?.centro_custo,
    purchase?.area,
    purchase?.setor,
    purchase?.local,
    purchase?.departamento,
    purchase?.titulo,
    purchase?.descricao,
    purchase?.descricao_item,
    purchase?.objeto,
    purchase?.observacoes,
    purchase?.notes,
    budgetLine?.museu,
    budgetLine?.museu_codigo,
    budgetLine?.unidade,
    budgetLine?.centro_custo,
    rubrica?.museu,
    rubrica?.museu_codigo,
    rubrica?.unidade,
    rubrica?.centro_custo,
  ];

  for (const valor of candidatos) {
    const museu = normalizeMuseu(valor);
    if (museu && MUSEUS.includes(museu)) return museu;
  }

  const texto = normalizeString(
    candidatos
      .filter(Boolean)
      .map((v) => String(v))
      .join(' ')
  );

  if (texto.includes('museu da imagem e do som') || texto.includes('imagem e som')) {
    return 'MIS';
  }
  if (texto.includes('historico abilio barreto') || texto.includes('abilio barreto')) {
    return 'MHAB';
  }
  if (texto.includes('museu da moda') || texto.includes('mumo') || texto.includes('moda')) {
    return 'MUMO';
  }
  if (texto.includes('mis')) return 'MIS';
  if (texto.includes('mhab')) return 'MHAB';

  return null;
}

function distribuirValorPorMuseu(compras, rubrica, budgetLine) {
  const totais = {};
  for (const museu of MUSEUS) totais[museu] = 0;

  for (const compra of compras) {
    // centro_custo da compra é a fonte prioritária para débito
    const centroCusto = normalizeMuseu(compra?.centro_custo || '');
    const museu = (centroCusto && MUSEUS.includes(centroCusto))
      ? centroCusto
      : detectMuseuFromPurchase(compra, rubrica, budgetLine);
    if (!museu || !MUSEUS.includes(museu)) continue;
    totais[museu] += getPurchaseValue(compra);
  }

  for (const museu of MUSEUS) {
    totais[museu] = Number(totais[museu].toFixed(2));
  }

  return totais;
}

function distribuirLancamentosPorMuseu(lancamentos, rubrica, budgetLine) {
  const totais = {};
  for (const museu of MUSEUS) totais[museu] = 0;

  for (const lancamento of lancamentos) {
    const museu = normalizeMuseu(
      lancamento?.museu ||
      lancamento?.museu_codigo ||
      lancamento?.unidade ||
      lancamento?.centro_custo
    );

    if (museu && MUSEUS.includes(museu)) {
      totais[museu] += toNumber(lancamento?.valor);
    }
  }

  const algumMuseuExplicito = MUSEUS.some((m) => totais[m] > 0);

  if (!algumMuseuExplicito) {
    const museusInferidos = inferirMuseus(rubrica, budgetLine);
    if (museusInferidos.length === 1) {
      totais[museusInferidos[0]] = Number(
        lancamentos.reduce((s, l) => s + toNumber(l?.valor), 0).toFixed(2)
      );
    }
  }

  for (const museu of MUSEUS) {
    totais[museu] = Number(totais[museu].toFixed(2));
  }

  return totais;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const [rubricas, configs, lancamentos, budgetLines, purchases] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
      listAll(base44.asServiceRole.entities.RubricaMuseuConfig, '', 500),
      listAll(base44.asServiceRole.entities.LancamentoRubrica, '-data_lancamento', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
    ]);

    const rubricasAtivas = rubricas.filter((r) => r?.ativo !== false);

    const budgetLineById = {};
    for (const bl of budgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const rubricasById = {};
    for (const rubrica of rubricasAtivas) {
      if (rubrica?.id) rubricasById[rubrica.id] = rubrica;
    }

    const lansByRubrica = {};
    for (const l of lancamentos) {
      if (!l?.rubrica_id) continue;
      if (!lansByRubrica[l.rubrica_id]) lansByRubrica[l.rubrica_id] = [];
      lansByRubrica[l.rubrica_id].push(l);
    }

    const configsByRubrica = {};
    for (const c of configs) {
      if (!c?.rubrica_id) continue;
      if (!configsByRubrica[c.rubrica_id]) configsByRubrica[c.rubrica_id] = [];
      configsByRubrica[c.rubrica_id].push(c);
    }

    const comprasPagasPorRubrica = {};
    const comprasAprovadasPorRubrica = {};

    for (const p of purchases) {
      const rubrica = resolveRubricaFromPurchase(p, rubricasById, budgetLineById);
      if (!rubrica?.id) continue;

      const status = normalizeStatus(p?.status);

      if (status === 'PAGO') {
        if (!comprasPagasPorRubrica[rubrica.id]) comprasPagasPorRubrica[rubrica.id] = [];
        comprasPagasPorRubrica[rubrica.id].push(p);
      }

      if (status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD') {
        if (!comprasAprovadasPorRubrica[rubrica.id]) {
          comprasAprovadasPorRubrica[rubrica.id] = [];
        }
        comprasAprovadasPorRubrica[rubrica.id].push(p);
      }
    }

    const resultado = {};
    for (const museu of MUSEUS) resultado[museu] = {};

    for (const rubrica of rubricasAtivas) {
      const rubricaId = rubrica.id;
      const lans = lansByRubrica[rubricaId] || [];

      const budgetlineId =
        rubrica?.budgetline_id ||
        rubrica?.budget_line_id ||
        rubrica?.linha_orcamentaria_id ||
        null;

      const budgetLine = budgetlineId ? budgetLineById[budgetlineId] || null : null;

      const valorRubrica = toNumber(rubrica?.valor_rubrica);

      const comprasPagas = comprasPagasPorRubrica[rubricaId] || [];
      const comprasAprovadas = comprasAprovadasPorRubrica[rubricaId] || [];

      const valorPagoRubrica = Number(
        comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorComprometidoRubrica = Number(
        comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorLancamentosRubrica = Number(
        lans.reduce((s, l) => s + toNumber(l?.valor), 0).toFixed(2)
      );

      const valorUtilizadoRubrica = Number(
        (
          valorPagoRubrica +
          valorComprometidoRubrica +
          valorLancamentosRubrica
        ).toFixed(2)
      );

      const distribuicaoExplicita = getDistribuicaoExplicita(rubrica);
      const configsRubrica = configsByRubrica[rubricaId] || [];

      let associacoes = [];

      if (distribuicaoExplicita.length > 0) {
        associacoes = distribuicaoExplicita.map((item) => ({
          museu: item.museu,
          categoria_key: inferirCategoria(rubrica, budgetLine),
          divisor: 1,
          valor_planejado: item.valor_planejado,
          valor_pago: item.valor_pago,
          valor_comprometido: item.valor_comprometido,
          valor_lancamentos: item.valor_lancamentos,
          valor_utilizado: item.valor_utilizado,
          saldo: item.saldo,
          percentual_utilizado: item.percentual_utilizado,
          distribuicao_mode: 'explicit',
        }));
      } else if (configsRubrica.length > 0) {
        associacoes = configsRubrica
          .map((c) => ({
            museu: normalizeMuseu(c?.museu),
            categoria_key: c?.categoria_key || inferirCategoria(rubrica, budgetLine),
            divisor: toNumber(c?.divisor) || 1,
            distribuicao_mode: 'config',
          }))
          .filter((item) => item.museu && MUSEUS.includes(item.museu));
      } else {
        const museus = inferirMuseus(rubrica, budgetLine);
        const categoria_key = inferirCategoria(rubrica, budgetLine);
        // Rubricas compartilhadas SEMPRE dividem igualmente por 3
        const divisor = museus.length >= 3 || CATEGORIAS_COMPARTILHADAS.has(categoria_key)
          ? 3
          : museus.length || 1;
        const museusFinais = divisor === 3 ? MUSEUS : museus;
        associacoes = museusFinais.map((m) => ({
          museu: m,
          categoria_key,
          divisor,
          distribuicao_mode: divisor === 3 ? 'compartilhada_div3' : 'inferido',
        }));
      }

      const pagosPorMuseu = distribuirValorPorMuseu(comprasPagas, rubrica, budgetLine);
      const aprovadosPorMuseu = distribuirValorPorMuseu(comprasAprovadas, rubrica, budgetLine);
      const lancamentosPorMuseu = distribuirLancamentosPorMuseu(lans, rubrica, budgetLine);

      const totalPagoDetectado = Number(
        Object.values(pagosPorMuseu).reduce((s, v) => s + toNumber(v), 0).toFixed(2)
      );
      const totalComprometidoDetectado = Number(
        Object.values(aprovadosPorMuseu).reduce((s, v) => s + toNumber(v), 0).toFixed(2)
      );
      const totalLancDetectado = Number(
        Object.values(lancamentosPorMuseu).reduce((s, v) => s + toNumber(v), 0).toFixed(2)
      );

      for (const assoc of associacoes) {
        if (!assoc?.museu || !resultado[assoc.museu]) continue;

        const divisor = toNumber(assoc.divisor) || 1;
        const cat = assoc.categoria_key || 'outros';

        if (!resultado[assoc.museu][cat]) resultado[assoc.museu][cat] = [];

        const totalOrcado =
          assoc.valor_planejado !== undefined
            ? toNumber(assoc.valor_planejado)
            : Number((valorRubrica / divisor).toFixed(2));

        const valorPago =
          assoc.valor_pago !== undefined
            ? toNumber(assoc.valor_pago)
            : totalPagoDetectado > 0
            ? toNumber(pagosPorMuseu[assoc.museu])
            : Number((valorPagoRubrica / divisor).toFixed(2));

        const valorComprometido =
          assoc.valor_comprometido !== undefined
            ? toNumber(assoc.valor_comprometido)
            : totalComprometidoDetectado > 0
            ? toNumber(aprovadosPorMuseu[assoc.museu])
            : Number((valorComprometidoRubrica / divisor).toFixed(2));

        const valorLancamentos =
          assoc.valor_lancamentos !== undefined
            ? toNumber(assoc.valor_lancamentos)
            : totalLancDetectado > 0
            ? toNumber(lancamentosPorMuseu[assoc.museu])
            : Number((valorLancamentosRubrica / divisor).toFixed(2));

        const valorUtilizado =
          assoc.valor_utilizado !== undefined
            ? toNumber(assoc.valor_utilizado)
            : Number((valorPago + valorComprometido + valorLancamentos).toFixed(2));

        const saldo =
          assoc.saldo !== undefined && assoc.saldo !== null
            ? toNumber(assoc.saldo)
            : Number((totalOrcado - valorUtilizado).toFixed(2));

        const pct =
          assoc.percentual_utilizado !== undefined &&
          assoc.percentual_utilizado !== null
            ? toNumber(assoc.percentual_utilizado)
            : totalOrcado > 0
            ? Number(((valorUtilizado / totalOrcado) * 100).toFixed(1))
            : 0;

        resultado[assoc.museu][cat].push({
          id: rubricaId,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          centro_custo: normalizeMuseu(rubrica?.centro_custo || '') || null,
          valor_rubrica: valorRubrica,
          totalOrcado,
          valorUtilizado,
          valorPago,
          valorComprometido,
          valorLancamentos,
          saldo,
          pct,
          divisor,
          distribuicao_mode: assoc.distribuicao_mode || null,
          num_lancamentos: lans.length,
          num_compras_pagas: comprasPagas.length,
          num_compras_aprovadas: comprasAprovadas.length,
          budgetline_id: budgetlineId,
        });
      }

      const rubricaSemAssociacao = associacoes.length === 0;
      if (rubricaSemAssociacao) {
        const categoria_key = inferirCategoria(rubrica, budgetLine);
        const museus = inferirMuseus(rubrica, budgetLine);
        const divisor = museus.length >= 3 || CATEGORIAS_COMPARTILHADAS.has(categoria_key) ? 3 : (museus.length || 1);
        const museusFinais = divisor === 3 ? MUSEUS : museus;

        for (const museu of museusFinais) {
          if (!resultado[museu][categoria_key]) resultado[museu][categoria_key] = [];

          const totalOrcado = Number((valorRubrica / divisor).toFixed(2));
          const valorPago = totalPagoDetectado > 0
            ? toNumber(pagosPorMuseu[museu])
            : Number((valorPagoRubrica / divisor).toFixed(2));
          const valorComprometido = totalComprometidoDetectado > 0
            ? toNumber(aprovadosPorMuseu[museu])
            : Number((valorComprometidoRubrica / divisor).toFixed(2));
          const valorLancamentos = totalLancDetectado > 0
            ? toNumber(lancamentosPorMuseu[museu])
            : Number((valorLancamentosRubrica / divisor).toFixed(2));
          const valorUtilizado = Number((valorPago + valorComprometido + valorLancamentos).toFixed(2));
          const saldo = Number((totalOrcado - valorUtilizado).toFixed(2));
          const pct = totalOrcado > 0
            ? Number(((valorUtilizado / totalOrcado) * 100).toFixed(1))
            : 0;

          resultado[museu][categoria_key].push({
            id: rubricaId,
            rubrica: rubrica.rubrica || rubrica.nome || '',
            grupo: rubrica.grupo || '',
            centro_custo: normalizeMuseu(rubrica?.centro_custo || '') || null,
            valor_rubrica: valorRubrica,
            totalOrcado,
            valorUtilizado,
            valorPago,
            valorComprometido,
            valorLancamentos,
            saldo,
            pct,
            divisor,
            distribuicao_mode: divisor === 3 ? 'compartilhada_div3' : 'fallback',
            num_lancamentos: lans.length,
            num_compras_pagas: comprasPagas.length,
            num_compras_aprovadas: comprasAprovadas.length,
            budgetline_id: budgetlineId,
          });
        }
      }

      const _saldoRubrica = Number((valorRubrica - valorUtilizadoRubrica).toFixed(2));
      void _saldoRubrica;
    }

    const totaisPorMuseu = {};

    for (const museu of MUSEUS) {
      let totalOrcado = 0;
      let totalUtilizado = 0;
      let totalPago = 0;
      let totalComprometido = 0;
      let totalLancamentos = 0;

      for (const cat of Object.values(resultado[museu])) {
        for (const r of cat) {
          totalOrcado += toNumber(r.totalOrcado);
          totalUtilizado += toNumber(r.valorUtilizado);
          totalPago += toNumber(r.valorPago);
          totalComprometido += toNumber(r.valorComprometido);
          totalLancamentos += toNumber(r.valorLancamentos);
        }
      }

      totalOrcado = Number(totalOrcado.toFixed(2));
      totalUtilizado = Number(totalUtilizado.toFixed(2));
      totalPago = Number(totalPago.toFixed(2));
      totalComprometido = Number(totalComprometido.toFixed(2));
      totalLancamentos = Number(totalLancamentos.toFixed(2));

      const totalSaldo = Number((totalOrcado - totalUtilizado).toFixed(2));
      const pct =
        totalOrcado > 0
          ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(1))
          : 0;

      totaisPorMuseu[museu] = {
        totalOrcado,
        totalUtilizado,
        totalPago,
        totalComprometido,
        totalLancamentos,
        totalSaldo,
        pct,
      };
    }

    return Response.json({
      success: true,
      por_museu: resultado,
      totais_por_museu: totaisPorMuseu,
      total_rubricas: rubricasAtivas.length,
      total_configs: configs.length,
      total_lancamentos: lancamentos.length,
    });
  } catch (error) {
    console.error('getRubricasConsolidadas error:', error);
    return Response.json(
      { error: error?.message || String(error), success: false },
      { status: 500 }
    );
  }
});