import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

    const sr = base44.asServiceRole;

    // Buscar todos os imports novos
    const novos = await sr.entities.PurchaseRequest.filter(
      { origem: { $in: ['importacao_drive_maio', 'importacao_drive_abril', 'importacao_drive_marco', 'importacao_drive_junho'] } },
      'created_date',
      500
    );

    // Coletar números NF dos imports
    const nfsImportadas = [...new Set(novos.map(p => p.nf_numero).filter(Boolean))];
    
    let totalDeletados = 0;
    
    // Para cada NF, deletar registros antigos (não-import) em lote
    for (const nf of nfsImportadas) {
      const result = await sr.entities.PurchaseRequest.deleteMany({
        nf_numero: nf,
        origem: { $not: { $regex: '^importacao_drive' } }
      });
      totalDeletados += (result.deleted_count || 0);
    }

    return Response.json({ 
      nfsImportadas: nfsImportadas.length, 
      totalDeletados,
      totalNovosRestantes: novos.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});