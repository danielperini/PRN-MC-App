import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await req.json();
    const { files } = body; // [{ driveId, purchaseId, fileName, nfNumero, valor }]
    
    const sr = base44.asServiceRole;
    const token = await sr.connectors.getConnection('googledrive');
    const at = token.accessToken;
    const results = [];

    for (const f of files) {
      try {
        // 1. Download do Drive
        const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${f.driveId}?alt=media`, {
          headers: { Authorization: `Bearer ${at}` }
        });
        if (!dl.ok) {
          results.push({ ...f, status: 'ERR_DOWNLOAD', error: `Drive ${dl.status}` });
          continue;
        }
        const blob = await dl.blob();
        const file = new File([blob], f.fileName, { type: blob.type || 'application/pdf' });

        // 2. Upload para Base44
        const upload = await sr.integrations.Core.UploadFile({ file });
        const fileUrl = upload.file_url;

        // 3. Criar DocumentIntake
        const intake = await sr.entities.DocumentIntake.create({
          user_email: user.email,
          user_name: user.full_name || user.email,
          arquivo_original_url: fileUrl,
          file_name_original: f.fileName,
          mime_type: blob.type || 'application/pdf',
          tipo_detectado: 'NOTA_FISCAL_PDF',
          status_processamento: 'APROVADO',
          nf_numero: f.nfNumero,
          nf_valor_total: f.valor || 0,
          revisado_pelo_usuario: true,
          status_registro: 'ATIVO',
          ocultar_entrada_unica: false
        });

        // 4. Atualizar PurchaseRequest com a URL real
        await sr.entities.PurchaseRequest.update(f.purchaseId, {
          nf_pdf_url: fileUrl,
          arquivo_url: fileUrl,
          documento_url: fileUrl,
          intake_id: intake.id,
          entidade_destino_id: intake.id
        });

        results.push({ ...f, status: 'OK', fileUrl });
      } catch (e) {
        results.push({ ...f, status: 'ERR', error: e.message });
      }
    }

    return Response.json({ processed: files.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});