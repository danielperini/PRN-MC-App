/**
 * resolverPastaNotasMensal
 *
 * Varre UMA pasta do Drive e move cada NF (PDF ou XML) solta para a subpasta
 * mensal "MM-aaaa" definida pela DATA DE EMISSÃO da nota.
 *   - XML: parse determinístico (dhEmi/dEmi/Competencia) — sem IA.
 *   - PDF: leitura via GPT (OpenAI direto, chave OPENAI_API_KEY — sem usar
 *     créditos Base44), extraindo data_emissao + extras.
 *
 * Idempotente: pula arquivos já na pasta MM-aaaa correta. Ignora subpastas já
 * no padrão MM-aaaa. Suporta recursivo (_DESCEND em subpastas fora do padrão),
 * dryRun, limite/skip (paginação — cada chamada processa <=50 arquivos).
 *
 * Padrão de pasta mensal: "02-2026" (MM-aaaa), criada sob a própria pasta alvo.
 * Log em BackupLog (backup_type=drive_nf_sync_mensal).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const FOLDER_DEFAULT = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const RE_MM_YYYY = /^\d{2}-\d{4}$/;
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
    inFlight.delete(key);
    return id || null;
  })();
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
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}
function parseXmlDate(xml: string): string {
  const m =
    xml.match(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/) ||
    xml.match(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/) ||
    xml.match(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/) ||
    xml.match(/<Competencia[^>]*>(\d{4}-\d{2})/);
  return m ? m[1] : '';
}
// Mês-ano canônico extraído do NOME do arquivo (padrão "MM-aaaa").
// É prioritário: representa a competência definida pelo fluxo de nomenclatura.
function mesAnoArquivo(nome: string): string {
  if (!nome) return '';
  const m = String(nome).match(/\b(0[1-9]|1[0-2])-(20\d{2})\b/);
  return m ? `${m[1]}-${m[2]}` : '';
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
  const fileId = await uploadPDFtoOpenAI(bytes, name);
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
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 200)}`);
  const d = await r.json();
  const content = d?.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(content); }
  catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
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
    const folderId = body.folderId || FOLDER_DEFAULT;
    const dryRun = body.dryRun === true;
    const limite = Math.min(Number(body.limite || 10), 50);
    const skip = Math.max(0, Number(body.skip || 0));
    const recursivo = body.recursivo === true;
    const apenas = String(body.apenas || 'ambos').toLowerCase(); // pdf | xml | ambos
    const aceitaPdf = apenas === 'pdf' || apenas === 'ambos';
    const aceitaXml = apenas === 'xml' || apenas === 'ambos';

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    // Modo diagnóstico: lista apenas o nível raiz da pasta (sem baixar/IA)
    if (body.diagnostico === true) {
      const items = await listFolder(token, folderId);
      const pastas = items.filter((i) => i.mimeType === FOLDER_MIME).map((i) => ({ id: i.id, name: i.name, mm_aaaa: RE_MM_YYYY.test(i.name) }));
      const soltos = items.filter((i) => i.mimeType !== FOLDER_MIME);
      const pdfs = soltos.filter((i) => (i.name || '').toLowerCase().endsWith('.pdf'));
      const xmls = soltos.filter((i) => (i.name || '').toLowerCase().endsWith('.xml'));
      const outros = soltos.length - pdfs.length - xmls.length;
      return Response.json({
        ok: true,
        folder_id: folderId,
        diagnostico: { pastas, total_pastas: pastas.length, pastas_fora_padrao: pastas.filter((p) => !p.mm_aaaa).length, soltos_total: soltos.length, pdfs: pdfs.length, xmls: xmls.length, outros },
      });
    }

    const cache = new Map<string, string>();
    const folderInFlight = new Map<string, Promise<string | null>>();

    // Coletar PDFs/XMLs soltos — ignora subpastas já no padrão MM-aaaa.
    // recursivo desce em subpastas fora do padrão até `profundidade` (default 3).
    // Early-stop: para de listar assim que coletar (skip+limite) candidatos.
    const maxProfundidade = recursivo ? Math.min(Number(body.profundidade || 3), 4) : 0;
    // Cada chamada coleta os primeiros `limite` candidatos (não usa skip — os
    // arquivos movidos saem da lista, então skip quebraria a paginação).
    const alvoColeta = limite;
    const arquivos: any[] = [];
    const vistos = new Set([folderId]);

    async function walk(fid: string, depth: number) {
      if (depth > maxProfundidade) return;
      if (arquivos.length >= alvoColeta) return;
      const items = await listFolder(token, fid);
      for (const it of items) {
        if (arquivos.length >= alvoColeta) return;
        if (it.mimeType === FOLDER_MIME) {
          if (depth < maxProfundidade && !RE_MM_YYYY.test(it.name) && !vistos.has(it.id)) {
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
    await walk(folderId, 0);

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
    };
    const linhas: any[] = [];

    const resultados = await Promise.all(fatia.map(async (f: any) => {
      const linha: any = { id: f.id, nome: f.name, mes_ano: '', status: 'erro', erro: '' };
      try {
        let dataEmissao = '';
        const n = (f.name || '').toLowerCase();
        if (n.endsWith('.xml')) {
          const bytes = await downloadBytes(token, f.id);
          dataEmissao = parseXmlDate(new TextDecoder('utf-8').decode(bytes));
        } else if (n.endsWith('.pdf')) {
          const bytes = await downloadBytes(token, f.id);
          if (bytes.length > 25 * 1024 * 1024) { linha.status = 'arquivo_grande'; return linha; }
          const ia = await gptExtrairData(bytes, f.name);
          dataEmissao = ia?.data_emissao || '';
          if (ia) { linha.fornecedor = ia.fornecedor_nome || ''; linha.valor_total = ia.valor_total ?? null; linha.numero_nota = ia.numero_nota || ''; }
        }
        const mes = mesAnoArquivo(f.name) || toMesAno(dataEmissao);
        linha.mes_ano = mes;
        if (!mes) { linha.status = 'sem_data'; return linha; }
        const dest = await getOrCreateMes(token, mes, folderId, cache, folderInFlight);
        if (!dest) { linha.status = 'sem_pasta_destino'; return linha; }
        const parents = await getFileParents(token, f.id);
        if (parents.includes(dest)) { linha.status = 'ja_correto'; return linha; }
        if (!dryRun) { await moveFile(token, f.id, dest, parents); linha.status = 'movido'; }
        else linha.status = 'simulado';
        return linha;
      } catch (e: any) {
        linha.status = 'erro';
        linha.erro = e.message;
        return linha;
      }
    }));
    linhas.push(...resultados);
    for (const l of linhas) {
      if (l.status === 'movido') stats.movidos++;
      else if (l.status === 'sem_data') stats.sem_data++;
      else if (l.status === 'ja_correto') stats.ja_correto++;
      else if (l.status === 'arquivo_grande' || l.status === 'erro' || l.status === 'sem_pasta_destino') stats.erros++;
    }

    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      entity_type: 'resolverPastaNotasMensal',
      status: stats.erros > 0 ? 'concluido' : 'success',
      total_files: stats.processados,
      files_copied: stats.movidos,
      details: `Pasta ${folderId} | processados ${stats.processados}/${stats.total_arquivos} | movidos ${stats.movidos} | sem_data ${stats.sem_data} | erros ${stats.erros}${dryRun ? ' | DRY-RUN' : ''}`,
      triggered_by: 'manual',
      processed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - start,
    }).catch(() => {});

    return Response.json({ ok: true, folder_id: folderId, stats, amostra: linhas });
  } catch (e) {
    return Response.json({ error: e?.message || 'erro', stack: e?.stack }, { status: 500 });
  }
});