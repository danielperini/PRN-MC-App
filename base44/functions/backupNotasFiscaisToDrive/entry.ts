import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * backupNotasFiscaisToDrive — Backup de NF para o Drive.
 *
 * Estrutura: 01_Notas_Fiscais / PDF ou XML / {nome_arquivo}
 *
 * Regras:
 * - Se arquivo já tem drive_file_id: skip (conteúdo verificado por hash em backupSingleFile)
 * - XML → 01_Notas_Fiscais/XML
 * - PDF → 01_Notas_Fiscais/PDF
 * - Verifica existência por nome antes de subir (fileExists)
 * - Delega para backupSingleFile via attachment_id quando possível
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const NOTAS_FOLDER = '01_Notas_Fiscais';

async function findFolder(accessToken, folderName, parentId) {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentId) {
  return (await findFolder(accessToken, folderName, parentId)) || (await createFolder(accessToken, folderName, parentId));
}

async function fileExistsInFolder(accessToken, fileName, folderId) {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0] || null;
}

async function uploadFile(accessToken, url, name, folderId) {
  const fileResponse = await fetch(url);
  if (!fileResponse.ok) throw new Error('Erro ao baixar arquivo');
  const blob = await fileResponse.blob();

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' }));
  formData.append('file', blob, name);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
  );
  const result = await uploadRes.json();
  if (result.error) throw new Error(result.error.message);
  return result.id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { file_url, file_name, xml_url, xml_file_name, purchase_id, team_payment_id, attachment_id } = body;

    // Se tem attachment_id, delegar para backupSingleFile (lógica completa de hash + pasta correta)
    if (attachment_id) {
      const result = await base44.asServiceRole.functions.invoke('backupSingleFile', { attachment_id });
      return Response.json({ success: true, delegated_to: 'backupSingleFile', result });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const notasRoot = await getOrCreateFolder(accessToken, NOTAS_FOLDER, ROOT_FOLDER_ID);
    const pdfFolder = await getOrCreateFolder(accessToken, 'PDF', notasRoot);
    const xmlFolder = await getOrCreateFolder(accessToken, 'XML', notasRoot);

    const uploaded = [];

    async function uploadIfNeeded(url, name, folderId) {
      if (!url || !name) return null;
      const exists = await fileExistsInFolder(accessToken, name, folderId);
      if (exists) {
        return { file_id: exists.id, drive_link: `https://drive.google.com/file/d/${exists.id}/view`, skipped: true };
      }
      const fileId = await uploadFile(accessToken, url, name, folderId);
      return { file_id: fileId, drive_link: `https://drive.google.com/file/d/${fileId}/view`, skipped: false };
    }

    const pdfResult = file_url && file_name ? await uploadIfNeeded(file_url, file_name, pdfFolder) : null;
    const xmlResult = xml_url && xml_file_name ? await uploadIfNeeded(xml_url, xml_file_name, xmlFolder) : null;

    if (team_payment_id) {
      await base44.asServiceRole.entities.TeamPayment.update(team_payment_id, {
        drive_pdf_url: pdfResult?.drive_link || null,
        drive_xml_url: xmlResult?.drive_link || null,
      }).catch(() => null);
    }

    return Response.json({
      success: true,
      pasta_pdf: `${NOTAS_FOLDER}/PDF`,
      pasta_xml: `${NOTAS_FOLDER}/XML`,
      pdf: pdfResult,
      xml: xmlResult,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});