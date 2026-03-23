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

async function copyFile(fileId, fileName, targetFolderId, accessToken, customName = null) {
   const response = await fetch(
     `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`,
     {
       method: 'POST',
       headers: {
         Authorization: `Bearer ${accessToken}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         name: customName || `[BACKUP ${new Date().toISOString().split('T')[0]}] ${fileName}`,
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
   try {
     const response = await fetch(
       `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true`,
       {
         method: 'POST',
         headers: {
           Authorization: `Bearer ${accessToken}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           role: 'editor',
           type: 'user',
           emailAddress: email
         })
       }
     );

     return response.ok;
   } catch (error) {
     console.error(`Erro ao compartilhar com ${email}:`, error.message);
     return false;
   }
}

async function logBackupExecution(base44, backupData) {
  try {
    await base44.entities.BackupLog.create(backupData);
  } catch (error) {
    console.error('Erro ao registrar backup no histórico:', error.message);
  }
}

Deno.serve(async (req) => {
   const startTime = Date.now();
   try {
     const base44 = createClientFromRequest(req);
     const user = await base44.auth.me();

     if (!user) {
       return Response.json({ error: 'Unauthorized' }, { status: 401 });
     }

     const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
     if (!accessToken) {
       await logBackupExecution(base44, {
         backup_type: 'drive_folders',
         status: 'failure',
         error_message: 'Google Drive não autorizado',
         execution_time_ms: Date.now() - startTime,
         triggered_by: 'manual'
       });
       return Response.json({ error: 'Google Drive não autorizado' }, { status: 403 });
     }

    const backupFolderId = await createBackupFolder(accessToken);
    if (!backupFolderId) {
      await logBackupExecution(base44, {
        backup_type: 'drive_folders',
        status: 'failure',
        error_message: 'Falha ao criar pasta de backup',
        execution_time_ms: Date.now() - startTime,
        triggered_by: 'manual'
      });
      return Response.json({ error: 'Falha ao criar pasta de backup' }, { status: 500 });
    }

    // Compartilhar pasta de backup (não-bloqueante)
    const sharePromises = BACKUP_EMAILS.map(email => shareFolder(backupFolderId, email, accessToken));
    await Promise.all(sharePromises);

    const backupResults = {};
    let totalFilesCopied = 0;
    const sharedFolders = [];
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const sequenceCounter = {};

    for (const [folderKey, folderId] of Object.entries(FOLDER_STRUCTURE)) {
      const files = await listFolderContents(folderId, accessToken);
      backupResults[folderKey] = { filesCount: files.length, filesCopied: 0 };
      sequenceCounter[folderKey] = 0;

      for (const file of files) {
        if (file.mimeType !== 'application/vnd.google-apps.folder') {
          sequenceCounter[folderKey]++;
          const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
          const customName = `${folderKey}-${month}${year}-${String(sequenceCounter[folderKey]).padStart(3, '0')}${ext}`;

          const copied = await copyFile(file.id, file.name, backupFolderId, accessToken, customName);
          if (copied) {
            backupResults[folderKey].filesCopied++;
            totalFilesCopied++;
          }
        }
      }

      if (backupResults[folderKey].filesCopied > 0) {
        sharedFolders.push(folderKey);
      }
    }

    await logBackupExecution(base44, {
      backup_type: 'drive_folders',
      status: 'success',
      total_files: Object.values(backupResults).reduce((sum, r) => sum + r.filesCount, 0),
      files_copied: totalFilesCopied,
      backup_folder_id: backupFolderId,
      execution_time_ms: Date.now() - startTime,
      triggered_by: 'manual',
      shared_emails: BACKUP_EMAILS
    });

    return Response.json({
      success: true,
      totalFilesCopied,
      backupFolderId,
      sharedWith: BACKUP_EMAILS,
      foldersProcessed: Object.keys(FOLDER_STRUCTURE),
      foldersWithFiles: sharedFolders,
      timestamp: new Date().toISOString()
    });
    } catch (error) {
    try {
      await logBackupExecution(base44, {
        backup_type: 'drive_folders',
        status: 'failure',
        error_message: error.message,
        execution_time_ms: Date.now() - startTime,
        triggered_by: 'manual'
      });
    } catch (logError) {
      console.error('Erro ao registrar falha:', logError.message);
    }
    return Response.json({ error: error.message }, { status: 500 });
    }
    });