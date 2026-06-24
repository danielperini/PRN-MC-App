import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
      filtro_versao = 'consolidado'
    } = body;

    if (!relatorio_id) return Response.json({ error: 'relatorio_id é obrigatório' }, { status: 400 });

    const srv = base44.asServiceRole;
    const relatorio = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
    if (!relatorio) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const dInicio = data_inicio || relatorio.data_inicio;
    const dFim = data_fim || relatorio.data_fim;
    const museu = filtro_museu || relatorio.filtro_museu;

    // ── Coletar dados ──────────────────────────────────────────
    async function coletarContexto() {
      const [rubricas, metas, activities, programacoes, releases, teamMembers] = await Promise.all([
        srv.entities.Rubrica.list(),
        srv.entities.ProjectMeta.list(),
        srv.entities.Activity.filter({ data_realizacao: { $gte: dInicio, $lte: dFim } }),
        srv.entities.Programacao.filter({ data: { $gte: dInicio, $lte: dFim } }),
        srv.entities.Release.list(),
        srv.entities.TeamMember.list()
      ]);

      const solicitacoes = await srv.entities.PurchaseRequest.filter({
        status: { $in: ['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO'] }
      });

      const atividadesFiltradas = museu === 'todos'
        ? activities
        : activities.filter(a => a.museu === museu || a.centro_custo?.includes(museu));

      const metasFiltradas = filtro_meta_ids.length > 0
        ? metas.filter(m => filtro_meta_ids.includes(m.id))
        : metas.filter(m => m.ativo !== false);

      return {
        atividades: atividadesFiltradas.slice(0, 80).map(a => ({
          titulo: a.titulo, descricao: a.descricao?.substring(0, 200),
          data: a.data_realizacao, publico: a.publico_total,
          meta: a.meta_codigo, museu: a.museu || a.centro_custo,
          status_meta: a.status_meta, classificacao: a.classificacao
        })),
        metas: metasFiltradas.map(m => ({ id: m.id, nome: m.nome, descricao: m.descricao, ordem: m.ordem })),
        rubricas: rubricas.slice(0, 40).map(r => ({
          nome: r.rubrica, grupo: r.grupo, meta: r.meta,
          valor: r.valor_rubrica, natureza: r.natureza_despesa, museu: r.centro_custo
        })),
        programacoes: programacoes.slice(0, 30).map(p => ({
          titulo: p.titulo, data: p.data, local: p.local, tipo: p.tipo
        })),
        releases: releases.slice(0, 15).map(r => ({ titulo: r.titulo, data: r.data_publicacao, veiculo: r.veiculo })),
        equipe: teamMembers.slice(0, 40).map(t => ({
          nome: t.nome, cargo: t.cargo || t.funcao, tipo_contratacao: t.tipo_contratacao,
          carga_horaria: t.carga_horaria, valor: t.valor_mensal || t.valor_total
        })),
        total_atividades: atividadesFiltradas.length,
        publico_total: atividadesFiltradas.reduce((s, a) => s + (a.publico_total || 0), 0),
        total_solicitacoes: solicitacoes.length,
        valor_solicitacoes: solicitacoes.reduce((s, p) => s + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0)
      };
    }

    async function chamarIA(prompt, schema = null) {
      const opts = { prompt: `Você é um especialista em relatórios de prestação de contas culturais para a Prefeitura de Belo Horizonte. Seja conciso, objetivo e formal. Não invente dados.\n\n${prompt}` };
      if (schema) opts.response_json_schema = schema;
      const res = await base44.integrations.Core.InvokeLLM(opts);
      return res;
    }

    // ── Gerar seção específica ──────────────────────────────────
    switch (secao) {

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
          email: user.email || ''
        };
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { identificacao_projeto: ident });
        return Response.json({ success: true, secao, data: ident });
      }

      case 'endereco_execucao': {
        const ctx = await coletarContexto();
        const museusAtivos = [...new Set(ctx.atividades.map(a => a.museu).filter(Boolean))];
        const texto = await chamarIA(
          `CONTEXTO: ${JSON.stringify({ museus_ativos: museusAtivos, atividades: ctx.atividades.slice(0, 20) })}\n\n` +
          `Gere a seção "ENDEREÇO DE EXECUÇÃO". Liste os endereços oficiais dos museus ativos:\n` +
          `- MHAB: Av. Otacílio Negrão de Lima, 1650 – Pampulha, BH/MG\n- MIS: Av. Afonso Pena, 800 – Centro, BH/MG\n- MUMO: Praça da Liberdade, s/n – Funcionários, BH/MG\n- Casa Kubitschek: Av. Otacílio Negrão de Lima, 600 – Pampulha, BH/MG\n- Casa do Baile: Av. Otacílio Negrão de Lima, 751 – Pampulha, BH/MG\n- MAP: Av. Afonso Pena, 837 – Centro, BH/MG\nRetorne APENAS o texto formatado.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { endereco_execucao: { texto_ia: txt, texto_editado: '', modo: 'ia' } });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      case 'divulgacao': {
        const ctx = await coletarContexto();
        const texto = await chamarIA(
          `CONTEXTO: releases=${ctx.releases.length}, programacoes=${ctx.programacoes.length}\nReleases: ${JSON.stringify(ctx.releases)}\n\n` +
          `Gere a seção "DIVULGAÇÃO DA PARCERIA". Descreva divulgação institucional entre Viaduto das Artes e PBH: redes sociais, site, releases, clipping, materiais gráficos. Máximo 1200 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { divulgacao_parceria: { texto_ia: txt, texto_editado: '', modo: 'ia' } });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      case 'descricao_acoes': {
        const ctx = await coletarContexto();
        const texto = await chamarIA(
          `CONTEXTO: ${ctx.total_atividades} atividades, ${ctx.programacoes.length} programações\n${JSON.stringify({ atividades: ctx.atividades.slice(0, 15), programacoes: ctx.programacoes.slice(0, 10) })}\n\n` +
          `Gere a seção "DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS". Resuma ações: atividades, eventos, exposições, educativo, cultural, Noturno. Destaque números. Máximo 1500 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { descricao_acoes: { texto_ia: txt, texto_editado: '', modo: 'ia' } });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      case 'publico_alvo': {
        const ctx = await coletarContexto();
        const pd = 50000, pi = 150000, rd = ctx.publico_total, ri = Math.round(ctx.publico_total * 2.5);
        const texto = await chamarIA(
          `DADOS: Previsto direto=${pd}, Realizado direto=${rd} (${Math.round(rd/pd*100)}%), Previsto indireto=${pi}, Realizado indireto=${ri}, Diferença=${rd-pd}\n\n` +
          `Gere texto interpretativo de 2 parágrafos sobre o público. Analise se satisfatório. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        const publ = {
          previsto_direto: pd, previsto_indireto: pi,
          realizado_direto: rd, realizado_indireto: ri,
          diferenca_direto: rd - pd, diferenca_indireto: ri - pi,
          percentual_direto: Math.round(rd / pd * 100), percentual_indireto: Math.round(ri / pi * 100),
          texto_interpretativo_ia: txt, texto_interpretativo_editado: '', modo: 'ia'
        };
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { publico_alvo: publ });
        return Response.json({ success: true, secao, data: publ });
      }

      case 'pesquisa_satisfacao': {
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
          pesquisa_satisfacao: { possui_dados: false, justificativa_ia: 'Não foram aplicados formulários de pesquisa de satisfação neste período.', justificativa_editada: '', modo: 'ia' }
        });
        return Response.json({ success: true, secao, data: { possui_dados: false } });
      }

      case 'cronograma_metas': {
        const ctx = await coletarContexto();
        const cronograma = [];

        for (const meta of ctx.metas) {
          const atvsDaMeta = ctx.atividades.filter(a =>
            a.meta && meta.nome && (a.meta.includes(meta.nome.substring(0, 8)) || meta.nome.includes(a.meta?.substring(0, 8)))
          );

          try {
            const analise = await chamarIA(
              `Meta: "${meta.nome}" (${meta.descricao || ''})\nAtividades: ${JSON.stringify(atvsDaMeta.slice(0, 8))}\n\n` +
              `Retorne JSON: resultado_esperado, acoes, periodo, resultado_alcancado, status_meta ("Realizada Integralmente"|"Realizada Parcialmente"|"Não Realizada"), percentual_execucao (0-100), justificativa`,
              { type: 'object', properties: {
                resultado_esperado: { type: 'string' }, acoes: { type: 'string' },
                periodo: { type: 'string' }, resultado_alcancado: { type: 'string' },
                status_meta: { type: 'string' }, percentual_execucao: { type: 'number' },
                justificativa: { type: 'string' }
              }, required: ['resultado_esperado', 'acoes', 'status_meta', 'percentual_execucao'] }
            );
            cronograma.push({
              meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
              resultado_esperado: analise.resultado_esperado || '',
              acoes: analise.acoes || '', periodo: analise.periodo || `${dInicio} a ${dFim}`,
              documentos_verificacao: [], resultado_alcancado: analise.resultado_alcancado || '',
              status_meta: analise.status_meta || 'Realizada Parcialmente',
              percentual_execucao: analise.percentual_execucao || 0,
              justificativa: analise.justificativa || '', modo: 'ia'
            });
          } catch (e) {
            cronograma.push({
              meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
              resultado_esperado: meta.descricao || '',
              acoes: `${atvsDaMeta.length} atividades`, periodo: `${dInicio} a ${dFim}`,
              documentos_verificacao: [], resultado_alcancado: '',
              status_meta: atvsDaMeta.length > 0 ? 'Realizada Parcialmente' : 'Não Realizada',
              percentual_execucao: 0, justificativa: '', modo: 'ia'
            });
          }
        }

        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { cronograma_metas: cronograma });
        return Response.json({ success: true, secao, data: { total_metas: cronograma.length } });
      }

      case 'equipe_trabalho': {
        const ctx = await coletarContexto();
        const equipe = ctx.equipe.map(t => ({
          nome: t.nome || '', cargo: t.cargo || '',
          tipo_contratacao: t.tipo_contratacao || 'Pessoa Jurídica',
          carga_horaria: t.carga_horaria?.toString() || '',
          valor: t.valor || 0, periodo: `${dInicio} a ${dFim}`, modo: 'ia'
        }));
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { equipe_trabalho: equipe });
        return Response.json({ success: true, secao, data: { total: equipe.length } });
      }

      case 'impactos': {
        const ctx = await coletarContexto();
        const texto = await chamarIA(
          `DADOS: Público=${ctx.publico_total}, Atividades=${ctx.total_atividades}, Solicitações=${ctx.total_solicitacoes} (R$${ctx.valor_solicitacoes.toFixed(2)}), Museus=${museu}\n\n` +
          `Gere "IMPACTOS ECONÔMICOS E SOCIAIS": inclusão, acessibilidade, formação de público, economia criativa, turismo cultural, patrimônio. Máximo 2000 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { impactos_economicos_sociais: { texto_ia: txt, texto_editado: '', modo: 'ia' } });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      case 'sustentabilidade': {
        const texto = await chamarIA(
          `Gere "SUSTENTABILIDADE" do relatório final do projeto Museus Centro: continuidade, legado, parcerias, capacidade instalada. Máximo 1000 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { sustentabilidade: { texto_ia: txt, texto_editado: '', modo: 'ia' } });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      case 'avaliacao': {
        const ctx = await coletarContexto();
        const texto = await chamarIA(
          `CONTEXTO: ${ctx.total_atividades} atividades, metas: ${ctx.metas.length}\n` +
          `Gere "AVALIAÇÃO DA PARCERIA" Viaduto das Artes × PBH/SUCC: execução, desafios, aprendizados, gargalos, recomendações. Máximo 1500 caracteres. Retorne APENAS o texto.`
        );
        const txt = typeof texto === 'string' ? texto : '';
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { avaliacao_parceria: { texto_ia: txt, texto_editado: '', modo: 'ia' } });
        return Response.json({ success: true, secao, data: { texto_ia: txt } });
      }

      case 'assinatura': {
        const ass = { nome_representante: user.full_name || '', cargo: 'Coordenador Geral', data: new Date().toISOString().split('T')[0], modo: 'ia' };
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { assinatura: ass });
        return Response.json({ success: true, secao, data: ass });
      }

      case 'anexos': {
        const fotos = await srv.entities.Attachment.filter({ file_type: { $regex: '^image/' } });
        const anexos = fotos.slice(0, 30).map(f => ({
          foto_url: f.file_url || '', atividade_nome: f.description || 'Evidência',
          atividade_data: f.created_date?.split('T')[0] || '', local: '', meta_nome: '',
          legenda_ia: f.description || 'Foto anexada como evidência', legenda_editada: ''
        }));
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { anexos_evidencias: anexos });
        return Response.json({ success: true, secao, data: { total: anexos.length } });
      }

      case 'auditoria': {
        const rel = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
        const pendencias = [];
        const crono = rel.cronograma_metas || [];
        for (const m of crono) {
          if ((m.percentual_execucao || 0) < 50) {
            pendencias.push({ tipo: 'meta_sem_evidencia', descricao: `Meta "${m.meta_nome}" com baixa execução (${m.percentual_execucao || 0}%)`, resolvida: false });
          }
        }
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { auditoria_pendencias: pendencias });
        return Response.json({ success: true, secao, data: { pendencias: pendencias.length } });
      }

      case 'finalizar': {
        await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { status: 'revisao' });
        return Response.json({ success: true, secao, data: { status: 'revisao' } });
      }

      default:
        return Response.json({ error: `Seção desconhecida: ${secao}` }, { status: 400 });
    }

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});