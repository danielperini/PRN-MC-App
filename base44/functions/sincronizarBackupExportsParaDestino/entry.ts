import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================================
// sincronizarBackupExportsParaDestino
// ----------------------------------------------------------------------------
// Sincronismo total: copia arquivos de NF/XML/COMP de duas pastas de origem
// para uma pasta de destino, renomeando conforme a regra oficial do projeto
// (parsing do nome legado) e SEM duplicar (verifica por nome no destino).
//
// Origens:
//   1) Backup: 13Lk... (todos os arquivos)
//   2) Exports: 1LgC... (apenas PDF/XML/COMP de marco/2026 em diante)
//
// Destino: 1jhZ...
//
// Renomeação best-effort a partir do nome do arquivo (sem lookup de PR):
//   {prefixo} {num} Despesa - {fornecedor} - MUSEUS CENTRO - R$ {valor}.{ext}
// Se o nome já estiver no padrão oficial, mantém.
//
// Deduplicação: por nome final no destino (Set de nomes existentes).
// Idempotente: pode rodar múltiplas vezes sem duplicar.
// Pagina via skip/limite (padrão 20 por execução, budget 50s).
// ============================================================================

const SRC_BACKUP = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const SRC_EXPORTS = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const DST_FOLDER = '1jhZBWsOltRSjtdKHPG64PovnxygKLuW-';

const MESES_NUM: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', marco03: '03', março: '03',
  abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08',
  setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

function safeStr(v: unknown): string { return String(v || '').trim(); }
function sanitize(v: unknown, max = 60): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max)
    .trim();
}
function onlyDigits(v: unknown): string { return String(v || '').replace(/\D/g, ''); }
function parseValor(v: unknown): number {
  const s = String(v || '').replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}
function formatValor(v: unknown): string {
  return parseValor(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getExt(name: string): string {
  const n = name.toLowerCase();
  const m = n.match(/\.([a-z0-9]{2,4})$/);
  return m ? m[1] : '';
}

// Padrão oficial: ^(NF|XML|COMP NF) \d+ .+ - .+ - MUSEUS CENTRO - R$ [\d.,]+\.(pdf|xml)$
function isNomeOficial(name: string): boolean {
  return /^(NF|XML|COMP NF)\s+\d+\s+.+\s+-\s+.+\s+-\s+MUSEUS CENTRO\s+-\s+R\$\s+[\d.,]+\.(pdf|xml)$/i.test(name);
}

// Parse nome legado: "NF 03 Producao - FORNECEDOR - R$ 4.200,00.pdf"
function parseLegacyName(name: string): {
  tipo: string; nfNum: string; fornecedor: string; valor: string; ext: string;
} | null {
  const m = name.match(/^(NF|XML|COMP)\s+(\d+)\s+[-–]?\s*(.+?)\s+-\s+R\$\s*([\d][\d.,]*\d)/i);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const tipo = prefix === 'XML' ? 'XML' : prefix === 'COMP' ? 'COMP NF' : 'NF';
  const nfNum = m[2];
  const rest = m[3];
  const parts = rest.split(/\s+-\s+/);
  const fornecedor = parts[parts.length - 1] || parts[0] || 'FORNECEDOR';
  const valor = m[4] || '0,00';
  const ext = name.toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
  return { tipo, nfNum, fornecedor, valor, ext };
}

// Parse nome máquina: "2026-07__FORNECEDOR__NF-12__nf-pdf__sol-abc.pdf"
function parseMachineName(name: string): {
  tipo: string; nfNum: string; fornecedor: string; valor: string; ext: string; mes: string; ano: string;
} | null {
  const m = name.match(/^(\d{4})-(\d{2})__([^_]+)__NF-?(\d+)/i);
  if (!m) return null;
  const ano = m[1];
  const mes = m[2];
  const fornecedor = (m[3] || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const nfNum = m[4];
  const tipo = name.toLowerCase().includes('__xml') ? 'XML' : name.toLowerCase().includes('__comp') ? 'COMP NF' : 'NF';
  const valorMatch = name.match(/R\$\s*([\d][\d.,]*\d)/i);
  const valor = valorMatch ? valorMatch[1] : '0,00';
  const ext = name.toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
  return { tipo, nfNum, fornecedor, valor, ext, mes, ano };
}

function buildNomeOficialFromParsed(parsed: { tipo: string; nfNum: string; fornecedor: string; valor: string; ext: string }): string {
  const prefixo = parsed.tipo;
  const num = parsed.nfNum.replace(/^0+(\d)/, '$1') || 'SN';
  const descricao = 'Despesa';
  const nomeExibicao = sanitize(parsed.fornecedor, 60) || 'FORNECEDOR';
  const valor = formatValor(parsed.valor || '0,00');
  return `${prefixo} ${num} ${descricao} - ${nomeExibicao} - MUSEUS CENTRO - R$ ${valor}.${parsed.ext}`;
}

function renameIfNeeded(name: string): string | null {
  if (isNomeOficial(name)) return null; // já oficial
  const legacy = parseLegacyName(name);
  if (legacy) return buildNomeOficialFromParsed(legacy);
  const machine = parseMachineName(name);
  if (machine) return buildNomeOficialFromParsed(machine);
  return null; // não consegue renomear — mantém nome original
}

// Filtro: exports apenas de marco/2026 em diante (PDF/XML/COMP)
function isExportsElegivel(name: string, modifiedTime: string): boolean {
  const ext = getExt(name);
  if (ext !== 'pdf' && ext !== 'xml') return false;
  // Padrão "marco 26" / "marco/2026" / "03-2026" no nome, ou modifiedTime >= 2026-03-01
  const n = name.toLowerCase();
  if (n.includes('marco') || n.includes('março')) {
    // se tem ano 26 ou 2026, ok; se só "marco 26", ok
    if (n.includes('26') || n.includes('2026')) return true;
  }
  const monthMatch = n.match(/(\d{2})-(\d{4})/) || n.match(/(\d{2})\/(\d{4})/);
  if (monthMatch) {
    const mes = monthMatch[1];
    const ano = monthMatch[2];
    if (Number(ano) >= 2026 && Number(mes) >= 3) return true;
    if (Number(ano) > 2026) return true;
  }
  // Fallback: modifiedTime >= 2026-03-01
  if (modifiedTime) {
    const dt = new Date(modifiedTime);
    if (!isNaN(dt.getTime()) && dt >= new Date('2026-03-01')) return true;
  }
  return false;
}

async function listFolder(accessToken: string, folderId: string): Promise<any[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,modifiedTime,size)';
  let all: any[] = [];
  let pageToken: string | null = null;
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error('listFolder: ' + (data.error?.message || res.status));
    all = all.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return all;
}

// Coleta recursiva (PDF/XML/COMP) dentro de uma pasta e suas subpastas.
// A pasta de backup é organizada em subpastas mensais (MM-YYYY / Month YYYY),
// então basta depth 2. Subpastas listadas em paralelo (Promise.all).
async function coletarArquivosRecursivo(accessToken: string, folderId: string, depth = 0): Promise<any[]> {
  if (depth > 2) return [];
  const items = await listFolder(accessToken, folderId);
  const files = items.filter((it) => it.mimeType !== 'application/vnd.google-apps.folder');
  const folders = items.filter((it) => it.mimeType === 'application/vnd.google-apps.folder');
  // Lista subpastas em paralelo (lote de até 8 simultâneas)
  const out: any[] = [...files];
  for (let i = 0; i < folders.length; i += 8) {
    const batch = folders.slice(i, i + 8);
    const subs = await Promise.all(batch.map((f) => coletarArquivosRecursivo(accessToken, f.id, depth + 1).catch(() => [])));
    for (const s of subs) out.push(...s);
  }
  return out;
}

async function copyFile(accessToken: string, fileId: string, newName: string, destFolderId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName, parents: [destFolderId] }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return { ok: false, error: d.error?.message || String(res.status) };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Autenticação opcional: permite execução via automação (sem user) ou
    // usuário autenticado. O acesso ao Drive já é controlado pelo conector OAuth.
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) { await base44.auth.me(); }
    } catch { /* execução agendada sem user — ok */ }

    const body = await (req.json().catch(() => ({}))) || {};
    const limite = Math.min(Number(body.limite || 20), 50);
    const skipOrigem = Number(body.skip || 0);
    const origem = String(body.origem || 'backup'); // 'backup' | 'exports' | 'ambos'
    const dryRun = !!body.dryRun;

    const conn: any = await base44.asServiceRole.connectors.getConnection('googledrive');
    const accessToken = conn?.access_token || conn?.accessToken;
    if (!accessToken) return Response.json({ error: 'no_drive_token' }, { status: 500 });

    // 1) Listar destino (para dedup por nome)
    const t0 = Date.now();
    const dstFiles = await listFolder(accessToken, DST_FOLDER);
    const dstNames = new Set(dstFiles.map((f) => f.name));

    // 2) Listar origens conforme solicitado
    let srcFiles: any[] = [];
    if (origem === 'backup' || origem === 'ambos') {
      srcFiles = srcFiles.concat(await coletarArquivosRecursivo(accessToken, SRC_BACKUP));
    }
    if (origem === 'exports' || origem === 'ambos') {
      const exp = await coletarArquivosRecursivo(accessToken, SRC_EXPORTS);
      srcFiles = srcFiles.concat(exp.filter((f) => isExportsElegivel(f.name, f.modifiedTime)));
    }

    // 3) Para cada arquivo da origem, decidir nome final e copiar se ausente
    const linhas: any[] = [];
    let copiados = 0, jaExistiam = 0, erros = 0, semRename = 0;
    const BUDGET_MS = 50000;
    let idx = 0;
    for (const f of srcFiles) {
      if (idx++ < skipOrigem) continue;
      if (idx - skipOrigem - 1 >= limite) break;
      if (Date.now() - t0 > BUDGET_MS) break;

      const nomeOriginal = f.name;
      const nomeFinal = renameIfNeeded(nomeOriginal) || nomeOriginal;
      if (dstNames.has(nomeFinal)) {
        jaExistiam++;
        linhas.push({
          origem: origem,
          nome_original: nomeOriginal,
          nome_final: nomeFinal,
          status: 'ja_existia',
        });
        continue;
      }

      if (dryRun) {
        linhas.push({ origem, nome_original: nomeOriginal, nome_final: nomeFinal, status: 'copiar_dry' });
        continue;
      }

      const res = await copyFile(accessToken, f.id, nomeFinal, DST_FOLDER);
      if (res.ok) {
        copiados++;
        dstNames.add(nomeFinal);
      } else {
        erros++;
      }
      if (!res.ok && nomeFinal === nomeOriginal) semRename++;
      linhas.push({
        origem,
        nome_original: nomeOriginal,
        nome_final: nomeFinal,
        status: res.ok ? 'copiado' : 'erro',
        erro: res.error || '',
      });
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      origem,
      stats: {
        total_origem: srcFiles.length,
        copiados,
        ja_existiam: jaExistiam,
        erros,
        sem_rename_aplicado: semRename,
        destino_total: dstFiles.length + copiados,
        processados_neste_lote: linhas.length,
        skip: skipOrigem,
        has_more: idx < srcFiles.length,
        execution_ms: Date.now() - t0,
      },
      linhas: linhas.slice(0, 30),
    });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});