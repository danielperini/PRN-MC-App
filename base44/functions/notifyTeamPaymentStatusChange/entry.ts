import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const FINANCIAL_RECIPIENTS = [
  'josiane@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
  'adm@viadutodasartes.org.br',
];

function formatBRL(v: unknown) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusLabel(status: unknown) {
  const s = String(status || '').toUpperCase();
  if (s === 'PAGO') return 'Pagamento aprovado ✓';
  if (s === 'APROVADO' || s === 'APROVADO_COORD' || s === 'APROVADO_ADMIN') return 'Aprovado pela coordenação ✓';
  if (s === 'DEVOLVIDO_REVISAO') return 'Devolvido para revisão ⚠';
  if (s === 'RECUSADO') return 'Recusado ✗';
  return String(status || 'Status atualizado');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const {
      payment_id,
      status,
      requester_email,
      team_member_name,
      cargo,
      mes,
      ano,
      numero_parcela,
      total_parcelas,
      valor,
      valor_parcela,
      valor_total_contrato,
      pix_key,
      banco,
      agencia,
      conta,
      tipo_conta,
      forma_pagamento,
      observacoes,
      nota_fiscal_url,
      xml_url,
      app_link,
    } = payload || {};

    const normalizedStatus = String(status || '').toUpperCase();
    const isAprovacao = ['PAGO', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(normalizedStatus);

    const appUrl = app_link || 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';
    const statusLabel = getStatusLabel(normalizedStatus);
    const competencia = `${mes || '-'}/${ano || '-'}`;
    const valorFmt = formatBRL(valor_parcela || valor);
    const valorTotalFmt = valor_total_contrato ? formatBRL(valor_total_contrato) : null;
    const parcelaInfo = numero_parcela && total_parcelas
      ? `Parcela ${numero_parcela} de ${total_parcelas}`
      : numero_parcela ? `Parcela ${numero_parcela}` : '';

    const subject = `[Museus Centro] ${statusLabel} — ${team_member_name || 'Membro'} — ${competencia}${parcelaInfo ? ' · ' + parcelaInfo : ''}`;

    // Monta seção de dados bancários para o e-mail de aprovação
    let dadosBancariosHtml = '';
    if (isAprovacao) {
      const hasPix = !!pix_key;
      const hasBanco = !!(banco && agencia && conta);

      if (hasPix) {
        dadosBancariosHtml = `
<tr><td colspan="2" style="padding:8px 0 4px;font-weight:bold;color:#1a1a1a;border-top:2px solid #e5e7eb;">💳 Dados para Pagamento</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Forma preferida</td><td style="font-size:13px;font-weight:600;color:#059669;">PIX</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Chave PIX</td><td style="font-size:14px;font-weight:700;color:#059669;letter-spacing:0.02em;">${pix_key}</td></tr>
${hasBanco ? `<tr><td style="padding:8px 12px 3px 0;color:#6b7280;font-size:13px;">Dados bancários</td><td style="font-size:13px;color:#374151;">${banco} · Ag. ${agencia} · Cc. ${conta}${tipo_conta ? ' (' + tipo_conta + ')' : ''}</td></tr>` : ''}
`;
      } else if (hasBanco) {
        dadosBancariosHtml = `
<tr><td colspan="2" style="padding:8px 0 4px;font-weight:bold;color:#1a1a1a;border-top:2px solid #e5e7eb;">💳 Dados para Pagamento</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Banco</td><td style="font-size:13px;font-weight:600;color:#374151;">${banco}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Agência</td><td style="font-size:13px;color:#374151;">${agencia}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Conta</td><td style="font-size:13px;color:#374151;">${conta}${tipo_conta ? ' (' + tipo_conta + ')' : ''}</td></tr>
`;
      }
    }

    const body = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;margin:0;padding:20px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
  <div style="background:#111;padding:20px 24px;">
    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#9ca3af;text-transform:uppercase;">Museus Centro</p>
    <h1 style="margin:6px 0 0;font-size:18px;font-weight:700;color:#fff;">${statusLabel}</h1>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Profissional</td><td style="font-size:14px;font-weight:600;color:#111;">${team_member_name || '—'}</td></tr>
      ${cargo ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Cargo/Função</td><td style="font-size:13px;color:#374151;">${cargo}</td></tr>` : ''}
      <tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Competência</td><td style="font-size:13px;color:#374151;">${competencia}</td></tr>
      ${parcelaInfo ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Parcela</td><td style="font-size:13px;color:#374151;">${parcelaInfo}</td></tr>` : ''}
      <tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Valor da Parcela</td><td style="font-size:16px;font-weight:700;color:#111;">${valorFmt}</td></tr>
      ${valorTotalFmt ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;font-size:13px;">Valor Total Contrato</td><td style="font-size:13px;color:#374151;">${valorTotalFmt}</td></tr>` : ''}
      ${dadosBancariosHtml}
      ${observacoes ? `<tr><td colspan="2" style="padding:8px 0 3px;color:#6b7280;font-size:13px;border-top:1px solid #f3f4f6;">Observações: ${observacoes}</td></tr>` : ''}
    </table>

    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6;">
      <a href="${appUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Acessar sistema</a>
      ${nota_fiscal_url ? `&nbsp;<a href="${nota_fiscal_url}" style="display:inline-block;color:#3b82f6;padding:10px 12px;border-radius:8px;text-decoration:none;font-size:13px;">Ver NF</a>` : ''}
    </div>
  </div>
</div>
</body>
</html>`;

    const results = [];
    for (const recipient of FINANCIAL_RECIPIENTS) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: recipient,
          subject,
          body,
          from_name: 'Museus Centro',
        });
        results.push({ recipient, success: true });
      } catch (err: any) {
        results.push({ recipient, success: false, error: err?.message });
      }
    }

    return Response.json({
      success: true,
      payment_id: payment_id || null,
      status: normalizedStatus,
      sent_to: results,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});