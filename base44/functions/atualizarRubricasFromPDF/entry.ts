import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas admins.' }, { status: 403 });
    }

    // Valores do PDF - março 2026
    const valoresFromPDF = [
      { grupo: 'Equipe e gestão', rubrica: 'Coordenador Geral', valor_utilizado: 7000 },
      { grupo: 'Equipe e gestão', rubrica: 'Assistente de Coordenação e Produção', valor_utilizado: 5000 },
      { grupo: 'Equipe e gestão', rubrica: 'Coordenador de Comunicação', valor_utilizado: 6000 },
      { grupo: 'Equipe e gestão', rubrica: 'Analista Administrativo-Financeira', valor_utilizado: 5000 },
      { grupo: 'Equipe e gestão', rubrica: 'Assistente Administrativo', valor_utilizado: 4000 },
      { grupo: 'Equipe e gestão', rubrica: 'Produção MIS/MUMO/MHAB', valor_utilizado: 12600 },
      { grupo: 'Equipe e gestão', rubrica: 'Assessor de Imprensa', valor_utilizado: 3000 },
      { grupo: 'Equipe e gestão', rubrica: 'Designer', valor_utilizado: 5200 },
      { grupo: 'Manutenção e operação', rubrica: 'Educador MIS / MUMO / MHAB', valor_utilizado: 13800 },
    ];

    let updated = 0;
    const updates = [];

    for (const item of valoresFromPDF) {
      // Buscar rubrica por grupo e nome
      const existing = await base44.entities.Rubrica.filter(
        { grupo: item.grupo, rubrica: item.rubrica },
        null,
        1
      );

      if (existing.length === 0) {
        updates.push({
          status: 'nao_encontrada',
          grupo: item.grupo,
          rubrica: item.rubrica,
          valor_utilizado: item.valor_utilizado,
        });
        continue;
      }

      const rubrica = existing[0];
      const saldo = rubrica.valor_rubrica - item.valor_utilizado;
      const percentual = rubrica.valor_rubrica > 0
        ? (item.valor_utilizado / rubrica.valor_rubrica) * 100
        : 0;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: item.valor_utilizado,
        saldo: Number(saldo.toFixed(2)),
        percentual_utilizado: Number(percentual.toFixed(1)),
      });

      updates.push({
        status: 'atualizada',
        grupo: item.grupo,
        rubrica: item.rubrica,
        valor_rubrica: rubrica.valor_rubrica,
        valor_utilizado: item.valor_utilizado,
        saldo: Number(saldo.toFixed(2)),
        percentual: Number(percentual.toFixed(1)),
      });

      updated++;
    }

    const totalValorUtilizado = valoresFromPDF.reduce((s, v) => s + v.valor_utilizado, 0);

    return Response.json({
      success: true,
      updated,
      total_valor_utilizado: totalValorUtilizado,
      updates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});