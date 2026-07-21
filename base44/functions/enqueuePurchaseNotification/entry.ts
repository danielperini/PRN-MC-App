import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Calcular próximo slot (horário de Brasília)
    let batchSlot;
    let batchScheduledAt;
    
    if (currentHour < 9) {
      // Antes das 09h00: lote da manhã de hoje
      batchSlot = 'manha';
      batchScheduledAt = new Date(now);
      batchScheduledAt.setHours(9, 0, 0, 0);
    } else if (currentHour < 16 || (currentHour === 16 && currentMinute < 15)) {
      // Entre 09h00 e 16h15: lote da tarde de hoje
      batchSlot = 'tarde';
      batchScheduledAt = new Date(now);
      batchScheduledAt.setHours(16, 15, 0, 0);
    } else {
      // Depois das 16h15: lote da manhã de amanhã
      batchSlot = 'manha';
      batchScheduledAt = new Date(now);
      batchScheduledAt.setDate(batchScheduledAt.getDate() + 1);
      batchScheduledAt.setHours(9, 0, 0, 0);
    }

    // Verificar se já existe registro pendente para este purchase_id e slot
    const existing = await base44.entities.PurchaseNotificationQueue.filter({
      purchase_id: purchaseId,
      batch_slot: batchSlot,
      status: 'pendente_lote'
    });

    if (existing && existing.length > 0) {
      return Response.json({
        success: true,
        already_queued: true,
        message: 'Esta solicitação já está no próximo lote de notificações.',
        existingId: existing[0].id
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
      link_app_compras: `https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras?purchaseId=${purchaseId}`
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
      link_app_compras: snapshot.link_app_compras,
      purchase_snapshot_json: snapshot
    });

    return Response.json({
      success: true,
      already_queued: false,
      message: 'Solicitação adicionada ao próximo lote de notificações.',
      queueId: queueItem.id,
      batchSlot,
      batchScheduledAt: batchScheduledAt.toISOString()
    });

  } catch (error) {
    console.error('Erro ao adicionar à fila de notificações:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});