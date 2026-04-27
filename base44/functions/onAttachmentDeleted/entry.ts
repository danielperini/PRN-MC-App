import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * onAttachmentDeleted — Acionado por automação de entidade (Attachment delete).
 *
 * Regras:
 * - Se o attachment tinha drive_file_id: mover para 09_Lixeira_Controlada
 * - Registrar log de auditoria
 * - Nunca deixar arquivo órfão no Drive
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const LIXEIRA_FOLDER = '09_Lixeira_Controlada';

async function findFolder(accessToken, folderName, parentId) {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentId) {
  return (await findFolder(accessToken, folderName, parentId)) || (await createFolder(accessToken, folderName, parentId));
}

// Move arquivo para outra pasta no Drive (sem re-upload)
async function moveFileToDrive(accessToken, fileId, targetFolderId, currentParentHint) {
  // Buscar o parent atual do arquivo
  let removeParents = currentParentHint || '';

  if (!removeParents) {
    const meta = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const metaData = await meta.json();
    removeParents = (metaData.parents || []).join(',');
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetFolderId}&removeParents=${removeParents}&fields=id,parents`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error('Erro ao mover arquivo: ' + err);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { event, data } = body;

    // Só agir em deletes
    if (event?.type !== 'delete') {
      return Response.json({ skipped: true, reason: 'Não é evento de delete' });
    }

    // Se não tinha backup no Drive, nada a fazer
    if (!data?.drive_file_id || !data?.backup_done) {
      return Response.json({ skipped: true, reason: 'Arquivo não tinha backup no Drive' });
    }

    const driveFileId = data.drive_file_id;
    const fileName = data.file_name || driveFileId;

    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Verificar se arquivo ainda existe no Drive
    const checkRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,parents,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (checkRes.status === 404) {
      console.log(`Arquivo ${driveFileId} não encontrado no Drive (já deletado)`);
      return Response.json({ skipped: true, reason: 'Arquivo não encontrado no Drive (já deletado)' });
    }

    const fileMeta = await checkRes.json();
    if (fileMeta.trashed) {
      return Response.json({ skipped: true, reason: 'Arquivo já estava na lixeira do Drive' });
    }

    // Mover para 09_Lixeira_Controlada
    const lixeiraId = await getOrCreateFolder(accessToken, LIXEIRA_FOLDER, ROOT_FOLDER_ID);
    const currentParents = (fileMeta.parents || []).join(',');

    await moveFileToDrive(accessToken, driveFileId, lixeiraId, currentParents);

    // Log de auditoria
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'DELETE',
      entity_type: 'ATTACHMENT',
      entity_id: data.id || driveFileId,
      actor_email: 'system',
      actor_name: 'Backup System',
      details: `Arquivo movido para ${LIXEIRA_FOLDER}: drive_file_id=${driveFileId} | nome=${fileName} | entity_id=${data.id || 'desconhecido'}`
    }).catch(() => null);

    console.log(`Arquivo movido para lixeira: ${driveFileId} (${fileName})`);

    return Response.json({
      success: true,
      action: 'moved_to_trash',
      drive_file_id: driveFileId,
      lixeira_folder_id: lixeiraId,
      file_name: fileName,
    });

  } catch (error) {
    console.error('Erro ao processar delete do Drive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});