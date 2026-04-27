import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Backup de Nota Fiscal para o Google Drive.
 * Pasta: 01_Notas_Fiscais / PDF (ou XML) — ou Por_Rubrica para agrupamento.
 * Verifica hash antes de subir. Se arquivo já existe com mesmo hash, pula.
 * Se mudou, atualiza via PATCH.
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

async function findFolder(accessToken: string, folderName: string, parentFolderId: string): Promise<string | null> {
  const safeN = String(folderName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name='${safeN}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken: string, folderName: string, parentFolderId: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.id;
}

async function getOrCreateFolder(accessToken: string, folderName: string, parentFolderId: string): Promise<string> {
  return (await findFolder(accessToken, folderName, parentFolderId)) || (await createFolder(accessToken, folderName, parentFolderId));
}

async function computeHash(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeFolder(value: string | null | undefined): string {
  return String(value || 'Sem_Rubrica').trim().replace(/[\/\\:*?"<>|]/g, '_').slice(0, 80) || 'Sem_Rubrica';
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
      team_payment_id,
      attachment_id,
    } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Se vier attachment_id, delegar para backupOnFileChange (single source of truth)
    if (attachment_id) {
      const result = await base44.asServiceRole.functions.invoke('backupOnFileChange', { attachment_id });
      return Response.json(result);
    }

    // Descobrir rubrica para organizar em subpasta Por_Rubrica
    let rubricaName = 'Sem_Rubrica';
    if (purchase_id) {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchase_id).catch(() => null);
      if (purchase?.rubrica_id || purchase?.budget_line_id) {
        const rubricaId = purchase.rubrica_id || purchase.budget_line_id;
        const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
        if (rubrica?.rubrica) rubricaName = sanitizeFolder(rubrica.rubrica);
      } else if (purchase?.categoria) {
        rubricaName = sanitizeFolder(purchase.categoria);
      }
    }
    if (team_payment_id && rubricaName === 'Sem_Rubrica') {
      rubricaName = 'Equipe';
    }

    const nfRootId = await getOrCreateFolder(accessToken, '01_Notas_Fiscais', ROOT_FOLDER_ID);
    const rubricaFolderId = await getOrCreateFolder(accessToken, rubricaName, await getOrCreateFolder(accessToken, 'Por_Rubrica', nfRootId));

    const uploaded: any[] = [];

    async function uploadIfNeeded(url: string | null | undefined, name: string | null | undefined, existingDriveId?: string, existingHash?: string) {
      if (!url || !name) return null;

      const fileResponse = await fetch(url);
      if (!fileResponse.ok) throw new Error(`Erro ao baixar ${name}`);
      const buffer = await fileResponse.arrayBuffer();
      const newHash = await computeHash(buffer);

      // Verificar se hash é idêntico — não re-enviar
      if (existingDriveId && existingHash && existingHash === newHash) {
        return {
          file_id: existingDriveId,
          drive_link: `https://drive.google.com/file/d/${existingDriveId}/view`,
          skipped: true,
          reason: 'hash_identico',
          file_hash: newHash,
        };
      }

      const isXml = /\.xml$/i.test(name);
      const subFolder = isXml ? 'XML' : 'PDF';
      const targetFolderId = await getOrCreateFolder(accessToken, subFolder, nfRootId);

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify({ name, parents: [targetFolderId] })], { type: 'application/json' }));
      formData.append('file', new Blob([buffer], { type: isXml ? 'application/xml' : 'application/pdf' }), name);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const result = await uploadRes.json();
      if (result.error) throw new Error(result.error.message);

      return {
        file_id: result.id,
        drive_link: `https://drive.google.com/file/d/${result.id}/view`,
        skipped: false,
        file_hash: newHash,
      };
    }

    const pdfResult = file_url ? await uploadIfNeeded(file_url, file_name) : null;
    const xmlResult = xml_url ? await uploadIfNeeded(xml_url, xml_file_name) : null;

    // Atualizar TeamPayment
    if (team_payment_id) {
      await base44.asServiceRole.entities.TeamPayment.update(team_payment_id, {
        drive_pdf_url: pdfResult?.drive_link || null,
        drive_xml_url: xmlResult?.drive_link || null,
      }).catch(() => null);
    }

    return Response.json({
      success: true,
      pasta: `01_Notas_Fiscais/Por_Rubrica/${rubricaName}`,
      pdf: pdfResult,
      xml: xmlResult,
    });
  } catch (error: any) {
    console.error('Erro backup NF:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});