import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Backup de um único Attachment para o Google Drive
// Funciona tanto via frontend quanto via automação
// Payload aceito:
// { attachment_id: "..." }
// ou { event: { entity_id: "..." } }
// ou { data: { event: { entity_id: "..." } } }

const FOTOS_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';
const DOCUMENTOS_FOLDER_ID = '1psLJvyj6sNuO7kscJIjrCsINgRBTQq_1';

function sanitizeFolderName(value: string | undefined | null) {
  return String(value || 'Sem Usuario')
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '_')
    .slice(0, 120) || 'Sem Usuario';
}

function extractAttachmentId(body: any): string | null {
  return (
    body?.attachment_id ||
    body?.entity_id ||
    body?.event?.entity_id ||
    body?.data?.entity_id ||
    body?.data?.event?.entity_id ||
    null
  );
}

async function findFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const q = encodeURIComponent(
    `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta: ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken: string, folderName: string, parentFolderId: string) {
  return (await findFolder(accessToken, folderName, parentFolderId)) || (await createFolder(accessToken, folderName, parentFolderId));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }

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
        backup_date: attachment.backup_date
      });
    }

    if (!attachment.file_url) {
      return Response.json({ error: 'Arquivo sem URL' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const isPhoto =
      /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.file_name || '') ||
      /^image\//i.test(attachment.file_type || '');

    let uploaderName = 'Sem Usuario';

    if (attachment.report_id) {
      const report = await base44.asServiceRole.entities.Report.get(attachment.report_id).catch(() => null);
      uploaderName = sanitizeFolderName(
        report?.author_name ||
        user?.full_name ||
        user?.email ||
        'Sem Usuario'
      );
    } else {
      uploaderName = sanitizeFolderName(user?.full_name || user?.email || 'Sem Usuario');
    }

    let targetFolderId: string;
    if (isPhoto) {
      targetFolderId = await getOrCreateFolder(accessToken, uploaderName, FOTOS_FOLDER_ID);
    } else {
      const anexosFolderId = await getOrCreateFolder(accessToken, 'Anexos', DOCUMENTOS_FOLDER_ID);
      targetFolderId = await getOrCreateFolder(accessToken, uploaderName, anexosFolderId);
    }

    const fileResponse = await fetch(attachment.file_url);
    if (!fileResponse.ok) {
      return Response.json({ error: 'Não foi possível baixar o arquivo original' }, { status: 400 });
    }

    const fileBlob = await fileResponse.blob();

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
        body: formData
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
      backup_date: backupDate
    });

    return Response.json({
      success: true,
      attachment_id,
      drive_file_id: result.id,
      drive_link: `https://drive.google.com/file/d/${result.id}/view`,
      backup_date: backupDate,
      folder: isPhoto ? `Fotos/${uploaderName}` : `Documentos/Anexos/${uploaderName}`
    });
  } catch (error: any) {
    console.error('Erro no backup do arquivo:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
