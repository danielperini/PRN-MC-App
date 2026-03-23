import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta de Documentos (relatórios PDF, JSON, XLSX)
const DOCUMENTOS_FOLDER_ID = '1psLJvyj6sNuO7kscJIjrCsINgRBTQq_1';

async function findFolder(accessToken, folderName, parentFolderId) {
  const q = encodeURIComponent(`name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentFolderId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta: ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  return await findFolder(accessToken, folderName, parentFolderId) || await createFolder(accessToken, folderName, parentFolderId);
}

async function uploadFileBinary(accessToken, fileName, fileBuffer, mimeType, parentFolderId) {
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [parentFolderId] })], { type: 'application/json' }));
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData
  });
  const result = await res.json();
  if (result.error) throw new Error(`Erro upload "${fileName}": ${result.error.message}`);
  return result;
}

const MES_MAP = {
  'Janeiro': '01', 'Fevereiro': '02', 'Março': '03', 'Abril': '04',
  'Maio': '05', 'Junho': '06', 'Julho': '07', 'Agosto': '08',
  'Setembro': '09', 'Outubro': '10', 'Novembro': '11', 'Dezembro': '12'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id, pdf_content, file_name } = await req.json();
    if (!report_id || !pdf_content) return Response.json({ error: 'report_id e pdf_content são obrigatórios' }, { status: 400 });

    const report = await base44.entities.Report.get(report_id);
    if (!report) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Estrutura: Documentos / Relatórios PDF / Ano / Mês / Usuário
    const relPdfFolderId = await getOrCreateFolder(accessToken, 'Relatórios PDF', DOCUMENTOS_FOLDER_ID);
    const ano = (report.ano || new Date().getFullYear()).toString();
    const anoFolderId = await getOrCreateFolder(accessToken, ano, relPdfFolderId);
    const mesNum = MES_MAP[report.mes_referencia] || '00';
    const mesLabel = `${mesNum} - ${report.mes_referencia || 'Sem Mês'}`;
    const mesFolderId = await getOrCreateFolder(accessToken, mesLabel, anoFolderId);
    const userName = (report.author_name || user.full_name || 'usuario').replace(/[\/\\:*?"<>|]/g, '_');
    const userFolderId = await getOrCreateFolder(accessToken, userName, mesFolderId);

    // Upload do PDF (conteúdo enviado como base64 ou texto)
    const pdfFileName = file_name || `${report.numero_protocolo || report.id}.pdf`;
    let pdfBuffer;
    if (typeof pdf_content === 'string' && pdf_content.startsWith('data:')) {
      const base64 = pdf_content.split(',')[1];
      pdfBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    } else {
      pdfBuffer = new TextEncoder().encode(pdf_content);
    }

    const uploadResult = await uploadFileBinary(accessToken, pdfFileName, pdfBuffer, 'application/pdf', userFolderId);

    // Processar anexos do relatório
    const allAttachments = await base44.entities.Attachment.filter({ report_id }, '-created_date', 200);
    let attachmentsCount = 0;
    let fotosCount = 0;

    const fotosFolderId = await getOrCreateFolder(accessToken, 'Fotos', userFolderId);
    const anexosFolderId = await getOrCreateFolder(accessToken, 'Anexos', userFolderId);

    for (const attachment of allAttachments) {
      if (!attachment.file_url) continue;
      try {
        const fileResponse = await fetch(attachment.file_url);
        if (!fileResponse.ok) continue;
        const buf = await fileResponse.arrayBuffer();
        const isFoto = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.file_name || '');
        await uploadFileBinary(
          accessToken,
          attachment.file_name || `arquivo_${Date.now()}`,
          buf,
          attachment.file_type || (isFoto ? 'image/jpeg' : 'application/octet-stream'),
          isFoto ? fotosFolderId : anexosFolderId
        );
        if (isFoto) fotosCount++;
        else attachmentsCount++;
      } catch (e) {
        console.warn(`Erro upload anexo ${attachment.file_name}:`, e.message);
      }
    }

    return Response.json({
      success: true,
      message: 'Relatório exportado salvo em Documentos/Relatórios PDF',
      report_id,
      file_uploaded: pdfFileName,
      attachments_count: attachmentsCount,
      fotos_count: fotosCount,
      drive_path: `Documentos/Relatórios PDF/${ano}/${mesLabel}/${userName}`,
      drive_folder_id: userFolderId
    });

  } catch (error) {
    console.error('Erro ao exportar relatório para Drive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});