import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const META_20_ID = '6a32aead6201158ef021b371';
const META_5_ID  = '6a3b2138ef98002fd208a1a3';
const META_6_ID  = '6a3b2138c4f755b4bd2dbfbb';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const sr = base44.asServiceRole;
    const report = {
      meta20_renomeada: false,
      purchaseRequests_meta6_migradas: 0,
      purchaseRequests_meta5_migradas: 0,
      activities_meta5_migradas: 0,
      activities_meta6_migradas: 0,
      reportPhotos_meta5_migradas: 0,
      reportPhotos_meta6_migradas: 0,
      meta5_deletada: false,
      meta6_deletada: false,
      erros: [],
    };

    // 1. Renomear Meta 20
    try {
      await sr.entities.ProjectMeta.update(META_20_ID, {
        nome: 'Realizar no mínimo 30 ações educativas'
      });
      report.meta20_renomeada = true;
    } catch (e) {
      report.erros.push(`Erro ao renomear Meta 20: ${e.message}`);
    }

    // 2. Migrar PurchaseRequests da Meta 6 → Meta 20
    try {
      const pr6 = await sr.entities.PurchaseRequest.filter({ meta_id: META_6_ID });
      for (const pr of pr6) {
        await sr.entities.PurchaseRequest.update(pr.id, { meta_id: META_20_ID });
        report.purchaseRequests_meta6_migradas++;
      }
    } catch (e) {
      report.erros.push(`Erro ao migrar PurchaseRequests Meta 6: ${e.message}`);
    }

    // 3. Migrar PurchaseRequests da Meta 5 → Meta 20
    try {
      const pr5 = await sr.entities.PurchaseRequest.filter({ meta_id: META_5_ID });
      for (const pr of pr5) {
        await sr.entities.PurchaseRequest.update(pr.id, { meta_id: META_20_ID });
        report.purchaseRequests_meta5_migradas++;
      }
    } catch (e) {
      report.erros.push(`Erro ao migrar PurchaseRequests Meta 5: ${e.message}`);
    }

    // 4. Migrar Activities da Meta 5 → Meta 20
    try {
      const act5 = await sr.entities.Activity.filter({ meta_id: META_5_ID });
      for (const a of act5) {
        await sr.entities.Activity.update(a.id, { meta_id: META_20_ID });
        report.activities_meta5_migradas++;
      }
    } catch (e) {
      report.erros.push(`Erro ao migrar Activities Meta 5: ${e.message}`);
    }

    // 5. Migrar Activities da Meta 6 → Meta 20
    try {
      const act6 = await sr.entities.Activity.filter({ meta_id: META_6_ID });
      for (const a of act6) {
        await sr.entities.Activity.update(a.id, { meta_id: META_20_ID });
        report.activities_meta6_migradas++;
      }
    } catch (e) {
      report.erros.push(`Erro ao migrar Activities Meta 6: ${e.message}`);
    }

    // 6. Migrar ReportPhotos da Meta 5 → Meta 20
    try {
      const rp5 = await sr.entities.ReportPhoto.filter({ meta_id: META_5_ID });
      for (const rp of rp5) {
        await sr.entities.ReportPhoto.update(rp.id, { meta_id: META_20_ID });
        report.reportPhotos_meta5_migradas++;
      }
    } catch (e) {
      report.erros.push(`Erro ao migrar ReportPhotos Meta 5: ${e.message}`);
    }

    // 7. Migrar ReportPhotos da Meta 6 → Meta 20
    try {
      const rp6 = await sr.entities.ReportPhoto.filter({ meta_id: META_6_ID });
      for (const rp of rp6) {
        await sr.entities.ReportPhoto.update(rp.id, { meta_id: META_20_ID });
        report.reportPhotos_meta6_migradas++;
      }
    } catch (e) {
      report.erros.push(`Erro ao migrar ReportPhotos Meta 6: ${e.message}`);
    }

    // 8. Deletar Meta 5 (idempotente — ignora se não existir)
    try {
      await sr.entities.ProjectMeta.delete(META_5_ID);
      report.meta5_deletada = true;
    } catch (e) {
      if (e.message?.includes('not found') || e.message?.includes('404')) {
        report.meta5_deletada = true; // já deletada
      } else {
        report.erros.push(`Erro ao deletar Meta 5: ${e.message}`);
      }
    }

    // 9. Deletar Meta 6 (idempotente)
    try {
      await sr.entities.ProjectMeta.delete(META_6_ID);
      report.meta6_deletada = true;
    } catch (e) {
      if (e.message?.includes('not found') || e.message?.includes('404')) {
        report.meta6_deletada = true;
      } else {
        report.erros.push(`Erro ao deletar Meta 6: ${e.message}`);
      }
    }

    return Response.json({ success: true, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});