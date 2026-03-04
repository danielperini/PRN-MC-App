import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Cria pasta de data no Google Drive (limitado ao escopo drive.file)
async function createDateFolder(accessToken, parentFolderId, folderName) {
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
  if (created.error) {
    throw new Error(`Erro ao criar pasta: ${created.error.message}`);
  }
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
    
    // Verificar se é coordenador
    const isCoordinator = ['admin', 'COORDENADOR', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA', 'COORD_COMUNICACAO'].includes(user.role);
    
    let userReports, userActivities, userAttachments;
    
    if (isCoordinator) {
      // Coordenador faz backup de TUDO
      userReports = await base44.asServiceRole.entities.Report.list('-updated_date', 1000);
      userActivities = await base44.asServiceRole.entities.Activity.list('-updated_date', 1000);
      userAttachments = await base44.asServiceRole.entities.Attachment.list('-updated_date', 1000);
    } else {
      // Usuário comum faz backup apenas dos seus arquivos
      const userEmail = user.email;
      userReports = await base44.entities.Report.filter({ created_by: userEmail }, '-updated_date', 500);
      const reportIds = userReports.map(r => r.id);
      
      const allActivities = await base44.entities.Activity.list('-updated_date', 500);
      userActivities = allActivities.filter(a => reportIds.includes(a.report_id));
      
      const allAttachments = await base44.entities.Attachment.list('-updated_date', 500);
      userAttachments = allAttachments.filter(a => reportIds.includes(a.report_id));
    }
    
    // Usar pasta específica do Google Drive fornecida
    const customFolderId = '1AsUJJqUv2O-NTGFAxIY5QySu_U8KQ094';
    
    // Pasta por data dentro da pasta customizada
    const now = new Date();
    const dateFolder = now.toISOString().split('T')[0];
    let dateFolderId;
    try {
      dateFolderId = await createDateFolder(accessToken, customFolderId, dateFolder);
    } catch (err) {
      console.warn('Aviso ao criar pasta:', err.message);
      dateFolderId = customFolderId; // Usar pasta pai se não conseguir criar subpasta
    }
    
    // Salvar arquivos
    const timestamp = now.toISOString();
    const backupData = {
      timestamp,
      backupType: isCoordinator ? 'completo' : 'usuario',
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