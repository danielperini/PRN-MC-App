import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Cria ou obtém pasta de data no Google Drive
async function getOrCreateDateFolder(accessToken, parentFolderId, folderName) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json();
  
  if (result.files && result.files.length > 0) {
    return result.files[0].id;
  }
  
  // Criar nova pasta
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
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
  
  const created = await createResponse.json();
  return created.id;
}

// Obtém pasta raiz de Backup
async function getOrCreateBackupRoot(accessToken) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='Relatórios Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json();
  
  if (result.files && result.files.length > 0) {
    return result.files[0].id;
  }
  
  // Criar pasta raiz
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Relatórios Backup',
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  
  const created = await createResponse.json();
  return created.id;
}

// Faz upload de arquivo para Google Drive
async function uploadToGoogleDrive(accessToken, fileName, fileContent, parentFolderId) {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const metadata = {
    name: fileName,
    parents: [parentFolderId]
  };
  
  const multipartBody = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });
  
  return await response.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Obter conexão do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    // Obter dados para backup - apenas do usuário logado
    const userEmail = user.email;
    const userReports = await base44.entities.Report.filter({ created_by: userEmail }, '-updated_date', 500);
    const reportIds = userReports.map(r => r.id);
    
    // Atividades relacionadas aos relatórios do usuário
    const allActivities = await base44.entities.Activity.list('-updated_date', 500);
    const userActivities = allActivities.filter(a => reportIds.includes(a.report_id));
    
    // Anexos relacionados aos relatórios do usuário
    const allAttachments = await base44.entities.Attachment.list('-updated_date', 500);
    const userAttachments = allAttachments.filter(a => reportIds.includes(a.report_id));
    
    // Criar estrutura de pastas
    const backupRootId = await getOrCreateBackupRoot(accessToken);
    
    // Pasta por data
    const now = new Date();
    const dateFolder = now.toISOString().split('T')[0];
    const dateFolderId = await getOrCreateDateFolder(accessToken, backupRootId, dateFolder);
    
    // Salvar arquivos
    const timestamp = now.toISOString();
    const backupData = {
      timestamp,
      userEmail,
      reports: Array.isArray(userReports) ? userReports : [],
      activities: Array.isArray(userActivities) ? userActivities : [],
      attachments: Array.isArray(userAttachments) ? userAttachments : []
    };
    
    await uploadToGoogleDrive(
      accessToken,
      `backup-${timestamp.replace(/[:.]/g, '-')}.json`,
      JSON.stringify(backupData, null, 2),
      dateFolderId
    );
    
    return Response.json({
      success: true,
      message: 'Backup realizado com sucesso',
      timestamp,
      reportsCount: backupData.reports.length,
      activitiesCount: backupData.activities.length,
      attachmentsCount: backupData.attachments.length
    });
  } catch (error) {
    console.error('Erro ao fazer backup:', error);
    return Response.json({
      error: error.message || 'Erro ao realizar backup'
    }, { status: 500 });
  }
});