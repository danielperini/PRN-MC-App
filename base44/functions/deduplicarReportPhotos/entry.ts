import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Normaliza o nome do arquivo para deduplicação determinística:
 * - remove query params e fragmentos
 * - pega apenas o nome final (após última /)
 * - remove extensão
 * - remove acentos
 * - lowercase
 * - trim
 */
function normalizeFileName(fileName: string = ''): string {
  return String(fileName || '')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .pop() || '';
}

/**
 * Chave normalizada para comparar nomes de arquivo:
 * nome sem extensão, sem acentos, lowercase, espaços colapsados
 */
function fileNameKey(fileName: string = ''): string {
  const base = normalizeFileName(fileName)
    .replace(/\.(jpg|jpeg|png|webp|gif|bmp|avif|heic)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return base;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas admins podem executar esta operação' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // padrão: simulação
    const batchSize = 200;

    // Carregar todas as ReportPhotos
    const allPhotos: any[] = [];
    let page = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 5000);
    allPhotos.push(...(Array.isArray(page) ? page : []));

    const toDelete = new Set<string>();
    const stats = {
      total_photos: allPhotos.length,
      duplicatas_url: 0,
      duplicatas_nome: 0,
      mantidos: 0,
    };

    // --- ETAPA 1: Duplicatas por URL normalizada ---
    const byUrl = new Map<string, any[]>();
    for (const p of allPhotos) {
      const url = String(p.file_url || '').trim().toLowerCase().split('?')[0];
      if (!url) continue;
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url)!.push(p);
    }

    for (const [, group] of byUrl.entries()) {
      if (group.length <= 1) continue;
      // Manter o mais antigo (menor created_date), deletar os demais
      group.sort((a, b) =>
        new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime()
      );
      const [, ...dupes] = group;
      for (const d of dupes) {
        toDelete.add(d.id);
        stats.duplicatas_url++;
      }
    }

    // --- ETAPA 2: Duplicatas por NOME DE ARQUIVO normalizado ---
    // Considera apenas fotos que ainda não foram marcadas para deleção
    const remaining = allPhotos.filter((p) => !toDelete.has(p.id));
    const byName = new Map<string, any[]>();
    for (const p of remaining) {
      const key = fileNameKey(p.file_name || '');
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(p);
    }

    for (const [, group] of byName.entries()) {
      if (group.length <= 1) continue;
      // Manter o mais antigo, deletar os demais
      group.sort((a, b) =>
        new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime()
      );
      const [, ...dupes] = group;
      for (const d of dupes) {
        toDelete.add(d.id);
        stats.duplicatas_nome++;
      }
    }

    stats.mantidos = allPhotos.length - toDelete.size;

    if (dryRun) {
      return Response.json({
        dry_run: true,
        ...stats,
        total_a_deletar: toDelete.size,
        amostra_a_deletar: [...toDelete].slice(0, 10),
      });
    }

    // Deletar em lotes
    let deletados = 0;
    let erros = 0;
    const deleteList = [...toDelete];
    for (let i = 0; i < deleteList.length; i += batchSize) {
      const batch = deleteList.slice(i, i + batchSize);
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
      deletados,
      erros,
      mantidos: allPhotos.length - deletados,
      duplicatas_url: stats.duplicatas_url,
      duplicatas_nome: stats.duplicatas_nome,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});