import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function createOrGetFolder(accessToken, folderName, parentFolderId = null) {
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&pageSize=1&fields=files(id,name)`;

  const searchResponse = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const searchData = await searchResponse.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  const createdFolder = await createResponse.json();
  return createdFolder.id;
}

async function uploadFile(accessToken, fileName, fileContent, parentFolderId) {
  const metadata = {
    name: fileName,
    parents: [parentFolderId]
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', new Blob([fileContent], { type: 'application/octet-stream' }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: formData
  });

  return response.json();
}

async function checkDuplicate(accessToken, fileName, fileSize, parentFolderId) {
  const query = `name='${fileName.replace(/'/g, "\\'")}' and parents='${parentFolderId}' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name,size)&pageSize=10`;

  const response = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const data = await response.json();
  return data.files && data.files.some(f => f.size === fileSize);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all reports and attachments
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 500);
    const attachments = await base44.asServiceRole.entities.Attachment.list('-created_date', 5000);

    if (!Array.isArray(reports)) {
      return Response.json({ error: 'Failed to fetch reports' }, { status: 500 });
    }

    // Get Google Drive access
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Create main folder
    const mainFolderId = await createOrGetFolder(accessToken, 'Gestor Relatórios MC2026');

    let syncedCount = 0;

    // Group reports by museum
    const reportsByMuseum = {};
    for (const report of reports) {
      if (!report.id || !report.author_name) continue;
      const museu = report.museu || 'Sem Museu';
      if (!reportsByMuseum[museu]) {
        reportsByMuseum[museu] = [];
      }
      reportsByMuseum[museu].push(report);
    }

    // Process each museum folder
    for (const [museu, museumReports] of Object.entries(reportsByMuseum)) {
      // Create museum folder
      const museumFolderId = await createOrGetFolder(accessToken, museu, mainFolderId);

      // Process reports in this museum
      for (const report of museumReports) {
        // Create folder for report
        const reportFolderName = `${report.mes_referencia} ${report.ano} - ${report.author_name} (${report.status})`;
        const reportFolderId = await createOrGetFolder(accessToken, reportFolderName, museumFolderId);

      // Find attachments for this report
      const reportAttachments = Array.isArray(attachments)
        ? attachments.filter(att => att.report_id === report.id)
        : [];

      // Organize by file type
      const imageAttachments = reportAttachments.filter(att => 
        att.file_type && /^image\/(jpeg|jpg|png|gif|webp)$/i.test(att.file_type)
      );
      const videoAttachments = reportAttachments.filter(att => 
        att.file_type && /^video\/(mp4|mpeg|quicktime|x-msvideo|webm)$/i.test(att.file_type)
      );
      const otherAttachments = reportAttachments.filter(att =>
        !imageAttachments.includes(att) && !videoAttachments.includes(att)
      );

      // Create subfolders for media
      let imagesFolderId = null;
      let videosFolderId = null;

      if (imageAttachments.length > 0) {
        imagesFolderId = await createOrGetFolder(accessToken, 'Fotos', reportFolderId);
      }
      if (videoAttachments.length > 0) {
        videosFolderId = await createOrGetFolder(accessToken, 'Vídeos', reportFolderId);
      }

      // Upload images
      for (const attachment of imageAttachments) {
        if (!attachment.file_url) continue;
        try {
          const fileResponse = await fetch(attachment.file_url);
          if (!fileResponse.ok) continue;

          const fileBuffer = await fileResponse.arrayBuffer();
          const fileName = attachment.file_name || `image_${Date.now()}`;
          
          const isDuplicate = await checkDuplicate(accessToken, fileName, fileBuffer.byteLength, imagesFolderId);
          if (!isDuplicate) {
            await uploadFile(accessToken, fileName, fileBuffer, imagesFolderId);
            syncedCount++;
          }
        } catch (fileErr) {
          console.error(`Error uploading image ${attachment.file_name}:`, fileErr.message);
        }
      }

      // Upload videos
      for (const attachment of videoAttachments) {
        if (!attachment.file_url) continue;
        try {
          const fileResponse = await fetch(attachment.file_url);
          if (!fileResponse.ok) continue;

          const fileBuffer = await fileResponse.arrayBuffer();
          const fileName = attachment.file_name || `video_${Date.now()}`;
          
          const isDuplicate = await checkDuplicate(accessToken, fileName, fileBuffer.byteLength, videosFolderId);
          if (!isDuplicate) {
            await uploadFile(accessToken, fileName, fileBuffer, videosFolderId);
            syncedCount++;
          }
        } catch (fileErr) {
          console.error(`Error uploading video ${attachment.file_name}:`, fileErr.message);
        }
      }

      // Upload other attachments
      for (const attachment of otherAttachments) {
        if (!attachment.file_url) continue;
        try {
          const fileResponse = await fetch(attachment.file_url);
          if (!fileResponse.ok) continue;

          const fileBuffer = await fileResponse.arrayBuffer();
          const fileName = attachment.file_name || `attachment_${Date.now()}`;
          
          const isDuplicate = await checkDuplicate(accessToken, fileName, fileBuffer.byteLength, reportFolderId);
          if (!isDuplicate) {
            await uploadFile(accessToken, fileName, fileBuffer, reportFolderId);
            syncedCount++;
          }
        } catch (fileErr) {
          console.error(`Error uploading attachment ${attachment.file_name}:`, fileErr.message);
        }
      }

      // Create report summary file
      const reportSummary = {
        numero_protocolo: report.numero_protocolo,
        author_name: report.author_name,
        museu: report.museu,
        equipe: report.equipe,
        mes_referencia: report.mes_referencia,
        ano: report.ano,
        status: report.status,
        created_date: report.created_date,
        updated_date: report.updated_date,
        resumo_executivo: report.resumo_executivo,
        total_atividades: Array.isArray(report.atividades) ? report.atividades.length : 0,
        total_oportunidades: Array.isArray(report.oportunidades) ? report.oportunidades.length : 0
      };

      const summaryJson = JSON.stringify(reportSummary, null, 2);
      await uploadFile(accessToken, `_resumo_${report.numero_protocolo || report.id}.json`, summaryJson, reportFolderId);
      }
    }

    return Response.json({
      success: true,
      message: 'Sincronização concluída com sucesso',
      details: {
        main_folder: 'Gestor Relatórios MC2026',
        total_reports_processed: reports.length,
        total_files_synced: syncedCount,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Erro ao sincronizar com Google Drive'
    }, { status: 500 });
  }
});