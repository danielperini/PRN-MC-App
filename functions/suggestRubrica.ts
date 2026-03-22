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
  if (raw.includes('mis')) return 'MIS';
  if (raw.includes('mhab')) return 'MHAB';
  if (raw.includes('mumo')) return 'MUMO';
  if (raw === 'geral') return 'Geral';

  return String(value || '').trim();
}

function getCentro(entity: any): string {
  return normalizeCentro(
    entity?.centro_custo ||
    entity?.museu ||
    entity?.unidade
  );
}

function isCentroCompativel(selected: string, entity: string): boolean {
  if (!selected || !entity) return true;
  if (entity === 'Geral') return true;
  return selected === entity;
}

function tokenize(text: string): string[] {
  return normalizeString(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function similarity(a: string[], b: string[]): number {
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / Math.max(a.length, 1);
}

// 🔥 HEURÍSTICA FORTE
function heuristic(rubricas, texto, centro) {

  const rules = [
    { keys: ['lanche','cafe','buffet','alimentacao'], hint: 'lanche' },
    { keys: ['frete','carreto','transporte'], hint: 'transporte' },
    { keys: ['designer','video','foto','imprensa'], hint: 'comunicacao' },
    { keys: ['material','consumo','epi'], hint: 'material' },
    { keys: ['oficina','palestra','consultoria'], hint: 'consultoria' },
  ];

  for (const r of rules) {
    if (!r.keys.some(k => texto.includes(k))) continue;

    const match = rubricas.find(rb => {
      const base = normalizeString(`${rb.nome} ${rb.grupo}`);
      return base.includes(r.hint) && isCentroCompativel(centro, getCentro(rb));
    });

    if (match) {
      return {
        rubrica_id: match.id,
        rubrica_nome: match.nome,
        score: 85,
        justificativa: 'Heurística baseada em padrão de compra',
        source: 'heuristic'
      };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const descricao = String(body.descricao || '');
    const fornecedor = String(body.fornecedor || '');
    const categoria = String(body.categoria || '');
    const tipo = String(body.tipo_gasto || '');
    const centro = normalizeCentro(body.centro_custo);

    if (!descricao || descricao.length < 5) {
      return Response.json({ success: true, suggestion: null });
    }

    const rubricas = await base44.asServiceRole.entities.Rubrica.list();

    const valid = rubricas.filter(r =>
      r.ativo !== false &&
      isCentroCompativel(centro, getCentro(r))
    );

    if (!valid.length) {
      return Response.json({ success: true, suggestion: null });
    }

    const texto = normalizeString(`${descricao} ${categoria} ${tipo} ${fornecedor}`);

    // 🔥 1. HEURÍSTICA
    const h = heuristic(valid, texto, centro);
    if (h) return Response.json({ success: true, suggestion: h });

    // 🔥 2. SIMILARIDADE
    const tokens = tokenize(texto);

    const ranked = valid.map(r => {
      const t = tokenize(`${r.nome} ${r.grupo}`);
      return {
        r,
        score: similarity(tokens, t)
      };
    }).sort((a,b)=>b.score-a.score);

    if (ranked[0]?.score >= 0.5) {
      return Response.json({
        success: true,
        suggestion: {
          rubrica_id: ranked[0].r.id,
          rubrica_nome: ranked[0].r.nome,
          score: Math.round(ranked[0].score*100),
          justificativa: 'Similaridade textual',
          source: 'similarity'
        }
      });
    }

    // 🔥 3. IA (fallback final)
    const context = valid.map(r => `${r.id} - ${r.nome}`).join('\n');

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `
Escolha a melhor rubrica:

Compra: ${descricao}
Centro: ${centro}

Rubricas:
${context}

Responda JSON:
{ "rubrica_id": "", "score": 0, "justificativa": "" }
`
    });

    const found = valid.find(r => r.id === result.rubrica_id);

    if (!found) {
      return Response.json({ success: true, suggestion: null });
    }

    return Response.json({
      success: true,
      suggestion: {
        rubrica_id: found.id,
        rubrica_nome: found.nome,
        score: result.score || 60,
        justificativa: result.justificativa || 'IA fallback',
        source: 'llm'
      }
    });

  } catch (e) {
    return Response.json({ success: false, error: e.message });
  }
});
