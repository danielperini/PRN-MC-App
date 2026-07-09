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
  const d = new Date(String(data).split('T')[0] + 'T12:00:00');
  return !isNaN(d.getTime()) && d >= inicio && d <= fim;
}

async function fetchAllPages(entity: any, filter: any, sort: string, pageSize = 200): Promise<any[]> {
  const results: any[] = [];
  let skip = 0;
  while (true) {
    const page = await entity.filter(filter, sort, pageSize, skip).catch(() => []);
    if (!Array.isArray(page) || page.length === 0) break;
    results.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const { relatorio_id, data_inicio, data_fim, filtro_museu = 'todos' } = body;

    if (!relatorio_id || !data_inicio || !data_fim) {
      return Response.json({ error: 'relatorio_id, data_inicio e data_fim são obrigatórios' }, { status: 400 });
    }

    const inicio = new Date(data_inicio + 'T00:00:00');
    const fim = new Date(data_fim + 'T23:59:59');

    // ── Buscar dados em paralelo ─────────────────────────────────────────────
    const [todasAtividades, teamMembers, teamPayments, todasCompras, projectMetas, rubricas] = await Promise.all([
      fetchAllPages(base44.asServiceRole.entities.Activity, {}, '-data_realizacao', 200),
      base44.asServiceRole.entities.TeamMember.list('-created_date', 300).catch(() => []),
      fetchAllPages(base44.asServiceRole.entities.TeamPayment, {}, '-created_date', 200),
      fetchAllPages(
        base44.asServiceRole.entities.PurchaseRequest,
        { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] } },
        '-created_date',
        200
      ),
      base44.asServiceRole.entities.ProjectMeta.filter({ ativo: true }, 'ordem', 50).catch(() => []),
      base44.asServiceRole.entities.Rubrica.filter({ ativo: true }, 'ordem_exibicao', 300).catch(() => []),
    ]);

    // ── Filtrar atividades do período ────────────────────────────────────────
    const atividadesPeriodo = (todasAtividades as any[]).filter(a => {
      if (filtro_museu !== 'todos') {
        const report = a.museu || a.centro_custo || '';
        if (report && !report.includes(filtro_museu)) return false;
      }
      const d = a.data_realizacao || a.data_inicio || a.created_date;
      return dentroDoPeríodo(d, inicio, fim);
    });

    // ── Filtrar compras aprovadas do período ─────────────────────────────────
    const comprasPeriodo = (todasCompras as any[]).filter(p => {
      if (filtro_museu !== 'todos' && p.centro_custo && !p.centro_custo.includes(filtro_museu)) return false;
      const d = p.nf_data_emissao || p.aprov_admin_data || p.aprov_coord_data || p.created_date;
      return dentroDoPeríodo(d, inicio, fim);
    });

    // ── Filtrar pagamentos de equipe do período ─────────────────────────────
    const pagamentosPeriodo = (teamPayments as any[]).filter(tp => {
      const d = tp.competencia || tp.data_pagamento || tp.created_date;
      return dentroDoPeríodo(d, inicio, fim);
    });

    // ── Público total do período ─────────────────────────────────────────────
    const publicoTotal = atividadesPeriodo.reduce((acc: number, a: any) =>
      acc + (Number(a.publico_total) || 0), 0);

    // ── Construir cronograma de metas ────────────────────────────────────────
    const metaMapById = new Map<string, any>();
    for (const pm of projectMetas as any[]) {
      metaMapById.set(pm.id, pm);
    }

    const metaMap = new Map<string, any>();

    for (const a of atividadesPeriodo) {
      if (a.classificacao !== 'META') continue;
      const metaKey = a.meta_id || a.meta_codigo;
      if (!metaKey) continue;

      if (!metaMap.has(metaKey)) {
        const pm = metaMapById.get(metaKey);
        metaMap.set(metaKey, {
          meta_id: metaKey,
          meta_nome: pm ? `${pm.ordem}. ${pm.nome}` : `Meta ${metaKey}`,
          meta_ordem: pm?.ordem || 999,
          resultado_esperado: pm?.descricao || a.indicador_previsto || '',
          acoes_lista: [],
          publico_acumulado: 0,
          docs: new Set<string>(['Lista de presença', 'Registros fotográficos']),
          resultado_alcancado_txts: [],
          status_metas: [],
          datas: [],
        });
      }

      const m = metaMap.get(metaKey);
      if (a.titulo) m.acoes_lista.push(a.titulo);
      m.publico_acumulado += Number(a.publico_total) || 0;
      if (a.resultado_alcancado) m.resultado_alcancado_txts.push(a.resultado_alcancado);
      if (a.status_meta) m.status_metas.push(a.status_meta);
      if (a.data_realizacao) m.datas.push(a.data_realizacao);
      if (a.fotos?.length) m.docs.add('Registros fotográficos');
      if (a.documentos?.length) m.docs.add('Documentos comprobatórios');
    }

    const cronogramaMetas = Array.from(metaMap.values())
      .sort((a: any, b: any) => (a.meta_ordem || 0) - (b.meta_ordem || 0))
      .map((m: any) => {
        const statusMeta = m.status_metas.includes('Superada') ? 'Realizada Integralmente'
          : m.status_metas.includes('Cumprida') ? 'Realizada Integralmente'
          : m.status_metas.includes('Parcial') ? 'Realizada Parcialmente'
          : m.acoes_lista.length > 0 ? 'Realizada Integralmente'
          : 'Realizada Parcialmente';

        const percentual = statusMeta.includes('Integral') ? 100
          : statusMeta.includes('Parcial') ? 50 : 0;

        const resultado = m.resultado_alcancado_txts.length > 0
          ? m.resultado_alcancado_txts.join('. ')
          : `${m.acoes_lista.length} ação(ões) realizada(s) no período com ${m.publico_acumulado.toLocaleString('pt-BR')} participante(s) direto(s).`;

        // Período real das atividades ou o período do relatório
        const datasOrdenadas = m.datas.sort();
        const periodoStr = datasOrdenadas.length > 0
          ? `${fmtDateBR(datasOrdenadas[0])} a ${fmtDateBR(datasOrdenadas[datasOrdenadas.length - 1])}`
          : `${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}`;

        return {
          meta_id: m.meta_id,
          meta_nome: m.meta_nome,
          meta_ordem: m.meta_ordem,
          resultado_esperado: m.resultado_esperado || `Execução das ações da ${m.meta_nome}`,
          acoes: m.acoes_lista.slice(0, 8).join('; '),
          periodo: periodoStr,
          documentos_verificacao: Array.from(m.docs),
          resultado_alcancado: resultado,
          status_meta: statusMeta,
          percentual_execucao: percentual,
          justificativa: '',
          modo: 'automatico',
        };
      });

    // ── Equipe de trabalho ────────────────────────────────────────────────────
    // Montar mapa de pagamentos por membro
    const pagamentosPorMembro = new Map<string, number>();
    for (const tp of pagamentosPeriodo as any[]) {
      if (!tp.team_member_id) continue;
      const prev = pagamentosPorMembro.get(tp.team_member_id) || 0;
      pagamentosPorMembro.set(tp.team_member_id, prev + Number(tp.valor_liquido || tp.valor_bruto || tp.valor || 0));
    }

    const equipeTrabalho = (teamMembers as any[])
      .filter(m => m.nome || m.full_name)
      .map(m => ({
        nome: m.nome || m.full_name || '',
        cargo: m.cargo || m.funcao || m.funcao_projeto || '',
        tipo_contratacao: m.tipo_contrato || m.tipo_contratacao || 'RPA',
        atribuicoes: m.descricao_atividades || m.objeto || m.cargo || '',
        periodo: `${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}`,
        carga_horaria: m.carga_horaria_semanal ? `${m.carga_horaria_semanal}h/sem` : m.carga_horaria || '',
        valor: pagamentosPorMembro.get(m.id) || 0,
      }));

    // ── Rubricas utilizadas no período ───────────────────────────────────────
    // Coletar rubrica_ids das compras do período
    const rubricaIdsUsados = new Set<string>(
      comprasPeriodo.map((p: any) => p.rubrica_id).filter(Boolean)
    );

    // Mapear rubricas pelo id
    const rubricaMap = new Map<string, any>();
    for (const r of rubricas as any[]) {
      rubricaMap.set(r.id, r);
    }

    // Consolidar gastos por rubrica
    const gastosPorRubrica = new Map<string, { rubrica: any; total_gasto: number; num_nfs: number }>();
    for (const p of comprasPeriodo as any[]) {
      if (!p.rubrica_id) continue;
      const rubrica = rubricaMap.get(p.rubrica_id);
      if (!rubrica) continue;
      const prev = gastosPorRubrica.get(p.rubrica_id) || { rubrica, total_gasto: 0, num_nfs: 0 };
      prev.total_gasto += Number(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0);
      prev.num_nfs += 1;
      gastosPorRubrica.set(p.rubrica_id, prev);
    }

    const rubricasPeriodo = Array.from(gastosPorRubrica.values()).map(({ rubrica, total_gasto, num_nfs }) => ({
      rubrica_id: rubrica.id,
      rubrica_nome: rubrica.rubrica || rubrica.nome || '',
      grupo: rubrica.grupo || '',
      meta: rubrica.meta || '',
      natureza_despesa: rubrica.natureza_despesa || rubrica.nome_natureza || '',
      centro_custo: rubrica.centro_custo || '',
      valor_previsto: Number(rubrica.valor_rubrica || rubrica.valor_total || 0),
      valor_utilizado: Number(rubrica.valor_utilizado || 0),
      total_gasto_periodo: total_gasto,
      num_nfs,
      saldo: Number(rubrica.valor_rubrica || 0) - Number(rubrica.valor_utilizado || 0),
    }));

    // ── Links de documentos (NF, XML, comprovante, Drive) ───────────────────
    const linksDocumentos = comprasPeriodo
      .filter((p: any) => p.nota_fiscal_url || p.nf_pdf_url || p.file_url || p.drive_backup_folder_url || p.comprovante_pagamento_url)
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
        ? `No período de ${fmtDateBR(data_inicio)} a ${fmtDateBR(data_fim)}, o projeto alcançou ${publicoTotal.toLocaleString('pt-BR')} participantes diretos em ${atividadesPeriodo.length} atividades realizadas. As ações envolveram públicos diversificados nos museus participantes, com foco em acessibilidade cultural e formação de público.`
        : 'Dados de público a serem complementados com as informações de frequência do período.',
      modo: 'automatico',
    };

    // ── Salvar no relatório ──────────────────────────────────────────────────
    await base44.asServiceRole.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
      cronograma_metas: cronogramaMetas,
      equipe_trabalho: equipeTrabalho,
      publico_alvo: publicoAlvo,
      status: 'revisao',
      _links_documentos: linksDocumentos,
      _rubricas_periodo: rubricasPeriodo,
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
        total_rubricas: rubricasPeriodo.length,
      }
    });

  } catch (error) {
    return Response.json({ error: (error as any).message }, { status: 500 });
  }
});