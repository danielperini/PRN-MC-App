import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      relatorio_id,
      secao,
      data_inicio,
      data_fim,
      filtro_museu = 'todos',
      filtro_meta_ids = [],
    } = body;

    if (!relatorio_id) return Response.json({ error: 'relatorio_id é obrigatório' }, { status: 400 });

    const srv = base44.asServiceRole;
    const relatorio = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
    if (!relatorio) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const dInicio = data_inicio || relatorio.data_inicio;
    const dFim = data_fim || relatorio.data_fim;
    const museu = filtro_museu !== 'todos' ? filtro_museu : null;

    // ─── COLETA DE CONTEXTO REAL (com limites agressivos para evitar timeout) ──
    async function coletarContexto() {
      // Buscar em grupos sequenciais pequenos para não sobrecarregar
      const [rubricas, metas] = await Promise.all([
        srv.entities.Rubrica.filter({ ativo: true }, 'grupo', 200).catch(() => []),
        srv.entities.ProjectMeta.list('ordem', 100).catch(() => []),
      ]);

      const [activities, programacoes] = await Promise.all([
        srv.entities.Activity.filter({ data_realizacao: { $gte: dInicio, $lte: dFim } }, '-data_realizacao', 150).catch(() => []),
        srv.entities.Programacao.filter({ data: { $gte: dInicio, $lte: dFim } }, '-data', 100).catch(() => []),
      ]);

      const [releases, teamMembers, fotosRaw] = await Promise.all([
        srv.entities.Release.list('-data_publicacao', 20).catch(() => []),
        srv.entities.TeamMember.filter({ status: 'ATIVO' }, 'nome', 100).catch(() => []),
        srv.entities.ReportPhoto.list('-created_date', 200).catch(() => []),
      ]);

      // Filtrar fotos: quando filtro_versao é noturno/noturno_pampulha, excluir fotos do MUMO
      const NOTURNO_FILTER = (relatorio.filtro_versao === 'noturno' || relatorio.filtro_versao === 'noturno_pampulha');
      const fotos = NOTURNO_FILTER
        ? fotosRaw.filter(f => {
            const fm = (f.museu || '').toLowerCase();
            const fc = (f.caption || f.legenda || '').toLowerCase();
            return !fm.includes('mumo') && !fm.includes('moda') && !fc.includes('mumo');
          })
        : fotosRaw;

      const [reports, purchases] = await Promise.all([
        srv.entities.Report.filter({ status: { $in: ['APPROVED', 'SUBMITTED'] } }, '-updated_date', 50).catch(() => []),
        srv.entities.PurchaseRequest.filter({ status: { $in: ['APROVADO_ADMIN', 'PAGO'] } }, '-created_date', 200).catch(() => []),
      ]);

      const lancamentos: any[] = [];

      // Filtrar atividades por museu se especificado
      const atividadesFiltradas = museu
        ? activities.filter(a =>
            (a.museu && a.museu.includes(museu)) ||
            (a.centro_custo && a.centro_custo.includes(museu))
          )
        : activities;

      // Filtrar metas
      const metasFiltradas = filtro_meta_ids.length > 0
        ? metas.filter(m => filtro_meta_ids.includes(m.id))
        : metas.filter(m => m.ativo !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // Mapear fotos por report_id
      const fotosPorReport: Record<string, any[]> = {};
      for (const f of fotos) {
        if (!f.report_id) continue;
        if (!fotosPorReport[f.report_id]) fotosPorReport[f.report_id] = [];
        fotosPorReport[f.report_id].push(f);
      }

      // Enriquecer atividades com fotos dos relatórios
      const atividadesEnriquecidas = atividadesFiltradas.map(a => {
        const fotosAtividade = fotos.filter(f =>
          f.report_id === a.report_id && f.caption && f.caption.toLowerCase().includes((a.titulo || '').toLowerCase().substring(0, 8))
        ).slice(0, 2);
        return {
          id: a.id,
          titulo: a.titulo,
          descricao: a.descricao || '',
          data: a.data_realizacao,
          data_inicio: a.data_inicio,
          data_fim: a.data_fim,
          museu: a.museu || a.centro_custo || '',
          meta_codigo: a.meta_codigo || '',
          meta_id: a.meta_id || '',
          classificacao: a.classificacao,
          publico_estimado: a.publico_estimado || 0,
          publico_total: a.publico_total || 0,
          quantas_repeticoes: a.quantas_repeticoes || 1,
          status_meta: a.status_meta || '',
          resultado_alcancado: a.resultado_alcancado || '',
          indicador_previsto: a.indicador_previsto || '',
          meta_quantitativa: a.meta_quantitativa || '',
          justificativa_tecnica: a.justificativa_tecnica || '',
          equipe_responsavel: a.equipe_responsavel || '',
          acessibilidade: a.acessibilidade || 'Não',
          parceria: a.parceria || 'Não',
          parceiro_nome: a.parceiro_nome || '',
          observacoes: a.observacoes || '',
          produtos_entregues: a.produtos_entregues || [],
          houve_contratacoes: a.houve_contratacoes || false,
          numero_trabalhadores: a.numero_trabalhadores || 0,
          fotos_vinculadas: fotosAtividade.map(f => ({
            url: f.file_url || f.foto_url || '',
            legenda: f.caption || f.legenda || f.legenda_editada || '',
            autor: f.author || 'Daniel Moreira',
          })),
        };
      });

      // Totais reais — valor usando campos numéricos corretos
      const publicoTotal = atividadesEnriquecidas.reduce((s, a) => s + (a.publico_total || 0), 0);
      const parseValor = (p: any) => {
        const v = p.valor_aprovado_admin ?? p.valor_pago ?? p.valor_solicitado ?? 0;
        return typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;
      };
      const valorTotal = purchases.reduce((s, p) => s + parseValor(p), 0);
      const relatoriosAprovados = reports.filter(r => r.status === 'APPROVED');

      // Resumo de rubricas por meta/grupo (sem inventar)
      const rubricasPorGrupo: Record<string, { previsto: number, utilizado: number, saldo: number, count: number }> = {};
      for (const r of rubricas) {
        const grp = r.grupo || r.nome || 'Geral';
        if (!rubricasPorGrupo[grp]) rubricasPorGrupo[grp] = { previsto: 0, utilizado: 0, saldo: 0, count: 0 };
        rubricasPorGrupo[grp].previsto += r.valor_rubrica || r.valor_total || 0;
        rubricasPorGrupo[grp].utilizado += r.valor_utilizado || 0;
        rubricasPorGrupo[grp].saldo += r.saldo || r.saldo_real || ((r.valor_rubrica || 0) - (r.valor_utilizado || 0));
        rubricasPorGrupo[grp].count++;
      }
      const totalRubricasPrevisto = rubricas.reduce((s, r) => s + (r.valor_rubrica || r.valor_total || 0), 0);
      const totalRubricasUtilizado = rubricas.reduce((s, r) => s + (r.valor_utilizado || 0), 0);

      // Compras por meta (se vinculadas)
      const comprasPorMeta: Record<string, { total: number, count: number }> = {};
      for (const p of purchases) {
        const mid = p.meta_id || 'sem_meta';
        if (!comprasPorMeta[mid]) comprasPorMeta[mid] = { total: 0, count: 0 };
        comprasPorMeta[mid].total += parseValor(p);
        comprasPorMeta[mid].count++;
      }

      return {
        atividades: atividadesEnriquecidas,
        metas: metasFiltradas,
        rubricas,
        rubricasPorGrupo,
        totalRubricasPrevisto,
        totalRubricasUtilizado,
        comprasPorMeta,
        programacoes: programacoes.map(p => ({
          titulo: p.titulo, data: p.data, local: p.local || '', tipo: p.tipo || '', museu: p.museu || '',
        })),
        releases: releases.map(r => ({
          titulo: r.titulo, data: r.data_publicacao, veiculo: r.veiculo || '', resumo: r.resumo || '',
        })),
        equipe: teamMembers.map(t => ({
          nome: t.user_name || t.nome || '',
          cargo: t.funcao || t.cargo_representante || '',
          tipo_pessoa: t.tipo_pessoa || 'PF',
          museu_projeto: t.museu_projeto || '',
          valor_total: t.valor_total || 0,
          numero_parcelas: t.numero_parcelas || 0,
          data_inicio: t.data_inicio_contrato || '',
          data_fim: t.data_fim_contrato || '',
          status_contrato: t.status_contrato || 'VIGENTE',
        })),
        fotos: fotos.slice(0, 100).map(f => ({
          url: f.file_url || f.foto_url || '',
          legenda: f.caption || f.legenda || f.legenda_editada || '',
          autor: f.author || 'Daniel Moreira',
          report_id: f.report_id,
          mes: f.mes_referencia || '',
        })),
        // Estatísticas reais
        total_atividades: atividadesFiltradas.length,
        total_metas: metasFiltradas.length,
        publico_total: publicoTotal,
        valor_total_aprovado: valorTotal,
        total_team: teamMembers.length,
        total_releases: releases.length,
        total_programacoes: programacoes.length,
        total_relatorios_aprovados: relatoriosAprovados.length,
        total_fotos: fotos.length,
        museus_ativos: [...new Set(atividadesFiltradas.map(a => a.museu || a.centro_custo).filter(Boolean))],
      };
    }

    // ─── IA COM INSTRUÇÃO INSTITUCIONAL ──────────────────────────────────────
    async function chamarIA(prompt: string, schema: any = null) {
      const instrucao = `Você é um especialista em relatórios de prestação de contas culturais para a Prefeitura de Belo Horizonte (PBH/FMC/SUCC).

REGRAS ABSOLUTAS:
1. NUNCA invente fatos, números, nomes ou eventos.
2. Use SOMENTE os dados fornecidos no contexto.
3. Se não houver dado suficiente para uma afirmação, omita-a.
4. Linguagem: técnica, cultural, institucional, em português do Brasil correto.
5. Evite caixa alta desnecessária.
6. Textos fluidos, coesos, sem jargões desnecessários.
7. Citações literais apenas se o texto original foi fornecido.

`;
      const opts: any = { prompt: instrucao + prompt };
      if (schema) opts.response_json_schema = schema;
      return await base44.integrations.Core.InvokeLLM(opts);
    }

    // Normalizar chave de seção para compatibilidade UI → switch
    const secaoNormalizada = (secao || '')
      .replace('divulgacao_parceria', 'divulgacao')
      .replace('impactos_economicos_sociais', 'impactos')
      .replace('avaliacao_parceria', 'avaliacao')
      .replace('anexos_evidencias', 'anexos');

    // ─── SEÇÕES ──────────────────────────────────────────────────────────────
    switch (secaoNormalizada) {

      // ── Identificação ────────────────────────────────────────────────────
      case 'identificacao': {
        const ident = {
          organizacao: 'Viaduto das Artes',
          projeto: 'Museus Centro',
          instrumento_juridico: relatorio.identificacao_projeto?.instrumento_juridico || '',
          processo_administrativo: relatorio.identificacao_projeto?.processo_administrativo || '',
          vigencia_inicio: dInicio,
          vigencia_fim: dFim,
          responsavel: user.full_name || '',
          telefone: relatorio.identificacao_projeto?.telefone || '',
          email: user.email || '',
        };
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { identificacao_projeto: ident });
        return Response.json({ success: true, secao, data: ident });
      }

      // ── Endereço de Execução ─────────────────────────────────────────────
      case 'endereco_execucao': {
        const ctx = await coletarContexto();
        const enderecosOficiais: Record<string, string> = {
          'MHAB': 'Museu Histórico Abílio Barreto (MHAB) — Av. Prudente de Morais, 202 – Cidade Jardim, Belo Horizonte/MG – CEP 30.380-000',
          'MIS': 'Museu da Imagem e do Som (MIS) — Av. Afonso Pena, 1520 – Centro, Belo Horizonte/MG – CEP 30.130-921',
          'MUMO': 'Museu do Museu (MUMO) – Rua da Bahia, 1149 – Centro, Belo Horizonte/MG – CEP 30.160-011',
          'Casa Kubitschek': 'Casa Kubitschek — Av. João Antônio Alves, 90 – Pampulha, Belo Horizonte/MG – CEP 31.365-200',
          'Casa do Baile': 'Casa do Baile — Av. Otacílio Negrão de Lima, 751 – Pampulha, Belo Horizonte/MG – CEP 31.365-450',
          'MAP': 'Museu de Arte da Pampulha (MAP) — Av. Otacílio Negrão de Lima, 16.585 – Pampulha, Belo Horizonte/MG – CEP 31.365-450',
        };

        const museusAtivos = ctx.museus_ativos.length > 0 ? ctx.museus_ativos : Object.keys(enderecosOficiais);
        const enderecosList = museusAtivos
          .map(m => {
            const key = Object.keys(enderecosOficiais).find(k => m.includes(k) || k.includes(m));
            return key ? enderecosOficiais[key] : null;
          })
          .filter(Boolean);

        const texto = await chamarIA(
          `CONTEXTO: ${ctx.total_atividades} atividades realizadas nos seguintes museus: ${museusAtivos.join(', ')}.\n\n` +
          `Endereços oficiais dos locais de execução:\n${enderecosList.join('\n')}\n\n` +
          `Gere a seção "LOCAL DE EXECUÇÃO" listando os endereços dos museus ativos com breve contextualização institucional de cada um. ` +
          `Máximo 1.500 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : enderecosList.join('\n');
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          endereco_execucao: { texto_ia: txt, texto_editado: '', modo: 'ia' },
        });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      // ── Divulgação da Parceria ────────────────────────────────────────────
      case 'divulgacao': {
        const ctx = await coletarContexto();
        if (ctx.releases.length === 0 && ctx.programacoes.length === 0) {
          const txt = 'Não foram localizados registros de releases ou materiais de divulgação no período. A divulgação da parceria será documentada assim que os dados forem cadastrados no sistema.';
          await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
            divulgacao_parceria: { texto_ia: txt, texto_editado: '', modo: 'ia' },
          });
          return Response.json({ success: true, secao, data: { texto_ia: txt } });
        }
        const texto = await chamarIA(
          `CONTEXTO REAL:\n` +
          `- Releases cadastrados: ${ctx.releases.length}\n` +
          `- Programações com divulgação: ${ctx.programacoes.length}\n` +
          `- Releases: ${JSON.stringify(ctx.releases.slice(0, 10))}\n\n` +
          `Gere a seção "DIVULGAÇÃO DA PARCERIA". Descreva as ações de comunicação e visibilidade do projeto Museus Centro ` +
          `com base exclusivamente nos dados fornecidos. Mencione veículos, releases e programações identificados. ` +
          `Máximo 1.200 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          divulgacao_parceria: { texto_ia: txt, texto_editado: '', modo: 'ia' },
        });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      // ── Descrição das Ações ───────────────────────────────────────────────
      case 'descricao_acoes': {
        const ctx = await coletarContexto();
        const atvsResumidas = ctx.atividades.slice(0, 30).map(a =>
          `${a.data || ''} | ${a.museu} | ${a.classificacao} | ${a.titulo} | Público: ${a.publico_total} | Meta: ${a.meta_codigo || 'Rotina'}`
        ).join('\n');

        const texto = await chamarIA(
          `DADOS REAIS DO PERÍODO ${dInicio} a ${dFim}:\n` +
          `- Total de atividades registradas: ${ctx.total_atividades}\n` +
          `- Público total alcançado: ${ctx.publico_total}\n` +
          `- Museus ativos: ${ctx.museus_ativos.join(', ')}\n` +
          `- Programações realizadas: ${ctx.total_programacoes}\n` +
          `- Equipe contratada: ${ctx.total_team} profissionais\n\n` +
          `ATIVIDADES (resumo):\n${atvsResumidas}\n\n` +
          `Gere a seção "DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS" em linguagem técnico-cultural institucional. ` +
          `Organize por museu/área quando possível. Mencione somente atividades listadas acima. ` +
          `Máximo 2.000 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          descricao_acoes: { texto_ia: txt, texto_editado: '', modo: 'ia' },
        });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      // ── Público-Alvo ─────────────────────────────────────────────────────
      case 'publico_alvo': {
        const ctx = await coletarContexto();
        const rd = ctx.publico_total;
        // Valores previstos do plano de trabalho (base contratual)
        const pd = relatorio.publico_alvo?.previsto_direto || 50000;
        const pi = relatorio.publico_alvo?.previsto_indireto || 150000;
        const ri = Math.round(rd * 2.5);

        const texto = await chamarIA(
          `DADOS REAIS:\n` +
          `- Público direto previsto: ${pd}\n` +
          `- Público direto realizado: ${rd} (${pd > 0 ? Math.round(rd/pd*100) : 0}%)\n` +
          `- Público indireto previsto: ${pi}\n` +
          `- Público indireto estimado: ${ri}\n` +
          `- Total de atividades que geraram público: ${ctx.atividades.filter(a => a.publico_total > 0).length}\n` +
          `- Museus ativos no período: ${ctx.museus_ativos.join(', ')}\n\n` +
          `Gere texto interpretativo de 2 parágrafos sobre o alcance de público. ` +
          `Base-se exclusivamente nos dados acima. Não invente justificativas sem evidência. ` +
          `Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        const publ = {
          previsto_direto: pd, previsto_indireto: pi,
          realizado_direto: rd, realizado_indireto: ri,
          diferenca_direto: rd - pd, diferenca_indireto: ri - pi,
          percentual_direto: pd > 0 ? Math.round(rd / pd * 100) : 0,
          percentual_indireto: pi > 0 ? Math.round(ri / pi * 100) : 0,
          texto_interpretativo_ia: txt, texto_interpretativo_editado: '', modo: 'ia',
        };
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { publico_alvo: publ });
        return Response.json({ success: true, secao, data: publ });
      }

      // ── Pesquisa de Satisfação ───────────────────────────────────────────
      case 'pesquisa_satisfacao': {
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          pesquisa_satisfacao: {
            possui_dados: false,
            justificativa_ia: 'Não foram localizados registros de pesquisa de satisfação aplicada no período. Formulários de avaliação serão implementados nas próximas edições das programações.',
            justificativa_editada: '', modo: 'ia',
          },
        });
        return Response.json({ success: true, secao, data: { possui_dados: false } });
      }

      // ── Cronograma de Metas ──────────────────────────────────────────────
      case 'cronograma_metas': {
        const ctx = await coletarContexto();
        const cronograma = [];

        for (const meta of ctx.metas) {
          // Vincular atividades à meta por meta_codigo ou meta_id
          const atvsDaMeta = ctx.atividades.filter(a =>
            (a.meta_id && a.meta_id === meta.id) ||
            (a.meta_codigo && meta.nome && (
              a.meta_codigo === meta.nome ||
              meta.nome.toLowerCase().includes(a.meta_codigo.toLowerCase().substring(0, 6))
            ))
          );

          // Fotos de evidência da meta — priorizando fotos vinculadas às atividades da meta
          const reportIdsDaMeta = new Set(atvsDaMeta.map(a => a.report_id).filter(Boolean));
          const fotosEvidencia = ctx.fotos
            .filter(f => {
              if (!f.url) return false;
              if (f.report_id && reportIdsDaMeta.has(f.report_id)) return true;
              return false;
            })
            .slice(0, 3)
            .map(f => f.url)
            .filter(Boolean);

          const publicoMeta = atvsDaMeta.reduce((s, a) => s + (a.publico_total || 0), 0);
          const resultadosAlcancados = atvsDaMeta
            .filter(a => a.resultado_alcancado)
            .map(a => a.resultado_alcancado)
            .join('; ');

          const descAtividades = atvsDaMeta.slice(0, 8).map(a =>
            `${a.data || ''}: ${a.titulo} — Público: ${a.publico_total} — ${a.resultado_alcancado || a.status_meta || ''}`
          ).join('\n');

          // Valor financeiro real vinculado a esta meta
          const financeiroMeta = ctx.comprasPorMeta[meta.id] || { total: 0, count: 0 };
          // Rubricas vinculadas a esta meta por nome (busca parcial)
          const rubricasDaMeta = ctx.rubricas.filter(r =>
            (r.meta && meta.nome && r.meta.toLowerCase().includes(meta.nome.toLowerCase().substring(0, 15))) ||
            (r.grupo && meta.nome && r.grupo.toLowerCase().includes(meta.nome.toLowerCase().substring(0, 15)))
          );
          const previstoDaMeta = rubricasDaMeta.reduce((s, r) => s + (r.valor_rubrica || r.valor_total || 0), 0);
          const utilizadoDaMeta = rubricasDaMeta.reduce((s, r) => s + (r.valor_utilizado || 0), 0);

          let entrada: any;
          if (atvsDaMeta.length === 0) {
            // Sem atividades: não inventar
            entrada = {
              meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
              resultado_esperado: meta.descricao || '',
              acoes: 'Nenhuma atividade registrada para esta meta no período.',
              periodo: `${dInicio} a ${dFim}`,
              documentos_verificacao: [],
              resultado_alcancado: 'Sem registros no período.',
              status_meta: 'Não Realizada',
              percentual_execucao: 0,
              justificativa: 'Não foram localizadas atividades vinculadas a esta meta no período consultado.',
              valor_previsto: previstoDaMeta,
              valor_realizado: utilizadoDaMeta || financeiroMeta.total,
              modo: 'ia',
            };
          } else {
            try {
              const analise = await chamarIA(
                `META: "${meta.nome}"\n` +
                `Descrição da meta: ${meta.descricao || ''}\n` +
                `Atividades realizadas (${atvsDaMeta.length}):\n${descAtividades}\n` +
                `Público alcançado: ${publicoMeta}\n` +
                `Resultados registrados: ${resultadosAlcancados || 'não informados'}\n` +
                `Valor previsto nas rubricas: R$ ${previstoDaMeta.toFixed(2)}\n` +
                `Valor utilizado/aprovado: R$ ${(utilizadoDaMeta || financeiroMeta.total).toFixed(2)}\n` +
                `Notas fiscais vinculadas: ${financeiroMeta.count}\n\n` +
                `Com base EXCLUSIVAMENTE nos dados acima, retorne JSON com: ` +
                `resultado_esperado (do plano de trabalho desta meta), ` +
                `acoes (resumo das ações realizadas, baseado nas atividades listadas), ` +
                `periodo, resultado_alcancado (baseado nos dados reais), ` +
                `status_meta ("Realizada Integralmente" | "Realizada Parcialmente" | "Não Realizada"), ` +
                `percentual_execucao (0-100, baseado nas atividades realizadas vs. previstas), ` +
                `justificativa.`,
                {
                  type: 'object',
                  properties: {
                    resultado_esperado: { type: 'string' }, acoes: { type: 'string' },
                    periodo: { type: 'string' }, resultado_alcancado: { type: 'string' },
                    status_meta: { type: 'string' }, percentual_execucao: { type: 'number' },
                    justificativa: { type: 'string' },
                  },
                  required: ['resultado_esperado', 'acoes', 'status_meta', 'percentual_execucao'],
                }
              );
              entrada = {
                meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
                resultado_esperado: analise.resultado_esperado || meta.descricao || '',
                acoes: analise.acoes || `${atvsDaMeta.length} atividades realizadas`,
                periodo: analise.periodo || `${dInicio} a ${dFim}`,
                documentos_verificacao: fotosEvidencia,
                resultado_alcancado: analise.resultado_alcancado || resultadosAlcancados || '',
                status_meta: analise.status_meta || 'Realizada Parcialmente',
                percentual_execucao: analise.percentual_execucao || 0,
                justificativa: analise.justificativa || '',
                valor_previsto: previstoDaMeta,
                valor_realizado: utilizadoDaMeta || financeiroMeta.total,
                modo: 'ia',
              };
            } catch {
              entrada = {
                meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
                resultado_esperado: meta.descricao || '',
                acoes: `${atvsDaMeta.length} atividades realizadas no período`,
                periodo: `${dInicio} a ${dFim}`,
                documentos_verificacao: fotosEvidencia,
                resultado_alcancado: resultadosAlcancados || `${atvsDaMeta.length} atividades — público: ${publicoMeta}`,
                status_meta: atvsDaMeta.length >= 3 ? 'Realizada Integralmente' : 'Realizada Parcialmente',
                percentual_execucao: Math.min(100, atvsDaMeta.length * 15),
                justificativa: '',
                valor_previsto: previstoDaMeta,
                valor_realizado: utilizadoDaMeta || financeiroMeta.total,
                modo: 'ia',
              };
            }
          }
          cronograma.push(entrada);
        }

        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { cronograma_metas: cronograma });
        return Response.json({ success: true, secao, data: { total_metas: cronograma.length } });
      }

      // ── Equipe de Trabalho ───────────────────────────────────────────────
      case 'equipe_trabalho': {
        const ctx = await coletarContexto();
        const equipe = ctx.equipe.map(t => ({
          nome: t.nome,
          cargo: t.cargo || 'Profissional',
          tipo_contratacao: t.tipo_pessoa === 'PF' ? 'Pessoa Física' : t.tipo_pessoa === 'MEI' ? 'MEI' : 'Pessoa Jurídica',
          carga_horaria: '',
          valor: t.valor_total || 0,
          periodo: `${t.data_inicio || dInicio} a ${t.data_fim || dFim}`,
          modo: 'ia',
        }));
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { equipe_trabalho: equipe });
        return Response.json({ success: true, secao, data: { total: equipe.length } });
      }

      // ── Fichas de Atividades (seção estruturada completa) ────────────────
      case 'fichas_atividades': {
        const ctx = await coletarContexto();
        const fichas = ctx.atividades.map(a => ({
          data: a.data || a.data_inicio || '',
          museu: a.museu || '',
          meta: a.meta_codigo || a.meta_id || '',
          titulo: a.titulo || '',
          descricao: a.descricao || '',
          tipo: a.classificacao || '',
          publico: a.publico_total || 0,
          responsavel: a.equipe_responsavel || '',
          acessibilidade: a.acessibilidade || 'Não',
          parceria: a.parceria === 'Sim' ? (a.parceiro_nome || 'Sim') : 'Não',
          produtos_entregues: (a.produtos_entregues || []).join(', '),
          resultado_alcancado: a.resultado_alcancado || '',
          status_meta: a.status_meta || '',
          observacoes: a.observacoes || '',
          fotos: a.fotos_vinculadas.map(f => ({
            url: f.url,
            legenda: f.legenda || `${a.titulo} — ${a.museu}`,
            credito: f.autor || 'Daniel Moreira',
          })),
        }));
        // Armazenar como anexo estruturado no relatório
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          anexos_evidencias: fichas.flatMap(f => f.fotos.map(ft => ({
            foto_url: ft.url,
            atividade_nome: f.titulo,
            atividade_data: f.data,
            local: f.museu,
            meta_nome: f.meta,
            legenda_ia: ft.legenda,
            legenda_editada: '',
          }))).filter(x => x.foto_url),
        });
        return Response.json({ success: true, secao, data: { total_fichas: fichas.length, fichas } });
      }

      // ── Impactos Econômicos e Sociais ─────────────────────────────────────
      case 'impactos': {
        const ctx = await coletarContexto();
        const gruposRubricas = Object.entries(ctx.rubricasPorGrupo).slice(0, 10)
          .map(([g, v]) => `  • ${g}: previsto R$${v.previsto.toFixed(0)}, utilizado R$${v.utilizado.toFixed(0)}`)
          .join('\n');
        const texto = await chamarIA(
          `DADOS REAIS:\n` +
          `- Público total alcançado: ${ctx.publico_total}\n` +
          `- Total de atividades: ${ctx.total_atividades}\n` +
          `- Profissionais contratados: ${ctx.total_team}\n` +
          `- Valor total aprovado em NFs: R$ ${ctx.valor_total_aprovado.toFixed(2)}\n` +
          `- Total previsto em rubricas: R$ ${ctx.totalRubricasPrevisto.toFixed(2)}\n` +
          `- Total utilizado em rubricas: R$ ${ctx.totalRubricasUtilizado.toFixed(2)}\n` +
          `- Museus envolvidos: ${ctx.museus_ativos.join(', ')}\n` +
          `- Programações realizadas: ${ctx.total_programacoes}\n` +
          `- Grupos de despesa com execução:\n${gruposRubricas}\n\n` +
          `Gere a seção "IMPACTOS ECONÔMICOS E SOCIAIS" com base nos dados acima. ` +
          `Aborde: inclusão cultural, acessibilidade, formação de público, cadeia produtiva da cultura, ` +
          `geração de renda para profissionais, turismo cultural, patrimônio imaterial. ` +
          `Use os valores financeiros reais informados. Não invente números. ` +
          `Máximo 2.000 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          impactos_economicos_sociais: { texto_ia: txt, texto_editado: '', modo: 'ia' },
        });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      // ── Sustentabilidade ─────────────────────────────────────────────────
      case 'sustentabilidade': {
        const ctx = await coletarContexto();
        const texto = await chamarIA(
          `CONTEXTO REAL:\n` +
          `- Projeto: Museus Centro / Viaduto das Artes × PBH\n` +
          `- Profissionais contratados: ${ctx.total_team}\n` +
          `- Atividades realizadas: ${ctx.total_atividades}\n` +
          `- Museus: ${ctx.museus_ativos.join(', ')}\n\n` +
          `Gere a seção "SUSTENTABILIDADE" descrevendo o legado, continuidade e capacidade instalada do projeto. ` +
          `Aborde: formação de equipe, sistemas de gestão implantados, acervo documental produzido, ` +
          `metodologias desenvolvidas. Máximo 1.200 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          sustentabilidade: { texto_ia: txt, texto_editado: '', modo: 'ia' },
        });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      // ── Avaliação da Parceria ─────────────────────────────────────────────
      case 'avaliacao': {
        const ctx = await coletarContexto();
        const percExecucao = ctx.totalRubricasPrevisto > 0
          ? Math.round(ctx.totalRubricasUtilizado / ctx.totalRubricasPrevisto * 100)
          : 0;
        const texto = await chamarIA(
          `CONTEXTO REAL:\n` +
          `- Atividades realizadas: ${ctx.total_atividades}\n` +
          `- Metas acompanhadas: ${ctx.total_metas}\n` +
          `- Relatórios mensais aprovados: ${ctx.total_relatorios_aprovados}\n` +
          `- Equipe: ${ctx.total_team} profissionais\n` +
          `- Museus: ${ctx.museus_ativos.join(', ')}\n` +
          `- Total previsto (rubricas): R$ ${ctx.totalRubricasPrevisto.toFixed(2)}\n` +
          `- Total executado (rubricas): R$ ${ctx.totalRubricasUtilizado.toFixed(2)}\n` +
          `- Percentual de execução orçamentária: ${percExecucao}%\n` +
          `- Total aprovado em NFs: R$ ${ctx.valor_total_aprovado.toFixed(2)}\n` +
          `- Fotografias registradas: ${ctx.total_fotos}\n\n` +
          `Gere a seção "AVALIAÇÃO DA PARCERIA" entre Viaduto das Artes e PBH/SUCC/FMC. ` +
          `Aborde: cumprimento do plano de trabalho, execução financeira (use os percentuais reais), ` +
          `desafios enfrentados, aprendizados institucionais, recomendações para continuidade. ` +
          `Não invente percentuais nem valores além dos fornecidos. ` +
          `Máximo 1.500 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          avaliacao_parceria: { texto_ia: txt, texto_editado: '', modo: 'ia' },
        });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      // ── Inovação e Transformação Digital ─────────────────────────────────
      case 'inovacao_digital': {
        const ctx = await coletarContexto();
        const texto = await chamarIA(
          `CONTEXTO REAL DO SISTEMA:\n` +
          `- Total de atividades registradas no sistema: ${ctx.total_atividades}\n` +
          `- Total de fotografias na galeria: ${ctx.total_fotos}\n` +
          `- Total de profissionais cadastrados: ${ctx.total_team}\n` +
          `- Total de relatórios aprovados: ${ctx.total_relatorios_aprovados}\n` +
          `- Total de programações registradas: ${ctx.total_programacoes}\n\n` +
          `Gere a seção "INOVAÇÃO E TRANSFORMAÇÃO DIGITAL" descrevendo o sistema de gestão Museus Centro. ` +
          `Aborde como inovação administrativa aplicada à gestão cultural: ` +
          `integração financeira (rubricas, notas fiscais, solicitações de compra), ` +
          `gestão documental (contratos, comprovantes, anexos), ` +
          `rastreabilidade de atividades por meta e museu, ` +
          `galeria fotográfica como evidência documental, ` +
          `geração automática de relatórios e indicadores, ` +
          `auditoria e prestação de contas integrada. ` +
          `NÃO tratar como produto comercial. Tratar como inovação administrativa pública. ` +
          `Máximo 2.000 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        // Salvar em campo de texto livre reutilizando sustentabilidade como extensão
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          // Armazena no campo de descrição de ações como seção adicional
          descricao_acoes: {
            ...(relatorio.descricao_acoes || {}),
            inovacao_digital_ia: txt,
          },
        });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      // ── Contexto IA para Publicações ─────────────────────────────────────
      case 'contexto_ia_publicacao': {
        const ctx = await coletarContexto();
        const contexto = {
          resumo_executivo: `Projeto Museus Centro — ${dInicio} a ${dFim}. ${ctx.total_atividades} atividades realizadas, público total: ${ctx.publico_total}. Museus: ${ctx.museus_ativos.join(', ')}.`,
          contexto_historico: `Parceria entre Viaduto das Artes e Prefeitura de Belo Horizonte (PBH/SUCC/FMC) para gestão cultural de museus municipais no Centro de Belo Horizonte.`,
          atividades_relacionadas: ctx.atividades.slice(0, 30).map(a => ({
            titulo: a.titulo, data: a.data, museu: a.museu, meta: a.meta_codigo, publico: a.publico_total,
          })),
          metas_relacionadas: ctx.metas.map(m => ({ id: m.id, nome: m.nome, descricao: m.descricao })),
          publico_relacionado: {
            total: ctx.publico_total,
            por_museu: ctx.museus_ativos.map(m => ({
              museu: m,
              total: ctx.atividades.filter(a => a.museu.includes(m)).reduce((s, a) => s + a.publico_total, 0),
            })),
          },
          fotografias: ctx.fotos.slice(0, 20).map(f => ({
            url: f.url, legenda: f.legenda, autor: f.autor, mes: f.mes,
          })),
          documentos: [
            `${ctx.total_relatorios_aprovados} relatórios mensais aprovados`,
            `${ctx.total_team} contratos de profissionais`,
            `${ctx.total_fotos} fotografias na galeria`,
          ],
          referencias: {
            sistema: 'Museus Centro App',
            periodo: `${dInicio} a ${dFim}`,
            museus: ctx.museus_ativos,
            fontes: ['Report', 'Activity', 'ReportPhoto', 'TeamMember', 'PurchaseRequest', 'Programacao'],
          },
        };
        // Persistir contexto IA e fontes no documento do relatório (#6)
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          descricao_acoes: {
            ...(relatorio.descricao_acoes || {}),
            contexto_ia_atividades: JSON.stringify({
              total_atividades: ctx.total_atividades,
              publico_total: ctx.publico_total,
              museus_ativos: ctx.museus_ativos,
              total_metas: ctx.total_metas,
              total_fotos: ctx.total_fotos,
              gerado_em: new Date().toISOString(),
            }),
            fontes_ia_relatorio_execucao: JSON.stringify([
              'Report', 'Activity', 'ReportPhoto', 'TeamMember',
              'PurchaseRequest', 'Programacao', 'LancamentoRubrica',
              'Rubrica', 'ProjectMeta', 'Release',
            ]),
          },
        });
        return Response.json({ success: true, secao, data: contexto });
      }

      // ── Anexos / Evidências Fotográficas ─────────────────────────────────
      case 'anexos': {
        const ctx = await coletarContexto();

        // Determinar se o relatório é de versão Noturno para filtrar fotos corretamente
        const filtroVersao = relatorio.filtro_versao || '';
        const isNoturno = filtroVersao === 'noturno' || filtroVersao === 'noturno_pampulha' || filtro_museu === 'todos';

        // Buscar atividades do período para vincular fotos corretamente
        const atividades = await srv.entities.Activity.filter(
          { data_realizacao: { $gte: dInicio, $lte: dFim } },
          '-data_realizacao',
          200
        ).catch(() => []);

        // Buscar todas as fotos com volume maior para o Noturno
        const todasFotos = await srv.entities.ReportPhoto.list('-created_date', 300).catch(() => []);

        // Identificar atividades Noturno por centro_custo ou museu
        const NOTURNO_KEYWORDS = ['noturno', 'pampulha', 'noturno 2026', 'noturno pampulha', 'noturno nos museus'];
        const atividadesNoturno = atividades.filter(a => {
          const cc = (a.centro_custo || '').toLowerCase();
          const m = (a.museu || '').toLowerCase();
          return NOTURNO_KEYWORDS.some(kw => cc.includes(kw) || m.includes(kw));
        });
        const reportIdsNoturno = new Set(atividadesNoturno.map(a => a.report_id).filter(Boolean));
        const activityIdsNoturno = new Set(atividadesNoturno.map(a => a.id).filter(Boolean));

        // Filtrar fotos vinculadas ao Noturno (via report_id ou activity_id ou museu/caption da foto)
        let fotosNoturno = todasFotos.filter(f => {
          // Vinculadas via report_id de atividades Noturno
          if (f.report_id && reportIdsNoturno.has(f.report_id)) return true;
          // Vinculadas diretamente à atividade Noturno
          if (f.activity_id && activityIdsNoturno.has(f.activity_id)) return true;
          // Museu da foto é Noturno
          const fm = (f.museu || '').toLowerCase();
          const fc = (f.caption || f.legenda || '').toLowerCase();
          return NOTURNO_KEYWORDS.some(kw => fm.includes(kw) || fc.includes(kw));
        });

        // Se não encontrou fotos Noturno suficientes, buscar por período (fotos não-MUMO)
        if (fotosNoturno.length < 5) {
          fotosNoturno = todasFotos.filter(f => {
            const fm = (f.museu || '').toLowerCase();
            const fc = (f.caption || f.legenda || '').toLowerCase();
            // Exclui explicitamente MUMO quando buscando Noturno
            const ehMumo = fm.includes('mumo') || fc.includes('mumo') || fm.includes('moda');
            if (isNoturno && ehMumo) return false;
            return f.file_url;
          });
        }

        const fotosValidas = fotosNoturno.filter(f => f.file_url || f.foto_url);

        // Mapear atividade para cada foto para melhorar legenda
        const atividadesMap: Record<string, any> = {};
        for (const a of atividadesNoturno) atividadesMap[a.id] = a;

        const anexos = fotosValidas.slice(0, 60).map(f => {
          const atv = f.activity_id ? atividadesMap[f.activity_id] : null;
          return {
            foto_url: f.file_url || f.foto_url || '',
            atividade_nome: atv?.titulo || f.legenda || f.caption || 'Evidência fotográfica — Noturno nos Museus',
            atividade_data: atv?.data_realizacao || f.created_date?.split('T')[0] || '',
            local: atv?.museu || atv?.centro_custo || f.museu || '',
            meta_nome: atv?.meta_codigo || f.meta_id || '',
            legenda_ia: f.legenda || f.caption || f.legenda_editada || (atv ? `${atv.titulo} — ${atv.museu || atv.centro_custo || ''}` : 'Registro fotográfico do projeto Noturno nos Museus'),
            legenda_editada: '',
          };
        });

        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { anexos_evidencias: anexos });
        return Response.json({ success: true, secao, data: { total: anexos.length, noturno_count: fotosNoturno.length } });
      }

      // ── Auditoria de Pendências ───────────────────────────────────────────
      case 'auditoria': {
        const rel = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
        const pendencias: any[] = [];
        const crono = rel.cronograma_metas || [];
        for (const m of crono) {
          if ((m.percentual_execucao || 0) < 30) {
            pendencias.push({ tipo: 'meta_sem_evidencia', descricao: `Meta "${m.meta_nome}" com execução baixa (${m.percentual_execucao || 0}%). Verificar registros de atividades.`, resolvida: false });
          }
        }
        const ctx = await coletarContexto();
        if (ctx.total_fotos < 10) {
          pendencias.push({ tipo: 'atividade_sem_foto', descricao: `Apenas ${ctx.total_fotos} fotografias registradas. Recomenda-se ampliar o acervo fotográfico de evidências.`, resolvida: false });
        }
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { auditoria_pendencias: pendencias });
        return Response.json({ success: true, secao, data: { pendencias: pendencias.length } });
      }

      // ── Assinatura ────────────────────────────────────────────────────────
      case 'assinatura': {
        const ass = {
          nome_representante: user.full_name || '',
          cargo: 'Coordenador Geral',
          data: new Date().toISOString().split('T')[0],
          modo: 'ia',
        };
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { assinatura: ass });
        return Response.json({ success: true, secao, data: ass });
      }

      // ── Finalizar ────────────────────────────────────────────────────────
      case 'finalizar': {
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { status: 'revisao' });
        return Response.json({ success: true, secao, data: { status: 'revisao' } });
      }

      default:
        return Response.json({ error: `Seção desconhecida: ${secao}` }, { status: 400 });
    }

  } catch (error) {
    console.error('Erro gerarSecaoRelatorioExecucao:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});