import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Buscar TODOS os relatórios (não apenas aprovados)
    const todosRelatorios = await base44.asServiceRole.entities.Report.list('-updated_date', 2000);

    // Inicializar agregações
    let publicoPorMes = {};
    let publicoPorMuseu = {};
    let totalPublico = 0;
    let totalAtividades = 0;
    let relatoriosComDados = 0;

    // Processar cada relatório
    for (const relatorio of todosRelatorios) {
      if (relatorio.atividades && Array.isArray(relatorio.atividades) && relatorio.atividades.length > 0) {
        relatoriosComDados++;
        
        // Chave do mês
        const chaveMes = `${relatorio.mes_referencia}/${relatorio.ano}`;
        if (!publicoPorMes[chaveMes]) {
          publicoPorMes[chaveMes] = { total: 0, atividades: 0, relatorios: 0, status: relatorio.status };
        }

        for (const atividade of relatorio.atividades) {
          const publico = atividade.publico_total || 0;
          totalPublico += publico;
          totalAtividades++;
          publicoPorMes[chaveMes].total += publico;
          publicoPorMes[chaveMes].atividades++;
        }
        publicoPorMes[chaveMes].relatorios++;

        // Agregar por museu
        if (!publicoPorMuseu[relatorio.museu]) {
          publicoPorMuseu[relatorio.museu] = 0;
        }
        publicoPorMuseu[relatorio.museu] += publicoPorMes[chaveMes].total;
      }
    }

    // Ordenar meses cronologicamente
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const publicoPorMesOrdenado = {};
    
    Object.keys(publicoPorMes)
      .sort((a, b) => {
        const [mesA, anoA] = a.split('/');
        const [mesB, anoB] = b.split('/');
        if (anoA !== anoB) return parseInt(anoA) - parseInt(anoB);
        return meses.indexOf(mesA) - meses.indexOf(mesB);
      })
      .forEach(key => {
        publicoPorMesOrdenado[key] = publicoPorMes[key];
      });

    const recuperacao = {
      executado_em: new Date().toISOString(),
      timestamp_unix: Date.now(),
      resumo: {
        total_relatorios_lidos: todosRelatorios.length,
        relatorios_com_dados: relatoriosComDados,
        total_atividades_recuperadas: totalAtividades,
        total_publico_historico: totalPublico,
      },
      publico_por_mes_historico: publicoPorMesOrdenado,
      publico_por_museu_historico: publicoPorMuseu,
      status: 'RECUPERAÇÃO_COMPLETA',
    };

    return Response.json(recuperacao);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});