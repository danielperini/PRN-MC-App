import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * sincronizarPastasDrive
 *
 * Sincroniza incrementalmente ORIGEM → DESTINO, mês a mês.
 * - Mapeia pastas da origem ("Julho 2026") para pastas do destino ("07-2026")
 * - NÃO cria novas pastas no destino — pula se não existir
 * - NÃO sobrescreve arquivos — verifica pelo nome antes de copiar
 * - Apenas COPIA arquivos que faltam
 *
 * ORIGEM:  13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T  (pastas: "Julho 2026", "Março 2026"…)
 * DESTINO: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp   (pastas: "07-2026", "03-2026"…)
 */

const SOURCE_FOLDER_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const DEST_FOLDER_ID   = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';

// Mapa: nome por extenso (normalizado) → número do mês com zero à esquerda
const MESES_MAP = {
  'janeiro': '01', 'fevereiro': '02', 'marco': '03', 'abril': '04',
  'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
  'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12',
};

/**
 * Converte "Julho 2026" → "07-2026", "Março 2026" → "03-2026"
 * Retorna null se não conseguir parsear.
 */
function parseFolderName(name) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const match = normalized.match(/^([a-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const mesNum = MESES_MAP[match[1]];
  if (!mesNum) return null;
  return `${mesNum}-${match[2]}`; // ex: "07-2026"
}

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

// ── Sincronização mês a mês ───────────────────────────────────────────────────

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Copia arquivos de srcFolderId → destFolderId (um nível só, sem recursão).
 * Ignora arquivos que já existem pelo nome. Não cria subpastas.
 */
async function syncMesFolder(token, srcFolderId, destFolderId, mesNome, stats, logs, limite) {
  const items = await listFolder(token, srcFolderId);

  for (const item of items) {
    if (limite > 0 && stats.copiados >= limite) break;
    if (item.mimeType === FOLDER_MIME) continue; // ignora subpastas internas

    try {
      const existe = await fileExistsInFolder(token, item.name, destFolderId);
      if (existe) {
        stats.ja_existentes++;
        continue;
      }
      await copyFile(token, item.id, item.name, destFolderId);
      stats.copiados++;
      logs.push({ mes: mesNome, nome: item.name, status: 'copiado' });
    } catch (e) {
      stats.erros++;
      logs.push({ mes: mesNome, nome: item.name, status: 'erro', detalhe: e.message });
    }
  }
}

/**
 * Percorre as pastas mensais da ORIGEM, resolve o nome para o formato do DESTINO,
 * localiza a pasta equivalente no destino (sem criar), e sincroniza os arquivos.
 */
async function syncTodosMeses(token, stats, logs, limite) {
  const srcFolders = await listFolder(token, SOURCE_FOLDER_ID);
  const mesFolders = srcFolders.filter(i => i.mimeType === FOLDER_MIME);

  for (const srcFolder of mesFolders) {
    if (limite > 0 && stats.copiados >= limite) break;

    const destNome = parseFolderName(srcFolder.name);
    if (!destNome) {
      logs.push({ mes: srcFolder.name, status: 'pasta_ignorada', detalhe: 'Nome não corresponde ao padrão "Mês AAAA"' });
      continue;
    }

    // Localizar pasta equivalente no destino — NÃO criar
    const destFolderId = await findFolder(token, destNome, DEST_FOLDER_ID);
    if (!destFolderId) {
      stats.pastas_sem_equivalente++;
      logs.push({ mes: srcFolder.name, destino_esperado: destNome, status: 'pasta_nao_encontrada_no_destino' });
      continue;
    }

    await syncMesFolder(token, srcFolder.id, destFolderId, destNome, stats, logs, limite);
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

    const stats = { copiados: 0, ja_existentes: 0, erros: 0, pastas_sem_equivalente: 0 };
    const logs = [];

    await syncTodosMeses(token, stats, logs, limite);

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