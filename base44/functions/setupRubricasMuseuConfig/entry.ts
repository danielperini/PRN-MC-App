import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
  ['cartao', 'alimentacao_cartao'],
  ['cartão', 'alimentacao_cartao'],
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

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

function normalizeString(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value: unknown): string {
  const raw = normalizeString(value);

  if (!raw) return '';

  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';

  if (raw.includes('museu da imagem e do som')) return 'MIS';
  if (raw.includes('imagem e som')) return 'MIS';

  if (raw.includes('historico abilio barreto')) return 'MHAB';
  if (raw.includes('abilio barreto')) return 'MHAB';

  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim().toUpperCase();
}

async function listAll(entityApi: any, orderBy = '', pageSize = 500) {
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

function inferirCategoria(rubrica: any, budgetLine: any = null): string {
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

function getRubricaCentroCusto(rubrica: any): string {
  return normalizeMuseu(
    rubrica?.centro_custo ||
      rubrica?.museu ||
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
      ''
  );
}

function getBudgetLineCentroCusto(budgetLine: any): string {
  return normalizeMuseu(
    budgetLine?.centro_custo ||
      budgetLine?.museu ||
      budgetLine?.museu_codigo ||
      budgetLine?.unidade ||
      ''
  );
}

function inferirMuseusPorHeuristica(rubrica: any, budgetLine: any = null): string[] {
  const texto = normalizeString(
    (rubrica?.grupo || '') +
      ' ' +
      (rubrica?.rubrica || rubrica?.nome || '') +
      ' ' +
      (rubrica?.observacao_uso || '') +
      ' ' +
      (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  );

  const mencionados = MUSEUS.filter((m) =>
    texto.includes(m.toLowerCase())
  );

  if (mencionados.length > 0) return mencionados;

  if (texto.includes('exposi') || texto.includes('expograf')) {
    return ['MUMO'];
  }

  return MUSEUS;
}

function resolverMuseusDaRubrica(rubrica: any, budgetLine: any = null) {
  const rubricaMuseu = getRubricaCentroCusto(rubrica);
  if (rubricaMuseu && MUSEUS.includes(rubricaMuseu)) {
    return {
      museus: [rubricaMuseu],
      origem: 'rubrica_centro_custo',
    };
  }

  const budgetMuseu = getBudgetLineCentroCusto(budgetLine);
  if (budgetMuseu && MUSEUS.includes(budgetMuseu)) {
    return {
      museus: [budgetMuseu],
      origem: 'budgetline_centro_custo',
    };
  }

  const heuristica = inferirMuseusPorHeuristica(rubrica, budgetLine)
    .map((m) => normalizeMuseu(m))
    .filter((m) => MUSEUS.includes(m));

  if (heuristica.length > 0) {
    return {
      museus: Array.from(new Set(heuristica)),
      origem: 'heuristica_textual',
    };
  }

  return {
    museus: [],
    origem: 'nao_resolvido',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    const isAdminOrCoord = ['admin', 'ADMIN', 'COORDENADOR'].includes(user.role);

    if (!isAdminOrCoord) {
      const perms = await base44.asServiceRole.entities.UserPermission.filter({
        user_email: user.email,
      });
      const perm = perms?.[0];

      if (!perm?.gestao_compras && !perm?.pode_gerenciar_rubricas) {
        return Response.json({ error: 'Acesso negado', success: false }, { status: 403 });
      }
    }

    const [rubricas, configsExistentes, budgetLines] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
      listAll(base44.asServiceRole.entities.RubricaMuseuConfig, '', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
    ]);

    const budgetLineById: Record<string, any> = {};
    for (const bl of budgetLines) {
      if (bl?.id) {
        budgetLineById[bl.id] = bl;
      }
    }

    const existentes = new Set(
      configsExistentes
        .filter((c) => c?.rubrica_id && c?.museu)
        .map((c) => `${c.rubrica_id}__${normalizeMuseu(c.museu)}`)
    );

    const criados: any[] = [];
    const ignorados: any[] = [];

    for (const rubrica of rubricas.filter((r) => r?.ativo !== false)) {
      const budgetlineId =
        rubrica?.budgetline_id ||
        rubrica?.budget_line_id ||
        rubrica?.linha_orcamentaria_id ||
        null;

      const budgetLine = budgetlineId ? budgetLineById[budgetlineId] || null : null;

      const categoria_key = inferirCategoria(rubrica, budgetLine);
      const resolved = resolverMuseusDaRubrica(rubrica, budgetLine);
      const museus = resolved.museus;
      const divisor = museus.length > 1 ? museus.length : 1;

      if (!museus || museus.length === 0) {
        ignorados.push({
          rubrica_id: rubrica.id,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          centro_custo: getRubricaCentroCusto(rubrica) || null,
          budgetline_id: budgetlineId,
          budgetline_centro_custo: getBudgetLineCentroCusto(budgetLine) || null,
          motivo: 'Nenhum museu resolvido para a rubrica',
          origem_resolucao: resolved.origem,
        });
        continue;
      }

      for (const museu of museus) {
        if (!MUSEUS.includes(museu)) {
          ignorados.push({
            rubrica_id: rubrica.id,
            rubrica: rubrica.rubrica || rubrica.nome || '',
            centro_custo: getRubricaCentroCusto(rubrica) || null,
            budgetline_id: budgetlineId,
            budgetline_centro_custo: getBudgetLineCentroCusto(budgetLine) || null,
            motivo: `Museu inválido para configuração: ${museu}`,
            origem_resolucao: resolved.origem,
          });
          continue;
        }

        const chave = `${rubrica.id}__${museu}`;
        if (existentes.has(chave)) continue;

        await base44.asServiceRole.entities.RubricaMuseuConfig.create({
          rubrica_id: rubrica.id,
          museu,
          categoria_key,
          divisor,
        });

        existentes.add(chave);

        criados.push({
          rubrica_id: rubrica.id,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          centro_custo: getRubricaCentroCusto(rubrica) || null,
          museu,
          categoria_key,
          divisor,
          budgetline_id: budgetlineId,
          budgetline_centro_custo: getBudgetLineCentroCusto(budgetLine) || null,
          origem_resolucao: resolved.origem,
        });
      }
    }

    return Response.json({
      success: true,
      message: `${criados.length} configurações criadas, ${ignorados.length} rubricas ignoradas`,
      criados,
      ignorados,
      total_rubricas: rubricas.length,
      total_configs_existentes: configsExistentes.length,
      total_budgetlines: budgetLines.length,
    });
  } catch (error: any) {
    console.error('setupRubricasMuseuConfig error:', error);
    return Response.json(
      { error: error?.message || String(error), success: false },
      { status: 500 }
    );
  }
});
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

  // Exposição e expografia puxam para MUMO
  if (texto.includes('exposi') || texto.includes('expograf')) {
    return ['MUMO'];
  }

  const mencionados = MUSEUS.filter((m) => texto.includes(m.toLowerCase()));
  if (mencionados.length > 0) return mencionados;

  return MUSEUS; // compartilhada
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Permite coordenador, admin, ou quem tem gestao_compras / pode_gerenciar_rubricas
    const isAdminOrCoord = ['admin', 'ADMIN', 'COORDENADOR'].includes(user.role);

    if (!isAdminOrCoord) {
      const perms = await base44.asServiceRole.entities.UserPermission.filter({
        user_email: user.email
      });
      const perm = perms?.[0];

      if (!perm?.gestao_compras && !perm?.pode_gerenciar_rubricas) {
        return Response.json({ error: 'Acesso negado' }, { status: 403 });
      }
    }

    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      500
    );

    const configsExistentes = await listAll(
      base44.asServiceRole.entities.RubricaMuseuConfig,
      '',
      500
    );

    const budgetLines = await listAll(
      base44.asServiceRole.entities.BudgetLine,
      'descricao',
      500
    );

    const budgetLineById = {};
    for (const bl of budgetLines) {
      if (bl && bl.id) {
        budgetLineById[bl.id] = bl;
      }
    }

    // Indexar configs existentes
    const existentes = new Set(
      configsExistentes
        .filter((c) => c?.rubrica_id && c?.museu)
        .map((c) => `${c.rubrica_id}__${c.museu}`)
    );

    const criados = [];
    const ignorados = [];

    for (const rubrica of rubricas.filter((r) => r.ativo !== false)) {
      const budgetlineId =
        rubrica.budgetline_id ||
        rubrica.budget_line_id ||
        rubrica.linha_orcamentaria_id ||
        null;

      const budgetLine = budgetlineId ? budgetLineById[budgetlineId] || null : null;

      const categoria_key = inferirCategoria(rubrica, budgetLine);
      const museus = inferirMuseus(rubrica, budgetLine);
      const divisor = museus.length > 1 ? museus.length : 1;

      if (!museus || museus.length === 0) {
        ignorados.push({
          rubrica_id: rubrica.id,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          motivo: 'Nenhum museu inferido'
        });
        continue;
      }

      for (const museu of museus) {
        const chave = `${rubrica.id}__${museu}`;
        if (existentes.has(chave)) continue;

        await base44.asServiceRole.entities.RubricaMuseuConfig.create({
          rubrica_id: rubrica.id,
          museu,
          categoria_key,
          divisor,
        });

        existentes.add(chave);

        criados.push({
          rubrica_id: rubrica.id,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          museu,
          categoria_key,
          divisor,
          budgetline_id: budgetlineId
        });
      }
    }

    return Response.json({
      success: true,
      message: `${criados.length} configurações criadas, ${ignorados.length} rubricas ignoradas`,
      criados,
      ignorados,
      total_rubricas: rubricas.length,
      total_configs_existentes: configsExistentes.length,
      total_budgetlines: budgetLines.length
    });
  } catch (error) {
    console.error('setupRubricasMuseuConfig error:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
