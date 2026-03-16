import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Ao criar/atualizar uma PurchaseRequest com nota_fiscal_url, salva automaticamente no Drive
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { event, data } = body;

    if (!data?.nota_fiscal_url) {
      return Response.json({ skipped: true, reason: 'Sem nota fiscal' });
    }

    const base44 = createClientFromRequest(req);

    // Só processar se a nota é nova (create) ou se foi adicionada (update - verificar old_data)
    if (event?.type === 'update' && body.old_data?.nota_fiscal_url === data.nota_fiscal_url) {
      return Response.json({ skipped: true, reason: 'Nota fiscal não alterada' });
    }

    const fileName = `NF_${data.id}_${(data.fornecedor_nome || 'fornecedor').replace(/[^\w]/g, '_')}.pdf`;

    await base44.asServiceRole.functions.invoke('backupNotasFiscaisToDrive', {
      file_url: data.nota_fiscal_url,
      file_name: fileName,
      purchase_id: data.id
    });

    return Response.json({ success: true, nota_fiscal_backed_up: fileName });
  } catch (error) {
    console.error('Erro ao fazer backup de nota fiscal:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});