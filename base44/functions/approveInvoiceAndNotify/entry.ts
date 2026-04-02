import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const FINAL_EMAILS = ['notasfiscais@viadutosartes.org.br', 'danielperini.mc@viadutodasartes.org.br'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Verificar se é coordenador
    const perm = await base44.asServiceRole.entities.UserPermission.filter({ user_email: user.email }, '-created_date', 1);
    const canApprove = perm?.[0]?.can_review_reports || user.role === 'admin';
    if (!canApprove) return Response.json({ error: 'Sem permissão para aprovar' }, { status: 403 });

    const { submissionId, action } = await req.json(); // action: 'APPROVE' | 'REJECT'
    if (!submissionId) return Response.json({ error: 'submissionId obrigatório' }, { status: 400 });

    const submission = await base44.asServiceRole.entities.InvoiceSubmission.get(submissionId);
    if (!submission) return Response.json({ error: 'Submissão não encontrada' }, { status: 404 });

    const newStatus = action === 'APPROVE' ? 'APROVADA' : 'REJEITADA';
    await base44.asServiceRole.entities.InvoiceSubmission.update(submissionId, {
      status: newStatus,
      aprovado_por_email: user.email,
      aprovado_por_nome: user.full_name,
      data_aprovacao: new Date().toISOString(),
    });

    // Se aprovada: envia email com arquivos
    if (action === 'APPROVE') {
      const nome = submission.user_name || submission.user_email;
      const numero = submission.numero_nota || '-';
      const valor = submission.valor_total || 0;
      const mes = submission.mes_referencia || '-';
      const cargo = submission.user_cargo || '-';

      const subject = `✅ Nota Fiscal Aprovada — NF ${numero} — ${nome}`;
      const body = `
<h2>Nota Fiscal Aprovada</h2>
<p>A nota fiscal abaixo foi <strong>aprovada</strong> por ${user.full_name || user.email}.</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
  <tr><td><b>Profissional</b></td><td>${nome}</td></tr>
  <tr><td><b>Cargo</b></td><td>${cargo}</td></tr>
  <tr><td><b>Nº da Nota</b></td><td>${numero}</td></tr>
  <tr><td><b>Valor Total</b></td><td>R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
  <tr><td><b>Mês de Referência</b></td><td>${mes}</td></tr>
  <tr><td><b>Aprovado por</b></td><td>${user.full_name || user.email}</td></tr>
</table>
<br/>
${submission.pdf_url ? `<p>📎 <a href="${submission.pdf_url}">Visualizar PDF da Nota Fiscal</a></p>` : ''}
${submission.xml_url ? `<p>📎 <a href="${submission.xml_url}">Visualizar XML da Nota Fiscal</a></p>` : ''}
${submission.drive_pdf_link ? `<p>📁 <a href="${submission.drive_pdf_link}">Abrir no Google Drive</a></p>` : ''}
<br/>
<hr/>
<p style="color:#888;font-size:12px;">Plataforma Museus Centro — Gestão de Notas Fiscais</p>
      `.trim();

      for (const email of FINAL_EMAILS) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject, body });
        } catch (e) {
          console.warn(`Email para ${email} falhou:`, e.message);
        }
      }

      // Notificar o próprio profissional
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: submission.user_email,
          subject: `✅ Sua NF ${numero} foi aprovada!`,
          body: `<p>Olá ${nome},</p><p>Sua nota fiscal NF ${numero} no valor de R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} foi <strong>aprovada</strong> por ${user.full_name}.</p><p>Obrigado!</p><p style="color:#888;font-size:12px;">Plataforma Museus Centro</p>`,
        });
      } catch (e) { console.warn('Email profissional falhou:', e.message); }
    }

    return Response.json({ success: true, status: newStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});