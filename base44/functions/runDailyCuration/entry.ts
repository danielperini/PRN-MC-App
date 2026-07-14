import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { authorizeAdminOrCoordinator } from '../_shared/authorization.ts';

const TEMAS = [
  'Museus Centro Belo Horizonte MUMO MIS BH MHAB',
  'museologia educação museal patrimônio memória urbana',
  'fotografia audiovisual cinema arquivo preservação',
  'moda memória design expografia museus',
  'Noturno nos Museus visitas noturnas educação cultural',
  'editais cultura patrimônio museus Minas Gerais',
  'artigos acadêmicos museologia SciELO UFMG',
];

function normalize(value: unknown) {
  return String(value || '').trim();
}

function parseDate(value: unknown) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpired(item: any, today: Date) {
  const published = parseDate(item?.data_publicacao);
  if (!published) return false;
  const days = (today.getTime() - published.getTime()) / 86400000;
  if (item?.tipo_conteudo === 'ARTIGO_DENSO') return days > 365;
  if (item?.tipo_conteudo === 'OPORTUNIDADE') return days > 60;
  return days > 30;
}

function score(item: any) {
  const text = `${item?.titulo || ''} ${item?.resumo || ''}`.toLowerCase();
  let value = 40;
  if (/viaduto das artes|museus centro|mumo|mis bh|mhab|abilio barreto/.test(text)) value += 25;
  if (/belo horizonte|\bbh\b|minas gerais/.test(text)) value += 15;
  if (/museu|patrimonio|memoria|acervo|museologia/.test(text)) value += 10;
  if (/cinema|audiovisual|fotografia|moda|design|expografia/.test(text)) value += 10;
  if (/noturno|edital|oportunidade|artigo|scielo|ufmg/.test(text)) value += 10;
  return Math.min(100, value);
}

function thumbnail(item: any) {
  const url = normalize(item?.imagem_url);
  return /^https?:\/\//i.test(url) && !url.includes('placeholder') ? url : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const authorization = await authorizeAdminOrCoordinator(base44);
    if (!authorization.ok) return authorization.response;

    const body = await req.json().catch(() => ({}));
    const today = new Date();
    const limit = Math.max(1, Math.min(20, Number(body?.limit || 20)));
    const existing = await base44.asServiceRole.entities.NewsHighlight.list('-created_date', 500);
    const existingLinks = new Set((Array.isArray(existing) ? existing : []).map((item: any) => normalize(item?.link)).filter(Boolean));

    let deactivated = 0;
    for (const item of Array.isArray(existing) ? existing : []) {
      if (item?.ativo && isExpired(item, today)) {
        await base44.asServiceRole.entities.NewsHighlight.update(item.id, { ativo: false });
        deactivated += 1;
      }
    }

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      add_context_from_internet: true,
      prompt: `Pesquise conteúdo real e atual para a curadoria editorial do projeto Museus Centro em Belo Horizonte.

Temas:
- ${TEMAS.join('\n- ')}

Data atual: ${today.toISOString().slice(0, 10)}

Regras:
- retorne notícias, artigos acadêmicos e oportunidades reais;
- priorize Viaduto das Artes, MUMO, MIS BH, MHAB, Museus Centro, Belo Horizonte e Minas Gerais;
- não invente links;
- descarte eventos encerrados e notícias antigas;
- artigos acadêmicos podem ter até um ano;
- editais devem estar abertos ou recentes;
- retorne no máximo ${limit} itens;
- data_publicacao deve usar YYYY-MM-DD.`,
      response_json_schema: {
        type: 'object',
        properties: {
          noticias: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                resumo: { type: 'string' },
                link: { type: 'string' },
                imagem_url: { type: ['string', 'null'] },
                data_publicacao: { type: 'string' },
                tipo_conteudo: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    });

    const seen = new Set<string>();
    let collected = 0;
    let saved = 0;
    let rejected = 0;

    for (const item of Array.isArray(result?.noticias) ? result.noticias : []) {
      if (saved >= limit) break;
      const link = normalize(item?.link);
      if (!/^https?:\/\//i.test(link) || seen.has(link) || existingLinks.has(link)) continue;
      seen.add(link);
      collected += 1;
      if (isExpired(item, today)) { rejected += 1; continue; }
      const relevance = score(item);
      if (relevance < 50) { rejected += 1; continue; }
      const status = relevance >= 80 ? 'PUBLICADO_AUTO' : 'PENDENTE';
      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: normalize(item?.titulo) || 'Sem título',
        resumo: normalize(item?.resumo),
        link,
        imagem_url: thumbnail(item),
        fonte: 'web',
        data_publicacao: normalize(item?.data_publicacao) || today.toISOString().slice(0, 10),
        tipo_conteudo: normalize(item?.tipo_conteudo) || 'NOTICIA',
        score_pertinencia: relevance,
        score_atualidade: 80,
        tags: Array.isArray(item?.tags) ? item.tags : [],
        palavra_chave_geradora: TEMAS[0],
        motivo_curadoria: `Score ${relevance} — curadoria automática`,
        status_curadoria: status,
        ativo: status === 'PUBLICADO_AUTO',
        publicado_por_ia: status === 'PUBLICADO_AUTO',
        modelo_curadoria: 'gemini_3_flash',
      });
      existingLinks.add(link);
      saved += 1;
    }

    return Response.json({
      success: true,
      data: today.toISOString().slice(0, 10),
      executado_por: authorization.user?.email || authorization.user?.id,
      perfis_detectados: authorization.roles,
      desativados_expirados: deactivated,
      coletados: collected,
      salvos: saved,
      rejeitados: rejected,
    });
  } catch (error: any) {
    console.error('[curadoria] Erro fatal:', error);
    return Response.json({ success: false, code: 'CURATION_FAILED', error: String(error?.message || error) }, { status: 500 });
  }
});
