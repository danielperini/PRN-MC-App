import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// AIService — Serviço centralizado de IA com cache por hash de conteúdo
// Versão: 2.0
// REGRAS:
//   - Nunca chamar IA sem verificar cache antes
//   - Salvar resultado no banco (AICache) e reutilizar
//   - Proteção contra chamadas duplicadas simultâneas (inflight map)
//   - Controle de uso (AIUsageLog)
//   - force_refresh=true ignora cache (botão "Reanalisar" manual)

const inflight = new Map();

const COST_PER_1K = {
  'gpt-4o':        { input: 0.005,   output: 0.015  },
  'gpt-4o-mini':   { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo':   { input: 0.01,    output: 0.03   },
  'gpt-3.5-turbo': { input: 0.0005,  output: 0.0015 },
};

function estimateCost(model, tokensIn, tokensOut) {
  const rates = COST_PER_1K[model] || { input: 0.005, output: 0.015 };
  return (tokensIn / 1000) * rates.input + (tokensOut / 1000) * rates.output;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function invokeOpenAI({ prompt, fileUrls = [], jsonSchema = null, model = 'gpt-4o-mini', maxTokens = 2048 }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

  const userContent = [{ type: 'text', text: prompt }];
  for (const url of fileUrls) {
    if (url) userContent.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }

  const body = {
    model,
    messages: [{ role: 'user', content: userContent.length === 1 ? userContent[0].text : userContent }],
    max_tokens: maxTokens,
    temperature: 0.15,
  };
  if (jsonSchema) body.response_format = { type: 'json_object' };

  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => resp.statusText);
        throw new Error(`OpenAI ${resp.status}: ${t}`);
      }
      const data = await resp.json();
      const rawContent = data?.choices?.[0]?.message?.content ?? '';
      const tokensIn = data?.usage?.prompt_tokens ?? 0;
      const tokensOut = data?.usage?.completion_tokens ?? 0;
      const cost = estimateCost(model, tokensIn, tokensOut);
      console.log(`[AIService] model=${model} in=${tokensIn} out=${tokensOut} cost=$${cost.toFixed(5)}`);

      let content = rawContent;
      if (jsonSchema) {
        try { content = JSON.parse(rawContent); }
        catch { const m = rawContent.match(/\{[\s\S]*\}/); content = m ? JSON.parse(m[0]) : {}; }
      }
      return { content, tokensIn, tokensOut };
    } catch (e) {
      lastErr = e;
      if (i === 0) { console.warn('[AIService] retry:', e.message); await new Promise(r => setTimeout(r, 2000)); }
    }
  }
  throw lastErr;
}

async function processRequest(srv, userEmail, params) {
  const {
    task_type, prompt, json_schema = null, model = 'gpt-4o-mini',
    max_tokens = 2048, file_urls = [], feature = task_type,
    force_refresh = false, prompt_version = '1', ttl_hours = 0,
  } = params;

  const keySource = `${task_type}::${prompt_version}::${model}::${JSON.stringify(file_urls)}::${prompt}`;
  const cache_key = await sha256(keySource);
  const t0 = Date.now();

  // Proteção inflight — não iniciar chamada duplicada simultânea
  if (!force_refresh && inflight.has(cache_key)) {
    console.log(`[AIService] inflight hit: ${cache_key.slice(0, 12)}...`);
    const result = await inflight.get(cache_key);
    return { result, cache_hit: true, cache_key };
  }

  // Verificar cache no banco
  if (!force_refresh) {
    try {
      const cached = await srv.entities.AICache.filter({ cache_key }, '-created_date', 1);
      const hit = Array.isArray(cached) ? cached[0] : null;
      if (hit) {
        const expired = hit.expires_at && new Date(hit.expires_at) < new Date();
        if (!expired) {
          console.log(`[AIService] cache hit: ${task_type} key=${cache_key.slice(0, 12)}...`);
          srv.entities.AICache.update(hit.id, {
            hit_count: (hit.hit_count || 0) + 1,
            last_hit_at: new Date().toISOString(),
          }).catch(() => {});
          srv.entities.AIUsageLog.create({
            task_type, model_used: hit.model_used || model,
            tokens_input: 0, tokens_output: 0, cost_estimated_usd: 0,
            cache_hit: true, user_email: userEmail, feature,
            duration_ms: Date.now() - t0, cache_key,
          }).catch(() => {});
          return { result: hit.result_json ?? hit.result_text ?? null, cache_hit: true, cache_key };
        }
      }
    } catch (e) {
      console.warn('[AIService] erro ao verificar cache:', e.message);
    }
  }

  // Chamar OpenAI com proteção inflight
  const call = (async () => {
    const { content, tokensIn, tokensOut } = await invokeOpenAI({
      prompt, fileUrls: file_urls, jsonSchema: json_schema, model, maxTokens: max_tokens,
    });
    const costUsd = estimateCost(model, tokensIn, tokensOut);
    const expires_at = ttl_hours > 0 ? new Date(Date.now() + ttl_hours * 3_600_000).toISOString() : null;

    const cachePayload = {
      cache_key, task_type, model_used: model, prompt_version,
      tokens_input: tokensIn, tokens_output: tokensOut,
      cost_estimated_usd: costUsd, hit_count: 0, user_email: userEmail, force_refresh,
    };
    if (json_schema) cachePayload.result_json = content;
    else cachePayload.result_text = String(content ?? '');
    if (expires_at) cachePayload.expires_at = expires_at;

    srv.entities.AICache.create(cachePayload).catch(() => {});
    srv.entities.AIUsageLog.create({
      task_type, model_used: model,
      tokens_input: tokensIn, tokens_output: tokensOut, cost_estimated_usd: costUsd,
      cache_hit: false, user_email: userEmail, feature,
      duration_ms: Date.now() - t0, cache_key,
    }).catch(() => {});

    return content;
  })();

  inflight.set(cache_key, call);
  try {
    const result = await call;
    return { result, cache_hit: false, cache_key };
  } finally {
    inflight.delete(cache_key);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const srv = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    // Rota: estatísticas de uso
    if (body.action === 'get_usage_stats') {
      const [logs, caches] = await Promise.all([
        srv.entities.AIUsageLog.list('-created_date', 500).catch(() => []),
        srv.entities.AICache.list('-created_date', 500).catch(() => []),
      ]);
      const totalCalls = logs.filter(l => !l.cache_hit).length;
      const cacheHits = logs.filter(l => l.cache_hit).length;
      const totalTokensIn = logs.reduce((s, l) => s + (l.tokens_input || 0), 0);
      const totalTokensOut = logs.reduce((s, l) => s + (l.tokens_output || 0), 0);
      const totalCost = logs.reduce((s, l) => s + (l.cost_estimated_usd || 0), 0);
      const savedCalls = caches.reduce((s, c) => s + (c.hit_count || 0), 0);
      const byTask = {};
      for (const l of logs) {
        const k = l.task_type || 'unknown';
        if (!byTask[k]) byTask[k] = { calls: 0, cache_hits: 0, tokens: 0, cost: 0 };
        if (l.cache_hit) byTask[k].cache_hits++;
        else { byTask[k].calls++; byTask[k].tokens += (l.tokens_input || 0) + (l.tokens_output || 0); byTask[k].cost += l.cost_estimated_usd || 0; }
      }
      return Response.json({
        success: true,
        stats: {
          total_ai_calls: totalCalls, total_cache_hits: cacheHits,
          calls_saved: savedCalls, total_tokens_input: totalTokensIn,
          total_tokens_output: totalTokensOut,
          total_cost_usd: parseFloat(totalCost.toFixed(4)),
          cache_entries: caches.length, by_task: byTask,
        },
      });
    }

    // Rota: limpar cache
    if (body.action === 'clear_cache') {
      if (user.role !== 'admin') return Response.json({ error: 'Apenas admins' }, { status: 403 });
      const filter = {};
      if (body.task_type) filter.task_type = body.task_type;
      if (body.cache_key) filter.cache_key = body.cache_key;
      const entries = await srv.entities.AICache.filter(filter, '-created_date', 500).catch(() => []);
      for (const e of entries) await srv.entities.AICache.delete(e.id).catch(() => {});
      return Response.json({ success: true, cleared: entries.length });
    }

    // Rota: análise principal
    const { task_type, prompt, json_schema, model, max_tokens, file_urls, feature, force_refresh, prompt_version, ttl_hours } = body;
    if (!task_type || !prompt) {
      return Response.json({ error: 'task_type e prompt são obrigatórios' }, { status: 400 });
    }

    const { result, cache_hit, cache_key } = await processRequest(srv, user.email, {
      task_type, prompt, json_schema, model, max_tokens, file_urls, feature, force_refresh, prompt_version, ttl_hours,
    });

    return Response.json({ success: true, result, cache_hit, cache_key });

  } catch (error) {
    console.error('[AIService] erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});