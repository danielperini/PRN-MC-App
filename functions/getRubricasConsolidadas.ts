import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Mapeamento de grupos/nomes de rubricas para categoria_key dos cards
// Ordem importa: mais específico primeiro
const KEYWORD_TO_CATEGORIA = [
  ['exposi', 'exposicao'],
  ['expograf', 'exposicao'],
  ['som e luz', 'som_luz'],
  ['som/luz', 'som_luz'],
  ['som e l', 'som_luz'],
  ['acao educativa', 'acoes_educativas'],
  ['ações educativas', 'acoes_educativas'],
  ['acoes educativas', 'acoes_educativas'],
  ['diaria', 'diarias_educador'],
  ['diária', 'diarias_educador'],
  ['lanche', 'lanches'],
  ['buffet', 'lanches'],
  ['alimentac', 'alimentacao_cartao'],
  ['cartao', 'alimentacao_cartao'],
  ['cartão', 'alimentacao_cartao'],
  ['material', 'material'],
  ['manutenc', 'manutencao'],
  ['manuten', 'manutencao'],
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

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
  const texto = (
    (rubrica?.grupo || '') +
    ' ' +
    (rubrica?.rubrica || rubrica?.nome || '') +
    ' ' +
    (rubrica?.observacao_uso || '') +
    ' ' +
    (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  ).toLowerCase();

  for (const [keyword, cat] of KEYWORD_TO_CATEGORIA) {
    if (texto.includes(keyword)) return cat;
  }

  return 'outros';
}

function inferirMuseus(rubrica, budgetLine = null) {
  const texto = (
    (rubrica?.grupo || '') +
    ' ' +
    (rubrica?.rubrica || rubrica?.nome || '') +
    ' ' +
    (rubrica?.observacao_uso || '') +
    ' ' +
    (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  ).toLowerCase();

  // Exposição só vai para MUMO
  if (texto.includes('exposi') || texto.includes('expograf')) {
    return ['MUMO'];
  }

  // Se menciona museu específico
  const museusMencionados = MUSEUS.filter((m) =>
    texto.includes(m.toLowerCase())
  );
  if (museusMencionados.length > 0) return museusMencionados;

  // Default: todos os museus
  return MUSEUS;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Leitura via service role
    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      500
    );

    const configs = await listAll(
      base44.asServiceRole.entities.RubricaMuseuConfig,
      '',
      500
    );

    const lancamentos = await listAll(
      base44.asServiceRole.entities.LancamentoRubrica,
      '-data_lancamento',
      500
    );

    const budgetLines = await listAll(
      base44.asServiceRole.entities.BudgetLine,
      'descricao',
      500
    );

    // Índice BudgetLine por id
    const budgetLineById = {};
    for (const bl of budgetLines) {
      if (bl && bl.id) {
        budgetLineById[bl.id] = bl;
      }
    }

    // Indexar lançamentos por rubrica
    const lansByRubrica = {};
    for (const l of lancamentos) {
      if (!l?.rubrica_id) continue;
      if (!lansByRubrica[l.rubrica_id]) lansByRubrica[l.rubrica_id] = [];
      lansByRubrica[l.rubrica_id].push(l);
    }

    // Para cada rubrica+museu pode haver config
    const configsByRubrica = {};
    for (const c of configs) {
      if (!c?.rubrica_id) continue;
      if (!configsByRubrica[c.rubrica_id]) configsByRubrica[c.rubrica_id] = [];
      configsByRubrica[c.rubrica_id].push(c);
    }

    const rubricasAtivas = rubricas.filter((r) => r.ativo !== false);

    const resultado = {};
    for (const museu of MUSEUS) {
      resultado[museu] = {};
    }

    for (const rubrica of rubricasAtivas) {
      const rubricaId = rubrica.id;
      const lans = lansByRubrica[rubricaId] || [];

      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const valorUtilizadoPersistido = toNumber(rubrica.valor_utilizado);

      // fallback defensivo só se valor_utilizado ainda não estiver gravado
      const totalLancado = parseFloat(
        lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2)
      );

      const valorUtilizado =
        rubrica.valor_utilizado !== null && rubrica.valor_utilizado !== undefined
          ? valorUtilizadoPersistido
          : totalLancado;

      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const pct =
        valorRubrica > 0
          ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(1))
          : 0;

      const budgetlineId =
        rubrica.budgetline_id ||
        rubrica.budget_line_id ||
        rubrica.linha_orcamentaria_id ||
        null;

      const budgetLine = budgetlineId ? budgetLineById[budgetlineId] || null : null;

      // Determinar em quais museus esta rubrica aparece
      const configsRubrica = configsByRubrica[rubricaId] || [];

      let associacoes = [];

      if (configsRubrica.length > 0) {
        associacoes = configsRubrica.map((c) => ({
          museu: c.museu,
          categoria_key: c.categoria_key || inferirCategoria(rubrica, budgetLine),
          divisor: toNumber(c.divisor) || 1,
        }));
      } else {
        const museus = inferirMuseus(rubrica, budgetLine);
        const categoria_key = inferirCategoria(rubrica, budgetLine);

        associacoes = museus.map((m) => ({
          museu: m,
          categoria_key,
          divisor: museus.length || 1,
        }));
      }

      for (const assoc of associacoes) {
        if (!assoc?.museu || !resultado[assoc.museu]) continue;

        const divisor = toNumber(assoc.divisor) || 1;
        const cat = assoc.categoria_key || 'outros';

        if (!resultado[assoc.museu][cat]) {
          resultado[assoc.museu][cat] = [];
        }

        resultado[assoc.museu][cat].push({
          id: rubricaId,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          valor_rubrica: valorRubrica,
          totalOrcado: parseFloat((valorRubrica / divisor).toFixed(2)),
          valorUtilizado: parseFloat((valorUtilizado / divisor).toFixed(2)),
          saldo: parseFloat((saldo / divisor).toFixed(2)),
          pct,
          divisor,
          num_lancamentos: lans.length,
          budgetline_id: budgetlineId,
        });
      }
    }

    // Calcular totais por museu
    const totaisPorMuseu = {};

    for (const museu of MUSEUS) {
      let totalOrcado = 0;
      let totalUtilizado = 0;

      for (const cat of Object.values(resultado[museu])) {
        for (const r of cat) {
          totalOrcado += toNumber(r.totalOrcado);
          totalUtilizado += toNumber(r.valorUtilizado);
        }
      }

      totalOrcado = parseFloat(totalOrcado.toFixed(2));
      totalUtilizado = parseFloat(totalUtilizado.toFixed(2));

      const totalSaldo = parseFloat((totalOrcado - totalUtilizado).toFixed(2));
      const pct =
        totalOrcado > 0
          ? parseFloat(((totalUtilizado / totalOrcado) * 100).toFixed(1))
          : 0;

      totaisPorMuseu[museu] = {
        totalOrcado,
        totalUtilizado,
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
      total_budgetlines: budgetLines.length,
      total_lancamentos: lancamentos.length,
    });
  } catch (error) {
    console.error('getRubricasConsolidadas error:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});