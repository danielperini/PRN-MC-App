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
  ['diária', 'diarias_educador'],
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
  return String(value || '').trim().toLowerCase();
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

function inferirCategoria(rubrica, budgetLine = null) {
  const texto = normalizeString(
    (rubrica?.grupo || '') + ' ' +
    (rubrica?.rubrica || rubrica?.nome || '') + ' ' +
    (rubrica?.observacao_uso || '') + ' ' +
    (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  );
  for (const [keyword, cat] of KEYWORD_TO_CATEGORIA) {
    if (texto.includes(keyword)) return cat;
  }
  return 'outros';
}

function inferirMuseus(rubrica, budgetLine = null) {
  const texto = normalizeString(
    (rubrica?.grupo || '') + ' ' +
    (rubrica?.rubrica || rubrica?.nome || '') + ' ' +
    (rubrica?.observacao_uso || '') + ' ' +
    (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  );

  if (texto.includes('exposi') || texto.includes('expograf') || texto.includes('mumo')) {
    if (texto.includes('mis') || texto.includes('mhab')) {
      // menciona vários museus
    } else {
      return ['MUMO'];
    }
  }

  const museusMencionados = MUSEUS.filter(m => texto.includes(m.toLowerCase()));
  if (museusMencionados.length > 0) return museusMencionados;

  // Grupos que pertencem a todos
  if (texto.includes('noturno') || texto.includes('equipe') || texto.includes('despesa geral')) {
    return MUSEUS;
  }

  return MUSEUS;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const [rubricas, configs, lancamentos, budgetLines, purchases] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
      listAll(base44.asServiceRole.entities.RubricaMuseuConfig, '', 500),
      listAll(base44.asServiceRole.entities.LancamentoRubrica, '-data_lancamento', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
    ]);

    const budgetLineById = {};
    for (const bl of budgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    // Índice lançamentos por rubrica
    const lansByRubrica = {};
    for (const l of lancamentos) {
      if (!l?.rubrica_id) continue;
      if (!lansByRubrica[l.rubrica_id]) lansByRubrica[l.rubrica_id] = [];
      lansByRubrica[l.rubrica_id].push(l);
    }

    // Índice configs por rubrica
    const configsByRubrica = {};
    for (const c of configs) {
      if (!c?.rubrica_id) continue;
      if (!configsByRubrica[c.rubrica_id]) configsByRubrica[c.rubrica_id] = [];
      configsByRubrica[c.rubrica_id].push(c);
    }

    // Índice de compras por rubrica_id (ligação direta)
    const comprasPorRubrica = {};
    for (const p of purchases) {
      if (!p?.rubrica_id) continue;
      if (!comprasPorRubrica[p.rubrica_id]) comprasPorRubrica[p.rubrica_id] = [];
      comprasPorRubrica[p.rubrica_id].push(p);
    }

    // Índice de compras por budgetline_id
    const comprasPorBudgetLine = {};
    for (const p of purchases) {
      const blId = p?.budgetline_id || p?.budget_line_id || p?.linha_orcamentaria_id;
      if (!blId) continue;
      if (!comprasPorBudgetLine[blId]) comprasPorBudgetLine[blId] = [];
      comprasPorBudgetLine[blId].push(p);
    }

    function getPurchaseValue(p) {
      return toNumber(p?.valor_pago) || toNumber(p?.valor_aprovado_admin) || toNumber(p?.valor_solicitado) || 0;
    }

    const rubricasAtivas = rubricas.filter(r => r.ativo !== false);
    const resultado = {};
    for (const museu of MUSEUS) resultado[museu] = {};

    for (const rubrica of rubricasAtivas) {
      const rubricaId = rubrica.id;
      const lans = lansByRubrica[rubricaId] || [];
      const budgetlineId = rubrica.budgetline_id || rubrica.budget_line_id || rubrica.linha_orcamentaria_id || null;
      const budgetLine = budgetlineId ? budgetLineById[budgetlineId] || null : null;

      const valorRubrica = toNumber(rubrica.valor_rubrica);

      // Coletar compras
      const mapaCompras = {};
      for (const c of (comprasPorRubrica[rubricaId] || [])) {
        if (c?.id) mapaCompras[c.id] = c;
      }
      if (budgetlineId) {
        for (const c of (comprasPorBudgetLine[budgetlineId] || [])) {
          if (c?.id) mapaCompras[c.id] = c;
        }
      }
      const comprasUnicas = Object.values(mapaCompras);

      const comprasPagas = comprasUnicas.filter(p => String(p.status || '').toUpperCase() === 'PAGO');
      const comprasAprovadas = comprasUnicas.filter(p => {
        const s = String(p.status || '').toUpperCase();
        return s === 'APROVADO_ADMIN' || s === 'APROVADO_COORD';
      });

      const valorPago = parseFloat(comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
      const valorComprometido = parseFloat(comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
      const valorLancamentos = parseFloat(lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2));

      // Valor total utilizado calculado em tempo real (pago + comprometido, ou lançamentos se nenhum)
      const totalCompras = valorPago + valorComprometido;
      const valorUtilizado = parseFloat((totalCompras > 0 ? totalCompras : valorLancamentos).toFixed(2));

      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const pct = valorRubrica > 0 ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(1)) : 0;

      // Determinar associações de museu
      const configsRubrica = configsByRubrica[rubricaId] || [];
      let associacoes = [];

      if (configsRubrica.length > 0) {
        associacoes = configsRubrica.map(c => ({
          museu: c.museu,
          categoria_key: c.categoria_key || inferirCategoria(rubrica, budgetLine),
          divisor: toNumber(c.divisor) || 1,
        }));
      } else {
        const museus = inferirMuseus(rubrica, budgetLine);
        const categoria_key = inferirCategoria(rubrica, budgetLine);
        associacoes = museus.map(m => ({
          museu: m,
          categoria_key,
          divisor: museus.length || 1,
        }));
      }

      for (const assoc of associacoes) {
        if (!assoc?.museu || !resultado[assoc.museu]) continue;
        const divisor = toNumber(assoc.divisor) || 1;
        const cat = assoc.categoria_key || 'outros';
        if (!resultado[assoc.museu][cat]) resultado[assoc.museu][cat] = [];

        resultado[assoc.museu][cat].push({
          id: rubricaId,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          valor_rubrica: valorRubrica,
          totalOrcado: parseFloat((valorRubrica / divisor).toFixed(2)),
          valorUtilizado: parseFloat((valorUtilizado / divisor).toFixed(2)),
          valorPago: parseFloat((valorPago / divisor).toFixed(2)),
          valorComprometido: parseFloat((valorComprometido / divisor).toFixed(2)),
          saldo: parseFloat((saldo / divisor).toFixed(2)),
          pct,
          divisor,
          num_lancamentos: lans.length,
          num_compras_pagas: comprasPagas.length,
          num_compras_aprovadas: comprasAprovadas.length,
          budgetline_id: budgetlineId,
        });
      }
    }

    // Totais por museu
    const totaisPorMuseu = {};
    for (const museu of MUSEUS) {
      let totalOrcado = 0, totalUtilizado = 0, totalPago = 0, totalComprometido = 0;
      for (const cat of Object.values(resultado[museu])) {
        for (const r of cat) {
          totalOrcado += toNumber(r.totalOrcado);
          totalUtilizado += toNumber(r.valorUtilizado);
          totalPago += toNumber(r.valorPago);
          totalComprometido += toNumber(r.valorComprometido);
        }
      }
      totalOrcado = parseFloat(totalOrcado.toFixed(2));
      totalUtilizado = parseFloat(totalUtilizado.toFixed(2));
      totalPago = parseFloat(totalPago.toFixed(2));
      totalComprometido = parseFloat(totalComprometido.toFixed(2));
      const totalSaldo = parseFloat((totalOrcado - totalUtilizado).toFixed(2));
      const pct = totalOrcado > 0 ? parseFloat(((totalUtilizado / totalOrcado) * 100).toFixed(1)) : 0;

      totaisPorMuseu[museu] = { totalOrcado, totalUtilizado, totalPago, totalComprometido, totalSaldo, pct };
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
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});