/**
 * corrigirPastaDriveNFs
 *
 * Varre a pasta raiz `1jhZBWsOltRSjtdKHPG64PovnxygKLuW-` no Google Drive e
 * suas subpastas (pastas de mês como 06-2026, 07-2026...) corrigindo arquivos
 * PDF/XML corrompidos por rotinas anteriores:
 *   - PDFs com nome de fornecedor errado (nome de outra NF)
 *   - XMLs/PDFs na pasta de mês errada
 *   - pares NF+XML misturados entre fornecedores distintos
 *
 * Para cada arquivo:
 *   1. Vincula a uma PurchaseRequest (cascata: file_id banco → parse XML →
 *      regex do nome do PDF)
 *   2. Monta o nome canônico via buildNomeOficial() do `_shared/nfNomeOficial`
 *   3. Deriva MM-YYYY de nf_data_emissao (PR ou XML parseado)
 *   4. Renomeia (PATCH files/{id}) se o nome atual divergir
 *   5. Move (addParents/removeParents) para a subpasta MM-YYYY correta
 *
 * Idempotente: pula arquivos já no padrão e na pasta certa.
 * dryRun=true → apenas simula e reporta. Sem escrita no Drive.
 * Paginação via skip/limite. Budget 55s.
 * Log em BackupLog (backup_type: drive_nf_sync_mensal).
 *
 * Nota: função operacional sobre arquivos físicos da pasta (não sobre o banco).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  buildNomeOficial,
  ensureUniqueName,
  isEquipe,
  extractNfNumGeneric,
} from '../_shared/nfNomeOficial.ts';

type TipoNFArquivo = 'NF' | 'XML' | 'COMP NF';

const ROOT_FOLDER = '1jhZBWsOltRSjtdKHPG64PovnxygKLuW-';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TIMEOUT_MS = 55000;
const MAX_DEPTH = 6;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string, opts: any = {}) {
  return fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

async function listChildren(token: string, folderId: string): Promise<any[]> {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)');
    let url =
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}` +
      `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await driveReq(token, url);
    if (!r.ok) return items;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const r = await driveReq(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`,
  );
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token: string, name: string, parentId: string): Promise<string> {
  const r = await driveReq(token, 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`createFolder "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreateMesFolder(
  token: string,
  mesAno: string,
  rootId: string,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!mesAno) return null;
  const key = `${rootId}::${mesAno}`;
  if (cache.has(key)) return cache.get(key) || null;
  let id = await findFolder(token, mesAno, rootId);
  if (!id) id = await createFolder(token, mesAno, rootId);
  cache.set(key, id || '');
  return id || null;
}

async function getFileParents(token: string, fileId: string): Promise<string[]> {
  const r = await driveReq(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
  );
  if (!r.ok) return [];
  const d = await r.json();
  return d.parents || [];
}

async function renameFile(token: string, fileId: string, newName: string): Promise<void> {
  const r = await driveReq(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) },
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Rename HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
}

async function moveFile(
  token: string,
  fileId: string,
  addParent: string,
  removeParents: string[],
): Promise<void> {
  let url =
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true` +
    `&addParents=${encodeURIComponent(addParent)}`;
  if (removeParents?.length) url += `&removeParents=${encodeURIComponent(removeParents.join(','))}`;
  const r = await driveReq(token, url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Move HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
}

async function downloadFile(token: string, fileId: string): Promise<string> {
  const r = await driveReq(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
  );
  if (!r.ok) return '';
  const buf = await r.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf);
}

function extrairDriveFileId(url: string): string | null {
  if (!url) return null;
  const m =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
    url.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

function extrairMesAno(dataRaw: any): string {
  if (!dataRaw) return '';
  const s = String(dataRaw).trim();
  let iso = '';
  if (/^\d{4}-\d{2}/.test(s)) {
    iso = s;
  } else {
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  }
  if (!iso) return '';
  const d = new Date(iso.substring(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Parseia XML por regex inline (sem dependências externas)
function parseXmlSimples(xml: string): {
  nf_numero?: string;
  nf_valor_total?: number;
  nf_emitente_nome?: string;
  nf_data_emissao?: string;
} {
  const tag = (re: RegExp) => {
    const m = xml.match(re);
    return m ? m[1].trim() : '';
  };
  const result: any = {};
  const num = tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i);
  if (num) result.nf_numero = num.replace(/^0+(\d)/, '$1');
  const valor =
    tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) ||
    tag(/<vPag[^>]*>([\d.,]+)<\/vPag>/i) ||
    tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i) ||
    tag(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i);
  if (valor) {
    const s = valor.replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) result.nf_valor_total = parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    else result.nf_valor_total = parseFloat(s.replace(',', '.')) || 0;
  }
  const nome = tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i);
  if (nome) result.nf_emitente_nome = nome;
  const data =
    (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i)
      || tag(/<Competencia[^>]*>(\d{4}-\d{2}-\d{2})/i)) as string;
  if (data) result.nf_data_emissao = data;
  return result;
}

// ── Varredura recursiva ──────────────────────────────────────────────────────

async function varrerPasta(
  token: string,
  folderId: string,
  deadline: number,
  depth = 0,
): Promise<any[]> {
  if (depth > MAX_DEPTH || Date.now() > deadline) return [];
  const out: any[] = [];
  const items = await listChildren(token, folderId);
  for (const item of items) {
    if (Date.now() > deadline) break;
    if (item.mimeType === FOLDER_MIME) {
      const sub = await varrerPasta(token, item.id, deadline, depth + 1);
      out.push(...sub);
    } else {
      const nome = String(item.name || '').toLowerCase();
      if (nome.endsWith('.pdf') || nome.endsWith('.xml')) {
        out.push({
          id: item.id,
          name: item.name,
          parent: folderId,
          mime: item.mimeType,
        });
      }
    }
  }
  return out;
}

// ── Índice de PRs em memória ───────────────────────────────────────────────────

interface IndicePR {
  porFileId: Map<string, any>;
  porNfNum: Map<string, any[]>; // chave = dígitos do nf_numero → múltiplas PRs
}

async function carregarIndicePRs(base44: any): Promise<IndicePR> {
  const porFileId = new Map<string, any>();
  const porNfNum = new Map<string, any[]>();
  let skip = 0;
  while (true) {
    const lote = await base44.asServiceRole.entities.PurchaseRequest
      .filter({}, '-updated_date', 200, skip)
      .catch(() => []);
    if (!lote?.length) break;
    for (const pr of lote) {
      const pdfId = extrairDriveFileId(pr.drive_backup_nf_pdf_link || pr.nf_pdf_url || pr.nota_fiscal_url || '');
      const xmlId = extrairDriveFileId(pr.nf_xml_url || pr.nota_fiscal_xml_url || pr.xml_url || '');
      if (pdfId) porFileId.set(pdfId, pr);
      if (xmlId && !porFileId.has(xmlId)) porFileId.set(xmlId, pr);
      const nfNum = String(pr.nf_numero || '').replace(/\D/g, '');
      if (nfNum) {
        if (!porNfNum.has(nfNum)) porNfNum.set(nfNum, []);
        porNfNum.get(nfNum)!.push(pr);
      }
    }
    if (lote.length < 200) break;
    skip += 200;
  }
  return { porFileId, porNfNum };
}

// Pré-carrega TeamMembers por email para resolver equipe sem N queries
async function carregarTeamMembersPorEmail(base44: any): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  let skip = 0;
  while (true) {
    const lote = await base44.asServiceRole.entities.TeamMember
      .filter({}, '-updated_date', 200, skip)
      .catch(() => []);
    if (!lote?.length) break;
    for (const tm of lote) {
      const email = String(tm.user_email || '').trim().toLowerCase();
      if (email) map.set(email, tm);
    }
    if (lote.length < 200) break;
    skip += 200;
  }
  return map;
}

// Encontra PR por nf_numero + valor + fornecedor (melhor esforço)
function melhorMatchPR(lista: any[], valor?: number, fornecedor?: string): any | null {
  if (!lista?.length) return null;
  if (lista.length === 1) return lista[0];
  // Score por coincidência de valor (peso maior) e fornecedor
  let melhor: any = null;
  let melhorScore = -1;
  for (const pr of lista) {
    let score = 0;
    if (valor && Math.abs(Number(pr.nf_valor_total || pr.valor_pago || pr.valor_solicitado || 0) - valor) < 0.01) score += 2;
    if (fornecedor && pr.fornecedor_nome) {
      const a = String(fornecedor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const b = String(pr.fornecedor_nome).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (a && b && (a.includes(b) || b.includes(a))) score += 1;
    }
    if (score > melhorScore) {
      melhorScore = score;
      melhor = pr;
    }
  }
  return melhor || lista[0];
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const skip = Math.max(0, Number(body.skip || 0));
    const limite = body.limite ? Math.min(Number(body.limite), 500) : null;
    const deadline = start + TIMEOUT_MS;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    // ── Pré-carrega índices em memória ─────────────────────────────────────────
    const [indice, teamMembers] = await Promise.all([
      carregarIndicePRs(base44),
      carregarTeamMembersPorEmail(base44),
    ]);

    // ── Varre a pasta raiz (uma vez, em memória) ───────────────────────────────
    const todosArquivos = await varrerPasta(token, ROOT_FOLDER, deadline);

    const totalDisponivel = todosArquivos.length;
    const fatia = limite ? todosArquivos.slice(skip, skip + limite) : (skip > 0 ? todosArquivos.slice(skip) : todosArquivos);
    const hasMore = limite ? skip + limite < totalDisponivel : false;

    const stats = {
      total_varridos: totalDisponivel,
      processados: fatia.length,
      skip,
      has_more: hasMore,
      renomeados: 0,
      movidos: 0,
      renomeados_movidos: 0,
      ok: 0,
      sem_pr: 0,
      sem_data: 0,
      erros: 0,
    };
    const linhas: any[] = [];

    // Cache: folderId → Set de nomes já presentes (para ensureUniqueName)
    const folderNamesCache = new Map<string, Set<string>>();
    async function getFolderNames(folderId: string): Promise<Set<string>> {
      if (folderNamesCache.has(folderId)) return folderNamesCache.get(folderId)!;
      const nomes = new Set<string>();
      const filhos = await listChildren(token, folderId);
      for (const f of filhos) if (f.mimeType !== FOLDER_MIME) nomes.add(f.name);
      folderNamesCache.set(folderId, nomes);
      return nomes;
    }

    const mesFolderCache = new Map<string, string>();

    for (const arq of fatia) {
      if (Date.now() > deadline) {
        stats.processados = linhas.length;
        break;
      }
      const ext = String(arq.name).toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
      const tipo: TipoNFArquivo = ext === 'xml' ? 'XML' : 'NF';

      const linha: any = {
        id: arq.id,
        nome_atual: arq.name,
        pasta_atual: arq.parent,
        nome_correto: '',
        pasta_correta: '',
        acao: 'ok',
        nf_numero: '',
        fornecedor: '',
        erro: '',
      };

      // ── 2. Pareamento NF+XML (cascata) ──────────────────────────────────────
      let pr: any = indice.porFileId.get(arq.id) || null;
      let dadosXml: any = null;

      // (b) XML: parseia conteúdo se PR não achado por file_id
      if (!pr && ext === 'xml') {
        try {
          const xml = await downloadFile(token, arq.id);
          dadosXml = parseXmlSimples(xml);
        } catch {
          dadosXml = null;
        }
        if (dadosXml?.nf_numero) {
          const nfNum = String(dadosXml.nf_numero).replace(/\D/g, '');
          const cands = indice.porNfNum.get(nfNum) || [];
          pr = melhorMatchPR(cands, dadosXml.nf_valor_total, dadosXml.nf_emitente_nome);
        }
      }

      // (c) PDF: extrai número do nome e cruza com banco
      if (!pr && ext === 'pdf') {
        const numNome = extractNfNumGeneric(arq.name);
        if (numNome) {
          const nfNum = numNome.replace(/\D/g, '');
          const cands = indice.porNfNum.get(nfNum) || [];
          if (cands.length === 1) pr = cands[0];
          else if (cands.length > 1) pr = cands[0]; // múltiplas: pega a primeira; refinaria exigiria valor
        }
      }

      if (!pr) {
        linha.acao = 'sem_pr';
        stats.sem_pr++;
        linhas.push(linha);
        continue;
      }

      linha.nf_numero = pr.nf_numero || '';
      linha.fornecedor = pr.fornecedor_nome || pr.nf_emitente_nome || '';

      // ── 3. Nome canônico ────────────────────────────────────────────────────
      let teamMember: any = null;
      if (isEquipe(pr)) {
        const email = String(pr.user_email || '').trim().toLowerCase();
        if (email) teamMember = teamMembers.get(email) || null;
      }
      const nomeCorreto = buildNomeOficial(pr, null, tipo, teamMember);
      linha.nome_correto = nomeCorreto;

      // ── 4. Pasta correta (MM-YYYY de nf_data_emissao) ────────────────────────
      const dataRef = pr.nf_data_emissao || (dadosXml?.nf_data_emissao as string) || '';
      const mesAno = extrairMesAno(dataRef);
      linha.pasta_correta = mesAno;

      if (!mesAno) {
        linha.acao = 'sem_data';
        stats.sem_data++;
        linhas.push(linha);
        continue;
      }

      // ── 5+6. Determina ações (renomear + mover) ──────────────────────────────
      const precisaRenomear = arq.name !== nomeCorreto;
      let precisaMover = false;
      let pastaDestinoId: string | null = null;
      if (mesAno) {
        try {
          pastaDestinoId = await getOrCreateMesFolder(token, mesAno, ROOT_FOLDER, mesFolderCache);
        } catch (e: any) {
          linha.erro = `criar pasta ${mesAno}: ${e.message}`;
        }
        if (arq.parent !== pastaDestinoId) precisaMover = true;
      }

      if (!precisaRenomear && !precisaMover) {
        linha.acao = 'ok';
        stats.ok++;
        linhas.push(linha);
        continue;
      }
      if (precisaRenomear && precisaMover) linha.acao = 'renomear+mover';
      else if (precisaRenomear) linha.acao = 'renomear';
      else linha.acao = 'mover';

      if (dryRun) {
        linhas.push(linha);
        continue;
      }

      // ── Executa: renomeia (com unicidade na pasta destino) ─────────────────
      let nomeFinal = nomeCorreto;
      try {
        if (precisaRenomear && pastaDestinoId) {
          const nomesExistentes = await getFolderNames(pastaDestinoId);
          // Adiciona o nome atual do próprio arquivo ao conjunto para garantir consistência
          nomesExistentes.add(arq.name);
          nomeFinal = ensureUniqueName(nomeCorreto, nomesExistentes);
          await renameFile(token, arq.id, nomeFinal);
          // Atualiza cache de nomes da pasta destino
          nomesExistentes.delete(arq.name);
          nomesExistentes.add(nomeFinal);
          folderNamesCache.set(pastaDestinoId, nomesExistentes);
        }
      } catch (e: any) {
        linha.erro = `renomear: ${e.message}`;
        stats.erros++;
        linhas.push(linha);
        continue;
      }

      // ── Executa: move (addParents/removeParents) ───────────────────────────
      try {
        if (precisaMover && pastaDestinoId) {
          const parentsAtuais = await getFileParents(token, arq.id);
          // Remove o parent atual (origem) e adiciona o destino
          await moveFile(token, arq.id, pastaDestinoId, parentsAtuais);
          linha.pasta_atual = pastaDestinoId;
        }
      } catch (e: any) {
        linha.erro = `mover: ${e.message}`;
        stats.erros++;
        linhas.push(linha);
        continue;
      }

      linha.nome_correto = nomeFinal;
      if (linha.acao === 'renomear+mover') stats.renomeados_movidos++;
      else if (linha.acao === 'renomear') stats.renomeados++;
      else if (linha.acao === 'mover') stats.movidos++;
      linhas.push(linha);
    }

    // ── Log ────────────────────────────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal',
        entity_type: 'corrigirPastaDriveNFs',
        status: stats.erros > 0 ? 'concluido' : 'success',
        total_files: stats.total_varridos,
        files_copied: stats.renomeados + stats.movidos + stats.renomeados_movidos,
        details: `Varridos: ${stats.total_varridos} | Ok: ${stats.ok} | Renomeados: ${stats.renomeados} | Movidos: ${stats.movidos} | Renomeados+Movidos: ${stats.renomeados_movidos} | Sem PR: ${stats.sem_pr} | Sem data: ${stats.sem_data} | Erros: ${stats.erros}`,
        triggered_by: 'manual',
        processed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - start,
      });
    } catch { /* log não bloqueia */ }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      execution_ms: Date.now() - start,
      stats,
      amostra: linhas.slice(0, 15),
      total_linhas: linhas.length,
    });
  } catch (err) {
    console.error('[corrigirPastaDriveNFs] erro:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});