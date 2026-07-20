import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MAX_PHOTOS_PER_LLM_CALL = 6;
const MAX_GROUPS = 20;

function isDirectImageUrl(url = '') {
  const u = String(url).toLowerCase();
  // Apenas URLs diretas de imagem (não páginas do Drive)
  return u.includes('lh3.googleusercontent.com')
    || (u.includes('drive.google.com/thumbnail'))
    || (u.startsWith('https://') && /\.(jpg|jpeg|png|webp|gif)/.test(u));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    // Busca todas as ReportPhoto não ocultas
    const allPhotos = await base44.asServiceRole.entities.ReportPhoto.filter(
      { galeria_oculta: { $ne: true } },
      '-created_date',
      2000
    );

    // Filtra apenas fotos com URL direta de imagem válida
    const photos = allPhotos.filter((p) => p.file_url && isDirectImageUrl(p.file_url));

    if (!photos.length) {
      return Response.json({ message: 'Nenhuma foto válida encontrada', total: 0 });
    }

    // Agrupa por atividade (activity_id) ou por museu+mes_referencia como fallback
    const groups = new Map();
    for (const photo of photos) {
      const activityId = String(photo.activity_id || '').trim();
      const museu = String(photo.museu || '').trim();
      const mes = String(photo.mes_referencia || '').trim();
      const key = activityId || `${museu}__${mes}__${photo.ordem || 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(photo);
    }

    // Filtra apenas grupos com 2+ fotos
    const candidateGroups = Array.from(groups.entries())
      .filter(([, group]) => group.length >= 2)
      .slice(0, MAX_GROUPS);

    if (!candidateGroups.length) {
      return Response.json({
        message: 'Nenhuma atividade com múltiplas fotos encontrada',
        total: photos.length,
        groupsAnalyzed: 0,
        duplicatesFound: 0,
      });
    }

    const duplicatesToHide = [];
    const groupResults = [];

    for (const [groupKey, groupPhotos] of candidateGroups) {
      const photosToAnalyze = groupPhotos.slice(0, MAX_PHOTOS_PER_LLM_CALL);
      const photoUrls = photosToAnalyze
        .map((p) => p.file_url)
        .filter(Boolean);

      if (photoUrls.length < 2) continue;

      const photoList = photosToAnalyze
        .map((p, i) => `${i + 1}. ID:${p.id} | ${p.legenda || p.caption || p.file_name || 'sem legenda'}`)
        .join('\n');

      const prompt = `Você é um curador de galeria de fotos. Analise as ${photoUrls.length} imagens abaixo que pertencem à mesma atividade museológica.

Identifique quais fotos são visualmente duplicadas ou excessivamente similares (mesma cena, mesmo ângulo, mesma composição) e quais são distintas (ângulos diferentes, momentos diferentes, detalhes diferentes).

Para cada grupo de duplicatas, mantenha APENAS a melhor foto (melhor iluminação, enquadramento e nitidez) e marque as outras para remoção.

Fotos:
${photoList}

Responda em JSON no formato:
{
  "manter": ["ID1", "ID2"],
  "remover": ["ID3", "ID4"],
  "justificativa": "breve explicação"
}

Regras:
- Mantenha no máximo 1 foto por cena/ângulo similar
- Se todas as fotos forem distintas, coloque todos os IDs em "manter" e "remover" vazio
- Se houver duplicatas claras, mantenha apenas a melhor de cada grupo`;

      try {
        const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          file_urls: photoUrls,
          response_json_schema: {
            type: 'object',
            properties: {
              manter: { type: 'array', items: { type: 'string' } },
              remover: { type: 'array', items: { type: 'string' } },
              justificativa: { type: 'string' },
            },
          },
        });

        const removerIds = Array.isArray(llmResponse?.remover) ? llmResponse.remover : [];
        const justificativa = String(llmResponse?.justificativa || '');

        for (const photoId of removerIds) {
          const photo = photosToAnalyze.find((p) => p.id === photoId);
          if (photo) {
            duplicatesToHide.push({
              id: photo.id,
              groupKey,
              reason: justificativa,
            });
          }
        }

        groupResults.push({
          groupKey,
          totalPhotos: groupPhotos.length,
          analyzed: photosToAnalyze.length,
          kept: (llmResponse?.manter || []).length,
          removed: removerIds.length,
          justificativa,
        });
      } catch (err) {
        groupResults.push({
          groupKey,
          totalPhotos: groupPhotos.length,
          analyzed: photosToAnalyze.length,
          error: err?.message || 'Erro na análise',
        });
      }
    }

    // Marca duplicatas como ocultas (ou apenas reporta em dryRun)
    let hiddenCount = 0;
    if (!dryRun && duplicatesToHide.length > 0) {
      for (const dup of duplicatesToHide) {
        try {
          await base44.asServiceRole.entities.ReportPhoto.update(dup.id, {
            galeria_oculta: true,
            contexto_ia: `Deduplicada por IA — ${dup.reason}`,
          });
          hiddenCount++;
        } catch (err) {
          console.warn(`Erro ao ocultar foto ${dup.id}:`, err?.message);
        }
      }
    }

    return Response.json({
      total: photos.length,
      groupsAnalyzed: candidateGroups.length,
      duplicatesFound: duplicatesToHide.length,
      duplicatesHidden: hiddenCount,
      dryRun,
      groupResults,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});