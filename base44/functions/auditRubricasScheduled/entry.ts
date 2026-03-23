import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Versão agendada da auditoria: verifica e auto-corrige inconsistências,
 * salvando um log no BackupLog para rastreabilidade.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar TODOS os lançamentos com paginação
    const pageSize = 500;
    let allLancamentos = [];
    let page = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.LancamentoRubrica.list('-created_date', pageSize, page * pageSize);
      if (!batch || batch.length === 0) break;
      allLancamentos = allLancamentos.concat(batch);
      if (batch.length < pageSize) break;
      page++;
    }

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);

    const lancamentosPorRubrica = {};
    for (const l of allLancamentos) {
      if (!lancamentosPorRubrica[l.rubrica_id]) lancamentosPorRubrica[l.rubrica_id] = [];
      lancamentosPorRubrica[l.rubrica_id].push(l);
    }

    let totalCorrigidas = 0;
    const inconsistencias = [];

    for (const rubrica of rubricas) {
      const lans = lancamentosPorRubrica[rubrica.id] || [];
      const valorUtilizado = parseFloat(
        lans.reduce((sum, l) => sum + (parseFloat(l.valor) || 0), 0).toFixed(2)
      );
      const valorRubrica = parseFloat(rubrica.valor_rubrica) || 0;
      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado = valorRubrica > 0
        ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
        : 0;

      const tolerancia = 0.01;
      const diverge =
        Math.abs((parseFloat(rubrica.valor_utilizado) || 0) - valorUtilizado) > tolerancia ||
        Math.abs((parseFloat(rubrica.saldo) || 0) - saldo) > tolerancia ||
        Math.abs((parseFloat(rubrica.percentual_utilizado) || 0) - percentualUtilizado) > tolerancia;

      if (diverge) {
        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
          valor_utilizado: valorUtilizado,
          saldo,
          percentual_utilizado: percentualUtilizado,
        });
        totalCorrigidas++;
        inconsistencias.push({ rubrica: rubrica.rubrica, grupo: rubrica.grupo, valor_utilizado: valorUtilizado, saldo });
      }
    }

    const sumario = {
      total_rubricas: rubricas.length,
      total_lancamentos: allLancamentos.length,
      rubricas_corrigidas: totalCorrigidas,
      valor_total_orcado: parseFloat(rubricas.reduce((s, r) => s + (parseFloat(r.valor_rubrica) || 0), 0).toFixed(2)),
    };

    // Gravar log
    await base44.asServiceRole.entities.BackupLog.create({
      tipo: 'auditoria_rubricas',
      status: totalCorrigidas === 0 ? 'ok' : 'corrigido',
      descricao: `Auditoria automática: ${rubricas.length} rubricas, ${totalCorrigidas} corrigidas, ${allLancamentos.length} lançamentos`,
      detalhes: JSON.stringify({ sumario, inconsistencias }),
      executado_em: new Date().toISOString(),
    });

    return Response.json({ success: true, sumario, inconsistencias });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});