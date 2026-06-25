import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FIXED_EMAIL = 'daniel@periniprojetos.com.br';

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clean(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '');
}

function mesExtenso(dateValue) {
  const meses = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const d = dateValue ? new Date(dateValue) : new Date();
  const month = d.getMonth();
  return meses[Number.isFinite(month) ? month : new Date().getMonth()] || 'Mes';
}

function ano(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

function buildBaseName(purchase, rubrica, valor) {
  const numero = purchase?.nf_numero || purchase?.id || 'SN';
  const centro = clean(purchase?.centro_custo || 'Geral');
  const fornecedor = clean(purchase?.fornecedor_nome || 'Fornecedor');
  const natureza = clean(rubrica?.rubrica || rubrica?.nome || purchase?.categoria || 'Despesa');
  const mes = mesExtenso(purchase?.nf_data_emissao || purchase?.created_date);
  const year = ano(purchase?.nf_data_emissao || purchase?.created_date);
  return `${numero}-${centro}-${fornecedor}-${natureza}-MuseusCentro-${mes}-${year}-R$-${moeda(valor)}`;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user = null;

  try {
    user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { purchaseId, recipients = [FIXED_EMAIL] } = await req.json();
    if (!purchaseId) return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });

    const finalRecipients = [...new Set(
      (recipients?.length ? recipients : [FIXED_EMAIL])
        .map((e) => String(e || '').trim())
        .filter((e) => e.includes('@'))
    )];
    if (!finalRecipients.length) finalRecipients.push(FIXED_EMAIL);

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id).catch(() => null)
      : null;

    const valor = toNumber(
      purchase?.valor_pago || purchase?.valor_aprovado || purchase?.valor_aprovado_admin || purchase?.valor_solicitado
    );

    const saldoAtual =
      toNumber(rubrica?.valor_rubrica || rubrica?.valor_total) -
      toNumber(rubrica?.valor_utilizado) -
      toNumber(rubrica?.saldo_comprometido);
    const saldoPosPagamento = saldoAtual - valor;

    // Declarar URLs antes de usar
    const pdfUrl = purchase?.nota_fiscal_pdf_url || purchase?.nota_fiscal_url;
    const xmlUrl = purchase?.nota_fiscal_xml_url || purchase?.xml_url;
    const compUrl = purchase?.comprovante_url;

    const appUrl = `https://museus-centro.base44-apps.com/Compras`;
    const nfDataFormatada = (() => {
      const d = purchase?.nf_data_emissao || purchase?.data_emissao_nf;
      if (!d) return '—';
      const dt = new Date(d + 'T12:00:00');
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    })();

    const rubricaTexto = [rubrica?.grupo, rubrica?.rubrica || rubrica?.nome].filter(Boolean).join(' › ');

    // Link da pasta de backup no Drive
    const driveFolderUrl = purchase?.drive_backup_folder_url || null;
    const driveFileLinks = (purchase?.drive_backup_files || [])
      .filter(f => f?.webViewLink || f?.url)
      .map(f => ({ name: f?.name || f?.filename || 'Arquivo', url: f?.webViewLink || f?.url }));

    // Helpers para HTML de documentos
    function docButton(label, url, color) {
      if (!url) return '';
      return `<a href="${url}" target="_blank" style="display:inline-block;margin:4px 6px 4px 0;padding:8px 16px;background:${color};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">${label}</a>`;
    }

    const docButtons = [
      docButton('📄 Nota Fiscal PDF', pdfUrl, '#1a56db'),
      docButton('📋 XML da NF', xmlUrl, '#0e9f6e'),
      docButton('🧾 Comprovante', compUrl, '#7e3af2'),
    ].filter(Boolean).join('');

    const driveFileButtons = driveFileLinks.map(f =>
      `<a href="${f.url}" target="_blank" style="display:inline-block;margin:4px 6px 4px 0;padding:7px 14px;background:#f3f4f6;color:#374151;text-decoration:none;border-radius:6px;font-size:12px;border:1px solid #d1d5db;">📎 ${f.name}</a>`
    ).join('');

    const pagamentoSection = purchase?.detalhe_pagamento
      ? `<tr><td colspan="2" style="padding:12px 16px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Dados para Pagamento</div>
          <div style="font-size:14px;color:#111827;white-space:pre-line;">${purchase.detalhe_pagamento}</div>
         </td></tr>`
      : '';

    const body = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:#111827;border-radius:12px 12px 0 0;padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Projeto Museus Centro · Viaduto das Artes</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;line-height:1.3;">Pagamento Aprovado<br>Aguardando Processamento</div>
        </td>
        <td align="right" style="vertical-align:top;">
          <div style="background:#22c55e;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;white-space:nowrap;">✓ APROVADO</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#ffffff;padding:0;">

    <!-- Intro -->
    <div style="padding:24px 32px 8px;font-size:14px;color:#374151;line-height:1.6;">
      Uma solicitação de pagamento foi aprovada pela coordenação e está aguardando processamento financeiro.
    </div>

    <!-- Valor destaque -->
    <div style="margin:16px 32px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px 24px;display:flex;align-items:center;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <div style="font-size:12px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Valor da Nota Fiscal</div>
          <div style="font-size:32px;font-weight:800;color:#15803d;margin-top:4px;">R$ ${moeda(valor)}</div>
        </td>
        <td align="right" style="vertical-align:middle;">
          <div style="font-size:12px;color:#6b7280;">Saldo após pagamento</div>
          <div style="font-size:18px;font-weight:700;color:${saldoPosPagamento >= 0 ? '#15803d' : '#dc2626'};">R$ ${moeda(saldoPosPagamento)}</div>
        </td>
      </tr></table>
    </div>

    <!-- Dados da solicitação -->
    <div style="padding:8px 32px 4px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Dados da Solicitação</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;width:45%;border-bottom:1px solid #e5e7eb;">Fornecedor / Emissor</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '—'}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">CNPJ / CPF</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${purchase?.fornecedor_cnpj || purchase?.nf_emitente_cpf_cnpj || '—'}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Número da NF</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb;">${purchase?.nf_numero || '—'}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Data de Emissão</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${nfDataFormatada}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Centro de Custo</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${purchase?.centro_custo || '—'}</td>
        </tr>
        <tr>
          <td style="padding:11px 16px;font-size:12px;color:#6b7280;font-weight:600;">Rubrica Orçamentária</td>
          <td style="padding:11px 16px;font-size:13px;color:#111827;">${rubricaTexto || '—'}</td>
        </tr>
        ${pagamentoSection}
      </table>
    </div>

    <!-- Documentos Fiscais -->
    <div style="padding:20px 32px 4px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Documentos Fiscais</div>
      ${docButtons || '<span style="color:#9ca3af;font-size:13px;">Nenhum arquivo anexado</span>'}
    </div>

    <!-- Backup no Drive -->
    ${driveFolderUrl || driveFileButtons ? `
    <div style="padding:16px 32px 4px;">
      <div style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Backup no Google Drive</div>
      ${driveFolderUrl ? `<a href="${driveFolderUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#1967d2;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:8px;">
        <img src="https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" width="16" height="16" style="vertical-align:middle;" alt="Drive"/>
        Abrir Pasta no Drive
      </a><br>` : ''}
      ${driveFileButtons}
    </div>` : ''}

    <!-- CTA -->
    <div style="padding:24px 32px 28px;">
      <a href="${appUrl}" target="_blank" style="display:block;text-align:center;background:#111827;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Acessar Solicitação no Sistema →
      </a>
    </div>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
    <div style="font-size:12px;color:#9ca3af;">Coordenação · Museus Centro · Viaduto das Artes</div>
    <div style="font-size:11px;color:#d1d5db;margin-top:4px;">Esta é uma mensagem automática do sistema de gestão do projeto.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    // Enviar para cada destinatário e registrar resultado
    const detalhes = [];
    let algumSucesso = false;
    let algumErro = false;

    for (const recipient of finalRecipients) {
      try {
        await base44.integrations.Core.SendEmail({
          to: recipient,
          subject: `✅ Pagamento Aprovado — ${purchase?.fornecedor_nome || purchase?.nf_emitente_nome || 'Fornecedor'} · R$ ${moeda(valor)} · Museus Centro`,
          body,
        });
        detalhes.push({ email: recipient, status: 'sucesso' });
        algumSucesso = true;
      } catch (err) {
        detalhes.push({ email: recipient, status: 'falha', erro: err?.message || 'Erro desconhecido' });
        algumErro = true;
      }
    }

    const statusLog = algumSucesso && algumErro ? 'falha_parcial' : algumSucesso ? 'sucesso' : 'falha';

    // Gravar log
    await base44.asServiceRole.entities.NotificacaoCompraLog.create({
      purchase_id: purchaseId,
      purchase_descricao: purchase?.descricao_item || purchase?.objeto || '',
      fornecedor: purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '',
      valor,
      recipients: finalRecipients,
      status: statusLog,
      enviado_por: user?.email || '',
      detalhes,
      disparado_em: new Date().toISOString(),
    });

    if (statusLog === 'falha') {
      return Response.json({ error: 'Falha ao enviar para todos os destinatários', detalhes }, { status: 500 });
    }

    return Response.json({ success: true, status: statusLog, recipients: finalRecipients, detalhes });
  } catch (e) {
    // Tentar registrar falha geral no log
    try {
      await base44.asServiceRole.entities.NotificacaoCompraLog.create({
        purchase_id: 'desconhecido',
        status: 'falha',
        enviado_por: user?.email || '',
        erro: e?.message || 'Erro desconhecido',
        disparado_em: new Date().toISOString(),
      });
    } catch (_) {}
    return Response.json({ error: e?.message || 'Erro ao enviar notificação' }, { status: 500 });
  }
});