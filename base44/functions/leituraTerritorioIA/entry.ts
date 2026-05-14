import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Leitura territorial: analisa atividades, programação, oportunidades por território
 * Identifica tendências, concentrações, vazios, possibilidades
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      museu,
      periodo_mes,
      periodo_ano,
      tipo_leitura = 'completo' // completo, oportunidades, vazios, tendencias
    } = body;

    // Buscar dados territoriais reais
    const atividades = await base44.entities.Activity.filter({
      museu: museu || undefined
    }, '-created_date', 200);

    const programacao = await base44.entities.Programacao.filter({
      museu: museu || undefined
    }, '-created_date', 100);

    const oportunidades = await base44.entities.TerritorialOpportunity?.filter?.({
      museu: museu || undefined
    }) || [];

    // Construir narrativa territorial
    const dados = {
      atividades_total: atividades?.length || 0,
      programacao_total: programacao?.length || 0,
      publico_total: (atividades || []).reduce((sum, a) => sum + (a.publico_total || 0), 0),
      tipos_atividade: agruparTipos(atividades),
      distribuicao_geografica: analisarDistribuicao(atividades),
      publicos_atingidos: analisarPublicos(atividades),
      oportunidades_abertas: oportunidades?.length || 0
    };

    const prompt = construirPromptTerritorial(tipo_leitura, dados, museu);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'API não configurada' }, { status: 500 });
    }

    const llmResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Você é analista territorial especializado em políticas culturais. Analise dados reais de atividades/programação. Nunca invente.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.6
        })
      }
    );

    if (!llmResponse.ok) {
      return Response.json({ error: 'Falha na análise' }, { status: 500 });
    }

    const llmData = await llmResponse.json();
    const leituraTexto = llmData.choices?.[0]?.message?.content || '';

    // Salvar análise
    const analise = await base44.entities.AIAnalysis.create({
      conteudo_tipo: 'programacao',
      conteudo_id: museu + '_' + periodo_mes + '_' + periodo_ano,
      tipo_analise: 'contextual',
      resultado: {
        tipo: 'territorial',
        leitura: leituraTexto,
        dados_analisados: dados,
        tipo_leitura,
        museu
      },
      gerado_por_email: user.email,
      status: 'sucesso',
      data_analise: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      analise_id: analise.id,
      leitura: leituraTexto,
      dados: dados
    });
  } catch (error) {
    console.error('leituraTerritorioIA:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function agruparTipos(atividades) {
  const grupos = {};
  (atividades || []).forEach(a => {
    const tipo = a.tipo_equipe || 'outro';
    grupos[tipo] = (grupos[tipo] || 0) + 1;
  });
  return grupos;
}

function analisarDistribuicao(atividades) {
  const locais = {};
  (atividades || []).forEach(a => {
    if (a.local) {
      locais[a.local] = (locais[a.local] || 0) + 1;
    }
  });
  return locais;
}

function analisarPublicos(atividades) {
  const publicos = {
    infantil: 0,
    adolescente: 0,
    adulto: 0,
    senior: 0
  };

  (atividades || []).forEach(a => {
    if (a.publico_estimado) {
      publicos.infantil += a.publico_estimado * 0.2;
      publicos.adolescente += a.publico_estimado * 0.2;
      publicos.adulto += a.publico_estimado * 0.4;
      publicos.senior += a.publico_estimado * 0.2;
    }
  });

  return publicos;
}

function construirPromptTerritorial(tipo, dados, museu) {
  let prompt = `Analise a leitura territorial do museu ${museu}:\n\n`;

  prompt += `DADOS REAIS:\n`;
  prompt += `- Atividades realizadas: ${dados.atividades_total}\n`;
  prompt += `- Programação cadastrada: ${dados.programacao_total}\n`;
  prompt += `- Público total atingido: ${dados.publico_total}\n`;
  prompt += `- Tipos de atividade: ${JSON.stringify(dados.tipos_atividade)}\n`;
  prompt += `- Oportunidades abertas: ${dados.oportunidades_abertas}\n\n`;

  if (tipo === 'completo') {
    prompt += `Escreva uma ANÁLISE TERRITORIAL COMPLETA abordando:
1. Cobertura territorial atual
2. Distribuição de atividades por local
3. Públicos atingidos
4. Concentrações e vazios
5. Potencialidades não exploradas
6. Recomendações estratégicas
7. Possíveis parcerias territoriais`;
  } else if (tipo === 'oportunidades') {
    prompt += `Identifique OPORTUNIDADES TERRITORIAIS:
1. Locais/populações ainda não alcançadas
2. Possíveis parcerias locais
3. Eventos/datas estratégicas
4. Públicos prioritários não atendidos`;
  } else if (tipo === 'vazios') {
    prompt += `Mapeie VAZIOS TERRITORIAIS E PROGRAMÁTICOS:
1. Regiões sem cobertura
2. Períodos vazios
3. Tipos de atividade ausentes
4. Públicos negligenciados`;
  }

  return prompt;
}