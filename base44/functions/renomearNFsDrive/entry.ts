import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * renomearNFsDrive
 *
 * Percorre todas as pastas mensais das pastas raiz do Drive e renomeia
 * arquivos que estão no padrão máquina para o padrão oficial legível:
 *
 *   DE:  2026-07__JULIANA_CRISTINA_DA_SILVA__NF-12__nf-pdf__sol-5e92afc5.pdf
 *   PARA: NF 12 Educador - JULIANA CRISTINA DA SILVA - MUSEUS CENTRO - R$ 4.600,00.pdf
 *
 * Padrão máquina detectado: começa com YYYY-MM__
 * Se o arquivo já está no padrão NF XX ..., não mexe.
 *
 * Estratégia de reconstrução do nome:
 *   1. Extrai número NF, fornecedor e mês do próprio nome do arquivo máquina
 *   2. Busca a PurchaseRequest correspondente no banco pelo nf_numero + fornecedor_nome
 *   3. Se encontrar, usa buildFileName() com dados completos (natureza, valor, projeto)
 *   4. Se não encontrar, monta nome legível com os dados extraídos do nome do arquivo
 */

const ROOT_FOLDERS = [
  '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp',  // pastas MM-YYYY
  '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T',  // pastas "Mês YYYY"
  '10udE1viTbqEtoGdpMZVcRA97SkpcWNsn',   // pasta flat (julho 2026)
];

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── Helpers de nome ───────────────────────────────────────────────────────────

function sanitize(v: string, max = 50): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-\.]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .substring(0, max).trim();
}

function parseValor(v: any): number {
  const s = String(v || '').replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function fmtValor(v: any): string {
  return parseValor(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getProjeto(cc: string): string {
  return String(cc || '').toUpperCase().includes('NOTURNO') ? 'NOTURNO NOS MUSEUS 2026' : 'MUSEUS CENTRO';
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmtData(dataStr: any): string {
  if (!dataStr) return '';
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return '';
  return ` ${MESES_ABREV[d.getMonth()]}${d.getFullYear()}`;
}

/** Monta o nome legível oficial a partir de dados de uma PurchaseRequest */
function buildNameFromPR(pr: any, prefixo = 'NF'): string {
  const num = sanitize(pr.nf_numero || pr.id?.substring(0, 8) || 'SN', 10);
  const natureza = sanitize(pr.rubrica_nome || pr.natureza_despesa || pr.categoria || pr.descricao_item || 'Despesa', 35);
  const fornecedor = sanitize(pr.fornecedor_nome || pr.nf_emitente_nome || 'FORNECEDOR', 50);
  const projeto = getProjeto(pr.centro_custo || '');
  const valor = fmtValor(pr.valor_pago || pr.valor_aprovado_admin || pr.nf_valor_total || pr.valor_solicitado || 0);
  const data = fmtData(pr.nf_data_emissao || pr.data_pagamento_efetivo || pr.created_date);
  const ext = prefixo === 'XML' ? 'xml' : 'pdf';
  const pref = prefixo === 'COMP' ? 'COMP NF' : prefixo;
  return `${pref} ${num}${data} ${natureza} - ${fornecedor} - ${projeto} - R$ ${valor}.${ext}`;
}

/**
 * Extrai campos do padrão máquina: 2026-07__NOME__NF-12__nf-pdf__sol-abc.pdf
 * Também lida com: 2026-07__NOME__NF-12__xml__sol-abc.xml
 * Retorna: { nfNum, fornecedor, tipo ('NF'|'XML'|'COMP'), ext }
 */
function parseMachineName(nome: string): { nfNum: string; fornecedor: string; tipo: string; ext: string } | null {
  if (!/^\d{4}-\d{2}__/.test(nome)) return null;

  const ext = nome.endsWith('.xml') ? 'xml' : 'pdf';
  const tipo = nome.includes('__xml__') ? 'XML' : nome.includes('__comp') ? 'COMP' : 'NF';

  // NF number
  const nfMatch = nome.match(/NF-?(\d+)/i);
  const nfNum = nfMatch ? nfMatch[1] : '';

  // Fornecedor: parte entre primeiro __ e __NF- ou __nf-pdf ou __xml
  const partes = nome.replace(/\.[^.]+$/, '').split('__');
  // partes[0] = "2026-07", partes[1] = fornecedor, partes[2+] = tipo etc.
  const rawFornecedor = partes[1] || '';
  const fornecedor = rawFornecedor.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  return { nfNum, fornecedor, tipo, ext };
}

/** Monta nome legível apenas com dados do arquivo (sem PurchaseRequest) */
function buildNameFromFile(parsed: ReturnType<typeof parseMachineName>): string {
  if (!parsed) return '';
  const { nfNum, fornecedor, tipo, ext } = parsed;
  const pref = tipo === 'XML' ? 'XML' : tipo === 'COMP' ? 'COMP NF' : 'NF';
  const num = nfNum ? nfNum.padStart(2, '0') : 'SN';
  const forn = sanitize(fornecedor, 60);
  return `${pref} ${num} - ${forn}.${ext}`;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function listAllInFolder(token: string, folderId: string) {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await driveReq(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function renameFile(token: string, fileId: string, newName: string) {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.name;
}

// ── Busca PurchaseRequest por número de NF + fornecedor ───────────────────────

async function findPR(base44: any, nfNum: string, fornecedorHint: string): Promise<any | null> {
  if (!nfNum) return null;
  try {
    // Tenta pelo número exato
    const results = await base44.asServiceRole.entities.PurchaseRequest.filter({ nf_numero: nfNum }, '-created_date', 10);
    if (results?.length === 1) return results[0];

    // Se múltiplos, escolhe o mais parecido com o fornecedor
    if (results?.length > 1 && fornecedorHint) {
      const hint = fornecedorHint.toLowerCase();
      const match = results.find((p: any) => {
        const fn = String(p.fornecedor_nome || p.nf_emitente_nome || '').toLowerCase();
        return hint.split(' ').filter(t => t.length > 3).some(t => fn.includes(t));
      });
      if (match) return match;
      return results[0];
    }
    return results?.[0] || null;
  } catch {
    return null;
  }
}

// ── Processar pasta (flat ou com subpastas) ───────────────────────────────────

async function processarPasta(base44: any, token: string, folderId: string, dryRun: boolean, stats: any, logs: any[]) {
  const items = await listAllInFolder(token, folderId);

  for (const item of items) {
    // Recursivo para subpastas
    if (item.mimeType === FOLDER_MIME) {
      await processarPasta(base44, token, item.id, dryRun, stats, logs);
      continue;
    }

    const nome = item.name;

    // Só renomeia se estiver no padrão máquina
    if (!/^\d{4}-\d{2}__/.test(nome)) {
      stats.ja_padrao++;
      continue;
    }

    const parsed = parseMachineName(nome);
    if (!parsed) {
      stats.nao_reconhecido++;
      continue;
    }

    // Tenta buscar dados completos no banco
    const pr = await findPR(base44, parsed.nfNum, parsed.fornecedor);
    let novoNome: string;

    if (pr) {
      const prefixo = parsed.tipo === 'XML' ? 'XML' : parsed.tipo === 'COMP' ? 'COMP' : 'NF';
      novoNome = buildNameFromPR(pr, prefixo);
    } else {
      // Fallback: monta nome legível apenas com dados do arquivo
      novoNome = buildNameFromFile(parsed);
    }

    // Garante extensão correta
    if (!novoNome.endsWith('.' + parsed.ext)) {
      novoNome = novoNome.replace(/\.[^.]+$/, '') + '.' + parsed.ext;
    }

    // Não renomear se o nome já seria igual
    if (novoNome === nome) {
      stats.ja_padrao++;
      continue;
    }

    logs.push({
      de: nome,
      para: novoNome,
      fonte: pr ? 'banco' : 'arquivo',
      status: dryRun ? 'simulado' : 'pendente',
    });

    if (!dryRun) {
      try {
        await renameFile(token, item.id, novoNome);
        logs[logs.length - 1].status = 'renomeado';
        stats.renomeados++;
      } catch (e) {
        logs[logs.length - 1].status = 'erro';
        logs[logs.length - 1].erro = e.message;
        stats.erros++;
      }
    } else {
      stats.renomeados++;
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // padrão: true (seguro)
    const folderIds: string[] = body.folderIds || ROOT_FOLDERS;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;
    const start = Date.now();

    const stats = { renomeados: 0, ja_padrao: 0, nao_reconhecido: 0, erros: 0 };
    const logs: any[] = [];

    for (const folderId of folderIds) {
      await processarPasta(base44, token, folderId, dryRun, stats, logs);
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      stats,
      execution_ms: Date.now() - start,
      logs: logs.slice(0, 200),
    });

  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});