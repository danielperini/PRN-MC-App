import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const reportId = formData.get('reportId');
    const fileType = formData.get('fileType'); // 'photo' ou 'video'

    if (!file || !reportId || !fileType) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    // Validar tamanho
    if (fileType === 'video' && file.size > 100 * 1024 * 1024) {
      return Response.json({ 
        error: 'Vídeo muito grande. Máximo 100MB permitido.' 
      }, { status: 400 });
    }

    // Calcular hash do arquivo para detecção de duplicatas
    const buffer = await file.arrayBuffer();
    const hash = createHash('sha256')
      .update(Buffer.from(buffer))
      .digest('hex');

    // Verificar se arquivo duplicado já existe
    const existingAttachments = await base44.asServiceRole.entities.Attachment.filter({
      report_id: reportId
    }, 'created_date', 1000);

    // Buscar arquivo com mesmo hash (duplicado)
    let duplicateFound = null;
    for (const att of existingAttachments) {
      if (att.file_hash === hash) {
        duplicateFound = att;
        break;
      }
    }

    if (duplicateFound) {
      return Response.json({
        success: true,
        isDuplicate: true,
        message: `Arquivo "${file.name}" já existe neste relatório (adicionado em ${new Date(duplicateFound.created_date).toLocaleDateString('pt-BR')})`,
        attachment: duplicateFound
      });
    }

    // Upload do arquivo
    const uploadResponse = await base44.integrations.Core.UploadFile({
      file
    });

    if (!uploadResponse || !uploadResponse.file_url) {
      return Response.json({ error: 'Erro ao fazer upload do arquivo' }, { status: 500 });
    }

    // Criar registro de anexo
    const attachment = await base44.asServiceRole.entities.Attachment.create({
      report_id: reportId,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      file_url: uploadResponse.file_url,
      file_hash: hash,
      description: `${fileType === 'video' ? '📹 Vídeo' : '📷 Foto'} - Evidência`
    });

    // Backup automático em Google Drive se disponível
    try {
      await base44.asServiceRole.functions.invoke('backupOnFileChange', {
        reportId,
        attachmentId: attachment.id,
        fileName: file.name
      });
    } catch (err) {
      console.error('Erro ao fazer backup:', err);
      // Não falhar por causa do backup
    }

    return Response.json({
      success: true,
      isDuplicate: false,
      attachment,
      message: `${fileType === 'video' ? 'Vídeo' : 'Foto'} adicionada com sucesso`
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});