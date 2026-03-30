import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas admins.' }, { status: 403 });
    }

    // Valores pagos em março de 2026 (do PDF)
    const pagamentos = {
      'Coordenador Geral': 7000,
      'Assistente de Coordenação e Produção': 5000,
      'Coordenador de Comunicação': 6000,
      'Analista Administrativo-Financeira': 5000,
      'Assistente Administrativo': 4000,
      'Produção MIS/MUMO/MHAB': 12600, // 4.200 x 3
      'Assessor de Imprensa': 3000,
      'Designer': 5200, // 2.600 x 2
      'Educador MIS / MUMO / MHAB': 13800, // 4.600 x 3
    };

    // Buscar todas as rubricas
    const allRubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
    
    let updated = 0;
    const updates = [];

    for (const rubrica of allRubricas) {
      const pagamento = pagamentos[rubrica.rubrica];
      
      if (pagamento === undefined) continue;

      // Novo valor utilizado (anterior + março)
      const novoUtilizado = (rubrica.valor_utilizado || 0) + pagamento;
      const saldo = rubrica.valor_rubrica - novoUtilizado;
      const percentual = rubrica.valor_rubrica > 0 
        ? (novoUtilizado / rubrica.valor_rubrica) * 100 
        : 0;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: novoUtilizado,
        saldo: saldo,
        percentual_utilizado: parseFloat(percentual.toFixed(1)),
      });

      updates.push({
        rubrica: rubrica.rubrica,
        pagamento_marco: pagamento,
        valor_utilizado: novoUtilizado,
        saldo: saldo,
        percentual: parseFloat(percentual.toFixed(1)),
      });

      updated++;
    }

    return Response.json({
      success: true,
      updated,
      updates,
      total_marco: Object.values(pagamentos).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});