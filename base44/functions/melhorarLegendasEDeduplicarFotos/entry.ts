import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const IMAGE_EXTS = /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i;
const MAX_PHOTOS_PER_ACTIVITY = 10;
const MAX_ACTIVITIES_PER_RUN = 15;

function formatDateBR(value = '') {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function isImage(item = {}) {
  return IMAGE_EXTS.test(item.file_name || '') || String(item.file_type || '').startsWith('image/');
}

function extractActivityFromName(fileName = '') {
  const match = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
  return match ? match[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function buildContextualCaption(foto, report, activity) {
  const partes = [];
  const nomeAtv = activity?.titulo || activity?.nome || extractActivityFromName(foto.file_name || '') || foto.atividade_titulo || '';
  if (nomeAtv) partes.push(nomeAtv);
  const museu = report?.museu || foto.museu || foto.local || '';
  if (museu) partes.push(museu);
  const data = activity?.data_realizacao || activity?.data_inicio || report?.submitted_at || foto.created_date || '';
  const dataFmt = formatDateBR(data);
  if (dataFmt) partes.push(dataFmt);
  return partes.length > 0 ? partes.join(' — ') : (foto.file_name || 'Foto');
}

function getPhotoUrl(foto) {
  const url = String(foto.file_url || foto.url || '').trim();
  if (!url) return '';
  if (/drive\.google\.com\/(file\/d\/|open\?|uc\?)/i.test(url)) {
    const id = (url.match(/\/file\/d\/([^/?#]+)/i) || url.match(/[?&]id=([^&#]+)/i) || [])[1];
    if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w800`;
  }
  return url;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { dry_run = false, max_activities = MAX_ACTIVITIES_PER_RUN, mode = 'all' } = body;

    // 1. Buscar todas as fotos
    const [attachments, reportPhotos, reports, activities] = await Promise.all([
      base44.asServiceRole.entities.Attachment.list('-created_date', 3000),
      base44.asServiceRole.entities.ReportPhoto.list('-created_date', 3000),
      base44.asServiceRole.entities.Report.list('-updated_date', 1000),
      base44.asServiceRole.entities.Activity.list('-updated_date', 2000),
    ]);

    const reportById = new Map();
    for (const r of (reports || [])) reportById.set(r.id, r);
    const activityById = new Map();
    for (const a of (activities || [])) activityById.set(a.id, a);

    // 2. Consolidar todas as fotos num formato unificado
    const allPhotos = [];
    for (const att of (attachments || [])) {
      if (!isImage(att) || !att.file_url) continue;
      allPhotos.push({
        entity: 'Attachment',
        id: att.id,
        fileUrl: getPhotoUrl(att),
        fileName: att.file_name || '',
        currentCaption: att.description || att.legenda || '',
        reportId: att.report_id || '',
        activityId: att.activity_id || '',
        museu: '',
        mes: '',
        ano: '',
        raw: att,
      });
    }
    for (const rp of (reportPhotos || [])) {
      if (!rp.file_url) continue;
      allPhotos.push({
        entity: 'ReportPhoto',
        id: rp.id,
        fileUrl: getPhotoUrl(rp),
        fileName: rp.file_name || '',
        currentCaption: rp.caption || rp.legenda || '',
        reportId: rp.report_id || '',
        activityId: rp.activity_id || '',
        museu: rp.museu || '',
        mes: rp.mes_referencia || '',
        ano: rp.ano || '',
        raw: rp,
      });
    }

    // Enriquecer com contexto de relatório/atividade
    for (const p of allPhotos) {
      const report = p.reportId ? reportById.get(p.reportId) : null;
      const activity = p.activityId ? activityById.get(p.activityId) : null;
      p.report = report;
      p.activity = activity;
      p.museu = p.museu || report?.museu || '';
      p.mes = p.mes || report?.mes_referencia || '';
      p.ano = p.ano || report?.ano || report?.ano_referencia || '';
      p.activityTitulo = activity?.titulo || p.activityId || '';
      p.dataRealizacao = activity?.data_realizacao || activity?.data_inicio || report?.submitted_at || '';
    }

    // 3. Agrupar por atividade (para detectar duplicatas visuais)
    const byActivity = new Map();
    for (const p of allPhotos) {
      const key = p.activityId || p.activityTitulo || extractActivityFromName(p.fileName) || 'SEM_ATIVIDADE';
      if (!byActivity.has(key)) byActivity.set(key, []);
      byActivity.get(key).push(p);
    }

    const stats = { captionsImproved: 0, duplicatesMarked: 0, processed: 0, errors: [] };

    // 4. Para cada atividade com múltiplas fotos: analisar com IA (visão)
    // Ordenar por atividades com mais fotos primeiro
    const sortedActivities = Array.from(byActivity.entries())
      .filter(([, photos]) => photos.some((p) => p.fileUrl))
      .sort((a, b) => b[1].length - a[1].length);

    let activitiesProcessed = 0;
    for (const [activityKey, photos] of sortedActivities) {
      if (activitiesProcessed >= max_activities) break;
      const subset = photos.filter((p) => p.fileUrl).slice(0, MAX_PHOTOS_PER_ACTIVITY);
      if (subset.length === 0) continue;

      // Para atividades com 1 foto: só melhorar legenda se necessário
      // Para atividades com 2+ fotos: detectar duplicatas visuais + melhorar legendas
      const urls = subset.map((p) => p.fileUrl).filter(Boolean);
      if (urls.length === 0) continue;

      const activityContext = subset[0].activityTitulo || activityKey;
      const museuContext = subset[0].museu || '';
      const dataContext = formatDateBR(subset[0].dataRealizacao);

      // Sempre processa: melhora legendas com IA e detecta duplicatas visuais
      const needsCaption = true;
      void needsCaption;
      console.log(`[Galeria IA] Iniciando atividade "${activityKey}" com ${urls.length} URLs`);

      const prompt = `Analise estas ${urls.length} fotografias do projeto Museus Centro.

Contexto:
- Atividade: ${activityContext}
- Museu: ${museuContext || 'Não identificado'}
- Data: ${dataContext || 'Não identificada'}

Sua tarefa:
1. Para cada foto, gere uma legenda profissional curta (máx 15 palavras) incluindo: atividade, museu e data quando disponível.
2. Identifique fotos visualmente idênticas (mesma imagem, mesmo ângulo, mesmo conteúdo). Fotos que são variações diferentes da mesma atividade NÃO são duplicatas.

Retorne JSON com:
{
  "photos": [
    {
      "index": 0,
      "caption": "legenda melhorada",
      "is_duplicate": false,
      "duplicate_of_index": null
    }
  ]
}

Regras:
- "is_duplicate": true apenas se a imagem é praticamente idêntica a outra (mesma foto)
- "duplicate_of_index": índice da foto original (se is_duplicate=true)
- Mantenha apenas UMA foto por conteúdo visual idêntico
- Responda somente em JSON válido`;

      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          file_urls: urls,
          response_json_schema: {
            type: 'object',
            properties: {
              photos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'number' },
                    caption: { type: 'string' },
                    is_duplicate: { type: 'boolean' },
                    duplicate_of_index: { type: 'number' },
                  },
                  required: ['index', 'caption', 'is_duplicate'],
                },
              },
            },
            required: ['photos'],
          },
          model: 'claude_sonnet_4_6',
        });

        const photoResults = Array.isArray(result?.photos) ? result.photos : [];
        console.log(`[Galeria IA] Atividade "${activityKey}": ${subset.length} fotos, IA retornou ${photoResults.length} resultados. Raw keys: ${Object.keys(result || {}).join(',')}`);
        for (const pr of photoResults) {
          const idx = pr.index;
          if (idx < 0 || idx >= subset.length) continue;
          const photo = subset[idx];
          stats.processed++;

          // Atualizar legenda
          if (pr.caption && pr.caption !== photo.currentCaption) {
            if (!dry_run) {
              try {
                if (photo.entity === 'Attachment') {
                  await base44.asServiceRole.entities.Attachment.update(photo.id, { description: pr.caption });
                } else {
                  await base44.asServiceRole.entities.ReportPhoto.update(photo.id, { caption: pr.caption });
                }
                stats.captionsImproved++;
              } catch (e) {
                stats.errors.push({ id: photo.id, error: e.message });
              }
            } else {
              stats.captionsImproved++;
            }
          }

          // Marcar duplicata visual
          if (pr.is_duplicate && typeof pr.duplicate_of_index === 'number') {
            if (!dry_run) {
              try {
                if (photo.entity === 'Attachment') {
                  await base44.asServiceRole.entities.Attachment.update(photo.id, { duplicada_de: subset[pr.duplicate_of_index]?.id || '' });
                } else {
                  await base44.asServiceRole.entities.ReportPhoto.update(photo.id, {
                    galeria_oculta: true,
                    duplicada_de: subset[pr.duplicate_of_index]?.id || '',
                  });
                }
                stats.duplicatesMarked++;
              } catch (e) {
                stats.errors.push({ id: photo.id, error: e.message });
              }
            } else {
              stats.duplicatesMarked++;
            }
          }
        }
      } catch (e) {
        console.error(`[Galeria IA] Erro na atividade "${activityKey}":`, e?.message || e);
        for (const p of subset) {
          if (!p.currentCaption || p.currentCaption === p.fileName) {
            const caption = buildContextualCaption(p.raw, p.report, p.activity);
            if (caption && !dry_run) {
              try {
                if (p.entity === 'Attachment') {
                  await base44.asServiceRole.entities.Attachment.update(p.id, { description: caption });
                } else {
                  await base44.asServiceRole.entities.ReportPhoto.update(p.id, { caption });
                }
                stats.captionsImproved++;
              } catch (err) {
                stats.errors.push({ id: p.id, error: err.message });
              }
            }
          }
        }
        stats.errors.push({ activity: activityKey, error: e.message });
      }

      activitiesProcessed++;
      // Pequeno delay entre atividades para não sobrecarregar
      await new Promise((r) => setTimeout(r, 100));
    }

    return Response.json({
      success: true,
      dry_run,
      mode,
      total_photos: allPhotos.length,
      activities_processed: activitiesProcessed,
      processed: stats.processed,
      captions_improved: stats.captionsImproved,
      duplicates_marked: stats.duplicatesMarked,
      errors: stats.errors.length,
      error_details: stats.errors.slice(0, 10),
      message: dry_run
        ? `Simulação: ${stats.captionsImproved} legendas seriam melhoradas, ${stats.duplicatesMarked} duplicatas seriam marcadas.`
        : `${stats.captionsImproved} legendas melhoradas, ${stats.duplicatesMarked} duplicatas visuais marcadas.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});