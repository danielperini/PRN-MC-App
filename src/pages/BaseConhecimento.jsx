async function upsertProgramacaoEvents(base44: any, eventos: any[]) {
  let salvos = 0;

  for (const ev of eventos) {
    try {
      // 🔍 verifica se já existe
      const existentes = await base44.asServiceRole.entities.Programacao.list({
        where: {
          nome_acao: ev.nome_acao,
          data: ev.data,
          equipamento: normalizarEquipamento(ev.equipamento),
        },
        limit: 1,
      });

      if (existentes?.items?.length) {
        // 🔁 atualiza existente
        await base44.asServiceRole.entities.Programacao.update(
          existentes.items[0].id,
          {
            horario: ev.horario || '',
            tipo_atividade: ev.tipo_atividade || '',
            formato: ev.formato || '',
            publico: ev.publico || '',
            acessibilidade: ev.acessibilidade || '',
            classificacao: ev.classificacao || '',
            vagas: ev.vagas || '',
            inscricao: ev.inscricao || '',
            sinopse: ev.sinopse || '',
            local: ev.local || '',
            endereco: ev.endereco || '',
            link_imagens: ev.link_imagens || '',
            minibios: ev.minibios || '',
            material_divulgacao: ev.material_divulgacao || '',
            ativo: true,
          }
        );
      } else {
        // ➕ cria novo
        await base44.asServiceRole.entities.Programacao.create({
          nome_acao: ev.nome_acao || '',
          equipamento: normalizarEquipamento(ev.equipamento),
          data: ev.data || '',
          horario: ev.horario || '',
          tipo_atividade: ev.tipo_atividade || '',
          formato: ev.formato || '',
          publico: ev.publico || '',
          acessibilidade: ev.acessibilidade || '',
          classificacao: ev.classificacao || '',
          vagas: ev.vagas || '',
          inscricao: ev.inscricao || '',
          sinopse: ev.sinopse || '',
          local: ev.local || '',
          endereco: ev.endereco || '',
          link_imagens: ev.link_imagens || '',
          minibios: ev.minibios || '',
          material_divulgacao: ev.material_divulgacao || '',
          origem: 'upload_biblioteca',
          ativo: true,
        });
      }

      salvos += 1;
    } catch (e) {
      console.error('Erro ao salvar programação', e);
    }
  }

  return salvos;
}
