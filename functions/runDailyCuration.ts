import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CURATION_SYSTEM_PROMPT = `Você é a curadoria editorial do painel LeitorNoticias do Projeto Museus Centro.

Sua missão:
- Gerar palavras-chave VARIADAS para buscar conteúdo relevante
- Buscar artigos, notícias, artigos científicos e oportunidades na web
- Avaliar pertinência de cada resultado
- Decidir automaticamente o que publicar, o que mandar para pendência e o que descartar

REQUISITOS:
1. Gere 8-12 palavras-chave diferentes por dia (curtas, médias, cauda longa, sinônimos)
2. Busque em português e inglês
3. Priorize conteúdo sobre:
   - Projeto Museus Centro, museus de Belo Horizonte, cultura em BH
   - Cinema, fotografia, audiovisual, museologia, expografia
   - Curadoria, patrimônio, memória, acervo
   - Planejamento cultural, gestão cultural, educação em museus

4. CLASSIFICAÇÃO:
   - NOTICIA: conteúdo jornalístico recente (até 14 dias)
   - ARTIGO_DENSO: artigos científicos, acadêmicos, ensaios, técnicos (até 1 ano)
   - OPORTUNIDADE: editais, chamadas públicas, formações

5. SCORE DE PERTINÊNCIA (0-100):
   - Relevância para projeto Museus Centro / cultura em BH
   - Qualidade da fonte
   - Atualidade
   - Densidade informativa
   - Utilidade para o painel

6. REGRA DE PUBLICAÇÃO:
   - >= 80: PUBLICADO_AUTO
   - 60-79: PENDENTE
   - < 60: REJEITADO (descartar, não salvar)

7. META DIÁRIA: 10 conteúdos
   - 5 NOTICIA
   - 5 ARTIGO_DENSO/OPORTUNIDADE

8. RECÊNCIA:
   - NOTICIA: máximo 14 dias
   - ARTIGO_DENSO: máximo 1 ano

Retorne JSON com array de objetos contendo:
{
  "titulo": string,
  "resumo": string,
  "link": string,
  "imagem_url": string (pode ser null),
  "fonte": "web",
  "data_publicacao": "YYYY-MM-DD",
  "tipo_conteudo": "NOTICIA|ARTIGO_DENSO|OPORTUNIDADE",
  "score_pertinencia": number,
  "score_atualidade": number,
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

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${CURATION_SYSTEM_PROMPT}

Data de hoje: ${new Date().toISOString().split('T')[0]}

EXECUÇÃO IMEDIATA:
1. Gere as palavras-chave variadas para hoje
2. Busque conteúdo relevante usando cada palavra-chave
3. Analise cada resultado e atribua score
4. Classifique como NOTICIA, ARTIGO_DENSO ou OPORTUNIDADE
5. Decida status (PUBLICADO_AUTO, PENDENTE, REJEITADO)
6. Retorne array JSON com todos os conteúdos encontrados

Foco em buscar conteúdo de qualidade sobre os temas do projeto.`,
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