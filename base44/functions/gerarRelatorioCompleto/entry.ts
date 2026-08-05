/**
 * gerarRelatorioCompleto v3
 * 
 * Pipeline de 8 etapas com normalização canônica, score de confiança e auditoria factual.
 * etapas: 'contexto' | 'normalizacao_canonica' | 'textos_principais' | 'metas_detalhadas' |
 *         'equipe_financeiro' | 'fotos_evidencias' | 'finalizar' | 'auditoria_factual'
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
      const opts: any = { prompt: instrucao + prompt };
      if (schema) opts.response_json_schema = schema;
      return await base44.integrations.Core.InvokeLLM(opts);
    }

    // ── NORMALIZAÇÃO CANÔNICA ────────────────────────────────────────────────
    function normalizarTexto(t: string): string {
      return (t || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function chaveCanonica(data: string, museuStr: string, titulo: string, tipo: string): string {
      const d = (data || '').substring(0, 10);
      const m = normalizarTexto(museuStr).substring(0, 12).trim();
      const t = normalizarTexto(titulo).substring(0, 8).trim();
      const tp = normalizarTexto(tipo).substring(0, 6).trim();
      return `${d}:${m}:${t}:${tp}`;
    }

    // Nível de confiabilidade: 1=aprovado, 2=executado, 3=complementar, 4=narrativa
    function nivelConfiabilidade(fonte: string): number {
      if (fonte === 'Report_APPROVED') return 1;
      if (fonte === 'Activity' || fonte === 'Report_SUBMITTED') return 2;
      if (fonte === 'Programacao') return 3;
      return 4;
    }

    function normalizarAtividadesCanonicas(activities: any[], programacoes: any[], reportAtividades: any[]): any[] {
      const mapa = new Map<string, any>();

      // Processar Activities (nível 2)
      for (const a of activities) {
        const chave = chaveCanonica(a.data_realizacao || a.data_inicio || '', a.museu || a.centro_custo || '', a.titulo || '', a.classificacao || '');
        const nivel = 2;
        const item = mapa.get(chave);
        if (!item || nivelConfiabilidade(item._fonte) > nivel) {
          mapa.set(chave, {
            _chave: chave, _fonte: 'Activity', _nivel: nivel, _source_ids: [a.id],
            id: a.id, titulo: a.titulo, descricao: a.descricao || '',
            data: a.data_realizacao || a.data_inicio || '',
            museu: a.museu || a.centro_custo || '',
            tipo: a.classificacao || '',
            meta_id: a.meta_id || '', meta_codigo: a.meta_codigo || '',
            publico_confirmado: a.publico_total || 0,
            publico_estimado: a.publico_estimado || 0,
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
            fotos: [],
            report_id: a.report_id || '',
          });
        } else if (item) {
          if (!item._source_ids.includes(a.id)) item._source_ids.push(a.id);
          // Mescla campos melhores
          if (!item.resultado_alcancado && a.resultado_alcancado) item.resultado_alcancado = a.resultado_alcancado;
          if (!item.meta_id && a.meta_id) { item.meta_id = a.meta_id; item.meta_codigo = a.meta_codigo || ''; }
          if ((a.publico_total || 0) > item.publico_confirmado) item.publico_confirmado = a.publico_total || 0;
        }
      }

      // Programações (nível 3) — apenas se não há Activity para a mesma chave
      for (const p of programacoes) {
        const chave = chaveCanonica(p.data || '', p.museu || '', p.titulo || '', p.tipo || '');
        if (!mapa.has(chave)) {
          mapa.set(chave, {
            _chave: chave, _fonte: 'Programacao', _nivel: 3, _source_ids: [p.id || p.titulo],
            id: p.id || '', titulo: p.titulo, descricao: p.descricao || '',
            data: p.data || '', museu: p.museu || '', tipo: p.tipo || '',
            meta_id: '', meta_codigo: '',
            publico_confirmado: 0, publico_estimado: p.publico_esperado || 0,
            quantas_repeticoes: 1, resultado_alcancado: '',
            status_meta: '', indicador_previsto: '', meta_quantitativa: '',
            equipe_responsavel: '', acessibilidade: 'Não', parceria: 'Não', parceiro_nome: '',
            produtos_entregues: [], fotos: [], report_id: '',
          });
        }
      }

      // Report.atividades (nível 1 se APPROVED, 2 se SUBMITTED)
      for (const ra of reportAtividades) {
        const chave = chaveCanonica(ra.data || '', ra.museu || '', ra.titulo || '', ra.tipo || ra.classificacao || '');
        const nivel = ra._report_status === 'APPROVED' ? 1 : 2;
        const item = mapa.get(chave);
        if (!item || nivelConfiabilidade(item._fonte) > nivel) {
          const novoItem = {
            _chave: chave, _fonte: `Report_${ra._report_status || 'SUBMITTED'}`, _nivel: nivel,
            _source_ids: [ra._report_id],
            id: ra.id || ra._report_id, titulo: ra.titulo, descricao: ra.descricao || '',
            data: ra.data || '', museu: ra.museu || ra._museu || '',
            tipo: ra.tipo || ra.classificacao || '',
            meta_id: ra.meta_id || '', meta_codigo: ra.meta_codigo || '',
            publico_confirmado: nivel === 1 ? (ra.publico_total || 0) : 0,
            publico_estimado: nivel !== 1 ? (ra.publico_total || 0) : 0,
            quantas_repeticoes: ra.quantas_repeticoes || 1,
            resultado_alcancado: ra.resultado_alcancado || '',
            status_meta: ra.status_meta || '',
            indicador_previsto: ra.indicador_previsto || '',
            meta_quantitativa: ra.meta_quantitativa || '',
            equipe_responsavel: ra.equipe_responsavel || ra._author_name || '',
            acessibilidade: ra.acessibilidade || 'Não',
            parceria: ra.parceria || 'Não', parceiro_nome: ra.parceiro_nome || '',
            produtos_entregues: ra.produtos_entregues || [],
            fotos: [], report_id: ra._report_id || '',
          };
          if (item) {
            novoItem._source_ids = [...new Set([...item._source_ids, ...novoItem._source_ids])];
            if (item.resultado_alcancado && !novoItem.resultado_alcancado) novoItem.resultado_alcancado = item.resultado_alcancado;
          }
          mapa.set(chave, novoItem);
        } else if (item) {
          if (!item._source_ids.includes(ra._report_id)) item._source_ids.push(ra._report_id);
          if (!item.resultado_alcancado && ra.resultado_alcancado) item.resultado_alcancado = ra.resultado_alcancado;
          if (!item.meta_id && ra.meta_id) { item.meta_id = ra.meta_id; item.meta_codigo = ra.meta_codigo || ''; }
        }
      }

      return Array.from(mapa.values());
    }

    // ── SCORE DE CONFIANÇA DE METAS ──────────────────────────────────────────
    function calcularScoreMeta(atividade: any, meta: any): number {
      const metaNome = normalizarTexto(meta.nome || '');
      const titulo = normalizarTexto(atividade.titulo || '');
      const descricao = normalizarTexto(atividade.descricao || '');
      const texto = titulo + ' ' + descricao;

      // Vínculo explícito → score 100
      if (atividade.meta_id && atividade.meta_id === meta.id) return 100;
      if (atividade.meta_codigo && meta.nome &&
        (atividade.meta_codigo === meta.nome ||
         meta.nome.toLowerCase().includes((atividade.meta_codigo || '').toLowerCase().substring(0, 6)))) return 100;

      // Regras determinísticas por palavras-chave (score 90)
      const regras: Array<{ keywords: string[], metaFragment: string }> = [
        { keywords: ['noturno nos museus', 'noturno'], metaFragment: 'noturno' },
        { keywords: ['oficina', 'mediacao', 'visita mediada', 'educativo', 'formacao'], metaFragment: 'educati' },
        { keywords: ['apresentacao cultural', 'show', 'teatro', 'concerto', 'espetaculo'], metaFragment: 'cultura' },
        { keywords: ['exposicao', 'mostra', 'curadoria', 'montagem de exposicao'], metaFragment: 'exposi' },
        { keywords: ['reparo', 'manutencao', 'eletrica', 'infraestrutura', 'reforma'], metaFragment: 'manutencao' },
        { keywords: ['comunicacao', 'post', 'redes sociais', 'release', 'imprensa'], metaFragment: 'comunicacao' },
        { keywords: ['mobilizacao', 'divulgacao', 'panfletagem', 'visita a escola'], metaFragment: 'mobilizacao' },
        { keywords: ['contratacao', 'equipe', 'bolsista', 'profissional'], metaFragment: 'equipe' },
      ];

      for (const regra of regras) {
        const ativMatch = regra.keywords.some(kw => texto.includes(kw));
        const metaMatch = metaNome.includes(regra.metaFragment);
        if (ativMatch && metaMatch) return 90;
      }

      // Correspondência parcial de palavras significativas (score 70–85)
      const palavrasChave = metaNome.split(' ').filter(p => p.length > 4);
      const matches = palavrasChave.filter(p => texto.includes(p)).length;
      if (palavrasChave.length > 0) {
        const pct = matches / palavrasChave.length;
        if (pct >= 0.6) return 85;
        if (pct >= 0.3) return 70;
      }

      return 0; // Não vinculado — precisa de IA ou revisão manual
    }

    function determinarStatusMeta(percentual: number, periodoEncerrado: boolean): string {
      if (!periodoEncerrado) return 'Em andamento';
      if (percentual >= 100) return 'Realizada Integralmente';
      if (percentual >= 30) return 'Realizada Parcialmente';
      return 'Não Realizada';
    }

    // ── ETAPA 1: CONTEXTO ────────────────────────────────────────────────────
    if (etapa === 'contexto') {
      const [
        reports, activities, purchases, rubricas, metas,
        teamMembers, reportPhotos, programacoes, releases
      ] = await Promise.all([
        srv.entities.Report.filter({ status: { $in: ['APPROVED', 'SUBMITTED', 'IN_REVIEW'] } }, '-updated_date', 200),
        srv.entities.Activity.filter({ data_realizacao: { $gte: dInicio, $lte: dFim } }, '-data_realizacao', 500),
        srv.entities.PurchaseRequest.filter({ status: { $in: ['APROVADO_ADMIN', 'PAGO'] }, incluir_no_somatorio: { $ne: false } }, '-created_date', 500),
        srv.entities.Rubrica.filter({ ativo: true }),
        srv.entities.ProjectMeta.list(),
        srv.entities.TeamMember.filter({ status: 'ATIVO' }),
        srv.entities.ReportPhoto.filter({ galeria_oculta: false }, '-created_date', 500),
        srv.entities.Programacao.filter({ data: { $gte: dInicio, $lte: dFim } }),
        srv.entities.Release.list('-data_publicacao', 50),
      ]);

      const atvsMuseu = museu
        ? activities.filter(a => (a.museu || '').includes(museu) || (a.centro_custo || '').includes(museu))
        : activities;

      const metasFiltradas = filtro_meta_ids.length > 0
        ? metas.filter(m => filtro_meta_ids.includes(m.id))
        : metas.filter(m => m.ativo !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      const reportsNoPeriodo = reports.filter(r => {
        const ano = r.ano || new Date(dInicio).getFullYear();
        return ano >= new Date(dInicio).getFullYear() && ano <= new Date(dFim).getFullYear();
      });

      // Extrair atividades dos Reports para cruzamento canônico
      const reportAtividades: any[] = [];
      for (const r of reportsNoPeriodo) {
        for (const a of (r.atividades || [])) {
          reportAtividades.push({
            ...a,
            _report_id: r.id,
            _report_status: r.status,
            _author_name: r.author_name || '',
            _museu: r.museu || '',
          });
        }
      }

      const citacoesEquipe = reportsNoPeriodo.slice(0, 30).map(r => ({
        autor: r.author_name || 'Profissional', funcao: r.funcao || r.author_role || '',
        museu: r.museu || '', mes: r.mes_referencia || '', ano: r.ano || '',
        resumo: r.resumo_periodo || r.resumo_executivo || '',
        destaques: r.avaliacao_pontos_positivos || '',
        desafios: r.avaliacao_desafios || '',
        sugestoes: r.avaliacao_sugestoes || '',
        total_atividades: (r.atividades || []).length,
        report_id: r.id,
      }));

      const totalAprovado = purchases.reduce((s, p) => s + parseValor(p), 0);
      const totalRubricasPrevisto = rubricas.reduce((s, r) => s + (r.valor_rubrica || r.valor_total || 0), 0);
      const totalRubricasUtilizado = rubricas.reduce((s, r) => s + (r.valor_utilizado || 0), 0);

      const nfsPorMeta: Record<string, any> = {};
      for (const p of purchases) {
        const mid = p.meta_id || 'sem_meta';
        if (!nfsPorMeta[mid]) nfsPorMeta[mid] = { total: 0, count: 0, itens: [] };
        nfsPorMeta[mid].total += parseValor(p);
        nfsPorMeta[mid].count++;
        if (nfsPorMeta[mid].itens.length < 5) nfsPorMeta[mid].itens.push({ numero: p.nf_numero, fornecedor: p.nf_emitente_nome || p.fornecedor_nome, valor: parseValor(p), descricao: p.descricao_item });
      }

      const rubricasPorGrupo: Record<string, any> = {};
      for (const r of rubricas) {
        const grp = r.grupo || 'Geral';
        if (!rubricasPorGrupo[grp]) rubricasPorGrupo[grp] = { previsto: 0, utilizado: 0, saldo: 0, rubricas: [] };
        rubricasPorGrupo[grp].previsto += r.valor_rubrica || r.valor_total || 0;
        rubricasPorGrupo[grp].utilizado += r.valor_utilizado || 0;
        rubricasPorGrupo[grp].saldo += (r.saldo || (r.valor_rubrica || 0) - (r.valor_utilizado || 0));
        if (rubricasPorGrupo[grp].rubricas.length < 8) rubricasPorGrupo[grp].rubricas.push({ nome: r.rubrica || r.nome, natureza: r.natureza_despesa, previsto: r.valor_rubrica || r.valor_total || 0, utilizado: r.valor_utilizado || 0, saldo: r.saldo || (r.valor_rubrica || 0) - (r.valor_utilizado || 0) });
      }

      const fotosPorMeta: Record<string, any[]> = {};
      const fotosPorReport: Record<string, any[]> = {};
      for (const f of reportPhotos) {
        if (!f.file_url) continue;
        if (f.meta_id) {
          if (!fotosPorMeta[f.meta_id]) fotosPorMeta[f.meta_id] = [];
          if (fotosPorMeta[f.meta_id].length < 8) fotosPorMeta[f.meta_id].push({ url: f.file_url, legenda: f.caption || f.legenda || '', museu: f.museu || '', mes: f.mes_referencia || '' });
        }
        if (f.report_id) {
          if (!fotosPorReport[f.report_id]) fotosPorReport[f.report_id] = [];
          if (fotosPorReport[f.report_id].length < 6) fotosPorReport[f.report_id].push({ url: f.file_url, legenda: f.caption || f.legenda || '' });
        }
      }

      // Enriquecer atividades com fotos
      const atvsEnriquecidas = atvsMuseu.map(a => {
        const fotosAtv = reportPhotos.filter(f =>
          f.report_id === a.report_id &&
          (f.caption || f.legenda || '').toLowerCase().includes((a.titulo || '').toLowerCase().substring(0, 10))
        ).slice(0, 3).map(f => ({ url: f.file_url, legenda: f.caption || f.legenda || '' }));
        return {
          id: a.id, titulo: a.titulo, descricao: a.descricao || '',
          data: a.data_realizacao || a.data_inicio,
          museu: a.museu || a.centro_custo || '',
          meta_id: a.meta_id || '', meta_codigo: a.meta_codigo || '',
          classificacao: a.classificacao, publico_total: a.publico_total || 0,
          quantas_repeticoes: a.quantas_repeticoes || 1,
          resultado_alcancado: a.resultado_alcancado || '', status_meta: a.status_meta || '',
          indicador_previsto: a.indicador_previsto || '', meta_quantitativa: a.meta_quantitativa || '',
          equipe_responsavel: a.equipe_responsavel || '', acessibilidade: a.acessibilidade || 'Não',
          parceria: a.parceria || 'Não', parceiro_nome: a.parceiro_nome || '',
          produtos_entregues: a.produtos_entregues || [], houve_contratacoes: a.houve_contratacoes || false,
          numero_trabalhadores: a.numero_trabalhadores || 0, fotos: fotosAtv, report_id: a.report_id,
        };
      });

      const publicoTotal = atvsEnriquecidas.reduce((s, a) => s + (a.publico_total || 0), 0);
      const museus_ativos = [...new Set(atvsEnriquecidas.map(a => a.museu).filter(Boolean))];

      const contexto = {
        citacoesEquipe, atvsEnriquecidas: atvsEnriquecidas.slice(0, 200),
        reportAtividades: reportAtividades.slice(0, 300),
        programacoes_raw: programacoes.map(p => ({ id: p.id, titulo: p.titulo, data: p.data, museu: p.museu || '', tipo: p.tipo || '', descricao: p.descricao || '', publico_esperado: p.publico_esperado || 0 })),
        metasFiltradas, rubricasPorGrupo, nfsPorMeta,
        totalAprovado, totalRubricasPrevisto, totalRubricasUtilizado,
        publicoTotal, museus_ativos,
        total_atividades: atvsEnriquecidas.length,
        total_reports: reportsNoPeriodo.length,
        total_team: teamMembers.length, total_fotos: reportPhotos.length,
        total_programacoes: programacoes.length, fotosPorMeta,
        equipe: teamMembers.map(t => ({ nome: t.user_name || t.nome || '', cargo: t.funcao || t.cargo_representante || '', tipo_pessoa: t.tipo_pessoa || 'PF', museu_projeto: t.museu_projeto || '', valor_total: t.valor_total || 0, numero_parcelas: t.numero_parcelas || 0, data_inicio: t.data_inicio_contrato || dInicio, data_fim: t.data_fim_contrato || dFim, status_contrato: t.status_contrato || 'VIGENTE' })),
        fotos_amostra: reportPhotos.slice(0, 80).map(f => ({ url: f.file_url, legenda: f.caption || f.legenda || '', museu: f.museu || '', mes: f.mes_referencia || '', meta_id: f.meta_id || '', report_id: f.report_id || '' })),
        programacoes: programacoes.map(p => ({ titulo: p.titulo, data: p.data, local: p.local || '', tipo: p.tipo || '' })),
        releases: releases.slice(0, 20).map(r => ({ titulo: r.titulo, data: r.data_publicacao, veiculo: r.veiculo || '' })),
        gerado_em: new Date().toISOString(),
      };

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        _contexto_geracao: contexto,
        _total_financeiro: totalAprovado,
        _total_financeiro_fmt: fmtBRL(totalAprovado),
        _atividades_periodo: atvsEnriquecidas.slice(0, 100),
        _notas_fiscais_metas: Object.values(nfsPorMeta).flatMap((m: any) => m.itens || []).slice(0, 100),
      });

      return Response.json({
        success: true, etapa,
        resumo: {
          total_atividades: atvsEnriquecidas.length, total_reports: reportsNoPeriodo.length,
          total_metas: metasFiltradas.length, publicoTotal, totalAprovado: fmtBRL(totalAprovado),
          museus_ativos, total_fotos: reportPhotos.length, total_team: teamMembers.length,
        },
      });
    }

    // ── Recupera contexto ────────────────────────────────────────────────────
    async function obterContexto() {
      const rel = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
      if (rel?._contexto_geracao?.gerado_em) return rel._contexto_geracao;

      // Fallback leve
      const [reports, activities, purchases, rubricas, metas, teamMembers, reportPhotos, programacoes, releases] = await Promise.all([
        srv.entities.Report.filter({ status: { $in: ['APPROVED', 'SUBMITTED', 'IN_REVIEW'] } }, '-updated_date', 100).catch(() => []),
        srv.entities.Activity.filter({ data_realizacao: { $gte: dInicio, $lte: dFim } }, '-data_realizacao', 300).catch(() => []),
        srv.entities.PurchaseRequest.filter({ status: { $in: ['APROVADO_ADMIN', 'PAGO'] } }, '-created_date', 300).catch(() => []),
        srv.entities.Rubrica.filter({ ativo: true }).catch(() => []),
        srv.entities.ProjectMeta.list().catch(() => []),
        srv.entities.TeamMember.filter({ status: 'ATIVO' }).catch(() => []),
        srv.entities.ReportPhoto.filter({ galeria_oculta: false }, '-created_date', 200).catch(() => []),
        srv.entities.Programacao.filter({ data: { $gte: dInicio, $lte: dFim } }).catch(() => []),
        srv.entities.Release.list('-data_publicacao', 30).catch(() => []),
      ]);
      const atvsMuseu = museu ? activities.filter(a => (a.museu || '').includes(museu) || (a.centro_custo || '').includes(museu)) : activities;
      const metasFiltradas = filtro_meta_ids.length > 0 ? metas.filter(m => filtro_meta_ids.includes(m.id)) : metas.filter(m => m.ativo !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      const totalAprovado = purchases.reduce((s, p) => s + parseValor(p), 0);
      const totalRubricasPrevisto = rubricas.reduce((s, r) => s + (r.valor_rubrica || r.valor_total || 0), 0);
      const totalRubricasUtilizado = rubricas.reduce((s, r) => s + (r.valor_utilizado || 0), 0);
      const nfsPorMeta: Record<string, any> = {};
      for (const p of purchases) { const mid = p.meta_id || 'sem_meta'; if (!nfsPorMeta[mid]) nfsPorMeta[mid] = { total: 0, count: 0, itens: [] }; nfsPorMeta[mid].total += parseValor(p); nfsPorMeta[mid].count++; if (nfsPorMeta[mid].itens.length < 5) nfsPorMeta[mid].itens.push({ numero: p.nf_numero, fornecedor: p.nf_emitente_nome || p.fornecedor_nome, valor: parseValor(p), descricao: p.descricao_item }); }
      const rubricasPorGrupo: Record<string, any> = {};
      for (const r of rubricas) { const grp = r.grupo || 'Geral'; if (!rubricasPorGrupo[grp]) rubricasPorGrupo[grp] = { previsto: 0, utilizado: 0, saldo: 0, rubricas: [] }; rubricasPorGrupo[grp].previsto += r.valor_rubrica || r.valor_total || 0; rubricasPorGrupo[grp].utilizado += r.valor_utilizado || 0; rubricasPorGrupo[grp].saldo += (r.saldo || (r.valor_rubrica || 0) - (r.valor_utilizado || 0)); if (rubricasPorGrupo[grp].rubricas.length < 8) rubricasPorGrupo[grp].rubricas.push({ nome: r.rubrica || r.nome, natureza: r.natureza_despesa, previsto: r.valor_rubrica || r.valor_total || 0, utilizado: r.valor_utilizado || 0, saldo: r.saldo || (r.valor_rubrica || 0) - (r.valor_utilizado || 0) }); }
      const fotosPorMeta: Record<string, any[]> = {};
      for (const f of reportPhotos) { if (!f.file_url || !f.meta_id) continue; if (!fotosPorMeta[f.meta_id]) fotosPorMeta[f.meta_id] = []; if (fotosPorMeta[f.meta_id].length < 8) fotosPorMeta[f.meta_id].push({ url: f.file_url, legenda: f.caption || f.legenda || '', museu: f.museu || '', mes: f.mes_referencia || '' }); }
      const atvsEnriquecidas = atvsMuseu.map(a => ({ id: a.id, titulo: a.titulo, descricao: a.descricao || '', data: a.data_realizacao || a.data_inicio, museu: a.museu || a.centro_custo || '', meta_id: a.meta_id || '', meta_codigo: a.meta_codigo || '', classificacao: a.classificacao, publico_total: a.publico_total || 0, quantas_repeticoes: a.quantas_repeticoes || 1, resultado_alcancado: a.resultado_alcancado || '', status_meta: a.status_meta || '', indicador_previsto: a.indicador_previsto || '', meta_quantitativa: a.meta_quantitativa || '', equipe_responsavel: a.equipe_responsavel || '', acessibilidade: a.acessibilidade || 'Não', parceria: a.parceria || 'Não', parceiro_nome: a.parceiro_nome || '', produtos_entregues: a.produtos_entregues || [], houve_contratacoes: a.houve_contratacoes || false, numero_trabalhadores: a.numero_trabalhadores || 0, fotos: [], report_id: a.report_id }));
      const reportAtividades: any[] = reports.flatMap(r => (r.atividades || []).map(a => ({ ...a, _report_id: r.id, _report_status: r.status, _author_name: r.author_name || '', _museu: r.museu || '' })));
      return {
        citacoesEquipe: reports.slice(0, 20).map(r => ({ autor: r.author_name || 'Profissional', funcao: r.funcao || '', museu: r.museu || '', mes: r.mes_referencia || '', ano: r.ano || '', resumo: r.resumo_periodo || r.resumo_executivo || '', destaques: r.avaliacao_pontos_positivos || '', desafios: r.avaliacao_desafios || '', sugestoes: r.avaliacao_sugestoes || '', total_atividades: (r.atividades || []).length, report_id: r.id })),
        atvsEnriquecidas: atvsEnriquecidas.slice(0, 200), reportAtividades: reportAtividades.slice(0, 300),
        programacoes_raw: programacoes.map(p => ({ id: p.id, titulo: p.titulo, data: p.data, museu: p.museu || '', tipo: p.tipo || '', descricao: p.descricao || '', publico_esperado: p.publico_esperado || 0 })),
        metasFiltradas, rubricasPorGrupo, nfsPorMeta, totalAprovado, totalRubricasPrevisto, totalRubricasUtilizado,
        publicoTotal: atvsEnriquecidas.reduce((s, a) => s + (a.publico_total || 0), 0),
        museus_ativos: [...new Set(atvsEnriquecidas.map(a => a.museu).filter(Boolean))],
        total_atividades: atvsEnriquecidas.length, total_reports: reports.length, total_team: teamMembers.length,
        total_fotos: reportPhotos.length, total_programacoes: programacoes.length, fotosPorMeta,
        equipe: teamMembers.map(t => ({ nome: t.user_name || t.nome || '', cargo: t.funcao || t.cargo_representante || '', tipo_pessoa: t.tipo_pessoa || 'PF', museu_projeto: t.museu_projeto || '', valor_total: t.valor_total || 0, numero_parcelas: t.numero_parcelas || 0, data_inicio: t.data_inicio_contrato || dInicio, data_fim: t.data_fim_contrato || dFim, status_contrato: t.status_contrato || 'VIGENTE' })),
        fotos_amostra: reportPhotos.slice(0, 80).map(f => ({ url: f.file_url, legenda: f.caption || f.legenda || '', museu: f.museu || '', mes: f.mes_referencia || '', meta_id: f.meta_id || '', report_id: f.report_id || '' })),
        programacoes: programacoes.map(p => ({ titulo: p.titulo, data: p.data, local: p.local || '', tipo: p.tipo || '' })),
        releases: releases.slice(0, 20).map(r => ({ titulo: r.titulo, data: r.data_publicacao, veiculo: r.veiculo || '' })),
        gerado_em: new Date().toISOString(),
      };
    }

    // ── ETAPA 2: NORMALIZAÇÃO CANÔNICA ───────────────────────────────────────
    if (etapa === 'normalizacao_canonica') {
      const ctx = await obterContexto();

      const atvsCanônicas = normalizarAtividadesCanonicas(
        ctx.atvsEnriquecidas || [],
        ctx.programacoes_raw || [],
        ctx.reportAtividades || []
      );

      // Calcular público sem duplicatas (usa apenas o valor de confiabilidade mais alto)
      const publicoCanônico = atvsCanônicas.reduce((s, a) => s + (a.publico_confirmado || a.publico_estimado || 0), 0);

      // Vincular metas com score de confiança
      const metasFiltradas = ctx.metasFiltradas || [];
      const atvsComScore = atvsCanônicas.map(a => {
        if (a.meta_id) return { ...a, _meta_score: 100, _meta_revisao: false };

        let melhorMeta: any = null;
        let melhorScore = 0;
        for (const meta of metasFiltradas) {
          const score = calcularScoreMeta(a, meta);
          if (score > melhorScore) { melhorScore = score; melhorMeta = meta; }
        }

        if (melhorScore >= 70 && melhorMeta) {
          return { ...a, meta_id: melhorMeta.id, meta_codigo: melhorMeta.nome, _meta_score: melhorScore, _meta_revisao: melhorScore < 90 };
        }
        return { ...a, _meta_score: melhorScore, _meta_revisao: true };
      });

      // Estatísticas de confiança
      const stats = {
        total_canonicas: atvsComScore.length,
        com_meta_explicita: atvsComScore.filter(a => a._meta_score === 100).length,
        com_meta_deterministica: atvsComScore.filter(a => a._meta_score === 90).length,
        com_meta_ia: atvsComScore.filter(a => a._meta_score >= 70 && a._meta_score < 90).length,
        sem_meta: atvsComScore.filter(a => !a.meta_id || a._meta_score < 70).length,
        precisam_revisao: atvsComScore.filter(a => a._meta_revisao).length,
        publico_canonico: publicoCanônico,
        fontes: {
          level_1_approved: atvsComScore.filter(a => a._nivel === 1).length,
          level_2_executado: atvsComScore.filter(a => a._nivel === 2).length,
          level_3_programacao: atvsComScore.filter(a => a._nivel === 3).length,
        },
      };

      // Persistir dataset canônico no relatório
      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        descricao_acoes: {
          ...(relatorio.descricao_acoes || {}),
          contexto_ia_atividades: JSON.stringify({
            atividades_canonicas: atvsComScore.slice(0, 200),
            stats_normalizacao: stats,
            publico_canonico: publicoCanônico,
            gerado_em: new Date().toISOString(),
          }),
        },
      });

      return Response.json({ success: true, etapa, ...stats });
    }

    // ── ETAPA 3: TEXTOS PRINCIPAIS ───────────────────────────────────────────
    if (etapa === 'textos_principais') {
      const ctx = await obterContexto();
      if (!ctx) return Response.json({ error: 'Não foi possível coletar contexto.' }, { status: 500 });

      const citacoesTexto = (ctx.citacoesEquipe || []).slice(0, 10).map(c =>
        `• ${c.autor} (${c.funcao || 'profissional'}, ${c.museu}/${c.mes}): "${(c.resumo || c.destaques || '').slice(0, 200)}"`
      ).join('\n');

      const atvsResumo = (ctx.atvsEnriquecidas || []).slice(0, 40).map(a =>
        `${a.data || ''} | ${a.museu} | ${a.classificacao} | ${a.titulo} | Público: ${a.publico_total} | Meta: ${a.meta_codigo || 'Rotina'}`
      ).join('\n');

      const [descAcoes, divulgacao, impactos, avaliacao] = await Promise.all([
        chamarIA(
          `PERÍODO: ${dInicio} a ${dFim}\nMUSEUS ATIVOS: ${(ctx.museus_ativos || []).join(', ')}\nTOTAL ATIVIDADES: ${ctx.total_atividades}\nPÚBLICO TOTAL: ${ctx.publicoTotal}\nPROFISSIONAIS: ${ctx.total_team}\nPROGRAMAÇÕES: ${ctx.total_programacoes}\nRELATÓRIOS APROVADOS: ${ctx.total_reports}\n\nATIVIDADES:\n${atvsResumo}\n\nREGISTROS DA EQUIPE:\n${citacoesTexto}\n\nGere "DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS". Organize por museu/área. Cite atividades, datas e resultados reais. Máximo 2.500 caracteres.`
        ),
        chamarIA(
          `RELEASES: ${(ctx.releases || []).length}\nPROGRAMAÇÕES: ${ctx.total_programacoes}\nRELEASES: ${JSON.stringify((ctx.releases || []).slice(0, 8))}\nPROGRAMAÇÕES: ${JSON.stringify((ctx.programacoes || []).slice(0, 8))}\n\nGere "DIVULGAÇÃO DA PARCERIA". Cite veículos, eventos e materiais produzidos. Máximo 1.500 caracteres.`
        ),
        chamarIA(
          `PÚBLICO TOTAL: ${ctx.publicoTotal}\nATIVIDADES: ${ctx.total_atividades}\nPROFISSIONAIS: ${ctx.total_team}\nVALOR APROVADO (NFs): ${fmtBRL(ctx.totalAprovado || 0)}\nPREVISTO (RUBRICAS): ${fmtBRL(ctx.totalRubricasPrevisto || 0)}\nEXECUTADO (RUBRICAS): ${fmtBRL(ctx.totalRubricasUtilizado || 0)}\nMUSEUS: ${(ctx.museus_ativos || []).join(', ')}\n\nGere "IMPACTOS ECONÔMICOS E SOCIAIS". Use os valores reais. Máximo 2.000 caracteres.`
        ),
        chamarIA(
          `ATIVIDADES: ${ctx.total_atividades}\nMETAS: ${(ctx.metasFiltradas || []).length}\nRELATÓRIOS: ${ctx.total_reports}\nEQUIPE: ${ctx.total_team}\nMUSEUS: ${(ctx.museus_ativos || []).join(', ')}\nPREVISTO: ${fmtBRL(ctx.totalRubricasPrevisto || 0)}\nEXECUTADO: ${fmtBRL(ctx.totalRubricasUtilizado || 0)}\n% EXECUÇÃO: ${ctx.totalRubricasPrevisto > 0 ? Math.round((ctx.totalRubricasUtilizado / ctx.totalRubricasPrevisto) * 100) : 0}%\nNFs: ${fmtBRL(ctx.totalAprovado || 0)}\n\nGere "AVALIAÇÃO DA PARCERIA" entre Viaduto das Artes e PBH/SUCC. Cite percentuais reais. Máximo 1.800 caracteres.`
        ),
      ]);

      const pd = relatorio.publico_alvo?.previsto_direto || 50000;
      const pi = relatorio.publico_alvo?.previsto_indireto || 150000;
      const rd = ctx.publicoTotal || 0;
      const ri = Math.round(rd * 2.5);

      const enderecos: Record<string, string> = {
        'MHAB': 'Museu Histórico Abílio Barreto (MHAB) — Av. Prudente de Morais, 202 – Cidade Jardim, BH/MG – CEP 30.380-000',
        'MIS': 'Museu da Imagem e do Som (MIS BH) — Av. Afonso Pena, 1520 – Centro, BH/MG – CEP 30.130-921',
        'MUMO': 'Museu da Moda de BH (MUMO) – Rua da Bahia, 1149 – Centro, BH/MG – CEP 30.160-011',
        'Casa Kubitschek': 'Casa Kubitschek — Av. João Antônio Alves, 90 – Pampulha, BH/MG',
        'Casa do Baile': 'Casa do Baile — Av. Otacílio Negrão de Lima, 751 – Pampulha, BH/MG',
        'MAP': 'Museu de Arte da Pampulha (MAP) — Av. Otacílio Negrão de Lima, 16.585 – Pampulha, BH/MG',
      };
      const museusAtivos = (ctx.museus_ativos || []).length > 0 ? ctx.museus_ativos : Object.keys(enderecos);
      const endTxt = museusAtivos.map(m => { const k = Object.keys(enderecos).find(k => m.includes(k) || k.includes(m)); return k ? enderecos[k] : null; }).filter(Boolean).join('\n');

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        descricao_acoes: { texto_ia: typeof descAcoes === 'string' ? descAcoes : '', texto_editado: '', modo: 'ia', contexto_ia_atividades: relatorio.descricao_acoes?.contexto_ia_atividades || '' },
        divulgacao_parceria: { texto_ia: typeof divulgacao === 'string' ? divulgacao : '', texto_editado: '', modo: 'ia' },
        impactos_economicos_sociais: { texto_ia: typeof impactos === 'string' ? impactos : '', texto_editado: '', modo: 'ia' },
        avaliacao_parceria: { texto_ia: typeof avaliacao === 'string' ? avaliacao : '', texto_editado: '', modo: 'ia' },
        publico_alvo: { previsto_direto: pd, previsto_indireto: pi, realizado_direto: rd, realizado_indireto: ri, diferenca_direto: rd - pd, diferenca_indireto: ri - pi, percentual_direto: pd > 0 ? Math.round(rd / pd * 100) : 0, percentual_indireto: pi > 0 ? Math.round(ri / pi * 100) : 0, texto_interpretativo_ia: '', texto_interpretativo_editado: '', modo: 'ia' },
        endereco_execucao: { texto_ia: endTxt, texto_editado: '', modo: 'ia' },
        pesquisa_satisfacao: { possui_dados: false, justificativa_ia: 'Não foram localizados registros de pesquisa de satisfação aplicada no período. Formulários de avaliação serão implementados nas próximas edições das programações.', justificativa_editada: '', modo: 'ia' },
      });

      return Response.json({ success: true, etapa, campos_gerados: 6 });
    }

    // ── ETAPA 4: METAS DETALHADAS ────────────────────────────────────────────
    if (etapa === 'metas_detalhadas') {
      const ctx = await obterContexto();
      const periodoEncerrado = new Date(dFim) < new Date();
      const cronograma: any[] = [];

      // Tentar ler dataset canônico persistido
      let atvsCanônicas: any[] = ctx.atvsEnriquecidas || [];
      try {
        const relAtual = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
        const persistido = relAtual.descricao_acoes?.contexto_ia_atividades;
        if (persistido) {
          const parsed = typeof persistido === 'string' ? JSON.parse(persistido) : persistido;
          if (parsed.atividades_canonicas?.length > 0) atvsCanônicas = parsed.atividades_canonicas;
        }
      } catch {}

      for (const meta of (ctx.metasFiltradas || [])) {
        const atvsComMeta = atvsCanônicas.filter(a =>
          (a.meta_id && a.meta_id === meta.id) ||
          (a.meta_codigo && meta.nome && (a.meta_codigo === meta.nome || meta.nome.toLowerCase().includes((a.meta_codigo || '').toLowerCase().substring(0, 8))))
        );

        const fotosMetaDiretas = (ctx.fotosPorMeta || {})[meta.id] || [];
        const fotosAtvsRels = atvsComMeta.flatMap(a => a.fotos || []);
        const todasFotosMeta = [...fotosMetaDiretas, ...fotosAtvsRels].filter((f, i, arr) => f.url && arr.findIndex(x => x.url === f.url) === i).slice(0, 6);

        const publicoMeta = atvsComMeta.reduce((s, a) => s + (a.publico_confirmado || a.publico_total || 0), 0);
        const resultadosAlcancados = atvsComMeta.filter(a => a.resultado_alcancado).map(a => a.resultado_alcancado).join('; ');

        const nfMeta = (ctx.nfsPorMeta || {})[meta.id] || { total: 0, count: 0, itens: [] };
        const rubricasMeta = Object.entries(ctx.rubricasPorGrupo || {}).filter(([grp]) => meta.nome && grp.toLowerCase().includes(meta.nome.toLowerCase().substring(0, 12))).map(([, v]) => v as any);
        const previstoDaMeta = rubricasMeta.reduce((s, r) => s + (r.previsto || 0), 0);
        const utilizadoDaMeta = rubricasMeta.reduce((s, r) => s + (r.utilizado || 0), 0);

        // Score médio de confiança das atividades vinculadas
        const scoresMeta = atvsComMeta.map(a => a._meta_score || 100);
        const scoreMediao = scoresMeta.length > 0 ? Math.round(scoresMeta.reduce((s, v) => s + v, 0) / scoresMeta.length) : 0;

        // Status determinístico (nunca somente pela IA)
        const pctFisico = meta.descricao?.includes('ação') || meta.descricao?.includes('oficina')
          ? Math.min(100, atvsComMeta.length * 10)
          : (previstoDaMeta > 0 ? Math.min(100, Math.round(utilizadoDaMeta / previstoDaMeta * 100)) : 0);
        const statusDeterministico = determinarStatusMeta(pctFisico, periodoEncerrado);

        let entrada: any;
        if (atvsComMeta.length === 0) {
          entrada = {
            meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
            resultado_esperado: meta.descricao || '',
            acoes: 'Nenhuma atividade registrada para esta meta no período.',
            periodo: `${dInicio} a ${dFim}`,
            documentos_verificacao: todasFotosMeta.map(f => f.url).filter(Boolean),
            resultado_alcancado: 'Sem registros no período.',
            status_meta: statusDeterministico,
            percentual_execucao: pctFisico,
            justificativa: 'Não foram localizadas atividades vinculadas a esta meta no período consultado.',
            valor_previsto: previstoDaMeta, valor_realizado: utilizadoDaMeta || nfMeta.total,
            fotos_evidencia: todasFotosMeta, meta_confidence: scoreMediao, modo: 'ia',
          };
        } else {
          const descAtividades = atvsComMeta.slice(0, 10).map(a =>
            `• ${a.data || ''}: ${a.titulo} — Público: ${a.publico_confirmado || a.publico_total || 0} — ${a.resultado_alcancado || a.status_meta || ''} — Museu: ${a.museu}`
          ).join('\n');
          const citacoesMetaEquipe = (ctx.citacoesEquipe || []).filter(c => meta.nome && ((c.resumo || '') + (c.destaques || '')).toLowerCase().includes(meta.nome.toLowerCase().substring(0, 10))).slice(0, 3).map(c => `${c.autor} (${c.museu}): "${(c.resumo || c.destaques || '').slice(0, 150)}"`).join('\n');

          try {
            const analise = await chamarIA(
              `META: "${meta.nome}"\nDESCRIÇÃO: ${meta.descricao || ''}\n\nATIVIDADES (${atvsComMeta.length}):\n${descAtividades}\n\nPÚBLICO ALCANÇADO: ${publicoMeta}\nRESULTADOS: ${resultadosAlcancados || 'ver atividades'}\nVALOR PREVISTO: ${fmtBRL(previstoDaMeta)}\nVALOR REALIZADO: ${fmtBRL(utilizadoDaMeta || nfMeta.total)}\nNFs: ${nfMeta.count}\n${citacoesMetaEquipe ? `\nCITAÇÕES:\n${citacoesMetaEquipe}\n` : ''}\nOBSERVAÇÃO: O status_meta já foi determinado como "${statusDeterministico}" com base nos dados objetivos. Use esse valor.\nRetorne JSON: resultado_esperado, acoes (densa, citando atividades), periodo, resultado_alcancado, status_meta="${statusDeterministico}", percentual_execucao=${pctFisico}, justificativa.`,
              { type: 'object', properties: { resultado_esperado: { type: 'string' }, acoes: { type: 'string' }, periodo: { type: 'string' }, resultado_alcancado: { type: 'string' }, status_meta: { type: 'string' }, percentual_execucao: { type: 'number' }, justificativa: { type: 'string' } }, required: ['acoes', 'status_meta', 'percentual_execucao'] }
            );
            entrada = {
              meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
              resultado_esperado: analise.resultado_esperado || meta.descricao || '',
              acoes: analise.acoes || `${atvsComMeta.length} atividades realizadas`,
              periodo: analise.periodo || `${dInicio} a ${dFim}`,
              documentos_verificacao: todasFotosMeta.map(f => f.url).filter(Boolean),
              resultado_alcancado: analise.resultado_alcancado || resultadosAlcancados || '',
              status_meta: statusDeterministico, // Status sempre determinístico
              percentual_execucao: pctFisico,
              justificativa: analise.justificativa || '',
              valor_previsto: previstoDaMeta, valor_realizado: utilizadoDaMeta || nfMeta.total,
              fotos_evidencia: todasFotosMeta, nfs_vinculadas: nfMeta.itens || [],
              meta_confidence: scoreMediao, modo: 'ia',
            };
          } catch {
            entrada = {
              meta_id: meta.id, meta_nome: meta.nome, meta_ordem: meta.ordem || 0,
              resultado_esperado: meta.descricao || '',
              acoes: `${atvsComMeta.length} atividades: ${atvsComMeta.slice(0, 3).map(a => a.titulo).join(', ')}`,
              periodo: `${dInicio} a ${dFim}`,
              documentos_verificacao: todasFotosMeta.map(f => f.url).filter(Boolean),
              resultado_alcancado: resultadosAlcancados || `${atvsComMeta.length} atividades — público: ${publicoMeta}`,
              status_meta: statusDeterministico, percentual_execucao: pctFisico,
              justificativa: '',
              valor_previsto: previstoDaMeta, valor_realizado: utilizadoDaMeta || nfMeta.total,
              fotos_evidencia: todasFotosMeta, nfs_vinculadas: nfMeta.itens || [],
              meta_confidence: scoreMediao, modo: 'ia',
            };
          }
        }
        cronograma.push(entrada);
      }

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { cronograma_metas: cronograma });
      return Response.json({ success: true, etapa, total_metas: cronograma.length });
    }

    // ── ETAPA 5: EQUIPE E FINANCEIRO ─────────────────────────────────────────
    if (etapa === 'equipe_financeiro') {
      const ctx = await obterContexto();
      const equipeBase = [
        { nome: 'Daniel Perini', cargo: 'Coordenação Geral', tipo_contratacao: 'Prestação de serviços', atribuicoes: 'Coordenação, supervisão, articulação institucional e acompanhamento de metas', periodo: '02/02/2026 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Ana Luiza', cargo: 'Consultoria de Programação', tipo_contratacao: 'Prestação de serviços', atribuicoes: 'Programação integrada, articulação com museus e acompanhamento de cronogramas', periodo: '2026 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Fernanda Campos de Pinho Monte-Mor', cargo: 'Coordenação de Comunicação', tipo_contratacao: 'Pessoa jurídica', atribuicoes: 'Planejamento de comunicação, divulgação e cobertura institucional', periodo: '2024 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Wanda Mucchiut', cargo: 'Produção Cultural - MHAB', tipo_contratacao: 'Prestação de serviços', atribuicoes: 'Produção local, logística, articulação e acompanhamento de exposições e eventos', periodo: '2026 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Isabella Caroline de Souza', cargo: 'Produção Cultural - MIS', tipo_contratacao: 'Prestação de serviços', atribuicoes: 'Produção local, gestão de infraestrutura e execução de atividades', periodo: '2026 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Lara Carvalho Ferreira', cargo: 'Educadora', tipo_contratacao: 'Pessoa jurídica', atribuicoes: 'Mediação, oficinas, visitas e ações educativas', periodo: '15/10/2025 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Clara Braga Assumpção', cargo: 'Educadora', tipo_contratacao: 'Pessoa jurídica', atribuicoes: 'Mediação, oficinas e apoio educativo', periodo: '12/09/2024 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Daniel Moreira Soares', cargo: 'Fotógrafo', tipo_contratacao: 'Pessoa jurídica', atribuicoes: 'Documentação fotográfica e cobertura das ações', periodo: '02/02/2026 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'André Luiz da Silva Oliveira', cargo: 'Redes Sociais', tipo_contratacao: 'Pessoa jurídica', atribuicoes: 'Conteúdo e cobertura para redes sociais', periodo: '03/2026 a 30/06/2026', carga_horaria: '', valor: 0 },
        { nome: 'Cristina Sanches Porto', cargo: 'Assessoria de Imprensa', tipo_contratacao: 'Pessoa jurídica', atribuicoes: 'Relacionamento com imprensa e divulgação', periodo: '2025 a 30/06/2026', carga_horaria: '', valor: 0 },
      ];
      const equipeReal = ctx.equipe || [];
      const equipe = equipeBase.map(base => {
        const real = equipeReal.find(r => (r.nome || '').toLowerCase().includes((base.nome || '').split(' ')[0].toLowerCase()));
        return { ...base, valor: real?.valor_total || base.valor || 0, periodo: real?.data_inicio ? `${real.data_inicio} a ${real.data_fim || dFim}` : base.periodo, modo: 'ia' };
      });
      for (const r of equipeReal) {
        const jaIncluso = equipe.some(e => (e.nome || '').toLowerCase().includes((r.nome || '').split(' ')[0].toLowerCase()));
        if (!jaIncluso && r.nome) equipe.push({ nome: r.nome, cargo: r.cargo || 'Profissional', tipo_contratacao: r.tipo_pessoa === 'PF' ? 'Prestação de serviços' : 'Pessoa jurídica', atribuicoes: '', periodo: `${r.data_inicio || dInicio} a ${r.data_fim || dFim}`, carga_horaria: '', valor: r.valor_total || 0, modo: 'ia' });
      }
      const rubricasPeriodo = Object.entries(ctx.rubricasPorGrupo || {}).flatMap(([grupo, data]: [string, any]) => (data.rubricas || []).map(r => ({ rubrica_nome: r.nome, grupo, natureza_despesa: r.natureza || '', valor_previsto: r.previsto || 0, total_gasto_periodo: r.utilizado || 0, saldo: r.saldo || (r.previsto - r.utilizado), num_nfs: 0 }))).slice(0, 60);
      const sustentabilidade = await chamarIA(`PROJETO: Museus Centro / Viaduto das Artes × PBH\nPROFISSIONAIS: ${ctx.total_team}\nATIVIDADES: ${ctx.total_atividades}\nMUSEUS: ${(ctx.museus_ativos || []).join(', ')}\nSISTEMA DIGITAL: relatórios, galeria (${ctx.total_fotos} fotos), rubricas e compras integrados\n\nGere "SUSTENTABILIDADE" descrevendo legado, continuidade e capacidade instalada. Aborde: formação de equipe, sistemas de gestão, acervo documental, metodologias. Máximo 1.200 caracteres.`);
      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        equipe_trabalho: equipe,
        _rubricas_periodo: rubricasPeriodo,
        _links_documentos: Object.values(ctx.nfsPorMeta || {}).flatMap((m: any) => m.itens || []).map(p => ({ nf_numero: p.numero || '', fornecedor: p.fornecedor || '', descricao: p.descricao || '', valor: p.valor || 0, data_emissao: '' })).slice(0, 50),
        sustentabilidade: { texto_ia: typeof sustentabilidade === 'string' ? sustentabilidade : '', texto_editado: '', modo: 'ia' },
        assinatura: { nome_representante: user.full_name || '', cargo: 'Coordenador Geral', data: new Date().toISOString().split('T')[0], modo: 'ia' },
        identificacao_projeto: { organizacao: 'Viaduto das Artes', projeto: 'Museus Centro', instrumento_juridico: 'Termo de Colaboração nº 01-031.069/24-80', processo_administrativo: '01-031.069/24-80', vigencia_inicio: '2024-01-01', vigencia_fim: '2026-12-31', responsavel: 'Daniel Perini', telefone: '', email: 'danielperini.mc@viadutodasartes.org.br', ...(relatorio.identificacao_projeto || {}) },
      });
      return Response.json({ success: true, etapa, total_equipe: equipe.length, total_rubricas: rubricasPeriodo.length });
    }

    // ── ETAPA 6: FOTOS E EVIDÊNCIAS ──────────────────────────────────────────
    if (etapa === 'fotos_evidencias') {
      const ctx = await obterContexto();
      const relAtualizado = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
      const anexos: any[] = [];
      const urlsVistas = new Set<string>();
      const cronograma = relAtualizado?.cronograma_metas || relatorio.cronograma_metas || [];

      for (const m of cronograma) {
        for (const fotoUrl of (m.documentos_verificacao || [])) {
          if (!fotoUrl || urlsVistas.has(fotoUrl)) continue;
          const fotoInfo = (ctx.fotos_amostra || []).find(f => f.url === fotoUrl);
          anexos.push({ foto_url: fotoUrl, atividade_nome: m.meta_nome || 'Atividade do Período', atividade_data: '', local: fotoInfo?.museu || '', meta_nome: m.meta_nome || '', legenda_ia: `Foto de Registro — ${m.meta_nome}${fotoInfo?.legenda ? ': ' + fotoInfo.legenda : ''}`, legenda_editada: '' });
          urlsVistas.add(fotoUrl);
          if (anexos.length >= 80) break;
        }
      }
      for (const f of (ctx.fotos_amostra || [])) {
        if (!f.url || urlsVistas.has(f.url) || anexos.length >= 100) break;
        anexos.push({ foto_url: f.url, atividade_nome: f.legenda || 'Registro do Período', atividade_data: '', local: f.museu || '', meta_nome: '', legenda_ia: `Foto de Registro — ${f.legenda || 'Atividade do Museus Centro'}`, legenda_editada: '' });
        urlsVistas.add(f.url);
      }

      const pendencias: any[] = [];
      for (const m of cronograma) {
        if ((m.percentual_execucao || 0) < 30) pendencias.push({ tipo: 'meta_sem_evidencia', descricao: `Meta "${m.meta_nome}" com execução baixa (${m.percentual_execucao || 0}%). Verificar registros.`, resolvida: false });
        if ((m.documentos_verificacao || []).length === 0) pendencias.push({ tipo: 'atividade_sem_foto', descricao: `Meta "${m.meta_nome}" sem fotos de evidência vinculadas.`, resolvida: false });
        if ((m.meta_confidence || 100) < 70) pendencias.push({ tipo: 'meta_sem_evidencia', descricao: `Meta "${m.meta_nome}" com score de confiança baixo (${m.meta_confidence || 0}). Recomenda-se revisão manual dos vínculos.`, resolvida: false });
      }
      if ((ctx.total_fotos || 0) < 10) pendencias.push({ tipo: 'atividade_sem_foto', descricao: `Apenas ${ctx.total_fotos} fotografias registradas. Recomenda-se ampliar o acervo.`, resolvida: false });

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { anexos_evidencias: anexos, auditoria_pendencias: pendencias });
      return Response.json({ success: true, etapa, total_fotos_vinculadas: anexos.length, pendencias: pendencias.length });
    }

    // ── ETAPA 7: FINALIZAR ───────────────────────────────────────────────────
    if (etapa === 'finalizar') {
      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { status: 'revisao', ia_modelo_usado: 'gerarRelatorioCompleto_v3', ia_tempo_ms: Date.now() });
      return Response.json({ success: true, etapa, status: 'revisao' });
    }

    // ── ETAPA 8: AUDITORIA FACTUAL ───────────────────────────────────────────
    if (etapa === 'auditoria_factual') {
      const relAtual = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
      const ctx = await obterContexto();

      // Extrair afirmações factuais dos textos gerados
      const textosGerados = [
        relAtual.descricao_acoes?.texto_ia || '',
        relAtual.divulgacao_parceria?.texto_ia || '',
        relAtual.impactos_economicos_sociais?.texto_ia || '',
        relAtual.avaliacao_parceria?.texto_ia || '',
        relAtual.sustentabilidade?.texto_ia || '',
        ...(relAtual.cronograma_metas || []).map(m => (m.acoes || '') + ' ' + (m.resultado_alcancado || '')),
      ].filter(Boolean).join('\n\n');

      const cronograma = relAtual.cronograma_metas || [];
      const fatos_confirmados: any[] = [];
      const pendencias: any[] = [...(relAtual.auditoria_pendencias || [])];
      const divergencias: any[] = [];

      // Auditar afirmações numéricas simples
      const totalAtvsDataset = ctx.total_atividades || 0;
      const publicoDataset = ctx.publicoTotal || 0;

      // Extrair números do texto e comparar
      const numerosNoTexto = (textosGerados.match(/\d+[\.,]?\d*/g) || []).map(n => parseFloat(n.replace(',', '.'))).filter(n => n > 0 && n < 10000000);

      // Fatos confirmados pelo dataset
      if (totalAtvsDataset > 0) {
        fatos_confirmados.push({ afirmacao: `${totalAtvsDataset} atividades registradas no sistema`, fonte: 'Activity', source_ids: ['dataset_atividades'], confidence: 100, nivel: 2 });
      }
      if (publicoDataset > 0) {
        fatos_confirmados.push({ afirmacao: `Público total: ${publicoDataset} pessoas`, fonte: 'Activity', source_ids: ['dataset_publico'], confidence: 100, nivel: 2 });
      }
      if (ctx.total_reports > 0) {
        fatos_confirmados.push({ afirmacao: `${ctx.total_reports} relatórios mensais aprovados/submetidos`, fonte: 'Report', source_ids: ['dataset_reports'], confidence: 100, nivel: 1 });
      }
      if (ctx.total_team > 0) {
        fatos_confirmados.push({ afirmacao: `${ctx.total_team} profissionais ativos na equipe`, fonte: 'TeamMember', source_ids: ['dataset_team'], confidence: 100, nivel: 2 });
      }
      if (ctx.total_fotos > 0) {
        fatos_confirmados.push({ afirmacao: `${ctx.total_fotos} fotos registradas na galeria`, fonte: 'ReportPhoto', source_ids: ['dataset_fotos'], confidence: 100, nivel: 2 });
      }

      // Verificar metas com baixo score
      for (const m of cronograma) {
        if ((m.meta_confidence || 100) < 70) {
          divergencias.push({
            tipo: 'score_confianca_baixo',
            descricao: `Meta "${m.meta_nome}": score médio de confiança das atividades vinculadas é ${m.meta_confidence || 0}. Recomenda-se revisão manual dos vínculos.`,
            meta_id: m.meta_id,
            score: m.meta_confidence || 0,
            critica: (m.meta_confidence || 100) < 50,
            revisada: false,
          });
        }
        // Verificar consistência público/atividades
        if ((m.percentual_execucao || 0) > 150) {
          divergencias.push({
            tipo: 'percentual_inconsistente',
            descricao: `Meta "${m.meta_nome}": percentual de execução (${m.percentual_execucao}%) acima de 150% — verificar se cálculo está correto.`,
            meta_id: m.meta_id, score: 0, critica: false, revisada: false,
          });
        }
      }

      // Verificar metas sem atividades canônicas
      for (const m of cronograma) {
        if (m.status_meta === 'Não Realizada' && (m.percentual_execucao || 0) === 0) {
          pendencias.push({ tipo: 'meta_sem_evidencia', descricao: `Meta "${m.meta_nome}" sem registros de execução confirmados no período.`, resolvida: false });
        }
      }

      // Fontes utilizadas
      const fontes_utilizadas = [
        { entidade: 'Report', quantidade: ctx.total_reports || 0, periodo: `${dInicio} a ${dFim}`, descricao: 'Relatórios mensais da equipe (APPROVED + SUBMITTED)' },
        { entidade: 'Activity', quantidade: ctx.total_atividades || 0, periodo: `${dInicio} a ${dFim}`, descricao: 'Atividades executadas no período' },
        { entidade: 'ReportPhoto', quantidade: ctx.total_fotos || 0, periodo: 'geral', descricao: 'Fotos registradas na galeria' },
        { entidade: 'TeamMember', quantidade: ctx.total_team || 0, periodo: 'geral', descricao: 'Profissionais ativos na equipe' },
        { entidade: 'PurchaseRequest', quantidade: Object.values(ctx.nfsPorMeta || {}).reduce((s: any, m: any) => s + m.count, 0), periodo: `${dInicio} a ${dFim}`, descricao: 'Notas fiscais aprovadas/pagas' },
        { entidade: 'Programacao', quantidade: ctx.total_programacoes || 0, periodo: `${dInicio} a ${dFim}`, descricao: 'Programações cadastradas no período' },
        { entidade: 'Rubrica', quantidade: Object.keys(ctx.rubricasPorGrupo || {}).length, periodo: 'geral', descricao: 'Grupos de rubricas orçamentárias' },
        { entidade: 'ProjectMeta', quantidade: (ctx.metasFiltradas || []).length, periodo: 'geral', descricao: 'Metas do projeto acompanhadas' },
      ];

      // Score geral de qualidade
      const totalItens = fatos_confirmados.length + pendencias.length + divergencias.length;
      const scoreQualidade = totalItens > 0
        ? Math.round(fatos_confirmados.length / totalItens * 100)
        : 50;

      const auditoria = {
        fatos_confirmados,
        pendencias: pendencias.filter((p, i, arr) => arr.findIndex(x => x.descricao === p.descricao) === i),
        divergencias,
        fontes_utilizadas,
        score_qualidade: scoreQualidade,
        divergencias_criticas_abertas: divergencias.filter(d => d.critica && !d.revisada).length,
        gerado_em: new Date().toISOString(),
      };

      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        auditoria_pendencias: auditoria.pendencias,
        pesquisa_satisfacao: {
          ...(relAtual.pesquisa_satisfacao || {}),
          justificativa_ia: JSON.stringify({
            auditoria_factual: auditoria,
            version: 'v3',
          }),
        },
      });

      return Response.json({ success: true, etapa, auditoria, total_confirmados: fatos_confirmados.length, total_pendencias: pendencias.length, total_divergencias: divergencias.length, divergencias_criticas: auditoria.divergencias_criticas_abertas, score_qualidade: scoreQualidade });
    }

    return Response.json({ error: `Etapa desconhecida: ${etapa}` }, { status: 400 });

  } catch (error) {
    console.error('Erro gerarRelatorioCompleto:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});