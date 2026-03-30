import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas admins.' }, { status: 403 });
    }

    // Valores do PDF - março 2026
    const valoresUtilizados = {
      'Coordenador Geral': 7000,
      'Assistente de Coordenação e Produção': 5000,
      'Coordenador de Comunicação': 6000,
      'Analista Administrativo-Financeira': 5000,
      'Assistente Administrativo': 4000,
      'Designer': 5200, // 2600 x 2
      'Assessor de Imprensa': 3000,
      'Produção MIS/MUMO/MHAB': 12600, // 4200 x 3
    };

    // Buscar todas as rubricas do grupo "Equipe e gestão"
    const rubricasEquipe = await base44.entities.Rubrica.filter(
      { grupo: 'Equipe e gestão' },
      null,
      1000
    );

    let updated = 0;
    const updates = [];

    for (const rubrica of rubricasEquipe) {
      const novoValorUtilizado = valoresUtilizados[rubrica.rubrica];
      
      if (novoValorUtilizado === undefined) continue;

      const saldo = rubrica.valor_rubrica - novoValorUtilizado;
      const percentual = rubrica.valor_rubrica > 0 
        ? (novoValorUtilizado / rubrica.valor_rubrica) * 100 
        : 0;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: novoValorUtilizado,
        saldo: saldo,
        percentual_utilizado: parseFloat(percentual.toFixed(1)),
      });

      updates.push({
        rubrica: rubrica.rubrica,
        valor_rubrica: rubrica.valor_rubrica,
        valor_utilizado: novoValorUtilizado,
        saldo: saldo,
        percentual: parseFloat(percentual.toFixed(1)),
      });

      updated++;
    }

    return Response.json({
      success: true,
      updated,
      updates,
      total_utilizado: Object.values(valoresUtilizados).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});