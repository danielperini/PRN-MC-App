import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * deduplicateDriveFolder — Rotina administrativa segura de deduplicação.
 *
 * Parâmetros:
 *   dry_run: boolean (default: true) — se true, apenas simula, não move/deleta
 *   folder_id: string (opcional) — pasta específica para analisar (default: raiz)
 *
 * Lógica:
 * 1. Lista todos os arquivos da pasta raiz e subpastas (recursivo, 1 nível)
 * 2. Agrupa por nome normalizado, tamanho e/ou nf_numero
 * 3. Identifica duplicatas: mantém o mais recente, marca os demais
 * 4. Em dry_run=false: move duplicatas para 09_Lixeira_Controlada
 * 5. Registra AuditLog de cada ação
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const LIXEIRA_FOLDER = '09_Lixeira_Controlada';

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9.]/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

async function listFilesInFolder(accessToken, folderId, includeSubfolders = true) {
  const allFiles = [];
  let pageToken = null;

  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,parents)&pageSize=1000`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.error) throw new Error('Erro ao listar Drive: ' + data.error.message);

    for (const file of (data.files || [])) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        if (includeSubfolders) {
          // Recursivo apenas 1 nível
          const subFiles = await listFilesInFolder(accessToken, file.id, false);
          allFiles.push(...subFiles.map(f => ({ ...f, _parentFolderName: file.name, _parentFolderId: file.id })));
        }
      } else {
        allFiles.push({ ...file, _parentFolderId: folderId });
      }
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allFiles;
}

async function findLixeiraFolder(accessToken) {
  const q = encodeURIComponent(
    `name='${LIXEIRA_FOLDER}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (data.files?.[0]?.id) return data.files[0].id;

  // Criar se não existe
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: LIXEIRA_FOLDER, mimeType: 'application/vnd.google-apps.folder', parents: [ROOT_FOLDER_ID] })
  });
  const crData = await cr.json();
  if (crData.error) throw new Error('Erro ao criar lixeira: ' + crData.error.message);
  return crData.id;
}

async function moveToLixeira(accessToken, fileId, currentParentIds, lixeiraId) {
  const removeParents = currentParentIds.join(',');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${lixeiraId}&removeParents=${removeParents}&fields=id`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error('Erro ao mover para lixeira: ' + err);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'ADMIN'].includes(user.role)) {
      return Response.json({ error: 'Apenas administradores podem executar deduplicação' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false; // default: true (simulação)
    const target_folder_id = body.folder_id || ROOT_FOLDER_ID;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Listar todos os arquivos
    const allFiles = await listFilesInFolder(accessToken, target_folder_id, true);
    const totalAnalisados = allFiles.length;

    // Agrupar por chave de deduplicação: nome normalizado + tamanho
    const groups = new Map();
    for (const file of allFiles) {
      const key = `${normalizeName(file.name)}__${file.size || '0'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(file);
    }

    const duplicatas = [];
    const mantidos = [];
    const erros = [];
    let movidos = 0;

    // Processar grupos com duplicatas
    const lixeiraId = dry_run ? null : await findLixeiraFolder(accessToken);

    for (const [key, files] of groups.entries()) {
      if (files.length <= 1) {
        if (files[0]) mantidos.push({ id: files[0].id, name: files[0].name });
        continue;
      }

      // Ordenar por data de modificação (mais recente primeiro)
      files.sort((a, b) => {
        const ta = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
        const tb = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
        return tb - ta;
      });

      const [keep, ...toRemove] = files;
      mantidos.push({ id: keep.id, name: keep.name, modifiedTime: keep.modifiedTime });

      for (const dup of toRemove) {
        duplicatas.push({
          id: dup.id,
          name: dup.name,
          size: dup.size,
          modifiedTime: dup.modifiedTime,
          parent_folder_id: dup._parentFolderId,
          parent_folder_name: dup._parentFolderName || 'root',
          kept_version: keep.id,
          action: dry_run ? 'simulado_mover_para_lixeira' : 'movido_para_lixeira',
        });

        if (!dry_run) {
          try {
            await moveToLixeira(accessToken, dup.id, dup.parents || [dup._parentFolderId], lixeiraId);
            movidos++;

            // Log de auditoria para cada arquivo movido
            await base44.asServiceRole.entities.AuditLog.create({
              action: 'DELETE',
              entity_type: 'ATTACHMENT',
              entity_id: dup.id,
              actor_email: user.email,
              actor_name: user.full_name || user.email,
              details: `Deduplicação: arquivo duplicado movido para lixeira | nome=${dup.name} | mantido=${keep.id} | chave=${key}`
            }).catch(() => null);
          } catch (e) {
            erros.push({ id: dup.id, name: dup.name, error: e.message });
          }
        }
      }
    }

    // Log geral da operação
    await base44.asServiceRole.entities.AuditLog.create({
      action: dry_run ? 'UPDATE' : 'DELETE',
      entity_type: 'ATTACHMENT',
      entity_id: target_folder_id,
      actor_email: user.email,
      actor_name: user.full_name || user.email,
      details: `Deduplicação ${dry_run ? '(SIMULAÇÃO)' : '(REAL)'}: ${totalAnalisados} analisados, ${duplicatas.length} duplicatas, ${movidos} movidos, ${erros.length} erros`
    }).catch(() => null);

    return Response.json({
      success: true,
      mode: dry_run ? 'dry_run (simulação — nenhum arquivo foi movido)' : 'execução real',
      summary: {
        total_analisados: totalAnalisados,
        duplicatas_encontradas: duplicatas.length,
        arquivos_mantidos: mantidos.length,
        arquivos_movidos: movidos,
        erros: erros.length,
      },
      duplicatas: duplicatas.slice(0, 100), // limite de 100 no response
      erros,
      aviso: dry_run
        ? 'Execute com dry_run=false para mover os duplicados para a lixeira (apenas admin)'
        : null,
    });

  } catch (error) {
    console.error('Erro deduplicateDriveFolder:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});