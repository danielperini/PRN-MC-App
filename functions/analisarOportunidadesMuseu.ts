import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MUSEUM_THEMES = {
  'MHAB': 'história, patrimônio, documentação, preservação, memória coletiva',
  'MIS': 'cinema, audiovisual, imagem, som, narrativas visuais, produção audiovisual',
  'MUMO': 'moda, design de moda, estilo, vestuário, criatividade Fashion, história da moda',
  'Viaduto das Artes': 'artes visuais, galeria, exposições, artistas emergentes, criação artística'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { museu_sigla } = payload;

    if (!museu_sigla) {
      return new Response(JSON.stringify({ error: 'museu_sigla obrigatório' }), { status: 400 });
    }

    // Buscar pontos do entorno
    const pontos = await base44.asServiceRole.entities.PontoEntorno.filter({
      museu_sigla,
      ativo: true,
    });

    if (pontos.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum ponto encontrado' }), { status: 200 });
    }

    // Buscar atividades do museu para entender padrões
    const reports = await base44.asServiceRole.entities.Report.filter({
      museu: museu_sigla,
      status: 'APPROVED',
    });

    const activitiesContext = reports
      .slice(0, 20)
      .flatMap(r => r.atividades || [])
      .filter(a => a.titulo && a.descricao)
      .map(a => `${a.titulo}: ${a.descricao}`)
      .join('\n');

    const museumThemes = MUSEUM_THEMES[museu_sigla] || 'artes e cultura';

    // Análise em lote
    const analises = [];
    const pontosTexto = pontos
      .map(p => `- ${p.nome} (${p.categoria}, ${p.bairro}), públicos: ${p.publicos_alvo?.join(', ') || 'não mapeado'}`)
      .join('\n');

    const prompt = `Você é um especialista em mobilização cultural e estratégia de territorialidade.

MUSEU: ${museu_sigla}
TEMÁTICAS PRINCIPAIS: ${museumThemes}

ATIVIDADES JÁ REALIZADAS:
${activitiesContext || '(Sem histórico de atividades ainda)'}

PONTOS DO ENTORNO A ANALISAR:
${pontosTexto}

Para CADA instituição/ponto, forneça análise JSON estruturado:
[
  {
    "nome": "Nome da instituição",
    "aderencia_tematica": número de 0-100,
    "prioridade": "Alta" ou "Média" ou "Baixa",
    "oportunidades": ["Oficina", "Visita guiada", "Pesquisa compartilhada", "Parceria em evento"],
    "justificativa": "texto curto"
  }
]

Considere:
- Alinhamento temático com o museu
- Acesso geográfico
- Potencial de engajamento de público
- Viabilidade de parcerias duradouras`;

    const resultado = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          analises: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                aderencia_tematica: { type: 'number' },
                prioridade: { type: 'string' },
                oportunidades: { type: 'array', items: { type: 'string' } },
                justificativa: { type: 'string' }
              }
            }
          }
        }
      }
    });

    // Atualizar cada ponto com análise correspondente
    for (const analise of resultado.analises || []) {
      const pontoMatch = pontos.find(p => p.nome === analise.nome);
      if (pontoMatch) {
        await base44.asServiceRole.entities.PontoEntorno.update(pontoMatch.id, {
          aderencia_tematica: Math.min(100, Math.max(0, analise.aderencia_tematica || 50)),
          prioridade: ['Alta', 'Média', 'Baixa'].includes(analise.prioridade) ? analise.prioridade : 'Média',
          oportunidades_sugeridas: Array.isArray(analise.oportunidades) ? analise.oportunidades : [],
          data_analise: new Date().toISOString(),
        });
      }
    }

    return new Response(JSON.stringify({
      museu_sigla,
      pontos_analisados: resultado.analises?.length || 0,
      timestamp: new Date().toISOString(),
    }), { status: 200 });
  } catch (error) {
    console.error('Erro na análise:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});