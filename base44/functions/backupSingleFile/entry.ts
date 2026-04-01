import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Backup de um Attachment para o Google Drive.
 * Usa escopo drive.file — NÃO pode listar/buscar arquivos com query.
 * Cacheia IDs de pastas no BackupLog para evitar duplicatas.
 */

const ATIVIDADES_ROOT_FOLDER_ID = '1JIQOY1eY29Qt-iUFgivfioaSoaFXGFJy';
const CACHE_KEY_PREFIX = 'drive_folder_cache__';

function sanitize(value) {
  return String(value || 'Sem_Nome')
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '_')
    .slice(0, 80) || 'Sem_Nome';
}

function extractAttachmentId(body) {
  return (
    body?.attachment_id ||
    body?.entity_id ||
    body?.event?.entity_id ||
    body?.data?.entity_id ||
    body?.data?.event?.entity_id ||
    null
  );
}

async function createDriveFolder(accessToken, folderName, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

/**
 * Retorna o ID de uma pasta, criando-a se não existir.
 * Usa BackupLog como cache de IDs para não criar duplicatas.
 */
async function getOrCreateCachedFolder(base44, accessToken, folderName, parentId) {
  const cacheKey = `${CACHE_KEY_PREFIX}${parentId}__${folderName}`;

  // Tenta buscar no cache
  const cached = await base44.asServiceRole.entities.BackupLog
    .filter({ details: cacheKey })
    .catch(() => []);

  if (cached && cached.length > 0) {
    const record = cached[0];
    // O ID da pasta está armazenado no campo "entity_id"
    if (record.entity_id && record.entity_id.length > 10) {
      return record.entity_id;
    }
  }

  // Cria a pasta no Drive
  const folderId = await createDriveFolder(accessToken, folderName, parentId);

  // Salva no cache
  await base44.asServiceRole.entities.AuditLog.create({
    action: 'CREATE',
    entity_type: 'ATTACHMENT',
    entity_id: folderId,
    actor_email: 'system',
    actor_name: 'Backup System',
    details: cacheKey,
  }).catch(() => null); // não bloquear se o cache falhar

  return folderId;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const attachment_id = extractAttachmentId(body);

    if (!attachment_id) {
      return Response.json({ error: 'attachment_id obrigatório' }, { status: 400 });
    }

    const attachment = await base44.asServiceRole.entities.Attachment.get(attachment_id);
    if (!attachment) {
      return Response.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    if (attachment.backup_done && attachment.drive_file_id) {
      return Response.json({
        skipped: true,
        reason: 'Backup já realizado',
        attachment_id,
        drive_file_id: attachment.drive_file_id,
      });
    }

    if (!attachment.file_url) {
      return Response.json({ error: 'Arquivo sem URL' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const isPhoto =
      /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.file_name || '') ||
      /^image\//i.test(attachment.file_type || '');

    // Determinar label da subpasta: nome da atividade ou autor do relatório
    let folderLabel = 'Sem_Atividade';

    if (attachment.activity_id && attachment.report_id) {
      const activities = await base44.asServiceRole.entities.Activity
        .filter({ report_id: attachment.report_id })
        .catch(() => []);
      const act = activities.find(a => a.id === attachment.activity_id);
      if (act?.titulo) {
        folderLabel = sanitize(act.titulo);
      }
    }

    if (folderLabel === 'Sem_Atividade' && attachment.report_id) {
      const report = await base44.asServiceRole.entities.Report.get(attachment.report_id).catch(() => null);
      if (report?.author_name) folderLabel = sanitize(report.author_name);
    }

    // Estrutura: Root / Fotos|Documentos / NomeDaAtividade
    const typeLabel = isPhoto ? 'Fotos' : 'Documentos';
    const typeFolderId = await getOrCreateCachedFolder(base44, accessToken, typeLabel, ATIVIDADES_ROOT_FOLDER_ID);
    const targetFolderId = await getOrCreateCachedFolder(base44, accessToken, folderLabel, typeFolderId);

    // Download do arquivo original
    const fileResponse = await fetch(attachment.file_url);
    if (!fileResponse.ok) {
      return Response.json({ error: 'Não foi possível baixar o arquivo original' }, { status: 400 });
    }
    const fileBlob = await fileResponse.blob();

    // Upload para o Drive
    const formData = new FormData();
    formData.append(
      'metadata',
      new Blob(
        [JSON.stringify({ name: attachment.file_name, parents: [targetFolderId] })],
        { type: 'application/json' }
      )
    );
    formData.append('file', fileBlob, attachment.file_name);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      }
    );

    const result = await uploadRes.json();
    if (result.error) {
      throw new Error('Erro no upload: ' + result.error.message);
    }

    const backupDate = new Date().toISOString();
    await base44.asServiceRole.entities.Attachment.update(attachment_id, {
      backup_done: true,
      drive_file_id: result.id,
      backup_date: backupDate,
    });

    return Response.json({
      success: true,
      attachment_id,
      drive_file_id: result.id,
      drive_link: `https://drive.google.com/file/d/${result.id}/view`,
      backup_date: backupDate,
      folder: `${typeLabel}/${folderLabel}`,
    });
  } catch (error) {
    console.error('Erro no backup:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});