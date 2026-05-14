import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email } = await req.json();

    if (!user_email) {
      return Response.json(
        { error: 'Parâmetro obrigatório faltando: user_email' },
        { status: 400 }
      );
    }

    // 1. Buscar todas as fotos da usuária em status de entrada única
    const intakes = await base44.asServiceRole.entities.DocumentIntake.filter({
      user_email: user_email,
      status_registro: 'ATIVO'
    }, '-created_date', 500);

    // Filtrar apenas fotos
    const fotos = (intakes || []).filter(intake => {
      const tipo = intake.tipo_detectado || '';
      return tipo === 'FOTO_ATIVIDADE' || intake.mime_type?.includes('image');
    });

    console.log(`Encontradas ${fotos.length} fotos para ${user_email}`);

    let processadas = 0;
    const erros = [];

    // 2. Processar cada foto
    for (const foto of fotos) {
      try {
        // Criar attachment na galeria (sem activity_id vinculada)
        await base44.asServiceRole.entities.Attachment.create({
          file_url: foto.arquivo_original_url,
          file_name: foto.file_name_original || foto.file_name_final || 'foto.jpg',
          file_type: foto.mime_type || 'image/jpeg',
          description: 'Foto enviada via Entrada Única — Aguardando vinculação a atividade',
          document_intake_id: foto.id,
          uploaded_by: user_email,
          status: 'ativa',
          nf_tipo_documento: 'foto_atividade'
        }).catch(err => {
          console.error('Erro ao criar attachment:', err);
          throw err;
        });

        // Marcar intake como processado
        await base44.asServiceRole.entities.DocumentIntake.update(foto.id, {
          status_processamento: 'ENVIADO_APROVACAO',
          entidade_destino: 'Attachment',
          ocultar_entrada_unica: true
        }).catch(err => console.error('Erro ao atualizar intake:', err));

        processadas++;
      } catch (err) {
        console.error(`Erro ao processar foto ${foto.id}:`, err);
        erros.push({
          arquivo: foto.file_name_original || foto.file_name_final,
          erro: err.message
        });
      }
    }

    // 3. Obter dados do usuário para email personalizado
    const user = await base44.asServiceRole.entities.User.filter({
      email: user_email
    }).catch(() => []);

    const userName = user?.[0]?.full_name || user_email;

    // 4. Enviar email consolidado
    const emailBody = `
Olá ${userName},

Todas as ${processadas} foto(s) que estavam na Entrada Única foram encaminhadas para a Galeria e estão prontas para uso.

**Próximos passos:**

1. **Acesse a Galeria de Fotos** para verificar as fotos enviadas
2. **Vincule as fotos às atividades** em que foram realizadas
3. As fotos sem vinculação podem ser deletadas ou reutilizadas em outras atividades

**Como vincular fotos às atividades:**
- Abra cada atividade realizada
- Clique em "Adicionar fotos"
- Selecione as fotos da galeria relacionadas
- Salve a atividade

Isso garante que as fotos fiquem organizadas por atividade e apareçam corretamente nos relatórios mensais.

${erros.length > 0 ? `\n**Atenção:** ${erros.length} foto(s) tiveram problemas ao serem processadas. Por favor, verifique a Entrada Única.\n` : ''}

Atenciosamente,
Sistema Museus Centro
    `.trim();

    try {
      await base44.integrations.Core.SendEmail({
        to: user_email,
        subject: `${processadas} foto(s) enviadas para a Galeria — Ação necessária`,
        body: emailBody
      });
      console.log('Email enviado para:', user_email);
    } catch (emailErr) {
      console.error('Erro ao enviar email:', emailErr);
    }

    return Response.json({
      success: true,
      processadas,
      erros,
      message: `${processadas} foto(s) encaminhadas para galeria. Email de notificação enviado para ${user_email}.`
    });

  } catch (error) {
    console.error('Erro em destravaFotosUsuario:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});