import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email } = await req.json();

    // 1. Buscar todas as fotos pendentes/em revisão do usuário
    const intakes = await base44.asServiceRole.entities.DocumentIntake.filter({
      user_email: user_email || undefined,
      status_registro: 'ATIVO'
    }, '-created_date', 1000);

    // Filtrar fotos em status pendente/aguardando revisão
    const fotos = (intakes || []).filter(intake => {
      const tipo = intake.tipo_detectado || '';
      const status = String(intake.status_processamento || '').toUpperCase();
      const isFoto = tipo === 'FOTO_ATIVIDADE' || intake.mime_type?.includes('image');
      const isParaProcessar = ['PENDENTE', 'ENVIADO', 'AGUARDANDO_REVISAO'].includes(status);
      return isFoto && isParaProcessar;
    });

    console.log(`Processando ${fotos.length} fotos`);

    let aprovadas = 0;
    const erros = [];

    // 2. Processar cada foto
    for (const foto of fotos) {
      try {
        // Criar attachment na galeria
        await base44.asServiceRole.entities.Attachment.create({
          file_url: foto.arquivo_original_url,
          file_name: foto.file_name_original || foto.file_name_final || 'foto.jpg',
          file_type: foto.mime_type || 'image/jpeg',
          description: 'Foto automaticamente aprovada e enviada para galeria',
          document_intake_id: foto.id,
          uploaded_by: foto.user_email,
          status: 'ativa',
          nf_tipo_documento: 'foto_atividade'
        }).catch(err => {
          console.error('Erro ao criar attachment:', err);
          throw err;
        });

        // Marcar como processado e ocultar da entrada única
        await base44.asServiceRole.entities.DocumentIntake.update(foto.id, {
          status_processamento: 'APROVADO',
          entidade_destino: 'Attachment',
          ocultar_entrada_unica: true
        }).catch(err => console.error('Erro ao atualizar intake:', err));

        aprovadas++;
      } catch (err) {
        console.error(`Erro ao processar foto ${foto.id}:`, err);
        erros.push({
          arquivo: foto.file_name_original || foto.file_name_final,
          erro: err.message
        });
      }
    }

    return Response.json({
      success: true,
      aprovadas,
      total: fotos.length,
      erros,
      message: `${aprovadas} foto(s) aprovadas e enviadas para galeria. ${erros.length} erro(s).`
    });

  } catch (error) {
    console.error('Erro em aprovarFotosEmMassa:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});