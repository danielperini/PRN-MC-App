import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

// Cria pasta no Google Drive
async function createFolder(accessToken, folderName, parentFolderId) {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(`Erro ao criar pasta: ${data.error.message}`);
  return data.id;
}

// Busca pasta existente
async function findFolder(accessToken, folderName, parentFolderId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  return data.files?.length > 0 ? data.files[0].id : null;
}

// Upload de arquivo genérico
async function uploadFile(accessToken, fileName, fileContent, mimeType, parentFolderId) {
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
    `Content-Type: ${mimeType}\r\n\r\n` +
    fileContent +
    closeDelimiter;
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
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
    
    const { report_id, pdf_content, file_name } = await req.json();
    
    if (!report_id || !pdf_content) {
      return Response.json({ error: 'report_id e pdf_content são obrigatórios' }, { status: 400 });
    }
    
    // Buscar dados do relatório
    const report = await base44.entities.Report.get(report_id);
    if (!report) {
      return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });
    }
    
    // Obter conexão do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    // Estrutura de pastas: Documentos Exportados > Ano > Mês > Usuário
    let docExportFolderId = await findFolder(accessToken, 'Documentos Exportados', ROOT_FOLDER_ID);
    if (!docExportFolderId) {
      docExportFolderId = await createFolder(accessToken, 'Documentos Exportados', ROOT_FOLDER_ID);
    }
    
    // Criar pasta do ano
    const ano = report.ano || new Date().getFullYear();
    const anoStr = ano.toString();
    let anoFolderId = await findFolder(accessToken, anoStr, docExportFolderId);
    if (!anoFolderId) {
      anoFolderId = await createFolder(accessToken, anoStr, docExportFolderId);
    }
    
    // Criar pasta do mês
    const mesMap = {
      'Janeiro': '01', 'Fevereiro': '02', 'Março': '03', 'Abril': '04',
      'Maio': '05', 'Junho': '06', 'Julho': '07', 'Agosto': '08',
      'Setembro': '09', 'Outubro': '10', 'Novembro': '11', 'Dezembro': '12'
    };
    const mesNum = mesMap[report.mes_referencia] || '00';
    const mesLabel = `${mesNum} - ${report.mes_referencia}`;
    
    let mesFolderId = await findFolder(accessToken, mesLabel, anoFolderId);
    if (!mesFolderId) {
      mesFolderId = await createFolder(accessToken, mesLabel, anoFolderId);
    }
    
    // Criar pasta do usuário
    const userName = report.author_name?.replace(/[\/\\:*?"<>|]/g, '_') || 'usuario';
    let userFolderId = await findFolder(accessToken, userName, mesFolderId);
    if (!userFolderId) {
      userFolderId = await createFolder(accessToken, userName, mesFolderId);
    }
    
    // Upload do PDF do relatório
    const pdfFileName = file_name || `${report.numero_protocolo || 'relatorio'}.pdf`;
    const uploadResult = await uploadFile(
      accessToken,
      pdfFileName,
      pdf_content,
      'application/pdf',
      userFolderId
    );
    
    if (uploadResult.error) {
      throw new Error(`Erro ao fazer upload do PDF: ${uploadResult.error.message}`);
    }
    
    // Criar subpasta para Anexos
    let anexosFolderId = await findFolder(accessToken, 'Anexos', userFolderId);
    if (!anexosFolderId) {
      anexosFolderId = await createFolder(accessToken, 'Anexos', userFolderId);
    }
    
    // Criar subpasta para Fotos
    let fotosFolderId = await findFolder(accessToken, 'Fotos', userFolderId);
    if (!fotosFolderId) {
      fotosFolderId = await createFolder(accessToken, 'Fotos', userFolderId);
    }
    
    // Buscar atividades do relatório para anexos
    const activities = await base44.entities.Activity.filter({ report_id }, '-created_date', 100);
    let attachmentsCount = 0;
    let fotosCount = 0;
    
    // Processar attachments
    const allAttachments = await base44.entities.Attachment.list('-created_date', 1000);
    const reportAttachments = allAttachments.filter(a => a.report_id === report_id);
    
    for (const attachment of reportAttachments) {
      try {
        if (attachment.file_url) {
          // Fetch do arquivo
          const fileResponse = await fetch(attachment.file_url);
          if (fileResponse.ok) {
            const fileBuffer = await fileResponse.arrayBuffer();
            const fileContent = new TextDecoder().decode(fileBuffer);
            
            // Determinar se é foto ou documento
            const isFoto = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.file_name);
            const targetFolderId = isFoto ? fotosFolderId : anexosFolderId;
            
            const mimeType = isFoto ? 'image/jpeg' : attachment.file_type || 'application/octet-stream';
            
            await uploadFile(
              accessToken,
              attachment.file_name,
              fileContent,
              mimeType,
              targetFolderId
            );
            
            if (isFoto) fotosCount++;
            else attachmentsCount++;
          }
        }
      } catch (err) {
        console.warn(`Erro ao fazer upload de ${attachment.file_name}:`, err.message);
      }
    }
    
    return Response.json({
      success: true,
      message: 'Relatório exportado organizado no Drive com sucesso',
      report_id,
      file_uploaded: pdfFileName,
      attachments_count: attachmentsCount,
      fotos_count: fotosCount,
      drive_path: `Documentos Exportados/${anoStr}/${mesLabel}/${userName}`,
      drive_folder_id: userFolderId
    });
    
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    return Response.json({
      error: error.message || 'Erro ao fazer upload do relatório'
    }, { status: 500 });
  }
});