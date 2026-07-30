import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const APP_BASE_URL = 'https://periniprojetos.com.br';

const RECIPIENTS = [
  'adm@viadutodasartes.org.br',
  'josianeamancio@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch { /* sem body — contexto de cron */ }

    const force = body.force === true;

    // Buscar TODOS os pendentes (sem filtrar por batch_slot — digest único diário)
    const pendingItems: any[] = await base44.asServiceRole.entities.PurchaseNotificationQueue.filter({
      status: 'pendente_lote'
    });

    if (!pendingItems || pendingItems.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhuma compra aprovada pendente para notificar.',
        itemsSent: 0
      });
    }

    const now = new Date();
    const dataFormatada = now.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const totalGeral = pendingItems.reduce((sum, item) => sum + (item.valor || 0), 0);

    // Agrupar por centro de custo
    const groupedByCentroCusto: Record<string, any[]> = pendingItems.reduce((acc: any, item: any) => {
      const cc = item.centro_custo || 'Geral';
      if (!acc[cc]) acc[cc] = [];
      acc[cc].push(item);
      return acc;
    }, {});

    // ── E-mail HTML ──
    let emailBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px 28px;">
      <div style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85;">Museus Centro · Sistema de Compras</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:4px;">Resumo Diário de Compras Aprovadas</div>
      <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">${dataFormatada}</div>
    </div>

    <!-- Sumário -->
    <div style="padding:20px 28px 8px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total de compras</div>
            <div style="font-size:22px;color:#2563eb;font-weight:700;margin-top:2px;">${pendingItems.length}</div>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <div style="font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Valor total</div>
            <div style="font-size:22px;color:#059669;font-weight:700;margin-top:2px;">R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:8px 28px 0 28px;"><div style="height:1px;background:#e2e8f0;"></div></div>
`;

    for (const [centroCusto, items] of Object.entries(groupedByCentroCusto)) {
      const totalCC = items.reduce((sum, item) => sum + (item.valor || 0), 0);

      emailBody += `
    <!-- Grupo: ${centroCusto} -->
    <div style="padding:20px 28px 0 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td><span style="display:inline-block;background:#eff6ff;color:#1e3a8a;font-size:13px;font-weight:700;padding:4px 12px;border-radius:6px;">${centroCusto}</span></td>
          <td style="text-align:right;"><span style="color:#64748b;font-size:13px;">${items.length} item(s) · <strong style="color:#059669;">R$ ${totalCC.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span></td>
        </tr>
      </table>
    </div>
    <div style="padding:12px 28px 0 28px;">
`;

      for (const item of items) {
        const linkSolicitacao = item.link_app_compras
          || (item.purchase_id ? `${APP_BASE_URL}/Compras?id=${item.purchase_id}` : `${APP_BASE_URL}/Compras`);

        const docsLinks: string[] = [];
        if (item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url) {
          docsLinks.push(`<a href="${item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url}" style="color:#059669;font-size:12px;text-decoration:none;">📄 NF PDF</a>`);
        }
        if (item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url) {
          docsLinks.push(`<a href="${item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url}" style="color:#6b7280;font-size:12px;text-decoration:none;">📄 XML</a>`);
        }
        if (item.comprovante_url) {
          docsLinks.push(`<a href="${item.comprovante_url}" style="color:#7c3aed;font-size:12px;text-decoration:none;">📄 Comprovante</a>`);
        }

        emailBody += `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-size:15px;font-weight:600;color:#1e293b;">${item.purchase_descricao || 'N/A'}</div>
              <div style="font-size:13px;color:#475569;margin-top:4px;"><strong>Fornecedor:</strong> ${item.fornecedor_nome || 'N/A'}${item.fornecedor_cnpj ? ` · CNPJ: ${item.fornecedor_cnpj}` : ''}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;"><strong>Rubrica:</strong> ${item.rubrica_grupo || item.rubrica_nome || 'N/A'}${item.data_emissao_nf ? ` · <strong>NF:</strong> ${new Date(item.data_emissao_nf).toLocaleDateString('pt-BR')}` : ''}</div>
            </td>
            <td style="vertical-align:top;text-align:right;width:120px;">
              <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;">Valor</div>
              <div style="font-size:18px;font-weight:700;color:#059669;margin-top:2px;">R$ ${(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </td>
          </tr>
        </table>
        ${docsLinks.length > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;">${docsLinks.join(' &nbsp;·&nbsp; ')}</div>` : ''}
        <div style="margin-top:10px;">
          <a href="${linkSolicitacao}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:13px;font-weight:600;padding:8px 18px;border-radius:6px;text-decoration:none;">Ver solicitação no app →</a>
        </div>
      </div>
`;
      }

      emailBody += `    </div>\n`;
    }

    emailBody += `
    <!-- Footer -->
    <div style="padding:16px 28px 24px 28px;">
      <div style="height:1px;background:#e2e8f0;margin-bottom:16px;"></div>
      <div style="text-align:center;">
        <a href="${APP_BASE_URL}/Compras?tab=lista" style="display:inline-block;background:#1e293b;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Acessar Solicitações de Compras</a>
      </div>
      <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:16px;">
        Museus Centro · Viaduto das Artes · E-mail automático gerado às ${dataFormatada}
      </p>
    </div>
  </div>
</body>
</html>`;

    const digestId = `DIGEST-DIARIO-${now.toISOString().split('T')[0]}-${Date.now()}`;
    const subject = `Resumo Diário de Compras Aprovadas — ${now.toLocaleDateString('pt-BR')} (${pendingItems.length} compra${pendingItems.length > 1 ? 's' : ''})`;

    // Enviar para destinatários fixos usando asServiceRole (obrigatório em contexto de cron)
    await Promise.all(RECIPIENTS.map(recipient =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: recipient,
        subject,
        body: emailBody,
        from_name: 'Museus Centro — Compras'
      }).catch((e: any) => console.warn(`Falha ao enviar para ${recipient}:`, e?.message))
    ));

    // Marcar todos como enviados
    for (const item of pendingItems) {
      await base44.asServiceRole.entities.PurchaseNotificationQueue.update(item.id, {
        status: 'enviado',
        sent_at: now.toISOString(),
        digest_id: digestId
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      message: `Digest diário enviado com sucesso`,
      digestId,
      itemsSent: pendingItems.length,
      recipients: RECIPIENTS
    });

  } catch (error: any) {
    console.error('Erro ao enviar digest de compras:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});