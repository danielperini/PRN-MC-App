/**
 * Utilitário central para chamar Gemini (Google AI) via Service Account JWT.
 * Invocado por outras funções backend via base44.functions.invoke('callGemini', {...}).
 * Quando GOOGLE_SERVICE_ACCOUNT_JSON não está configurado, retorna erro para o chamador
 * decidir o fallback (OpenAI).
 *
 * Suporta:
 *  - texto apenas {prompt}
 *  - visão (anexo de imagens via fileUrls → baixa e envia inline_data base64)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

interface GeminiCallParams {
  prompt: string;
  fileUrls?: string[];
  jsonSchema?: any;
  maxTokens?: number;
  temperature?: number;
  model?: string; // gemini-2.0-flash (default), gemini-1.5-pro, gemini-2.5-flash
}

// ── JWT helpers usando Web Crypto (SubtleCrypto) ──
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim();
  // base64 decode
  const byteChars = atob(b64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(payload: any, privateKeyPem: string): Promise<string> {
  const keyData = pemToArrayBuffer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const headerB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  );
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

// token cache em memória (module scope persiste entre invocações warm)
let cachedAccessToken: string | null = null;
let cachedTokenExp: number = 0;

async function getServiceAccountAccessToken(scope: string): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < cachedTokenExp - 60_000) return cachedAccessToken;

  const saJsonRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!saJsonRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado');
  const sa = JSON.parse(saJsonRaw);
  const clientEmail = sa.client_email;
  const privateKey = sa.private_key;
  if (!clientEmail || !privateKey) throw new Error('Service Account JSON inválido');

  const nowSec = Math.floor(now / 1000);
  const jwt = await signJwt(
    {
      iss: clientEmail,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    },
    privateKey
  );

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => resp.statusText);
    throw new Error(`Token SA ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  cachedAccessToken = data.access_token;
  cachedTokenExp = now + (data.expires_in || 3600) * 1000;
  return cachedAccessToken!;
}

// ── fetch de imagem para base64 (inline_data para Gemini Vision) ──
async function fetchImageAsInlineBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || 'image/jpeg';
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { mimeType: ct.split(';')[0], data: btoa(bin) };
  } catch {
    return null;
  }
}

// ── chamada Gemini REST (generativelanguage.googleapis.com v1beta) ──
async function callGeminiApi(params: GeminiCallParams, accessToken: string): Promise<any> {
  const model = params.model || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const parts: any[] = [{ text: params.prompt || '' }];
  const imageUrls = params.fileUrls || [];

  for (const url of imageUrls) {
    if (!url) continue;
    const inline = await fetchImageAsInlineBase64(url);
    if (inline) parts.push({ inline_data: { mime_type: inline.mimeType, data: inline.data } });
  }

  const body: any = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: params.temperature ?? 0.2,
      maxOutputTokens: params.maxTokens || 2048,
    },
  };
  if (params.jsonSchema) {
    body.generationConfig.response_mime_type = 'application/json';
  }

  const resp = await fetch(`${endpoint}?key=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gemini ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  return text;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Permite chamada de serviço ou usuário autenticado
    let authed = false;
    try { authed = await base44.auth.isAuthenticated(); } catch {}
    // Não bloqueia se não autenticado — outros backends invocam como service_role.
    // (Mesmo assim, o Deno Deploy valida por JWT de app; chamadas internas funcionam.)

    const body = await req.json().catch(() => ({}));
    const { prompt, fileUrls, jsonSchema, maxTokens, temperature, model } = body || {};

    if (!prompt) return Response.json({ error: 'prompt obrigatório' }, { status: 400 });

    const accessToken = await getServiceAccountAccessToken(
      'https://www.googleapis.com/auth/cloud-platform'
    );
    const text = await callGeminiApi({ prompt, fileUrls, jsonSchema, maxTokens, temperature, model }, accessToken);

    let result: any = text;
    if (jsonSchema) {
      try {
        result = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          try { result = JSON.parse(m[0]); } catch { result = {}; }
        } else {
          result = {};
        }
      }
    }

    return Response.json({ ok: true, provider: 'gemini', result });
  } catch (error) {
    return Response.json({
      ok: false,
      provider: 'gemini',
      error: String(error?.message || error),
    }, { status: 500 });
  }
});