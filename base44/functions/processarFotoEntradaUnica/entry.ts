import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { intake_id, file_url, file_name, user_email, user_name } = await req.json();

    if (!intake_id || !file_url || !user_email) {
      return Response.json(
        { error: 'Parâmetros obrigatórios faltando: intake_id, file_url, user_email' },
        { status: 400 }
      );
    }

    // 1. Atualizar intake para enviado para galeria
    await base44.asServiceRole.entities.DocumentIntake.update(intake_id, {
      status_processamento: 'ENVIADO_APROVACAO',
      entidade_destino: 'Attachment',
      ocultar_entrada_unica: true
    }).catch(err => console.error('Erro ao atualizar intake:', err));

    // 2. Criar attachment na galeria (sem activity_id, pois ainda não está vinculada)
    const attachment = await base44.asServiceRole.entities.Attachment.create({
      file_url: file_url,
      file_name: file_name || 'foto.jpg',
      file_type: 'image/jpeg',
      description: 'Foto enviada via Entrada Única — Aguardando vinculação a atividade',
      document_intake_id: intake_id,
      uploaded_by: user_email,
      status: 'ativa',
      nf_tipo_documento: 'foto_atividade'
    }).catch(err => {
      console.error('Erro ao criar attachment:', err);
      throw err;
    });

    console.log('Attachment criado:', attachment?.id);

    // 3. Enviar email para usuário pedindo vinculação da foto a atividade
    const emailBody = `
Olá ${user_name || user_email},

Uma foto foi enviada via Entrada Única e está pronta para ser adicionada à galeria.

**Próximo passo:** Você precisa vincular esta foto a uma atividade realizada ou criar uma nova atividade.

**Opções:**
1. Vincular a uma atividade existente na Galeria de Fotos
2. Criar uma nova atividade e vincular a foto nela

A foto está temporariamente armazenada e aguardando sua ação.

Acesse a página de Galeria de Fotos para gerenciar suas fotos e atividades.

Atenciosamente,
Sistema Museus Centro
    `.trim();

    try {
      await base44.integrations.Core.SendEmail({
        to: user_email,
        subject: 'Foto enviada via Entrada Única — Vincule a uma atividade',
        body: emailBody
      });
      console.log('Email enviado para:', user_email);
    } catch (emailErr) {
      console.error('Erro ao enviar email:', emailErr);
      // Não falha a função se o email falhar
    }

    return Response.json({
      success: true,
      message: 'Foto enviada para galeria com sucesso. Email de notificação enviado.',
      attachment_id: attachment?.id
    });

  } catch (error) {
    console.error('Erro em processarFotoEntradaUnica:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});