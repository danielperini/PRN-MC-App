/**
 * limparCopiasDriveNFs
 *
 * Limpa arquivos de NF no Drive com "cópia" no nome (duplicatas geradas pelo
 * Google Drive) e reconecta cada arquivo ao seu PurchaseRequest correspondente.
 *
 * Pasta-alvo fixa: 1fu6uCWEQbB4quhNJNoQ04xNMAGWK7_qm (varredura recursiva prof 3).
 *
 * Para cada arquivo cujo nome contenha "copia"/"cópia" (case-insensitive, com
 * ou sem acento): renomeia via PATCH removendo a substring (incluindo espaços
 * extras, hífens e parênteses adjacentes resultantes).
 *
 * Após renomear, reconecta ao PurchaseRequest:
 *   - XML: parse determinístico (nNF + CNPJ emitente) → busca PR por nf_numero
 *     ou fornecedor_cnpj → atualiza drive_backup_nf_xml_link.
 *   - PDF: URL pública `https://drive.google.com/file/d/{id}/view` → busca PR
 *     por nf_numero (tokens do nome) → atualiza drive_backup_nf_pdf_link.
 *
 * Idempotente: arquivos já sem "cópia" e já com link no banco = skip.
 * Budget 60s, lote 30, has_more para execuções encadeadas.
 * Log em BackupLog (backup_type=drive_nf_sync_mensal, triggered_by=scheduled).
 *
 * Parâmetros: limite (30), dryRun (false), folderId.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
const FOLDER_ALVO = '1fu6uCWEQbB4quhNJNoQ04xNMAGWK7_qm';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_PROFUNDIDADE = 3;
const MAX_FILES = 30;
const BUDGET_MS = 50_000; // 50s — margem do limite 100s do Deno Deploy

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
async function renameFile(token: string, fileId: string, newName: string): Promise<void> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!r.ok) throw new Error(`Rename ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 120)}`);
}
async function downloadBytes(token: string, fileId: string): Promise<Uint8Array> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  if (!r.ok) throw new Error(`Download ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ── Limpeza do nome ───────────────────────────────────────────────────────────
// Remove "cópia" (case/acento insensível) + espaços/hífens/parênteses sobrando.
function limparNomeCopia(nome: string): string {
  let s = String(nome || '');
  // Remove instâncias de "cópia" isoladas, com ou sem acento/case.
  // Padrões cobertos: "Cópia de", "Cópia de NN", " - cópia", "(cópia)", " cópia ".
  let prev = '';
  while (s !== prev) {
    prev = s;
    // "Cópia de NN " prefixo do Google Drive (pt-BR "Copy of") — remove tudo
    s = s.replace(/c[oó]pia\s+de(?:\s+\d+)?\s+/gi, ' ');
    // "(cópia NN)" / "(copia)" completo
    s = s.replace(/\s*\(\s*c[oó]pia(?:\s*\d+)?\s*\)\s*/gi, ' ');
    // " - cópia NN" / " – cópia" (com nº opcional)
    s = s.replace(/\s*[-–—]\s*c[oó]pia(?:\s*\d+)?\s*/gi, ' ');
    // " cópia NN" isolado (palavra isolada; numero opcional)
    s = s.replace(/\bc[oó]pia\b(?:\s*\d+)?/gi, ' ');
  }
  // Limpa espaços duplos, hífens órfãos e parênteses órfãos
  s = s.replace(/\s*\(\s*\)\s*/g, ' ');
  s = s.replace(/\s*[-–—]\s*(?=\.|$)/g, ' ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  // Reanexa extensão preservada (já contínua no nome normalmente; este regex
  // garante que "arquivo .pdf" vire "arquivo.pdf")
  s = s.replace(/\s+\.(pdf|xml)$/i, '.$1');
  return s;
}
function contemCopia(nome: string): boolean {
  return /\bc[oó]pia\b/i.test(String(nome || '')) || /\(\s*c[oó]pia\b/i.test(String(nome || ''));
}

// ── XML determinístico ─────────────────────────────────────────────────────────
function parseXmlNF(xml: string): { nfNumero: string | null; emitCnpj: string | null } {
  let nfNumero: string | null = null;
  let emitCnpj: string | null = null;
  // nNF em <nNF> (NFe) ou <NumeroNf> (padrões variados)
  const mNf = xml.match(/<nNF[^>]*>(\d+)<\/nNF>/) || xml.match(/<NumeroNf[^>]*>(\d+)<\/NumeroNf>/) || xml.match(/<numeroNf[^>]*>(\d+)<\/numeroNf>/);
  if (mNf) nfNumero = mNf[1].replace(/^0+/, '');
  // CNPJ emitente em <CNPJ> dentro de <emit>
  const emitBlock = xml.match(/<emit>[\s\S]*?<\/emit>/);
  let block = xml;
  if (emitBlock) block = emitBlock[0];
  const mCnpj = block.match(/<CNPJ[^>]*>(\d{14})<\/CNPJ>/) || block.match(/<CNPJ[^>]*>(\d{8,14})<\/CNPJ>/);
  if (mCnpj) emitCnpj = mCnpj[1];
  return { nfNumero, emitCnpj };
}

// ── Match ──────────────────────────────────────────────────────────────────────
function normalizarNfNumero(raw: any): string {
  return String(raw || '').replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toLowerCase();
}
function normalizarCnpj(raw: any): string {
  return String(raw || '').replace(/[^0-9]/g, '');
}
function tokensDoNome(nome: string): string[] {
  return String(nome || '').split(/[-_./\s]+/).filter(Boolean).map((t) => t.replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toLowerCase()).filter((t) => t.length >= 3);
}
function extrairNfDoNome(nome: string): string | null {
  const n = String(nome || '').toLowerCase();
  // Apenas padrões explícitos: "NF 15", "nf-15", "NF 412972", "nota 9168".
  // NÃO usa fallback de 4+ dígitos solto (evita casar ano "2026" e outros tokens).
  const m = n.match(/\bnf\b[\s-]*0*(\d{2,})/) || n.match(/\bnota\b[\s-]*0*(\d{2,})/) || n.match(/\bnf[\s-]*n[oº]?\s*0*(\d{2,})/);
  return m ? m[1].replace(/^0+/, '') : null;
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

    // Coleta arquivos (qualquer extensão com cópia) recursivamente prof 3
    const encontrados: any[] = [];
    const vistos = new Set([folderId]);
    async function walk(fid: string, depth: number) {
      if (depth > MAX_PROFUNDIDADE || encontrados.length >= limite) return;
      const items = await listFolder(token, fid);
      for (const it of items) {
        if (encontrados.length >= limite) return;
        if (it.mimeType === FOLDER_MIME) {
          if (depth < MAX_PROFUNDIDADE && !vistos.has(it.id)) {
            vistos.add(it.id);
            await walk(it.id, depth + 1);
          }
          continue;
        }
        encontrados.push(it);
      }
    }
    await walk(folderId, 0);

    const stats: any = {
      coletados: encontrados.length,
      processados: 0,
      renomeados: 0,
      vinculos_xml: 0,
      vinculos_pdf: 0,
      erros: 0,
      skips_sem_copia: 0,
      has_more: false,
      dry_run: dryRun,
    };
    const linhas: any[] = [];

    // Pré-carrega PurchaseRequests relevantes (com nf_numero, fornecedor_cnpj,
    // ou intakes) — Atualização grossa: top 500 recentes não cancelados
    const prs: any[] = await base44.asServiceRole.entities.PurchaseRequest
      .filter({ status: { $nin: ['CANCELADO', 'RASCUNHO'] } }, '-updated_date', 500)
      .catch(() => []);
    const prPorNf = new Map<string, any[]>();
    const prPorCnpj = new Map<string, any[]>();
    for (const p of prs) {
      if (p.nf_numero) {
        const k = normalizarNfNumero(p.nf_numero);
        if (k) (prPorNf.get(k) || prPorNf.set(k, []).get(k)!).push(p);
      }
      if (p.fornecedor_cnpj) {
        const k = normalizarCnpj(p.fornecedor_cnpj);
        if (k) (prPorCnpj.get(k) || prPorCnpj.set(k, []).get(k)!).push(p);
      }
    }
    function atualizarPrs(prIds: string[], update: any) {
      if (!prIds.length) return;
      const bulk = prIds.map((id) => ({ id, ...update }));
      return Promise.all(
        Array.from({ length: Math.ceil(bulk.length / 50) }, (_, i) =>
          base44.asServiceRole.entities.PurchaseRequest.bulkUpdate(bulk.slice(i * 50, i * 50 + 50)).catch(() => {})
        )
      );
    }

    for (const f of encontrados) {
      if (Date.now() - start >= BUDGET_MS) { stats.has_more = true; break; }
      stats.processados++;
      const linha: any = { id: f.id, nome: f.name, status: 'skip' };
      try {
        const ext = (f.name || '').toLowerCase().endsWith('.xml') ? 'xml'
          : (f.name || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'outro';
        if (ext === 'outro') { stats.skips_sem_copia++; linhas.push(linha); continue; }

        // 1) Renomear se contém "cópia"
        let nomeFinal = f.name;
        let renomeado = false;
        if (contemCopia(f.name)) {
          nomeFinal = limparNomeCopia(f.name);
          if (nomeFinal && nomeFinal !== f.name) {
            if (!dryRun) await renameFile(token, f.id, nomeFinal);
            renomeado = true;
            stats.renomeados++;
            linha.status = 'renomeado';
            linha.novo_nome = nomeFinal;
          }
        } else {
          stats.skips_sem_copia++;
          linha.status = 'sem_copia';
          // Mesmo sem renomear, ainda tentamos reconectar se não tem link no banco
        }

        // 2) Reconectar PR (XML prioritário por nNF/CNPJ; PDF por nF do nome)
        const urlPublica = `https://drive.google.com/file/d/${f.id}/view`;
        let matches: any[] = [];
        let campoAlvo: 'drive_backup_nf_xml_link' | 'drive_backup_nf_pdf_link' = ext === 'xml' ? 'drive_backup_nf_xml_link' : 'drive_backup_nf_pdf_link';

        if (ext === 'xml') {
          // Parse determinístico
          let nfNumero: string | null = null;
          let emitCnpj: string | null = null;
          try {
            const bytes = await downloadBytes(token, f.id);
            const xml = new TextDecoder('utf-8').decode(bytes);
            const parsed = parseXmlNF(xml);
            nfNumero = parsed.nfNumero;
            emitCnpj = parsed.emitCnpj;
          } catch (e: any) {
            linha.erro_xml = e.message;
          }
          linha.nf_numero = nfNumero;
          linha.emit_cnpj = emitCnpj;
          if (nfNumero) {
            const k = normalizarNfNumero(nfNumero);
            matches = (prPorNf.get(k) || []);
          }
          if (!matches.length && emitCnpj) {
            matches = (prPorCnpj.get(normalizarCnpj(emitCnpj)) || []);
          }
        } else {
          // PDF: extrai nf do nome (não demanda IA)
          const nf = extrairNfDoNome(nomeFinal);
          linha.nf_numero_nome = nf;
          // Match exclusivo via número explícito no nome (sem fallback por tokens)
          if (nf) matches = (prPorNf.get(normalizarNfNumero(nf)) || []);
        }

        // Filtra: só atualiza PRs que ainda não têm esse link exato
        const aAtualizar: any[] = [];
        const aVinculados: any[] = [];
        for (const p of matches) {
          const atual = p[campoAlvo];
          if (atual && atual === urlPublica) continue; // já ok
          aAtualizar.push(p.id);
          aVinculados.push(p);
        }
        if (aAtualizar.length && !dryRun) {
          await atualizarPrs(aAtualizar, {
            [campoAlvo]: urlPublica,
            drive_backup_nf_ok: true,
            backup_last_synced_at: new Date().toISOString(),
          });
          if (ext === 'xml') stats.vinculos_xml += aAtualizar.length;
          else stats.vinculos_pdf += aAtualizar.length;
          linha.status = renomeado ? 'renomeado_vinculado' : (linha.status === 'sem_copia' ? 'vinculado' : (linha.status || 'vinculado'));
          linha.vinculos = aVinculados.map((p) => ({ id: p.id, nf_numero: p.nf_numero, fornecedor: p.fornecedor_nome }));
        } else if (aAtualizar.length && dryRun) {
          if (ext === 'xml') stats.vinculos_xml += aAtualizar.length;
          else stats.vinculos_pdf += aAtualizar.length;
          linha.status = 'simulado_vincular';
        }

        linhas.push(linha);
      } catch (e: any) {
        linha.status = 'erro';
        linha.erro = e.message;
        stats.erros++;
        linhas.push(linha);
      }
    }

    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      entity_type: 'limparCopiasDriveNFs',
      status: stats.erros > 0 ? 'concluido' : 'success',
      total_files: stats.processados,
      files_copied: stats.renomeados,
      details: `Pasta ${folderId} | renomeados ${stats.renomeados} | vinc_xml ${stats.vinculos_xml} | vinc_pdf ${stats.vinculos_pdf} | erros ${stats.erros} | skip ${stats.skips_sem_copia} | has_more ${stats.has_more}${dryRun ? ' | DRY-RUN' : ''}`,
      triggered_by: 'scheduled',
      processed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - start,
    }).catch(() => {});

    return Response.json({ ok: true, folder_id: folderId, stats, amostra: linhas.slice(0, 10) });
  } catch (e) {
    return Response.json({ error: e?.message || 'erro', stack: e?.stack }, { status: 500 });
  }
});