/**
 * resolverPastaNotasMensal
 *
 * Consolidação definitiva de Notas Fiscais dispersas no Drive.
 *
 * FASE 1 — Organização no destino: varre recursivamente (profundidade 4) a pasta
 * de ORIGEM (default 13Lkf...) e suas subpastas não-MM-AAAA, coleta PDFs/XMLs
 * soltos e move para subpastas MM-AAAA dentro da pasta DESTINO
 * (default 1hozKwzcQRPwEitLIv5DQuJLXLcm-VhvK).
 *   - XML: parse determinístico (dhEmi/dEmi/DataEmissao/Competencia) — sem IA.
 *   - PDF: prioridade nome (MM-AAAA no nome) → GPT gpt-4o-mini (OpenAI Files API,
 *     processamento em SÉRIE para respeitar TPM). Sanity-check ano 2025-2027.
 *   - Rate-limit 429: retry 1s → 3s → 6s (máx 3); esgotando → 'rate_limited'.
 *   - Idempotente: arquivo já na MM-AAAA correta no destino → 'ja_correto'.
 *
 * FASE 2 — Merge/limpeza de subpastas fora do padrão na origem: lista subpastas
 * diretas da origem que NÃO seguem MM-AAAA, move arquivos remanescentes para o
 * destino e deleta as que ficarem vazias (preserva MM-AAAA na origem).
 *
 * FASE 3 — Restauração de links nas PurchaseRequests: para cada arquivo movido,
 * gera URL pública `https://drive.google.com/file/d/{id}/view`, busca PRs por
 * nf_numero (normalizado) ou intake_id no nome, atualiza drive_backup_nf_pdf_link
 * / drive_backup_nf_xml_link + drive_backup_nf_ok=true + backup_last_synced_at.
 *
 * Parâmetros: sourceFolderId, destFolderId, limite (20/50), mergeELimpar (true),
 * dryRun (false), apenas (pdf|xml|ambos), recursivo, profundidade, diagnostico.
 * Log em BackupLog (backup_type=drive_nf_sync_mensal).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const SOURCE_DEFAULT = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const DEST_DEFAULT = '1hozKwzcQRPwEitLIv5DQuJLXLcm-VhvK';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const RE_MM_YYYY = /^\d{2}-\d{4}$/;
const ANO_MIN = 2025;
const ANO_MAX = 2027;
const RETRY_DELAYS = [1000, 3000, 6000];
const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];

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
async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`);
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}
async function createFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const r = await drive(token, 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`createFolder "${name}": ${d.error.message}`);
  return d.id || null;
}
async function getOrCreateMes(token: string, mes: string, root: string, cache: Map<string, string>, inFlight: Map<string, Promise<string | null>>): Promise<string | null> {
  if (!mes) return null;
  const key = `${root}::${mes}`;
  if (cache.has(key)) return cache.get(key) || null;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const p = (async () => {
    let id = await findFolder(token, mes, root);
    if (!id) id = await createFolder(token, mes, root);
    cache.set(key, id || '');
    return id || null;
  })().finally(() => { inFlight.delete(key); });
  inFlight.set(key, p);
  return p;
}
async function getFileParents(token: string, fileId: string): Promise<string[]> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`);
  if (!r.ok) return [];
  return (await r.json()).parents || [];
}
async function moveFile(token: string, fileId: string, addParent: string, removeParents: string[]) {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true&addParents=${encodeURIComponent(addParent)}`;
  if (removeParents?.length) url += `&removeParents=${encodeURIComponent(removeParents.join(','))}`;
  const r = await drive(token, url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`Move ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 120)}`);
}
async function deleteFile(token: string, fileId: string) {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { method: 'DELETE' });
  if (!r.ok && r.status !== 204) throw new Error(`Delete ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 120)}`);
}
async function downloadBytes(token: string, fileId: string): Promise<Uint8Array> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  if (!r.ok) throw new Error(`Download ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ── Datas ──────────────────────────────────────────────────────────────────────
function toMesAno(dataRaw: any): string {
  if (!dataRaw) return '';
  const s = String(dataRaw).trim();
  let iso = '';
  if (/^\d{4}-\d{2}/.test(s)) iso = s;
  else {
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  }
  if (!iso) return '';
  const d = new Date(iso.substring(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return mesAnoFromParts(d.getMonth() + 1, d.getFullYear());
}
function mesAnoFromParts(mes: number, ano: number): string {
  if (mes < 1 || mes > 12 || ano < ANO_MIN || ano > ANO_MAX) return '';
  return `${String(mes).padStart(2, '0')}-${ano}`;
}
function parseXmlDate(xml: string): string {
  const m =
    xml.match(/<dhEmi[^>]*>(\d{4})-(\d{2})-(\d{2})/) ||
    xml.match(/<dEmi[^>]*>(\d{4})-(\d{2})-(\d{2})/) ||
    xml.match(/<DataEmissao[^>]*>(\d{4})-(\d{2})-(\d{2})/);
  if (m) return mesAnoFromParts(Number(m[2]), Number(m[1]));
  const comp = xml.match(/<Competencia[^>]*>(\d{4})-(\d{2})/);
  if (comp) return mesAnoFromParts(Number(comp[2]), Number(comp[1]));
  return '';
}
function mesAnoArquivo(nome: string): string {
  if (!nome) return '';
  const m = String(nome).match(/\b(0[1-9]|1[0-2])-(20\d{2})\b/);
  if (!m) return '';
  const ano = Number(m[2]);
  if (ano < ANO_MIN || ano > ANO_MAX) return '';
  return `${m[1]}-${m[2]}`;
}

// ── GPT (OpenAI direto — sem créditos Base44) ───────────────────────────────────
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
const SCHEMA_DATA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    data_emissao: { type: ['string', 'null'] },
    numero_nota: { type: ['string', 'null'] },
    fornecedor_nome: { type: ['string', 'null'] },
    valor_total: { type: ['number', 'null'] },
  },
  required: ['data_emissao', 'numero_nota', 'fornecedor_nome', 'valor_total'],
};
async function gptExtrairData(bytes: Uint8Array, name: string): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  let fileId = '';
  for (let t = 0; t <= RETRY_DELAYS.length; t++) {
    try {
      fileId = await uploadPDFtoOpenAI(bytes, name);
      break;
    } catch (e: any) {
      if (t === RETRY_DELAYS.length || !/429|rate/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[t]));
    }
  }
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Você extrai a DATA DE EMISSÃO rotulada no documento fiscal (não a data de abertura da empresa, autorização, pagamento ou impressão). Use somente a data rotulada "Data de Emissão" ou equivalente. Responda APENAS JSON.' },
      { role: 'user', content: [
        { type: 'file', file: { file_id: fileId } },
        { type: 'text', text: 'Extraia: data_emissao (YYYY-MM-DD), numero_nota, fornecedor_nome, valor_total.' },
      ] },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'nf_date', strict: true, schema: SCHEMA_DATA } },
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

// ── Match PurchaseRequest ─────────────────────────────────────────────────────
function normalizarNfNumero(raw: any): string {
  return String(raw || '').replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toLowerCase();
}
function tokensDoNome(nome: string): string[] {
  return String(nome || '').split(/[-_./\s]+/).filter(Boolean).map((t) => t.replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toLowerCase()).filter((t) => t.length >= 3);
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && !COORD_GERAL_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const sourceFolderId = String(body.sourceFolderId || SOURCE_DEFAULT);
    const destFolderId = String(body.destFolderId || DEST_DEFAULT);
    const dryRun = body.dryRun === true;
    const limite = Math.min(Number(body.limite || 20), 50);
    const mergeELimpar = body.mergeELimpar !== false;
    const recursivo = body.recursivo !== false;
    const apenas = String(body.apenas || 'ambos').toLowerCase();
    const aceitaPdf = apenas === 'pdf' || apenas === 'ambos';
    const aceitaXml = apenas === 'xml' || apenas === 'ambos';
    // consolidarExistentes=true: também desce em subpastas MM-AAAA já existentes
    // na origem para consolidar seus XMLs/PDFs no destino único.
    const consolidarExistentes = body.consolidarExistentes === true;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    // Modo diagnóstico: preservado, apenas na origem (sem mover/IA)
    if (body.diagnostico === true) {
      const items = await listFolder(token, sourceFolderId);
      const pastas = items.filter((i) => i.mimeType === FOLDER_MIME).map((i) => ({ id: i.id, name: i.name, mm_aaaa: RE_MM_YYYY.test(i.name) }));
      const soltos = items.filter((i) => i.mimeType !== FOLDER_MIME);
      const pdfs = soltos.filter((i) => (i.name || '').toLowerCase().endsWith('.pdf'));
      const xmls = soltos.filter((i) => (i.name || '').toLowerCase().endsWith('.xml'));
      const outros = soltos.length - pdfs.length - xmls.length;
      return Response.json({
        ok: true,
        source_folder_id: sourceFolderId,
        dest_folder_id: destFolderId,
        diagnostico: { pastas, total_pastas: pastas.length, pastas_fora_padrao: pastas.filter((p) => !p.mm_aaaa).length, soltos_total: soltos.length, pdfs: pdfs.length, xmls: xmls.length, outros },
      });
    }

    const cache = new Map<string, string>();
    const folderInFlight = new Map<string, Promise<string | null>>();

    // Verificar/criar pastas MM-AAAA no DESTINO (não na origem)
    const isDest = (id: string) => id === destFolderId;

    // Coletar arquivos soltos da origem (e subpastas não-MM-AAAA, recursivo prof 4).
    const maxProfundidade = recursivo ? Math.min(Number(body.profundidade || 4), 4) : 0;
    const alvoColeta = limite;
    const arquivos: any[] = [];
    const vistos = new Set([sourceFolderId]);

    async function walk(fid: string, depth: number) {
      if (depth > maxProfundidade || arquivos.length >= alvoColeta) return;
      const items = await listFolder(token, fid);
      for (const it of items) {
        if (arquivos.length >= alvoColeta) return;
        if (it.mimeType === FOLDER_MIME) {
          // Desce em subpastas da origem; nunca no destino.
          // Por padrão pula MM-AAAA (já organizadas); se consolidarExistentes, também desce.
          const ehMmAaaa = RE_MM_YYYY.test(it.name);
          const deveDescer = !isDest(it.id) && depth < maxProfundidade && !vistos.has(it.id) && (consolidarExistentes || !ehMmAaaa);
          if (deveDescer) {
            vistos.add(it.id);
            await walk(it.id, depth + 1);
          }
          continue;
        }
        const n = (it.name || '').toLowerCase();
        if (n.endsWith('.pdf') && aceitaPdf) arquivos.push(it);
        else if (n.endsWith('.xml') && aceitaXml) arquivos.push(it);
      }
    }
    await walk(sourceFolderId, 0);

    const fatia = arquivos.slice(0, limite);
    const stats: any = {
      coletados: arquivos.length,
      processados: fatia.length,
      lim: limite,
      has_more: arquivos.length >= limite,
      dry_run: dryRun,
      movidos: 0,
      sem_data: 0,
      ja_correto: 0,
      erros: 0,
      rate_limited: 0,
      pastas_deletadas: 0,
      pastas_fora_padrao_restantes: 0,
      vinculos_restaurados: 0,
    };
    const linhas: any[] = [];
    const movidosComSucesso: any[] = []; // {id, nome, mes_ano, extensao, url}

    // FASE 1 — processamento em SÉRIE (PDFs via GPT respeitam TPM)
    for (const f of fatia) {
      const linha: any = { id: f.id, nome: f.name, mes_ano: '', status: 'erro', erro: '' };
      try {
        let mes = '';
        const n = (f.name || '').toLowerCase();
        let ext = '';
        if (n.endsWith('.xml')) {
          ext = 'xml';
          const bytes = await downloadBytes(token, f.id);
          mes = mesAnoArquivo(f.name) || parseXmlDate(new TextDecoder('utf-8').decode(bytes));
        } else if (n.endsWith('.pdf')) {
          ext = 'pdf';
          const bytes = await downloadBytes(token, f.id);
          if (bytes.length > 25 * 1024 * 1024) { linha.status = 'arquivo_grande'; stats.erros++; linhas.push(linha); continue; }
          let ia: any = null;
          try {
            ia = await gptExtrairData(bytes, f.name);
            mes = mesAnoArquivo(f.name) || toMesAno(ia?.data_emissao);
            if (ia) { linha.fornecedor = ia.fornecedor_nome || ''; linha.valor_total = ia.valor_total ?? null; linha.numero_nota = ia.numero_nota || ''; linha.data_emissao_ia = ia.data_emissao || ''; }
          } catch (e: any) {
            if (/429|rate/i.test(e.message)) { linha.status = 'rate_limited'; linha.erro = e.message; stats.rate_limited++; linhas.push(linha); continue; }
            throw e;
          }
        }
        linha.mes_ano = mes;
        if (!mes) { linha.status = 'sem_data'; stats.sem_data++; linhas.push(linha); continue; }
        const dest = await getOrCreateMes(token, mes, destFolderId, cache, folderInFlight);
        if (!dest) { linha.status = 'sem_pasta_destino'; stats.erros++; linhas.push(linha); continue; }
        const parents = await getFileParents(token, f.id);
        if (parents.includes(dest)) { linha.status = 'ja_correto'; stats.ja_correto++; linhas.push(linha); continue; }
        if (!dryRun) {
          await moveFile(token, f.id, dest, parents);
          linha.status = 'movido';
          stats.movidos++;
          movidosComSucesso.push({ id: f.id, nome: f.name, mes_ano: mes, extensao: ext, url: `https://drive.google.com/file/d/${f.id}/view` });
        } else {
          linha.status = 'simulado';
        }
        linhas.push(linha);
      } catch (e: any) {
        linha.status = 'erro';
        linha.erro = e.message;
        stats.erros++;
        linhas.push(linha);
      }
    }

    // FASE 2 — Merge/limpeza de subpastas fora do padrão na origem
    // Budget-guard: só roda se decorrido < 65s e processa no máx 2 subpastas por
    // chamada (evita timeout 100s do Deno Deploy). Repetidas chamadas consomem
    // o restante (idempotente).
    const MAX_SUBPASTAS_MERGE = 2;
    const BUDGET_FASE2_MS = 65_000;
    if (mergeELimpar && !dryRun && Date.now() - start < BUDGET_FASE2_MS) {
      const subpastas = (await listFolder(token, sourceFolderId)).filter((i) => i.mimeType === FOLDER_MIME && !RE_MM_YYYY.test(i.name) && !isDest(i.id));
      stats.pastas_fora_padrao_restantes = subpastas.length;
      const alvoFase2 = subpastas.slice(0, MAX_SUBPASTAS_MERGE);
      for (const sp of alvoFase2) {
        if (Date.now() - start >= BUDGET_FASE2_MS) break;
        let restantes = await listFolder(token, sp.id);
        const docs = restantes.filter((i) => i.mimeType !== FOLDER_MIME);
        for (const f of docs) {
          const n = (f.name || '').toLowerCase();
          if (!((n.endsWith('.pdf') && aceitaPdf) || (n.endsWith('.xml') && aceitaXml))) continue;
          try {
            let mes = '';
            if (n.endsWith('.xml')) {
              const bytes = await downloadBytes(token, f.id);
              mes = mesAnoArquivo(f.name) || parseXmlDate(new TextDecoder('utf-8').decode(bytes));
            } else {
              const bytes = await downloadBytes(token, f.id);
              if (bytes.length > 25 * 1024 * 1024) continue;
              try {
                const ia = await gptExtrairData(bytes, f.name);
                mes = mesAnoArquivo(f.name) || toMesAno(ia?.data_emissao);
              } catch { continue; }
            }
            if (!mes) continue;
            const dest = await getOrCreateMes(token, mes, destFolderId, cache, folderInFlight);
            if (!dest) continue;
            const parents = await getFileParents(token, f.id);
            if (parents.includes(dest)) continue;
            await moveFile(token, f.id, dest, parents);
            stats.movidos++;
            movidosComSucesso.push({ id: f.id, nome: f.name, mes_ano: mes, extensao: n.endsWith('.xml') ? 'xml' : 'pdf', url: `https://drive.google.com/file/d/${f.id}/view` });
          } catch { /* ignora individual nesta fase */ }
        }
        // Re-verifica vazia
        restantes = await listFolder(token, sp.id);
        if (restantes.length === 0) {
          try { await deleteFile(token, sp.id); stats.pastas_deletadas++; stats.pastas_fora_padrao_restantes--; }
          catch { /* não bloqueia */ }
        }
      }
    } else {
      // Budget excedido ou dryRun — apenas contabiliza restantes
      stats.pastas_fora_padrao_restantes = (await listFolder(token, sourceFolderId)).filter((i) => i.mimeType === FOLDER_MIME && !RE_MM_YYYY.test(i.name) && !isDest(i.id)).length;
    }
    if (dryRun) {
      stats.pastas_fora_padrao_restantes = (await listFolder(token, sourceFolderId)).filter((i) => i.mimeType === FOLDER_MIME && !RE_MM_YYYY.test(i.name) && !isDest(i.id)).length;
    }
    void cache;

    // FASE 3 — Restauração de links nas PurchaseRequests
    if (movidosComSucesso.length > 0 && !dryRun) {
      // Pré-carrega PRs relevantes (com nf_numero ou intake_id não vazios, status útil)
      const prs: any[] = await base44.asServiceRole.entities.PurchaseRequest
        .filter({ status: { $nin: ['CANCELADO', 'RASCUNHO'] } }, '-updated_date', 500)
        .catch(() => []);
      const comNfIntake = prs.filter((p) => (p.nf_numero && String(p.nf_numero).trim()) || (p.intake_id && String(p.intake_id).trim()));
      const prPorNf = new Map<string, any[]>();
      const prPorIntake = new Map<string, any[]>();
      const prPorId = new Map<string, any>();
      for (const p of comNfIntake) {
        prPorId.set(p.id, p);
        if (p.nf_numero) {
          const k = normalizarNfNumero(p.nf_numero);
          if (k) (prPorNf.get(k) || prPorNf.set(k, []).get(k)!).push(p);
        }
        if (p.intake_id) {
          const k = String(p.intake_id);
          (prPorIntake.get(k) || prPorIntake.set(k, []).get(k)!).push(p);
        }
      }
      const atualizacoesPendentes: any[] = [];
      for (const m of movidosComSucesso) {
        // Match por nf_numero (tokens do nome vs prs)
        const tokens = tokensDoNome(m.nome);
        const matchNf = tokens.map((t) => prPorNf.get(t)).filter(Boolean).flat();
        const matchIntake = prPorIntake.get(m.nome) || prPorIntake.get(m.id) || [];
        const matches = Array.from(new Set([...matchNf, ...matchIntake].map((x) => x.id)));
        for (const pid of matches) {
          const update: any = { drive_backup_nf_ok: true, backup_last_synced_at: new Date().toISOString() };
          if (m.extensao === 'pdf') update.drive_backup_nf_pdf_link = m.url;
          else update.drive_backup_nf_xml_link = m.url;
          atualizacoesPendentes.push({ id: pid, update });
          stats.vinculos_restaurados++;
        }
      }
      // Aplica em lote (bulkUpdate) para eficiência
      if (atualizacoesPendentes.length > 0) {
        // bulkUpdate espera [{id, ...fields}]
        const bulk = atualizacoesPendentes.map((a) => ({ id: a.id, ...a.update }));
        for (let i = 0; i < bulk.length; i += 100) {
          await base44.asServiceRole.entities.PurchaseRequest.bulkUpdate(bulk.slice(i, i + 100)).catch(() => {});
        }
      }
    }

    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      entity_type: 'resolverPastaNotasMensal',
      status: stats.erros + stats.rate_limited > 0 ? 'concluido' : 'success',
      total_files: stats.processados,
      files_copied: stats.movidos,
      details: `Origem ${sourceFolderId} → Destino ${destFolderId} | movidos ${stats.movidos} | sem_data ${stats.sem_data} | ja_correto ${stats.ja_correto} | erros ${stats.erros} | rate_limited ${stats.rate_limited} | pastas_deletadas ${stats.pastas_deletadas} | pastas_restantes ${stats.pastas_fora_padrao_restantes} | vinculos_restaurados ${stats.vinculos_restaurados}${dryRun ? ' | DRY-RUN' : ''}`,
      triggered_by: 'manual',
      processed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - start,
    }).catch(() => {});

    return Response.json({ ok: true, folder_id: sourceFolderId, dest_folder_id: destFolderId, stats, amostra: linhas });
  } catch (e) {
    return Response.json({ error: e?.message || 'erro', stack: e?.stack }, { status: 500 });
  }
});