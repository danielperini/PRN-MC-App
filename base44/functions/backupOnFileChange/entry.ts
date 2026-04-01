import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta Notas Fiscais — subpastas por rubrica
const NOTAS_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const NOTAS_SUBFOLDER = 'Notas Fiscais';

function sanitizeFolderName(value: string | undefined | null) {
  return String(value || 'Sem Rubrica')
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '_')
    .slice(0, 120) || 'Sem Rubrica';
}

function extractAttachmentId(body: any): string | null {
  return (
    body?.attachment_id ||
    body?.entity_id ||
    body?.event?.entity_id ||
    body?.data?.entity_id ||
    body?.data?.event?.entity_id ||
    null
  );
}

async function findFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const q = encodeURIComponent(
    `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken: string, folderName: string, parentFolderId: string) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
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
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta: ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken: string, folderName: string, parentFolderId: string) {
  return (await findFolder(accessToken, folderName, parentFolderId)) || (await createFolder(accessToken, folderName, parentFolderId));
}

async function uploadToDrive(accessToken: string, fileUrl: string, fileName: string, targetFolderId: string) {
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error('Erro ao obter arquivo');
  }

  const fileBlob = await fileResponse.blob();

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob(
      [JSON.stringify({ name: fileName, parents: [targetFolderId] })],
      { type: 'application/json' }
    )
  );
  formData.append('file', fileBlob, fileName);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData
    }
  );

  const result = await uploadRes.json();
  if (result.error) throw new Error('Erro upload: ' + result.error.message);

  return result.id;
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

    const body = await req.json().catch(() => ({}));
    const attachmentId = extractAttachmentId(body);
    const { file_url, file_name, purchase_id } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const notasFolderId = await getOrCreateFolder(accessToken, NOTAS_SUBFOLDER, NOTAS_FOLDER_ID);

    // Modo 1: backup por attachment_id (automação)
    if (attachmentId) {
      const attachment = await base44.asServiceRole.entities.Attachment.get(attachmentId).catch(() => null);

      if (!attachment) {
        return Response.json({ error: 'Attachment não encontrado' }, { status: 404 });
      }

      if (!attachment.file_url) {
        return Response.json({ error: 'Attachment sem file_url' }, { status: 400 });
      }

      if (!attachment.nf_tipo_documento) {
        return Response.json({
          skipped: true,
          message: 'Attachment não é NF',
          attachment_id: attachmentId
        });
      }

      if (attachment.backup_done && attachment.drive_file_id) {
        return Response.json({
          skipped: true,
          message: 'NF já enviada anteriormente',
          attachment_id: attachmentId,
          file_id: attachment.drive_file_id,
          drive_link: `https://drive.google.com/file/d/${attachment.drive_file_id}/view`
        });
      }

      let rubricaName = 'Sem Rubrica';

      const report = attachment.report_id
        ? await base44.asServiceRole.entities.Report.get(attachment.report_id).catch(() => null)
        : null;

      if (report?.museu) {
        rubricaName = sanitizeFolderName(report.museu);
      }

      const rubricaFolderId = await getOrCreateFolder(accessToken, rubricaName, notasFolderId);

      const finalFileName =
        attachment.nf_nome_renomeado ||
        attachment.file_name ||
        `NF_${attachmentId}.pdf`;

      const uploadedFileId = await uploadToDrive(
        accessToken,
        attachment.file_url,
        finalFileName,
        rubricaFolderId
      );

      const backupDate = new Date().toISOString();

      await base44.asServiceRole.entities.Attachment.update(attachmentId, {
        backup_done: true,
        drive_file_id: uploadedFileId,
        backup_date: backupDate
      });

      return Response.json({
        success: true,
        message: `Nota fiscal salva em Notas Fiscais/${rubricaName}`,
        attachment_id: attachmentId,
        file_id: uploadedFileId,
        rubrica: rubricaName,
        drive_link: `https://drive.google.com/file/d/${uploadedFileId}/view`,
        backup_date: backupDate
      });
    }

    // Modo 2: upload avulso por file_url/file_name (mantido)
    if (file_url && file_name) {
      let rubricaName = 'Sem Rubrica';

      if (purchase_id) {
        const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchase_id).catch(() => null);

        if (purchase?.rubrica_id || purchase?.budget_line_id) {
          const rubricaId = purchase.rubrica_id || purchase.budget_line_id;
          const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
          if (rubrica?.rubrica) {
            rubricaName = sanitizeFolderName(rubrica.rubrica);
          }
        } else if (purchase?.categoria) {
          rubricaName = sanitizeFolderName(purchase.categoria);
        }
      }

      const rubricaFolderId = await getOrCreateFolder(accessToken, rubricaName, notasFolderId);
      const uploadedFileId = await uploadToDrive(accessToken, file_url, file_name, rubricaFolderId);

      return Response.json({
        success: true,
        message: `Nota fiscal salva em Notas Fiscais/${rubricaName}`,
        file_id: uploadedFileId,
        rubrica: rubricaName,
        drive_link: `https://drive.google.com/file/d/${uploadedFileId}/view`
      });
    }

    // Modo 3: backup geral
    const isAdmin = ['admin', 'COORDENADOR'].includes(user?.role || '');
    if (!isAdmin) {
      return Response.json({ error: 'Apenas admins podem executar backup geral' }, { status: 403 });
    }

    const [rubricas, purchases, gastos] = await Promise.all([
      base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 200),
      base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.GastoRubrica.list('-created_date', 1000)
    ]);

    const rubricaMap: Record<string, string> = {};
    rubricas.forEach((r: any) => {
      rubricaMap[r.id] = r.rubrica;
    });

    const nfItems = [
      ...purchases
        .filter((p: any) => p.nota_fiscal_url)
        .map((p: any) => ({
          url: p.nota_fiscal_url,
          name: `NF_${p.id}_${(p.fornecedor_nome || 'fornecedor').replace(/\s+/g, '_')}.pdf`,
          rubrica: sanitizeFolderName(rubricaMap[p.rubrica_id || p.budget_line_id] || p.categoria || 'Sem Rubrica')
        })),
      ...gastos
        .filter((g: any) => g.nota_fiscal_url || g.arquivo_url)
        .map((g: any) => ({
          url: g.nota_fiscal_url || g.arquivo_url,
          name: g.arquivo_nome || `NF_Gasto_${g.id}.pdf`,
          rubrica: sanitizeFolderName(rubricaMap[g.rubrica_id || g.budget_line_id] || g.categoria || 'Sem Rubrica')
        }))
    ];

    let successCount = 0;
    const errors: any[] = [];

    for (const item of nfItems) {
      try {
        const rubricaFolderId = await getOrCreateFolder(accessToken, item.rubrica, notasFolderId);
        await uploadToDrive(accessToken, item.url, item.name, rubricaFolderId);
        successCount++;
      } catch (error: any) {
        errors.push({
          file: item.name,
          rubrica: item.rubrica,
          error: error?.message || String(error)
        });
      }
    }

    return Response.json({
      success: true,
      message: 'Backup geral de notas fiscais concluído',
      total: nfItems.length,
      success_count: successCount,
      error_count: errors.length,
      errors
    });
  } catch (error: any) {
    console.error('Erro backup notas fiscais:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
