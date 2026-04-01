import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const MIRROR_FOLDER_NAME = 'App_Mirror_Sincronizado';
const APPROVED_PDF_FOLDER = 'Relatorios_Aprovados_PDF';

function escapeDriveQueryValue(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Busca ou cria pasta
async function findOrCreateFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const safeFolderName = escapeDriveQueryValue(folderName);
  const q = encodeURIComponent(
    `name='${safeFolderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json();

  if (data.files?.length > 0) return data.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
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

  const result = await createRes.json();
  if (result.error) {
    throw new Error(`Erro ao criar pasta "${folderName}": ${result.error.message}`);
  }

  return result.id;
}

// Lista arquivos/pastas do Drive
async function listDriveContents(accessToken: string, folderId: string) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  return data.files || [];
}

// Delete arquivo/pasta do Drive
async function deleteFromDrive(accessToken: string, fileId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Erro ao deletar item ${fileId}: ${text || res.status}`);
  }
}

// Renomeia arquivo/pasta
async function renameInDrive(accessToken: string, fileId: string, newName: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Erro ao renomear item ${fileId}: ${text || res.status}`);
  }
}

// Gera PDF do relatório
async function generateReportPDF(report: any, activities: any[]) {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = pdfDoc.addPage([595, 842]);
  let y = 800;

  function addText(text: string, opts: any = {}) {
    const { font = regularFont, size = 11, isBold = false, y: customY } = opts;
    if (customY !== undefined) y = customY;
    if (!text) return y;

    const clean = String(text).replace(/<[^>]*>/g, '').slice(0, 100);
    page.drawText(clean, {
      x: 50,
      y,
      size,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0)
    });
    return y - (size + 4);
  }

  y = addText('RELATORIO MENSAL', { size: 16, isBold: true });
  y -= 4;
  y = addText(`${report.mes_referencia || '-'} / ${report.ano || '-'}`, { size: 13 });
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
    y = addText(String(report.resumo_executivo).slice(0, 200));
    y -= 12;
  }

  if (activities?.length) {
    y = addText(`ATIVIDADES: ${activities.length}`, { size: 12, isBold: true });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

// Upload de arquivo
async function uploadFileToDrive(
  accessToken: string,
  fileName: string,
  fileContent: ArrayBuffer | Uint8Array | string,
  mimeType: string,
  parentFolderId: string
) {
  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob(
      [JSON.stringify({ name: fileName, parents: [parentFolderId] })],
      { type: 'application/json' }
    )
  );

  const blob =
    typeof fileContent === 'string'
      ? new Blob([fileContent], { type: mimeType })
      : new Blob([fileContent], { type: mimeType });

  formData.append('file', blob, fileName);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: formData
    }
  );

  const result = await response.json();
  if (result.error) {
    throw new Error(`Erro no upload de "${fileName}": ${result.error.message}`);
  }

  return result;
}

// Atualiza arquivo existente
async function updateFileInDrive(
  accessToken: string,
  fileId: string,
  fileName: string,
  fileContent: ArrayBuffer | Uint8Array | string,
  mimeType: string
) {
  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify({ name: fileName })], { type: 'application/json' })
  );

  const blob =
    typeof fileContent === 'string'
      ? new Blob([fileContent], { type: mimeType })
      : new Blob([fileContent], { type: mimeType });

  formData.append('file', blob, fileName);

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: formData
    }
  );

  const result = await response.json();
  if (result.error) {
    throw new Error(`Erro ao atualizar "${fileName}": ${result.error.message}`);
  }

  return result;
}

function getReportFolderName(report: any) {
  return `${report.numero_protocolo || report.id} - ${report.author_name || 'Sem Nome'} (${report.status || 'SEM_STATUS'})`;
}

function getReportFolderKey(report: any) {
  return String(report.numero_protocolo || report.id);
}

function shouldUpdateFile(appUpdatedDate: string | undefined, driveModifiedTime: string | undefined) {
  if (!appUpdatedDate) return false;
  if (!driveModifiedTime) return true;

  const appTime = new Date(appUpdatedDate).getTime();
  const driveTime = new Date(driveModifiedTime).getTime();

  if (Number.isNaN(appTime) || Number.isNaN(driveTime)) return false;
  return appTime > driveTime;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }

    if (user && !['admin', 'COORDENADOR', 'COORD_PRODUCAO'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Obter ou criar pastas
    const mirrorFolderId = await findOrCreateFolder(accessToken, MIRROR_FOLDER_NAME, ROOT_FOLDER_ID);
    const approvedPdfFolderId = await findOrCreateFolder(accessToken, APPROVED_PDF_FOLDER, ROOT_FOLDER_ID);

    // Buscar relatórios e anexos do app
    const [reports, attachments, activities] = await Promise.all([
      base44.asServiceRole.entities.Report.list('-updated_date', 1000),
      base44.asServiceRole.entities.Attachment.list('-updated_date', 5000),
      base44.asServiceRole.entities.Activity.list('-updated_date', 1000)
    ]);

    // Estrutura esperada no Drive
    const expectedStructure: Record<string, any> = {};
    const expectedFolderKeys = new Map<string, string>();

    for (const report of reports) {
      const reportFolder = getReportFolderName(report);
      const reportKey = getReportFolderKey(report);

      expectedFolderKeys.set(reportKey, reportFolder);
      expectedStructure[reportFolder] = {
        type: 'folder',
        reportKey,
        reportId: report.id,
        children: {}
      };

      const reportAttachments = attachments.filter((a: any) => a.report_id === report.id);
      for (const att of reportAttachments) {
        if (!att.file_name || !att.file_url) continue;

        expectedStructure[reportFolder].children[att.file_name] = {
          type: 'file',
          id: att.id,
          url: att.file_url,
          mimeType: att.file_type || 'application/octet-stream',
          updatedDate: att.updated_date || att.created_date || null
        };
      }
    }

    // Listar conteúdo atual do Drive
    const driveContents = await listDriveContents(accessToken, mirrorFolderId);
    const driveFolders = new Map<string, { id: string; name: string }>();
    const driveFoldersByKey = new Map<string, { id: string; name: string }>();

    for (const item of driveContents) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        driveFolders.set(item.name, { id: item.id, name: item.name });

        const key = String(item.name).split(' - ')[0];
        if (key) {
          driveFoldersByKey.set(key, { id: item.id, name: item.name });
        }
      }
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let renamed = 0;
    const changes: string[] = [];

    // Sincronizar relatórios (criar/renomear pastas)
    for (const [reportFolderName, expectedContent] of Object.entries(expectedStructure)) {
      let reportFolderId: string | null = null;

      if (driveFolders.has(reportFolderName)) {
        reportFolderId = driveFolders.get(reportFolderName)!.id;
      } else if (driveFoldersByKey.has(expectedContent.reportKey)) {
        const existing = driveFoldersByKey.get(expectedContent.reportKey)!;
        reportFolderId = existing.id;

        if (existing.name !== reportFolderName) {
          await renameInDrive(accessToken, existing.id, reportFolderName);
          renamed++;
          changes.push(`✏️ Pasta renomeada: ${existing.name} → ${reportFolderName}`);
        }
      } else {
        reportFolderId = await findOrCreateFolder(accessToken, reportFolderName, mirrorFolderId);
        created++;
        changes.push(`📁 Pasta criada: ${reportFolderName}`);
      }

      const reportDriveFiles = await listDriveContents(accessToken, reportFolderId);
      const driveFileMap = new Map<string, { id: string; modifiedTime?: string }>(
        reportDriveFiles
          .filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder')
          .map((f: any) => [f.name, { id: f.id, modifiedTime: f.modifiedTime }])
      );

      // Upload / atualizar arquivos
      for (const [fileName, fileInfo] of Object.entries(expectedContent.children)) {
        const info: any = fileInfo;
        if (info.type !== 'file' || !info.url) continue;

        try {
          const res = await fetch(info.url);
          if (!res.ok) {
            changes.push(`✗ Erro ao baixar ${reportFolderName}/${fileName}: ${res.status}`);
            continue;
          }

          const buf = await res.arrayBuffer();
          const existingDriveFile = driveFileMap.get(fileName);

          if (!existingDriveFile) {
            await uploadFileToDrive(
              accessToken,
              fileName,
              buf,
              info.mimeType || 'application/octet-stream',
              reportFolderId
            );
            created++;
            changes.push(`✓ Arquivo criado: ${reportFolderName}/${fileName}`);
          } else if (shouldUpdateFile(info.updatedDate, existingDriveFile.modifiedTime)) {
            await updateFileInDrive(
              accessToken,
              existingDriveFile.id,
              fileName,
              buf,
              info.mimeType || 'application/octet-stream'
            );
            updated++;
            changes.push(`🔄 Arquivo atualizado: ${reportFolderName}/${fileName}`);
          }
        } catch (e: any) {
          changes.push(`✗ Erro ao sincronizar ${reportFolderName}/${fileName}: ${e?.message || String(e)}`);
        }
      }

      // Deletar arquivos que não existem mais no app
      for (const [fileName, fileMeta] of driveFileMap.entries()) {
        if (!expectedContent.children[fileName]) {
          await deleteFromDrive(accessToken, fileMeta.id);
          deleted++;
          changes.push(`🗑 Arquivo deletado: ${reportFolderName}/${fileName}`);
        }
      }
    }

    // Deletar pastas que não existem mais no app
    for (const [driveFolderName, driveFolder] of driveFolders.entries()) {
      const key = String(driveFolderName).split(' - ')[0];
      if (!expectedFolderKeys.has(key)) {
        await deleteFromDrive(accessToken, driveFolder.id);
        deleted++;
        changes.push(`🗑 Pasta deletada: ${driveFolderName}`);
      }
    }

    // Sincronizar repositório de PDFs aprovados
    const approvedReports = reports.filter((r: any) => r.status === 'APPROVED');
    const approvedDriveFiles = await listDriveContents(accessToken, approvedPdfFolderId);
    const approvedDriveMap = new Map<string, { id: string; modifiedTime?: string }>(
      approvedDriveFiles
        .filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder')
        .map((f: any) => [f.name, { id: f.id, modifiedTime: f.modifiedTime }])
    );

    for (const report of approvedReports) {
      const pdfFileName = `${report.numero_protocolo || report.id}_${report.author_name || 'Unknown'}.pdf`;
      const existingPdf = approvedDriveMap.get(pdfFileName);

      try {
        const reportActivities = activities.filter((a: any) => a.report_id === report.id);
        const pdfBuffer = await generateReportPDF(report, reportActivities);

        if (!existingPdf) {
          await uploadFileToDrive(
            accessToken,
            pdfFileName,
            pdfBuffer,
            'application/pdf',
            approvedPdfFolderId
          );
          created++;
          changes.push(`📄 PDF aprovado criado: ${pdfFileName}`);
        } else if (shouldUpdateFile(report.updated_date || report.created_date, existingPdf.modifiedTime)) {
          await updateFileInDrive(
            accessToken,
            existingPdf.id,
            pdfFileName,
            pdfBuffer,
            'application/pdf'
          );
          updated++;
          changes.push(`🔄 PDF aprovado atualizado: ${pdfFileName}`);
        }
      } catch (e: any) {
        changes.push(`✗ Erro ao gerar/atualizar PDF ${report.id}: ${e?.message || String(e)}`);
      }
    }

    // Deletar PDFs de relatórios que foram reprovados ou removidos
    for (const [fileName, fileMeta] of approvedDriveMap.entries()) {
      const reportKey = fileName.split('_')[0];
      const shouldExist = approvedReports.some((r: any) => String(r.numero_protocolo || r.id) === reportKey);

      if (!shouldExist) {
        await deleteFromDrive(accessToken, fileMeta.id);
        deleted++;
        changes.push(`🗑 PDF removido (não mais aprovado): ${fileName}`);
      }
    }

    return Response.json({
      success: true,
      message: 'Espelho e repositório sincronizados com sucesso',
      folders: {
        mirror: MIRROR_FOLDER_NAME,
        approved_pdfs: APPROVED_PDF_FOLDER
      },
      stats: {
        arquivos_criados: created,
        arquivos_atualizados: updated,
        arquivos_deletados: deleted,
        pastas_renomeadas: renamed,
        relatorios_aprovados: approvedReports.length
      },
      changes: changes.slice(0, 100)
    });
  } catch (error: any) {
    console.error('Erro na sincronização:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
