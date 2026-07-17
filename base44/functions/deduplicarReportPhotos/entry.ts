import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas admins podem executar esta operação' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // padrão: simulação
    const batchSize = 200;

    // Carregar todas as ReportPhotos em páginas
    const allPhotos: any[] = [];
    let page = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 5000);
    allPhotos.push(...(Array.isArray(page) ? page : []));

    // Agrupar por file_url normalizada
    const byUrl = new Map<string, any[]>();
    for (const p of allPhotos) {
      const url = String(p.file_url || '').trim();
      if (!url) continue;
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url)!.push(p);
    }

    // Identificar duplicatas: manter o mais antigo (menor created_date), deletar os demais
    const toDelete: string[] = [];
    const kept: Array<{ id: string; url: string; duplicates: number }> = [];

    for (const [url, group] of byUrl.entries()) {
      if (group.length <= 1) continue;

      // Ordenar do mais antigo para o mais novo
      group.sort((a: any, b: any) => {
        const da = new Date(a.created_date || 0).getTime();
        const db = new Date(b.created_date || 0).getTime();
        return da - db;
      });

      const [keeper, ...dupes] = group;
      kept.push({ id: keeper.id, url: url.substring(0, 80), duplicates: dupes.length });
      toDelete.push(...dupes.map((d: any) => d.id));
    }

    if (dryRun) {
      return Response.json({
        dry_run: true,
        total_photos: allPhotos.length,
        urls_unicas: byUrl.size,
        grupos_com_duplicata: kept.length,
        total_a_deletar: toDelete.length,
        total_a_manter: allPhotos.length - toDelete.length,
        amostra_a_deletar: toDelete.slice(0, 10),
      });
    }

    // Deletar em lotes para não estourar timeout
    let deletados = 0;
    let erros = 0;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      await Promise.all(batch.map(async (id) => {
        try {
          await base44.asServiceRole.entities.ReportPhoto.delete(id);
          deletados++;
        } catch {
          erros++;
        }
      }));
    }

    return Response.json({
      success: true,
      dry_run: false,
      total_original: allPhotos.length,
      urls_unicas: byUrl.size,
      deletados,
      erros,
      mantidos: allPhotos.length - deletados,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});