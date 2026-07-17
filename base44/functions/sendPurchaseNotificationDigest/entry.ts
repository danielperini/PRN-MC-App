import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Aceitar chamada de automação agendada (sem sessão) ou de admin manual
    const user = await base44.auth.me().catch(() => null);
    const isScheduled = !user;

    if (!isScheduled && (!user || !['admin', 'ADMIN'].includes(user.role))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Receber slot forçado via payload ou detectar pelo horário (UTC-3)
    let body: any = {};
    try { body = await req.json(); } catch { /* sem body */ }

    const now = new Date();
    // Horário de Brasília = UTC-3
    const brasiliaHour = (now.getUTCHours() - 3 + 24) % 24;
    const brasiliaMinute = now.getUTCMinutes();

    let batchSlot: string | null = body.slot || null;

    if (!batchSlot) {
      // Manhã: 09h00-10h59 | Tarde: 16h00-18h59
      if (brasiliaHour >= 9 && brasiliaHour < 11) {
        batchSlot = 'manha';
      } else if (brasiliaHour >= 16 && brasiliaHour < 19) {
        batchSlot = 'tarde';
      }
    }

    // Se forçado (force=true) e sem slot definido, processar todos os pendentes
    const force = body.force === true;

    // Buscar pendentes — service role para funcionar em automações agendadas
    let pendingItems: any[];
    if (batchSlot && !force) {
      pendingItems = await base44.asServiceRole.entities.PurchaseNotificationQueue.filter({
        status: 'pendente_lote',
        batch_slot: batchSlot
      });
    } else if (force) {
      pendingItems = await base44.asServiceRole.entities.PurchaseNotificationQueue.filter({
        status: 'pendente_lote'
      });
    } else {
      return Response.json({
        success: true,
        message: `Fora do horário de processamento (Brasília: ${brasiliaHour}h${brasiliaMinute}m). Passe slot="manha"|"tarde" para forçar.`,
        brasiliaHour, brasiliaMinute,
      });
    }

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
        const appBaseUrl = 'https://museus-centro.base44-apps.com';
        const linkSolicitacao = item.purchase_id
          ? `${appBaseUrl}/Compras?id=${item.purchase_id}`
          : `${appBaseUrl}/Compras`;

        const links = [];
        // Link direto para a solicitação no app — sempre primeiro
        links.push(`<a href="${linkSolicitacao}" style="color:#2563eb;font-weight:bold;">Ver no app</a>`);
        if (item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url) {
          links.push(`<a href="${item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url}" style="color:#059669;">NF PDF</a>`);
        }
        if (item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url) {
          links.push(`<a href="${item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url}" style="color:#6b7280;">XML</a>`);
        }
        if (item.comprovante_url) links.push(`<a href="${item.comprovante_url}" style="color:#7c3aed;">Comprovante</a>`);
        
        emailBody += `
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.purchase_descricao || 'N/A'}</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.fornecedor_nome || 'N/A'}${item.fornecedor_cnpj ? `<br/><small>CNPJ: ${item.fornecedor_cnpj}</small>` : ''}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">R$ ${(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #e5e7eb;">${item.rubrica_grupo || item.rubrica_nome || 'N/A'}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #e5e7eb;">${links.join(' · ')}</td>
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
          <a href="https://museus-centro.base44-apps.com/Compras" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Acessar Solicitações de Compras</a>
        </p>
      </body>
      </html>
    `;

    // Destinatários — apenas usuários registrados no app (SendEmail só funciona para eles)
    // Josiane: josianeamancio@viadutodasartes.org.br | adm: adm@viadutodasartes.org.br
    // Daniel Perini: danielperini.mc@ e daniel@periniprojetos.com.br
    // notasfiscais@viadutodasartes.org.br NÃO é usuária registrada — NÃO incluir
    const recipients = [
      'adm@viadutodasartes.org.br',
      'josianeamancio@viadutodasartes.org.br',
      'danielperini.mc@viadutodasartes.org.br',
      'daniel@periniprojetos.com.br'
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

    // Marcar registros como enviados
    for (const item of pendingItems) {
      await base44.asServiceRole.entities.PurchaseNotificationQueue.update(item.id, {
        status: 'enviado',
        sent_at: now.toISOString(),
        digest_id: digestId
      });
    }

    return Response.json({
      success: true,
      message: `Lote ${batchSlot || 'forçado'} processado com sucesso`,
      digestId,
      itemsSent: pendingItems.length,
      recipients
    });

  } catch (error: any) {
    console.error('Erro ao enviar lote de notificações:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});