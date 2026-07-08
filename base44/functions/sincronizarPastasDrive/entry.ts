import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * sincronizarPastasDrive
 *
 * Sincroniza incrementalmente a pasta ORIGEM para a pasta DESTINO no Google Drive.
 * - Percorre subpastas recursivamente (mesma estrutura)
 * - NÃO deleta arquivos
 * - NÃO sobrescreve arquivos existentes (verifica pelo nome)
 * - Apenas COPIA arquivos que ainda não existem no destino
 *
 * ORIGEM:  13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T
 * DESTINO: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp
 */

const SOURCE_FOLDER_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const DEST_FOLDER_ID   = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveRequest(token, url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return r;
}

/** Lista TODOS os itens (arquivos + pastas) de uma pasta com paginação. */
async function listFolder(token, folderId) {
  const items = [];
  let pageToken = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const r = await driveRequest(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pageToken = d.nextPageToken || null;
  } while (pageToken);
  return items;
}

/** Busca uma pasta pelo nome dentro de um pai. */
async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await driveRequest(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

/** Cria uma pasta no destino. */
async function createFolder(token, name, parentId) {
  const r = await driveRequest(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Criar pasta "${name}": ${d.error.message}`);
  return d.id;
}

/** Encontra ou cria pasta no destino. */
async function getOrCreateFolder(token, name, parentId) {
  return (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
}

/** Verifica se arquivo com esse nome já existe na pasta destino. */
async function fileExistsInFolder(token, fileName, folderId) {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`
  );
  const r = await driveRequest(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
  if (!r.ok) return false;
  const d = await r.json();
  return (d.files?.length || 0) > 0;
}

/**
 * Copia um arquivo de origem para uma pasta destino usando a API Drive copy.
 * A API copy não precisa fazer download/upload — é server-side.
 */
async function copyFile(token, fileId, fileName, destFolderId) {
  const r = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName, parents: [destFolderId] }),
    }
  );
  const d = await r.json();
  if (d.error) throw new Error(`Copy "${fileName}": ${d.error.message}`);
  return d.id;
}

// ── Sincronização recursiva ───────────────────────────────────────────────────

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Sincroniza srcFolderId → destFolderId recursivamente.
 * Retorna { copiados, ja_existentes, erros, pastas_criadas }
 */
async function syncFolder(token, srcFolderId, destFolderId, stats, logs, limite) {
  const items = await listFolder(token, srcFolderId);

  for (const item of items) {
    if (limite > 0 && stats.copiados >= limite) break;

    if (item.mimeType === FOLDER_MIME) {
      // Subpasta: encontrar/criar equivalente no destino e entrar recursivamente
      let destSubId;
      try {
        destSubId = await getOrCreateFolder(token, item.name, destFolderId);
        if (!destSubId) {
          stats.erros++;
          logs.push({ nome: item.name, tipo: 'pasta', status: 'erro', detalhe: 'Não foi possível criar subpasta' });
          continue;
        }
        if (!(await findFolder(token, item.name, destFolderId).then(id => !!id).catch(() => false))) {
          stats.pastas_criadas++;
        }
      } catch (e) {
        stats.erros++;
        logs.push({ nome: item.name, tipo: 'pasta', status: 'erro', detalhe: e.message });
        continue;
      }
      await syncFolder(token, item.id, destSubId, stats, logs, limite);

    } else {
      // Arquivo: verificar se já existe no destino pelo nome
      try {
        const existe = await fileExistsInFolder(token, item.name, destFolderId);
        if (existe) {
          stats.ja_existentes++;
          continue; // não logar — pode ser muitos
        }
        await copyFile(token, item.id, item.name, destFolderId);
        stats.copiados++;
        logs.push({ nome: item.name, tipo: 'arquivo', status: 'copiado' });
      } catch (e) {
        stats.erros++;
        logs.push({ nome: item.name, tipo: 'arquivo', status: 'erro', detalhe: e.message });
      }
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCron = req.headers.get('x-base44-trigger') === 'cron';

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    // limite: máx de arquivos copiados por execução (0 = sem limite)
    const limite = typeof body.limite === 'number' ? body.limite : 0;
    // dryRun: só lista o que falta, sem copiar
    const dryRun = body.dryRun === true;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;
    const startTime = Date.now();

    if (dryRun) {
      // Listar apenas o primeiro nível da origem para inspecção
      const preview = await listFolder(token, SOURCE_FOLDER_ID);
      return Response.json({
        ok: true,
        dry_run: true,
        source: SOURCE_FOLDER_ID,
        dest: DEST_FOLDER_ID,
        source_top_level_items: preview.length,
        items: preview.map(i => ({ nome: i.name, tipo: i.mimeType === FOLDER_MIME ? 'pasta' : 'arquivo', id: i.id })),
      });
    }

    const stats = { copiados: 0, ja_existentes: 0, erros: 0, pastas_criadas: 0 };
    const logs = [];

    await syncFolder(token, SOURCE_FOLDER_ID, DEST_FOLDER_ID, stats, logs, limite);

    const execution_ms = Date.now() - startTime;

    // Salvar log de execução
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'sincronizar_pastas_drive',
      status: stats.erros > 0 && stats.copiados === 0 ? 'failure' : 'success',
      total_files: stats.copiados + stats.ja_existentes + stats.erros,
      files_copied: stats.copiados,
      error_message: stats.erros > 0 ? `${stats.erros} erros` : '',
      execution_time_ms: execution_ms,
      triggered_by: isCron ? 'scheduled' : 'manual',
    }).catch(() => null);

    return Response.json({
      ok: true,
      source: SOURCE_FOLDER_ID,
      dest: DEST_FOLDER_ID,
      stats,
      execution_ms,
      logs: logs.slice(0, 200),
    });

  } catch (error) {
    console.error('sincronizarPastasDrive error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});