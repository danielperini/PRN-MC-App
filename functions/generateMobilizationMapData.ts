import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MUSEU_COORDS = {
  MHAB: { lat: -19.9191, lng: -43.9385, nome: 'Museu Histórico Abílio Barreto' },
  MIS: { lat: -19.9280, lng: -43.9447, nome: 'Museu da Imagem e do Som' },
  MUMO: { lat: -19.9244, lng: -43.9432, nome: 'Museu de Mineralogia' }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { museu } = await req.json();
    if (!museu || !MUSEU_COORDS[museu]) {
      return Response.json({ error: 'Museu inválido' }, { status: 400 });
    }

    // Buscar atividades recentes para contexto
    const atividades = await base44.asServiceRole.entities.Activity.filter({}, '-created_date', 15);
    
    const resumoAtividades = atividades.map(a => ({
      titulo: a.titulo,
      tipo_equipe: a.tipo_equipe,
      publico: {
        infantil: a.faixa_etaria_infantil || 0,
        adolescente: a.faixa_etaria_adolescente || 0,
        adulto: a.faixa_etaria_adulto || 0,
        senior: a.faixa_etaria_senior || 0
      }
    }));

    const coordMuseu = MUSEU_COORDS[museu];

    const prompt = `Você é especialista em mobilização cultural e infraestrutura de produção para museus em Belo Horizonte.

MUSEU: ${coordMuseu.nome}
LOCALIZAÇÃO: ${coordMuseu.lat}, ${coordMuseu.lng}

ATIVIDADES RECENTES:
${JSON.stringify(resumoAtividades.slice(0, 10), null, 2)}

GERE LISTA DE OPORTUNIDADES NO ENTORNO do museu (raio de 2-5km):

1. MOBILIZAÇÃO (público):
   - Escolas públicas e privadas (infantil, fundamental, médio)
   - Escolas técnicas
   - Universidades (UFMG, PUC, etc)
   - Centros culturais e associações
   - Lares de idosos
   - Associações temáticas (fotografia, cinema, artes)

2. INFRAESTRUTURA & PRODUÇÃO:
   - Hotéis e pousadas (hospedagem para visitantes/professores)
   - Lojas de ferramentas e materiais de construção
   - Lojas de fotografia e equipamento audiovisual
   - Eletricistas especializados em produção/cenografia
   - Pintores e cenógrafos
   - Locadoras de equipamento de som/iluminação
   - Fornecedores de materiais de arte e design

Para CADA instituição/serviço, retorne:
- nome e tipo
- bairro aproximado
- coordenadas estimadas (lat/lng)
- categoria: MOBILIZACAO ou PRODUCAO
- score_interesse (0-100): relevância para o projeto
- score_proximidade (0-100): proximidade ao museu
- temas_afinidade: ["tema1", "tema2"]
- insights: estratégia de engajamento/parceria

Foque em instituições REAIS e conhecidas em BH.

Retorne JSON:
{
  "oportunidades": [
    {
      "nome": "Nome da instituição",
      "tipo_instituicao": "ESCOLA_PUBLICA|UNIVERSIDADE|HOTEL|ELETRICISTA|...",
      "bairro": "Bairro",
      "categoria": "MOBILIZACAO|PRODUCAO",
      "coordenadas": {"lat": -19.xxx, "lng": -43.xxx},
      "publico_potencial": "INFANTIL|ADOLESCENTE|ADULTO|N/A",
      "temas_afinidade": ["tema1", "tema2"],
      "score_interesse": 0-100,
      "score_proximidade": 0-100,
      "insights": "Texto com estratégia de engajamento"
    }
  ]
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          oportunidades: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                tipo_instituicao: { type: 'string' },
                bairro: { type: 'string' },
                categoria: { type: 'string' },
                coordenadas: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' }
                  }
                },
                publico_potencial: { type: 'string' },
                temas_afinidade: { type: 'array', items: { type: 'string' } },
                score_interesse: { type: 'number' },
                score_proximidade: { type: 'number' },
                insights: { type: 'string' }
              }
            }
          }
        },
        required: ['oportunidades']
      }
    });

    const oportunidades = result?.oportunidades || [];

    // Salvar no banco
    const toSave = oportunidades.map(opp => ({
      museu,
      nome: opp.nome,
      tipo_instituicao: opp.tipo_instituicao,
      bairro: opp.bairro,
      categoria: opp.categoria,
      coordenadas: opp.coordenadas,
      publico_potencial: opp.publico_potencial || 'N/A',
      temas_afinidade: opp.temas_afinidade || [],
      score_interesse: opp.score_interesse,
      score_proximidade: opp.score_proximidade,
      insights_claude: opp.insights,
      ultima_analise: new Date().toISOString()
    }));

    if (toSave.length > 0) {
      await base44.asServiceRole.entities.MobilizationOpportunity.bulkCreate(toSave);
    }

    return Response.json({
      success: true,
      museu,
      coordMuseu,
      total_oportunidades: oportunidades.length,
      oportunidades
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});