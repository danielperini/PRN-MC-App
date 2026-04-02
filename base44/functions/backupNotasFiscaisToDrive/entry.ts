import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta raiz
const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const NOTAS_SUBFOLDER = 'Notas Fiscais';

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
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  return await findFolder(accessToken, folderName, parentFolderId)
    || await createFolder(accessToken, folderName, parentFolderId);
}

// 🔥 NOVO: evita duplicidade (arquivo já existe)
async function fileExists(accessToken, fileName, parentFolderId) {
  const q = encodeURIComponent(`name='${fileName}' and '${parentFolderId}' in parents and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const {
      file_url,
      file_name,
      xml_url,
      xml_file_name,
      purchase_id,
      team_payment_id
    } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const notasFolderId = await getOrCreateFolder(accessToken, NOTAS_SUBFOLDER, ROOT_FOLDER_ID);

    // 🔥 descobrir rubrica
    let rubricaName = 'Sem Rubrica';

    if (purchase_id) {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchase_id).catch(() => null);
      if (purchase?.rubrica_id || purchase?.budget_line_id) {
        const rubricaId = purchase.rubrica_id || purchase.budget_line_id;
        const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
        if (rubrica?.rubrica) rubricaName = rubrica.rubrica;
      }
    }

    // 🔥 fallback para equipe (NF mensal)
    if (team_payment_id && rubricaName === 'Sem Rubrica') {
      rubricaName = 'Equipe';
    }

    rubricaName = rubricaName.replace(/[\/\\:*?"<>|]/g, '_');

    const rubricaFolderId = await getOrCreateFolder(accessToken, rubricaName, notasFolderId);

    const uploaded = [];

    async function uploadIfNeeded(url, name) {
      if (!url || !name) return null;

      // 🔥 evitar duplicidade
      const exists = await fileExists(accessToken, name, rubricaFolderId);
      if (exists) {
        return {
          file_id: exists.id,
          drive_link: `https://drive.google.com/file/d/${exists.id}/view`,
          skipped: true
        };
      }

      const fileResponse = await fetch(url);
      if (!fileResponse.ok) throw new Error('Erro ao baixar arquivo');

      const blob = await fileResponse.blob();

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify({
        name,
        parents: [rubricaFolderId]
      })], { type: 'application/json' }));

      formData.append('file', blob, name);

      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData
        }
      );

      const result = await uploadRes.json();
      if (result.error) throw new Error(result.error.message);

      return {
        file_id: result.id,
        drive_link: `https://drive.google.com/file/d/${result.id}/view`,
        skipped: false
      };
    }

    // 🔥 PDF
    const pdfResult = await uploadIfNeeded(file_url, file_name);

    // 🔥 XML
    const xmlResult = await uploadIfNeeded(xml_url, xml_file_name);

    // 🔥 salva no banco (IMPORTANTE)
    if (team_payment_id) {
      await base44.asServiceRole.entities.TeamPayment.update(team_payment_id, {
        drive_pdf_url: pdfResult?.drive_link || null,
        drive_xml_url: xmlResult?.drive_link || null
      }).catch(() => null);
    }

    return Response.json({
      success: true,
      pasta: `Notas Fiscais/${rubricaName}`,
      pdf: pdfResult,
      xml: xmlResult
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
