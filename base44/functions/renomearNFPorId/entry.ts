import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

import {
  buildNomeOficial,
  isMachineName,
  parseMachineName,
  parseLegacyName,
  extractNfNumGeneric,
  isNomeOficial,
  ensureUniqueName,
  resolveTeamMemberForPR,
  type TipoNFArquivo,
} from '../_shared/nfNomeOficial.ts';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * renomearNFPorId
 *
 * Renomeia os arquivos (NF / XML / Comprovante) de uma única PurchaseRequest
 * no Google Drive para o padrão oficial canônico, usando o mesmo módulo
 * `_shared/nfNomeOficial.ts` do `renomearNFsDrive` (migração em massa).
 *
 * Pontos de entrada:
 *   - Invocação direta:  { purchase_id }
 *   - Automação de entidade: payload { event: { entity_id }, data, ... }
 *
 * Idempotente: arquivos já no padrão oficial são ignorados.
 * Não-bloqueante para o fluxo de aprovação (a automação é assíncrona).
 */

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

// ── Classificação do arquivo legado ────────────────────────────────────────────

function classificarArquivo(nome: string) {
  const lowerNome = nome.toLowerCase();
  const ext = lowerNome.endsWith('.xml') ? 'xml' : 'pdf';

  if (isMachineName(nome)) {
    const parsed = parseMachineName(nome);
    if (parsed) {
      return { nfNum: parsed.nfNum, fornecedorHint: parsed.fornecedor, tipo: parsed.tipo, ext, padrao: 'maquina' as const };
    }
  }

  const legacy = parseLegacyName(nome);
  if (legacy) {
    return { ...legacy, padrao: 'legivel' as const };
  }

  const nfNumGeneric = extractNfNumGeneric(nome);
  const tipoGeneric: TipoNFArquivo = lowerNome.startsWith('xml') ? 'XML' : lowerNome.startsWith('comp') ? 'COMP NF' : 'NF';
  return { nfNum: nfNumGeneric, fornecedorHint: '', tipo: tipoGeneric, ext, padrao: 'nao_reconhecido' as const };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));

    const purchaseId =
      body?.purchase_id ||
      body?.purchaseId ||
      body?.event?.entity_id ||
      body?.data?.id ||
      body?.data?.purchase_id;

    if (!purchaseId) {
      return Response.json({ ok: false, error: 'purchase_id obrigatório' }, { status: 400 });
    }

    const pr = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!pr) {
      return Response.json({ ok: false, error: 'PurchaseRequest não encontrada' }, { status: 404 });
    }

    const folderId = pr.drive_backup_folder_id;
    if (!folderId) {
      // Backup ainda pendente — syncNotaFiscalDriveBackup já usará o nome oficial ao subir.
      return Response.json({
        ok: true,
        skipped: true,
        purchase_id: pr.id,
        motivo: 'sem pasta de backup no Drive — novo upload já usará o nome oficial',
      });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    const items = await listAllInFolder(token, folderId);
    const arquivos = items.filter((i) => i.mimeType !== FOLDER_MIME);

    if (arquivos.length === 0) {
      return Response.json({ ok: true, skipped: true, purchase_id: pr.id, motivo: 'pasta vazia' });
    }

    const teamMember = await resolveTeamMemberForPR(base44, pr);
    const nomesExistentes = new Set(arquivos.map((i) => i.name));

    const logs: any[] = [];
    let renomeados = 0;
    let ja_padrao = 0;
    let erros = 0;

    // Atualiza metadados `drive_backup_files` da PR com os novos nomes
    const novosArquivosMeta: any[] = Array.isArray(pr.drive_backup_files)
      ? pr.drive_backup_files.map((f: any) => ({ ...f }))
      : [];

    for (const item of arquivos) {
      const nome = item.name;

      // Já está no padrão oficial — não mexe
      if (isNomeOficial(nome)) {
        ja_padrao++;
        continue;
      }

      const parsed = classificarArquivo(nome);

      // Tipo derivado da extensão/prefixo (a PR é a fonte de verdade dos metadados)
      let tipo: TipoNFArquivo = 'NF';
      if (parsed.ext === 'xml') tipo = 'XML';
      else if (/^comp/i.test(nome)) tipo = 'COMP NF';
      else tipo = 'NF';

      let novoNome = buildNomeOficial(pr, null, tipo, teamMember);

      // Garante extensão correta
      if (!novoNome.toLowerCase().endsWith('.' + parsed.ext.toLowerCase())) {
        novoNome = novoNome.replace(/\.[^.]+$/, '') + '.' + parsed.ext;
      }

      // Nome não mudou — já está padronizado
      if (novoNome === nome) {
        ja_padrao++;
        continue;
      }

      // Duplicidade: se outro arquivo (não o atual) já tem o nome alvo, sufixa
      const alvoEmUso = nomesExistentes.has(novoNome) && novoNome !== nome;
      if (alvoEmUso) {
        novoNome = ensureUniqueName(novoNome, nomesExistentes);
      }

      // Reserva o novo nome no set para a próxima iteração
      nomesExistentes.add(novoNome);
      if (novoNome !== nome) nomesExistentes.delete(nome);

      const logEntry: any = { de: nome, para: novoNome, fileId: item.id, status: 'pendente' };
      try {
        await renameFile(token, item.id, novoNome);
        logEntry.status = 'renomeado';
        renomeados++;

        // Atualiza metadados em drive_backup_files
        const idx = novosArquivosMeta.findIndex((f: any) => f?.fileId === item.id);
        const tipoTag = String(tipo).toLowerCase().replace(/\s+/g, '-');
        if (idx >= 0) {
          novosArquivosMeta[idx] = { ...(novosArquivosMeta[idx] || {}), name: novoNome, fileId: item.id, tipo: tipoTag };
        } else {
          novosArquivosMeta.push({ name: novoNome, fileId: item.id, tipo: tipoTag });
        }
      } catch (e: any) {
        logEntry.status = 'erro';
        logEntry.erro = e.message;
        erros++;
        // Reverte reserva em caso de erro
        nomesExistentes.delete(novoNome);
        if (novoNome !== nome) nomesExistentes.add(nome);
      }
      logs.push(logEntry);
    }

    // Persiste os novos nomes na PR para rastreabilidade (apenas se houve renomeações)
    if (renomeados > 0) {
      try {
        await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
          drive_backup_files: novosArquivosMeta,
          drive_backup_at: new Date().toISOString(),
        });
      } catch (persistErr) {
        console.warn('[renomearNFPorId] Falha ao atualizar drive_backup_files (não bloqueante):', persistErr?.message);
      }
    }

    return Response.json({
      ok: true,
      purchase_id: pr.id,
      stats: { renomeados, ja_padrao, sem_vinculo: 0, erros },
      logs: logs.slice(0, 200),
    });
  } catch (err: any) {
    console.error('[renomearNFPorId] error:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});