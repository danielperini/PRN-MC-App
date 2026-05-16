import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const BACKUP_ROOT_FOLDER_ID = '1Klyy1CKsbAzY-BJwGLrgdgbXbjn0hhjO';
const BACKUP_EMAILS = ['danielperini.mc@viadutodasartes.org.br', 'notasfiscais@viadutodasartes.org.br'];

async function findFolder(accessToken, parentId, folderName) {
  const query = [
    `name = '${String(folderName).replace(/'/g, "\\'")}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `'${parentId}' in parents`,
    `trashed = false`,
  ].join(' and ');

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return null;
  const data = await response.json();
  return data?.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentId) {
  const existing = await findFolder(accessToken, parentId, folderName);
  if (existing) return existing;

  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    }
  );

  return response.ok ? (await response.json()).id : null;
}

async function ensurePath(accessToken, rootFolderId, parts) {
  let current = rootFolderId;
  for (const part of parts.filter(Boolean)) {
    const next = await createFolder(accessToken, part, current);
    if (!next) throw new Error(`Falha ao criar/localizar pasta: ${part}`);
    current = next;
  }
  return current;
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
          role: 'writer',
          type: 'user',
          emailAddress: email
        })
      }
    );

    return response.ok || response.status === 409;
  } catch (error) {
    console.error(`Erro ao compartilhar com ${email}:`, error.message);
    return false;
  }
}

async function findFile(accessToken, parentId, fileName) {
  const query = [
    `name = '${String(fileName).replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    `trashed = false`,
  ].join(' and ');

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return null;
  const data = await response.json();
  return data?.files?.[0]?.id || null;
}

async function uploadFileToDrive(accessToken, fileBuffer, folderId, fileName) {
  const existing = await findFile(accessToken, folderId, fileName);
  if (existing) return { id: existing, skipped: true };

  const boundary = '===============7330845974216740156==';
  const metadata = { name: fileName, parents: [folderId] };

  const byteArray = new Uint8Array(fileBuffer);
  let binaryString = '';
  for (let i = 0; i < byteArray.length; i++) binaryString += String.fromCharCode(byteArray[i]);

  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n` +
    binaryString +
    `\r\n--${boundary}--`;

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body
    }
  );

  return response.ok ? { id: (await response.json()).id, skipped: false } : null;
}

async function logBackupExecution(base44, backupData) {
  try {
    await base44.entities.BackupLog.create(backupData);
  } catch (error) {
    console.error('Erro ao registrar backup:', error.message);
  }
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    if (!accessToken) {
      await logBackupExecution(base44, {
        backup_type: 'reports_sync',
        status: 'failure',
        error_message: 'Google Drive não autorizado',
        execution_time_ms: Date.now() - startTime,
        triggered_by: 'manual'
      });
      return Response.json({ error: 'Google Drive não autorizado' }, { status: 403 });
    }

    const now = new Date();
    const mesNome = now.toLocaleDateString('pt-BR', { month: 'long' });
    const mesNumero = String(now.getMonth() + 1).padStart(2, '0');
    const ano = now.getFullYear();
    const mesPasta = `${mesNumero}-${mesNome}`;

    const reports = await base44.entities.Report.filter({
      ano,
      mes_referencia: mesNome
    });

    const monthFolderId = await ensurePath(accessToken, BACKUP_ROOT_FOLDER_ID, [String(ano), mesPasta]);
    const relatoriosFolderId = await ensurePath(accessToken, monthFolderId, ['relatorios']);

    await Promise.all(BACKUP_EMAILS.map((email) => shareFolder(BACKUP_ROOT_FOLDER_ID, email, accessToken)));

    if (reports.length === 0) {
      return Response.json({
        success: true,
        mode: 'structured_sync_no_daily_backup',
        message: 'Nenhum relatório encontrado para este mês. Nenhuma pasta diária Backup YYYY-MM-DD foi criada.',
        rootFolderId: BACKUP_ROOT_FOLDER_ID,
        monthFolderId,
        reportsFound: 0,
        totalFilesCopied: 0
      });
    }

    let totalFilesCopied = 0;
    let totalFilesSkipped = 0;
    const reportsList = [];

    for (const report of reports) {
      const safeAuthor = String(report.author_name || report.created_by || 'relatorio').replace(/[\\/:*?"<>|]/g, '-');
      const reportFolderName = `${safeAuthor}_${report.numero_protocolo || report.id || 'SEM-NUMERO'}`;
      const reportFolderId = await ensurePath(accessToken, relatoriosFolderId, [reportFolderName]);

      const attachments = await base44.entities.Attachment.filter({ report_id: report.id }).catch(() => []);

      for (const attachment of attachments) {
        try {
          const fileUrl = attachment.file_url || attachment.url;
          if (!fileUrl) continue;

          const fileResponse = await fetch(fileUrl);
          if (!fileResponse.ok) continue;

          const fileContent = await fileResponse.arrayBuffer();
          const fileName = attachment.file_name || attachment.filename || attachment.nome || `arquivo-${attachment.id || Date.now()}`;
          const result = await uploadFileToDrive(accessToken, fileContent, reportFolderId, fileName);

          if (result?.id && result.skipped) totalFilesSkipped++;
          if (result?.id && !result.skipped) totalFilesCopied++;
        } catch (error) {
          console.error(`Erro ao sincronizar arquivo ${attachment.file_name}:`, error.message);
        }
      }

      reportsList.push({
        author: report.author_name,
        protocol: report.numero_protocolo,
        filesCount: attachments.length,
        folderId: reportFolderId
      });
    }

    await logBackupExecution(base44, {
      backup_type: 'reports_structured_sync',
      status: 'success',
      total_files: totalFilesCopied + totalFilesSkipped,
      files_copied: totalFilesCopied,
      backup_folder_id: monthFolderId,
      execution_time_ms: Date.now() - startTime,
      triggered_by: 'manual',
      shared_emails: BACKUP_EMAILS
    });

    return Response.json({
      success: true,
      mode: 'structured_sync_no_daily_backup',
      message: 'Sincronização estruturada concluída. Nenhuma pasta diária Backup YYYY-MM-DD foi criada.',
      rootFolderId: BACKUP_ROOT_FOLDER_ID,
      monthFolderId,
      reportsFound: reports.length,
      totalFilesCopied,
      totalFilesSkipped,
      sharedWith: BACKUP_EMAILS,
      reportsList,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      await logBackupExecution(base44, {
        backup_type: 'reports_structured_sync',
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