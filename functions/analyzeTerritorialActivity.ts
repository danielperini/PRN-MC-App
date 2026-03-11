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

    // Buscar todas as atividades da unidade via relatórios associados
    const reports = await base44.asServiceRole.entities.Report.filter({ museu: museu_sigla });
    
    const allActivities = [];
    for (const report of reports) {
      const activities = await base44.asServiceRole.entities.Activity.filter({ report_id: report.id });
      allActivities.push(...activities);
    }

    if (allActivities.length === 0) {
      return Response.json({
        message: 'Nenhuma atividade encontrada para análise',
        opportunities: []
      });
    }

    // Analisar padrões de atividade
    const temasPrincipais = {};
    const publicosPrincipais = {};
    const tiposEspeciais = new Set();
    let atividesMobilizacao = 0;
    let atividadesComParceria = 0;

    for (const activity of allActivities) {
      // Extrair temas do título e descrição
      const textoAnalise = `${activity.titulo || ''} ${activity.descricao || ''}`.toLowerCase();
      
      if (textoAnalise.includes('moda') || textoAnalise.includes('têxtil') || textoAnalise.includes('design')) {
        temasPrincipais['Moda/Design'] = (temasPrincipais['Moda/Design'] || 0) + 1;
      }
      if (textoAnalise.includes('cinema') || textoAnalise.includes('filme') || textoAnalise.includes('audiovisual')) {
        temasPrincipais['Cinema/Audiovisual'] = (temasPrincipais['Cinema/Audiovisual'] || 0) + 1;
      }
      if (textoAnalise.includes('fotogra') || textoAnalise.includes('imagem')) {
        temasPrincipais['Fotografia'] = (temasPrincipais['Fotografia'] || 0) + 1;
      }
      if (textoAnalise.includes('patrimôni') || textoAnalise.includes('memóri') || textoAnalise.includes('históri')) {
        temasPrincipais['Patrimônio/Memória'] = (temasPrincipais['Patrimônio/Memória'] || 0) + 1;
      }
      if (textoAnalise.includes('formação') || textoAnalise.includes('oficina') || textoAnalise.includes('workshop')) {
        temasPrincipais['Formação'] = (temasPrincipais['Formação'] || 0) + 1;
      }

      if (activity.eh_mobilizacao) atividesMobilizacao++;
      if (activity.parceria === 'Sim') atividadesComParceria++;

      // Extrair tipos especiais
      if (activity.tipo_equipe) tiposEspeciais.add(activity.tipo_equipe);
    }

    // Preparar contexto para Claude analisar
    const prompt = `
Você é um analista territorial especializado em redes de instituições culturais e educacionais.

Analise o seguinte perfil de atividades do museu "${museu_sigla}" em Belo Horizonte:

**ESTATÍSTICAS:**
- Total de atividades analisadas: ${allActivities.length}
- Atividades de mobilização: ${atividesMobilizacao}
- Atividades com parceria: ${atividadesComParceria}
- Equipes envolvidas: ${Array.from(tiposEspeciais).join(', ')}

**TEMAS PRINCIPAIS:**
${Object.entries(temasPrincipais)
  .sort((a, b) => b[1] - a[1])
  .map(([tema, freq]) => `- ${tema}: ${freq} atividades`)
  .join('\n')}

**TAREFA:**
Com base neste perfil, sugira 15-20 instituições, coletivos e oportunidades no entorno de BH que:
1. Alinhem com os temas mais frequentes
2. Potencializem públicos pouco explorados
3. Criem parcerias estratégicas
4. Fortaleçam mobilização e relacionamento territorial

Para cada oportunidade, retorne um JSON com:
{
  "nome": "Nome da instituição",
  "categoria": "Uma das categorias listadas",
  "bairro": "Bairro estimado em BH",
  "distancia_estimada": número em km,
  "publicos_alvo": ["array de públicos"],
  "temas_relacionados": ["array de temas"],
  "nivel_aderencia": número 0-100,
  "prioridade": "Alta/Média/Baixa",
  "potencial_parceria": "Tipo de parceria potencial",
  "observacoes_curadoria": "Justificativa concisa"
}

Retorne um JSON válido com array "opportunities" contendo os 15-20 itens sugeridos.
`;

    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
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

    // Buscar oportunidades existentes para este museu
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
        nivel_aderencia: opp.nivel_aderencia,
        prioridade: opp.prioridade,
        potencial_parceria: opp.potencial_parceria,
        observacoes_curadoria: opp.observacoes_curadoria,
        justificativa_ia: opp.observacoes_curadoria,
        data_curadoria: new Date().toISOString()
      }));

      await base44.asServiceRole.entities.TerritorialOpportunity.bulkCreate(dados);
    }

    // Retornar todos os ativos para este museu
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});