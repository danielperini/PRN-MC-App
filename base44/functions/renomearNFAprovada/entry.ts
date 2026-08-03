import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

import {
  buildNomeOficial,
  isNomeOficial,
  isMachineName,
  parseMachineName,
  parseLegacyName,
  extractNfNumGeneric,
  ensureUniqueName,
  resolveTeamMemberForPR,
} from '../_shared/nfNomeOficial.ts';

type TipoNFArquivo = 'NF' | 'XML' | 'COMP NF';

/**
 * renomearNFAprovada
 *
 * Renomeia os arquivos de uma PurchaseRequest específica (PDF/XML/Comprovante)
 * no Google Drive para o padrão oficial canônico (buildNomeOficial), de forma
 * idempotente e não-bloqueante.
 *
 * Acionada por automação de entidade quando o status da PurchaseRequest muda
 * para APROVADO_ADMIN. Também aceita chamada manual via functions.invoke ou
 * HTTP com { purchase_request_id }.
 *
 * Comportamento:
 *  - Se o backup no Drive ainda não foi concluído (sem drive_backup_folder_id
 *    ou drive_backup_status !== 'concluido'), computa o nome-alvo e retorna
 *    skipped — syncNotaFiscalDriveBackup já usa buildNomeOficial em uploads
 *    novos, então o arquivo nascerá com o nome correto.
 *  - Caso contrário, lista os arquivos da pasta mensal, filtra apenas os que
 *    pertencem a esta PR (por fileId em drive_backup_files ou por parsing do
 *    nome legado com match de nf_numero/sol-id), e renomeia no Drive.
 *  - Atualiza drive_backup_files da PR com os novos nomes para rastreabilidade.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function safeStr(v: unknown): string {
  return String(v ?? '').trim();
}

function classificarTipo(nome: string): { tipo: TipoNFArquivo; ext: string } {
  const lower = (nome || '').toLowerCase();
  if (lower.endsWith('.xml')) return { tipo: 'XML', ext: 'xml' };
  if (lower.startsWith('comp') || lower.includes('comprovante') || lower.includes('recibo')) {
    return { tipo: 'COMP NF', ext: 'pdf' };
  }
  return { tipo: 'NF', ext: 'pdf' };
}

/**
 * Determina se o arquivo pertence à PurchaseRequest.
 * Estratégias (qualquer uma positiva):
 *  1. fileId está no array drive_backup_files da PR (fonte principal)
 *  2. Padrão máquina com sufixo sol-XXXXXXXX correspondente ao id da PR
 *  3. Padrão legível/legado cujo número de NF bate com pr.nf_numero
 *  4. Padrão oficial já aplicado cujo número de NF bate com pr.nf_numero
 */
function arquivoPertencePR(file: any, pr: any): boolean {
  const nome = String(file?.name || '');
  if (!nome) return false;
  const prId = String(pr?.id || '');
  const idSuffix = prId.slice(-8).toLowerCase();

  if (isMachineName(nome)) {
    if (idSuffix && nome.toLowerCase().includes(`sol-${idSuffix}`)) return true;
  }

  const prNf = String(pr?.nf_numero || '').trim();
  if (!prNf) return false;

  let nfNum = '';
  const legacy = parseLegacyName(nome);
  if (legacy?.nfNum) nfNum = legacy.nfNum;
  if (!nfNum && isMachineName(nome)) {
    const machine = parseMachineName(nome);
    if (machine?.nfNum) nfNum = machine.nfNum;
  }
  if (!nfNum) nfNum = extractNfNumGeneric(nome);

  if (nfNum && nfNum === prNf) return true;

  if (isNomeOficial(nome)) {
    const m = nome.match(/^(?:NF|XML|COMP NF)\s+(\d+)\s+/i);
    if (m && m[1] === prNf) return true;
  }

  return false;
}

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
    if (Array.isArray(d.files)) items.push(...d.files);
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
  return d.name as string;
}

function extractPrId(body: any): string {
  return (
    safeStr(body.purchase_request_id) ||
    safeStr(body.purchaseId) ||
    safeStr(body.entity_id) ||
    safeStr(body.event?.entity_id) ||
    safeStr(body.data?.id) ||
    safeStr(body.id)
  );
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const dryRun = body.dry_run === true || body.dryRun === true;

    const prId = extractPrId(body);
    if (!prId) {
      return Response.json({ ok: false, error: 'purchase_request_id obrigatório' }, { status: 400 });
    }

    const pr = await base44.asServiceRole.entities.PurchaseRequest.get(prId).catch(() => null);
    if (!pr) {
      return Response.json({ ok: false, error: 'PurchaseRequest não encontrada' }, { status: 404 });
    }

    // Resolve credenciais Google Drive
    let token: string;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      token = conn.accessToken;
    } catch {
      return Response.json({ ok: false, error: 'Google Drive não configurado' }, { status: 503 });
    }

    const teamMember = await resolveTeamMemberForPR(base44, pr).catch(() => null);

    // Caso A: backup ainda não concluído — nome-alvo é computado apenas para
    // informação; syncNotaFiscalDriveBackup já usa buildNomeOficial em novos
    // uploads, então o arquivo nascerá com o nome correto.
    const folderId = safeStr(pr.drive_backup_folder_id);
    const backupConcluido = pr.drive_backup_status === 'concluido' && !!folderId;

    if (!backupConcluido) {
      const targetNames = {
        NF: buildNomeOficial(pr, null, 'NF', teamMember),
        XML: buildNomeOficial(pr, null, 'XML', teamMember),
        'COMP NF': buildNomeOficial(pr, null, 'COMP NF', teamMember),
      };
      // Apenas log — não precisamos persistir campo novo, pois o sync aplica
      // buildNomeOficial no próprio fluxo de upload.
      console.log(
        `[renomearNFAprovada] PR ${pr.id} backup pendente (${pr.drive_backup_status}). ` +
          `Nome-alvo preparado para syncNotaFiscalDriveBackup.`,
      );
      return Response.json({
        ok: true,
        skipped: true,
        reason: 'backup_pendente',
        purchase_id: pr.id,
        drive_backup_status: pr.drive_backup_status || null,
        target_names: targetNames,
      });
    }

    // Caso B: backup concluído — localiza e renomeia arquivos da PR na pasta
    const items = await listAllInFolder(token, folderId!);
    const nomesExistentes = new Set(items.map((i) => i.name));

    const prFiles: any[] = Array.isArray(pr.drive_backup_files) ? pr.drive_backup_files : [];
    const fileIdsDaPR = new Set(prFiles.map((f) => safeStr(f.fileId)).filter(Boolean));

    const renamed: any[] = [];
    const errors: any[] = [];
    const backupFilesAtualizado = prFiles.map((f) => ({ ...f }));

    for (const item of items) {
      if (item.mimeType === FOLDER_MIME) continue;

      const porFileId = fileIdsDaPR.has(safeStr(item.id));
      const porNome = arquivoPertencePR(item, pr);
      if (!porFileId && !porNome) continue;

      if (isNomeOficial(item.name)) {
        renamed.push({ fileId: item.id, name: item.name, status: 'ja_padrao' });
        continue;
      }

      const { tipo, ext } = classificarTipo(item.name);
      let novoNome = buildNomeOficial(pr, null, tipo, teamMember);
      if (!novoNome.toLowerCase().endsWith('.' + ext)) {
        novoNome = novoNome.replace(/\.[^.]+$/, '') + '.' + ext;
      }

      if (novoNome === item.name) {
        renamed.push({ fileId: item.id, name: item.name, status: 'ja_padrao' });
        continue;
      }

      if (nomesExistentes.has(novoNome) && novoNome !== item.name) {
        novoNome = ensureUniqueName(novoNome, nomesExistentes);
      }

      // dry_run: não toca no Drive nem no banco, apenas simula
      if (dryRun) {
        renamed.push({ fileId: item.id, from: item.name, to: novoNome, status: 'simulado' });
        continue;
      }

      nomesExistentes.add(novoNome);
      nomesExistentes.delete(item.name);

      try {
        await renameFile(token, item.id, novoNome);
        renamed.push({ fileId: item.id, from: item.name, to: novoNome, status: 'renomeado' });
        const idx = backupFilesAtualizado.findIndex((f) => safeStr(f.fileId) === safeStr(item.id));
        if (idx >= 0) backupFilesAtualizado[idx] = { ...backupFilesAtualizado[idx], name: novoNome };
      } catch (e: any) {
        errors.push({ fileId: item.id, name: item.name, erro: e?.message || String(e) });
        nomesExistentes.delete(novoNome);
        nomesExistentes.add(item.name);
      }
    }

    if (!dryRun && renamed.some((r) => r.status === 'renomeado')) {
      await base44.asServiceRole.entities.PurchaseRequest
        .update(pr.id, { drive_backup_files: backupFilesAtualizado })
        .catch((err: any) =>
          console.warn(`[renomearNFAprovada] Falha ao atualizar drive_backup_files: ${err?.message || err}`),
        );
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      purchase_id: pr.id,
      folder_id: folderId,
      renomeados: renamed.filter((r) => r.status === 'renomeado').length,
      simulados: renamed.filter((r) => r.status === 'simulado').length,
      ja_padrao: renamed.filter((r) => r.status === 'ja_padrao').length,
      erros: errors.length,
      renamed,
      errors,
      execution_ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    console.error('[renomearNFAprovada] erro:', err);
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
});