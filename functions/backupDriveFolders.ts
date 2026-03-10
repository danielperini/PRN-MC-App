import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const FOLDER_STRUCTURE = {
  relatorios_pdf: '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ',
  financeiro: '1KqVGVQDQPD6GSXpLxi4APaG8LWBTYy98',
  notas_fiscais: '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9',
  fotos: '1JIQOY1eY29Qt-iUFgivfioaSoaFXGFJy',
  documentos: '1psLJvyj6sNuO7kscJIjrCsINgRBTQq_1',
  contratos: '1nvzu_2j0GdXUFGgdN-nLr3e62lOJ_I_J',
  orcamentos: '1PBrZeacJrNOAKVfBD8nqd6aiqMm9BIkH',
  prestacao_contas: '1pCyiuR2u8sy0VZK3-huBWeUJowQkJxbm'
};

const BACKUP_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini.mc@viadutodasartes.org.br'];

async function listFolderContents(folderId, accessToken) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&fields=*&pageSize=1000`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  if (!response.ok) return [];
  const data = await response.json();
  return data.files || [];
}

async function copyFile(fileId, fileName, targetFolderId, accessToken) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `[BACKUP ${new Date().toISOString().split('T')[0]}] ${fileName}`,
        parents: [targetFolderId]
      })
    }
  );

  return response.ok ? await response.json() : null;
}

async function createBackupFolder(accessToken) {
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Backup ${new Date().toISOString().split('T')[0]}`,
        mimeType: 'application/vnd.google-apps.folder'
      })
    }
  );

  return response.ok ? (await response.json()).id : null;
}

async function shareFolder(folderId, email, accessToken) {
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'owner',
        type: 'user',
        emailAddress: email
      })
    }
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    if (!accessToken) {
      return Response.json({ error: 'Google Drive não autorizado' }, { status: 403 });
    }

    const backupFolderId = await createBackupFolder(accessToken);
    if (!backupFolderId) {
      return Response.json({ error: 'Falha ao criar pasta de backup' }, { status: 500 });
    }

    for (const email of BACKUP_EMAILS) {
      await shareFolder(backupFolderId, email, accessToken);
    }

    const backupResults = {};
    let totalFilesCopied = 0;

    for (const [folderKey, folderId] of Object.entries(FOLDER_STRUCTURE)) {
      const files = await listFolderContents(folderId, accessToken);
      backupResults[folderKey] = { filesCount: files.length, filesCopied: 0 };

      for (const file of files) {
        if (file.mimeType !== 'application/vnd.google-apps.folder') {
          const copied = await copyFile(file.id, file.name, backupFolderId, accessToken);
          if (copied) {
            backupResults[folderKey].filesCopied++;
            totalFilesCopied++;
          }
        }
      }
    }

    return Response.json({
      success: true,
      totalFilesCopied,
      sharedWith: BACKUP_EMAILS,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});