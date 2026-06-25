import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Reenviar lote de notificações
 * 
 * Cria novo registro na fila para reenvio do último lote.
 * Não duplica registros já enviados.
 * Apenas administradores.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Apenas administradores' }, { status: 401 });
    }

    const { batchSlot } = await req.json();
    
    if (!batchSlot || !['manha', 'tarde'].includes(batchSlot)) {
      return Response.json({ error: 'batchSlot inválido. Use "manha" ou "tarde".' }, { status: 400 });
    }

    // Buscar último lote enviado deste slot
    const recentSent = await base44.entities.PurchaseNotificationQueue.filter({
      batch_slot: batchSlot,
      status: 'enviado',
    }, '-sent_at', 1);

    if (!recentSent || recentSent.length === 0) {
      return Response.json({ 
        success: false, 
        message: `Nenhum lote enviado encontrado para o slot ${batchSlot}.` 
      });
    }

    const lastDigestId = recentSent[0].digest_id;
    
    if (!lastDigestId) {
      return Response.json({ error: 'Lote anterior não possui digest_id.' }, { status: 400 });
    }

    // Buscar todos os itens do último lote
    const lastBatchItems = await base44.entities.PurchaseNotificationQueue.filter({
      digest_id: lastDigestId,
    });

    if (!lastBatchItems || lastBatchItems.length === 0) {
      return Response.json({ error: 'Nenhum item encontrado no lote anterior.' }, { status: 404 });
    }

    // Calcular próximo slot
    const now = new Date();
    const { batchSlot: nextSlot, batchScheduledAt } = calculateNextSlot(now);

    // Recriar registros na fila (não duplica)
    const recreatedItems = [];
    
    for (const item of lastBatchItems) {
      try {
        const newItem = await base44.entities.PurchaseNotificationQueue.create({
          purchase_id: item.purchase_id,
          purchase_descricao: item.purchase_descricao,
          fornecedor_nome: item.fornecedor_nome,
          fornecedor_cnpj: item.fornecedor_cnpj,
          centro_custo: item.centro_custo,
          rubrica_id: item.rubrica_id,
          rubrica_nome: item.rubrica_nome,
          rubrica_grupo: item.rubrica_grupo,
          natureza_despesa: item.natureza_despesa,
          valor: item.valor,
          status_solicitacao: item.status_solicitacao,
          nota_fiscal_pdf_url: item.nota_fiscal_pdf_url,
          nota_fiscal_xml_url: item.nota_fiscal_xml_url,
          xml_url: item.xml_url,
          comprovante_url: item.comprovante_url,
          drive_backup_nf_pdf_link: item.drive_backup_nf_pdf_link,
          drive_backup_nf_xml_link: item.drive_backup_nf_xml_link,
          detalhe_pagamento: item.detalhe_pagamento,
          data_emissao_nf: item.data_emissao_nf,
          link_app_compras: item.link_app_compras,
          status: 'pendente_lote',
          requested_by: user.email,
          requested_at: now.toISOString(),
          batch_slot: nextSlot,
          batch_scheduled_at: batchScheduledAt.toISOString(),
          purchase_snapshot_json: item.purchase_snapshot_json,
          reenvio: true,
          reenvio_original_digest_id: lastDigestId,
        });

        recreatedItems.push(newItem);
      } catch (error) {
        console.error(`Erro ao recriar item ${item.id}:`, error);
        // Continuar com os próximos itens
      }
    }

    return Response.json({
      success: true,
      message: `Lote reenviado! ${recreatedItems.length} solicitações adicionadas ao próximo lote (${nextSlot} às ${batchScheduledAt.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}).`,
      originalDigestId: lastDigestId,
      newBatchSlot: nextSlot,
      newBatchScheduledAt: batchScheduledAt.toISOString(),
      recreatedCount: recreatedItems.length,
      totalCount: lastBatchItems.length,
    });

  } catch (error) {
    console.error('Erro ao reenviar lote:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Calcular próximo slot de envio
 */
function calculateNextSlot(now = new Date()) {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  let batchSlot;
  let batchScheduledAt;

  // Lote da manhã: 09:30
  // Lote da tarde: 16:45
  
  if (currentHour < 9 || (currentHour === 9 && currentMinute < 30)) {
    // Antes das 09:30: lote da manhã de hoje
    batchSlot = 'manha';
    batchScheduledAt = new Date(now);
    batchScheduledAt.setHours(9, 30, 0, 0);
  } else if (currentHour < 16 || (currentHour === 16 && currentMinute < 45)) {
    // Entre 09:30 e 16:45: lote da tarde de hoje
    batchSlot = 'tarde';
    batchScheduledAt = new Date(now);
    batchScheduledAt.setHours(16, 45, 0, 0);
  } else {
    // Depois das 16:45: lote da manhã de amanhã
    batchSlot = 'manha';
    batchScheduledAt = new Date(now);
    batchScheduledAt.setDate(batchScheduledAt.getDate() + 1);
    batchScheduledAt.setHours(9, 30, 0, 0);
  }

  return { batchSlot, batchScheduledAt };
}