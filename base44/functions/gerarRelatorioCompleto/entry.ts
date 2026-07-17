/**
 * gerarRelatorioCompleto
 * 
 * Estratégia de geração em etapas:
 * - Coleta TODOS os dados reais: relatórios da equipe, atividades, fotos, NFs, rubricas, metas
 * - Gera textos densos por IA com citações reais de cada relatório individual
 * - Vincula fotos comprovando cada atividade e meta
 * - Retorna progresso incremental para o front acompanhar
 * 
 * Payload: { relatorio_id, etapa, data_inicio, data_fim, filtro_museu, filtro_meta_ids }
 * etapa: 'contexto' | 'textos_principais' | 'metas_detalhadas' | 'equipe_financeiro' | 'fotos_evidencias' | 'finalizar'
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      relatorio_id,
      etapa = 'contexto',
      data_inicio,
      data_fim,
      filtro_museu = 'todos',
      filtro_meta_ids = [],
    } = body;

    if (!relatorio_id) return Response.json({ error: 'relatorio_id obrigatório' }, { status: 400 });

    const srv = base44.asServiceRole;
    const relatorio = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
    if (!relatorio) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    const dInicio = data_inicio || relatorio.data_inicio;
    const dFim = data_fim || relatorio.data_fim;
    const museu = filtro_museu !== 'todos' ? filtro_museu : null;

    // ── Utilitários ──────────────────────────────────────────────────────────
    function fmtBRL(v) {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
    }

    function parseValor(p) {
      const v = p.valor_aprovado_admin ?? p.valor_pago ?? p.valor_solicitado ?? 0;
      return typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;
    }

    async function chamarIA(prompt, schema = null) {
      const instrucao = `Você é especialista em relatórios de prestação de contas culturais para a Prefeitura de Belo Horizonte (PBH/SUCC/FMC).

REGRAS:
1. NUNCA invente dados, números, nomes ou eventos não fornecidos.
2. Use SOMENTE o contexto fornecido.
3. Linguagem técnica, cultural, institucional, português correto.
4. Textos densos, ricos em detalhes, usando as citações e dados fornecidos.
5. Cite profissionais, atividades, museus e resultados pelo nome quando presentes.
6. Não use caixa alta desnecessária nem jargão burocrático vazio.

`;
      const opts = { prompt: instrucao + prompt };
      if (schema) opts.response_json_schema = schema;
      return await base44.integrations.Core.InvokeLLM(opts);
    }

    // ── ETAPA 1: CONTEXTO — coleta todos os dados reais ──────────────────────
    if (etapa === 'contexto') {
      const [
        reports, activities, purchases, rubricas, metas,
        teamMembers, reportPhotos, programacoes, releases, lancamentos
      ] = await Promise.all([
        srv.entities.Report.filter({
          status: { $in: ['APPROVED', 'SUBMITTED', 'IN_REVIEW'] },
        }, '-updated_date', 200),
        srv.entities.Activity.filter({
          data_realizacao: { $gte: dInicio, $lte: dFim },
        }, '-data_realizacao', 500),
        srv.entities.PurchaseRequest.filter({
          status: { $in: ['APROVADO_ADMIN', 'PAGO'] },
          incluir_no_somatorio: { $ne: false },
        }, '-created_date', 500),
        srv.entities.Rubrica.filter({ ativo: true }),
        srv.entities.ProjectMeta.list(),
        srv.entities.TeamMember.filter({ status: 'ATIVO' }),
        srv.entities.ReportPhoto.filter({ galeria_oculta: false }, '-created_date', 500),
        srv.entities.Programacao.filter({ data: { $gte: dInicio, $lte: dFim } }),
        srv.entities.Release.list('-data_publicacao', 50),
        srv.entities.LancamentoRubrica.list('-created_date', 1000).catch(() => []),
      ]);

      // Filtrar atividades por museu
      const atvsMuseu = museu
        ? activities.filter(a => (a.museu || '').includes(museu) || (a.centro_custo || '').includes(museu) || (a.equipe || '').toLowerCase().includes(museu.toLowerCase()))
        : activities;

      // Filtrar metas
      const metasFiltradas = filtro_meta_ids.length > 0
        ? metas.filter(m => filtro_meta_ids.includes(m.id))
        : metas.filter(m => m.ativo !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // Relatórios aprovados do período com resumos da equipe
      const reportsNoPeriodo = reports.filter(r => {
        if (!r.mes_referencia && !r.ano) return false;
        const ano = r.ano || new Date(dInicio).getFullYear();
        const anoInicio = new Date(dInicio).getFullYear();
        const anoFim = new Date(dFim).getFullYear();
        return ano >= anoInicio && ano <= anoFim;
      });

      // Citações reais dos relatórios da equipe
      const citacoesEquipe = reportsNoPeriodo.slice(0, 30).map(r => ({
        autor: r.author_name || 'Profissional',
        funcao: r.funcao || r.author_role || '',
        museu: r.museu || '',
        mes: r.mes_referencia || '',
        ano: r.ano || '',
        resumo: r.resumo_periodo || r.resumo_executivo || '',
        destaques: r.avaliacao_pontos_positivos || '',
        desafios: r.avaliacao_desafios || '',
        total_atividades: (r.atividades || []).length,
      }));

      // Totais financeiros auditados
      const totalAprovado = purchases.reduce((s, p) => s + parseValor(p), 0);
      const totalRubricasPrevisto = rubricas.reduce((s, r) => s + (r.valor_rubrica || r.valor_total || 0), 0);
      const totalRubricasUtilizado = rubricas.reduce((s, r) => s + (r.valor_utilizado || 0), 0);

      // NFs por meta
      const nfsPorMeta = {};
      for (const p of purchases) {
        const mid = p.meta_id || 'sem_meta';
        if (!nfsPorMeta[mid]) nfsPorMeta[mid] = { total: 0, count: 0, itens: [] };
        nfsPorMeta[mid].total += parseValor(p);
        nfsPorMeta[mid].count++;
        if (nfsPorMeta[mid].itens.length < 5) {
          nfsPorMeta[mid].itens.push({
            numero: p.nf_numero,
            fornecedor: p.nf_emitente_nome || p.fornecedor_nome,
            valor: parseValor(p),
            descricao: p.descricao_item,
          });
        }
      }

      // Rubricas agrupadas por meta/grupo
      const rubricasPorGrupo = {};
      for (const r of rubricas) {
        const grp = r.grupo || 'Geral';
        if (!rubricasPorGrupo[grp]) rubricasPorGrupo[grp] = { previsto: 0, utilizado: 0, saldo: 0, rubricas: [] };
        rubricasPorGrupo[grp].previsto += r.valor_rubrica || r.valor_total || 0;
        rubricasPorGrupo[grp].utilizado += r.valor_utilizado || 0;
        rubricasPorGrupo[grp].saldo += (r.saldo || (r.valor_rubrica || 0) - (r.valor_utilizado || 0));
        if (rubricasPorGrupo[grp].rubricas.length < 8) {
          rubricasPorGrupo[grp].rubricas.push({
            nome: r.rubrica || r.nome,
            natureza: r.natureza_despesa,
            previsto: r.valor_rubrica || r.valor_total || 0,
            utilizado: r.valor_utilizado || 0,
            saldo: r.saldo || (r.valor_rubrica || 0) - (r.valor_utilizado || 0),
          });
        }
      }

      // Fotos indexadas por report_id e meta_id
      const fotosPorMeta = {};
      const fotosPorReport = {};
      for (const f of reportPhotos) {
        if (!f.file_url) continue;
        if (f.meta_id) {
          if (!fotosPorMeta[f.meta_id]) fotosPorMeta[f.meta_id] = [];
          if (fotosPorMeta[f.meta_id].length < 8) {
            fotosPorMeta[f.meta_id].push({ url: f.file_url, legenda: f.caption || f.legenda || '', museu: f.museu || '', mes: f.mes_referencia || '' });
          }
        }
        if (f.report_id) {
          if (!fotosPorReport[f.report_id]) fotosPorReport[f.report_id] = [];
          if (fotosPorReport[f.report_id].length < 6) {
            fotosPorReport[f.report_id].push({ url: f.file_url, legenda: f.caption || f.legenda || '' });
          }
        }
      }

      // Atividades enriquecidas com fotos e resultados
      const atvsEnriquecidas = atvsMuseu.map(a => {
        const fotosAtv = reportPhotos.filter(f =>
          f.report_id === a.report_id &&
          (f.caption || f.legenda || '').toLowerCase().includes((a.titulo || '').toLowerCase().substring(0, 10))
        ).slice(0, 3).map(f => ({ url: f.file_url, legenda: f.caption || f.legenda || '' }));

        return {
          id: a.id,
          titulo: a.titulo,
          descricao: a.descricao || '',
          data: a.data_realizacao || a.data_inicio,
          museu: a.museu || a.centro_custo || '',
          meta_id: a.meta_id || '',
          meta_codigo: a.meta_codigo || '',
          classificacao: a.classificacao,
          publico_total: a.publico_total || 0,
          quantas_repeticoes: a.quantas_repeticoes || 1,
          resultado_alcancado: a.resultado_alcancado || '',
          status_meta: a.status_meta || '',
          indicador_previsto: a.indicador_previsto || '',
          meta_quantitativa: a.meta_quantitativa || '',
          equipe_responsavel: a.equipe_responsavel || '',
          acessibilidade: a.acessibilidade || 'Não',
          parceria: a.parceria || 'Não',
          parceiro_nome: a.parceiro_nome || '',
          produtos_entregues: a.produtos_entregues || [],
          houve_contratacoes: a.houve_contratacoes || false,
          numero_trabalhadores: a.numero_trabalhadores || 0,
          fotos: fotosAtv,
          report_id: a.report_id,
        };
      });

      // Totais de público
      const publicoTotal = atvsEnriquecidas.reduce((s, a) => s + (a.publico_total || 0), 0);
      const museus_ativos = [...new Set(atvsEnriquecidas.map(a => a.museu).filter(Boolean))];

      // Salvar contexto no relatório para as próximas etapas
      const contexto = {
        citacoesEquipe,
        atvsEnriquecidas: atvsEnriquecidas.slice(0, 200),
        metasFiltradas,
        rubricasPorGrupo,
        nfsPorMeta,
        totalAprovado,
        totalRubricasPrevisto,
        totalRubricasUtilizado,
        publicoTotal,
        museus_ativos,
        total_atividades: atvsEnriquecidas.length,
        total_reports: reportsNoPeriodo.length,
        total_team: teamMembers.length,
        total_fotos: reportPhotos.length,
        total_programacoes: programacoes.length,
        fotosPorMeta,
        equipe: teamMembers.map(t => ({
          nome: t.user_name || t.nome || '',
          cargo: t.funcao || t.cargo_representante || '',
          tipo_pessoa: t.tipo_pessoa || 'PF',
          museu_projeto: t.museu_projeto || '',
          valor_total: t.valor_total || 0,
          numero_parcelas: t.numero_parcelas || 0,
          data_inicio: t.data_inicio_contrato || dInicio,
          data_fim: t.data_fim_contrato || dFim,
          status_contrato: t.status_contrato || 'VIGENTE',
        })),
        fotos_amostra: reportPhotos.slice(0, 80).map(f => ({
          url: f.file_url,
          legenda: f.caption || f.legenda || '',
          museu: f.museu || '',
          mes: f.mes_referencia || '',
          meta_id: f.meta_id || '',
          report_id: f.report_id || '',
        })),
        programacoes: programacoes.map(p => ({ titulo: p.titulo, data: p.data, local: p.local || '', tipo: p.tipo || '' })),
        releases: releases.slice(0, 20).map(r => ({ titulo: r.titulo, data: r.data_publicacao, veiculo: r.veiculo || '' })),
        gerado_em: new Date().toISOString(),
      };

      // Persistir contexto no relatório (campo auxiliar)
      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        _contexto_geracao: contexto,
        _total_financeiro: totalAprovado,
        _total_financeiro_fmt: fmtBRL(totalAprovado),
        _atividades_periodo: atvsEnriquecidas.slice(0, 100),
        _notas_fiscais_metas: Object.values(nfsPorMeta).flatMap(m => m.itens || []).slice(0, 100),
      });

      return Response.json({
        success: true,
        etapa,
        resumo: {
          total_atividades: atvsEnriquecidas.length,
          total_reports: reportsNoPeriodo.length,
          total_metas: metasFiltradas.length,
          publicoTotal,
          totalAprovado: fmtBRL(totalAprovado),
          museus_ativos,
          total_fotos: reportPhotos.length,
          total_team: teamMembers.length,
        },
      });
    }

    // ── ETAPA 2: TEXTOS PRINCIPAIS (Endereço, Divulgação, Descrição, Público) ─
    if (etapa === 'textos_principais') {
      const ctx = relatorio._contexto_geracao;
      if (!ctx) return Response.json({ error: 'Execute etapa "contexto" primeiro.' }, { status: 400 });

      const citacoesTexto = ctx.citacoesEquipe?.slice(0, 10).map(c =>
        `• ${c.autor} (${c.funcao || 'profissional'}, ${c.museu}/${c.mes}): "${(c.resumo || c.destaques || '').slice(0, 200)}"`
      ).join('\n') || '';

      const atvsResumo = ctx.atvsEnriquecidas?.slice(0, 40).map(a =>
        `${a.data || ''} | ${a.museu} | ${a.classificacao} | ${a.titulo} | Público: ${a.publico_total} | Meta: ${a.meta_codigo || 'Rotina'}`
      ).join('\n') || '';

      const [descAcoes, divulgacao, impactos, avaliacao] = await Promise.all([
        // Descrição das ações — densa, com citações reais
        chamarIA(
          `PERÍODO: ${dInicio} a ${dFim}\n` +
          `MUSEUS ATIVOS: ${(ctx.museus_ativos || []).join(', ')}\n` +
          `TOTAL DE ATIVIDADES REGISTRADAS: ${ctx.total_atividades}\n` +
          `PÚBLICO TOTAL ALCANÇADO: ${ctx.publicoTotal}\n` +
          `PROFISSIONAIS CONTRATADOS: ${ctx.total_team}\n` +
          `PROGRAMAÇÕES REALIZADAS: ${ctx.total_programacoes}\n` +
          `RELATÓRIOS MENSAIS APROVADOS DA EQUIPE: ${ctx.total_reports}\n\n` +
          `ATIVIDADES (amostra):\n${atvsResumo}\n\n` +
          `DEPOIMENTOS E REGISTROS DA EQUIPE:\n${citacoesTexto}\n\n` +
          `Gere a seção "DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS" em linguagem técnico-cultural institucional. ` +
          `Organize por museu/área. Use as citações e registros da equipe como evidência. ` +
          `Seja denso e específico: mencione atividades, datas, museus e resultados reais. ` +
          `Máximo 2.500 caracteres.`
        ),
        // Divulgação
        chamarIA(
          `RELEASES NO PERÍODO: ${(ctx.releases || []).length}\n` +
          `PROGRAMAÇÕES COM DIVULGAÇÃO: ${ctx.total_programacoes}\n` +
          `RELEASES: ${JSON.stringify((ctx.releases || []).slice(0, 8))}\n` +
          `PROGRAMAÇÕES: ${JSON.stringify((ctx.programacoes || []).slice(0, 8))}\n\n` +
          `Gere a seção "DIVULGAÇÃO DA PARCERIA" descrevendo as ações de comunicação e visibilidade ` +
          `com base nos dados reais. Mencione veículos, eventos divulgados e materiais produzidos. ` +
          `Máximo 1.500 caracteres.`
        ),
        // Impactos econômicos
        chamarIA(
          `PÚBLICO TOTAL: ${ctx.publicoTotal}\n` +
          `ATIVIDADES REALIZADAS: ${ctx.total_atividades}\n` +
          `PROFISSIONAIS CONTRATADOS: ${ctx.total_team}\n` +
          `VALOR TOTAL APROVADO (NFs): ${fmtBRL(ctx.totalAprovado || 0)}\n` +
          `VALOR PREVISTO (RUBRICAS): ${fmtBRL(ctx.totalRubricasPrevisto || 0)}\n` +
          `VALOR EXECUTADO (RUBRICAS): ${fmtBRL(ctx.totalRubricasUtilizado || 0)}\n` +
          `MUSEUS ENVOLVIDOS: ${(ctx.museus_ativos || []).join(', ')}\n` +
          `PROGRAMAÇÕES: ${ctx.total_programacoes}\n\n` +
          `Gere "IMPACTOS ECONÔMICOS E SOCIAIS". Aborde: inclusão cultural, formação de público, ` +
          `cadeia produtiva da cultura, geração de renda, turismo cultural, patrimônio imaterial. ` +
          `Use os valores financeiros reais informados. Máximo 2.000 caracteres.`
        ),
        // Avaliação da parceria
        chamarIA(
          `ATIVIDADES: ${ctx.total_atividades}\n` +
          `METAS ACOMPANHADAS: ${(ctx.metasFiltradas || []).length}\n` +
          `RELATÓRIOS APROVADOS: ${ctx.total_reports}\n` +
          `EQUIPE: ${ctx.total_team} profissionais\n` +
          `MUSEUS: ${(ctx.museus_ativos || []).join(', ')}\n` +
          `PREVISTO: ${fmtBRL(ctx.totalRubricasPrevisto || 0)}\n` +
          `EXECUTADO: ${fmtBRL(ctx.totalRubricasUtilizado || 0)}\n` +
          `% EXECUÇÃO: ${ctx.totalRubricasPrevisto > 0 ? Math.round((ctx.totalRubricasUtilizado / ctx.totalRubricasPrevisto) * 100) : 0}%\n` +
          `NFs APROVADAS: ${fmtBRL(ctx.totalAprovado || 0)}\n` +
          `FOTOS REGISTRADAS: ${ctx.total_fotos}\n\n` +
          `Gere "AVALIAÇÃO DA PARCERIA" entre Viaduto das Artes e PBH/SUCC. ` +
          `Aborde: cumprimento do plano, execução financeira real, desafios, aprendizados, recomendações. ` +
          `Máximo 1.800 caracteres.`
        ),
      ]);

      // Público-alvo calculado
      const pd = relatorio.publico_alvo?.previsto_direto || 50000;
      const pi = relatorio.publico_alvo?.previsto_indireto || 150000;
      const rd = ctx.publicoTotal || 0;
      const ri = Math.round(rd * 2.5);
      const publico = {
        previsto_direto: pd, previsto_indireto: pi,
        realizado_direto: rd, realizado_indireto: ri,
        diferenca_direto: rd - pd, diferenca_indireto: ri - pi,
        percentual_direto: pd > 0 ? Math.round(rd / pd * 100) : 0,
        percentual_indireto: pi > 0 ? Math.round(ri / pi * 100) : 0,
        texto_interpretativo_ia: '', texto_interpretativo_editado: '', modo: 'ia',
      };

      // Endereços oficiais
      const enderecos = {
        'MHAB': 'Museu Histórico Abílio Barreto (MHAB) — Av. Prudente de Morais, 202 – Cidade Jardim, BH/MG – CEP 30.380-000',
        'MIS': 'Museu da Imagem e do Som (MIS BH) — Av. Afonso Pena, 1520 – Centro, BH/MG – CEP 30.130-921',
        'MUMO': 'Museu da Moda de BH (MUMO) – Rua da Bahia, 1149 – Centro, BH/MG – CEP 30.160-011',
        'Casa Kubitschek': 'Casa Kubitschek — Av. João Antônio Alves, 90 – Pampulha, BH/MG',
        'Casa do Baile': 'Casa do Baile — Av. Otacílio Negrão de Lima, 751 – Pampulha, BH/MG',
        'MAP': 'Museu de Arte da Pampulha (MAP) — Av. Otacílio Negrão de Lima, 16.585 – Pampulha, BH/MG',
      };
      const museusAtivos = (ctx.museus_ativos || []).length > 0 ? ctx.museus_ativos : Object.keys(enderecos);
      const endTxt = museusAtivos.map(m => {
        const k = Object.keys(enderecos).find(k => m.includes(k) || k.includes(m));
        return k ? enderecos[k] : null;
      }).filter(Boolean).join('\n');

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        descricao_acoes: { texto_ia: typeof descAcoes === 'string' ? descAcoes : '', texto_editado: '', modo: 'ia' },
        divulgacao_parceria: { texto_ia: typeof divulgacao === 'string' ? divulgacao : '', texto_editado: '', modo: 'ia' },
        impactos_economicos_sociais: { texto_ia: typeof impactos === 'string' ? impactos : '', texto_editado: '', modo: 'ia' },
        avaliacao_parceria: { texto_ia: typeof avaliacao === 'string' ? avaliacao : '', texto_editado: '', modo: 'ia' },
        publico_alvo: publico,
        endereco_execucao: { texto_ia: endTxt, texto_editado: '', modo: 'ia' },
        pesquisa_satisfacao: {
          possui_dados: false,
          justificativa_ia: 'Não foram localizados registros de pesquisa de satisfação aplicada no período. Formulários de avaliação serão implementados nas próximas edições das programações.',
          justificativa_editada: '', modo: 'ia',
        },
      });

      return Response.json({ success: true, etapa, campos_gerados: 6 });
    }

    // ── ETAPA 3: METAS DETALHADAS — cada meta com atividades + fotos + NFs ───
    if (etapa === 'metas_detalhadas') {
      const ctx = relatorio._contexto_geracao;
      if (!ctx) return Response.json({ error: 'Execute etapa "contexto" primeiro.' }, { status: 400 });

      const cronograma = [];
      const metasFiltradas = ctx.metasFiltradas || [];

      for (const meta of metasFiltradas) {
        // Atividades desta meta
        const atvsComMeta = (ctx.atvsEnriquecidas || []).filter(a =>
          (a.meta_id && a.meta_id === meta.id) ||
          (a.meta_codigo && meta.nome && (
            a.meta_codigo === meta.nome ||
            meta.nome.toLowerCase().includes((a.meta_codigo || '').toLowerCase().substring(0, 8))
          ))
        );

        // Fotos da meta (do índice por meta_id)
        const fotosMetaDiretas = (ctx.fotosPorMeta || {})[meta.id] || [];
        // Fotos dos relatórios das atividades desta meta
        const fotosAtvsRelatorios = atvsComMeta.flatMap(a => a.fotos || []);
        const todasFotosMeta = [...fotosMetaDiretas, ...fotosAtvsRelatorios]
          .filter((f, i, arr) => f.url && arr.findIndex(x => x.url === f.url) === i)
          .slice(0, 6);

        const publicoMeta = atvsComMeta.reduce((s, a) => s + (a.publico_total || 0), 0);
        const resultadosAlcancados = atvsComMeta
          .filter(a => a.resultado_alcancado)
          .map(a => a.resultado_alcancado)
          .join('; ');

        // Financeiro da meta
        const nfMeta = (ctx.nfsPorMeta || {})[meta.id] || { total: 0, count: 0, itens: [] };
        const rubricasMeta = Object.entries(ctx.rubricasPorGrupo || {})
          .filter(([grp]) => meta.nome && grp.toLowerCase().includes(meta.nome.toLowerCase().substring(0, 12)))
          .map(([, v]) => v);
        const previstoDaMeta = rubricasMeta.reduce((s, r) => s + (r.previsto || 0), 0);
        const utilizadoDaMeta = rubricasMeta.reduce((s, r) => s + (r.utilizado || 0), 0);

        // Citações da equipe sobre esta meta
        const citacoesMetaEquipe = (ctx.citacoesEquipe || [])
          .filter(c => meta.nome && ((c.resumo || '') + (c.destaques || '')).toLowerCase().includes(meta.nome.toLowerCase().substring(0, 10)))
          .slice(0, 3)
          .map(c => `${c.autor} (${c.museu}): "${(c.resumo || c.destaques || '').slice(0, 150)}"`)
          .join('\n');

        let entrada;

        if (atvsComMeta.length === 0) {
          entrada = {
            meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
            resultado_esperado: meta.descricao || '',
            acoes: 'Nenhuma atividade registrada para esta meta no período.',
            periodo: `${dInicio} a ${dFim}`,
            documentos_verificacao: todasFotosMeta.map(f => f.url).filter(Boolean),
            resultado_alcancado: 'Sem registros no período.',
            status_meta: 'Não Realizada',
            percentual_execucao: 0,
            justificativa: 'Não foram localizadas atividades vinculadas a esta meta no período consultado.',
            valor_previsto: previstoDaMeta,
            valor_realizado: utilizadoDaMeta || nfMeta.total,
            fotos_evidencia: todasFotosMeta,
            modo: 'ia',
          };
        } else {
          const descAtividades = atvsComMeta.slice(0, 10).map(a =>
            `• ${a.data || ''}: ${a.titulo} — Público: ${a.publico_total} — ${a.resultado_alcancado || a.status_meta || ''} — Museu: ${a.museu}`
          ).join('\n');

          try {
            const analise = await chamarIA(
              `META: "${meta.nome}"\n` +
              `DESCRIÇÃO DA META: ${meta.descricao || ''}\n\n` +
              `ATIVIDADES REALIZADAS (${atvsComMeta.length}):\n${descAtividades}\n\n` +
              `PÚBLICO ALCANÇADO: ${publicoMeta}\n` +
              `RESULTADOS REGISTRADOS: ${resultadosAlcancados || 'ver atividades'}\n` +
              `VALOR PREVISTO NAS RUBRICAS: ${fmtBRL(previstoDaMeta)}\n` +
              `VALOR UTILIZADO/APROVADO: ${fmtBRL(utilizadoDaMeta || nfMeta.total)}\n` +
              `NOTAS FISCAIS VINCULADAS: ${nfMeta.count}\n` +
              (citacoesMetaEquipe ? `\nCITAÇÕES DA EQUIPE SOBRE ESTA META:\n${citacoesMetaEquipe}\n` : '') +
              `\nRetorne JSON com: resultado_esperado (do plano de trabalho), ` +
              `acoes (descrição densa das ações realizadas, citando atividades específicas), ` +
              `periodo, resultado_alcancado (dados reais), ` +
              `status_meta ("Realizada Integralmente" | "Realizada Parcialmente" | "Não Realizada"), ` +
              `percentual_execucao (0-100), justificativa (se necessário).`,
              {
                type: 'object',
                properties: {
                  resultado_esperado: { type: 'string' },
                  acoes: { type: 'string' },
                  periodo: { type: 'string' },
                  resultado_alcancado: { type: 'string' },
                  status_meta: { type: 'string' },
                  percentual_execucao: { type: 'number' },
                  justificativa: { type: 'string' },
                },
                required: ['acoes', 'status_meta', 'percentual_execucao'],
              }
            );

            entrada = {
              meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
              resultado_esperado: analise.resultado_esperado || meta.descricao || '',
              acoes: analise.acoes || `${atvsComMeta.length} atividades realizadas`,
              periodo: analise.periodo || `${dInicio} a ${dFim}`,
              documentos_verificacao: todasFotosMeta.map(f => f.url).filter(Boolean),
              resultado_alcancado: analise.resultado_alcancado || resultadosAlcancados || '',
              status_meta: analise.status_meta || 'Realizada Parcialmente',
              percentual_execucao: analise.percentual_execucao || 0,
              justificativa: analise.justificativa || '',
              valor_previsto: previstoDaMeta,
              valor_realizado: utilizadoDaMeta || nfMeta.total,
              fotos_evidencia: todasFotosMeta,
              nfs_vinculadas: nfMeta.itens || [],
              modo: 'ia',
            };
          } catch {
            entrada = {
              meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
              resultado_esperado: meta.descricao || '',
              acoes: `${atvsComMeta.length} atividades: ${atvsComMeta.slice(0, 3).map(a => a.titulo).join(', ')}`,
              periodo: `${dInicio} a ${dFim}`,
              documentos_verificacao: todasFotosMeta.map(f => f.url).filter(Boolean),
              resultado_alcancado: resultadosAlcancados || `${atvsComMeta.length} atividades — público: ${publicoMeta}`,
              status_meta: atvsComMeta.length >= 3 ? 'Realizada Integralmente' : 'Realizada Parcialmente',
              percentual_execucao: Math.min(100, atvsComMeta.length * 15),
              justificativa: '',
              valor_previsto: previstoDaMeta,
              valor_realizado: utilizadoDaMeta || nfMeta.total,
              fotos_evidencia: todasFotosMeta,
              nfs_vinculadas: nfMeta.itens || [],
              modo: 'ia',
            };
          }
        }

        cronograma.push(entrada);
      }

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { cronograma_metas: cronograma });
      return Response.json({ success: true, etapa, total_metas: cronograma.length });
    }

    // ── ETAPA 4: EQUIPE E FINANCEIRO ─────────────────────────────────────────
    if (etapa === 'equipe_financeiro') {
      const ctx = relatorio._contexto_geracao;
      if (!ctx) return Response.json({ error: 'Execute etapa "contexto" primeiro.' }, { status: 400 });

      // Equipe com dados reais
      const equipe = (ctx.equipe || []).map(t => ({
        nome: t.nome,
        cargo: t.cargo || 'Profissional',
        tipo_contratacao: t.tipo_pessoa === 'PF' ? 'Pessoa Física (RPA)' : t.tipo_pessoa === 'MEI' ? 'MEI' : 'Pessoa Jurídica',
        carga_horaria: '',
        valor: t.valor_total || 0,
        periodo: `${t.data_inicio || dInicio} a ${t.data_fim || dFim}`,
        modo: 'ia',
      }));

      // Rubricas para exportação no PDF
      const rubricasPeriodo = Object.entries(ctx.rubricasPorGrupo || {}).flatMap(([grupo, data]) =>
        (data.rubricas || []).map(r => ({
          rubrica_nome: r.nome,
          grupo,
          natureza_despesa: r.natureza || '',
          valor_previsto: r.previsto || 0,
          total_gasto_periodo: r.utilizado || 0,
          saldo: r.saldo || (r.previsto - r.utilizado),
          num_nfs: 0,
        }))
      ).slice(0, 60);

      // Links de documentos (NFs)
      const linksDocumentos = Object.values(ctx.nfsPorMeta || {})
        .flatMap(m => (m.itens || []))
        .map(p => ({
          nf_numero: p.numero || '',
          fornecedor: p.fornecedor || '',
          descricao: p.descricao || '',
          valor: p.valor || 0,
          data_emissao: '',
        }))
        .slice(0, 50);

      // Sustentabilidade
      const sustentabilidade = await chamarIA(
        `PROJETO: Museus Centro / Viaduto das Artes × PBH\n` +
        `PROFISSIONAIS: ${ctx.total_team}\n` +
        `ATIVIDADES: ${ctx.total_atividades}\n` +
        `MUSEUS: ${(ctx.museus_ativos || []).join(', ')}\n` +
        `SISTEMA DIGITAL: relatórios, galeria de fotos (${ctx.total_fotos}), rubricas e compras integrados\n\n` +
        `Gere a seção "SUSTENTABILIDADE" descrevendo legado, continuidade e capacidade instalada. ` +
        `Aborde: formação de equipe, sistemas de gestão, acervo documental, metodologias. ` +
        `Máximo 1.200 caracteres.`
      );

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        equipe_trabalho: equipe,
        _rubricas_periodo: rubricasPeriodo,
        _links_documentos: linksDocumentos,
        sustentabilidade: { texto_ia: typeof sustentabilidade === 'string' ? sustentabilidade : '', texto_editado: '', modo: 'ia' },
        assinatura: {
          nome_representante: user.full_name || '',
          cargo: 'Coordenador Geral',
          data: new Date().toISOString().split('T')[0],
          modo: 'ia',
        },
      });

      return Response.json({ success: true, etapa, total_equipe: equipe.length, total_rubricas: rubricasPeriodo.length });
    }

    // ── ETAPA 5: FOTOS E EVIDÊNCIAS — vincula fotos por meta e atividade ─────
    if (etapa === 'fotos_evidencias') {
      const ctx = relatorio._contexto_geracao;
      if (!ctx) return Response.json({ error: 'Execute etapa "contexto" primeiro.' }, { status: 400 });

      // Montar anexos_evidencias com fotos organizadas por meta
      const anexos = [];
      const urlsVistas = new Set();

      // 1. Fotos por meta (do cronograma gerado)
      const cronograma = relatorio.cronograma_metas || [];
      for (const m of cronograma) {
        for (const fotoUrl of (m.documentos_verificacao || [])) {
          if (!fotoUrl || urlsVistas.has(fotoUrl)) continue;
          const fotoInfo = (ctx.fotos_amostra || []).find(f => f.url === fotoUrl);
          anexos.push({
            foto_url: fotoUrl,
            atividade_nome: m.meta_nome || 'Atividade do Período',
            atividade_data: '',
            local: fotoInfo?.museu || '',
            meta_nome: m.meta_nome || '',
            legenda_ia: `Foto de Registro — ${m.meta_nome}${fotoInfo?.legenda ? ': ' + fotoInfo.legenda : ''}`,
            legenda_editada: '',
          });
          urlsVistas.add(fotoUrl);
          if (anexos.length >= 80) break;
        }
      }

      // 2. Demais fotos da galeria não vinculadas a metas
      for (const f of (ctx.fotos_amostra || [])) {
        if (!f.url || urlsVistas.has(f.url) || anexos.length >= 100) break;
        anexos.push({
          foto_url: f.url,
          atividade_nome: f.legenda || 'Registro do Período',
          atividade_data: '',
          local: f.museu || '',
          meta_nome: '',
          legenda_ia: `Foto de Registro — ${f.legenda || 'Atividade do Museus Centro'}`,
          legenda_editada: '',
        });
        urlsVistas.add(f.url);
      }

      // Auditoria de pendências
      const pendencias = [];
      for (const m of cronograma) {
        if ((m.percentual_execucao || 0) < 30) {
          pendencias.push({
            tipo: 'meta_sem_evidencia',
            descricao: `Meta "${m.meta_nome}" com execução baixa (${m.percentual_execucao || 0}%). Verificar registros.`,
            resolvida: false,
          });
        }
        if ((m.documentos_verificacao || []).length === 0) {
          pendencias.push({
            tipo: 'atividade_sem_foto',
            descricao: `Meta "${m.meta_nome}" sem fotos de evidência vinculadas.`,
            resolvida: false,
          });
        }
      }
      if ((ctx.total_fotos || 0) < 10) {
        pendencias.push({
          tipo: 'atividade_sem_foto',
          descricao: `Apenas ${ctx.total_fotos} fotografias registradas. Recomenda-se ampliar o acervo.`,
          resolvida: false,
        });
      }

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        anexos_evidencias: anexos,
        auditoria_pendencias: pendencias,
      });

      return Response.json({ success: true, etapa, total_fotos_vinculadas: anexos.length, pendencias: pendencias.length });
    }

    // ── ETAPA 6: FINALIZAR ────────────────────────────────────────────────────
    if (etapa === 'finalizar') {
      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        status: 'revisao',
        ia_modelo_usado: 'gerarRelatorioCompleto_v2',
        ia_tempo_ms: Date.now(),
      });
      return Response.json({ success: true, etapa, status: 'revisao' });
    }

    return Response.json({ error: `Etapa desconhecida: ${etapa}` }, { status: 400 });

  } catch (error) {
    console.error('Erro gerarRelatorioCompleto:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});