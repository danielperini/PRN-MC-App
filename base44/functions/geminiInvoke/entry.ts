/**
 * geminiInvoke — helper compartilhado de IA.
 *
 * Chama Gemini (Google AI) via Service Account JWT (sem OAuth interativo).
 * Fallback automático para OpenAI se a Service Account não estiver configurada
 * ou se a chamada Gemini falhar.
 *
 * Chamado por outras funções backend via:
 *   const res = await base44.functions.invoke('geminiInvoke', { prompt, fileUrls, jsonSchema });
 *   const result = res?.data?.result;
 *
 * Parâmetros:
 *   prompt      (string, obrigatório)
 *   fileUrls    (string[], opcional) — URLs de imagens para análise visual (Gemini Vision)
 *   jsonSchema  (object|null) — se truthy, solicita resposta JSON e faz parse
 *   model       (string, opcional) — ex: 'gemini-2.0-flash' | 'gpt-4o' (aplicado ao provedor usado)
 *   maxTokens   (number, opcional)
 *   temperature (number, opcional)
 *
 * Retorna: { result, provider } onde result é string ou objeto (se jsonSchema).
 */

// ── Base64URL ──
function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToAB(pem) {
  const b64 = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken = null;
let cachedTokenExp = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExp - 60_000) return cachedToken;
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurada');
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const enc = new TextEncoder();
  const headerB = b64url(enc.encode(JSON.stringify(header)));
  const payloadB = b64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB}.${payloadB}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToAB(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => resp.statusText);
    throw new Error(`Google token ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  cachedToken = data.access_token;
  cachedTokenExp = (now + (data.expires_in || 3600)) * 1000;
  return cachedToken;
}

async function fetchImageB64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch image ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function guessMime(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('.png')) return 'image/png';
  if (u.includes('.webp')) return 'image/webp';
  if (u.includes('.gif')) return 'image/gif';
  if (u.includes('.heic')) return 'image/heic';
  return 'image/jpeg';
}

async function callGemini({ prompt, fileUrls = [], jsonSchema = null, model = 'gemini-2.0-flash', maxTokens = 4096, temperature = 0.2 }) {
  const token = await getAccessToken();
  const parts = [{ text: prompt }];
  for (const url of fileUrls) {
    if (!url) continue;
    try {
      const b64 = await fetchImageB64(url);
      parts.push({ inline_data: { mime_type: guessMime(url), data: b64 } });
    } catch (e) {
      console.warn('[geminiInvoke] falha ao buscar imagem:', e?.message || e);
    }
  }
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonSchema ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gemini ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p?.text || '')
    .join('') || '';
  if (jsonSchema) {
    try { return JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
  }
  return text;
}

async function callOpenAI({ prompt, fileUrls = [], jsonSchema = null, model = 'gpt-4o', maxTokens = 4096, temperature = 0.2 }) {
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
    temperature,
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
      const content = data?.choices?.[0]?.message?.content ?? '';
      if (jsonSchema) {
        try { return JSON.parse(content); }
        catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
      }
      return content;
    } catch (e) {
      lastErr = e;
      if (i === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      prompt,
      fileUrls = [],
      jsonSchema = null,
      model,
      maxTokens = 4096,
      temperature = 0.2,
    } = body || {};

    if (!prompt) return Response.json({ error: 'prompt é obrigatório' }, { status: 400 });

    const hasSA = !!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    let geminiError = null;

    if (hasSA) {
      try {
        const result = await callGemini({
          prompt,
          fileUrls,
          jsonSchema,
          model: model || 'gemini-2.0-flash',
          maxTokens,
          temperature,
        });
        return Response.json({ result, provider: 'gemini' });
      } catch (e) {
        geminiError = e;
        console.warn('[geminiInvoke] Gemini falhou, tentando OpenAI:', e?.message || e);
      }
    }

    if (Deno.env.get('OPENAI_API_KEY')) {
      try {
        const result = await callOpenAI({
          prompt,
          fileUrls,
          jsonSchema,
          model: model || 'gpt-4o',
          maxTokens,
          temperature,
        });
        return Response.json({ result, provider: 'openai', gemini_error: geminiError?.message });
      } catch (e) {
        return Response.json({ error: `${geminiError?.message || ''} | OpenAI: ${e.message}` }, { status: 500 });
      }
    }

    return Response.json({ error: geminiError?.message || 'Nenhum provedor de IA configurado' }, { status: 500 });
  } catch (error) {
    console.error('[geminiInvoke] erro:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});