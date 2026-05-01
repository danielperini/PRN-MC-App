import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// PALAVRAS-CHAVE — ampliadas com acadêmicos, editais, noturno
// ============================================================
const TEMAS_ESPECIFICOS = [
  'museologia urbana em Belo Horizonte',
  'memória audiovisual em Minas Gerais',
  'preservação de acervos fotográficos',
  'educação museal em museus de cidade',
  'mediação cultural em museus públicos',
  'expografia contemporânea no Brasil',
  'montagem de exposições de fotografia',
  'curadoria de imagem e som',
  'patrimônio fotográfico brasileiro',
  'patrimônio audiovisual e digitalização',
  'história dos museus em Belo Horizonte',
  'museus e formação de público',
  'acessibilidade em museus e exposições',
  'museus, memória e território urbano',
  'fotografia documental e memória urbana',
  'cinema, arquivo e preservação',
  'exposições imersivas e dispositivos expográficos',
  'design expográfico e sinalização interpretativa',
  'gestão cultural em museus municipais',
  'moda, memória e museus',
  'avaliação de públicos e impacto cultural em museus',
  // artigos acadêmicos / museologia científica
  'artigo acadêmico museologia brasil scielo',
  'revista museu patrimônio memória scielo',
  'tese dissertação museologia UFMG',
  'publicação científica museus brasileiros',
  'pesquisa museal educação patrimonial',
  'artigo sobre visitas noturnas museus',
  'noturno nos museus experiência educativa',
  'night at the museum educational experience',
  'museus noturnos programação cultural internacional',
  // editais e oportunidades
  'edital cultura museu arte 2025 2026',
  'chamada pública patrimônio cultural',
  'oportunidade bolsa arte museu brasil',
  'fomento cultura mineira editais',
  'prêmio cultura patrimônio brasil',
  'residência artística museu brasil',
  'edital audiovisual video fotografia arte',
  // fotografia / vídeo / arte
  'fotografia contemporânea museu exposição',
  'video arte exposição museu',
  'arte contemporânea museu brasil',
  'produção audiovisual minas gerais',
  'festival fotografia arte brasil',
];

const AUTORES_PRIORITARIOS = [
  'Marília Xavier Cury',
  'Bruno Brulon',
  'Tereza Scheiner',
  'Ulpiano Bezerra de Meneses',
  'Paulo Knauss',
  'Eilean Hooper-Greenhill',
  'George Hein',
  'Boris Kossoy',
  'Arlindo Machado',
  'André Rouillé',
];

// ============================================================
// Utilitários
// ============================================================
function shuffleArray(items) {
  const arr = Array.isArray(items) ? [...items] : [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function dedupeByLink(items) {
  const seen = new Set();
  return (items || []).filter(item => {
    if (!item?.link) return false;
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

function sortByRecency(items) {
  return [...items].sort((a, b) => {
    const da = parseDate(a.data_publicacao);
    const db = parseDate(b.data_publicacao);
    if (da && db) return db - da;
    if (db) return 1;
    if (da) return -1;
    return 0;
  });
}

// Decide thumbnail: prefere a imagem retornada; se nula ou genérica, usa Unsplash temático
function resolveThumbnail(imagem_url, tags = [], titulo = '') {
  if (imagem_url && imagem_url.startsWith('http') && !imagem_url.includes('placeholder')) {
    return imagem_url;
  }
  // Gerar query Unsplash baseada nas tags / titulo
  const text = `${tags.join(' ')} ${titulo}`.toLowerCase();
  let query = 'museum+art+culture';
  if (/noturno|noite|night/.test(text)) query = 'museum+night+lights';
  else if (/fotografia|photo/.test(text)) query = 'photography+art+museum';
  else if (/video|audiovisual|cinema/.test(text)) query = 'cinema+film+art';
  else if (/moda|fashion|têxtil/.test(text)) query = 'fashion+museum+exhibition';
  else if (/edital|oportunidade|bolsa/.test(text)) query = 'art+opportunity+culture';
  else if (/exposição|expografia/.test(text)) query = 'art+exhibition+gallery';
  else if (/patrimônio|history|história/.test(text)) query = 'heritage+architecture+history';
  const seed = Math.floor(Math.random() * 1000);
  return `https://source.unsplash.com/800x450/?${query}&sig=${seed}`;
}

function calcScore(news) {
  let score = 50;
  const text = `${news.titulo} ${news.resumo}`.toLowerCase();
  if (/viaduto das artes|museus centro|mumo|mis bh|mhab|abílio barreto/.test(text)) score += 20;
  if (/belo horizonte|bh|minas gerais/.test(text)) score += 15;
  if (/museu|patrimônio|memória|acervo/.test(text)) score += 10;
  if (/cinema|audiovisual|fotografia|documentário/.test(text)) score += 10;
  if (/moda|têxtil|design/.test(text)) score += 10;
  if (/noturno|noite|night at the museum/.test(text)) score += 10;
  if (/edital|chamada|oportunidade|bolsa|residência/.test(text)) score += 10;
  if (/artigo|scielo|pesquisa|dissertação|tese|acadêmico/.test(text)) score += 10;
  if (/história|histórico/.test(text)) score += 5;
  return Math.min(score, 100);
}

function isContentExpired(item, today) {
  // Descarta notícias com data > 30 dias
  if (!item.data_publicacao) return false;
  const pub = parseDate(item.data_publicacao);
  if (!pub) return false;
  const diffDays = (today - pub) / (1000 * 60 * 60 * 24);
  // Artigos densos: tolerar até 1 ano
  if (item.tipo_conteudo === 'ARTIGO_DENSO') return diffDays > 365;
  // Oportunidades: tolerar até 60 dias (editais podem ter prazo)
  if (item.tipo_conteudo === 'OPORTUNIDADE') return diffDays > 60;
  // Notícias: 30 dias
  return diffDays > 30;
}

// ============================================================
// Handler
// ============================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // --------------------------------------------------------
    // 1. LIMPEZA: desativar conteúdos expirados (> 30 dias para notícias)
    // --------------------------------------------------------
    const allExisting = await base44.asServiceRole.entities.NewsHighlight.list('-created_date', 500);
    const existingLinks = new Set(allExisting.map(n => n.link).filter(Boolean));

    let deactivatedCount = 0;
    for (const item of allExisting) {
      if (!item.ativo) continue;
      if (isContentExpired(item, today)) {
        await base44.asServiceRole.entities.NewsHighlight.update(item.id, { ativo: false });
        deactivatedCount++;
        console.log(`[curadoria] Desativado (expirado): ${item.titulo}`);
      }
    }
    console.log(`[curadoria] Desativados por expiração: ${deactivatedCount}`);

    // --------------------------------------------------------
    // 2. BUSCA — temas do dia sortidos
    // --------------------------------------------------------
    const temasDodia = shuffleArray(TEMAS_ESPECIFICOS).slice(0, 10);
    const autoresDodia = shuffleArray(AUTORES_PRIORITARIOS).slice(0, 3);

    // 3 grupos temáticos amplos — cada um cobre múltiplas categorias numa única chamada
    const topicGroups = [
      {
        label: 'BH + Museus + Artigos Acadêmicos',
        termos: [
          `Viaduto das Artes MUMO MIS MHAB Belo Horizonte 2025 2026`,
          `${temasDodia[0]} artigo scielo museologia`,
          `${autoresDodia[0]} museologia artigo acadêmico`,
          `${temasDodia[1]} pesquisa UFMG repositório`,
        ].join('\n- '),
      },
      {
        label: 'Noturno + Editais + Oportunidades',
        termos: [
          `noturno nos museus visita noturna 2025 2026 brasil`,
          `night at the museum program international`,
          `edital cultura arte museu brasil 2025 2026`,
          `oportunidade bolsa residência artística museu fotografia video`,
          `chamada pública patrimônio fomento minas gerais`,
        ].join('\n- '),
      },
      {
        label: 'Fotografia + Video + Arte + Internacional',
        termos: [
          `fotografia contemporânea exposição museu brasil`,
          `video arte museu exposição audiovisual 2025`,
          `festival fotografia arte belo horizonte`,
          `${temasDodia[2]} museum international article english`,
          `museum education engagement global 2025`,
        ].join('\n- '),
      },
    ];

    const collected = [];
    const maxItems = 20;

    for (const group of topicGroups) {
      if (collected.length >= maxItems) break;

      let searchResult = null;
      try {
        searchResult = await base44.integrations.Core.InvokeLLM({
          model: 'gemini_3_flash',
          add_context_from_internet: true,
          prompt: `Pesquise notícias, artigos acadêmicos, editais e oportunidades sobre: ${group.label}

Termos de busca:
- ${group.termos}

Data de hoje: ${today.toISOString().split('T')[0]}

REGRAS:
- Priorize: Viaduto das Artes, MUMO, MIS BH, MHAB, Projeto Museus Centro
- Inclua artigos acadêmicos (SciELO, UFMG), editais abertos, visitas noturnas em museus
- DESCARTE notícias com data anterior a ${thirtyDaysAgo.toISOString().split('T')[0]} (exceto artigos e editais em aberto)
- DESCARTE eventos com datas de realização já passadas
- Retorne até 8 itens
- Não invente links — omita se URL não for real
- data_publicacao obrigatório (YYYY-MM-DD)
- imagem_url: URL real ou null

Retorne JSON: { "noticias": [{ "titulo": string, "resumo": string, "link": string, "imagem_url": string|null, "data_publicacao": string, "tipo_conteudo": "NOTICIA|ARTIGO_DENSO|OPORTUNIDADE", "tags": string[] }] }`,
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
                  }
                }
              }
            }
          }
        });
      } catch (e) {
        console.error(`[curadoria] Erro no grupo "${group.label}":`, e.message);
        continue;
      }

      if (searchResult?.noticias?.length) {
        for (const item of searchResult.noticias) {
          if (!item?.link) continue;
          if (existingLinks.has(item.link)) continue;
          if (isContentExpired(item, today)) {
            console.log(`[curadoria] Ignorado (expirado): ${item.titulo}`);
            continue;
          }
          collected.push(item);
          existingLinks.add(item.link);
        }
      }
      console.log(`[curadoria] Grupo "${group.label}": ${searchResult?.noticias?.length || 0} encontrados`);
    }

    console.log(`[curadoria] Coletados: ${collected.length}`);

    // --------------------------------------------------------
    // 3. CLASSIFICAR e SALVAR com thumbnail melhorado
    // --------------------------------------------------------
    const unique = dedupeByLink(sortByRecency(collected));
    let savedCount = 0;
    let rejectedCount = 0;

    for (const item of unique) {
      if (savedCount >= maxItems) break;

      const score = calcScore(item);
      if (score < 50) { rejectedCount++; continue; }

      const statusCuradoria = score >= 80 ? 'PUBLICADO_AUTO' : 'PENDENTE';
      const thumbnail = resolveThumbnail(item.imagem_url, item.tags || [], item.titulo || '');

      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: item.titulo || 'Sem título',
        resumo: item.resumo || '',
        link: item.link,
        imagem_url: thumbnail,
        fonte: 'web',
        data_publicacao: item.data_publicacao || today.toISOString().split('T')[0],
        tipo_conteudo: item.tipo_conteudo || 'NOTICIA',
        score_pertinencia: score,
        score_atualidade: 80,
        tags: item.tags || [],
        palavra_chave_geradora: temasDodia[0],
        motivo_curadoria: `Score ${score} — curadoria automática`,
        status_curadoria: statusCuradoria,
        ativo: statusCuradoria === 'PUBLICADO_AUTO',
        publicado_por_ia: statusCuradoria === 'PUBLICADO_AUTO',
        modelo_curadoria: 'gemini_3_flash',
      });

      savedCount++;
    }

    console.log(`[curadoria] Salvos: ${savedCount}, Rejeitados: ${rejectedCount}, Desativados: ${deactivatedCount}`);

    return Response.json({
      success: true,
      data: today.toISOString().split('T')[0],
      desativados_expirados: deactivatedCount,
      coletados: collected.length,
      salvos: savedCount,
      rejeitados: rejectedCount,
    });
  } catch (error) {
    console.error('[curadoria] Erro fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});