import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCentro(value: unknown): string {
  const raw = normalizeString(value);

  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw === 'geral') return 'Geral';
  if (raw === 'publicacoes') return 'Publicações';
  if (raw === 'noturno nos museus 2026') return 'Noturno nos Museus 2026';
  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim();
}

function getEntityCentro(entity: any): string {
  return normalizeCentro(
    entity?.centro_custo ||
      entity?.museu ||
      entity?.museu_codigo ||
      entity?.unidade ||
      ''
  );
}

function isCentroCompativel(selectedCentro: string, entityCentro: string): boolean {
  const centroSelecionado = normalizeCentro(selectedCentro);
  const centroEntidade = normalizeCentro(entityCentro);

  if (!centroSelecionado) return true;
  if (!centroEntidade) return true;
  if (centroEntidade === 'Geral') return true;
  return centroSelecionado === centroEntidade;
}

async function listAll(entityApi: any, orderBy = '', pageSize = 500) {
  let all: any[] = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);
    if (!batch?.length) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

function tokenize(text: string): string[] {
  return normalizeString(text)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function intersectionScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hits = a.filter((token) => setB.has(token)).length;
  return hits / Math.max(a.length, 1);
}

function heuristicSuggestion(
  rubricas: any[],
  descricao: string,
  categoria: string,
  tipoGasto: string,
  fornecedor: string,
  centroCusto: string
) {
  const texto = normalizeString(
    `${descricao} ${categoria} ${tipoGasto} ${fornecedor}`
  );

  const rules = [
    {
      keywords: ['lanche', 'cafe', 'coffeebreak', 'alimentacao', 'agua', 'suco', 'buffet'],
      hints: ['lanche', 'alimentacao', 'coffee', 'buffet'],
      justificativa: 'Compra com padrão típico de alimentação/lanche.',
    },
    {
      keywords: ['frete', 'carreto', 'transporte', 'van', 'motorista', 'uber', 'logistica'],
      hints: ['logistica', 'transporte', 'frete'],
      justificativa: 'Compra com padrão típico de transporte/logística.',
    },
    {
      keywords: ['designer', 'filmagem', 'foto', 'video', 'imprensa', 'social media', 'divulgacao'],
      hints: ['comunicacao', 'designer', 'imprensa', 'divulgacao', 'foto', 'video'],
      justificativa: 'Compra com padrão típico de comunicação e divulgação.',
    },
    {
      keywords: ['luva', 'epi', 'mascara', 'avental', 'material', 'consumo', 'papelaria'],
      hints: ['material', 'consumo', 'epi', 'oficina'],
      justificativa: 'Compra com padrão típico de material de consumo.',
    },
    {
      keywords: ['oficina', 'palestra', 'formacao', 'consultoria', 'acessibilidade'],
      hints: ['consultoria', 'formacao', 'acessibilidade', 'educativa'],
      justificativa: 'Compra com padrão típico de consultoria, formação ou atividade educativa.',
    },
  ];

  for (const rule of rules) {
    const hit = rule.keywords.some((k) => texto.includes(k));
    if (!hit) continue;

    const found = rubricas.find((r) => {
      const base = normalizeString(
        `${r?.grupo || ''} ${r?.rubrica || r?.nome || ''} ${getEntityCentro(r)}`
      );

      return (
        isCentroCompativel(centroCusto, getEntityCentro(r)) &&
        rule.hints.some((hint) => base.includes(hint))
      );
    });

    if (found) {
      return {
        rubrica_id: found.id,
        rubrica_nome: found.rubrica || found.nome || 'Rubrica',
        score: 82,
        justificativa: rule.justificativa,
        source: 'heuristic',
      };
    }
  }

  return null;
}

function buildRubricasContext(rubricas: any[]) {
  return rubricas
    .map((r) => {
      const nome = r?.rubrica || r?.nome || '';
      const grupo = r?.grupo || '';
      const centro = getEntityCentro(r) || 'Geral';
      const valor = toNumber(r?.valor_rubrica);
      return `ID: ${r.id} | Nome: ${nome} | Grupo: ${grupo} | Centro: ${centro} | Valor: ${valor}`;
    })
    .join('\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const descricao = String(body?.descricao || '').trim();
    const fornecedor = String(body?.fornecedor || '').trim();
    const categoria = String(body?.categoria || '').trim();
    const tipoGasto = String(body?.tipo_gasto || '').trim();
    const centroCusto = normalizeCentro(body?.centro_custo || '');

    if (!descricao || descricao.length < 6) {
      return Response.json({
        success: true,
        suggestion: null,
        reason: 'Descrição insuficiente para sugerir rubrica.',
      });
    }

    if (!centroCusto) {
      return Response.json({
        success: true,
        suggestion: null,
        reason: 'Centro de custo é obrigatório para sugerir rubrica.',
      });
    }

    const allRubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      500
    );

    const rubricasAtivas = (allRubricas || []).filter((r) => r?.ativo !== false);

    const rubricasCompativeis = rubricasAtivas.filter((r) =>
      isCentroCompativel(centroCusto, getEntityCentro(r))
    );

    if (rubricasCompativeis.length === 0) {
      return Response.json({
        success: true,
        suggestion: null,
        reason: `Nenhuma rubrica compatível encontrada para o centro ${centroCusto}.`,
      });
    }

    const heuristic = heuristicSuggestion(
      rubricasCompativeis,
      descricao,
      categoria,
      tipoGasto,
      fornecedor,
      centroCusto
    );

    if (heuristic) {
      return Response.json({
        success: true,
        suggestion: heuristic,
      });
    }

    const purchaseTokens = tokenize(
      `${descricao} ${categoria} ${tipoGasto} ${fornecedor}`
    );

    const rankedBySimilarity = rubricasCompativeis
      .map((rubrica) => {
        const rubricaText = `${rubrica?.rubrica || rubrica?.nome || ''} ${rubrica?.grupo || ''}`;
        const rubricaTokens = tokenize(rubricaText);
        const score = intersectionScore(purchaseTokens, rubricaTokens);
        return {
          rubrica,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    const topSimilarity = rankedBySimilarity[0];
    if (topSimilarity && topSimilarity.score >= 0.4) {
      return Response.json({
        success: true,
        suggestion: {
          rubrica_id: topSimilarity.rubrica.id,
          rubrica_nome:
            topSimilarity.rubrica.rubrica ||
            topSimilarity.rubrica.nome ||
            'Rubrica',
          score: Math.min(89, Math.round(topSimilarity.score * 100)),
          justificativa:
            'Sugestão por similaridade textual entre a descrição da compra e o nome/grupo da rubrica.',
          source: 'similarity',
        },
      });
    }

    const rubricasContext = buildRubricasContext(rubricasCompativeis);

    const prompt = `
Você é um especialista em classificação financeira de compras de projetos culturais.

Sua tarefa é escolher a rubrica MAIS adequada para a compra abaixo.

COMPRA
- Descrição: ${descricao}
- Fornecedor: ${fornecedor}
- Categoria: ${categoria}
- Tipo de gasto: ${tipoGasto}
- Centro de custo: ${centroCusto}

RUBRICAS CANDIDATAS
${rubricasContext}

REGRAS OBRIGATÓRIAS
- Escolha somente uma rubrica da lista.
- Não invente IDs.
- Considere que a compra pertence ao centro de custo ${centroCusto}.
- Responda em JSON válido.
- Score deve ser de 0 a 100.
- Justificativa curta, objetiva e técnica.

RETORNE JSON:
{
  "rubrica_id": "...",
  "rubrica_nome": "...",
  "score": 0,
  "justificativa": "..."
}
`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          rubrica_id: { type: 'string' },
          rubrica_nome: { type: 'string' },
          score: { type: 'number' },
          justificativa: { type: 'string' },
        },
        required: ['rubrica_id', 'rubrica_nome', 'score', 'justificativa'],
      },
    });

    const suggestedId = String(result?.rubrica_id || '').trim();
    const found = rubricasCompativeis.find((r) => r.id === suggestedId);

    if (!found) {
      return Response.json({
        success: true,
        suggestion: null,
        reason: 'A IA retornou uma rubrica inválida ou incompatível com o centro de custo.',
      });
    }

    const centroRubrica = getEntityCentro(found);
    if (!isCentroCompativel(centroCusto, centroRubrica)) {
      return Response.json({
        success: true,
        suggestion: null,
        reason: 'A IA sugeriu uma rubrica de centro incompatível.',
      });
    }

    return Response.json({
      success: true,
      suggestion: {
        rubrica_id: found.id,
        rubrica_nome: found.rubrica || found.nome || result.rubrica_nome,
        score: Math.max(0, Math.min(100, Math.round(Number(result?.score || 0)))),
        justificativa: String(result?.justificativa || ''),
        source: 'llm',
        centro_custo: centroCusto,
      },
    });
  } catch (error: any) {
    console.error('suggestRubrica error:', error);
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
});
