import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function isImageFile(item: any) {
  const fileName = String(item?.file_name || '').toLowerCase();
  const fileType = String(item?.file_type || '').toLowerCase();

  if (fileType.startsWith('image/')) return true;

  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.bmp', '.avif']
    .some((ext) => fileName.endsWith(ext));
}

function needsProcessing(item: any) {
  const legenda = String(item?.legenda || '').trim();
  const descricao = String(item?.descricao || '').trim();
  const museu = String(item?.museu || '').trim();
  const localizacao = String(item?.localizacao || '').trim();

  return !legenda || !descricao || !museu || !localizacao;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const mediaItems = await base44.entities.MediaLibrary.list?.('-created_date', 1000);
    const list = Array.isArray(mediaItems) ? mediaItems : [];

    const candidates = list.filter((item) => {
      if (!item?.id) return false;
      if (!item?.file_url) return false;
      if (!isImageFile(item)) return false;
      return needsProcessing(item);
    });

    const results: Array<any> = [];

    for (const item of candidates) {
      try {
        const suggestion = await base44.functions.invoke('suggestPhotoCaption', {
          photoUrl: item.file_url,
          reportId: item.report_id || null,
          activityId: item.activity_id || null,
        });

        const data = suggestion?.data || suggestion || {};

        const legenda = String(data?.caption || '').trim();
        const descricao = String(data?.description || '').trim();
        const museu = String(data?.museum || '').trim();
        const localizacao = String(data?.location || '').trim();

        const payload: Record<string, any> = {};

        if (legenda) payload.legenda = legenda;
        if (descricao) payload.descricao = descricao;
        if (museu) payload.museu = museu;
        if (localizacao) payload.localizacao = localizacao;

        payload.ia_processada_em = new Date().toISOString();
        payload.ia_status = 'PROCESSADO';

        if (Object.keys(payload).length > 0) {
          await base44.entities.MediaLibrary.update(item.id, payload);
        }

        results.push({
          id: item.id,
          status: 'ok',
          legenda,
          descricao,
          museu,
          localizacao,
        });
      } catch (error) {
        console.error(`Erro ao processar mídia ${item?.id}:`, error?.message || error);

        try {
          await base44.entities.MediaLibrary.update(item.id, {
            ia_processada_em: new Date().toISOString(),
            ia_status: 'ERRO',
            ia_erro: String(error?.message || error || 'Erro desconhecido'),
          });
        } catch (updateError) {
          console.error(`Erro ao gravar falha na mídia ${item?.id}:`, updateError?.message || updateError);
        }

        results.push({
          id: item.id,
          status: 'erro',
          error: String(error?.message || error || 'Erro desconhecido'),
        });
      }
    }

    return Response.json({
      success: true,
      processed: candidates.length,
      results,
    });
  } catch (error) {
    console.error('Erro no cron de processamento da galeria:', error?.message || error);

    return Response.json(
      {
        success: false,
        error: String(error?.message || error || 'Erro interno'),
      },
      { status: 500 }
    );
  }
});
