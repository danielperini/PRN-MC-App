import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas admins.' }, { status: 403 });
    }

    // Dados da tabela fornecida
    const rubricas = [
      { grupo: 'Equipe e gestão', rubrica: 'Coordenador Geral', valor_rubrica: 70000 },
      { grupo: 'Equipe e gestão', rubrica: 'Assistente de Coordenação e Produção', valor_rubrica: 50000 },
      { grupo: 'Equipe e gestão', rubrica: 'Coordenador de Comunicação', valor_rubrica: 60000 },
      { grupo: 'Equipe e gestão', rubrica: 'Analista Administrativo-Financeira', valor_rubrica: 50000 },
      { grupo: 'Equipe e gestão', rubrica: 'Assistente Administrativo', valor_rubrica: 40000 },
      { grupo: 'Equipe e gestão', rubrica: 'Produção MIS/MUMO/MHAB', valor_rubrica: 113400 },
      { grupo: 'Equipe e gestão', rubrica: 'Assessor de Imprensa', valor_rubrica: 27000 },
      { grupo: 'Equipe e gestão', rubrica: 'Designer', valor_rubrica: 52000 },
      { grupo: 'Manutenção e operação', rubrica: 'Educador MIS / MUMO / MHAB', valor_rubrica: 138000, valor_utilizado: 13800 },
      { grupo: 'Consultorias', rubrica: 'Consultoria de programação', valor_rubrica: 30000 },
      { grupo: 'Equipe e gestão', rubrica: 'Rede Social / Marketing Cultural (mês 19 ao 28)', valor_rubrica: 22500 },
      { grupo: 'Equipe e gestão', rubrica: 'Fotógrafo (mês 19 ao 28)', valor_rubrica: 27000 },
      { grupo: 'Despesas gerais', rubrica: 'Material de escritório', valor_rubrica: 2700, valor_utilizado: 75 },
      { grupo: 'Atividades Educativas', rubrica: 'Material MIS / MUMO / MHAB (mês 19 ao mês 28)', valor_rubrica: 24000, valor_utilizado: 560 },
    ];

    let updated = 0;
    const updates = [];

    for (const rubricaData of rubricas) {
      const { grupo, rubrica, valor_rubrica, valor_utilizado = 0 } = rubricaData;
      
      // Buscar rubrica existente
      const existing = await base44.entities.Rubrica.filter({ grupo, rubrica }, null, 1);
      
      if (existing.length === 0) {
        console.log(`Rubrica não encontrada: ${grupo} - ${rubrica}`);
        continue;
      }

      const rubricaId = existing[0].id;
      const saldo = valor_rubrica - valor_utilizado;
      const percentual = valor_rubrica > 0 ? (valor_utilizado / valor_rubrica) * 100 : 0;

      await base44.entities.Rubrica.update(rubricaId, {
        valor_rubrica,
        valor_utilizado,
        saldo,
        percentual_utilizado: parseFloat(percentual.toFixed(1)),
      });

      updates.push({
        grupo,
        rubrica,
        valor_rubrica,
        valor_utilizado,
        saldo,
        percentual: parseFloat(percentual.toFixed(1)),
      });

      updated++;
    }

    return Response.json({
      success: true,
      updated,
      updates,
      message: `${updated} rubricas restauradas aos valores originais`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});