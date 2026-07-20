import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const allPhotos = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 2000);

    if (!Array.isArray(allPhotos) || allPhotos.length === 0) {
      return Response.json({ message: 'Nenhuma foto encontrada.', deleted: 0 });
    }

    const idsParaDeletar = new Set();

    // Critério 1: file_name normalizado (idêntico)
    const byFileName = {};
    // Critério 2: file_url base (mesma imagem, parâmetros de query diferentes)
    const byFileUrlBase = {};
    // Critério 3: drive_file_id (mesmo arquivo no Drive)
    const byDriveFileId = {};

    for (const f of allPhotos) {
      if (f.file_name) {
        const key = f.file_name.trim().toLowerCase();
        if (!byFileName[key]) byFileName[key] = [];
        byFileName[key].push(f);
      }
      if (f.file_url) {
        const baseUrl = String(f.file_url).split('?')[0].trim().toLowerCase();
        if (baseUrl && !byFileUrlBase[baseUrl]) byFileUrlBase[baseUrl] = [];
        if (baseUrl) byFileUrlBase[baseUrl].push(f);
      }
      if (f.drive_file_id) {
        const key = String(f.drive_file_id).trim();
        if (!byDriveFileId[key]) byDriveFileId[key] = [];
        byDriveFileId[key].push(f);
      }
    }

    // Função para escolher a cópia a manter (mais metadados preenchidos, mais recente em empate)
    function rankPhoto(p) {
      return (p.legenda ? 2 : 0) + (p.caption ? 1 : 0) + (p.drive_file_id ? 1 : 0) + (p.activity_id ? 2 : 0) + (p.museu ? 1 : 0) + (p.meta_id ? 1 : 0);
    }

    function processarGrupo(grupo) {
      if (grupo.length <= 1) return;
      const sorted = grupo.sort((a, b) => {
        const diff = rankPhoto(b) - rankPhoto(a);
        if (diff !== 0) return diff;
        return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
      });
      for (let i = 1; i < sorted.length; i++) {
        idsParaDeletar.add(sorted[i].id);
      }
    }

    for (const [, arr] of Object.entries(byFileName)) processarGrupo(arr);
    for (const [, arr] of Object.entries(byFileUrlBase)) processarGrupo(arr);
    for (const [, arr] of Object.entries(byDriveFileId)) processarGrupo(arr);

    if (idsParaDeletar.size === 0) {
      return Response.json({
        message: 'Nenhuma duplicata encontrada.',
        deleted: 0,
        total_fotos: allPhotos.length,
      });
    }

    // Deletar em lotes de 20
    const ids = Array.from(idsParaDeletar);
    let deleted = 0;
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      await Promise.all(batch.map(id => base44.asServiceRole.entities.ReportPhoto.delete(id)));
      deleted += batch.length;
    }

    const result = {
      message: `Limpeza concluída. ${deleted} cópias duplicadas removidas.`,
      total_fotos_antes: allPhotos.length,
      total_fotos_apos: allPhotos.length - deleted,
      deleted,
      duplicatas_por_filename: Object.values(byFileName).filter(a => a.length > 1).length,
      duplicatas_por_url: Object.values(byFileUrlBase).filter(a => a.length > 1).length,
      duplicatas_por_drive_id: Object.values(byDriveFileId).filter(a => a.length > 1).length,
    };

    console.log('[limparDuplicatasFotosGaleria]', JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error('[limparDuplicatasFotosGaleria] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});