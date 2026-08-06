// ================================================================
// vincularComprovantesEmLote
// Conciliação automática de comprovantes de pagamento:
// 1) Lista DocumentIntake com tipo_detectado='RECIBO_PDF' (status ATIVO)
//    ainda não vinculados a um PurchaseRequest.
// 2) Para cada comprovante, extrai(valor_pago, data_pagamento,
//    favorecido_nome, favorecido_cnpj_cpf, descricao, meio_pagamento)
//    via OpenAI gpt-4o (Files API + Structured Outputs).
// 3) Busca PurchaseRequests em SOLICITADO / APROVADO_COORD / APROVADO_ADMIN
//    (não pagos, sem comprovante) cujo CNPJ do fornecedor bate E o valor
//    está dentro de ±1% do valor pago.
// 4) Match único → marca PAGO direto (vinculo_automatico_ia=true).
//    Match múltiplo → IA escolhe o melhor candidato. Se score >= LIMIAR_AUTO,
//    marca PAGO. Se score entre LIMIAR_MIN e LIMIAR_AUTO, emfila em 'incertos'
//    para confirmação manual. Caso contrário, 'sem_match'.
// 5) Retorna JSON com listas: vinculados_lista, incertos_lista, sem_match_lista.
// ================================================================
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const OPENAI_MODEL = 'gpt-4o-2024-08-06';
const TOL_VALOR_PCT = 0.01;
const LIMIAR_AUTO = 75;
const LIMIAR_MIN = 35;
const MAX_POR_INVOCACAO = 25;
const STATUSES_ALVO = ['SOLICITADO', 'APROVADO_COORD', 'APROVADO_ADMIN'];

const onlyDigits = (s) => String(s ?? '').replace(/\D+/g, '');
const safeStr = (s) => String(s ?? '').trim();

function isFileNameComprovante(name) {
  const up = safeStr(name).toUpperCase();
  return /\b(COMP|COMPROVANTE|PAGTO|RECIBO|BOLETO|PIX|PAGAMENTO|PAG)\b/.test(up);
}

function valoresProximos(a, b) {
  const av = Number(a);
  const bv = Number(b);
  if (!Number.isFinite(av) || !Number.isFinite(bv) || av <= 0 || bv <= 0) return false;
  const tol = Math.max(Math.abs(av), Math.abs(bv)) * TOL_VALOR_PCT;
  return Math.abs(av - bv) <= tol;
}

async function resolverBytes(base44, url) {
  const u = String(url || '').trim();
  if (!u) throw new Error('URL vazia');
  const gdMatch = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i)
    || u.match(/drive\.google\.com\/\?id=([^&]+)/i)
    || u.match(/docs\.google\.com\/file\/d\/([^/]+)/i);
  if (gdMatch) {
    const fileId = gdMatch[1];
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      if (conn?.access_token) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${conn.access_token}` },
          signal: AbortSignal.timeout(60_000),
        });
        if (r.ok) return new Uint8Array(await r.arrayBuffer());
      }
    } catch (_e) { /* fall through to public download */ }
    const pub = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, {
      signal: AbortSignal.timeout(60_000),
      redirect: 'follow',
    });
    if (!pub.ok) throw new Error(`Drive publico ${pub.status}`);
    return new Uint8Array(await pub.arrayBuffer());
  }
  const r = await fetch(u, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function uploadToOpenAIFiles(bytes, filename) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
  const fd = new FormData();
  fd.append('purpose', 'user_data');
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }), filename || 'comprovante.pdf');
  const r = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`OpenAI Files ${r.status}: ${await r.text().catch(() => r.statusText)}`);
  const d = await r.json();
  if (!d?.id) throw new Error('Upload Files API sem id');
  return d.id;
}

const EXTR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tipo_documento: { type: 'string', enum: ['COMPROVANTE', 'NAO_IDENTIFICADO'] },
    valor_pago: { type: ['number', 'null'] },
    data_pagamento: { type: ['string', 'null'] },
    favorecido_nome: { type: ['string', 'null'] },
    favorecido_cnpj_cpf: { type: ['string', 'null'] },
    descricao: { type: ['string', 'null'] },
    meio_pagamento: { type: ['string', 'null'] },
    chave_pix: { type: ['string', 'null'] },
    banco: { type: ['string', 'null'] },
  },
  required: ['tipo_documento', 'valor_pago', 'data_pagamento', 'favorecido_nome', 'favorecido_cnpj_cpf', 'descricao', 'meio_pagamento', 'chave_pix', 'banco'],
};

async function extrairComprovante(base44, fileUrl, fileName) {
  const bytes = await resolverBytes(base44, fileUrl);
  if (bytes.length > 25 * 1024 * 1024) throw new Error('Comprovante excede 25MB');
  const fileId = await uploadToOpenAIFiles(bytes, fileName || 'comprovante.pdf');
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'Você extrai dados de comprovantes de pagamento brasileiros. Devolva SOMENTE JSON aderente ao schema. Datas em YYYY-MM-DD. CNPJ/CPF somente dígitos. valor_pago = montante pago. descricao = histórico/motivo do pagamento (ex: "NF-17 PRODUTOS GRÁFICOS").' },
      {
        role: 'user',
        content: [
          { type: 'file', file: { file_id: fileId } },
          { type: 'text', text: 'Extraia os dados do comprovante.' },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'comprovante_extract', strict: true, schema: EXTR_SCHEMA } },
    max_tokens: 1200,
    temperature: 0.1,
  };
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text().catch(() => r.statusText)}`);
      const d = await r.json();
      const c = d?.choices?.[0]?.message?.content ?? '';
      try { return JSON.parse(c); }
      catch { const m = c.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
    } catch (e) {
      lastErr = e;
      if (i === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

function scoreCandidato(comp, p) {
  let score = 0;
  const detalhes = [];
  const valor = Number(comp?.valor_pago || 0);
  const ref = Number(p?.valor_solicitado || p?.valor_total || p?.valor_aprovado_admin || 0);
  if (valor > 0 && ref > 0) {
    if (valoresProximos(valor, ref)) { score += 35; detalhes.push('valor ok'); }
    else { score -= 25; detalhes.push('valor divergente'); }
  }
  const cnpjComp = onlyDigits(comp?.favorecido_cnpj_cpf);
  const cnpjP = onlyDigits(p?.fornecedor_cnpj || p?.nf_emitente_cpf_cnpj);
  if (cnpjComp && cnpjP) {
    if (cnpjComp === cnpjP) { score += 40; detalhes.push('cnpj ok'); }
    else { score -= 20; detalhes.push('cnpj divergente'); }
  }
  const fav = (comp?.favorecido_nome || '').toLowerCase();
  const forn = (p?.fornecedor_nome || p?.nf_emitente_nome || '').toLowerCase();
  if (fav && forn) {
    const tf = fav.split(/\s+/).filter((t) => t.length > 3);
    const tp = forn.split(/\s+/).filter((t) => t.length > 3);
    const acertos = tf.filter((t) => tp.some((u) => u === t || u.includes(t.slice(0, 4)))).length;
    if (acertos > 0) { score += 15; detalhes.push('nome parcial'); }
  }
  return { score: Math.max(0, Math.min(100, score)), detalhes };
}

async function escolherMelhorIA(comp, candidatos) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { purchase_id: null, score: 0, motivo: 'sem chave' };
  const prompt = `Você é um conciliador de comprovantes de pagamento. Com base no comprovante e na lista de candidatas, escolha o melhor vínculo. Devolva SOMENTE JSON.

Comprovante:
${JSON.stringify({ valor: comp?.valor_pago, cnpj_cpf: comp?.favorecido_cnpj_cpf, favorecido: comp?.favorecido_nome, descricao: comp?.descricao })}

Candidatas (id | fornecedor | cnpj | valor_solicitado | descricao):
${candidatos.map((c, i) => `${i + 1}. id=${c.id} fornecedor="${c.fornecedor_nome || c.nf_emitente_nome}" cnpj=${c.fornecedor_cnpj || c.nf_emitente_cpf_cnpj} valor=${c.valor_solicitado} descricao="${(c.descricao_item || '').slice(0, 100)}"`).join('\n')}

Devolva {"purchase_id": "<id da melhor>", "score": 1-100, "motivo": "..."} ou {"purchase_id": null, "score": 0, "motivo": "nenhum"} se nada se aplica.`;
  const body = {
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'escolha',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            purchase_id: { type: ['string', 'null'] },
            score: { type: 'number' },
            motivo: { type: 'string' },
          },
          required: ['purchase_id', 'score', 'motivo'],
        },
      },
    },
    max_tokens: 600,
    temperature: 0.1,
  };
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}`);
      const d = await r.json();
      const c = d?.choices?.[0]?.message?.content ?? '';
      try { return JSON.parse(c); }
      catch { const m = c.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { purchase_id: null, score: 0, motivo: 'parse' }; }
    } catch (e) {
      lastErr = e;
      if (i === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return { purchase_id: null, score: 0, motivo: String(lastErr?.message || lastErr || 'erro') };
}

async function marcarPago(svc, pr, comp, score, comprovanteUrl, user, auto) {
  const now = new Date().toISOString();
  const dataPag = comp?.data_pagamento || now.slice(0, 10);
  await svc.entities.PurchaseRequest.update(pr.id, {
    status: 'PAGO',
    pago: true,
    status_pagamento: 'pago',
    comprovante_url: comprovanteUrl,
    comprovante_pagamento_url: comprovanteUrl,
    data_pagamento: now,
    data_pagamento_efetivo: dataPag,
    usuario_pagamento: user?.email || 'service_role',
    usuario_pagamento_nome: user?.full_name || user?.email || 'Serviço',
    confianca_vinculo_pagamento: score,
    vinculo_automatico_ia: !!auto,
  });
  const iid = pr?.intake_id || pr?.documento_intake_id;
  if (iid) {
    try {
      await svc.entities.DocumentIntake.update(iid, {
        status_processamento: 'APROVADO',
        ocultar_entrada_unica: true,
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: pr.id,
      });
    } catch (_e) { /* não bloqueia */ }
  }
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    let user = null;
    try { user = await base44.auth.me(); } catch { /* service role ok */ }

    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Number(body?.limite) || MAX_POR_INVOCACAO, 60);
    const dryRun = !!body?.dry_run;
    const soIntakeId = body?.intake_id || null;

    // 1) Coleta comprovantes
    let intakes = [];
    if (soIntakeId) {
      try { const i = await svc.entities.DocumentIntake.get(soIntakeId); if (i) intakes = [i]; } catch (_e) {}
    } else {
      intakes = await svc.entities.DocumentIntake.filter(
        { tipo_detectado: 'RECIBO_PDF' },
        '-created_date',
        80,
      );
    }
    const comprovantes = (intakes || [])
      .filter((c) => String(c?.status_registro || 'ATIVO') !== 'REMOVIDO')
      .filter((c) => !c?.entidade_destino_id)
      .filter((c) => c?.status_processamento !== 'APROVADO')
      .filter((c) => c?.tipo_detectado === 'RECIBO_PDF' || isFileNameComprovante(c?.file_name_original))
      .slice(0, limite);

    // 2) Coleta PurchaseRequests alvo (SOLICITADO/APROVADO_COORD/APROVADO_ADMIN, não pagos, sem comprovante)
    let comprasList = [];
    try {
      comprasList = await svc.entities.PurchaseRequest.filter(
        { status: { $in: STATUSES_ALVO } },
        '-created_date',
        500,
      );
    } catch (_e) { comprasList = []; }
    const alvos = (comprasList || []).filter((p) => !p?.pago && (!p?.comprovante_url || String(p.comprovante_url).trim() === ''));

    const vinculados = [];
    const incertos = [];
    const semMatch = [];

    for (const comp of comprovantes) {
      let dados = null;
      try {
        dados = await extrairComprovante(base44, comp.arquivo_original_url, comp.file_name_original);
      } catch (e) {
        semMatch.push({ intake_id: comp.id, file_name: comp.file_name_original, motivo: 'Extração IA falhou: ' + e.message });
        continue;
      }

      const cnpj = onlyDigits(dados?.favorecido_cnpj_cpf);
      const valor = Number(dados?.valor_pago || 0);
      const matches = alvos.filter((p) => {
        const pcnpj = onlyDigits(p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj);
        const cnpjOk = !!(cnpj && pcnpj && cnpj === pcnpj);
        const valorOk = valor > 0 && valoresProximos(valor, p.valor_solicitado || p.valor_aprovado_admin);
        return cnpjOk && valorOk;
      });

      if (matches.length === 0) {
        semMatch.push({ intake_id: comp.id, file_name: comp.file_name_original, dados, motivo: 'Sem candidato com CNPJ+valor' });
        continue;
      }

      const pontuados = matches
        .map((p) => ({ ...p, _scoreObj: scoreCandidato(dados, p) }))
        .sort((a, b) => b._scoreObj.score - a._scoreObj.score);

      let alvo = null;
      let scoreFinal = 0;
      let motivoIA = '';
      if (pontuados.length === 1) {
        alvo = pontuados[0];
        scoreFinal = Math.max(LIMIAR_AUTO, alvo._scoreObj.score);
      } else {
        const escolha = await escolherMelhorIA(dados, pontuados.slice(0, 6));
        motivoIA = escolha?.motivo || '';
        if (escolha?.purchase_id) {
          const found = pontuados.find((p) => p.id === escolha.purchase_id);
          if (found) {
            alvo = found;
            scoreFinal = Math.max(Number(escolha.score || 0), found._scoreObj.score);
          }
        }
      }

      if (alvo && scoreFinal >= LIMIAR_AUTO) {
        if (!dryRun) await marcarPago(svc, alvo, dados, scoreFinal, comp.arquivo_original_url, user, true);
        vinculados.push({
          intake_id: comp.id,
          file_name: comp.file_name_original,
          purchase_id: alvo.id,
          fornecedor: alvo.fornecedor_nome || alvo.nf_emitente_nome,
          valor_pago: valor,
          valor_solicitado: alvo.valor_solicitado,
          score: scoreFinal,
          detalhes: alvo._scoreObj.detalhes,
          motivo_ia: motivoIA,
        });
      } else if (alvo && scoreFinal >= LIMIAR_MIN) {
        incertos.push({
          intake_id: comp.id,
          file_name: comp.file_name_original,
          comprovante_url: comp.arquivo_original_url,
          dados,
          melhor_escolha: { purchase_id: alvo.id, score: scoreFinal },
          motivo_ia: motivoIA,
          candidatos: pontuados.slice(0, 5).map((p) => ({
            purchase_id: p.id,
            fornecedor: p.fornecedor_nome || p.nf_emitente_nome,
            cnpj: p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj,
            valor_solicitado: p.valor_solicitado,
            status: p.status,
            score: p._scoreObj.score,
            detalhes: p._scoreObj.detalhes,
            descricao_item: p.descricao_item,
          })),
        });
      } else {
        semMatch.push({
          intake_id: comp.id,
          file_name: comp.file_name_original,
          dados,
          motivo: 'Confianca baixa' + (motivoIA ? ` (${motivoIA})` : ''),
        });
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      comprovantes_inspecionados: comprovantes.length,
      vinculados: vinculados.length,
      incertos: incertos.length,
      sem_match: semMatch.length,
      vinculados_lista: vinculados,
      incertos_lista: incertos,
      sem_match_lista: semMatch,
      duration_ms: Date.now() - t0,
    });
  } catch (err) {
    console.error('[vincularComprovantesEmLote] erro fatal:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});