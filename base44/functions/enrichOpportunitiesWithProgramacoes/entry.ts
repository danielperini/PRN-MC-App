import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { museu_sigla } = await req.json();

    if (!museu_sigla) {
      return Response.json({ error: 'museu_sigla required' }, { status: 400 });
    }

    // Buscar todas as oportunidades ativas
    const opportunities = await base44.asServiceRole.entities.TerritorialOpportunity.filter({
      museu_sigla,
      ativo: true,
    });

    // Definir intervalo de 30 dias atrás e 30 dias à frente
    const now = new Date();
    const dataInicio = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dataFim = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Buscar programações neste período
    const allProgramacoes = await base44.asServiceRole.entities.Programacao.list();
    
    const programacoesRelevantes = allProgramacoes.filter(prog => {
      const dataInicioProc = new Date(prog.data_inicio);
      return dataInicioProc >= dataInicio && dataInicioProc <= dataFim;
    });

    // Enriquecer oportunidades com programações por local
    const enriched = opportunities.map(opp => {
      // Buscar programações que mencionam o bairro ou instituição
      const programacoesCasadas = programacoesRelevantes.filter(prog => {
        const local = (prog.local || '').toLowerCase();
        const nomeopp = (opp.nome || '').toLowerCase();
        const bairro = (opp.bairro || '').toLowerCase();
        
        return local.includes(nomeopp) || local.includes(bairro) || 
               prog.museu === museu_sigla;
      });

      return {
        ...opp,
        programacoes_vinculadas: programacoesCasadas.map(p => ({
          id: p.id,
          titulo: p.titulo,
          data_inicio: p.data_inicio,
          data_fim: p.data_fim,
          local: p.local,
          status: p.status,
          publico_esperado: p.publico_esperado,
        })),
        tem_proximas_programacoes: programacoesCasadas.length > 0,
        qtd_programacoes: programacoesCasadas.length,
      };
    });

    return Response.json({
      museu_sigla,
      periodo: {
        inicio: dataInicio.toISOString(),
        fim: dataFim.toISOString(),
      },
      opportunities: enriched,
      total_programacoes_vinculadas: enriched.reduce((sum, o) => sum + (o.qtd_programacoes || 0), 0),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});