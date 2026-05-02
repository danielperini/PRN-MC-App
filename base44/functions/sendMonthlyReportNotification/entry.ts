import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email, user_name, mes, ano } = await req.json();

    const emailBody = `
Olá ${user_name},

Este é um lembrete de que você deve enviar seu relatório mensal referente a ${mes} de ${ano}.

Este é o último dia do mês. Relatórios enviados hoje ainda serão aceitos.

Depois de enviado, seu relatório será:
1. Exportado em PDF automático
2. Encaminhado para aprovação da coordenação
3. Revisado e assinado digitalmente

Para acessar a plataforma e enviar seu relatório:
https://museus-centro-bh.com.br/app/ReportEditor

Obrigado!
`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (user_email !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', user_email);
      return Response.json({ success: true, skipped: true });
    }
    await base44.integrations.Core.SendEmail({
      to: user_email,
      subject: `[IMPORTANTE] Relatório Mensal - ${mes}/${ano}`,
      body: emailBody,
      from_name: 'Sistema de Relatórios'
    });

    return Response.json({ success: true, email_sent_to: user_email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});