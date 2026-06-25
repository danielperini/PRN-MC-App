import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { purchaseId } = await req.json();
    if (!purchaseId) {
      return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
    }

    // Buscar a solicitação
    const purchases = await base44.entities.PurchaseRequest.filter({ id: purchaseId });
    if (!purchases || purchases.length === 0) {
      return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    }

    const purchase = purchases[0];

    // Determinar slot do lote baseado no horário atual (UTC-3)
    const now = new Date();
    const hour = now.getHours();
    const batchSlot = hour < 12 ? 'manha' : 'tarde';

    // Calcular próximo horário de envio
    // Manhã: 09:00, Tarde: 16:15
    let nextSend = new Date(now);
    if (batchSlot === 'manha') {
      nextSend.setHours(9, 0, 0, 0);
      if (now >= nextSend) {
        // Já passou das 9h, agendar para amanhã 9h
        nextSend.setDate(nextSend.getDate() + 1);
      }
    } else {
      nextSend.setHours(16, 15, 0, 0);
      if (now >= nextSend) {
        // Já passou das 16:15, agendar para amanhã 9h (slot da manhã)
        nextSend.setDate(nextSend.getDate() + 1);
        nextSend.setHours(9, 0, 0, 0);
      }
    }

    // Buscar rubrica vinculada
    let rubricaNome = null;
    let rubricaGrupo = null;
    if (purchase.rubrica_id) {
      const rubricas = await base44.entities.Rubrica.filter({ id: purchase.rubrica_id });
      if (rubricas && rubricas.length > 0) {
        rubricaNome = rubricas[0].rubrica || rubricas[0].nome;
        rubricaGrupo = rubricas[0].grupo;
      }
    }

    // Criar registro na fila
    const queueRecord = {
      purchase_id: purchase.id,
      purchase_descricao: purchase.descricao_item,
      fornecedor_nome: purchase.fornecedor_nome,
      fornecedor_cnpj: purchase.fornecedor_cnpj,
      centro_custo: purchase.centro_custo,
      rubrica_id: purchase.rubrica_id,
      rubrica_nome: rubricaNome,
      rubrica_grupo: rubricaGrupo,
      natureza_despesa: purchase.natureza_despesa,
      valor: purchase.valor_solicitado,
      status_solicitacao: purchase.status,
      nota_fiscal_pdf_url: purchase.nf_pdf_url,
      nota_fiscal_xml_url: purchase.nf_chave_acesso ? `https://www.fazenda.gov.br/nfe/${purchase.nf_chave_acesso}` : null,
      xml_url: purchase.orcamento_url,
      comprovante_url: purchase.comprovante_url,
      drive_backup_nf_pdf_link: purchase.drive_backup_files?.find(f => f.tipo === 'NF')?.drive_url || null,
      drive_backup_nf_xml_link: purchase.drive_backup_files?.find(f => f.tipo === 'XML')?.drive_url || null,
      detalhe_pagamento: purchase.detalhe_pagamento,
      data_emissao_nf: purchase.nf_data_emissao,
      link_app_compras: `https://app.base44.com/museus-centro/Compras`,
      status: 'pendente_lote',
      requested_by: user.email,
      requested_at: now.toISOString(),
      batch_slot: batchSlot,
      batch_scheduled_at: nextSend.toISOString(),
      purchase_snapshot_json: purchase
    };

    const created = await base44.entities.PurchaseNotificationQueue.create(queueRecord);

    return Response.json({
      success: true,
      message: 'Solicitação adicionada à fila de notificação',
      data: {
        queueId: created.id,
        batchSlot: batchSlot,
        scheduledAt: nextSend.toISOString()
      }
    });
  } catch (error) {
    console.error('Erro ao adicionar à fila de notificação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});