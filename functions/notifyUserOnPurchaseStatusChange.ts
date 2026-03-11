import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email, user_name, purchase_description, old_status, new_status, comments } = await req.json();

    if (!user_email || !new_status) {
      return Response.json({ error: 'Parâmetros obrigatórios faltando' }, { status: 400 });
    }

    const statusLabels = {
      'pendente': 'Pendente de Análise',
      'aprovado': 'Aprovado ✅',
      'rejeitado': 'Rejeitado ❌',
      'pago': 'Pago',
    };

    const statusEmojis = {
      'aprovado': '✅',
      'rejeitado': '❌',
      'pago': '💳',
      'pendente': '⏳',
    };

    const subject = `${statusEmojis[new_status] || '📋'} Sua solicitação de compra foi ${statusLabels[new_status] || new_status}`;

    let body = `Olá ${user_name},\n\n`;
    body += `Sua solicitação de compra foi atualizada:\n\n`;
    body += `📝 Descrição: ${purchase_description || 'Sem descrição'}\n`;
    body += `Status anterior: ${statusLabels[old_status] || old_status}\n`;
    body += `Novo status: ${statusLabels[new_status] || new_status}\n`;

    if (comments) {
      body += `\n💬 Comentários:\n${comments}\n`;
    }

    body += `\nAcesse a plataforma para mais detalhes.\n\nPlataforma Museus Centro`;

    await base44.integrations.Core.SendEmail({
      to: user_email,
      subject,
      body,
    });

    return Response.json({ success: true, message: 'Notificação enviada ao usuário' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});