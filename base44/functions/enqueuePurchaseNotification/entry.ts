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
      return Response.json({
        success: true,
        already_queued: true,
        message: 'Esta solicitação já está no resumo diário de pagamentos.',
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
      purchase_snapshot_json: snapshot
    });

    return Response.json({
      success: true,
      already_queued: false,
      message: 'Solicitação adicionada ao resumo diário de pagamentos das 05:00.',
      queueId: queueItem.id,
      batchSlot,
      batchScheduledAt: batchScheduledAt.toISOString()
    });

  } catch (error) {
    console.error('Erro ao adicionar à fila de notificações:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
