import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar relatórios aprovados
    const relatoriosAprovados = await base44.asServiceRole.entities.Report.filter(
      { status: 'APPROVED' },
      '-updated_date',
      1000
    );

    // Buscar atividades
    const atividades = await base44.asServiceRole.entities.Activity.list('-updated_date', 1000);

    // Buscar compras aprovadas
    const comprasAprovadas = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { status: 'APROVADO_ADMIN' },
      '-updated_date',
      1000
    );

    // Calcular métricas
    let totalPublico = 0;
    let totalAtividades = 0;
    let publicoPorMuseu = {};
    let publicoPorClassificacao = { META: 0, ROTINA: 0, EXTRA: 0 };

    // Processar relatórios
    for (const relatorio of relatoriosAprovados) {
      if (relatorio.atividades && Array.isArray(relatorio.atividades)) {
        for (const atividade of relatorio.atividades) {
          const publico = atividade.publico_total || 0;
          totalPublico += publico;
          totalAtividades++;

          // Agregação por museu
          if (!publicoPorMuseu[relatorio.museu]) {
            publicoPorMuseu[relatorio.museu] = 0;
          }
          publicoPorMuseu[relatorio.museu] += publico;

          // Agregação por classificação
          if (atividade.classificacao) {
            publicoPorClassificacao[atividade.classificacao] =
              (publicoPorClassificacao[atividade.classificacao] || 0) + publico;
          }
        }
      }
    }

    // Calcular gastos
    let totalGastos = 0;
    let totalGastosAprovados = 0;
    for (const compra of comprasAprovadas) {
      totalGastosAprovados += compra.valor_aprovado_admin || 0;
      if (compra.valor_pago) {
        totalGastos += compra.valor_pago;
      }
    }

    const dadosDashboard = {
      atualizado_em: new Date().toISOString(),
      metricas: {
        total_relatorios_aprovados: relatoriosAprovados.length,
        total_atividades: totalAtividades,
        total_publico: totalPublico,
        media_publico: totalAtividades > 0 ? Math.round(totalPublico / totalAtividades) : 0,
        total_compras_aprovadas: comprasAprovadas.length,
        total_gasto_pago: totalGastos,
        total_gasto_aprovado: totalGastosAprovados,
      },
      por_museu: publicoPorMuseu,
      por_classificacao: publicoPorClassificacao,
    };

    return Response.json(dadosDashboard);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});