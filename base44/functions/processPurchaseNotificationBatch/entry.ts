import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { buildAppLink } from '../_shared/appUrl.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verificar se é uma chamada agendada (service role) ou manual
    const user = await base44.auth.me().catch(() => null);
    const isScheduled = !user;
    
    // Se não for agendado, verificar se é admin
    if (!isScheduled && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Determinar qual slot processar
    // Manhã: 09:00-09:59, Tarde: 16:15-17:00
    let batchSlot = null;
    if (currentHour === 9 && currentMinute < 60) {
      batchSlot = 'manha';
    } else if (currentHour === 16 && currentMinute >= 15) {
      batchSlot = 'tarde';
    }

    if (!batchSlot) {
      return Response.json({ 
        success: true, 
        message: 'Fora do horário de processamento de lotes',
        nextSlot: currentHour < 16 ? 'tarde' : 'manha'
      });
    }

    // Buscar pendentes do slot atual
    const pendingItems = await base44.asServiceRole.entities.PurchaseNotificationQueue.filter({
      status: 'pendente_lote',
      batch_slot: batchSlot
    });

    if (!pendingItems || pendingItems.length === 0) {
      return Response.json({ 
        success: true, 
        message: `Nenhuma notificação pendente no slot ${batchSlot}` 
      });
    }

    // Agrupar por centro de custo para melhor organização
    const groupedByCentroCusto = pendingItems.reduce((acc, item) => {
      const cc = item.centro_custo || 'Geral';
      if (!acc[cc]) acc[cc] = [];
      acc[cc].push(item);
      return acc;
    }, {});

    // Construir corpo do email
    let emailBody = `
      <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #2563eb;">Notificação de Compras - Lote ${batchSlot.toUpperCase()}</h2>
        <p><strong>Data/Hora:</strong> ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
        <p><strong>Total de solicitações:</strong> ${pendingItems.length}</p>
        <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
    `;

    // Iterar por centro de custo
    for (const [centroCusto, items] of Object.entries(groupedByCentroCusto)) {
      const totalCentroCusto = items.reduce((sum, item) => sum + (item.valor || 0), 0);
      
      emailBody += `
        <h3 style="color: #059669; margin-top: 20px;">${centroCusto}</h3>
        <p><strong>Quantidade:</strong> ${items.length} | <strong>Valor Total:</strong> R$ ${totalCentroCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Descrição</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Fornecedor</th>
              <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Valor</th>
              <th style="padding: 8px; text-align: center; border: 1px solid #e5e7eb;">Rubrica</th>
              <th style="padding: 8px; text-align: center; border: 1px solid #e5e7eb;">Links</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const item of items) {
        const links = [];
        if (item.drive_backup_nf_pdf_link) links.push('<a href="' + item.drive_backup_nf_pdf_link + '">NF</a>');
        if (item.drive_backup_nf_xml_link) links.push('<a href="' + item.drive_backup_nf_xml_link + '">XML</a>');
        if (item.comprovante_url) links.push('<a href="' + item.comprovante_url + '">Comprovante</a>');

        const itemLink = item.link_app_compras || item.purchase_snapshot_json?.link_app_compras || buildAppLink(req, `/Compras?purchaseId=${item.purchase_id}`);
        
        emailBody += `
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.purchase_descricao || 'N/A'}</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.fornecedor_nome || 'N/A'}${item.fornecedor_cnpj ? `<br/><small>CNPJ: ${item.fornecedor_cnpj}</small>` : ''}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">R$ ${(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #e5e7eb;">${item.rubrica_grupo || item.rubrica_nome || 'N/A'}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #e5e7eb;">
              ${links.join(' | ') || 'Sem anexos'}
              <br/><a href="${itemLink}" style="display: inline-block; margin-top: 6px; background: #2563eb; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 12px;">Ver solicitação no app →</a>
            </td>
          </tr>
        `;
      }

      emailBody += `
          </tbody>
        </table>
      `;
    }

    emailBody += `
        <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 12px; color: #6b7280;">
          <strong>Instruções:</strong><br/>
          - Verifique a conformidade de cada nota fiscal antes de aprovar.<br/>
          - Acesse o sistema para visualizar detalhes completos e aprovar as solicitações.<br/>
          - Este email é automático e não deve ser respondido.
        </p>
        <p style="margin-top: 20px;">
          <a href="${buildAppLink(req, '/Compras')}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Acessar Sistema de Compras</a>
        </p>
      </body>
      </html>
    `;

    // Enviar email
    const recipients = [
      'notasfiscais@viadutodasartes.org.br',
      'danielperini.mc@viadutodasartes.org.br',
      'daniell@periniprojetos.com.br'
    ];

    const digestId = `DIGEST-${batchSlot.toUpperCase()}-${now.toISOString().split('T')[0]}-${Date.now()}`;

    // Enviar para cada destinatário
    const sendPromises = recipients.map(recipient => 
      base44.integrations.Core.SendEmail({
        to: recipient,
        subject: `Notificação de Compras - Lote ${batchSlot.toUpperCase()} - ${pendingItems.length} solicitação(ões)`,
        body: emailBody,
        from_name: 'Museus Centro - Sistema de Compras'
      })
    );

    await Promise.all(sendPromises);

    // Atualizar registros como enviados
    const updatePromises = pendingItems.map(item =>
      base44.asServiceRole.entities.PurchaseNotificationQueue.update(item.id, {
        status: 'enviado',
        sent_at: now.toISOString(),
        digest_id: digestId
      })
    );

    await Promise.all(updatePromises);

    return Response.json({
      success: true,
      message: `Lote ${batchSlot} processado com sucesso`,
      data: {
        digestId,
        itemsProcessed: pendingItems.length,
        recipients,
        sentAt: now.toISOString()
      }
    });
  } catch (error) {
    console.error('Erro ao processar lote de notificações:', error);
    
    // Marcar itens com erro
    await base44.asServiceRole.entities.PurchaseNotificationQueue.updateMany(
      { status: 'pendente_lote' },
      { $set: { status: 'erro', error_message: error.message } }
    );

    return Response.json({ error: error.message }, { status: 500 });
  }
});