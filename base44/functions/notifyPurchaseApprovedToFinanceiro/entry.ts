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
  const numero = purchase?.nf_numero || purchase?.numero_nota_fiscal || purchase?.id || 'SN';
  const centro = clean(purchase?.centro_custo || 'Geral');
  const fornecedor = clean(purchase?.fornecedor_nome || 'Fornecedor');
  const natureza = clean(rubrica?.rubrica || rubrica?.nome || purchase?.categoria || 'Despesa');
  const mes = mesExtenso(purchase?.nf_data_emissao || purchase?.data_emissao_nf || purchase?.created_date);
  const year = ano(purchase?.nf_data_emissao || purchase?.data_emissao_nf || purchase?.created_date);
  const valorNome = moeda(valor);
  return `${numero}-${centro}-${fornecedor}-${natureza}-MuseusCentro-${mes}-${year}-R$-${valorNome}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
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

    const body = `Segue arquivos de nota fiscal aprovados.

O pagamento já foi aprovado pela coordenação.

Dados da solicitação:
- Centro de custo: ${purchase?.centro_custo || ''}
- Rubrica: ${rubrica?.grupo || ''} | ${rubrica?.rubrica || rubrica?.nome || ''}
- Valor da nota fiscal: R$ ${moeda(valor)}
- Saldo previsto da rubrica após pagamento: R$ ${moeda(saldoPosPagamento)}
- Emissor da nota fiscal: ${purchase?.fornecedor_nome || ''}
- Data de emissão da nota fiscal: ${purchase?.nf_data_emissao || purchase?.data_emissao_nf || ''}
- Dados bancários / depósito: ${purchase?.detalhe_pagamento || ''}

Arquivos anexos:
- Nota fiscal PDF
- XML da nota fiscal, se houver
- Comprovante/recibo/boleto, se houver`;

    const baseName = buildBaseName(purchase, rubrica, valor);
    const pdfUrl = purchase?.nota_fiscal_pdf_url || purchase?.nota_fiscal_url;
    const xmlUrl = purchase?.nota_fiscal_xml_url || purchase?.xml_url;
    const compUrl = purchase?.comprovante_url;

    const attachments = [];
    if (pdfUrl) attachments.push({ url: pdfUrl, filename: `NF-${baseName}.pdf` });
    if (xmlUrl) attachments.push({ url: xmlUrl, filename: `XML-${baseName}.xml` });
    if (compUrl) attachments.push({ url: compUrl, filename: `COMP-${baseName}.pdf` });

    for (const recipient of finalRecipients) {
      await base44.integrations.Core.SendEmail({
        to: recipient,
        subject: 'Arquivos fiscais aprovados para pagamento — Museus Centro',
        body,
      });
    }

    return Response.json({ success: true, recipients: finalRecipients, attachments_count: attachments.length });
  } catch (e) {
    return Response.json({ error: e?.message || 'Erro ao enviar notificação' }, { status: 500 });
  }
});