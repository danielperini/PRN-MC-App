import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['COORDENADOR', 'ADMIN', 'admin'].includes(user.role)) {
      return Response.json({ error: 'Apenas coordenadores podem executar análise territorial' }, { status: 403 });
    }

    const body = await req.json();
    const { museu_sigla } = body;

    if (!museu_sigla) {
      return Response.json({ error: 'museu_sigla é obrigatório' }, { status: 400 });
    }

    // Buscar todas as atividades da unidade
    const reports = await base44.asServiceRole.entities.Report.filter({ museu: museu_sigla });
    
    const allActivities = [];
    for (const report of reports) {
      const activities = await base44.asServiceRole.entities.Activity.filter({ report_id: report.id });
      allActivities.push(...activities);
    }

    if (allActivities.length === 0) {
      const existentes = await base44.asServiceRole.entities.TerritorialOpportunity.filter({
        museu_sigla,
        ativo: true
      });
      return Response.json({
        museu_sigla,
        message: 'Nenhuma atividade para análise. Retornando oportunidades existentes.',
        total_atividades_analisadas: 0,
        temas_principais: [],
        novas_oportunidades_adicionadas: 0,
        total_oportunidades_ativas: existentes.length,
        oportunidades: existentes.sort((a, b) => b.nivel_aderencia - a.nivel_aderencia)
      });
    }

    // Análise de padrões
    const temasPrincipais = {};
    const publicosPrincipais = {};
    let atividesMobilizacao = 0;
    let atividadesComParceria = 0;

    for (const activity of allActivities) {
      const textoAnalise = `${activity.titulo || ''} ${activity.descricao || ''}`.toLowerCase();
      
      // Temas específicos por museu
      if (museu_sigla === 'MUMO') {
        if (textoAnalise.includes('moda') || textoAnalise.includes('têxtil') || textoAnalise.includes('design') || textoAnalise.includes('costura')) {
          temasPrincipais['Moda/Têxtil'] = (temasPrincipais['Moda/Têxtil'] || 0) + 1;
        }
        if (textoAnalise.includes('economia criativa') || textoAnalise.includes('empreendedorismo') || textoAnalise.includes('criativo')) {
          temasPrincipais['Economia Criativa'] = (temasPrincipais['Economia Criativa'] || 0) + 1;
        }
        if (textoAnalise.includes('mulher') || textoAnalise.includes('feminino') || textoAnalise.includes('gênero')) {
          temasPrincipais['Mulheres/Feminilidade'] = (temasPrincipais['Mulheres/Feminilidade'] || 0) + 1;
        }
        if (textoAnalise.includes('juventude') || textoAnalise.includes('jovem')) {
          temasPrincipais['Juventude'] = (temasPrincipais['Juventude'] || 0) + 1;
        }
      } else if (museu_sigla === 'MIS') {
        if (textoAnalise.includes('fotogra') || textoAnalise.includes('imagem') || textoAnalise.includes('visual')) {
          temasPrincipais['Fotografia'] = (temasPrincipais['Fotografia'] || 0) + 1;
        }
        if (textoAnalise.includes('cinema') || textoAnalise.includes('filme') || textoAnalise.includes('audiovisual') || textoAnalise.includes('vídeo')) {
          temasPrincipais['Cinema/Audiovisual'] = (temasPrincipais['Cinema/Audiovisual'] || 0) + 1;
        }
        if (textoAnalise.includes('comunicação') || textoAnalise.includes('mídia')) {
          temasPrincipais['Comunicação'] = (temasPrincipais['Comunicação'] || 0) + 1;
        }
      } else if (museu_sigla === 'MHAB') {
        if (textoAnalise.includes('patrimôni') || textoAnalise.includes('memóri') || textoAnalise.includes('históri') || textoAnalise.includes('urbana')) {
          temasPrincipais['Patrimônio/Memória'] = (temasPrincipais['Patrimônio/Memória'] || 0) + 1;
        }
        if (textoAnalise.includes('educação') || textoAnalise.includes('pedagogia') || textoAnalise.includes('escol')) {
          temasPrincipais['Educação'] = (temasPrincipais['Educação'] || 0) + 1;
        }
        if (textoAnalise.includes('idoso') || textoAnalise.includes('terceira idade') || textoAnalise.includes('envelhecimento')) {
          temasPrincipais['Idosos'] = (temasPrincipais['Idosos'] || 0) + 1;
        }
      } else if (museu_sigla === 'Viaduto das Artes') {
        if (textoAnalise.includes('arte') || textoAnalise.includes('artístico') || textoAnalise.includes('criação')) {
          temasPrincipais['Arte/Criação'] = (temasPrincipais['Arte/Criação'] || 0) + 1;
        }
        if (textoAnalise.includes('comunidade') || textoAnalise.includes('comunitário') || textoAnalise.includes('social')) {
          temasPrincipais['Mobilização Comunitária'] = (temasPrincipais['Mobilização Comunitária'] || 0) + 1;
        }
        if (textoAnalise.includes('juventude') || textoAnalise.includes('jovem') || textoAnalise.includes('adolescente')) {
          temasPrincipais['Juventude'] = (temasPrincipais['Juventude'] || 0) + 1;
        }
        if (textoAnalise.includes('formação') || textoAnalise.includes('oficina') || textoAnalise.includes('workshop')) {
          temasPrincipais['Formação'] = (temasPrincipais['Formação'] || 0) + 1;
        }
      }

      if (activity.eh_mobilizacao) atividesMobilizacao++;
      if (activity.parceria === 'Sim') atividadesComParceria++;
    }

    // Prompts específicos por museu
    const promptsPorMuseu = {
      'MUMO': `
Você é um curador territorial especializado em economia criativa, moda e design.

Analise o seguinte perfil do Museu de Moda em Belo Horizonte:

**ESTATÍSTICAS:**
- Total de atividades: ${allActivities.length}
- Atividades de mobilização: ${atividesMobilizacao}
- Atividades com parceria: ${atividadesComParceria}

**TEMAS PRINCIPAIS:**
${Object.entries(temasPrincipais)
  .sort((a, b) => b[1] - a[1])
  .map(([tema, freq]) => `- ${tema}: ${freq} atividades`)
  .join('\n')}

**TAREFA:**
Sugira 15-20 instituições no entorno de BH que:
1. Fomentem moda, design, têxtil e economia criativa
2. Alcancem públicos de juventude, designers, criadores
3. Potencializem parcerias com escolas técnicas, faculdades de design, coletivos de moda
4. Fortaleçam mulheres empreendedoras e turismo cultural

Priorize: escolas técnicas de moda, faculdades de design UEMG/UFMG, coletivos de mulheres, startups criativas, espaços de economia criativa.
`,
      'MIS': `
Você é um curador territorial especializado em fotografia, cinema e audiovisual.

Analise o seguinte perfil do Museu de Imagens e do Som em Belo Horizonte:

**ESTATÍSTICAS:**
- Total de atividades: ${allActivities.length}
- Atividades de mobilização: ${atividesMobilizacao}
- Atividades com parceria: ${atividadesComParceria}

**TEMAS PRINCIPAIS:**
${Object.entries(temasPrincipais)
  .sort((a, b) => b[1] - a[1])
  .map(([tema, freq]) => `- ${tema}: ${freq} atividades`)
  .join('\n')}

**TAREFA:**
Sugira 15-20 instituições no entorno de BH que:
1. Fortaleçam fotografia, cinema, audiovisual e comunicação visual
2. Alcancem públicos de escolas, universidades, cineastas, fotógrafos
3. Criem parcerias com escolas técnicas de áudio/vídeo, faculdades de comunicação, cineclubes
4. Mobilizem profissionais de cultura visual e coletivos audiovisuais

Priorize: faculdades de comunicação (UFMG, PUC), cineclubes, coletivos audiovisuais, escolas de fotografia, institutos de cinema.
`,
      'MHAB': `
Você é um curador territorial especializado em patrimônio, memória e educação histórica.

Analise o seguinte perfil do Museu Histórico Abílio Barreto em Belo Horizonte:

**ESTATÍSTICAS:**
- Total de atividades: ${allActivities.length}
- Atividades de mobilização: ${atividesMobilizacao}
- Atividades com parceria: ${atividadesComParceria}

**TEMAS PRINCIPAIS:**
${Object.entries(temasPrincipais)
  .sort((a, b) => b[1] - a[1])
  .map(([tema, freq]) => `- ${tema}: ${freq} atividades`)
  .join('\n')}

**TAREFA:**
Sugira 15-20 instituições no entorno de BH que:
1. Fortaleçam patrimônio, memória, história urbana e educação patrimonial
2. Alcancem públicos de escolas, professores, idosos, pesquisadores
3. Criem parcerias com escolas públicas/municipais, faculdades de educação, centros de convivência para idosos
4. Fortaleçam história local, memória comunitária e educação

Priorize: Escola de Educação UFMG/UEMG, lares de idosos, centros comunitários, escolas públicas, institutos de pesquisa histórica.
`,
      'Viaduto das Artes': `
Você é um curador territorial especializado em formação artística e mobilização comunitária.

Analise o seguinte perfil do Viaduto das Artes em Belo Horizonte:

**ESTATÍSTICAS:**
- Total de atividades: ${allActivities.length}
- Atividades de mobilização: ${atividesMobilizacao}
- Atividades com parceria: ${atividadesComParceria}

**TEMAS PRINCIPAIS:**
${Object.entries(temasPrincipais)
  .sort((a, b) => b[1] - a[1])
  .map(([tema, freq]) => `- ${tema}: ${freq} atividades`)
  .join('\n')}

**TAREFA:**
Sugira 15-20 instituições no entorno de BH que:
1. Fortaleçam formação artística, arte urbana e mobilização cultural
2. Alcancem públicos de juventudes, coletivos comunitários, periferias
3. Criem parcerias com coletivos culturais de base, escolas públicas, redes comunitárias, organizações sociais
4. Fortaleçam participação social, mediação cultural e arte em contextos periféricos

Priorize: coletivos de base comunitária, organizações sociais de juventude, escolas públicas, redes de articulação territorial, centros de arte comunitária.
`
    };

    const prompt = promptsPorMuseu[museu_sigla] || promptsPorMuseu['MHAB'];

    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: prompt + `

Retorne um JSON válido com array "opportunities" contendo 15-20 instituições.
Para cada uma, inclua:
{
  "nome": "Nome exato",
  "categoria": "Uma das categorias obrigatórias",
  "bairro": "Bairro em BH",
  "distancia_estimada": número,
  "publicos_alvo": ["array de públicos"],
  "temas_relacionados": ["array de temas"],
  "nivel_aderencia": número 0-100,
  "prioridade": "Alta/Média/Baixa",
  "potencial_parceria": "Tipo de parceria",
  "observacoes_curadoria": "Justificativa concisa"
}`,
      response_json_schema: {
        type: 'object',
        properties: {
          opportunities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                categoria: { type: 'string' },
                bairro: { type: 'string' },
                distancia_estimada: { type: 'number' },
                publicos_alvo: { type: 'array', items: { type: 'string' } },
                temas_relacionados: { type: 'array', items: { type: 'string' } },
                nivel_aderencia: { type: 'number' },
                prioridade: { type: 'string' },
                potencial_parceria: { type: 'string' },
                observacoes_curadoria: { type: 'string' }
              }
            }
          }
        }
      }
    });

    const suggestions = llmResponse.opportunities || [];

    // Buscar oportunidades existentes
    const existentes = await base44.asServiceRole.entities.TerritorialOpportunity.filter({
      museu_sigla
    });

    const nomesExistentes = new Set(existentes.map(o => o.nome.toLowerCase()));

    // Filtrar novos
    const novas = suggestions.filter(s => !nomesExistentes.has(s.nome.toLowerCase()));

    // Criar oportunidades novas
    if (novas.length > 0) {
      const dados = novas.map(opp => ({
        museu_sigla,
        nome: opp.nome,
        categoria: opp.categoria,
        bairro: opp.bairro,
        distancia_estimada: opp.distancia_estimada,
        publicos_alvo: opp.publicos_alvo,
        temas_relacionados: opp.temas_relacionados,
        nivel_aderencia: Math.min(100, Math.max(0, opp.nivel_aderencia || 70)),
        prioridade: opp.prioridade || 'Média',
        potencial_parceria: opp.potencial_parceria,
        observacoes_curadoria: opp.observacoes_curadoria,
        justificativa_ia: opp.observacoes_curadoria,
        data_curadoria: new Date().toISOString()
      }));

      await base44.asServiceRole.entities.TerritorialOpportunity.bulkCreate(dados);
    }

    // Retornar todos os ativos
    const todasOportunidades = await base44.asServiceRole.entities.TerritorialOpportunity.filter({
      museu_sigla,
      ativo: true
    });

    return Response.json({
      museu_sigla,
      total_atividades_analisadas: allActivities.length,
      temas_principais: Object.entries(temasPrincipais)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      novas_oportunidades_adicionadas: novas.length,
      total_oportunidades_ativas: todasOportunidades.length,
      oportunidades: todasOportunidades.sort((a, b) => b.nivel_aderencia - a.nivel_aderencia)
    });
  } catch (error) {
    console.error('Erro na análise territorial:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});