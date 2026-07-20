import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Automação agendada — usa service role diretamente
    const allPhotos = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 2000);

    if (!Array.isArray(allPhotos) || allPhotos.length === 0) {
      return Response.json({ message: 'Nenhuma foto encontrada.', deleted: 0 });
    }

    // Agrupar por file_name normalizado
    const byFileName = {};
    for (const f of allPhotos) {
      if (!f.file_name) continue;
      const key = f.file_name.trim().toLowerCase();
      if (!byFileName[key]) byFileName[key] = [];
      byFileName[key].push(f);
    }

    const idsParaDeletar = [];
    for (const [, arr] of Object.entries(byFileName)) {
      if (arr.length <= 1) continue;
      // Manter o com mais metadados preenchidos; em empate, o mais recente
      const sorted = arr.sort((a, b) => {
        const scoreA = (a.legenda ? 2 : 0) + (a.caption ? 1 : 0) + (a.drive_file_id ? 1 : 0) + (a.activity_id ? 1 : 0);
        const scoreB = (b.legenda ? 2 : 0) + (b.caption ? 1 : 0) + (b.drive_file_id ? 1 : 0) + (b.activity_id ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
      });
      // Deletar todos exceto o primeiro (melhor)
      for (let i = 1; i < sorted.length; i++) {
        idsParaDeletar.push(sorted[i].id);
      }
    }

    if (idsParaDeletar.length === 0) {
      return Response.json({ message: 'Nenhuma duplicata encontrada.', deleted: 0, total_fotos: allPhotos.length });
    }

    // Deletar em lotes de 20 para não estourar timeout
    let deleted = 0;
    for (let i = 0; i < idsParaDeletar.length; i += 20) {
      const batch = idsParaDeletar.slice(i, i + 20);
      await Promise.all(batch.map(id => base44.asServiceRole.entities.ReportPhoto.delete(id)));
      deleted += batch.length;
    }

    const result = {
      message: `Deduplicação concluída. ${deleted} cópias removidas.`,
      total_fotos_antes: allPhotos.length,
      total_fotos_apos: allPhotos.length - deleted,
      deleted,
    };

    console.log('[deduplicarFotosGaleriaAuto]', JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error('[deduplicarFotosGaleriaAuto] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});