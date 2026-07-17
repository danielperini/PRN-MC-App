import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Rotina automática de sincronização de fotos do Drive.
 * Chama sincronizarInventarioCompleto em modo 'sync' paginado,
 * sem criar duplicatas (deduplicação por drive_file_id).
 * Projetada para ser chamada por automação agendada.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isSystem = req.headers.get('x-base44-system') === 'true';

    // Permite chamada de automação agendada (sem token de usuário) ou de admin
    if (!isSystem) {
      const isAuth = await base44.auth.isAuthenticated();
      if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const user = await base44.auth.me();
      if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const LOTE = 20;        // fotos por iteração
    const MAX_LOTES = 10;   // máx lotes por execução (evita timeout)

    let offset = 0;
    let totalCriadas = 0;
    let totalJaExistia = 0;
    let totalFalhas: any[] = [];
    let loteCount = 0;
    let hasMore = true;

    while (hasMore && loteCount < MAX_LOTES) {
      const res = await base44.asServiceRole.functions.invoke('sincronizarInventarioCompleto', {
        modo: 'sync',
        offset,
        limite: LOTE,
        limpar_duplicatas: true,
      });

      const data = res?.data || res;

      totalCriadas += data?.criadas || 0;
      totalJaExistia += data?.ja_existia || 0;
      if (Array.isArray(data?.falhas)) totalFalhas.push(...data.falhas);

      hasMore = !!data?.has_more;
      offset = data?.next_offset ?? (offset + LOTE);
      loteCount++;

      // Se não criou nada neste lote, provavelmente não há mais novidades
      if ((data?.criadas || 0) === 0 && (data?.lote_processado || 0) === 0) break;
    }

    // Registrar log da execução
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_folders',
      entity_type: 'AUTO_SYNC_FOTOS',
      status: totalFalhas.length === 0 ? 'success' : 'failure',
      processed_at: new Date().toISOString(),
      total_files: totalCriadas + totalJaExistia,
      files_copied: totalCriadas,
      details: `Auto-sync: ${totalCriadas} novas, ${totalJaExistia} já existiam, ${totalFalhas.length} erros, ${loteCount} lotes processados`,
      triggered_by: isSystem ? 'scheduled' : 'manual',
    }).catch(() => {});

    return Response.json({
      success: true,
      novas_importadas: totalCriadas,
      ja_existiam: totalJaExistia,
      lotes_processados: loteCount,
      has_more: hasMore,
      falhas: totalFalhas.slice(0, 10),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});