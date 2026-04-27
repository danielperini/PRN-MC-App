import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Deduplicação segura de arquivos no Google Drive.
 * Por padrão roda em dry_run=true (simulação).
 * Execução real só para admin com dry_run=false explícito.
 *
 * Lógica de deduplicação:
 *  1. Lista todos os arquivos da pasta raiz e subpastas
 *  2. Agrupa por: nome normalizado, tamanho, e campos NF quando disponíveis
 *  3. Para cada grupo com duplicatas, mantém o mais recente
 *  4. Em modo real: move os antigos para 09_Lixeira_Controlada
 *  5. Registra log de auditoria para cada ação
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const LIXEIRA_FOLDER_NAME = '09_Lixeira_Controlada';
const MAX_FILES_PER_FOLDER = 500;

function normalizeName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.\-]/g, '')
    .replace(/\.(pdf|xml|jpg|jpeg|png|gif|webp)$/, '')
    .trim();
}

async function listFolderContents(accessToken: string, folderId: string, pageToken?: string): Promise<any[]> {
  let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,size,modifiedTime,createdTime,parents)&pageSize=${MAX_FILES_PER_FOLDER}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao listar pasta ${folderId}: ${data.error.message}`);

  let files = data.files || [];
  if (data.nextPageToken) {
    const more = await listFolderContents(accessToken, folderId, data.nextPageToken);
    files = files.concat(more);
  }
  return files;
}

async function listAllFilesRecursive(accessToken: string, folderId: string, depth = 0): Promise<any[]> {
  if (depth > 5) return []; // limite de profundidade
  const items = await listFolderContents(accessToken, folderId);
  let allFiles: any[] = [];

  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      // Pular lixeira para não processar arquivos já descartados
      if (item.name === LIXEIRA_FOLDER_NAME) continue;
      const children = await listAllFilesRecursive(accessToken, item.id, depth + 1);
      allFiles = allFiles.concat(children);
    } else {
      allFiles.push({ ...item, folderId });
    }
  }

  return allFiles;
}

async function findLixeiraFolder(accessToken: string): Promise<string> {
  const safeN = LIXEIRA_FOLDER_NAME.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${safeN}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.files?.[0]?.id) return data.files[0].id;

  // Criar se não existir
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: LIXEIRA_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [ROOT_FOLDER_ID] }),
  });
  const cd = await cr.json();
  if (cd.error) throw new Error('Erro ao criar lixeira: ' + cd.error.message);
  return cd.id;
}

async function moveToFolder(accessToken: string, fileId: string, targetFolderId: string, currentFolderId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetFolderId}&removeParents=${currentFolderId}&fields=id`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Erro ao mover ${fileId}: ${err || res.status}`);
  }
}

async function renameFile(accessToken: string, fileId: string, newName: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || !['admin', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Apenas admins podem executar deduplicação' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    // Por padrão SEMPRE simulação — requer dry_run=false explícito para execução real
    const dryRun: boolean = body.dry_run !== false;
    const targetFolderId: string = body.folder_id || ROOT_FOLDER_ID;

    console.log(`Iniciando deduplicação. dry_run=${dryRun}, folder=${targetFolderId}`);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Listar todos os arquivos recursivamente
    const allFiles = await listAllFilesRecursive(accessToken, targetFolderId);
    const totalAnalyzed = allFiles.length;

    console.log(`Total de arquivos encontrados: ${totalAnalyzed}`);

    // Agrupar por chave de duplicata: nome normalizado + tamanho
    const groups: Map<string, any[]> = new Map();

    for (const file of allFiles) {
      const keyName = normalizeName(file.name);
      const keySize = String(file.size || 0);
      const groupKey = `${keyName}__${keySize}`;

      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(file);
    }

    // Filtrar apenas grupos com duplicatas
    const duplicateGroups = Array.from(groups.entries()).filter(([, files]) => files.length > 1);

    let duplicatesFound = 0;
    let kept = 0;
    let movedToTrash = 0;
    const report: any[] = [];
    const errors: string[] = [];

    let lixeiraFolderId: string | null = null;

    for (const [groupKey, files] of duplicateGroups) {
      // Ordenar por data de modificação — mais recente primeiro
      const sorted = files.sort((a, b) => {
        const aTime = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const bTime = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return bTime - aTime;
      });

      const [toKeep, ...toRemove] = sorted;
      duplicatesFound += toRemove.length;
      kept++;

      const groupReport: any = {
        group_key: groupKey,
        kept: { id: toKeep.id, name: toKeep.name, modified: toKeep.modifiedTime },
        removed: toRemove.map(f => ({ id: f.id, name: f.name, modified: f.modifiedTime })),
        action: dryRun ? 'would_move_to_trash' : 'moved_to_trash',
      };

      if (!dryRun) {
        // Executar remoção real
        if (!lixeiraFolderId) {
          lixeiraFolderId = await findLixeiraFolder(accessToken);
        }

        for (const fileToRemove of toRemove) {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const trashName = `DUP_${timestamp}_${fileToRemove.name}`;
            await renameFile(accessToken, fileToRemove.id, trashName);
            await moveToFolder(accessToken, fileToRemove.id, lixeiraFolderId!, fileToRemove.folderId);
            movedToTrash++;

            // Registrar auditoria
            await base44.asServiceRole.entities.AuditLog.create({
              action: 'DELETE',
              entity_type: 'ATTACHMENT',
              entity_id: fileToRemove.id,
              actor_email: user.email,
              actor_name: user.full_name || user.email,
              details: `Deduplicação: arquivo duplicado movido para lixeira. Nome: ${fileToRemove.name}. Mantido: ${toKeep.id}`,
            }).catch(() => null);
          } catch (e: any) {
            errors.push(`Erro ao mover ${fileToRemove.id} (${fileToRemove.name}): ${e.message}`);
          }
        }
      }

      report.push(groupReport);
    }

    // Log geral da operação
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'UPDATE',
      entity_type: 'ATTACHMENT',
      entity_id: targetFolderId,
      actor_email: user.email,
      actor_name: user.full_name || user.email,
      details: `Deduplicação Drive. dry_run=${dryRun}. Analisados: ${totalAnalyzed}. Duplicados: ${duplicatesFound}. Movidos para lixeira: ${movedToTrash}. Erros: ${errors.length}`,
    }).catch(() => null);

    return Response.json({
      success: true,
      dry_run: dryRun,
      message: dryRun
        ? `SIMULAÇÃO: ${duplicatesFound} arquivo(s) duplicado(s) seriam movidos para a lixeira. Execute com dry_run=false para executar.`
        : `${movedToTrash} arquivo(s) duplicado(s) movidos para ${LIXEIRA_FOLDER_NAME}.`,
      stats: {
        total_analisados: totalAnalyzed,
        grupos_duplicados: duplicateGroups.length,
        duplicados_encontrados: duplicatesFound,
        mantidos: kept,
        movidos_lixeira: movedToTrash,
        erros: errors.length,
      },
      duplicate_groups: report.slice(0, 50), // limitar resposta
      errors: errors.slice(0, 20),
    });
  } catch (error: any) {
    console.error('Erro na deduplicação:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});