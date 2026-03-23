import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const updates = [
      { rubrica: 'Coordenador Geral', valor_utilizado: 7000 },
      { rubrica: 'Assistente de Coordenação e Produção', valor_utilizado: 5000 },
      { rubrica: 'Coordenador de Comunicação', valor_utilizado: 6000 },
      { rubrica: 'Analista Administrativo-Financeira', valor_utilizado: 5000 },
      { rubrica: 'Assistente Administrativo', valor_utilizado: 4000 },
      { rubrica: 'Produção MIS/MUMO/MHAB', valor_utilizado: 12600 },
      { rubrica: 'Assessor de Imprensa', valor_utilizado: 3000 },
      { rubrica: 'Designer', valor_utilizado: 5200 },
      { rubrica: 'Educador MIS / MUMO / MHAB', valor_utilizado: 18400 },
      { rubrica: 'Assessoria jurídica', valor_utilizado: 1700 },
    ];

    let atualizadas = 0;

    for (const update of updates) {
      const existentes = await base44.asServiceRole.entities.Rubrica.filter({ rubrica: update.rubrica });
      if (existentes.length > 0) {
        const rubrica = existentes[0];
        const saldo = rubrica.valor_rubrica - update.valor_utilizado;
        const percentualUtilizado = rubrica.valor_rubrica > 0 
          ? Math.round((update.valor_utilizado / rubrica.valor_rubrica) * 100) 
          : 0;
        
        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
          valor_utilizado: update.valor_utilizado,
          saldo,
          percentual_utilizado: percentualUtilizado,
        });
        atualizadas++;
      }
    }

    return Response.json({
      success: true,
      rubricas_atualizadas: atualizadas,
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});