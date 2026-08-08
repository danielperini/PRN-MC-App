// ================================================================
// invokeGpt — Gateway de IA próprio (sem consumir créditos Base44)
// Chama a API da OpenAI diretamente com a chave OPENAI_API_KEY.
// Reproduz as integrações Core de IA: InvokeLLM, GenerateImage,
// GenerateSpeech, TranscribeAudio, ExtractDataFromUploadedFile.
// (GenerateVideo não tem equivalente na OpenAI — retorna erro.)
//
// Invocado pelo frontend via base44.functions.invoke('invokeGpt', ...)
// Possui sub-rotas por `operation`.
// ================================================================

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const OPENAI_API_URL = 'https://api.openai.com/v1';
const DEFAULT_CHAT_MODEL = 'gpt-4o';
const MINI_CHAT_MODEL = 'gpt-4o-mini';
const IMAGE_MODEL = 'dall-e-3';
const TTS_MODEL = 'tts-1';
const TRANSCRIBE_MODEL = 'whisper-1';

const VOICE_MAP = {
  river: 'alloy',
  honey: 'nova',
  sunny: 'shimmer',
  storm: 'onyx',
  spark: 'fable',
};

function getApiKey() {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY não configurada');
  return key;
}

function mapChatModel(model) {
  const m = String(model || 'automatic').toLowerCase();
  if (m === 'gpt_5_mini' || m === 'gpt-4o-mini' || m.includes('mini')) return MINI_CHAT_MODEL;
  return DEFAULT_CHAT_MODEL;
}

function mapVoice(voice) {
  const v = String(voice || 'river').toLowerCase();
  return VOICE_MAP[v] || 'alloy';
}

function detectType(name, mime) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.xml') || mime === 'application/xml' || mime === 'text/xml') return 'xml';
  if (n.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (/\.(png|jpg|jpeg|webp|gif|heic|bmp|tiff?)$/.test(n) || String(mime || '').startsWith('image/')) return 'image';
  return 'outro';
}

async function fetchBytes(url, timeoutMs = 60_000) {
  const u = String(url || '').trim();
  if (!u) throw new Error('URL vazia');
  const resp = await fetch(u, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!resp.ok) throw new Error(`Download falhou (${resp.status}) para ${u}`);
  const ct = resp.headers.get('content-type') || 'application/octet-stream';
  const buf = await resp.arrayBuffer();
  return { bytes: new Uint8Array(buf), mime: ct.split(';')[0] };
}

function bytesToDataURL(bytes, mime) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime || 'application/octet-stream'};base64,${btoa(binary)}`;
}

async function uploadToOpenAIFiles(bytes, filename, mime) {
  const apiKey = getApiKey();
  const fd = new FormData();
  fd.append('purpose', 'user_data');
  fd.append('file', new Blob([bytes], { type: mime || 'application/octet-stream' }), filename || 'documento.bin');
  const resp = await fetch(`${OPENAI_API_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`OpenAI Files API ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  if (!data?.id) throw new Error('Upload Files API não retornou id');
  return data.id;
}

// ── InvokeLLM ──────────────────────────────────────────────────
async function invokeLLM(payload) {
  const apiKey = getApiKey();
  const prompt = payload?.prompt;
  if (!prompt) throw new Error('prompt obrigatório');
  const model = mapChatModel(payload?.model);
  const fileUrls = Array.isArray(payload?.file_urls)
    ? payload.file_urls
    : (payload?.file_urls ? [payload.file_urls] : []);

  const userParts = [];
  if (fileUrls.length) {
    userParts.push({ type: 'text', text: String(prompt) });
    for (const url of fileUrls) {
      if (!url) continue;
      try {
        const { bytes, mime } = await fetchBytes(url);
        const tipo = detectType(String(url), mime);
        if (tipo === 'image') {
          userParts.push({ type: 'image_url', image_url: { url: bytesToDataURL(bytes, mime), detail: 'high' } });
        } else if (tipo === 'pdf') {
          const fileId = await uploadToOpenAIFiles(bytes, 'documento.pdf', 'application/pdf');
          userParts.push({ type: 'file', file: { file_id: fileId } });
        } else if (tipo === 'xml') {
          const texto = new TextDecoder('utf-8').decode(bytes).slice(0, 30000);
          userParts.push({ type: 'text', text: `Conteúdo XML: ${texto}` });
        } else {
          const texto = new TextDecoder('utf-8').decode(bytes).slice(0, 30000);
          userParts.push({ type: 'text', text: `Conteúdo do arquivo: ${texto}` });
        }
      } catch (e) {
        console.warn('[invokeGpt] Falha ao anexar arquivo', url, e.message);
      }
    }
  } else {
    userParts.push({ type: 'text', text: String(prompt) });
  }

  if (payload?.add_context_from_internet) {
    console.warn('[invokeGpt] add_context_from_internet não suportado via OpenAI direta; ignorado.');
  }

  const body = {
    model,
    messages: [{ role: 'user', content: userParts }],
    temperature: 0.3,
    max_tokens: 8000,
  };

  if (payload?.response_json_schema && typeof payload.response_json_schema === 'object') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'result', strict: false, schema: payload.response_json_schema },
    };
  }

  const resp = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? '';

  if (payload?.response_json_schema) {
    try { return JSON.parse(content); }
    catch { const m = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : {}; }
  }
  return content;
}

// ── GenerateImage ──────────────────────────────────────────────
async function generateImage(payload) {
  const apiKey = getApiKey();
  const prompt = payload?.prompt;
  if (!prompt) throw new Error('prompt obrigatório');
  const resp = await fetch(`${OPENAI_API_URL}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`OpenAI Images ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error('OpenAI não retornou URL de imagem');
  return { url };
}

// ── GenerateSpeech (TTS) ───────────────────────────────────────
async function generateSpeech(payload) {
  const apiKey = getApiKey();
  const text = String(payload?.text || '').slice(0, 5000);
  if (!text) throw new Error('text obrigatório');
  const voice = mapVoice(payload?.voice);
  const resp = await fetch(`${OPENAI_API_URL}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, voice, input: text, format: 'mp3' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`OpenAI TTS ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return { url: `data:audio/mpeg;base64,${btoa(binary)}` };
}

// ── TranscribeAudio (Whisper) ──────────────────────────────────
async function transcribeAudio(payload) {
  const apiKey = getApiKey();
  const audioUrl = payload?.audio_url;
  if (!audioUrl) throw new Error('audio_url obrigatório');
  const { bytes, mime } = await fetchBytes(audioUrl);
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: mime || 'audio/mpeg' }), 'audio.mp3');
  fd.append('model', TRANSCRIBE_MODEL);
  const resp = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`OpenAI Whisper ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  return data?.text || '';
}

// ── ExtractDataFromUploadedFile ────────────────────────────────
async function extractData(payload) {
  const apiKey = getApiKey();
  const fileUrl = payload?.file_url;
  if (!fileUrl) throw new Error('file_url obrigatório');
  const schema = payload?.json_schema && typeof payload.json_schema === 'object'
    ? payload.json_schema
    : { type: 'object', additionalProperties: true };

  const { bytes, mime } = await fetchBytes(fileUrl);
  const tipo = detectType(String(fileUrl), mime);
  const userParts = [{ type: 'text', text: 'Extraia os dados estruturados deste arquivo conforme o schema JSON fornecido.' }];

  if (tipo === 'image') {
    userParts.push({ type: 'image_url', image_url: { url: bytesToDataURL(bytes, mime), detail: 'high' } });
  } else if (tipo === 'pdf') {
    const fileId = await uploadToOpenAIFiles(bytes, 'documento.pdf', 'application/pdf');
    userParts.push({ type: 'file', file: { file_id: fileId } });
  } else {
    const texto = new TextDecoder('utf-8').decode(bytes).slice(0, 30000);
    userParts.push({ type: 'text', text: `Conteúdo do arquivo: ${texto}` });
  }

  const body = {
    model: DEFAULT_CHAT_MODEL,
    messages: [{ role: 'user', content: userParts }],
    response_format: { type: 'json_schema', json_schema: { name: 'extracao', strict: false, schema } },
    temperature: 0.1,
    max_tokens: 6000,
  };
  const resp = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  let output = null;
  try { output = JSON.parse(content); }
  catch { const m = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/); output = m ? JSON.parse(m[0]) : null; }
  return { status: 'success', output };
}

// ── Dispatcher ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Não bloqueia não autenticados: outras funções backend (service role)
    // invocam este gateway internamente sem usuário de app.
    let isAuthed = false;
    try { isAuthed = await base44.auth.isAuthenticated(); } catch {}

    const body = await req.json().catch(() => ({}));
    const operation = String(body?.operation || '').trim();
    const payload = body?.payload || {};

    let result;
    switch (operation) {
      case 'InvokeLLM': result = await invokeLLM(payload); break;
      case 'GenerateImage': result = await generateImage(payload); break;
      case 'GenerateSpeech': result = await generateSpeech(payload); break;
      case 'TranscribeAudio': result = await transcribeAudio(payload); break;
      case 'ExtractDataFromUploadedFile': result = await extractData(payload); break;
      case 'GenerateVideo':
        return Response.json({
          ok: false,
          provider: 'openai',
          error: 'Geração de vídeo não está disponível via OpenAI direta. Use a integração nativa do Base44 (GenerateVideo) ou outro provedor.',
        }, { status: 501 });
      default:
        return Response.json({ ok: false, error: `operation inválida: ${operation || '(vazia)'}` }, { status: 400 });
    }

    return Response.json({ ok: true, provider: 'openai', result, authed: isAuthed });
  } catch (error) {
    console.error('[invokeGpt] erro:', error?.message || error);
    return Response.json({ ok: false, provider: 'openai', error: String(error?.message || error) }, { status: 500 });
  }
});