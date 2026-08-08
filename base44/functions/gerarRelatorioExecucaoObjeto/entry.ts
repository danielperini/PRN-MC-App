import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { invokeLLM } from '../_shared/gatewayIA.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      relatorio_id,
      tipo = 'parcial',
      data_inicio,
      data_fim,
      filtro_museu = 'todos',
      filtro_meta_ids = [],
      filtro_versao = 'consolidado'
    } = body;

    if (!data_inicio || !data_fim) {
      return Response.json({ error: 'data_inicio e data_fim são obrigatórios' }, { status: 400 });
    }

    const startTime = Date.now();
    let totalTokens = 0;

    // ── 1. Coletar dados de todas as fontes ──────────────────────────
    const srv = base44.asServiceRole;

    const [rubricas, metas, activities, programacoes, reports,
           solicitacoes, attachments, fornecedores, teamMembers,
           releases, fotosGaleria, contratos, pagamentos] = await Promise.all([
      srv.entities.Rubrica.list(),
      srv.entities.ProjectMeta.list(),
      srv.entities.Activity.filter({ data_realizacao: { $gte: data_inicio, $lte: data_fim } }),
      srv.entities.Programacao.filter({ data: { $gte: data_inicio, $lte: data_fim } }),
      srv.entities.Report.list(),
      srv.entities.PurchaseRequest.filter({
        status: { $in: ['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO'] },
        $or: [
          { approved_at: { $gte: data_inicio, $lte: data_fim } },
          { data_pagamento_efetivo: { $gte: data_inicio, $lte: data_fim } }
        ]
      }),
      srv.entities.Attachment.list(),
      srv.entities.Fornecedor.list(),
      srv.entities.TeamMember.list(),
      srv.entities.Release.list(),
      srv.entities.Attachment.filter({ file_type: { $regex: '^image/' } }),
      srv.entities.TermoCompromisso.list(),
      srv.entities.TeamPayment.list()
    ]);

    const museus = ['MHAB', 'MIS', 'MUMO'];
    const enderecosBase = {
      MHAB: 'Av. Otacílio Negrão de Lima, 1650 – Pampulha, Belo Horizonte/MG',
      MIS: 'Av. Afonso Pena, 800 – Centro, Belo Horizonte/MG',
      MUMO: 'Praça da Liberdade, s/n – Funcionários, Belo Horizonte/MG'
    };

    // Filtrar atividades por museu se necessário
    const atividadesFiltradas = filtro_museu === 'todos'
      ? activities
      : activities.filter(a => a.museu === filtro_museu || a.centro_custo?.includes(filtro_museu));

    // Filtrar metas se necessário
    const metasFiltradas = filtro_meta_ids.length > 0
      ? metas.filter(m => filtro_meta_ids.includes(m.id))
      : metas;

    // ── 2. Construir contexto para IA ────────────────────────────────
    const contexto = {
      periodo: `${data_inicio} a ${data_fim}`,
      tipo_relatorio: tipo,
      filtro_museu,
      total_atividades: atividadesFiltradas.length,
      total_programacoes: programacoes.length,
      total_solicitacoes: solicitacoes.length,
      atividades: atividadesFiltradas.slice(0, 100).map(a => ({
        titulo: a.titulo,
        descricao: a.descricao,
        data: a.data_realizacao,
        publico: a.publico_total,
        meta: a.meta_codigo,
        classificacao: a.classificacao,
        museu: a.museu || a.centro_custo,
        status_meta: a.status_meta
      })),
      metas: metasFiltradas.map(m => ({
        nome: m.nome,
        descricao: m.descricao,
        ordem: m.ordem,
        ativo: m.ativo
      })),
      rubricas_summary: rubricas.slice(0, 50).map(r => ({
        nome: r.rubrica,
        grupo: r.grupo,
        meta: r.meta,
        valor: r.valor_rubrica,
        natureza: r.natureza_despesa,
        museu: r.centro_custo
      })),
      programacoes: programacoes.slice(0, 50).map(p => ({
        titulo: p.titulo,
        data: p.data,
        local: p.local,
        tipo: p.tipo,
        publico: p.publico_estimado
      })),
      releases: releases.slice(0, 20).map(r => ({
        titulo: r.titulo,
        data: r.data_publicacao,
        veiculo: r.veiculo,
        tipo: r.tipo
      })),
      contratos_count: contratos.length,
      equipe: teamMembers.slice(0, 50).map(t => ({
        nome: t.nome,
        cargo: t.cargo || t.funcao,
        tipo_contratacao: t.tipo_contratacao,
        carga_horaria: t.carga_horaria,
        valor: t.valor_mensal || t.valor_total
      })),
      publico_total: atividadesFiltradas.reduce((sum, a) => sum + (a.publico_total || 0), 0),
      valor_total_solicitacoes: solicitacoes.reduce((sum, s) => sum + (s.valor_aprovado_admin || s.valor_solicitado || 0), 0)
    };

    const contextoStr = JSON.stringify(contexto, null, 2);

    // ── 3. Função auxiliar para chamar IA ────────────────────────────
    async function gerarSecao(promptEspecifico, responseSchema = null) {
      const prompt = `Você é um especialista em relatórios de prestação de contas culturais para a Prefeitura de Belo Horizonte.

CONTEXTO DO PERÍODO (${contexto.periodo}):
${contextoStr}

${promptEspecifico}

IMPORTANTE: Seja conciso, objetivo e formal. Use linguagem de relatório oficial. Não invente dados — baseie-se apenas no contexto fornecido.`;

      const opts = { prompt };
      if (responseSchema) opts.response_json_schema = responseSchema;

      const res = await invokeLLM(base44,opts);
      return res;
    }

    // ── 4. Atualizar status para "gerando_ia" ────────────────────────
    let relatorio;
    if (relatorio_id) {
      relatorio = await srv.entities.RelatorioExecucaoObjeto.get(relatorio_id);
      await srv.entities.RelatorioExecucaoObjeto.update(relatorio_id, { status: 'gerando_ia' });
    } else {
      relatorio = await srv.entities.RelatorioExecucaoObjeto.create({
        tipo,
        data_inicio,
        data_fim,
        filtro_museu,
        filtro_meta_ids,
        filtro_versao,
        status: 'gerando_ia',
        gerado_por_email: user.email,
        gerado_por_nome: user.full_name
      });
    }

    const rid = relatorio.id || relatorio_id;

    // ── 5. Gerar cada seção ──────────────────────────────────────────

    // 5.1 Identificação do Projeto (modo manual com valores padrão)
    const identificacao = {
      organizacao: 'Viaduto das Artes',
      projeto: 'Museus Centro',
      instrumento_juridico: relatorio.identificacao_projeto?.instrumento_juridico || '',
      processo_administrativo: relatorio.identificacao_projeto?.processo_administrativo || '',
      vigencia_inicio: data_inicio,
      vigencia_fim: data_fim,
      responsavel: relatorio.identificacao_projeto?.responsavel || user.full_name || '',
      telefone: relatorio.identificacao_projeto?.telefone || '',
      email: relatorio.identificacao_projeto?.email || user.email || ''
    };
    await srv.entities.RelatorioExecucaoObjeto.update(rid, { identificacao_projeto: identificacao });

    // 5.2 Endereço de Execução
    try {
      const promptEndereco = `Gere o texto da seção "ENDEREÇO DE EXECUÇÃO" do relatório.
Liste os endereços dos museus onde as atividades foram executadas, baseando-se nos museus mencionados nas atividades do contexto.
Use estes endereços oficiais:
- MHAB: Av. Otacílio Negrão de Lima, 1650 – Pampulha, Belo Horizonte/MG
- MIS: Av. Afonso Pena, 800 – Centro, Belo Horizonte/MG
- MUMO: Praça da Liberdade, s/n – Funcionários, Belo Horizonte/MG
- Casa Kubitschek: Av. Otacílio Negrão de Lima, 600 – Pampulha, Belo Horizonte/MG
- Casa do Baile: Av. Otacílio Negrão de Lima, 751 – Pampulha, Belo Horizonte/MG
- MAP: Av. Afonso Pena, 837 – Centro, Belo Horizonte/MG
Retorne APENAS o texto formatado, sem JSON.`;
      const textoEndereco = await gerarSecao(promptEndereco);
      await srv.entities.RelatorioExecucaoObjeto.update(rid, {
        endereco_execucao: { texto_ia: typeof textoEndereco === 'string' ? textoEndereco : '', texto_editado: '', modo: 'ia' }
      });
    } catch (e) { console.error('Erro endereco:', e.message); }

    // 5.3 Divulgação da Parceria
    try {
      const promptDivulgacao = `Gere a seção "DIVULGAÇÃO DA PARCERIA" do relatório de prestação de contas.
Descreva como a parceria entre Viaduto das Artes e Prefeitura de Belo Horizonte foi divulgada no período.
Inclua menções a: comunicação institucional, redes sociais (Instagram, Facebook), site, releases publicados, clipping de imprensa, e materiais gráficos produzidos.
Baseie-se nos dados de releases e comunicação do contexto.
Retorne APENAS o texto formatado, sem JSON. Máximo 1200 caracteres.`;
      const textoDivulgacao = await gerarSecao(promptDivulgacao);
      await srv.entities.RelatorioExecucaoObjeto.update(rid, {
        divulgacao_parceria: { texto_ia: typeof textoDivulgacao === 'string' ? textoDivulgacao : '', texto_editado: '', modo: 'ia' }
      });
    } catch (e) { console.error('Erro divulgacao:', e.message); }

    // 5.4 Descrição das Ações Executadas
    try {
      const promptAcoes = `Gere a seção "DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS" do relatório.
Resuma as principais ações executadas no período: atividades, eventos, exposições, ações educativas, programação cultural e eventos do Noturno.
Destaque os números mais relevantes.
Baseie-se exclusivamente nas atividades e programações listadas no contexto.
Retorne APENAS o texto formatado, sem JSON. Máximo 1500 caracteres.`;
      const textoAcoes = await gerarSecao(promptAcoes);
      await srv.entities.RelatorioExecucaoObjeto.update(rid, {
        descricao_acoes: { texto_ia: typeof textoAcoes === 'string' ? textoAcoes : '', texto_editado: '', modo: 'ia' }
      });
    } catch (e) { console.error('Erro acoes:', e.message); }

    // 5.5 Público Alvo (cálculos + IA interpretativa)
    const publicoPrevistoDireto = 50000;
    const publicoPrevistoIndireto = 150000;
    const publicoRealizadoDireto = contexto.publico_total;
    const publicoRealizadoIndireto = Math.round(contexto.publico_total * 2.5);

    try {
      const promptPublico = `Gere um texto interpretativo de 2 parágrafos sobre o público alcançado no período.
Dados:
- Público direto previsto: ${publicoPrevistoDireto}
- Público direto realizado: ${publicoRealizadoDireto}
- Público indireto previsto: ${publicoPrevistoIndireto}
- Público indireto realizado: ${publicoRealizadoIndireto}
- Diferença direto: ${publicoRealizadoDireto - publicoPrevistoDireto}
- Percentual direto: ${Math.round((publicoRealizadoDireto / publicoPrevistoDireto) * 100)}%
Analise se o resultado foi satisfatório e contextualize.
Retorne APENAS o texto, sem JSON.`;
      const textoPublico = await gerarSecao(promptPublico);
      await srv.entities.RelatorioExecucaoObjeto.update(rid, {
        publico_alvo: {
          previsto_direto: publicoPrevistoDireto,
          previsto_indireto: publicoPrevistoIndireto,
          realizado_direto: publicoRealizadoDireto,
          realizado_indireto: publicoRealizadoIndireto,
          diferenca_direto: publicoRealizadoDireto - publicoPrevistoDireto,
          diferenca_indireto: publicoRealizadoIndireto - publicoPrevistoIndireto,
          percentual_direto: Math.round((publicoRealizadoDireto / publicoPrevistoDireto) * 100),
          percentual_indireto: Math.round((publicoRealizadoIndireto / publicoPrevistoIndireto) * 100),
          texto_interpretativo_ia: typeof textoPublico === 'string' ? textoPublico : '',
          texto_interpretativo_editado: '',
          modo: 'ia'
        }
      });
    } catch (e) { console.error('Erro publico:', e.message); }

    // 5.6 Pesquisa de Satisfação
    await srv.entities.RelatorioExecucaoObjeto.update(rid, {
      pesquisa_satisfacao: {
        possui_dados: false,
        justificativa_ia: 'Não foram aplicados formulários de pesquisa de satisfação neste período.',
        justificativa_editada: '',
        modo: 'ia'
      }
    });

    // 5.7 Cronograma de Metas — principal bloco
    try {
      const cronogramaMetas = [];
      for (const meta of metasFiltradas.filter(m => m.ativo !== false)) {
        const atividadesDaMeta = atividadesFiltradas.filter(a =>
          a.meta_codigo && meta.nome && (
            a.meta_codigo.includes(meta.nome.substring(0, 10)) ||
            meta.nome.includes(a.meta_codigo?.substring(0, 10))
          )
        );

        const promptMeta = `Analise a meta "${meta.nome}" (${meta.descricao || ''}) com base nas seguintes atividades executadas:
${JSON.stringify(atividadesDaMeta.slice(0, 10).map(a => ({
  titulo: a.titulo,
  data: a.data_realizacao,
  publico: a.publico_total,
  status: a.status_meta
})), null, 2)}

Retorne um JSON com:
- resultado_esperado: o que se esperava alcançar (1-2 frases baseado na descrição da meta)
- acoes: principais ações realizadas (1-2 frases)
- periodo: período de execução
- resultado_alcancado: o que foi alcançado (1-2 frases)
- status_meta: "Realizada Integralmente", "Realizada Parcialmente" ou "Não Realizada"
- percentual_execucao: número de 0 a 100
- justificativa: justificativa técnica se não foi integralmente realizada`;

        try {
          const analiseMeta = await gerarSecao(promptMeta, {
            type: 'object',
            properties: {
              resultado_esperado: { type: 'string' },
              acoes: { type: 'string' },
              periodo: { type: 'string' },
              resultado_alcancado: { type: 'string' },
              status_meta: { type: 'string', enum: ['Realizada Integralmente', 'Realizada Parcialmente', 'Não Realizada'] },
              percentual_execucao: { type: 'number' },
              justificativa: { type: 'string' }
            },
            required: ['resultado_esperado', 'acoes', 'status_meta', 'percentual_execucao']
          });

          cronogramaMetas.push({
            meta_id: meta.id,
            meta_nome: meta.nome,
            meta_ordem: meta.ordem || 0,
            resultado_esperado: analiseMeta.resultado_esperado || '',
            acoes: analiseMeta.acoes || '',
            periodo: analiseMeta.periodo || `${data_inicio} a ${data_fim}`,
            documentos_verificacao: [],
            resultado_alcancado: analiseMeta.resultado_alcancado || '',
            status_meta: analiseMeta.status_meta || 'Realizada Parcialmente',
            percentual_execucao: analiseMeta.percentual_execucao || 0,
            justificativa: analiseMeta.justificativa || '',
            modo: 'ia'
          });
        } catch (e) {
          cronogramaMetas.push({
            meta_id: meta.id,
            meta_nome: meta.nome,
            meta_ordem: meta.ordem || 0,
            resultado_esperado: meta.descricao || '',
            acoes: `${atividadesDaMeta.length} atividades registradas`,
            periodo: `${data_inicio} a ${data_fim}`,
            documentos_verificacao: [],
            resultado_alcancado: '',
            status_meta: atividadesDaMeta.length > 0 ? 'Realizada Parcialmente' : 'Não Realizada',
            percentual_execucao: 0,
            justificativa: '',
            modo: 'ia'
          });
        }
      }

      await srv.entities.RelatorioExecucaoObjeto.update(rid, { cronograma_metas: cronogramaMetas });
    } catch (e) { console.error('Erro cronograma metas:', e.message); }

    // 5.8 Equipe de Trabalho
    try {
      const equipe = contexto.equipe.map(t => ({
        nome: t.nome || '',
        cargo: t.cargo || '',
        tipo_contratacao: t.tipo_contratacao || 'Pessoa Jurídica',
        carga_horaria: t.carga_horaria?.toString() || '',
        valor: t.valor || 0,
        periodo: `${data_inicio} a ${data_fim}`,
        modo: 'ia'
      }));
      await srv.entities.RelatorioExecucaoObjeto.update(rid, { equipe_trabalho: equipe });
    } catch (e) { console.error('Erro equipe:', e.message); }

    // 5.9 Impactos Econômicos e Sociais
    try {
      const promptImpactos = `Gere a seção "IMPACTOS ECONÔMICOS E SOCIAIS" do relatório.
Analise os impactos do projeto considerando:
- Público total alcançado: ${contexto.publico_total}
- ${contexto.total_atividades} atividades realizadas
- ${contexto.total_solicitacoes} solicitações de compra aprovadas (R$ ${contexto.valor_total_solicitacoes.toFixed(2)})
- Museus envolvidos: ${filtro_museu === 'todos' ? 'MHAB, MIS, MUMO' : filtro_museu}
- Aspectos: inclusão, acessibilidade, formação de público, economia criativa, turismo cultural, patrimônio
Retorne APENAS o texto formatado, sem JSON. Máximo 2000 caracteres.`;
      const textoImpactos = await gerarSecao(promptImpactos);
      await srv.entities.RelatorioExecucaoObjeto.update(rid, {
        impactos_economicos_sociais: { texto_ia: typeof textoImpactos === 'string' ? textoImpactos : '', texto_editado: '', modo: 'ia' }
      });
    } catch (e) { console.error('Erro impactos:', e.message); }

    // 5.10 Sustentabilidade (apenas relatório final)
    if (tipo === 'final') {
      try {
        const promptSustentabilidade = `Gere a seção "SUSTENTABILIDADE" do relatório final.
Descreva as perspectivas de sustentabilidade do projeto Museus Centro após o término do convênio, incluindo:
- Continuidade das ações culturais
- Legado para os museus
- Parcerias estabelecidas
- Capacidade técnica instalada
Retorne APENAS o texto formatado, sem JSON. Máximo 1000 caracteres.`;
        const textoSustentabilidade = await gerarSecao(promptSustentabilidade);
        await srv.entities.RelatorioExecucaoObjeto.update(rid, {
          sustentabilidade: { texto_ia: typeof textoSustentabilidade === 'string' ? textoSustentabilidade : '', texto_editado: '', modo: 'ia' }
        });
      } catch (e) { console.error('Erro sustentabilidade:', e.message); }
    }

    // 5.11 Avaliação da Parceria
    try {
      const promptAvaliacao = `Gere a seção "AVALIAÇÃO DA PARCERIA" do relatório.
Avalie a parceria entre Viaduto das Artes e Prefeitura de Belo Horizonte / SUCC no período, considerando:
- Execução das metas
- Desafios enfrentados
- Aprendizados
- Gargalos operacionais
- Recomendações
Retorne APENAS o texto formatado, sem JSON. Máximo 1500 caracteres.`;
      const textoAvaliacao = await gerarSecao(promptAvaliacao);
      await srv.entities.RelatorioExecucaoObjeto.update(rid, {
        avaliacao_parceria: { texto_ia: typeof textoAvaliacao === 'string' ? textoAvaliacao : '', texto_editado: '', modo: 'ia' }
      });
    } catch (e) { console.error('Erro avaliacao:', e.message); }

    // 5.12 Assinatura
    const assinatura = {
      nome_representante: user.full_name || '',
      cargo: 'Coordenador Geral',
      data: new Date().toISOString().split('T')[0],
      modo: 'ia'
    };
    await srv.entities.RelatorioExecucaoObjeto.update(rid, { assinatura });

    // 5.13 Anexos — Evidências Fotográficas
    try {
      const anexos = fotosGaleria.slice(0, 30).map(f => ({
        foto_url: f.file_url || '',
        atividade_nome: f.description || 'Evidência fotográfica',
        atividade_data: f.created_date?.split('T')[0] || '',
        local: '',
        meta_nome: '',
        legenda_ia: f.description || 'Foto anexada como evidência',
        legenda_editada: ''
      }));
      await srv.entities.RelatorioExecucaoObjeto.update(rid, { anexos_evidencias: anexos });
    } catch (e) { console.error('Erro anexos:', e.message); }

    // ── Auditoria de pendências ─────────────────────────────────────
    const pendencias = [];
    const cronogramaAtual = (await srv.entities.RelatorioExecucaoObjeto.get(rid)).cronograma_metas || [];
    for (const meta of cronogramaAtual) {
      if (meta.percentual_execucao < 50) {
        pendencias.push({ tipo: 'meta_sem_evidencia', descricao: `Meta "${meta.meta_nome}" com baixa execução (${meta.percentual_execucao}%)`, resolvida: false });
      }
    }
    for (const atividade of atividadesFiltradas) {
      const temFoto = attachments.some(a => a.activity_id === atividade.id && (a.file_type?.startsWith('image/')));
      if (!temFoto && atividade.classificacao === 'META') {
        pendencias.push({ tipo: 'atividade_sem_foto', descricao: `Atividade "${atividade.titulo}" sem evidência fotográfica`, resolvida: false });
      }
    }
    await srv.entities.RelatorioExecucaoObjeto.update(rid, { auditoria_pendencias: pendencias });

    // ── Finalizar ─────────────────────────────────────────────────────
    const elapsed = Date.now() - startTime;
    await srv.entities.RelatorioExecucaoObjeto.update(rid, {
      status: 'revisao',
      ia_modelo_usado: 'gemini_3_flash',
      ia_tempo_ms: elapsed
    });

    return Response.json({
      success: true,
      relatorio_id: rid,
      status: 'revisao',
      pendencias: pendencias.length,
      tempo_ms: elapsed
    });

  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});