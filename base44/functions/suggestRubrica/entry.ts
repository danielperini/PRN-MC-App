import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

async function invokeOpenAI({ prompt, jsonSchema = null, model = 'gpt-4o-mini' }: any): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const body: any = { model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024, temperature: 0.1 };
  if (jsonSchema) body.response_format = { type: 'json_object' };
  let lastErr: any;
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) { const t = await resp.text().catch(() => resp.statusText); throw new Error(`OpenAI ${resp.status}: ${t}`); }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      if (jsonSchema) { try { return JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } }
      return content;
    } catch (e: any) { lastErr = e; if (i === 0) await new Promise(r => setTimeout(r, 1000)); }
  }
  throw lastErr;
}

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
  if (raw === 'geral' || raw === 'global') return 'Geral';
  if (raw.includes('noturno')) return 'Noturno nos Museus 2026';
  if (raw.includes('publica')) return 'Publicações';

  return String(value || '').trim();
}

function getCentro(entity: any): string {
  return normalizeCentro(
    entity?.centro_custo ||
    entity?.museu ||
    entity?.unidade ||
    ''
  );
}

function isCentroCompativel(selected: string, entity: string): boolean {
  if (!selected || !entity) return true;
  if (entity === 'Geral') return true;
  return selected === entity;
}

function getRubricaLabel(r: any): string {
  return String(r?.rubrica || r?.nome || r?.descricao || '').trim();
}

function getRubricaGrupo(r: any): string {
  return String(r?.grupo || r?.categoria || '').trim();
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

async function listAll(entityApi: any, orderBy = '', pageSize = 200) {
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

function heuristic(rubricas: any[], texto: string, centro: string) {
  const rules = [
    { keys: ['lanche', 'cafe', 'buffet', 'alimentacao', 'coffee', 'coffeebreak'], hint: 'lanche' },
    { keys: ['frete', 'carreto', 'transporte', 'van', 'taxi', 'uber'], hint: 'transporte' },
    { keys: ['designer', 'video', 'foto', 'imprensa', 'grafica', 'impressao', 'social media', 'rede social'], hint: 'comunicacao' },
    { keys: ['material', 'consumo', 'epi', 'equipamento', 'insumo'], hint: 'material' },
    { keys: ['oficina', 'palestra', 'consultoria', 'facilitador', 'formacao', 'acessibilidade'], hint: 'consultoria' },
  ];

  for (const r of rules) {
    if (!r.keys.some((k) => texto.includes(k))) continue;

    const match = rubricas.find((rb) => {
      const base = normalizeString(`${getRubricaLabel(rb)} ${getRubricaGrupo(rb)}`);
      return base.includes(r.hint) && isCentroCompativel(centro, getCentro(rb));
    });

    if (match) {
      return {
        rubrica_id: match.id,
        rubrica_nome: getRubricaLabel(match),
        score: 85,
        justificativa: 'Heurística baseada em padrão de compra',
        source: 'heuristic',
      };
    }
  }

  return null;
}

function tryParseJson(value: any) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  const text = String(value).trim();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const descricao = String(body.descricao || body.descricao_item || '');
    const fornecedor = String(body.fornecedor || body.fornecedor_nome || '');
    const categoria = String(body.categoria || '');
    const tipo = String(body.tipo_gasto || '');
    const centro = normalizeCentro(body.centro_custo);

    if (!descricao || descricao.length < 5) {
      return Response.json({ success: true, suggestion: null });
    }

    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      200
    );

    const valid = rubricas.filter((r: any) =>
      r?.ativo !== false &&
      isCentroCompativel(centro, getCentro(r))
    );

    if (!valid.length) {
      return Response.json({ success: true, suggestion: null });
    }

    const texto = normalizeString(
      `${descricao} ${categoria} ${tipo} ${fornecedor}`
    );

    const h = heuristic(valid, texto, centro);
    if (h) {
      return Response.json({ success: true, suggestion: h });
    }

    const tokens = tokenize(texto);

    const ranked = valid
      .map((r: any) => {
        const t = tokenize(`${getRubricaLabel(r)} ${getRubricaGrupo(r)}`);
        return {
          r,
          score: similarity(tokens, t),
        };
      })
      .sort((a: any, b: any) => b.score - a.score);

    if (ranked[0]?.score >= 0.5) {
      return Response.json({
        success: true,
        suggestion: {
          rubrica_id: ranked[0].r.id,
          rubrica_nome: getRubricaLabel(ranked[0].r),
          score: Math.round(toNumber(ranked[0].score) * 100),
          justificativa: 'Similaridade textual',
          source: 'similarity',
        },
      });
    }

    const context = valid
      .map((r: any) => `${r.id} - ${getRubricaLabel(r)} - ${getRubricaGrupo(r)}`)
      .join('\n');

    // BASE DE CONHECIMENTO — busca KnowledgeDocument do 3º Aditivo
    let baseConhecimento = '';
    try {
      const docs = await base44.asServiceRole.entities.KnowledgeDocument.filter(
        { ativo: true },
        '-created_date',
        20
      );
      const doc = (docs || []).find((d: any) =>
        String(d.titulo || '').includes('Tudo Projeto')
      );
      if (doc?.conteudo_extraido) {
        baseConhecimento = doc.conteudo_extraido.slice(0, 3000);
      }
    } catch {}

    const baseSection = baseConhecimento
      ? `\nBase oficial do 3º Aditivo:\n${baseConhecimento}\n`
      : '';

    // Cache via AIService antes de chamar OpenAI diretamente
    const cachePrompt = `Escolha a melhor rubrica para esta compra.
${baseSection}
Compra: ${descricao}
Fornecedor: ${fornecedor}
Categoria: ${categoria}
Tipo: ${tipo}
Centro: ${centro}

Rubricas disponíveis:
${context}

Responda somente JSON válido:
{"rubrica_id":"","score":0,"justificativa":"","meta_nome":"","centro_custo":""}`;

    let llmRaw = null;
    try {
      const aiResp = await base44.functions.invoke('AIService', {
        task_type: 'rubrica_suggestion',
        prompt: cachePrompt,
        json_schema: { type: 'object' },
        model: 'gpt-4o-mini',
        feature: 'suggestRubrica',
        prompt_version: '1',
      });
      llmRaw = aiResp?.data?.result ?? null;
    } catch {
      // fallback: chama OpenAI diretamente se AIService falhar
      llmRaw = await invokeOpenAI({ prompt: cachePrompt, jsonSchema: { type: 'object' }, model: 'gpt-4o-mini' });
    }

    const found = valid.find((r: any) => r.id === llmRaw?.rubrica_id);

    if (!found) {
      return Response.json({ success: true, suggestion: null });
    }

    return Response.json({
      success: true,
      suggestion: {
        rubrica_id: found.id,
        rubrica_nome: getRubricaLabel(found),
        score: toNumber(llmRaw?.score) || 60,
        justificativa: llmRaw?.justificativa || 'IA conhecimento',
        meta_nome: llmRaw?.meta_nome || '',
        centro_custo: llmRaw?.centro_custo || '',
        source: 'llm_knowledge',
      },
    });
  } catch (e: any) {
    console.error('suggestRubrica error:', e);
    return Response.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
});