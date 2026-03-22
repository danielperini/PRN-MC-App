import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta oficial de Contratos
const CONTRATOS_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

function sanitizeName(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/[\/\\:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFileSafeName(value: unknown): string {
  return sanitizeName(value).replace(/\s+/g, '_');
}

async function findFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  }
  return data.id;
}

async function getOrCreateFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const existing = await findFolder(accessToken, folderName, parentFolderId);
  return existing || (await createFolder(accessToken, folderName, parentFolderId));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { file_url, member_name, member_id } = payload || {};

    if (!file_url || !member_name) {
      return Response.json(
        { error: 'Faltam dados obrigatórios: file_url e member_name' },
        { status: 400 }
      );
    }

    let accessToken = '';
    try {
      const connection = await base44.asServiceRole.connectors.getConnection('googledrive');
      accessToken = connection?.accessToken || '';
    } catch (e) {
      return Response.json(
        { error: 'Conexão com Google Drive não disponível' },
        { status: 500 }
      );
    }

    if (!accessToken) {
      return Response.json(
        { error: 'Token do Google Drive não encontrado' },
        { status: 500 }
      );
    }

    const cleanMemberName = sanitizeName(member_name) || 'Sem_Nome';
    const memberFolderName = cleanMemberName;
    const memberFolderId = await getOrCreateFolder(
      accessToken,
      memberFolderName,
      CONTRATOS_FOLDER_ID
    );

    const today = new Date().toISOString().split('T')[0];
    const fileName = `Contrato_${buildFileSafeName(cleanMemberName)}_${today}.pdf`;

    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      return Response.json(
        { error: 'Erro ao obter arquivo de origem' },
        { status: 400 }
      );
    }

    const fileBlob = await fileResponse.blob();

    const formData = new FormData();
    formData.append(
      'metadata',
      new Blob(
        [
          JSON.stringify({
            name: fileName,
            parents: [memberFolderId],
          }),
        ],
        { type: 'application/json' }
      )
    );
    formData.append('file', fileBlob, fileName);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );

    const driveFile = await uploadRes.json();

    if (!uploadRes.ok || driveFile.error) {
      throw new Error(
        'Erro ao salvar no Drive: ' + (driveFile?.error?.message || 'falha desconhecida')
      );
    }

    const driveLink =
      driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`;

    if (member_id) {
      try {
        await base44.asServiceRole.entities.TeamMember.update(member_id, {
          contrato_url: driveLink,
          contract_url: driveLink,
          contract_file_name: fileName,
          contract_drive_file_id: driveFile.id,
          contract_last_upload_at: new Date().toISOString(),
        });
      } catch (e: any) {
        console.warn('Aviso ao atualizar TeamMember:', e?.message || e);
      }
    }

    return Response.json({
      success: true,
      message: `Contrato salvo em Contratos/${memberFolderName}`,
      driveFileId: driveFile.id,
      driveFileName: driveFile.name || fileName,
      driveLink,
      folderId: memberFolderId,
      folderName: memberFolderName,
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
});
