import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RECIPIENTS = [
  'josianeamancio@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
  'adm@viadutodasartes.org.br',
];

const OPEN_PAYMENT_STATUSES = new Set(['APROVADO_COORD', 'APROVADO_ADMIN']);
const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentValue(purchase: Record<string, unknown>) {
  return numberValue(
    purchase.valor_pago ||
    purchase.valor_aprovado_admin ||
    purchase.valor_aprovado ||
    purchase.nf_valor_total ||
    purchase.valor_solicitado ||
    purchase.valor_total
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(value: unknown) {
  return numberValue(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDate(value: unknown) {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function isStillOpen(purchase: Record<string, unknown>) {
  return OPEN_PAYMENT_STATUSES.has(String(purchase.status || '').toUpperCase()) &&
    purchase.pago !== true &&
    purchase.quitada !== true &&
    String(purchase.status_pagamento || '').toLowerCase() !== 'pago';
}

function purchaseLink(purchase: Record<string, unknown>) {
  return `${APP_URL}?purchaseId=${encodeURIComponent(String(purchase.id || ''))}`;
}

function documentLinks(purchase: Record<string, unknown>) {
  const links = [
    ['NF', purchase.nota_fiscal_url || purchase.nf_pdf_url],
    ['XML', purchase.nf_xml_url || purchase.nota_fiscal_xml_url],
    ['Comprovante', purchase.comprovante_pagamento_url || purchase.comprovante_url],
  ].filter(([, url]) => Boolean(url));

  links.push(['Abrir pedido', purchaseLink(purchase)]);
  return links
    .map(([label, url]) => `<a href="${escapeHtml(url)}" style="color:#1d4ed8">${label}</a>`)
    .join(' · ');
}

function buildEmail(purchases: Array<Record<string, unknown>>, mode: string) {
  const now = new Date();
  const total = purchases.reduce((sum, purchase) => sum + paymentValue(purchase), 0);
  const rows = purchases.map((purchase) => `
    <tr>
      <td style="padding:9px;border:1px solid #dbe3ec">${escapeHtml(purchase.nf_numero || '-')}</td>
      <td style="padding:9px;border:1px solid #dbe3ec">
        <strong>${escapeHtml(purchase.fornecedor_nome || purchase.nf_emitente_nome || 'Fornecedor não informado')}</strong><br>
        <span style="color:#64748b">${escapeHtml(purchase.descricao_item || purchase.objeto || '-')}</span>
      </td>
      <td style="padding:9px;border:1px solid #dbe3ec">${escapeHtml(purchase.centro_custo || 'Geral')}</td>
      <td style="padding:9px;border:1px solid #dbe3ec">${escapeHtml(purchase.rubrica_nome || purchase.categoria || '-')}</td>
      <td style="padding:9px;border:1px solid #dbe3ec">${formatDate(purchase.nf_data_emissao || purchase.created_date)}</td>
      <td style="padding:9px;border:1px solid #dbe3ec;text-align:right;white-space:nowrap"><strong>${formatMoney(paymentValue(purchase))}</strong></td>
      <td style="padding:9px;border:1px solid #dbe3ec">${documentLinks(purchase)}</td>
    </tr>
  `).join('');

  const emptyState = `
    <div style="padding:18px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;color:#166534">
      Nenhum pedido de pagamento está em aberto neste momento.
    </div>
  `;

  const table = `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#eff6ff;color:#1e3a8a">
          <th style="padding:9px;border:1px solid #dbe3ec;text-align:left">NF</th>
          <th style="padding:9px;border:1px solid #dbe3ec;text-align:left">Fornecedor / pedido</th>
          <th style="padding:9px;border:1px solid #dbe3ec;text-align:left">Centro</th>
          <th style="padding:9px;border:1px solid #dbe3ec;text-align:left">Rubrica</th>
          <th style="padding:9px;border:1px solid #dbe3ec;text-align:left">Data</th>
          <th style="padding:9px;border:1px solid #dbe3ec;text-align:right">Valor</th>
          <th style="padding:9px;border:1px solid #dbe3ec;text-align:left">Documentos</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const testLabel = mode === 'immediate_test'
    ? '<p style="padding:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px"><strong>TESTE IMEDIATO:</strong> este envio valida os três destinatários antes do rito diário.</p>'
    : '';

  return `
    <html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.45">
      <div style="max-width:1100px;margin:0 auto;padding:20px">
        <h2 style="margin:0;color:#1d4ed8">Pedidos de pagamento em aberto</h2>
        <p style="color:#64748b">Atualizado em ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
        ${testLabel}
        <div style="display:flex;gap:12px;margin:16px 0">
          <div style="padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px"><strong>${purchases.length}</strong><br><span style="color:#64748b">pedido(s) em aberto</span></div>
          <div style="padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px"><strong>${formatMoney(total)}</strong><br><span style="color:#64748b">valor total</span></div>
        </div>
        ${purchases.length ? table : emptyState}
        <p style="margin-top:20px"><a href="${APP_URL}" style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:white;text-decoration:none;border-radius:6px">Abrir solicitações</a></p>
        <p style="font-size:12px;color:#64748b">Resumo automático do Museus Centro. O envio diário ocorre às 05:00 (horário de Brasília) e considera somente pedidos ainda não pagos.</p>
      </div>
    </body></html>
  `;
}

async function listOpenPurchases(service: any) {
  const [coordApproved, adminApproved] = await Promise.all([
    service.entities.PurchaseRequest.filter({ status: 'APROVADO_COORD' }, '-created_date', 1000),
    service.entities.PurchaseRequest.filter({ status: 'APROVADO_ADMIN' }, '-created_date', 1000),
  ]);

  const unique = new Map<string, Record<string, unknown>>();
  for (const purchase of [...(coordApproved || []), ...(adminApproved || [])]) {
    if (purchase?.id && isStillOpen(purchase)) unique.set(purchase.id, purchase);
  }

  return [...unique.values()].sort((a, b) =>
    String(b.created_date || '').localeCompare(String(a.created_date || ''))
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === 'immediate_test' ? 'immediate_test' : 'scheduled';
    const user = await base44.auth.me().catch(() => null);

    if (mode === 'immediate_test') {
      const email = String(user?.email || '').toLowerCase();
      const isAuthorized = user && (
        user.role === 'admin' ||
        String(user.base_role || '').toUpperCase() === 'COORDENADOR' ||
        RECIPIENTS.includes(email)
      );
      if (!isAuthorized) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const purchases = await listOpenPurchases(base44.asServiceRole);
    const html = buildEmail(purchases, mode);
    const dateLabel = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const prefix = mode === 'immediate_test' ? '[TESTE IMEDIATO] ' : '';

    await Promise.all(RECIPIENTS.map((to) => base44.integrations.Core.SendEmail({
      to,
      subject: `${prefix}[Museus Centro] Pedidos de pagamento em aberto — ${dateLabel}`,
      body: html,
      from_name: 'Museus Centro - Solicitações',
    })));

    return Response.json({
      success: true,
      mode,
      recipients: RECIPIENTS,
      openPurchases: purchases.length,
      totalValue: purchases.reduce((sum, purchase) => sum + paymentValue(purchase), 0),
      emailsSent: RECIPIENTS.length,
    });
  } catch (error) {
    console.error('[sendPurchaseNotificationDigest] Falha no resumo de pagamentos:', error);
    return Response.json({
      success: false,
      error: error?.message || String(error),
    }, { status: 500 });
  }
});
