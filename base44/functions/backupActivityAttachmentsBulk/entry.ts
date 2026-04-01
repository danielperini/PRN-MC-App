import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Backup em lote de Attachments sem backup para o Google Drive.
 * Chama a lógica diretamente (não via invoke) para preservar o token do conector.
 * Apenas admins podem invocar.
 */

const ATIVIDADES_ROOT_FOLDER_ID = '1JIQOY1eY29Qt-iUFgivfioaSoaFXGFJy';
const CACHE_KEY_PREFIX = 'drive_folder_cache__';

function sanitize(value) {
  return String(value || 'Sem_Nome').trim().replace(/[\/\\:*?"<>|]/g, '_').slice(0, 80) || 'Sem_Nome';
}

async function createDriveFolder(accessToken, folderName, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateCachedFolder(base44, accessToken, folderName, parentId) {
  const cacheKey = `${CACHE_KEY_PREFIX}${parentId}__${folderName}`;
  const cached = await base44.asServiceRole.entities.BackupLog.filter({ details: cacheKey }).catch(() => []);
  if (cached?.length > 0 && cached[0].entity_id?.length > 10) return cached[0].entity_id;

  const folderId = await createDriveFolder(accessToken, folderName, parentId);
  await base44.asServiceRole.entities.AuditLog.create({
    action: 'CREATE',
    entity_type: 'ATTACHMENT',
    entity_id: folderId,
    actor_email: 'system',
    actor_name: 'Backup System',
    details: cacheKey,
  }).catch(() => null);
  return folderId;
}

async function backupOne(base44, accessToken, attachment) {
  if (attachment.backup_done && attachment.drive_file_id) return { skipped: true };
  if (!attachment.file_url) throw new Error('Arquivo sem URL');

  const isPhoto =
    /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.file_name || '') ||
    /^image\//i.test(attachment.file_type || '');

  let folderLabel = 'Sem_Atividade';

  if (attachment.activity_id && attachment.report_id) {
    const activities = await base44.asServiceRole.entities.Activity
      .filter({ report_id: attachment.report_id })
      .catch(() => []);
    const act = activities.find(a => a.id === attachment.activity_id);
    if (act?.titulo) folderLabel = sanitize(act.titulo);
  }

  if (folderLabel === 'Sem_Atividade' && attachment.report_id) {
    const report = await base44.asServiceRole.entities.Report.get(attachment.report_id).catch(() => null);
    if (report?.author_name) folderLabel = sanitize(report.author_name);
  }

  const typeLabel = isPhoto ? 'Fotos' : 'Documentos';
  const typeFolderId = await getOrCreateCachedFolder(base44, accessToken, typeLabel, ATIVIDADES_ROOT_FOLDER_ID);
  const targetFolderId = await getOrCreateCachedFolder(base44, accessToken, folderLabel, typeFolderId);

  const fileResponse = await fetch(attachment.file_url);
  if (!fileResponse.ok) throw new Error('Não foi possível baixar o arquivo original');
  const fileBlob = await fileResponse.blob();

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name: attachment.file_name, parents: [targetFolderId] })], { type: 'application/json' }));
  formData.append('file', fileBlob, attachment.file_name);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
  );
  const result = await uploadRes.json();
  if (result.error) throw new Error('Erro no upload: ' + result.error.message);

  const backupDate = new Date().toISOString();
  await base44.asServiceRole.entities.Attachment.update(attachment.id, {
    backup_done: true,
    drive_file_id: result.id,
    backup_date: backupDate,
  });

  return { success: true, drive_file_id: result.id, folder: `${typeLabel}/${folderLabel}` };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 200;

    const allAttachments = await base44.asServiceRole.entities.Attachment.list('-created_date', limit);
    const pending = (allAttachments || []).filter(a => !a.backup_done || !a.drive_file_id);

    if (!pending.length) {
      return Response.json({ message: 'Nenhum arquivo pendente de backup', count: 0 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    let succeeded = 0, skipped = 0, failed = 0;
    const errors = [];

    for (const att of pending) {
      try {
        const res = await backupOne(base44, accessToken, att);
        if (res.skipped) skipped++;
        else succeeded++;
      } catch (err) {
        failed++;
        errors.push({ id: att.id, error: err?.message || String(err) });
      }
    }

    return Response.json({ total: pending.length, succeeded, skipped, failed, errors: errors.slice(0, 20) });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});