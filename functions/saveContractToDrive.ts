import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta oficial de Contratos
const CONTRATOS_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

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
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  const existing = await findFolder(accessToken, folderName, parentFolderId);
  return existing || await createFolder(accessToken, folderName, parentFolderId);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, member_name, member_id } = await req.json();
    if (!file_url || !member_name) return Response.json({ error: 'Faltam dados obrigatórios' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Pasta: Contratos (raiz) → subpasta por membro
    const memberFolderName = member_name.replace(/[\/\\:*?"<>|]/g, '_');
    const memberFolderId = await getOrCreateFolder(accessToken, memberFolderName, CONTRATOS_FOLDER_ID);

    const fileName = `Contrato_${member_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) return Response.json({ error: 'Erro ao obter arquivo' }, { status: 400 });

    const fileBlob = await fileResponse.blob();
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [memberFolderId] })], { type: 'application/json' }));
    formData.append('file', fileBlob, fileName);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData
    });

    const driveFile = await uploadRes.json();
    if (driveFile.error) throw new Error('Erro ao salvar no Drive: ' + driveFile.error.message);

    if (member_id) {
      await base44.asServiceRole.entities.TeamMember.update(member_id, {
        contrato_url: `https://drive.google.com/file/d/${driveFile.id}/view`
      }).catch(e => console.warn('Aviso ao atualizar TeamMember:', e.message));
    }

    return Response.json({
      success: true,
      message: 'Contrato salvo em Contratos/' + memberFolderName,
      driveFileId: driveFile.id,
      driveLink: `https://drive.google.com/file/d/${driveFile.id}/view`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});