import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const TEMAS = [
  'Museus Centro Belo Horizonte MUMO MIS BH MHAB',
  'museologia educacao museal patrimonio memoria urbana',
  'fotografia audiovisual cinema arquivo preservacao',
  'moda memoria design expografia museus',
  'Noturno nos Museus visitas noturnas educacao cultural',
  'editais cultura patrimonio museus Minas Gerais',
  'artigos academicos museologia UFMG',
];

const ALLOWED_ROLES = new Set([
  'admin', 'administrator', 'administrador',
  'coordenador', 'coordinator', 'coordenador geral', 'coordenador_geral',
]);

function normalizeRole(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isAllowed(roles) {
  return roles.some((r) => ALLOWED_ROLES.has(r) || r.startsWith('coordenador ') || r.startsWith('coordinator '));
}

function normalizeStr(value) {
  return String(value || '').trim();
}

function parseDate(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpired(item, today) {
  const published = parseDate(item && item.data_publicacao);
  if (!published) return false;
  const days = (today.getTime() - published.getTime()) / 86400000;
  if (item && item.tipo_conteudo === 'ARTIGO_DENSO') return days > 365;
  if (item && item.tipo_conteudo === 'OPORTUNIDADE') return days > 60;
  return days > 30;
}

function calcScore(item) {
  const text = ((item && item.titulo) || '') + ' ' + ((item && item.resumo) || '');
  const t = text.toLowerCase();
  let value = 40;
  if (/viaduto das artes|museus centro|mumo|mis bh|mhab|abilio barreto/.test(t)) value += 25;
  if (/belo horizonte|minas gerais/.test(t)) value += 15;
  if (/museu|patrimonio|memoria|acervo|museologia/.test(t)) value += 10;
  if (/cinema|audiovisual|fotografia|moda|design|expografia/.test(t)) value += 10;
  if (/noturno|edital|oportunidade|artigo|ufmg/.test(t)) value += 10;
  return Math.min(100, value);
}

function getThumbnail(item) {
  const url = normalizeStr(item && item.imagem_url);
  return /^https?:\/\//i.test(url) && !url.includes('placeholder') ? url : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ success: false, error: 'Sessao nao identificada.' }, { status: 401 });
    }

    const userRoles = [user.role, user.base_role, user.app_role].map(normalizeRole).filter(Boolean);

    if (!isAllowed(userRoles)) {
      const perms = await base44.asServiceRole.entities.UserPermission.filter({ user_email: String(user.email || '').toLowerCase() }).catch(() => []);
      const perm = Array.isArray(perms) ? perms[0] : null;
      const extRoles = [perm && perm.base_role, perm && perm.role].map(normalizeRole).filter(Boolean);
      if (!isAllowed([...userRoles, ...extRoles])) {
        return Response.json({ success: false, error: 'Permissao insuficiente.' }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const today = new Date();
    const limit = Math.max(1, Math.min(20, Number((body && body.limit) || 20)));

    const existing = await base44.asServiceRole.entities.NewsHighlight.list('-created_date', 500);
    const existingList = Array.isArray(existing) ? existing : [];
    const existingLinks = new Set(existingList.map((item) => normalizeStr(item && item.link)).filter(Boolean));

    let deactivated = 0;
    for (const item of existingList) {
      if (item && item.ativo && isExpired(item, today)) {
        await base44.asServiceRole.entities.NewsHighlight.update(item.id, { ativo: false });
        deactivated += 1;
      }
    }

    const prompt = `Voce e curador editorial do projeto Museus Centro em Belo Horizonte (MUMO, MIS BH, MHAB, Viaduto das Artes).

Data atual: ${today.toISOString().slice(0, 10)}

Temas para curadoria:
${TEMAS.map((t) => '- ' + t).join('\n')}

Gere ${limit} itens editoriais relevantes. Podem ser noticias, artigos academicos ou oportunidades culturais.

Regras:
- Titulos realistas e descritivos
- Resumos com 1-2 frases
- data_publicacao no formato YYYY-MM-DD (ultimos 30 dias)
- tipo_conteudo: NOTICIA, ARTIGO_DENSO ou OPORTUNIDADE
- Priorize conteudo sobre Viaduto das Artes, MUMO, MIS BH e MHAB
- Campo link: use dominio plausivel como portalbelohorizonte.com.br ou culturadoria.com.br`;

    const result = await invokeLLM(base44.asServiceRole,{
      model: 'gpt_5_4',
      prompt,
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
                imagem_url: { type: 'string' },
                data_publicacao: { type: 'string' },
                tipo_conteudo: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    });

    const seen = new Set();
    let collected = 0;
    let saved = 0;
    let rejected = 0;

    const noticias = Array.isArray(result && result.noticias) ? result.noticias : [];
    for (const item of noticias) {
      if (saved >= limit) break;
      const link = normalizeStr(item && item.link);
      if (!link || seen.has(link) || existingLinks.has(link)) continue;
      seen.add(link);
      collected += 1;
      if (isExpired(item, today)) { rejected += 1; continue; }
      const relevance = calcScore(item);
      if (relevance < 50) { rejected += 1; continue; }
      const status = relevance >= 80 ? 'PUBLICADO_AUTO' : 'PENDENTE';
      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: normalizeStr(item && item.titulo) || 'Sem titulo',
        resumo: normalizeStr(item && item.resumo),
        link,
        imagem_url: getThumbnail(item),
        fonte: 'web',
        data_publicacao: normalizeStr(item && item.data_publicacao) || today.toISOString().slice(0, 10),
        tipo_conteudo: normalizeStr(item && item.tipo_conteudo) || 'NOTICIA',
        score_pertinencia: relevance,
        score_atualidade: 80,
        tags: Array.isArray(item && item.tags) ? item.tags : [],
        palavra_chave_geradora: TEMAS[0],
        motivo_curadoria: 'Score ' + relevance + ' - curadoria GPT',
        status_curadoria: status,
        ativo: status === 'PUBLICADO_AUTO',
        publicado_por_ia: status === 'PUBLICADO_AUTO',
        modelo_curadoria: 'gpt_5_4',
      });
      existingLinks.add(link);
      saved += 1;
    }

    return Response.json({
      success: true,
      data: today.toISOString().slice(0, 10),
      executado_por: user.email || user.id,
      desativados_expirados: deactivated,
      coletados: collected,
      salvos: saved,
      rejeitados: rejected,
    });
  } catch (error) {
    console.error('[curadoria] Erro fatal:', error);
    return Response.json({ success: false, code: 'CURATION_FAILED', error: String((error && error.message) || error) }, { status: 500 });
  }
});