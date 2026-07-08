import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Normaliza datas para comparação
function parseDate(d: string): Date { return new Date(d + 'T00:00:00'); }

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function fmtDateBR(d: string) {
  if (!d) return '';
  const p = String(d).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function dentroDoPeríodo(data: string | undefined, inicio: Date, fim: Date): boolean {
  if (!data) return false;
  const d = new Date(data);
  return d >= inicio && d <= fim;
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

    const inicio = parseDate(data_inicio);
    const fim = parseDate(data_fim + 'T23:59:59');

    // ── Buscar dados em paralelo ─────────────────────────────────────────────
    const [atividades, rubricas, teamMembers, teamPayments, purchases, projectMetas] = await Promise.all([
      base44.asServiceRole.entities.Activity.filter({}, '-data_realizacao', 500).catch(() => []),
      base44.asServiceRole.entities.Rubrica.filter({ ativo: true }, 'ordem_exibicao', 300).catch(() => []),
      base44.asServiceRole.entities.TeamMember.filter({}, '-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.TeamPayment.filter({}, '-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.PurchaseRequest.filter(
        { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] } },
        '-created_date', 500
      ).catch(() => []),
      base44.asServiceRole.entities.ProjectMeta.filter({ ativo: true }, 'ordem', 100).catch(() => []),
    ]);

    // ── Filtrar atividades do período ────────────────────────────────────────
    const atividadesPeriodo = (atividades as any[]).filter(a => {
      const d = a.data_realizacao || a.data_inicio || a.created_date;
      if (!d) return false;
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return false;
      return dt >= inicio && dt <= fim;
    });

    // ── Filtrar compras aprovadas do período ─────────────────────────────────
    const comprasPeriodo = (purchases as any[]).filter(p => {
      const d = p.nf_data_emissao || p.aprov_admin_data || p.aprov_coord_data || p.created_date;
      return dentroDoPeríodo(d, inicio, fim);
    });

    // ── Público total do período ─────────────────────────────────────────────
    const publicoTotal = atividadesPeriodo.reduce((acc: number, a: any) => acc + (Number(a.publico_total) || 0), 0);

    // ── Construir cronograma de metas ────────────────────────────────────────
    // Agrupa atividades por meta_codigo
    const metaMap = new Map<string, any>();
    for (const a of atividadesPeriodo) {
      if (a.classificacao === 'META' && a.meta_codigo) {
        const key = a.meta_codigo;
        if (!metaMap.has(key)) {
          const pm = (projectMetas as any[]).find(m =>
            String(m.nome || '').includes(key) || String(m.id || '') === key
          );
          metaMap.set(key, {
            meta_id: key,
            meta_nome: pm ? `${pm.ordem || ''}. ${pm.nome}` : `Meta ${key}`,
            meta_ordem: pm?.ordem || 0,
            acoes: [],
            publico_acumulado: 0,
            docs: new Set<string>(),
            resultado_esperado: pm?.descricao || '',
          });
        }
        const m = metaMap.get(key);
        m.acoes.push(a.titulo || a.descricao || 'Ação realizada');
        m.publico_acumulado += Number(a.publico_total) || 0;
        if (a.meta_quantitativa) m.indicador = a.meta_quantitativa;
        if (a.resultado_alcancado) m.resultado_alcancado_txt = a.resultado_alcancado;
        if (a.status_meta) m.status_meta_txt = a.status_meta;
        // docs de verificação
        if (a.fotos?.length) m.docs.add('Registros fotográficos');
        if (a.documentos?.length) m.docs.add('Documentos comprobatórios');
        if (publicoTotal > 0) m.docs.add('Lista de presença');
      }
    }

    const cronogramaMetas = Array.from(metaMap.values()).map((m: any) => {
      const statusMeta = m.status_meta_txt ||
        (m.publico_acumulado > 0 ? 'Realizada Integralmente' : 'Realizada Parcialmente');
      const percentual = m.publico_acumulado > 0 ? 100 : 50;
      return {
        meta_id: m.meta_id,
        meta_nome: m.meta_nome,
        meta_ordem: m.meta_ordem,
        resultado_esperado: m.resultado_esperado || `Execução das ações previstas na ${m.meta_nome}`,
        acoes: m.acoes.slice(0, 5).join('; '),
        periodo: `${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}`,
        documentos_verificacao: Array.from(m.docs),
        resultado_alcancado: m.resultado_alcancado_txt || `Realizadas ${m.acoes.length} ação(ões) no período, com ${m.publico_acumulado.toLocaleString('pt-BR')} participantes.`,
        status_meta: statusMeta,
        percentual_execucao: percentual,
        justificativa: '',
        modo: 'automatico',
      };
    }).sort((a: any, b: any) => (a.meta_ordem || 0) - (b.meta_ordem || 0));

    // ── Equipe de trabalho ────────────────────────────────────────────────────
    const equipeMap = new Map<string, any>();
    for (const m of teamMembers as any[]) {
      if (!equipeMap.has(m.id)) {
        equipeMap.set(m.id, {
          nome: m.nome || m.full_name || '',
          cargo: m.cargo || m.funcao || m.funcao_projeto || '',
          tipo_contratacao: m.tipo_contrato || m.tipo_contratacao || 'RPA',
          atribuicoes: m.descricao_atividades || m.objeto || '',
          periodo: `${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}`,
          carga_horaria: m.carga_horaria_semanal ? `${m.carga_horaria_semanal}h/semana` : '',
          valor: 0,
        });
      }
    }

    // Vincular pagamentos à equipe
    for (const tp of teamPayments as any[]) {
      const d = tp.competencia || tp.created_date;
      if (!dentroDoPeríodo(d, inicio, fim)) continue;
      if (tp.team_member_id && equipeMap.has(tp.team_member_id)) {
        const m = equipeMap.get(tp.team_member_id);
        m.valor += Number(tp.valor_liquido || tp.valor_bruto || tp.valor || 0);
      }
    }

    const equipeTrabalho = Array.from(equipeMap.values());

    // ── Links de documentos das compras ──────────────────────────────────────
    const linksDocumentos = comprasPeriodo.map((p: any) => ({
      id: p.id,
      descricao: p.descricao_item || '',
      fornecedor: p.fornecedor_nome || '',
      nf_numero: p.nf_numero || '',
      valor: Number(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0),
      data_emissao: p.nf_data_emissao || p.aprov_admin_data || '',
      centro_custo: p.centro_custo || '',
      rubrica_nome: p.rubrica_nome || '',
      nf_pdf_url: p.nota_fiscal_url || p.nf_pdf_url || p.file_url || '',
      nf_xml_url: p.nf_xml_url || p.xml_url || '',
      comprovante_url: p.comprovante_pagamento_url || p.comprovante_url || '',
      drive_folder_url: p.drive_backup_folder_url || '',
      drive_pdf_url: p.drive_backup_files?.[0]?.url || '',
    })).filter((d: any) => d.nf_pdf_url || d.nf_xml_url || d.drive_folder_url);

    // Total financeiro aprovado do período
    const totalFinanceiro = comprasPeriodo.reduce((acc: number, p: any) =>
      acc + Number(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0), 0);

    // ── Resumo de rubricas ────────────────────────────────────────────────────
    const rubricasResumo = (rubricas as any[])
      .filter((r: any) => r.valor_utilizado > 0)
      .map((r: any) => ({
        nome: r.rubrica || r.nome || '',
        grupo: r.grupo || '',
        valor_previsto: r.valor_rubrica || r.valor_total || 0,
        valor_utilizado: r.valor_utilizado || 0,
        saldo: r.saldo || 0,
        percentual: r.percentual_utilizado || 0,
      }))
      .slice(0, 30);

    // ── Preencher relatório ───────────────────────────────────────────────────
    const updatePayload: any = {
      cronograma_metas: cronogramaMetas,
      equipe_trabalho: equipeTrabalho,
      publico_alvo: {
        previsto_direto: publicoTotal,
        previsto_indireto: Math.round(publicoTotal * 1.5),
        realizado_direto: publicoTotal,
        realizado_indireto: 0,
        diferenca_direto: 0,
        diferenca_indireto: 0,
        percentual_direto: 100,
        percentual_indireto: 0,
        texto_interpretativo_ia: `No período de ${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}, o projeto alcançou ${publicoTotal.toLocaleString('pt-BR')} participantes diretos por meio de ${atividadesPeriodo.length} atividades realizadas. As ações envolveram públicos diversificados nos museus participantes, com foco em acessibilidade cultural e formação de público.`,
        modo: 'automatico',
      },
      status: 'revisao',
      // Metadados adicionais para o PDF
      _links_documentos: linksDocumentos,
      _total_financeiro: totalFinanceiro,
      _total_financeiro_fmt: fmtBRL(totalFinanceiro),
      _rubricas_resumo: rubricasResumo,
      _total_atividades: atividadesPeriodo.length,
      _total_compras_aprovadas: comprasPeriodo.length,
    };

    await base44.asServiceRole.entities.RelatorioExecucaoObjeto.update(relatorio_id, updatePayload);

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