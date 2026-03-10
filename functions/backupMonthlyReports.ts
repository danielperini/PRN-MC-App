import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const BACKUP_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini.mc@viadutodasartes.org.br'];

async function createBackupFolder(accessToken, folderName) {
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

async function uploadFileToDrive(accessToken, fileBuffer, folderId, fileName) {
  const boundary = '===============7330845974216740156==';
  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  // Converter ArrayBuffer para base64
  const byteArray = new Uint8Array(fileBuffer);
  let binaryString = '';
  for (let i = 0; i < byteArray.length; i++) {
    binaryString += String.fromCharCode(byteArray[i]);
  }

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
      body: body
    }
  );

  return response.ok ? (await response.json()).id : null;
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

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    if (!accessToken) {
      await logBackupExecution(base44, {
        backup_type: 'reports',
        status: 'failure',
        error_message: 'Google Drive não autorizado',
        execution_time_ms: Date.now() - startTime,
        triggered_by: 'manual'
      });
      return Response.json({ error: 'Google Drive não autorizado' }, { status: 403 });
    }

    // Buscar relatórios do mês atual
    const now = new Date();
    const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const monthFormatted = String(now.getMonth() + 1).padStart(2, '0');
    const yearFormatted = now.getFullYear();

    const reports = await base44.entities.Report.filter({
      ano: yearFormatted,
      mes_referencia: monthName.split(' ')[0] // Pega apenas o mês
    });

    if (reports.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhum relatório encontrado para este mês',
        reportsFound: 0,
        totalFilesCopied: 0
      });
    }

    // Criar pasta principal de backup com data
    const backupDate = now.toISOString().split('T')[0];
    const mainFolderName = `Backup ${backupDate}`;
    const mainFolderId = await createBackupFolder(accessToken, mainFolderName);

    if (!mainFolderId) {
      await logBackupExecution(base44, {
        backup_type: 'reports',
        status: 'failure',
        error_message: 'Falha ao criar pasta principal de backup',
        execution_time_ms: Date.now() - startTime,
        triggered_by: 'manual'
      });
      return Response.json({ error: 'Falha ao criar pasta de backup' }, { status: 500 });
    }

    // Compartilhar pasta principal
    const sharePromises = BACKUP_EMAILS.map(email => shareFolder(mainFolderId, email, accessToken));
    await Promise.all(sharePromises);

    let totalFilesCopied = 0;
    const reportsList = [];

    // Processar cada relatório
    for (const report of reports) {
      const reportFolderName = `${report.author_name}_${report.numero_protocolo || 'SEM-NUMERO'}`;
      const reportFolderId = await createBackupFolder(accessToken, reportFolderName);

      if (reportFolderId) {
        // Buscar attachments do relatório
        const attachments = await base44.entities.Attachment.filter({
          report_id: report.id
        });

        for (const attachment of attachments) {
          // Copiar arquivo para a pasta do relatório
          try {
            const fileResponse = await fetch(attachment.file_url);
            if (fileResponse.ok) {
              const fileContent = await fileResponse.arrayBuffer();
              const fileId = await uploadFileToDrive(
                accessToken,
                fileContent,
                reportFolderId,
                attachment.file_name
              );

              if (fileId) {
                totalFilesCopied++;
              }
            }
          } catch (error) {
            console.error(`Erro ao copiar arquivo ${attachment.file_name}:`, error.message);
          }
        }

        reportsList.push({
          author: report.author_name,
          protocol: report.numero_protocolo,
          filesCount: attachments.length
        });
      }
    }

    await logBackupExecution(base44, {
      backup_type: 'reports',
      status: 'success',
      total_files: reports.reduce((sum, r) => {
        // Contar attachments
        return sum + (r.atividades?.length || 0);
      }, 0),
      files_copied: totalFilesCopied,
      backup_folder_id: mainFolderId,
      execution_time_ms: Date.now() - startTime,
      triggered_by: 'manual',
      shared_emails: BACKUP_EMAILS
    });

    return Response.json({
      success: true,
      backupFolderId: mainFolderId,
      backupFolderName: mainFolderName,
      reportsFound: reports.length,
      totalFilesCopied,
      sharedWith: BACKUP_EMAILS,
      reportsList,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      await logBackupExecution(base44, {
        backup_type: 'reports',
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