import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Auditoria e verificação completa dos cálculos de rubricas.
 * Detecta e corrige inconsistências entre LancamentoRubrica e os valores calculados na Rubrica.
 * 
 * Modos:
 *   - "verificar": apenas verifica e retorna relatório de inconsistências (sem alterar dados)
 *   - "corrigir": verifica E corrige todas as inconsistências encontradas
 *   - "relatorio": retorna relatório detalhado de todas as rubricas com seus totais
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const modo = body.modo || 'verificar'; // verificar | corrigir | relatorio

    // Buscar TODOS os lançamentos (paginar se necessário)
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

    // Buscar todas as rubricas
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);

    const inconsistencias = [];
    const relatorio = [];
    let totalCorrigidas = 0;

    // Indexar lançamentos por rubrica_id
    const lancamentosPorRubrica = {};
    for (const l of allLancamentos) {
      if (!lancamentosPorRubrica[l.rubrica_id]) {
        lancamentosPorRubrica[l.rubrica_id] = [];
      }
      lancamentosPorRubrica[l.rubrica_id].push(l);
    }

    // Detectar lançamentos órfãos (rubrica_id que não existe)
    const rubricaIds = new Set(rubricas.map(r => r.id));
    const lancamentosOrfaos = allLancamentos.filter(l => !rubricaIds.has(l.rubrica_id));

    // Verificar cada rubrica
    for (const rubrica of rubricas) {
      const lans = lancamentosPorRubrica[rubrica.id] || [];
      
      // Calcular valor real a partir dos lançamentos
      const valorUtilizadoReal = lans.reduce((sum, l) => sum + (parseFloat(l.valor) || 0), 0);
      const valorUtilizadoRealRounded = parseFloat(valorUtilizadoReal.toFixed(2));
      
      const valorRubrica = parseFloat(rubrica.valor_rubrica) || 0;
      const saldoReal = parseFloat((valorRubrica - valorUtilizadoRealRounded).toFixed(2));
      const percentualReal = valorRubrica > 0
        ? parseFloat(((valorUtilizadoRealRounded / valorRubrica) * 100).toFixed(2))
        : 0;

      // Comparar com valores armazenados
      const valorUtilizadoArmazenado = parseFloat(rubrica.valor_utilizado) || 0;
      const saldoArmazenado = parseFloat(rubrica.saldo) || 0;
      const percentualArmazenado = parseFloat(rubrica.percentual_utilizado) || 0;

      const tolerancia = 0.01; // centavos
      const divergeUtilizado = Math.abs(valorUtilizadoArmazenado - valorUtilizadoRealRounded) > tolerancia;
      const divergeSaldo = Math.abs(saldoArmazenado - saldoReal) > tolerancia;
      const divergePercentual = Math.abs(percentualArmazenado - percentualReal) > tolerancia;

      // Verificações de integridade adicionais
      const saldoNegativo = saldoReal < 0;
      const percentualAcima100 = percentualReal > 100;
      const saldoInconsistenteComCalculo = Math.abs(saldoReal - (valorRubrica - valorUtilizadoRealRounded)) > tolerancia;
      
      const itemRelatorio = {
        id: rubrica.id,
        grupo: rubrica.grupo,
        rubrica: rubrica.rubrica,
        valor_rubrica: valorRubrica,
        num_lancamentos: lans.length,
        calculado: {
          valor_utilizado: valorUtilizadoRealRounded,
          saldo: saldoReal,
          percentual_utilizado: percentualReal,
        },
        armazenado: {
          valor_utilizado: valorUtilizadoArmazenado,
          saldo: saldoArmazenado,
          percentual_utilizado: percentualArmazenado,
        },
        alertas: [],
        tem_divergencia: false,
      };

      if (saldoNegativo) itemRelatorio.alertas.push('SALDO_NEGATIVO');
      if (percentualAcima100) itemRelatorio.alertas.push('ACIMA_100_PORCENTO');
      if (divergeUtilizado || divergeSaldo || divergePercentual) {
        itemRelatorio.tem_divergencia = true;
        itemRelatorio.alertas.push('VALORES_DESINCRONIZADOS');
        inconsistencias.push({
          ...itemRelatorio,
          diff_utilizado: parseFloat((valorUtilizadoRealRounded - valorUtilizadoArmazenado).toFixed(2)),
          diff_saldo: parseFloat((saldoReal - saldoArmazenado).toFixed(2)),
        });
      }

      relatorio.push(itemRelatorio);

      // Corrigir se modo = 'corrigir'
      if (modo === 'corrigir' && (divergeUtilizado || divergeSaldo || divergePercentual)) {
        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
          valor_utilizado: valorUtilizadoRealRounded,
          saldo: saldoReal,
          percentual_utilizado: percentualReal,
        });
        totalCorrigidas++;
      }
    }

    // Sumário financeiro global
    const sumario = {
      total_rubricas: rubricas.length,
      total_lancamentos: allLancamentos.length,
      lancamentos_orfaos: lancamentosOrfaos.length,
      rubricas_com_divergencia: inconsistencias.length,
      rubricas_com_saldo_negativo: relatorio.filter(r => r.alertas.includes('SALDO_NEGATIVO')).length,
      rubricas_acima_100_porcento: relatorio.filter(r => r.alertas.includes('ACIMA_100_PORCENTO')).length,
      valor_total_orcado: parseFloat(rubricas.reduce((s, r) => s + (parseFloat(r.valor_rubrica) || 0), 0).toFixed(2)),
      valor_total_utilizado_calculado: parseFloat(
        relatorio.reduce((s, r) => s + r.calculado.valor_utilizado, 0).toFixed(2)
      ),
      valor_total_saldo_calculado: parseFloat(
        relatorio.reduce((s, r) => s + r.calculado.saldo, 0).toFixed(2)
      ),
    };

    const resultado = {
      success: true,
      modo,
      timestamp: new Date().toISOString(),
      sumario,
      inconsistencias,
      lancamentos_orfaos: lancamentosOrfaos.map(l => ({
        id: l.id,
        rubrica_id: l.rubrica_id,
        valor: l.valor,
        descricao: l.descricao,
        data_lancamento: l.data_lancamento,
      })),
    };

    if (modo === 'relatorio') {
      resultado.relatorio_completo = relatorio;
    }

    if (modo === 'corrigir') {
      resultado.total_corrigidas = totalCorrigidas;
    }

    return Response.json(resultado);
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});