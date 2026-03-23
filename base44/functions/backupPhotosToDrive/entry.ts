import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta de Fotos — organizada por usuário
const FOTOS_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';

async function findFolder(accessToken, folderName, parentFolderId) {
  const q = encodeURIComponent(`name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentFolderId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta: ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  return await findFolder(accessToken, folderName, parentFolderId) || await createFolder(accessToken, folderName, parentFolderId);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // Pode receber { file_url, file_name, user_name } para upload avulso
    // ou sem body para backup geral (admin)
    const { file_url, file_name, user_name } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Upload avulso de uma foto
    if (file_url && file_name) {
      const uploaderName = (user_name || user.full_name || user.email).replace(/[\/\\:*?"<>|]/g, '_');
      const userFolderId = await getOrCreateFolder(accessToken, uploaderName, FOTOS_FOLDER_ID);

      const fileResponse = await fetch(file_url);
      if (!fileResponse.ok) return Response.json({ error: 'Erro ao obter arquivo' }, { status: 400 });
      const fileBlob = await fileResponse.blob();

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify({ name: file_name, parents: [userFolderId] })], { type: 'application/json' }));
      formData.append('file', fileBlob, file_name);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      const result = await uploadRes.json();
      if (result.error) throw new Error('Erro upload: ' + result.error.message);

      return Response.json({
        success: true,
        message: `Foto salva em Fotos/${uploaderName}`,
        file_id: result.id,
        drive_link: `https://drive.google.com/file/d/${result.id}/view`
      });
    }

    // Backup geral (somente admin): varrer todos os Attachments de fotos
    const isAdmin = ['admin', 'COORDENADOR'].includes(user.role);
    if (!isAdmin) return Response.json({ error: 'Apenas admins podem executar backup geral de fotos' }, { status: 403 });

    const attachments = await base44.asServiceRole.entities.Attachment.list('-created_date', 3000);
    const photos = attachments.filter(a => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_name || '') || /^image\//i.test(a.file_type || ''));

    // Buscar reports para mapear usuário
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 1000);
    const reportMap = {};
    reports.forEach(r => { reportMap[r.id] = r; });

    let uploaded = 0;
    const errors = [];

    for (const photo of photos) {
      if (!photo.file_url) continue;
      try {
        const report = reportMap[photo.report_id];
        const uploaderName = (report?.author_name || photo.created_by || 'Sem Usuario').replace(/[\/\\:*?"<>|]/g, '_');
        const userFolderId = await getOrCreateFolder(accessToken, uploaderName, FOTOS_FOLDER_ID);

        const fileResponse = await fetch(photo.file_url);
        if (!fileResponse.ok) continue;
        const fileBlob = await fileResponse.blob();

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify({ name: photo.file_name || `foto_${photo.id}.jpg`, parents: [userFolderId] })], { type: 'application/json' }));
        formData.append('file', fileBlob, photo.file_name || `foto_${photo.id}.jpg`);

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData
        });
        uploaded++;
      } catch (e) {
        errors.push(`${photo.file_name}: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      message: `Backup de fotos concluído`,
      fotos_enviadas: uploaded,
      erros: errors.length > 0 ? errors.slice(0, 10) : null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});