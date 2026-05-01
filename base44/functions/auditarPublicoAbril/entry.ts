import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Calcular mês anterior
    const agora = new Date();
    let mesIndex = agora.getMonth() - 1; // 0-11
    let ano = agora.getFullYear();
    
    if (mesIndex < 0) {
      mesIndex = 11;
      ano--;
    }
    
    const mesReferencia = MESES[mesIndex];

    // Buscar todos os relatórios do mês anterior
    const relatorios = await base44.asServiceRole.entities.Report.filter({
      mes_referencia: mesReferencia,
      ano: ano,
    }, '-updated_date', 500);

    const auditoria = {
      mes: mesReferencia,
      ano: ano,
      data_auditoria: new Date().toISOString(),
      auditado_por: user.email,
      resumo: {
        total_relatorios: relatorios.length,
        total_publico: 0,
        total_atividades: 0,
        media_publico_por_atividade: 0,
        atividades_por_museu: {},
        publico_por_museu: {},
        publico_por_classificacao: {
          META: 0,
          ROTINA: 0,
          EXTRA: 0,
        },
      },
      detalhes: [],
      alertas: [],
    };

    // Processar cada relatório
    for (const relatorio of relatorios) {
      const relatorioDetail = {
        report_id: relatorio.id,
        autor: relatorio.author_name,
        museu: relatorio.museu,
        atividades: [],
        publico_total_relatorio: 0,
      };

      // Se há atividades no relatório
      if (relatorio.atividades && Array.isArray(relatorio.atividades)) {
        for (const atividade of relatorio.atividades) {
          const publico = atividade.publico_total || 0;
          relatorioDetail.publico_total_relatorio += publico;
          auditoria.resumo.total_publico += publico;
          auditoria.resumo.total_atividades++;

          // Classificação
          if (atividade.classificacao) {
            auditoria.resumo.publico_por_classificacao[atividade.classificacao] =
              (auditoria.resumo.publico_por_classificacao[atividade.classificacao] || 0) + publico;
          }

          relatorioDetail.atividades.push({
            titulo: atividade.titulo,
            classificacao: atividade.classificacao,
            publico: publico,
            data_realizacao: atividade.data_realizacao,
          });
        }
      }

      // Registrar detalhes do relatório
      relatorioDetail.atividades_count = relatorioDetail.atividades.length;
      auditoria.detalhes.push(relatorioDetail);

      // Agregação por museu
      if (!auditoria.resumo.atividades_por_museu[relatorio.museu]) {
        auditoria.resumo.atividades_por_museu[relatorio.museu] = 0;
        auditoria.resumo.publico_por_museu[relatorio.museu] = 0;
      }
      auditoria.resumo.atividades_por_museu[relatorio.museu] += relatorioDetail.atividades.length;
      auditoria.resumo.publico_por_museu[relatorio.museu] += relatorioDetail.publico_total_relatorio;
    }

    // Calcular média
    if (auditoria.resumo.total_atividades > 0) {
      auditoria.resumo.media_publico_por_atividade = Math.round(
        auditoria.resumo.total_publico / auditoria.resumo.total_atividades
      );
    }

    // Alertas
    if (auditoria.resumo.total_relatorios === 0) {
      auditoria.alertas.push('⚠️ Nenhum relatório encontrado para abril/2026');
    }
    if (auditoria.resumo.total_publico === 0) {
      auditoria.alertas.push('⚠️ Nenhum público contabilizado nos relatórios');
    }
    const relatorios_sem_atividades = relatorios.filter(
      (r) => !r.atividades || r.atividades.length === 0
    ).length;
    if (relatorios_sem_atividades > 0) {
      auditoria.alertas.push(
        `⚠️ ${relatorios_sem_atividades} relatório(s) sem atividades registradas`
      );
    }

    return Response.json(auditoria);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});