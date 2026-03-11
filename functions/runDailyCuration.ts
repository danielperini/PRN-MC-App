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

const CURATION_SYSTEM_PROMPT = `Você é a curadoria editorial do painel LeitorNoticias do Projeto Museus Centro.

MISSÃO EXPANDIDA:
- Gerar 10-15 palavras-chave VARIADAS por dia combinando temas + territórios + autores + formatos
- Buscar conteúdo em português e inglês
- Avaliar pertinência com sistema de pesos editoriais
- Publicar automaticamente (>= 80), enviar para pendência (60-79) ou descartar (< 60)

TEMAS OBRIGATÓRIOS (variar diariamente):
${TEMAS_ESPECIFICOS.map((t, i) => `${i + 1}. ${t}`).join('\n')}

AUTORES PRIORITÁRIOS (incluir em buscas de artigos densos):
${AUTORES_PRIORITARIOS.join(' • ')}

FONTES COM MAIOR PESO:
${FONTES_PRIORITARIAS.join(' • ')}

ESTRATÉGIA DE BUSCA:
1. Combine tema + território + autor + formato: "museologia urbana belo horizonte artigo"
2. Use variações: "expografia contemporânea brasil scielo"
3. Altere a ordem diariamente: "fotografia memória urbana belo horizonte"
4. Inclua combinações: "mediação da informação museu imagem som"
5. Busque em bases acadêmicas: "preservação audiovisual minas gerais pdf"

SISTEMA DE PESOS EDITORIAIS (scoring):
- Base: 50 pontos
- +15 se conteúdo ligado a Belo Horizonte ou Minas Gerais
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

META DIÁRIA: 10 conteúdos
- 5 NOTICIA
- 5 ARTIGO_DENSO/OPORTUNIDADE

EQUILÍBRIO TEMÁTICO ESPERADO:
- 2-3 conteúdos ligados a BH
- 2-3 sobre museologia/expografia/montagem
- 2-3 sobre fotografia/cinema/audiovisual
- 2-3 acadêmicos/científicos com alto repertório

RECÊNCIA:
- NOTICIA: máximo 14 dias
- ARTIGO_DENSO: máximo 1 ano

Retorne JSON com array de conteúdos:
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
  "status_curadoria": "PUBLICADO_AUTO|PENDENTE|REJEITADO"
}`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Selecionar temas variados para hoje
    const temasDodia = TEMAS_ESPECIFICOS.sort(() => Math.random() - 0.5).slice(0, 6);
    const autoresDodia = AUTORES_PRIORITARIOS.sort(() => Math.random() - 0.5).slice(0, 3);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${CURATION_SYSTEM_PROMPT}

Data de hoje: ${new Date().toISOString().split('T')[0]}

TEMAS DO DIA (use variações destes):
${temasDodia.map(t => `• ${t}`).join('\n')}

AUTORES DO DIA (inclua em buscas de artigos):
${autoresDodia.join(' • ')}

EXECUÇÃO:
1. Combine temas + territórios + autores + formatos em 10-15 consultas diferentes
2. Varie estratégias: curta, média, cauda longa, sinônimos
3. Busque em fontes prioritárias (SciELO, bases acadêmicas, instituições locais)
4. Para cada resultado: aplique sistema de pesos editoriais
5. Classifique como NOTICIA (5) ou ARTIGO_DENSO (5)
6. Decida status baseado no score
7. Retorne array com todos os conteúdos encontrados (publicáveis + pendentes)

Exemplos de combinações para hoje:
- "${temasDodia[0]} artigo"
- "${temasDodia[1]} ${autoresDodia[0]}"
- "${temasDodia[2]} belo horizonte scielo"
- "${temasDodia[3]} montagem exposição artigo acadêmico"
- "fotografia memória ${autoresDodia[1]} brasil"
- "mediação cultural museu imagem som"
- "expografia design ${autoresDodia[2]}"

Mantenha equilíbrio: 2-3 BH, 2-3 museologia, 2-3 fotografia/cinema, 2-3 acadêmicos.`,
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
      resultados: toSave
    });
  } catch (error) {
    console.error('Erro em runDailyCuration:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});