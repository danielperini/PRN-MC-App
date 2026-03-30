import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas admins.' }, { status: 403 });
    }

    const { rubricas } = await req.json();

    if (!Array.isArray(rubricas) || rubricas.length === 0) {
      return Response.json({ error: 'Array de rubricas vazio' }, { status: 400 });
    }

    // Buscar todas as rubricas existentes
    const allRubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
    const rubricaMap = {};
    
    for (const rub of allRubricas) {
      const key = `${rub.grupo}||${rub.rubrica}`;
      rubricaMap[key] = rub;
    }

    let updated = 0;
    const erros = [];

    // Processar cada rubrica do input
    for (const item of rubricas) {
      const { grupo, rubrica, valor_rubrica, valor_utilizado } = item;
      const key = `${grupo}||${rubrica}`;
      const existing = rubricaMap[key];

      if (!existing) {
        erros.push(`Rubrica não encontrada: ${grupo} - ${rubrica}`);
        continue;
      }

      // Calcular saldo e percentual
      const saldo = valor_rubrica - valor_utilizado;
      const percentual = valor_rubrica > 0 ? (valor_utilizado / valor_rubrica) * 100 : 0;

      // Atualizar
      await base44.entities.Rubrica.update(existing.id, {
        valor_rubrica,
        valor_utilizado,
        saldo,
        percentual_utilizado: parseFloat(percentual.toFixed(1)),
      });

      updated++;
    }

    return Response.json({
      success: true,
      updated,
      erros,
      total: rubricas.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});