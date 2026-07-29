import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const APP_BASE_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch { /* sem body */ }

    const { purchaseId } = body;
    if (!purchaseId) {
      return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
    }

    // Usar asServiceRole para funcionar tanto chamado pelo frontend quanto por automação
    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) {
      return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
    }

    // Calcular próxima ocorrência de 06h00 Brasília = 09h00 UTC
    const now = new Date();
    const nextSend = new Date(now);
    nextSend.setUTCHours(9, 0, 0, 0);
    if (now.getUTCHours() >= 9) {
      // Já passou das 09h UTC (06h Brasília) — agendar para amanhã
      nextSend.setUTCDate(nextSend.getUTCDate() + 1);
    }

    // Buscar rubrica vinculada
    let rubricaNome: string | null = null;
    let rubricaGrupo: string | null = null;
    if (purchase.rubrica_id) {
      try {
        const rubrica = await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id);
        if (rubrica) {
          rubricaNome = rubrica.rubrica || rubrica.nome || null;
          rubricaGrupo = rubrica.grupo || null;
        }
      } catch { /* rubrica não encontrada — ignorar */ }
    }

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
      valor: purchase.valor_pago || purchase.valor_aprovado_admin || purchase.valor_aprovado || purchase.valor_solicitado || 0,
      status_solicitacao: purchase.status,
      nota_fiscal_pdf_url: purchase.nf_pdf_url || purchase.nota_fiscal_url,
      nota_fiscal_xml_url: purchase.nf_xml_url || purchase.nota_fiscal_xml_url,
      xml_url: purchase.xml_url,
      comprovante_url: purchase.comprovante_url || purchase.comprovante_pagamento_url,
      drive_backup_nf_pdf_link: purchase.drive_backup_files?.find((f: any) => f.tipo === 'nf-pdf' || f.tipo === 'NF')?.url || null,
      drive_backup_nf_xml_link: purchase.drive_backup_files?.find((f: any) => f.tipo === 'nf-xml' || f.tipo === 'XML')?.url || null,
      detalhe_pagamento: purchase.detalhe_pagamento,
      data_emissao_nf: purchase.nf_data_emissao,
      link_app_compras: `${APP_BASE_URL}/Compras?purchaseId=${purchase.id}`,
      status: 'pendente_lote',
      requested_by: purchase.created_by_id || '',
      requested_at: now.toISOString(),
      batch_slot: 'diario',
      batch_scheduled_at: nextSend.toISOString(),
      purchase_snapshot_json: purchase
    };

    const created = await base44.asServiceRole.entities.PurchaseNotificationQueue.create(queueRecord);

    return Response.json({
      success: true,
      message: 'Compra enfileirada para o digest diário das 06h',
      data: {
        queueId: created.id,
        batchSlot: 'diario',
        scheduledAt: nextSend.toISOString()
      }
    });

  } catch (error: any) {
    console.error('Erro ao enfileirar notificação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});