import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

async function invokeOpenAI({ prompt, model = 'gpt-4o-mini' }: any): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const body: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => resp.statusText);
    throw new Error(`OpenAI ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  }
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

function normalizeFornecedor(value: unknown): string {
  return normalizeString(value)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function getMesKey(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getRubricaLabel(r: any): string {
  return String(r?.rubrica || r?.nome || r?.descricao || '').trim();
}
function getRubricaGrupo(r: any): string {
  return String(r?.grupo || r?.categoria || '').trim();
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

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('ITEM_TIMEOUT')), ms)),
  ]);
}

function buildDuplicataKey(p: any): string {
  const fornecedor = normalizeFornecedor(p?.fornecedor_nome || p?.nf_emitente_nome);
  const valor = round2(toNumber(p?.valor_solicitado || p?.valor_total || p?.nf_valor_total));
  const dataRef = p?.nf_data_emissao || p?.created_date;
  const mes = getMesKey(dataRef);
  if (!fornecedor || valor <= 0) return '';
  return `${fornecedor}::${valor}::${mes}`;
}

async function analisarItem(purchase: any, compras: any[], rubricas: any[], metas: any, index: number): Promise<any> {
  const id = purchase?.id;
  if (!id) return { id: null, success: false, error: 'ID ausente' };

  // Duplicatas: só conta duplicatas com mesmo fornecedor+valor+mês E que tenham sido APROVADAS/PAGAS previamente
  const chave = buildDuplicataKey(purchase);
  const duplicata = chave ?
    compras.some((c) =>
      c.id !== id &&
      !c.duplicada_financeira &&
      (c.status === 'APROVADO_ADMIN' || c.status === 'PAGO' || c.status === 'APROVADO_COORD') &&
      buildDuplicataKey(c) === chave
    ) : false;

  const fornecedor = normalizeFornecedor(purchase?.fornecedor_nome || purchase?.nf_emitente_nome);
  const centro = normalizeString(purchase?.centro_custo);

  // Histórico do mesmo fornecedor (mesmo CNPJ/nome normalizado)
  const historico = compras
    .filter((c) =>
      c.id !== id &&
      (c.rubrica_id || c.meta_id) &&
      normalizeFornecedor(c?.fornecedor_nome || c?.nf_emitente_nome) === fornecedor &&
      fornecedor.length >= 3
    )
    .sort((a, b) => new Date(b?.created_date || 0).getTime() - new Date(a?.created_date || 0).getTime())
    .slice(0, 8);

  const descricao = String(purchase?.descricao_item || '').slice(0, 400);
  const valor = toNumber(purchase?.valor_solicitado || purchase?.valor_total || purchase?.nf_valor_total);

  const rubricaContext = rubricas
    .filter((r) => r?.ativo !== false)
    .slice(0, 200)
    .map((r) => `${r.id} | ${getRubricaLabel(r)} | ${getRubricaGrupo(r)} | ${r?.meta_id || r?.meta || ''} | centro:${r?.centro_custo || ''}`)
    .join('\n');

  const metasContext = metas.map((m) => `${m.id} | ${m.nome}`).slice(0, 30).join('\n');

  const historicoContext = historico.length
    ? historico.map((c) => `rubrica=${c.rubrica_id} meta=${c.meta_id || ''} valor=${toNumber(c.valor_solicitado || c.valor_total)} status=${c.status}`).join('\n')
    : '(sem histórico)';

  const prompt = `Você é umanalista financeiro do projeto Museus Centro (3º Aditivo).
Escolha a RUBRICA e a META ideais para a compra abaixo e dê um SCORE de confiança (0-100).

Compra:
- Descrição: "${descricao}"
- Fornecedor: "${fornecedor}"
- Centro de custo: "${centro}"
- Valor: R$ ${valor.toFixed(2)}
- Data NF: ${purchase?.nf_data_emissao || 'sem data'}

Histórico do mesmo fornecedor:
${historicoContext}

Metas disponíveis (ProjectMeta):
${metasContext}

Rubricas disponíveis (Rubrica):
${rubricaContext}

Regras:
- Priorize o histórico do fornecedor se houver (score maior).
- A rubrica deve ter centro_custo compatível com "${centro}" quando possível.
- Considere descrição + categoria + valor.
- Score ≥ 90 = muito confiável; 70-89 = médio; <70 = baixo.

Responda somente JSON:
{
  "rubrica_id": "id da rubrica escolhida",
  "rubrica_nome": "nome da rubrica",
  "meta_id": "id da meta ou vazio",
  "confianca": 0,
  "justificativa": "curta"
}`;

  let llmRaw: any = null;
  let source = 'llm';
  try {
    const aiResp = await base44!.functions.invoke('AIService', {
      task_type: 'compras_lote_ia',
      prompt,
      json_schema: { type: 'object' },
      model: 'gpt-4o-mini',
      feature: 'processarComprasEmLoteIA',
      prompt_version: '1',
    });
    llmRaw = aiResp?.data?.result ?? null;
  } catch {
    try {
      llmRaw = await invokeOpenAI({ prompt });
      source = 'llm_direct';
    } catch (e) {
      source = 'fallback_fn';
      // fallback final: reusa suggestRubrica
      try {
        const fb = await base44!.functions.invoke('suggestRubrica', {
          descricao_item: descricao,
          fornecedor,
          centro_custo: purchase?.centro_custo,
          tipo_gasto: purchase?.tipo_gasto,
          categoria: purchase?.categoria,
        });
        const s = fb?.data?.suggestion || fb?.suggestion;
        llmRaw = s ? {
          rubrica_id: s.rubrica_id,
          rubrica_nome: s.rubrica_nome,
          meta_id: s.meta_nome || '',
          confianca: s.score || 50,
          justificativa: s.justificativa || 'fallback suggestRubrica',
        } : null;
      } catch (e2) {
        llmRaw = null;
      }
    }
  }

  if (!llmRaw?.rubrica_id) {
    return {
      id,
      success: true,
      rubrica_id: purchase?.rubrica_id || '',
      rubrica_nome: '',
      meta_sugerida: purchase?.meta_id || '',
      confianca: 0,
      is_duplicata: duplicata,
      motivo_duplicata: duplicata ? 'Mesmo fornecedor + valor + mês já aprovado/pago' : '',
      justificativa: 'IA sem sugestão',
      source,
      index,
    };
  }

  const confianca = Math.max(0, Math.min(100, Math.round(toNumber(llmRaw.confianca)) || 0));
  const rubrica = rubricas.find((r) => r.id === llmRaw.rubrica_id);
  const rubricaNome = rubrica ? getRubricaLabel(rubrica) : llmRaw.rubrica_nome || '';

  return {
    id,
    success: true,
    rubrica_id: llmRaw.rubrica_id,
    rubrica_nome: rubricaNome,
    meta_sugerida: llmRaw.meta_id || '',
    confianca,
    is_duplicata: duplicata,
    motivo_duplicata: duplicata ? 'Mesmo fornecedor + valor + mês já aprovado/pago' : '',
    justificativa: llmRaw.justificativa || '',
    source,
    index,
  };
}

async function processarEmLotes(items: any[], compras: any[], rubricas: any[], metas: any, batchSize = 10): Promise<any[]> {
  const all: any[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((p, idx) =>
        withTimeout(analisarItem(p, compras, rubricas, metas, i + idx), 15_000).catch((e) => ({
          id: p?.id,
          success: false,
          error: (e?.message || String(e)).slice(0, 200),
          confianca: 0,
          is_duplicata: false,
          index: i + idx,
        }))
      )
    );
    all.push(...results);
    await delay(200);
  }
  return all;
}

let base44: any = null;

Deno.serve(async (req) => {
  try {
    base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const purchaseIds: string[] = Array.isArray(body.purchase_ids) ? body.purchase_ids : [];

    if (purchaseIds.length === 0) {
      return Response.json({ success: false, error: 'Nenhum purchase_id enviado' }, { status: 400 });
    }
    if (purchaseIds.length > 50) {
      return Response.json({ success: false, error: 'Máximo 50 itens por chamada' }, { status: 400 });
    }

    // Carrega compras recentes (histórico), rubricas e metas em paralelo
    const [compras, rubricas, metas] = await Promise.all([
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 400),
      base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 300).catch(() => []),
      base44.asServiceRole.entities.ProjectMeta.list('ordem', 60).catch(() => []),
    ]);

    // seleciona apenas os itens solicitados
    const idSet = new Set(purchaseIds);
    const targets = (compras || []).filter((c: any) => idSet.has(c.id));

    const resultados = await processarEmLotes(targets, compras || [], rubricas || [], metas || [], 10);

    return Response.json({ success: true, results: resultados, total: resultados.length });
  } catch (e: any) {
    console.error('processarComprasEmLoteIA error:', e);
    return Response.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
});