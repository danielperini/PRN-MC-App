import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Consolidação editorial: conecta relatório ↔ releases ↔ programação ↔ atividades
 * Cria narrativa única coerente integrando múltiplas fontes
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
      relatorio_id,
      periodo_mes,
      periodo_ano,
      museu,
      incluir_releases = true,
      incluir_programacao = true,
      incluir_atividades = true
    } = body;

    // Buscar conteúdo de todas as fontes
    let relatorio = null;
    let releases = [];
    let programacao = [];
    let atividades = [];

    if (relatorio_id) {
      const rel = await base44.entities.Report.filter({ id: relatorio_id });
      relatorio = rel?.[0];
    }

    if (incluir_releases) {
      releases = await base44.entities.Release.filter({
        mes: periodo_mes,
        ano: periodo_ano,
        museus: museu,
        ativo: true
      }, '-created_date', 20);
    }

    if (incluir_programacao) {
      programacao = await base44.entities.Programacao.filter({
        museu: museu
      }, '-created_date', 50);
    }

    if (incluir_atividades) {
      atividades = await base44.entities.Activity.filter({
        museu: museu,
        report_id: relatorio_id
      }, '-created_date', 100);
    }

    // Construir contexto consolidado
    const contextoCompleto = {
      relatorio: relatorio ? {
        protocolo: relatorio.numero_protocolo,
        resumo: relatorio.resumo_executivo,
        publico: relatorio.publico_geral_declarado
      } : null,
      releases_count: releases.length,
      releases_titulos: releases.map(r => r.titulo),
      programacao_count: programacao.length,
      atividades_count: atividades.length,
      atividades_publico_total: atividades.reduce((sum, a) => sum + (a.publico_total || 0), 0)
    };

    const prompt = `Consolide editorialemente estas informações em uma NARRATIVA ÚNICA E COERENTE:

RELATÓRIO: ${relatorio?.numero_protocolo || 'N/A'}
${relatorio?.resumo_executivo || ''}

RELEASES RELACIONADOS (${releases.length}):
${releases.map(r => `- ${r.titulo}`).join('\n')}

PROGRAMAÇÃO (${programacao.length} eventos):
${programacao.slice(0, 10).map(p => `- ${p.titulo}`).join('\n')}

ATIVIDADES REALIZADAS (${atividades.length}):
${atividades.slice(0, 15).map(a => `- ${a.titulo} (Público: ${a.publico_total})`).join('\n')}

TAREFA:
1. Crie uma introdução que conecte relatório + releases + programação
2. Identifique 3-4 eixos temáticos que percorrem todo o material
3. Para cada eixo, cite: relatório → release → programação → atividade
4. Conclua com síntese consolidada
5. Mínimo 8 parágrafos densos

Priorize citações diretas e conexões factuais entre os materiais.`;

    // Usar integração nativa da Base44
    const llmResult = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      model: 'gemini_3_flash'
    });

    const narrativaConsolidada = llmResult || '';

    // Salvar consolidação
    const consolidacao = await base44.entities.AIAnalysis.create({
      conteudo_tipo: 'relatorio',
      conteudo_id: relatorio_id || 'consolidacao_' + Date.now(),
      tipo_analise: 'editorial',
      resultado: {
        tipo: 'consolidacao_editorial',
        narrativa: narrativaConsolidada,
        fontes: {
          relatorio: !!relatorio,
          releases: releases.length,
          programacao: programacao.length,
          atividades: atividades.length
        },
        contexto: contextoCompleto
      },
      gerado_por_email: user.email,
      status: 'sucesso',
      data_analise: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      consolidacao_id: consolidacao.id,
      narrativa: narrativaConsolidada,
      fontes: contextoCompleto,
      caracteres: narrativaConsolidada.length
    });
  } catch (error) {
    console.error('consolidacaoEditorial:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});