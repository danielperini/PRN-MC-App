import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';

// ============================================================================
// auditoria360Diaria
// Camada de supervisão ativa da IA que roda diariamente (03h00 BRT).
// Percorre 3 superfícies: (1) cards de metas, (2) totalizações financeiras,
// (3) relatórios mensais individuais. Correções determinísticas são aplicadas
// em service-role; itens ambíguos viram DocumentIntake na Sala de Espera.
// Tudo logado em BackupLog (backup_type='auditoria_entrada_unica').
// ============================================================================

const METAS_OFICIAIS = [
  { numero: '1', titulo: 'Equipe principal', status: 'CONCLUÍDA' },
  { numero: '2', titulo: 'Plano de comunicação', status: 'CONCLUÍDA' },
  { numero: '7', titulo: 'Contratação de educadores', status: 'CONCLUÍDA' },
  { numero: '14', titulo: 'Acessibilidade', status: 'CONCLUÍDA' },
  { numero: '15', titulo: 'Inscrição em Leis de Incentivo', status: 'CONCLUÍDA' },
  { numero: '3', titulo: 'Manutenção das exposições', status: 'EM EXECUÇÃO' },
  { numero: '4', titulo: 'Alteração de núcleos e salas expositivas', status: 'EM EXECUÇÃO' },
  { numero: '8', titulo: 'Exposição e evento MHAB', status: 'EM EXECUÇÃO' },
  { numero: '9', titulo: 'Exposição e evento MIS', status: 'EM EXECUÇÃO' },
  { numero: '12', titulo: 'Exposição MHAB', status: 'EM EXECUÇÃO' },
  { numero: '13', titulo: 'Exposição MUMO', status: 'EM EXECUÇÃO' },
  { numero: '21', titulo: 'Exposição e evento MUMO', status: 'EM EXECUÇÃO' },
  { numero: '10', titulo: 'Mostras de baixa/média complexidade', status: 'EM EXECUÇÃO' },
  { numero: '11', titulo: 'Noturno Centro 2026', status: 'EM EXECUÇÃO' },
  { numero: '20', titulo: 'Ações educativas e culturais (30 ações)', status: 'EM EXECUÇÃO' },
  { numero: '16', titulo: 'Diárias de Educadores', status: 'EM EXECUÇÃO' },
  { numero: '17', titulo: 'Publicações e catálogos', status: 'EM EXECUÇÃO' },
  { numero: '18', titulo: 'Custeio das atividades educativas e culturais', status: 'EM EXECUÇÃO' },
  { numero: '22', titulo: 'Consultoria para execução do projeto', status: 'EM EXECUÇÃO' },
  { numero: '23', titulo: 'Despesas Gerais', status: 'EM EXECUÇÃO' },
  { numero: '11B', titulo: 'Noturno Pampulha 2026', status: 'EM EXECUÇÃO' },
];

const THRESHOLD_PCT = 1;
const REPORTS_BATCH = 50;
const DIAS_LIMITE_RELATORIOS = 90;

function isRubricaLinkedToMeta(rubrica: any, metaNum: string): boolean {
  if (Array.isArray(rubrica?.meta_manual_ids) && rubrica.meta_manual_ids.length > 0) {
    return rubrica.meta_manual_ids.map((m: string) => String(m).toUpperCase()).includes(metaNum.toUpperCase());
  }
  return false;
}

async function criarSalaEspera(
  base44: any,
  args: {
    fase: string;
    problema: string;
    entidade_id: string;
    entidade_tipo: string;
    sugestao_ia?: string;
    confianca?: number;
  }
) {
  const now = new Date().toISOString();
  const resultado_ia = {
    fase: args.fase,
    problema: args.problema,
    entidade_id: args.entidade_id,
    entidade_tipo: args.entidade_tipo,
    sugestao_ia: args.sugestao_ia || null,
    confianca: args.confianca ?? 0,
  };
  try {
    await base44.asServiceRole.entities.DocumentIntake.create({
      user_email: 'auditoria360@viadutodasartes.org.br',
      user_name: 'Auditoria 360° Diária',
      tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
      status_processamento: 'AGUARDANDO_REVISAO',
      arquivo_original_url: '',
      file_name_original: `AUDITORIA360_${args.fase}_${args.entidade_id}_${now.slice(0, 10)}`,
      mime_type: 'application/json',
      entidade_destino: '',
      entidade_destino_id: args.entidade_id,
      resultado_ia,
      centro_custo: 'Administrativo-financeiro',
      revisado_pelo_usuario: false,
    });
    return true;
  } catch (e) {
    return false;
  }
}

Deno.serve(async (req) => {
  const startedAt = new Date();
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const triggeredBy = String(body?.triggeredBy || 'scheduled').toLowerCase();
    const cursor = body?.cursor || null;

    if (triggeredBy === 'manual') {
      const user = await base44.auth.me();
      const COORD_GERAL_EMAILS = [
        'daniel@periniprojetos.com.br',
        'danielperini@periniprojetos.com.br',
        'periniprojetos@gmail.com',
      ];
      const isCoordGeral = COORD_GERAL_EMAILS.includes(String(user?.email || '').toLowerCase());
      if (!user || (user.role !== 'admin' && !isCoordGeral)) {
        return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
      }
    }

    const report: any = {
      started_at: startedAt.toISOString(),
      triggered_by: triggeredBy,
      cursor,
      fases: {
        metas: { analisadas: 0, corrigidas: 0, encaminhadas_sala_espera: 0, sem_rubricas: 0 },
        financeiro: { rubricas_recalculadas: 0, sem_rubrica_com_valor: 0, duplicatas_corrigidas: 0, encaminhadas_sala_espera: 0 },
        relatorios: { analisados: 0, publico_corrigido: 0, metas_sem_codigo: 0, sem_publico_geral: 0, sem_meta_em_mes_obrigatorio: 0 },
      },
      correcoes: [] as any[],
      encaminhamentos: [] as any[],
      erros: [] as string[],
      has_more: false as boolean,
      proximo_cursor: null as any,
    };

    const logEmProcesso = await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'AUDITORIA_360',
      status: 'em_processamento',
      triggered_by: triggeredBy === 'manual' ? 'manual' : 'scheduled',
      processed_at: startedAt.toISOString(),
      details: 'Auditoria 360° em execução',
    });

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('rubrica', 2000);
    const rubricasAtivas = rubricas.filter((r: any) => r.ativo !== false);
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 2000);

    // ===================== FASE 1 — CARDS DE METAS =====================
    for (const meta of METAS_OFICIAIS) {
      report.fases.metas.analisadas++;
      const rubricasVinculadas = rubricasAtivas.filter((r: any) => isRubricaLinkedToMeta(r, meta.numero));
      if (rubricasVinculadas.length === 0) {
        report.fases.metas.sem_rubricas++;
        if (meta.status === 'EM EXECUÇÃO') {
          const ok = await criarSalaEspera(base44, {
            fase: 'metas',
            problema: `Meta ${meta.numero} (${meta.titulo}) sem rubricas vinculadas (meta_manual_ids vazio).`,
            entidade_id: `META_${meta.numero}`,
            entidade_tipo: 'ProjectMeta',
          });
          if (ok) {
            report.fases.metas.encaminhadas_sala_espera++;
            report.encaminhamentos.push({ fase: 'metas', meta: meta.numero, motivo: 'sem_rubricas' });
          }
        }
        continue;
      }
      for (const r of rubricasVinculadas) {
        const relacionados = purchases.filter(
          (p: any) =>
            p.rubrica_id === r.id &&
            (p.status === 'APROVADO_ADMIN' || p.status === 'PAGO') &&
            p.incluir_no_somatorio !== false &&
            !p.duplicada_financeira
        );
        const utilizado = relacionados.reduce(
          (s: number, p: any) => s + Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0),
          0
        );
        const valorRubrica = Number(r.valor_rubrica || 0);
        const saldo = valorRubrica - utilizado;
        const pct = valorRubrica > 0 ? (utilizado / valorRubrica) * 100 : 0;
        const pctPersistido = Number(r.percentual_utilizado || 0);
        if (
          Math.abs(Number(r.valor_utilizado || 0) - utilizado) > 0.01 ||
          Math.abs(pctPersistido - pct) > THRESHOLD_PCT
        ) {
          try {
            await base44.asServiceRole.entities.Rubrica.update(r.id, {
              valor_utilizado: utilizado,
              saldo,
              percentual_utilizado: pct,
            });
            report.fases.metas.corrigidas++;
            report.correcoes.push({
              fase: 'metas',
              rubrica_id: r.id,
              rubrica: r.rubrica,
              meta: meta.numero,
              valor_utilizado_novo: utilizado,
              percentual_novo: Number(pct.toFixed(2)),
            });
          } catch (e: any) {
            report.erros.push(`Fase1 rubrica ${r.id}: ${e.message}`);
          }
        }
      }
    }

    // ===================== FASE 2 — TOTALIZAÇÕES FINANCEIRAS =====================
    for (const r of rubricasAtivas) {
      const relacionados = purchases.filter(
        (p: any) =>
          p.rubrica_id === r.id &&
          (p.status === 'APROVADO_ADMIN' || p.status === 'PAGO') &&
          p.incluir_no_somatorio !== false &&
          !p.duplicada_financeira
      );
      const utilizado = relacionados.reduce(
        (s: number, p: any) => s + Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0),
        0
      );
      const valorRubrica = Number(r.valor_rubrica || 0);
      const saldo = valorRubrica - utilizado;
      const pct = valorRubrica > 0 ? (utilizado / valorRubrica) * 100 : 0;
      const zeroComNFs = Number(r.valor_utilizado || 0) === 0 && utilizado > 0;
      const divergente =
        Math.abs(Number(r.valor_utilizado || 0) - utilizado) > 0.01 ||
        Math.abs(Number(r.percentual_utilizado || 0) - pct) > THRESHOLD_PCT;
      if (zeroComNFs || divergente) {
        try {
          await base44.asServiceRole.entities.Rubrica.update(r.id, {
            valor_utilizado: utilizado,
            saldo,
            percentual_utilizado: pct,
          });
          report.fases.financeiro.rubricas_recalculadas++;
          report.correcoes.push({
            fase: 'financeiro',
            rubrica_id: r.id,
            rubrica: r.rubrica,
            zero_com_nfs: zeroComNFs,
            valor_utilizado_novo: utilizado,
            percentual_novo: Number(pct.toFixed(2)),
          });
        } catch (e: any) {
          report.erros.push(`Fase2 rubrica ${r.id}: ${e.message}`);
        }
      }
    }

    // (b) PurchaseRequests sem rubrica_id com valor aprovado → Sala de Espera
    const semRubricaComValor = purchases.filter(
      (p: any) =>
        !p.rubrica_id &&
        (p.status === 'APROVADO_ADMIN' || p.status === 'PAGO') &&
        Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0) > 0
    );
    report.fases.financeiro.sem_rubrica_com_valor = semRubricaComValor.length;
    for (const p of semRubricaComValor.slice(0, 30)) {
      let sugestao: string | undefined;
      const cnpj = String(p.fornecedor_cnpj || '').replace(/\D/g, '');
      if (cnpj) {
        const fromHist = purchases.find((x: any) => x.rubrica_id && String(x.fornecedor_cnpj || '').replace(/\D/g, '') === cnpj);
        if (fromHist) sugestao = `rubrica_id=${fromHist.rubrica_id} (histórico do fornecedor)`;
      }
      const ok = await criarSalaEspera(base44, {
        fase: 'financeiro',
        problema: `PurchaseRequest ${p.id} sem rubrica_id, valor aprovado R$ ${Number(p.valor_aprovado_admin || p.valor_aprovado || 0).toFixed(2)}.`,
        entidade_id: p.id,
        entidade_tipo: 'PurchaseRequest',
        sugestao_ia: sugestao,
        confianca: sugestao ? 0.8 : 0,
      });
      if (ok) {
        report.fases.financeiro.encaminhadas_sala_espera++;
        report.encaminhamentos.push({ fase: 'financeiro', purchase_id: p.id, motivo: 'sem_rubrica' });
      }
    }

    // (c) NFs duplicada_financeira mas ainda somando → incluir_no_somatorio=false
    const dupSomando = purchases.filter(
      (p: any) => p.duplicada_financeira === true && p.incluir_no_somatorio !== false
    );
    for (const p of dupSomando) {
      try {
        await base44.asServiceRole.entities.PurchaseRequest.update(p.id, { incluir_no_somatorio: false });
        report.fases.financeiro.duplicatas_corrigidas++;
        report.correcoes.push({
          fase: 'financeiro',
          purchase_id: p.id,
          acao: 'duplicata_financeira_excluida_somatorio',
        });
      } catch (e: any) {
        report.erros.push(`Fase2 dup ${p.id}: ${e.message}`);
      }
    }

    // ===================== FASE 3 — RELATÓRIOS MENSAIS =====================
    const dataLimite = new Date(Date.now() - DIAS_LIMITE_RELATORIOS * 24 * 60 * 60 * 1000).toISOString();
    const reportsTodos = await base44.asServiceRole.entities.Report.list('-updated_date', 2000);
    const reportsAlvo = reportsTodos.filter(
      (r: any) =>
        ['SUBMITTED', 'IN_REVIEW', 'APPROVED'].includes(r.status) &&
        new Date(r.updated_date || r.created_date || 0).toISOString() >= dataLimite
    );

    let reportsBatch = reportsAlvo;
    if (cursor) {
      reportsBatch = reportsAlvo.filter((r: any) => new Date(r.updated_date || 0).toISOString() > cursor);
    }
    const processar = reportsBatch.slice(0, REPORTS_BATCH);
    report.has_more = reportsBatch.length > REPORTS_BATCH;
    if (report.has_more) {
      const ultimo = processar[processar.length - 1];
      report.proximo_cursor = new Date(ultimo?.updated_date || 0).toISOString();
    }
    report.fases.relatorios.analisados = processar.length;

    const allActivities = await base44.asServiceRole.entities.Activity.list('-created_date', 2000);
    const reportIdsSet = new Set(processar.map((r: any) => r.id));
    const atividadesReport = allActivities.filter((a: any) => reportIdsSet.has(a.report_id));
    const pendentesSugestaoMeta: any[] = [];

    for (const rep of processar) {
      const atvs = atividadesReport.filter((a: any) => a.report_id === rep.id);
      for (const a of atvs) {
        if (a.classificacao === 'META' && !a.meta_codigo && a.titulo) {
          pendentesSugestaoMeta.push({ activity_id: a.id, titulo: a.titulo, descricao: a.descricao || '', report_id: rep.id });
        }
        const est = Number(a.publico_estimado || 0);
        const rept = Number(a.quantas_repeticoes || 1);
        const esperado = Math.round(est * rept);
        const atual = Number(a.publico_total || 0);
        if (esperado > 0 && Math.abs(atual - esperado) > 0) {
          try {
            await base44.asServiceRole.entities.Activity.update(a.id, { publico_total: esperado });
            report.fases.relatorios.publico_corrigido++;
            report.correcoes.push({
              fase: 'relatorios',
              activity_id: a.id,
              publico_anterior: atual,
              publico_novo: esperado,
            });
          } catch (e: any) {
            report.erros.push(`Fase3 publico ${a.id}: ${e.message}`);
          }
        }
      }
      if (rep.status === 'APPROVED' && (rep.publico_geral_declarado === undefined || rep.publico_geral_declarado === null)) {
        const ok = await criarSalaEspera(base44, {
          fase: 'relatorios',
          problema: `Relatório APPROVED ${rep.id} sem publico_geral_declarado preenchido.`,
          entidade_id: rep.id,
          entidade_tipo: 'Report',
        });
        if (ok) {
          report.fases.relatorios.sem_publico_geral++;
          report.encaminhamentos.push({ fase: 'relatorios', report_id: rep.id, motivo: 'sem_publico_geral' });
        }
      }
      const temMeta = atvs.some((a: any) => a.classificacao === 'META');
      if (!temMeta && rep.mes_referencia) {
        const ok = await criarSalaEspera(base44, {
          fase: 'relatorios',
          problema: `Relatório ${rep.id} (${rep.mes_referencia}/${rep.ano}) sem nenhuma atividade META.`,
          entidade_id: rep.id,
          entidade_tipo: 'Report',
        });
        if (ok) {
          report.fases.relatorios.sem_meta_em_mes_obrigatorio++;
          report.encaminhamentos.push({ fase: 'relatorios', report_id: rep.id, motivo: 'sem_meta' });
        }
      }
    }

    if (pendentesSugestaoMeta.length > 0) {
      try {
        const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
        const metasDescritas = METAS_OFICIAIS.map((m) => `${m.numero}: ${m.titulo}`).join('; ');
        const lotes: any[][] = [];
        for (let i = 0; i < pendentesSugestaoMeta.length; i += 20) lotes.push(pendentesSugestaoMeta.slice(i, i + 20));
        for (const lote of lotes) {
          const prompt = `Para cada atividade abaixo, sugira o código da meta oficial mais adequado (vindo de: ${metasDescritas}). Retorne JSON: { "sugestoes": [ { "activity_id": "...", "meta_codigo": "20", "confianca": 0-1 } ] }. Se não souber, meta_codigo null.`;
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Você sugere códigos de metas oficiais para atividades culturais. Retorne APENAS JSON.' },
              { role: 'user', content: prompt + '\nATIVIDADES:\n' + JSON.stringify(lote.map((a) => ({ id: a.activity_id, titulo: a.titulo, descricao: a.descricao }))) },
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' },
          });
          const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
          for (const s of parsed.sugestoes || []) {
            const ok = await criarSalaEspera(base44, {
              fase: 'relatorios',
              problema: `Activity ${s.activity_id} META sem meta_codigo.`,
              entidade_id: s.activity_id,
              entidade_tipo: 'Activity',
              sugestao_ia: `meta_codigo=${s.meta_codigo}`,
              confianca: Number(s.confianca) || 0,
            });
            if (ok) {
              report.fases.relatorios.metas_sem_codigo++;
              report.encaminhamentos.push({ fase: 'relatorios', activity_id: s.activity_id, motivo: 'sem_meta_codigo', sugestao: s.meta_codigo });
            }
          }
        }
      } catch (e: any) {
        report.erros.push(`Fase3 IA sugestão meta: ${e.message}`);
      }
    }

    // ===================== FINALIZAR LOG =====================
    const finishedAt = new Date();
    const totalCorrecoes = report.correcoes.length;
    const totalEncaminhamentos = report.encaminhamentos.length;
    const statusFinal = report.erros.length > 0 ? 'erro' : 'concluido';

    await base44.asServiceRole.entities.BackupLog.update(logEmProcesso.id, {
      status: statusFinal,
      processed_at: finishedAt.toISOString(),
      execution_time_ms: finishedAt.getTime() - startedAt.getTime(),
      total_files: report.fases.relatorios.analisados,
      files_copied: totalCorrecoes + totalEncaminhamentos,
      details: JSON.stringify({
        fases: report.fases,
        total_correcoes: totalCorrecoes,
        total_encaminhamentos: totalEncaminhamentos,
        has_more: report.has_more,
        proximo_cursor: report.proximo_cursor,
      }),
      error_message: report.erros.length > 0 ? report.erros.slice(0, 5).join(' | ') : undefined,
    });

    report.finished_at = finishedAt.toISOString();
    report.total_correcoes = totalCorrecoes;
    report.total_encaminhamentos = totalEncaminhamentos;
    return Response.json({ ok: true, report, log_id: logEmProcesso.id });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});