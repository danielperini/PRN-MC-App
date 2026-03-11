import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { reportId } = await req.json();
    if (!reportId) {
      return Response.json({ error: 'reportId required' }, { status: 400 });
    }

    // Buscar relatório
    const report = await base44.entities.Report.filter({ id: reportId });
    if (!report || report.length === 0) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    const reportData = report[0];
    const activities = Array.isArray(reportData.atividades) ? reportData.atividades : [];

    // Preparar contexto para Claude
    const reportContext = `
RELATÓRIO PARA ANÁLISE:
Mês: ${reportData.mes_referencia}/${reportData.ano}
Profissional: ${reportData.author_name}
Museu: ${reportData.museu}
Status: ${reportData.status}

RESUMO EXECUTIVO:
${reportData.resumo_executivo || '(não preenchido)'}

ATIVIDADES (${activities.length}):
${activities.map((a, i) => `
${i + 1}. ${a.titulo}
   - Classificação: ${a.classificacao}
   - Data: ${a.data_realizacao || '(não informada)'}
   - Público: ${a.publico_estimado || '0'} x ${a.quantas_repeticoes || '1'} = ${(a.publico_estimado || 0) * (a.quantas_repeticoes || 1)}
   - Descrição: ${a.descricao || '(vazia)'}
   ${a.classificacao === 'META' ? `- Meta: ${a.meta_codigo || '(não informado)'} | Status: ${a.status_meta || '(não informado)'}` : ''}
`).join('\n')}

AVALIAÇÃO:
- Pontos Positivos: ${reportData.avaliacao_pontos_positivos || '(não preenchido)'}
- Desafios: ${reportData.avaliacao_desafios || '(não preenchido)'}
- Sugestões: ${reportData.avaliacao_sugestoes || '(não preenchido)'}
`;

    // Chamar Claude para análise
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um assistente de curadoria de relatórios mensais. Analise este relatório e identifique APENAS os problemas específicos que precisam ser corrigidos.

${reportContext}

TAREFAS:
1. Identifique dados ausentes ou inválidos (datas, números, descrições vazias)
2. Verifique inconsistências (público impossível, datas fora do mês, etc)
3. Valide metas (se META, precisa ter código, resultado e status)
4. Verifique qualidade do texto (muito vago, falta detalhe)
5. Identifique oportunidades de melhoria claras

RESPONDA EM JSON COM ESTE EXATO FORMATO:
{
  "issues": [
    {
      "severity": "critical|warning|info",
      "section": "Identificação|Resumo|Atividades|Avaliação",
      "problem": "Descrição do problema específico",
      "suggestion": "Ação exata a tomar para corrigir",
      "activityIndex": null (ou número se relacionado a atividade)
    }
  ],
  "summary": "Resumo de 1 linha do status geral",
  "canAutoFix": false (se sistema pode corrigir automaticamente),
  "overallQuality": "Excelente|Bom|Adequado|Precisa Melhorar"
}`,
      model: 'gpt_5_mini'
    });

    const debugResult = typeof response === 'string' ? JSON.parse(response) : response;

    // Salvar resultado
    await base44.asServiceRole.entities.AiOutput.create({
      report_id: reportId,
      mode: 'DEBUG',
      prompt_used: 'Auto-debug report validation',
      output_text: JSON.stringify(debugResult, null, 2),
      model_used: 'claude',
      generated_by_email: user.email
    });

    return Response.json({
      success: true,
      reportId,
      debug: debugResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});