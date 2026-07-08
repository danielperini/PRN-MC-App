import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function fmtDateBR(d: string) {
  if (!d) return '';
  const p = String(d).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function dentroDoPeríodo(data: string | undefined, inicio: Date, fim: Date): boolean {
  if (!data) return false;
  const d = new Date(String(data).split('T')[0]);
  return !isNaN(d.getTime()) && d >= inicio && d <= fim;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { relatorio_id, data_inicio, data_fim, filtro_museu = 'todos' } = body;

    if (!relatorio_id || !data_inicio || !data_fim) {
      return Response.json({ error: 'relatorio_id, data_inicio e data_fim são obrigatórios' }, { status: 400 });
    }

    const inicio = new Date(data_inicio + 'T00:00:00');
    const fim = new Date(data_fim + 'T23:59:59');

    // ── Buscar dados em paralelo ─────────────────────────────────────────────
    const [atividades, teamMembers, teamPayments, purchases, projectMetas] = await Promise.all([
      base44.asServiceRole.entities.Activity.list('-data_realizacao', 500).catch(() => []),
      base44.asServiceRole.entities.TeamMember.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.TeamPayment.list('-created_date', 300).catch(() => []),
      base44.asServiceRole.entities.PurchaseRequest.filter(
        { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] } },
        '-created_date', 500
      ).catch(() => []),
      base44.asServiceRole.entities.ProjectMeta.filter({ ativo: true }, 'ordem', 50).catch(() => []),
    ]);

    // ── Filtrar atividades do período ────────────────────────────────────────
    const atividadesPeriodo = (atividades as any[]).filter(a => {
      const d = a.data_realizacao || a.data_inicio || a.created_date;
      return dentroDoPeríodo(d, inicio, fim);
    });

    // ── Filtrar compras aprovadas do período ─────────────────────────────────
    const comprasPeriodo = (purchases as any[]).filter(p => {
      const d = p.nf_data_emissao || p.aprov_admin_data || p.aprov_coord_data || p.created_date;
      return dentroDoPeríodo(d, inicio, fim);
    });

    // ── Filtrar pagamentos de equipe do período ───────────────────────────────
    const pagamentosPeriodo = (teamPayments as any[]).filter(tp => {
      const d = tp.competencia || tp.data_pagamento || tp.created_date;
      return dentroDoPeríodo(d, inicio, fim);
    });

    // ── Público total do período ─────────────────────────────────────────────
    const publicoTotal = atividadesPeriodo.reduce((acc: number, a: any) =>
      acc + (Number(a.publico_total) || 0), 0);

    // ── Construir cronograma de metas ────────────────────────────────────────
    const metaMap = new Map<string, any>();

    // Inicializar metas com dados de ProjectMeta
    for (const pm of projectMetas as any[]) {
      const key = pm.id;
      metaMap.set(key, {
        meta_id: key,
        meta_nome: `${pm.ordem || ''}. ${pm.nome}`.trim(),
        meta_ordem: pm.ordem || 999,
        resultado_esperado: pm.descricao || pm.nome || '',
        acoes_lista: [],
        publico_acumulado: 0,
        docs: new Set<string>(['Lista de presença', 'Registros fotográficos']),
        resultado_alcancado_txts: [],
        status_metas: [],
      });
    }

    // Agrupar atividades nas metas
    for (const a of atividadesPeriodo) {
      if (a.classificacao !== 'META') continue;
      const metaKey = a.meta_id || a.meta_codigo;
      if (!metaKey) continue;

      if (!metaMap.has(metaKey)) {
        metaMap.set(metaKey, {
          meta_id: metaKey,
          meta_nome: `Meta ${metaKey}`,
          meta_ordem: 999,
          resultado_esperado: a.indicador_previsto || '',
          acoes_lista: [],
          publico_acumulado: 0,
          docs: new Set<string>(['Lista de presença']),
          resultado_alcancado_txts: [],
          status_metas: [],
        });
      }

      const m = metaMap.get(metaKey);
      if (a.titulo) m.acoes_lista.push(a.titulo);
      m.publico_acumulado += Number(a.publico_total) || 0;
      if (a.resultado_alcancado) m.resultado_alcancado_txts.push(a.resultado_alcancado);
      if (a.status_meta) m.status_metas.push(a.status_meta);
      if (a.fotos?.length) m.docs.add('Registros fotográficos');
      if (a.documentos?.length) m.docs.add('Documentos comprobatórios');
    }

    // Montar array final de metas (apenas as que têm atividades ou foram pré-populadas)
    const cronogramaMetas = Array.from(metaMap.values())
      .filter((m: any) => m.acoes_lista.length > 0)
      .map((m: any) => {
        const statusMeta = m.status_metas[0] ||
          (m.publico_acumulado > 0 ? 'Realizada Integralmente' : 'Realizada Parcialmente');
        const percentual = statusMeta.includes('Integral') ? 100 : statusMeta.includes('Parcial') ? 50 : 0;
        const resultado = m.resultado_alcancado_txts.length > 0
          ? m.resultado_alcancado_txts[0]
          : `Realizadas ${m.acoes_lista.length} ação(ões) no período, com ${m.publico_acumulado.toLocaleString('pt-BR')} participantes.`;
        return {
          meta_id: m.meta_id,
          meta_nome: m.meta_nome,
          meta_ordem: m.meta_ordem,
          resultado_esperado: m.resultado_esperado || `Execução das ações da ${m.meta_nome}`,
          acoes: m.acoes_lista.slice(0, 5).join('; '),
          periodo: `${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}`,
          documentos_verificacao: Array.from(m.docs),
          resultado_alcancado: resultado,
          status_meta: statusMeta,
          percentual_execucao: percentual,
          justificativa: '',
          modo: 'automatico',
        };
      })
      .sort((a: any, b: any) => (a.meta_ordem || 0) - (b.meta_ordem || 0));

    // ── Equipe de trabalho ────────────────────────────────────────────────────
    const equipeMap = new Map<string, any>();
    for (const m of teamMembers as any[]) {
      equipeMap.set(m.id, {
        nome: m.nome || m.full_name || '',
        cargo: m.cargo || m.funcao || m.funcao_projeto || '',
        tipo_contratacao: m.tipo_contrato || m.tipo_contratacao || 'RPA',
        atribuicoes: m.descricao_atividades || m.objeto || m.cargo || '',
        periodo: `${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}`,
        carga_horaria: m.carga_horaria_semanal ? `${m.carga_horaria_semanal}h/sem` : '',
        valor: 0,
      });
    }

    // Somar pagamentos do período à equipe
    for (const tp of pagamentosPeriodo as any[]) {
      if (tp.team_member_id && equipeMap.has(tp.team_member_id)) {
        const m = equipeMap.get(tp.team_member_id);
        m.valor += Number(tp.valor_liquido || tp.valor_bruto || tp.valor || 0);
      }
    }

    const equipeTrabalho = Array.from(equipeMap.values()).filter(m => m.nome);

    // ── Links de documentos (NF, XML, comprovante, Drive) ───────────────────
    const linksDocumentos = comprasPeriodo
      .filter((p: any) => p.nota_fiscal_url || p.nf_pdf_url || p.file_url || p.drive_backup_folder_url)
      .map((p: any) => ({
        id: p.id,
        descricao: p.descricao_item || '',
        fornecedor: p.fornecedor_nome || p.nf_emitente_nome || '',
        nf_numero: p.nf_numero || '',
        valor: Number(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0),
        data_emissao: p.nf_data_emissao || p.aprov_admin_data || '',
        centro_custo: p.centro_custo || '',
        rubrica_nome: p.rubrica_nome || '',
        nf_pdf_url: p.nota_fiscal_url || p.nf_pdf_url || p.file_url || '',
        nf_xml_url: p.nf_xml_url || p.xml_url || '',
        comprovante_url: p.comprovante_pagamento_url || p.comprovante_url || '',
        drive_folder_url: p.drive_backup_folder_url || '',
      }));

    // Totais
    const totalFinanceiro = comprasPeriodo.reduce((acc: number, p: any) =>
      acc + Number(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0), 0);

    // ── Público alvo ─────────────────────────────────────────────────────────
    const publicoAlvo = {
      previsto_direto: publicoTotal,
      previsto_indireto: Math.round(publicoTotal * 1.5),
      realizado_direto: publicoTotal,
      realizado_indireto: 0,
      diferenca_direto: 0,
      diferenca_indireto: 0,
      percentual_direto: publicoTotal > 0 ? 100 : 0,
      percentual_indireto: 0,
      texto_interpretativo_ia: publicoTotal > 0
        ? `No período de ${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}, o projeto alcançou ${publicoTotal.toLocaleString('pt-BR')} participantes diretos distribuídos em ${atividadesPeriodo.length} atividades realizadas. As ações envolveram públicos diversificados nos museus participantes, com foco em acessibilidade cultural e formação de público.`
        : '',
      modo: 'automatico',
    };

    // ── Salvar no relatório ──────────────────────────────────────────────────
    await base44.asServiceRole.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
      cronograma_metas: cronogramaMetas,
      equipe_trabalho: equipeTrabalho,
      publico_alvo: publicoAlvo,
      status: 'revisao',
      // Campos auxiliares para o painel e PDF
      _links_documentos: linksDocumentos,
      _total_financeiro: totalFinanceiro,
      _total_financeiro_fmt: fmtBRL(totalFinanceiro),
      _total_atividades: atividadesPeriodo.length,
      _total_compras_aprovadas: comprasPeriodo.length,
    });

    return Response.json({
      success: true,
      resumo: {
        total_atividades: atividadesPeriodo.length,
        total_metas_identificadas: cronogramaMetas.length,
        total_equipe: equipeTrabalho.length,
        publico_total: publicoTotal,
        total_compras: comprasPeriodo.length,
        total_financeiro: totalFinanceiro,
        total_financeiro_fmt: fmtBRL(totalFinanceiro),
        total_links_documentos: linksDocumentos.length,
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});