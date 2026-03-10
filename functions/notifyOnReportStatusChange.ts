import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data } = payload;

    if (!data || event?.type !== 'update') {
      return Response.json({ skipped: true, reason: 'Not an update event' });
    }

    const newStatus = data.status;
    const oldStatus = old_data?.status;

    // Só processar se o status realmente mudou
    if (newStatus === oldStatus) {
      return Response.json({ skipped: true, reason: 'Status unchanged' });
    }

    const report = data;
    const mesAno = `${report.mes_referencia || ''}/${report.ano || ''}`;

    // --- CASO 1: Relatório enviado para revisão (SUBMITTED) ---
    // Notifica os coordenadores (admins)
    if (newStatus === 'SUBMITTED') {
      const coordinators = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

      if (!coordinators || coordinators.length === 0) {
        return Response.json({ skipped: true, reason: 'No coordinators found' });
      }

      const subject = `📋 Novo relatório enviado para revisão — ${report.author_name}`;
      const body = `Olá,

Um novo relatório foi enviado e está aguardando sua revisão.

👤 Profissional: ${report.author_name}
🏛️ Museu: ${report.museu || '—'}
📅 Período: ${mesAno}
🗂️ Equipe: ${report.equipe || '—'}
📊 Atividades: ${(report.atividades || []).length}
${report.numero_protocolo ? `🔖 Protocolo: ${report.numero_protocolo}` : ''}

Acesse a plataforma para iniciar a revisão.

Atenciosamente,
Plataforma de Relatórios — Museus Centro`;

      await Promise.all(
        coordinators.map(coord =>
          base44.asServiceRole.integrations.Core.SendEmail({
            to: coord.email,
            subject,
            body,
            from_name: 'Museus Centro'
          })
        )
      );

      console.log(`[SUBMITTED] Notificados ${coordinators.length} coordenador(es) sobre o relatório de ${report.author_name}`);
      return Response.json({ success: true, action: 'SUBMITTED', notified: coordinators.length });
    }

    // --- CASO 2: Relatório devolvido para ajuste (RETURNED) ---
    // Notifica o profissional (autor do relatório)
    if (newStatus === 'RETURNED') {
      const authorEmail = report.created_by;
      if (!authorEmail) {
        return Response.json({ skipped: true, reason: 'Author email not found' });
      }

      const returnComment = report.return_comment || 'Nenhum comentário adicional foi registrado.';

      const subject = `↩️ Seu relatório de ${mesAno} foi devolvido para ajuste`;
      const body = `Olá, ${report.author_name},

Seu relatório do período ${mesAno} foi devolvido para revisão pelo coordenador.

📝 Comentários do coordenador:
${returnComment}

Por favor, acesse a plataforma, faça os ajustes necessários e reenvie o relatório.

🏛️ Museu: ${report.museu || '—'}
🗂️ Equipe: ${report.equipe || '—'}
${report.numero_protocolo ? `🔖 Protocolo: ${report.numero_protocolo}` : ''}

Atenciosamente,
Plataforma de Relatórios — Museus Centro`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: authorEmail,
        subject,
        body,
        from_name: 'Museus Centro'
      });

      console.log(`[RETURNED] Notificado ${authorEmail} sobre devolução do relatório de ${mesAno}`);
      return Response.json({ success: true, action: 'RETURNED', notified: authorEmail });
    }

    return Response.json({ skipped: true, reason: `Status ${newStatus} não requer notificação automática` });

  } catch (error) {
    console.error('Erro ao notificar mudança de status do relatório:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});