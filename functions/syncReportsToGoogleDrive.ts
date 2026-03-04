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

    // Process each report
    for (const report of reports) {
      if (!report.id || !report.author_name) continue;

      // Create folder for report
      const reportFolderName = `${report.mes_referencia} ${report.ano} - ${report.author_name} (${report.status})`;
      const reportFolderId = await createOrGetFolder(accessToken, reportFolderName, mainFolderId);

      // Find attachments for this report
      const reportAttachments = Array.isArray(attachments)
        ? attachments.filter(att => att.report_id === report.id)
        : [];

      // Upload attachments
      for (const attachment of reportAttachments) {
        if (!attachment.file_url) continue;

        try {
          // Fetch file from URL
          const fileResponse = await fetch(attachment.file_url);
          if (!fileResponse.ok) continue;

          const fileBuffer = await fileResponse.arrayBuffer();
          const fileName = attachment.file_name || `attachment_${Date.now()}`;

          await uploadFile(accessToken, fileName, fileBuffer, reportFolderId);
          syncedCount++;
        } catch (fileErr) {
          console.error(`Error uploading ${attachment.file_name}:`, fileErr.message);
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