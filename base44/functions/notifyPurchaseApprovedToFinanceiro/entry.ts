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

    const anexosLinhas = [];
    if (pdfUrl) anexosLinhas.push(`• Nota Fiscal PDF: ${pdfUrl}`);
    if (xmlUrl) anexosLinhas.push(`• XML da Nota Fiscal: ${xmlUrl}`);
    if (compUrl) anexosLinhas.push(`• Comprovante/Recibo: ${compUrl}`);
    const anexosTexto = anexosLinhas.length > 0 ? anexosLinhas.join('\n') : '• Nenhum arquivo anexado';

    const rubricaTexto = [rubrica?.grupo, rubrica?.rubrica || rubrica?.nome].filter(Boolean).join(' › ');

    const body = `Prezado(a),

Uma solicitação de pagamento foi aprovada pela coordenação do projeto Museus Centro e está aguardando processamento financeiro.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DADOS DA SOLICITAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fornecedor/Emissor:  ${purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '—'}
CNPJ/CPF:            ${purchase?.fornecedor_cnpj || purchase?.nf_emitente_cpf_cnpj || '—'}
Número da NF:        ${purchase?.nf_numero || '—'}
Data de emissão:     ${nfDataFormatada}

Valor da nota fiscal: R$ ${moeda(valor)}
Centro de custo:      ${purchase?.centro_custo || '—'}
Rubrica orçamentária: ${rubricaTexto || '—'}
Saldo da rubrica após pagamento: R$ ${moeda(saldoPosPagamento)}

${purchase?.detalhe_pagamento ? `Dados para pagamento:\n${purchase.detalhe_pagamento}\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENTOS FISCAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${anexosTexto}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Acesse a solicitação completa no sistema:
${appUrl}

Atenciosamente,
Coordenação — Museus Centro
Viaduto das Artes`;

    // Enviar para cada destinatário e registrar resultado
    const detalhes = [];
    let algumSucesso = false;
    let algumErro = false;

    for (const recipient of finalRecipients) {
      try {
        await base44.integrations.Core.SendEmail({
          to: recipient,
          subject: 'Arquivos fiscais aprovados para pagamento — Museus Centro',
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