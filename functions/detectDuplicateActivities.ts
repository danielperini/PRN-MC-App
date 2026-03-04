import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { atividades } = await req.json();
    if (!Array.isArray(atividades)) {
      return Response.json({ error: 'atividades deve ser um array' }, { status: 400 });
    }

    // Função de normalização para comparação
    const normalizeActivity = (activity) => {
      return {
        titulo: (activity.titulo || '').toLowerCase().trim(),
        data_realizacao: activity.data_realizacao,
        publico_estimado: activity.publico_estimado || 0,
        quantas_repeticoes: activity.quantas_repeticoes || 1,
        descricao: (activity.descricao || '').toLowerCase().trim().substring(0, 50), // primeiros 50 caracteres
      };
    };

    const duplicates = [];

    // Detectar duplicatas na lista
    for (let i = 0; i < atividades.length; i++) {
      for (let j = i + 1; j < atividades.length; j++) {
        const normalized_i = normalizeActivity(atividades[i]);
        const normalized_j = normalizeActivity(atividades[j]);

        // Considerar duplicado se título, data e descrição são iguais
        if (
          normalized_i.titulo === normalized_j.titulo &&
          normalized_i.data_realizacao === normalized_j.data_realizacao &&
          normalized_i.descricao === normalized_j.descricao
        ) {
          duplicates.push({
            indices: [i, j],
            titulo: atividades[i].titulo,
            data: atividades[i].data_realizacao,
            publicoTotal: (atividades[i].publico_estimado || 0) + (atividades[j].publico_estimado || 0),
          });
        }
      }
    }

    // Mesclar duplicatas: somar públicos e remover segunda ocorrência
    const merged = atividades.map((a, idx) => {
      const isDuplicate = duplicates.some(d => d.indices[1] === idx);
      if (isDuplicate) {
        const dup = duplicates.find(d => d.indices[1] === idx);
        return { ...a, _duplicate_merged: true, _merged_from: dup.indices[0] };
      }
      return a;
    });

    const cleaned = merged.filter((_, idx) => !duplicates.some(d => d.indices[1] === idx));

    return Response.json({
      hasDuplicates: duplicates.length > 0,
      duplicates,
      cleanedActivities: cleaned,
      message: duplicates.length > 0
        ? `${duplicates.length} atividade(s) duplicada(s) detectada(s). Públicos foram somados.`
        : 'Nenhuma duplicata detectada.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});