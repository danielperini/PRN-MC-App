import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { descricao } = await req.json();

    if (!descricao || descricao.trim().length < 10) {
      return Response.json({ error: 'Descrição muito curta' }, { status: 400 });
    }

    const prompt = `Analise a seguinte descrição de atividade e sugira o tipo e a meta correspondente.

Descrição: "${descricao}"

Tipos válidos: educativo, oficina, atividade cultural, exposicao, mostra, evento
Metas válidas: META EDUCATIVA (60 ações educativas), META EXPOSIÇÃO (3 exposições), META CULTURAL (36 atividades culturais), META MOSTRAS (18 mostras), META PUBLICAÇÃO (1 catálogo), EVENTO ESPECIAL (Presente de Iemanjá)

Responda em JSON com a seguinte estrutura:
{
  "tipo_atividade": "tipo sugerido",
  "meta_sugerida": "nome da meta",
  "confianca": número de 0 a 100,
  "motivo": "explicação breve da sugestão"
}`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          tipo_atividade: { type: 'string' },
          meta_sugerida: { type: 'string' },
          confianca: { type: 'number' },
          motivo: { type: 'string' }
        }
      }
    });

    return Response.json(response);
  } catch (error) {
    console.error('Erro ao analisar descrição:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});