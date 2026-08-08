/**
 * sincronizarPastaExternaDriveNFs
 *
 * Varredura automática da pasta do Drive 1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU
 * (incluindo subpastas, profundidade 4) em busca de PDFs e XMLs de notas fiscais.
 *
 * Para cada arquivo:
 *   1. Extrai o CNPJ emitente + número da NF (XML via regex determinístico; PDF via
 *      OpenAI gpt-4o-mini, ≤ 25MB).
 *   2. Monta a chave `cnpj:nf_numero` e busca PurchaseRequest correspondente
 *      (nf_emitente_cpf_cnpj + nf_numero).
 *   3. Calcula o nome esperado do arquivo no padrão oficial:
 *        NF-{nf_numero}_{emissor_slug}_{rubrica_codigo}_R${valor}_{AAAA-MM}.ext
 *      onde emissor_slug = 12 primeiros chars do nf_emitente_nome sem espaços/acentos;
 *      rubrica_codigo = natureza_despesa ou codigo da Rubrica vinculada via rubrica_id
 *      (com fallback para natureza_despesa/cod do próprio PR).
 *   4. Se o nome atual no Drive divergir do esperado: renomeia via PATCH.
 *   5. Atualiza links na PurchaseRequest (nf_pdf_url/nota_fiscal_url/
 *      drive_backup_nf_pdf_link para PDF; drive_backup_nf_xml_link para XML;
 *      drive_backup_nf_ok=true; backup_last_synced_at=now).
 *   6. Se intake_id preenchido na PR, atualiza também DocumentIntake com
 *      nf_pdf_url/nf_xml_url e arquivo_original_url.
 *
 * Idempotente: nome já no padrão esperado E backup_last_synced_at atualizado nas
 * últimas 24h na PR vinculada → skip completo. Sem match → mantém intacto.
 *
 * Budget 80s, lote 30 arquivos/execução. Service role (automação agendada).
 * Log em BackupLog (backup_type=drive_nf_sync_mensal, triggered_by=scheduled).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const FOLDER_ALVO = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_PROFUNDIDADE = 4;
const MAX_FILES = 30;
const BUDGET_MS = 80_000;
const RETRY_DELAYS = [1000, 3000, 6000];
const JANELA_24H_MS = 24 * 60 * 60 * 1000;
const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];

const SCHEMA_PDF = {
  type: 'object',
  additionalProperties: false,
  properties: {
    numero_nota: { type: ['string', 'null'] },
    emitente_cnpj: { type: ['string', 'null'] },
    emitente_nome: { type: ['string', 'null'] },
    valor_total: { type: ['number', 'null'] },
    data_emissao: { type: ['string', 'null'] },
  },
  required: ['numero_nota', 'emitente_cnpj', 'emitente_nome', 'valor_total', 'data_emissao'],
};

// ── Drive helpers ──────────────────────────────────────────────────────────────
async function drive(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}
async function listFolder(token: string, folderId: string): Promise<any[]> {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&fields=files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await drive(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}
async function renameFile(token: string, fileId: string, newName: string): Promise<any> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!r.ok) throw new Error(`Rename ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 120)}`);
  return await r.json();
}
async function getWebViewLink(token: string, fileId: string): Promise<string> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink&supportsAllDrives=true`);
  if (!r.ok) return `https://drive.google.com/file/d/${fileId}/view`;
  const d = await r.json().catch(() => ({}));
  return d?.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}
async function downloadBytes(token: string, fileId: string): Promise<Uint8Array> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  if (!r.ok) throw new Error(`Download ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ── XML determinístico ─────────────────────────────────────────────────────────
function parseXmlNF(xml: string) {
  const emitBlock = xml.match(/<emit>[\s\S]*?<\/emit>/);
  const block = emitBlock ? emitBlock[0] : xml;
  const mCnpj = block.match(/<CNPJ[^>]*>(\d{8,14})<\/CNPJ>/);
  const emitCnpj = mCnpj ? mCnpj[1] : null;
  const mNf = xml.match(/<nNF[^>]*>(\d+)<\/nNF>/) || xml.match(/<NumeroNf[^>]*>(\d+)<\/NumeroNf>/) || xml.match(/<numeroNf[^>]*>(\d+)<\/numeroNf>/);
  const nfNumero = mNf ? mNf[1].replace(/^0+/, '') : null;
  const mValor = xml.match(/<vNF[^>]*>([\d.,]+)<\/vNF>/);
  const valor = mValor ? Number(mValor[1].replace(/\./g, '').replace(',', '.')) : null;
  const mDt = xml.match(/<dhEmi[^>]*>(\d{4})-(\d{2})-(\d{2})/) || xml.match(/<dEmi[^>]*>(\d{4})-(\d{2})-(\d{2})/);
  const data = mDt ? `${mDt[1]}-${mDt[2]}-${mDt[3]}` : null;
  const mNome = block.match(/<xNome[^>]*>([\s\S]*?)<\/xNome>/);
  const nome = mNome ? mNome[1].trim() : null;
  return { emitCnpj, nfNumero, valor, data, nome };
}

// ── PDF via OpenAI gpt-4o-mini (direto — sem créditos Base44) ───────────────────
async function uploadPDFtoOpenAI(bytes: Uint8Array, name: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
  const fd = new FormData();
  fd.append('purpose', 'user_data');
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }), name || 'nf.pdf');
  const r = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`OpenAI Files ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 200)}`);
  const d = await r.json();
  if (!d.id) throw new Error('Files API sem id');
  return d.id;
}
async function gptExtrairPdf(bytes: Uint8Array, name: string): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
  let fileId = '';
  for (let t = 0; t <= RETRY_DELAYS.length; t++) {
    try {
      fileId = await uploadPDFtoOpenAI(bytes, name);
      break;
    } catch (e: any) {
      if (t === RETRY_DELAYS.length || !/429|rate/i.test(e.message)) throw e;
      await new Promise((res) => setTimeout(res, RETRY_DELAYS[t]));
    }
  }
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Você extrai dados de notas fiscais. Responda APENAS JSON. Use a DATA DE EMISSÃO rotulada no documento (não a data de abertura da empresa, autorização, pagamento ou impressão).' },
      { role: 'user', content: [
        { type: 'file', file: { file_id: fileId } },
        { type: 'text', text: 'Extraia: numero_nota (número da NF), emitente_cnpj (apenas 14 dígitos), emitente_nome (razão social do emitente), valor_total (número), data_emissao (YYYY-MM-DD).' },
      ] },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'nf_pdf', strict: true, schema: SCHEMA_PDF } },
    temperature: 0.1,
  };
  for (let t = 0; t <= RETRY_DELAYS.length; t++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (r.ok) {
      const d = await r.json();
      const content = d?.choices?.[0]?.message?.content || '{}';
      try { return JSON.parse(content); }
      catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
    }
    if (r.status === 429 && t < RETRY_DELAYS.length) {
      await new Promise((res) => setTimeout(res, RETRY_DELAYS[t]));
      continue;
    }
    throw new Error(`OpenAI ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 200)}`);
  }
  return {};
}

// ── Normalização ───────────────────────────────────────────────────────────────
function normalizarNfNumero(raw: any): string {
  return String(raw || '').replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toLowerCase();
}
function normalizarCnpj(raw: any): string {
  return String(raw || '').replace(/[^0-9]/g, '');
}
function slugifyEmissor(s: any): string {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 12);
}
function nomeEsperado(pr: any, rubMap: Map<string, any>, ext: string): string {
  const nf = String(pr.nf_numero || '').replace(/^0+/, '').replace(/[^0-9A-Za-z]/g, '') || 'semNf';
  const emissor = slugifyEmissor(pr.nf_emitente_nome) || 'semEmissor';
  const r = pr.rubrica_id ? rubMap.get(String(pr.rubrica_id)) : null;
  const rubRaw = (r && (r.natureza_despesa || r.codigo)) || pr.natureza_despesa || pr.cod || 'semRubrica';
  const rub = String(rubRaw).replace(/[^0-9A-Za-z]/g, '').slice(0, 12) || 'semRubrica';
  const valor = Math.round(Number(pr.nf_valor_total) || 0);
  const anoMes = String(pr.nf_data_emissao || '').slice(0, 7) || 'semData';
  return `NF-${nf}_${emissor}_${rub}_R$${valor}_${anoMes}.${ext}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Execução via automação (sem user) liberada (service role). Acesso manual
    // exige admin ou coordenador geral.
    if (user && user.role !== 'admin' && !COORD_GERAL_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const folderId = String(body.folderId || FOLDER_ALVO);
    const dryRun = body.dryRun === true;
    const limite = Math.min(Number(body.limite || MAX_FILES), 50);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    // Pré-carrega PurchaseRequests relevantes (com nf_emitente_cpf_cnpj + nf_numero)
    const prs: any[] = await base44.asServiceRole.entities.PurchaseRequest
      .filter({ status: { $nin: ['CANCELADO', 'RASCUNHO'] } }, '-updated_date', 500)
      .catch(() => []);
    const prPorChave = new Map<string, any[]>();
    for (const p of prs) {
      if (!p.nf_numero || !p.nf_emitente_cpf_cnpj) continue;
      const k = `${normalizarCnpj(p.nf_emitente_cpf_cnpj)}:${normalizarNfNumero(p.nf_numero)}`;
      if (!prPorChave.has(k)) prPorChave.set(k, []);
      prPorChave.get(k)!.push(p);
    }
    // Pré-carrega Rubricas (para resolver natureza_despesa/codigo via rubrica_id)
    const rubMap = new Map<string, any>();
    const rubs: any = await base44.asServiceRole.entities.Rubrica.list('-updated_date', 500).catch(() => []);
    for (const r of Array.isArray(rubs) ? rubs : []) {
      if (r?.id) rubMap.set(String(r.id), r);
    }

    // Coleta arquivos recursivamente
    const encontrados: any[] = [];
    const vistos = new Set([folderId]);
    // Pula subpastas mensais de janeiro (formato "01-AAAA") solicitado pelo usuário.
    function pularMesJaneiro(nome: string): boolean {
      return /^01-\d{4}$/i.test(String(nome || '').trim());
    }
    async function walk(fid: string, depth: number) {
      if (depth > MAX_PROFUNDIDADE || encontrados.length >= limite) return;
      const items = await listFolder(token, fid);
      for (const it of items) {
        if (encontrados.length >= limite) return;
        if (it.mimeType === FOLDER_MIME) {
          if (depth < MAX_PROFUNDIDADE && !vistos.has(it.id) && !pularMesJaneiro(it.name)) {
            vistos.add(it.id);
            await walk(it.id, depth + 1);
          }
          continue;
        }
        const n = (it.name || '').toLowerCase();
        if (n.endsWith('.pdf') || n.endsWith('.xml')) encontrados.push(it);
      }
    }
    await walk(folderId, 0);

    const stats: any = {
      coletados: encontrados.length,
      processados: 0,
      vinculados: 0,
      renomeados: 0,
      ja_corretos: 0,
      sem_vinculo: 0,
      erros: 0,
      rate_limited: 0,
      has_more: false,
      dry_run: dryRun,
    };
    const linhas: any[] = [];
    const agora = Date.now();

    for (const f of encontrados) {
      if (Date.now() - start >= BUDGET_MS) { stats.has_more = true; break; }
      stats.processados++;
      const linha: any = { id: f.id, nome: f.name, status: 'skip' };
      const lower = (f.name || '').toLowerCase();
      const ext = lower.endsWith('.xml') ? 'xml' : lower.endsWith('.pdf') ? 'pdf' : '';
      if (!ext) { stats.erros++; linhas.push({ ...linha, status: 'erro', erro: 'extensao_nao_suportada' }); continue; }

      try {
        // 1) Extração de dados (CNPJ + NF)
        let dados: any = { nfNumero: null, emitCnpj: null, valor: null, data: null, nome: null };
        if (ext === 'xml') {
          try {
            const bytes = await downloadBytes(token, f.id);
            const xml = new TextDecoder('utf-8').decode(bytes);
            dados = parseXmlNF(xml);
            dados.emitCnpj = dados.emitCnpj ? normalizarCnpj(dados.emitCnpj) : null;
            dados.nfNumero = dados.nfNumero ? String(dados.nfNumero).replace(/^0+/, '') : null;
          } catch (e: any) {
            linha.erro_xml = e.message;
          }
        } else {
          const bytes = await downloadBytes(token, f.id);
          if (bytes.length > 25 * 1024 * 1024) { stats.erros++; linhas.push({ ...linha, status: 'arquivo_grande' }); continue; }
          try {
            const ia = await gptExtrairPdf(bytes, f.name);
            dados = {
              nfNumero: ia.numero_nota ? String(ia.numero_nota).replace(/^0+/, '') : null,
              emitCnpj: ia.emitente_cnpj ? normalizarCnpj(ia.emitente_cnpj) : null,
              valor: ia.valor_total ?? null,
              data: ia.data_emissao || null,
              nome: ia.emitente_nome || null,
            };
          } catch (e: any) {
            if (/429|rate/i.test(e.message)) { stats.rate_limited++; linhas.push({ ...linha, status: 'rate_limited', erro: e.message }); continue; }
            linha.erro_pdf = e.message;
          }
        }
        linha.nf_numero = dados.nfNumero;
        linha.emit_cnpj = dados.emitCnpj;

        // 2) Match por chave cnpj:nf_numero
        if (!dados.nfNumero || !dados.emitCnpj) { stats.sem_vinculo++; linhas.push({ ...linha, status: 'sem_vinculo' }); continue; }
        const chave = `${normalizarCnpj(dados.emitCnpj)}:${normalizarNfNumero(dados.nfNumero)}`;
        const matches = prPorChave.get(chave) || [];
        if (!matches.length) { stats.sem_vinculo++; linhas.push({ ...linha, status: 'sem_vinculo' }); continue; }
        linha.matches = matches.length;

        // 3) Idempotência: nome já correto + backup_last_synced_at < 24h → skip
        const umPr = matches[0];
        const nomeEsp = nomeEsperado(umPr, rubMap, ext);
        const sincTs = umPr.backup_last_synced_at ? new Date(umPr.backup_last_synced_at).getTime() : 0;
        const dentro24h = !!sincTs && (agora - sincTs) < JANELA_24H_MS;
        const nomeJaOk = f.name === nomeEsp;
        if (nomeJaOk && dentro24h) {
          stats.ja_corretos++;
          linhas.push({ ...linha, status: 'ja_correto', nome_esperado: nomeEsp });
          continue;
        }

        // 4) Renomear se divergente
        if (!nomeJaOk && !dryRun) {
          try {
            const r = await renameFile(token, f.id, nomeEsp);
            linha.novo_nome = r?.name || nomeEsp;
            stats.renomeados++;
          } catch (e: any) {
            stats.erros++;
            linhas.push({ ...linha, status: 'erro_rename', erro: e.message, nome_esperado: nomeEsp });
            continue;
          }
        } else if (!nomeJaOk && dryRun) {
          linha.novo_nome = nomeEsp;
        }

        // 5) Obter webViewLink e atualizar PRs
        if (!dryRun) {
          const url = await getWebViewLink(token, f.id);
          linha.url = url;
          const updatePr: any = {
            drive_backup_nf_ok: true,
            backup_last_synced_at: new Date().toISOString(),
          };
          if (ext === 'pdf') {
            updatePr.nf_pdf_url = url;
            updatePr.nota_fiscal_url = url;
            updatePr.drive_backup_nf_pdf_link = url;
          } else {
            updatePr.drive_backup_nf_xml_link = url;
          }
          const bulk = matches.map((p) => ({ id: p.id, ...updatePr }));
          for (let i = 0; i < bulk.length; i += 100) {
            await base44.asServiceRole.entities.PurchaseRequest.bulkUpdate(bulk.slice(i, i + 100)).catch(() => {});
          }
          stats.vinculados += matches.length;

          // 6) Atualizar DocumentIntake vinculado (intake_id presente nas PRs)
          const intakes = new Set<string>();
          for (const p of matches) {
            if (p.intake_id) intakes.add(String(p.intake_id));
          }
          for (const iid of intakes) {
            const updateIntake: any = ext === 'pdf'
              ? { nf_pdf_url: url, arquivo_original_url: url }
              : { nf_xml_url: url, arquivo_original_url: url };
            await base44.asServiceRole.entities.DocumentIntake.update(iid, updateIntake).catch(() => {});
          }
        } else {
          stats.vinculados += matches.length;
        }

        linha.status = dryRun
          ? 'simulado'
          : (nomeJaOk ? 'vinculado_sem_rename' : 'renomeado_vinculado');
        linhas.push(linha);
      } catch (e: any) {
        stats.erros++;
        linhas.push({ ...linha, status: 'erro', erro: e.message });
      }
    }

    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      entity_type: 'sincronizarPastaExternaDriveNFs',
      status: stats.erros + stats.rate_limited > 0 ? 'concluido' : 'success',
      total_files: stats.processados,
      files_copied: stats.vinculados,
      details: `Pasta ${folderId} | vinculados ${stats.vinculados} | renomeados ${stats.renomeados} | ja_corretos ${stats.ja_corretos} | sem_vinculo ${stats.sem_vinculo} | erros ${stats.erros} | rate_limited ${stats.rate_limited} | has_more ${stats.has_more}${dryRun ? ' | DRY-RUN' : ''}`,
      triggered_by: 'scheduled',
      processed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - start,
    }).catch(() => {});

    return Response.json({ ok: true, folder_id: folderId, stats, amostra: linhas.slice(0, 15) });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'erro', stack: e?.stack }, { status: 500 });
  }
});