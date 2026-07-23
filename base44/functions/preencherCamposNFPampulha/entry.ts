import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PAMPULHA_CENTROS = ['Noturno Pampulha', 'Noturno nos Museus Pampulha'];

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Mapeia palavras-chave da categoria para keywords de match com rubricas
const CATEGORIA_KEYWORDS = [
  { keys: ['artistas', 'atracoes', 'atrações', 'contratacao de artistas'], rubricaMatch: ['artistas', 'atracoes', 'atrações', 'cultural'] },
  { keys: ['producao', 'produção', 'infraestrutura', 'locacao', 'locação', 'logistica'], rubricaMatch: ['producao', 'produção', 'infraestrutura', 'iluminacao', 'sonorizacao', 'carreto', 'grafico', 'grafica'] },
  { keys: ['equipe', 'coordenacao', 'coordenação', 'tecnica', 'técnica'], rubricaMatch: ['equipe', 'coordenacao', 'coordenação', 'tecnica', 'profissional'] },
  { keys: ['comunicacao', 'comunicação', 'divulgacao', 'divulgação', 'grafico', 'grafica'], rubricaMatch: ['comunicacao', 'comunicação', 'divulgacao', 'grafico', 'marketing'] },
];

function matchCategoria(categoria) {
  const n = norm(categoria || '');
  for (const entry of CATEGORIA_KEYWORDS) {
    if (entry.keys.some(k => n.includes(k))) return entry.rubricaMatch;
  }
  return null;
}

function findBestRubrica(rubricas, matchKeywords) {
  if (!matchKeywords) return null;
  let best = null;
  let bestScore = 0;
  for (const r of rubricas) {
    const text = norm((r.rubrica || '') + ' ' + (r.nome || '') + ' ' + (r.grupo || '') + ' ' + (r.descricao || ''));
    let score = 0;
    for (const kw of matchKeywords) {
      if (text.includes(norm(kw))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore > 0 ? best : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    // Busca rubricas do Noturno Pampulha
    const rubricasLists = await Promise.all(
      PAMPULHA_CENTROS.map(cc => base44.asServiceRole.entities.Rubrica.filter({ centro_custo: cc, ativo: true }))
    );
    const rubricas = rubricasLists.flat();

    // Busca todas as compras com centro_custo Pampulha
    const comprasLists = await Promise.all(
      PAMPULHA_CENTROS.map(cc => base44.asServiceRole.entities.PurchaseRequest.filter({ centro_custo: cc }))
    );
    const compras = comprasLists.flat();

    let atualizadas = 0;
    let sem_match = 0;
    let ja_completas = 0;
    const detalhes = [];

    for (const compra of compras) {
      const jaCompleto = compra.rubrica_id && compra.natureza_despesa && compra.cod;
      if (jaCompleto) {
        ja_completas++;
        continue;
      }

      // Determina rubrica pelo campo categoria da compra
      const matchKeywords = matchCategoria(compra.categoria || compra.descricao_item || '');
      const rubrica = findBestRubrica(rubricas, matchKeywords);

      if (!rubrica) {
        sem_match++;
        detalhes.push({ id: compra.id, descricao: compra.descricao_item, motivo: 'sem_match_rubrica', categoria: compra.categoria });
        continue;
      }

      // Prepara apenas campos vazios (não destrutivo)
      const update = {};
      if (!compra.rubrica_id) {
        update.rubrica_id = rubrica.id;
        update.rubrica_nome = rubrica.rubrica || rubrica.nome;
      }
      if (!compra.natureza_despesa && rubrica.natureza_despesa) {
        update.natureza_despesa = rubrica.natureza_despesa;
      }
      if (!compra.cod && rubrica.codigo) {
        update.cod = rubrica.codigo;
      }

      if (Object.keys(update).length === 0) {
        ja_completas++;
        continue;
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(compra.id, update);
      atualizadas++;
      detalhes.push({ id: compra.id, descricao: compra.descricao_item, rubrica_vinculada: rubrica.rubrica || rubrica.nome, campos_preenchidos: Object.keys(update) });
    }

    return Response.json({
      success: true,
      atualizadas,
      sem_match,
      ja_completas,
      total: compras.length,
      detalhes,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});