import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * rotearNFPampulha
 * Salva/move arquivos de NF cujo centro_custo seja "Noturno Pampulha"
 * para a pasta do Google Drive:
 * https://drive.google.com/drive/u/0/folders/1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf
 */

const PASTA_DRIVE_PAMPULHA_ID = '1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf';
const PASTA_DRIVE_PAMPULHA_URL = 'https://drive.google.com/drive/u/0/folders/1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { purchase_id, file_url, file_name, attachment_id } = body;

    if (!file_url && !purchase_id) {
      return Response.json({ error: 'Informe file_url ou purchase_id.' }, { status: 400 });
    }

    // Busca credenciais do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    let targetFileUrl = file_url;
    let targetFileName = file_name || `NF_Pampulha_${Date.now()}.pdf`;

    // Se vier purchase_id, busca a URL do arquivo na solicitação
    if (purchase_id && !file_url) {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchase_id);
      targetFileUrl = purchase?.nf_pdf_url || purchase?.file_url || purchase?.nota_fiscal_url || '';
      targetFileName = purchase?.arquivo_nome || file_name || `NF_${purchase_id}.pdf`;
    }

    if (!targetFileUrl) {
      return Response.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    }

    // Faz download do arquivo
    const fileResp = await fetch(targetFileUrl);
    if (!fileResp.ok) {
      return Response.json({ error: 'Não foi possível baixar o arquivo.' }, { status: 502 });
    }
    const fileBuffer = await fileResp.arrayBuffer();
    const mimeType = fileResp.headers.get('content-type') || 'application/pdf';

    // Upload para o Google Drive na pasta correta
    const metadata = JSON.stringify({
      name: targetFileName,
      parents: [PASTA_DRIVE_PAMPULHA_ID],
    });

    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file', new Blob([fileBuffer], { type: mimeType }), targetFileName);

    const uploadResp = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      return Response.json({ error: 'Erro no upload para o Drive: ' + err }, { status: 502 });
    }

    const driveFile = await uploadResp.json();

    // Atualiza o registro (purchase ou attachment) com a URL do Drive
    if (purchase_id) {
      await base44.asServiceRole.entities.PurchaseRequest.update(purchase_id, {
        drive_backup_folder_id: PASTA_DRIVE_PAMPULHA_ID,
        drive_backup_folder_url: PASTA_DRIVE_PAMPULHA_URL,
        drive_backup_status: 'concluido',
        drive_backup_at: new Date().toISOString(),
      }).catch(() => {});
    }

    if (attachment_id) {
      await base44.asServiceRole.entities.Attachment.update(attachment_id, {
        drive_folder_id: PASTA_DRIVE_PAMPULHA_ID,
        drive_file_id: driveFile.id,
        backup_done: true,
        backup_date: new Date().toISOString(),
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      drive_file_id: driveFile.id,
      drive_file_name: driveFile.name,
      drive_url: driveFile.webViewLink,
      pasta: PASTA_DRIVE_PAMPULHA_URL,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});