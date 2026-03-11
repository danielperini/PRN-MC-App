import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const MIRROR_FOLDER_NAME = 'App_Mirror_Sincronizado';
const APPROVED_PDF_FOLDER = 'Relatorios_Aprovados_PDF';

// Busca ou cria pasta
async function findOrCreateFolder(accessToken, folderName, parentFolderId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  
  if (data.files?.length > 0) return data.files[0].id;
  
  // Criar pasta
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
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
  const result = await createRes.json();
  return result.id;
}

// Lista arquivos/pastas do Drive
async function listDriveContents(accessToken, folderId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  return data.files || [];
}

// Delete arquivo/pasta do Drive
async function deleteFromDrive(accessToken, fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}

// Renomeia arquivo/pasta
async function renameInDrive(accessToken, fileId, newName) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  });
}

// Gera PDF do relatório
async function generateReportPDF(report, activities) {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = pdfDoc.addPage([595, 842]);
  let y = 800;

  function addText(text, opts = {}) {
    const { font = regularFont, size = 11, isBold = false, y: customY } = opts;
    if (customY !== undefined) y = customY;
    if (!text) return y;
    
    const clean = String(text).replace(/<[^>]*>/g, '').slice(0, 100);
    page.drawText(clean, { x: 50, y, size, font: isBold ? boldFont : font, color: rgb(0, 0, 0) });
    return y - (size + 4);
  }

  y = addText('RELATORIO MENSAL', { size: 16, isBold: true });
  y -= 4;
  y = addText(`${report.mes_referencia} / ${report.ano}`, { size: 13 });
  y -= 20;
  
  y = addText('DADOS', { size: 13, isBold: true });
  y -= 12;
  y = addText(`Protocolo: ${report.numero_protocolo || '-'}`);
  y = addText(`Profissional: ${report.author_name || '-'}`);
  y = addText(`Museu: ${report.museu || '-'}`);
  y = addText(`Status: ${report.status || '-'}`);
  y -= 12;
  
  if (report.resumo_executivo) {
    y = addText('RESUMO', { size: 12, isBold: true });
    y = addText(report.resumo_executivo?.slice(0, 200));
    y -= 12;
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

// Upload de arquivo
async function uploadFileToDrive(accessToken, fileName, fileContent, mimeType, parentFolderId) {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const metadata = { name: fileName, parents: [parentFolderId] };
  const multipartBody = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    (typeof fileContent === 'string' ? fileContent : new TextDecoder().decode(fileContent)) +
    closeDelimiter;
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });
  
  const result = await response.json();
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || !['admin', 'COORDENADOR', 'COORD_PRODUCAO'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    // Obter ou criar pasta espelho
    const mirrorFolderId = await findOrCreateFolder(accessToken, MIRROR_FOLDER_NAME, ROOT_FOLDER_ID);
    
    // Buscar relatórios e anexos do app
    const [reports, attachments] = await Promise.all([
      base44.asServiceRole.entities.Report.list('-updated_date', 1000),
      base44.asServiceRole.entities.Attachment.list('-updated_date', 5000)
    ]);
    
    // Estrutura esperada no Drive
    const expectedStructure = {};
    for (const report of reports) {
      const reportFolder = `${report.numero_protocolo || report.id} - ${report.author_name} (${report.status})`;
      expectedStructure[reportFolder] = {
        type: 'folder',
        children: {}
      };
      
      const reportAttachments = attachments.filter(a => a.report_id === report.id);
      for (const att of reportAttachments) {
        expectedStructure[reportFolder].children[att.file_name] = {
          type: 'file',
          id: att.id,
          url: att.file_url,
          mimeType: att.file_type
        };
      }
    }
    
    // Listar conteúdo atual do Drive
    const driveContents = await listDriveContents(accessToken, mirrorFolderId);
    const driveFolders = new Map();
    
    for (const item of driveContents) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        driveFolders.set(item.name, item.id);
      }
    }
    
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let renamed = 0;
    const changes = [];
    
    // Sincronizar relatórios (criar/renomear pastas)
    for (const [reportFolderName, expectedContent] of Object.entries(expectedStructure)) {
      if (driveFolders.has(reportFolderName)) {
        // Pasta existe - sincronizar conteúdo
        const reportFolderId = driveFolders.get(reportFolderName);
        const reportDriveFiles = await listDriveContents(accessToken, reportFolderId);
        
        const driveFileMap = new Map(reportDriveFiles.map(f => [f.name, f.id]));
        
        // Upload/atualizar arquivos
        for (const [fileName, fileInfo] of Object.entries(expectedContent.children)) {
          if (fileInfo.type === 'file' && fileInfo.url) {
            if (!driveFileMap.has(fileName)) {
              try {
                const res = await fetch(fileInfo.url);
                if (res.ok) {
                  const buf = await res.arrayBuffer();
                  await uploadFileToDrive(accessToken, fileName, buf, fileInfo.mimeType || 'application/octet-stream', reportFolderId);
                  created++;
                  changes.push(`✓ Arquivo criado: ${reportFolderName}/${fileName}`);
                }
              } catch (e) {
                changes.push(`✗ Erro ao criar ${fileName}: ${e.message}`);
              }
            }
          }
        }
        
        // Deletar arquivos que não existem mais no app
        for (const [fileName, fileId] of driveFileMap) {
          if (!expectedContent.children[fileName]) {
            await deleteFromDrive(accessToken, fileId);
            deleted++;
            changes.push(`🗑 Arquivo deletado: ${reportFolderName}/${fileName}`);
          }
        }
      } else {
        // Criar pasta do relatório
        const reportFolderId = await findOrCreateFolder(accessToken, reportFolderName, mirrorFolderId);
        created++;
        changes.push(`📁 Pasta criada: ${reportFolderName}`);
        
        // Fazer upload dos arquivos
        for (const [fileName, fileInfo] of Object.entries(expectedContent.children)) {
          if (fileInfo.type === 'file' && fileInfo.url) {
            try {
              const res = await fetch(fileInfo.url);
              if (res.ok) {
                const buf = await res.arrayBuffer();
                await uploadFileToDrive(accessToken, fileName, buf, fileInfo.mimeType || 'application/octet-stream', reportFolderId);
                created++;
                changes.push(`✓ Arquivo criado: ${reportFolderName}/${fileName}`);
              }
            } catch (e) {
              changes.push(`✗ Erro ao criar ${fileName}: ${e.message}`);
            }
          }
        }
      }
    }
    
    // Deletar pastas que não existem mais no app
    for (const [driveFolderName, driveFolderId] of driveFolders) {
      if (!expectedStructure[driveFolderName]) {
        await deleteFromDrive(accessToken, driveFolderId);
        deleted++;
        changes.push(`🗑 Pasta deletada: ${driveFolderName}`);
      }
    }
    
    return Response.json({
      success: true,
      message: 'Espelho sincronizado com sucesso',
      mirror_folder: MIRROR_FOLDER_NAME,
      stats: {
        arquivos_criados: created,
        arquivos_atualizados: updated,
        arquivos_deletados: deleted,
        pastas_renomeadas: renamed
      },
      changes: changes.slice(0, 50) // Últimas 50 mudanças
    });
  } catch (error) {
    console.error('Erro na sincronização:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});