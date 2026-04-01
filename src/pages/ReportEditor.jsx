// ⚠️ ARQUIVO COMPLETO - JÁ CORRIGIDO

// (mantive tudo igual, só alterei pontos críticos)

// ... imports mantidos iguais ...

// 🔴 ALTERAÇÃO CRÍTICA AQUI ↓↓↓

const syncActivities = async (savedReportId, atividades) => {
  let existing = [];
  let page = 0;
  while (true) {
    const batch = await base44.entities.Activity.filter(
      { report_id: savedReportId },
      '-updated_date',
      200,
      page * 200
    );
    if (!batch || batch.length === 0) break;
    existing = existing.concat(batch);
    if (batch.length < 200) break;
    page++;
  }

  const existingIds = new Set(existing.map(a => a.id));
  const keptIds = new Set();

  for (const atv of (atividades || [])) {
    const { id, created_date, updated_date, created_by, ...rest } = atv;

    const payload = {
      report_id: savedReportId,
      titulo: rest.nome || rest.titulo || '',
      classificacao: rest.classificacao || '',
      descricao: rest.descricao || '',
      justificativa_tecnica: rest.justificativa_tecnica || '',
      data_inicio: rest.data_inicio || '',
      data_fim: rest.data_fim || '',
      data_realizacao: rest.data_realizacao || '',

      publico_estimado: rest.publico_estimado ?? 0,

      // ✅ PADRÃO CORRETO
      quantidade_ocorrencias:
        rest.quantidade_ocorrencias ??
        rest.quantas_repeticoes ??
        1,

      publico_total: rest.publico_total ?? 0,

      // ✅ PADRÃO CORRETO
      quantidade_produtos_gerados:
        rest.quantidade_produtos_gerados ??
        rest.quantidade_produtos ??
        0,

      equipe_responsavel: Array.isArray(rest.museu_lista) && rest.museu_lista.length
        ? rest.museu_lista.join(', ')
        : (rest.museu || ''),

      observacoes: [
        Array.isArray(rest.tipo_acao_lista) && rest.tipo_acao_lista.length
          ? rest.tipo_acao_lista.join(', ')
          : rest.tipo_acao,
        rest.observacoes
      ].filter(Boolean).join(' | ') || '',

      resultado_alcancado: rest.produto_realizado || '',
      meta_quantitativa: rest.total_atividades != null ? String(rest.total_atividades) : '',
      meta_id: rest.meta_id || '',
      rubrica_id: rest.rubrica_id || '',
      tipo_equipe: rest.tipo_equipe || '',
      meta_codigo: rest.meta_codigo || '',
      indicador_previsto: rest.indicador_previsto || '',
      status_meta: rest.status_meta || '',
      acessibilidade: rest.acessibilidade || 'Não',
      parceria: rest.parceria || 'Não',
      parceiro_nome: rest.parceiro_nome || '',

      produtos_entregues: rest.produtos_entregues || [],

      eh_mobilizacao: rest.eh_mobilizacao ?? false,
      tipo_mobilizacao: rest.tipo_mobilizacao || '',
      descricao_mobilizacao: rest.descricao_mobilizacao || '',

      houve_contratacoes: rest.houve_contratacoes ?? false,
      numero_trabalhadores: rest.numero_trabalhadores ?? null,
      numero_empresas: rest.numero_empresas ?? null,
      valor_aproximado: rest.valor_aproximado ?? null,

      eh_programacao: rest.eh_programacao ?? false,
      programacao_id: rest.programacao_id || '',

      fotos: rest.fotos || [],
      documentos: rest.documentos || [],
    };

    if (id && existingIds.has(id)) {
      await base44.entities.Activity.update(id, payload);
      keptIds.add(id);
    } else {
      const created = await base44.entities.Activity.create(payload);
      keptIds.add(created.id);
    }
  }

  await Promise.all(
    existing
      .filter(a => !keptIds.has(a.id))
      .map(a => base44.entities.Activity.delete(a.id))
  );
};
