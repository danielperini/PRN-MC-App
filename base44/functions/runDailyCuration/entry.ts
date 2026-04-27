import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const TEMAS_ESPECIFICOS = [
  'museologia urbana em Belo Horizonte',
  'memória audiovisual em Minas Gerais',
  'preservação de acervos fotográficos',
  'preservação de acervos cinematográficos',
  'educação museal em museus de cidade',
  'mediação cultural em museus públicos',
  'mediação da informação em exposições',
  'expografia contemporânea no Brasil',
  'montagem de exposições de fotografia',
  'montagem de exposições de cinema e audiovisual',
  'curadoria de imagem e som',
  'patrimônio fotográfico brasileiro',
  'patrimônio audiovisual e digitalização',
  'história dos museus em Belo Horizonte',
  'museus e formação de público',
  'acessibilidade em museus e exposições',
  'libras, mediação e acessibilidade cultural',
  'museus, memória e território urbano',
  'fotografia documental e memória urbana',
  'cinema, arquivo e preservação',
  'exposições imersivas e dispositivos expográficos',
  'design expográfico e sinalização interpretativa',
  'planejamento cultural em equipamentos públicos',
  'gestão cultural em museus municipais',
  'programação cultural e descentralização',
  'cultura e centro urbano de Belo Horizonte',
  'moda, memória e museus',
  'acervos têxteis e documentação museológica',
  'museus, educação patrimonial e escola',
  'avaliação de públicos e impacto cultural em museus'
];

const AUTORES_PRIORITARIOS = [
  'Marília Xavier Cury',
  'Bruno Brulon',
  'Tereza Scheiner',
  'Ulpiano Bezerra de Meneses',
  'Paulo Knauss',
  'Eilean Hooper-Greenhill',
  'George Hein',
  'Néstor García Canclini',
  'Andreas Huyssen',
  'Walter Benjamin',
  'Boris Kossoy',
  'Arlindo Machado',
  'Philippe Dubois',
  'André Rouillé',
  'Ralph Appelbaum'
];

const FONTES_PRIORITARIAS = [
  'Portal Belo Horizonte',
  'Circuito Municipal de Cultura',
  'MIS BH',
  'museus municipais de BH',
  'CâmeraSete',
  'Fundação Clóvis Salgado',
  'UFMG',
  'Rede de Museus UFMG',
  'Espaço Memória do Cinema',
  'Imagens de Minas',
  'Escola de Belas Artes UFMG',
  'SciELO',
  'Revista Museu',
  'repositórios universitários'
];

const DISTRIBUICAO_GEOGRAFICA = {
  BH: { percentual: 0.50, descricao: 'Belo Horizonte / Minas Gerais' },
  BRASIL: { percentual: 0.25, descricao: 'Resto do Brasil' },
  INTERNACIONAL: { percentual: 0.25, descricao: 'Conteúdo Internacional' }
};

const CURATION_SYSTEM_PROMPT = `Você é a curadoria editorial do painel LeitorNoticias do Projeto Museus Centro.

MISSÃO EXPANDIDA:
- Gerar 15-20 palavras-chave VARIADAS por dia combinando temas + territórios + autores + formatos
- Buscar conteúdo em português e inglês
- Avaliar pertinência com sistema de pesos editoriais
- Distribuição geográfica: 50% Belo Horizonte/MG, 25% Brasil, 25% Internacional
- Publicar automaticamente (>= 80), enviar para pendência (60-79) ou descartar (< 60)

TEMAS OBRIGATÓRIOS (variar diariamente):
${TEMAS_ESPECIFICOS.map((t, i) => `${i + 1}. ${t}`).join('\n')}

AUTORES PRIORITÁRIOS (incluir em buscas de artigos densos):
${AUTORES_PRIORITARIOS.join(' • ')}

FONTES COM MAIOR PESO:
${FONTES_PRIORITARIAS.join(' • ')}

DISTRIBUIÇÃO GEOGRÁFICA OBRIGATÓRIA:
- 50% de conteúdo de Belo Horizonte ou Minas Gerais
- 25% de conteúdo do resto do Brasil
- 25% de conteúdo Internacional

ESTRATÉGIA DE BUSCA POR GEOGRAFIA:

PARA BELO HORIZONTE (50%):
1. "tema + belo horizonte + artigo"
2. "tema + minas gerais + scielo"
3. "tema + UFMG"
4. "tema + museus municipais bh"
5. "tema + circuito municipal cultura"
6. "tema + fundação clóvis salgado"

PARA BRASIL (25%):
1. "tema + brasil + artigo"
2. "tema + nacional + museus"
3. "tema + universidades brasileiras + repositório"
4. "tema + estados como são paulo, rio de janeiro"
5. "tema + patrimônio brasileiro"

PARA INTERNACIONAL (25%):
1. "tema + international + article"
2. "tema + english + academia"
3. "tema + museum + english"
4. "tema + cultural heritage + worldwide"
5. "tema + author + university"

SISTEMA DE PESOS EDITORIAIS (scoring):
- Base: 50 pontos
- +20 se conteúdo ligado a Belo Horizonte ou Minas Gerais
- +15 se sobre museus, patrimônio ou memória
- +15 se sobre fotografia, cinema ou audiovisual
- +15 se artigo denso, acadêmico ou técnico de fonte confiável
- +10 se sobre mediação, expografia ou montagem
- +10 se diretamente relevante ao Projeto Museus Centro
- -10 se fora de contexto (máximo 100)

CLASSIFICAÇÃO:
- NOTICIA: jornalístico recente (até 14 dias)
- ARTIGO_DENSO: científico, acadêmico, ensaio, técnico (até 1 ano)
- OPORTUNIDADE: edital, chamada, formação

REGRA DE PUBLICAÇÃO:
- >= 80: PUBLICADO_AUTO
- 60-79: PENDENTE
- < 60: REJEITADO (descartar)

META DIÁRIA: 20 conteúdos
- 10 de Belo Horizonte/MG (50%)
- 5 do resto do Brasil (25%)
- 5 Internacionais (25%)

RECÊNCIA:
- NOTICIA: máximo 14 dias
- ARTIGO_DENSO: máximo 1 ano

Retorne JSON com array de conteúdos garantindo distribuição geográfica:
{
  "titulo": string,
  "resumo": string,
  "link": string,
  "imagem_url": string|null,
  "fonte": "web",
  "data_publicacao": "YYYY-MM-DD",
  "tipo_conteudo": "NOTICIA|ARTIGO_DENSO|OPORTUNIDADE",
  "score_pertinencia": number(0-100),
  "score_atualidade": number(0-100),
  "tags": array,
  "palavra_chave_geradora": string,
  "motivo_curadoria": string,
  "status_curadoria": "PUBLICADO_AUTO|PENDENTE|REJEITADO",
  "localizacao_geografica": "BH|BRASIL|INTERNACIONAL"
}`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Selecionar temas variados para hoje
     const temasDodia = TEMAS_ESPECIFICOS.sort(() => Math.random() - 0.5).slice(0, 8);
     const autoresDodia = AUTORES_PRIORITARIOS.sort(() => Math.random() - 0.5).slice(0, 4);

     const result = await base44.integrations.Core.InvokeLLM({
       prompt: `${CURATION_SYSTEM_PROMPT}

    Data de hoje: ${new Date().toISOString().split('T')[0]}

    TEMAS DO DIA (use variações destes):
    ${temasDodia.map(t => `• ${t}`).join('\n')}

    AUTORES DO DIA (inclua em buscas de artigos):
    ${autoresDodia.join(' • ')}

    EXECUÇÃO (OBRIGATÓRIO: 50% BH, 25% Brasil, 25% Internacional):

    PARA BELO HORIZONTE/MG (10 conteúdos):
    1. "${temasDodia[0]} belo horizonte artigo"
    2. "${temasDodia[1]} minas gerais scielo"
    3. "${temasDodia[2]} UFMG museus"
    4. "${temasDodia[3]} circuito municipal cultura bh"
    5. "${temasDodia[4]} fundação clóvis salgado"
    6. "${temasDodia[5]} belo horizonte ${autoresDodia[0]}"
    7. "${temasDodia[6]} memória urbana belo horizonte"
    8. "${temasDodia[7]} minas gerais patrimônio"
    9. "museu história belo horizonte ${autoresDodia[1]}"
    10. "expografia montagem ${autoresDodia[2]} bh"

    PARA BRASIL (5 conteúdos):
    1. "${temasDodia[0]} brasil museus artigo"
    2. "${temasDodia[1]} repositório universitário brasileiro"
    3. "${temasDodia[2]} patrimônio nacional ${autoresDodia[3]}"
    4. "${temasDodia[3]} mediação cultural universidades brasileiras"
    5. "${temasDodia[4]} fotografia memória brasil"

    PARA INTERNACIONAL (5 conteúdos):
    1. "${temasDodia[5]} international article"
    2. "${temasDodia[6]} museum education global"
    3. "${temasDodia[7]} heritage preservation worldwide"
    4. "museology urban contemporary english"
    5. "museum collection management international"

    VALIDAÇÃO FINAL:
    - Garantir exatamente 50% BH, 25% Brasil, 25% Internacional
    - Adicionar campo "localizacao_geografica" com valor BH, BRASIL ou INTERNACIONAL
    - Todos os itens devem ter status_curadoria definido (PUBLICADO_AUTO, PENDENTE ou REJEITADO)
    - Mínimo 60 de score para serem salvos`,
      add_context_from_internet: true,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          resultados: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                resumo: { type: 'string' },
                link: { type: 'string' },
                imagem_url: { type: ['string', 'null'] },
                fonte: { type: 'string' },
                data_publicacao: { type: 'string' },
                tipo_conteudo: { type: 'string' },
                score_pertinencia: { type: 'number' },
                score_atualidade: { type: 'number' },
                tags: { type: 'array', items: { type: 'string' } },
                palavra_chave_geradora: { type: 'string' },
                motivo_curadoria: { type: 'string' },
                status_curadoria: { type: 'string' }
              }
            }
          }
        },
        required: ['resultados']
      }
    });

    const resultados = result?.resultados || [];
     const toSave = resultados.filter(r => r.status_curadoria !== 'REJEITADO');

     // Validar distribuição geográfica
     const distribuicao = {
       BH: toSave.filter(r => r.localizacao_geografica === 'BH').length,
       BRASIL: toSave.filter(r => r.localizacao_geografica === 'BRASIL').length,
       INTERNACIONAL: toSave.filter(r => r.localizacao_geografica === 'INTERNACIONAL').length
     };

     if (toSave.length > 0) {
       await base44.asServiceRole.entities.NewsHighlight.bulkCreate(toSave.map(r => ({
         ...r,
         ativo: r.status_curadoria === 'PUBLICADO_AUTO',
         publicado_por_ia: r.status_curadoria === 'PUBLICADO_AUTO',
         modelo_curadoria: 'claude'
       })));
     }

     return Response.json({
       success: true,
       salvos: toSave.length,
       rejeitados: resultados.filter(r => r.status_curadoria === 'REJEITADO').length,
       distribuicao_geografica: distribuicao,
       detalhes_esperado: {
         BH: `${Math.round(distribuicao.BH / toSave.length * 100 || 0)}% (esperado 50%)`,
         BRASIL: `${Math.round(distribuicao.BRASIL / toSave.length * 100 || 0)}% (esperado 25%)`,
         INTERNACIONAL: `${Math.round(distribuicao.INTERNACIONAL / toSave.length * 100 || 0)}% (esperado 25%)`
       },
       resultados: toSave
     });
  } catch (error) {
    console.error('Erro em runDailyCuration:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});