import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const IMMEDIATE_RECIPIENTS = [
  'josianeamancio@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
  'adm@viadutodasartes.org.br'
];
const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function driveLinks(purchase: any) {
  const links: { nome: string; url: string }[] = [];
  const add = (nome: any, url: any) => {
    if (!url || !String(url).startsWith('http') || links.some((item) => item.url === url)) return;
    links.push({ nome: String(nome || 'Arquivo'), url: String(url) });
  };
  for (const file of purchase?.drive_backup_files || []) add(file.name || file.tipo, file.url || file.drive_url || file.webViewLink);
  add('Pasta da solicitação no Google Drive', purchase?.drive_backup_folder_url);
  return links;
}

async function sendImmediateApprovalEmail(base44: any, purchase: any, rubrica: any) {
  const solicitante = purchase.solicitante_nome || purchase.requester_name || purchase.profissional_nome || purchase.user_name || purchase.created_by || purchase.user_email || 'Não informado';
  const valor = Number(purchase.valor_solicitado || purchase.valor_aprovado || purchase.valor_total || 0);
  const appLink = `${APP_URL}?purchaseId=${encodeURIComponent(purchase.id)}`;
  const links = driveLinks(purchase);
  const arquivosHtml = links.length
    ? `<ul>${links.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.nome)}</a></li>`).join('')}</ul>`
    : '<p><em>O backup não retornou um link do Google Drive. Consulte os arquivos diretamente na solicitação do app.</em></p>';
  const subject = `Nota fiscal aprovada para pagamento — ${purchase.fornecedor_nome || purchase.descricao_item || purchase.id}`;
  const body = `
<h2>Nota fiscal aprovada para pagamento</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
  <tr><td><b>Solicitante</b></td><td>${escapeHtml(solicitante)}</td></tr>
  <tr><td><b>Fornecedor</b></td><td>${escapeHtml(purchase.fornecedor_nome || '-')}</td></tr>
  <tr><td><b>Descrição</b></td><td>${escapeHtml(purchase.descricao_item || '-')}</td></tr>
  <tr><td><b>Valor</b></td><td>${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>
  <tr><td><b>Rubrica</b></td><td>${escapeHtml(rubrica?.rubrica || rubrica?.nome || purchase.rubrica_nome || '-')}</td></tr>
</table>
<h3>Arquivos no Google Drive</h3>
${arquivosHtml}
<p><a href="${escapeHtml(appLink)}"><b>Abrir esta solicitação no app</b></a></p>
<p>Após realizar o pagamento, envie o comprovante, se houver, na própria solicitação e marque a opção <b>Pago</b>. Ao marcar como pago, o remetente receberá a notificação de pagamento.</p>
<p style="color:#666;font-size:12px">Mensagem automática — Plataforma Museus Centro.</p>`.trim();

  const failures: string[] = [];
  for (const to of IMMEDIATE_RECIPIENTS) {
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body });
    } catch (error: any) {
      failures.push(`${to}: ${error?.message || 'falha no envio'}`);
    }
  }
  return failures;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { purchaseId } = await req.json();
    
    if (!purchaseId) {
      return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
    }

    // Buscar solicitação
    const purchase = await base44.entities.PurchaseRequest.get(purchaseId);
    
    if (!purchase) {
      return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    }

    // Buscar rubrica vinculada
    let rubrica = null;
    if (purchase.rubrica_id) {
      rubrica = await base44.entities.Rubrica.get(purchase.rubrica_id);
    }

    const now = new Date();
    // Próximo resumo às 05:00 no horário de Brasília. O campo batch_slot é
    // mantido como "manha" por compatibilidade com a entidade existente.
    const batchSlot = 'manha';
    const localDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const batchScheduledAt = new Date(`${localDate}T08:00:00.000Z`);
    if (now >= batchScheduledAt) batchScheduledAt.setUTCDate(batchScheduledAt.getUTCDate() + 1);

    // Verificar se já existe registro pendente para este purchase_id e slot
    const existing = await base44.entities.PurchaseNotificationQueue.filter({
      purchase_id: purchaseId,
      batch_slot: batchSlot,
      status: 'pendente_lote'
    });

    if (existing && existing.length > 0) {
      const existingItem = existing[0];
      const existingSnapshot = existingItem.purchase_snapshot_json || {};
      let immediateEmailFailures: string[] = [];
      if (!existingSnapshot.immediate_email_sent_at) {
        immediateEmailFailures = await sendImmediateApprovalEmail(base44, purchase, rubrica);
        if (immediateEmailFailures.length === 0) {
          await base44.entities.PurchaseNotificationQueue.update(existingItem.id, {
            purchase_snapshot_json: { ...existingSnapshot, immediate_email_sent_at: new Date().toISOString() }
          });
        }
      }
      return Response.json({
        success: true,
        already_queued: true,
        message: 'Esta solicitação já está no resumo diário de pagamentos.',
        existingId: existingItem.id,
        immediate_email_sent: immediateEmailFailures.length === 0,
        immediate_email_failures: immediateEmailFailures
      });
    }

    // Montar snapshot
    const snapshot = {
      descricao_item: purchase.descricao_item,
      fornecedor_nome: purchase.fornecedor_nome,
      fornecedor_cnpj: purchase.fornecedor_cnpj,
      centro_custo: purchase.centro_custo,
      rubrica_id: purchase.rubrica_id,
      rubrica_nome: rubrica?.rubrica || rubrica?.nome,
      rubrica_grupo: rubrica?.grupo,
      natureza_despesa: purchase.natureza_despesa || rubrica?.natureza_despesa,
      valor: purchase.valor_solicitado || purchase.valor_aprovado,
      status_solicitacao: purchase.status,
      nota_fiscal_pdf_url: purchase.nf_pdf_url,
      nota_fiscal_xml_url: purchase.nf_xml_url,
      xml_url: purchase.orcamento_url,
      comprovante_url: purchase.comprovante_url,
      drive_backup_nf_pdf_link: purchase.drive_backup_files?.find(f => f.tipo === 'NF')?.url,
      drive_backup_nf_xml_link: purchase.drive_backup_files?.find(f => f.tipo === 'XML')?.url,
      detalhe_pagamento: purchase.detalhe_pagamento,
      data_emissao_nf: purchase.nf_data_emissao,
      solicitante_nome: purchase.solicitante_nome || purchase.requester_name || purchase.profissional_nome || purchase.user_name || purchase.created_by || purchase.user_email,
      link_app_compras: `${APP_URL}?purchaseId=${purchaseId}`
    };

    // Criar registro na fila
    const queueItem = await base44.entities.PurchaseNotificationQueue.create({
      purchase_id: purchaseId,
      purchase_descricao: purchase.descricao_item,
      fornecedor_nome: purchase.fornecedor_nome,
      fornecedor_cnpj: purchase.fornecedor_cnpj,
      centro_custo: purchase.centro_custo,
      rubrica_id: purchase.rubrica_id,
      rubrica_nome: snapshot.rubrica_nome,
      rubrica_grupo: snapshot.rubrica_grupo,
      natureza_despesa: snapshot.natureza_despesa,
      valor: snapshot.valor,
      status: 'pendente_lote',
      requested_by: user.email,
      requested_at: now.toISOString(),
      batch_slot: batchSlot,
      batch_scheduled_at: batchScheduledAt.toISOString(),
      purchase_snapshot_json: snapshot
    });

    const immediateEmailFailures = await sendImmediateApprovalEmail(base44, purchase, rubrica);
    if (immediateEmailFailures.length === 0) {
      await base44.entities.PurchaseNotificationQueue.update(queueItem.id, {
        purchase_snapshot_json: { ...snapshot, immediate_email_sent_at: new Date().toISOString() }
      });
    }

    return Response.json({
      success: true,
      already_queued: false,
      message: 'Solicitação adicionada ao resumo diário de pagamentos das 05:00.',
      queueId: queueItem.id,
      immediate_email_sent: immediateEmailFailures.length === 0,
      immediate_email_failures: immediateEmailFailures,
      batchSlot,
      batchScheduledAt: batchScheduledAt.toISOString()
    });

  } catch (error) {
    console.error('Erro ao adicionar à fila de notificações:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
