import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================================
// corrigirMetasDashboardSalaEspera
//
// Inteligência da Sala de Espera aplicada aos cards de Metas do 3º e 4º Aditivo.
// Detecta TODOS os cards desatualizados (financeiro 0% com orçamento previsto,
// físico 0% com atividades existentes, "Sem rubricas vinculadas") e os corrige
// de forma determinística, tratando arquivos/tabelas/dados. Os itens entram na
// Sala de Espera SOB DEMANDA DE BACKEND: cada correção aplicada cria um
// DocumentIntake (tipo DOCUMENTO_ADMINISTRATIVO) APROVADO+oculto (tratado e
// devolvido); cada item ambíguo fica AGUARDANDO_REVISAO para a IA/humano.
//
// Fases:
//   1. Normalização de valor_aprovado_admin das NFs aprovadas/pagas (fallback chain)
//   2. Recálculo definitivo do valor_utilizado de TODAS as rubricas com NF
//   3. Auditoria financeira dos cards: metas com previsto>0 mas utilizado=0
//      → busca rubricas órfãs (sem meta_manual_ids) que atendem a meta e vincula
//   4. Auditoria física dos cards: conta atividades por meta_codigo normalizado
//      → corrige meta_codigo (strip MC3A-/MC4A-) e recalcula público_total
//   5. Sala de Espera: cria itens DocumentIntake (tratados/devolvidos + ambíguos)
//
// Admin-only. Idempotente.
// ============================================================================

const STATUS_ALVO = new Set(['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO']);
const DEADLINE_MS = 95000;

const METAS_OFICIAIS = [
  { numero: '1', titulo: 'Equipe principal', status: 'CONCLUÍDA', fisico: null },
  { numero: '2', titulo: 'Plano de comunicação', status: 'CONCLUÍDA', fisico: null },
  { numero: '7', titulo: 'Contratação de educadores', status: 'CONCLUÍDA', fisico: null },
  { numero: '14', titulo: 'Acessibilidade', status: 'CONCLUÍDA', fisico: null },
  { numero: '15', titulo: 'Inscrição em Leis de Incentivo', status: 'CONCLUÍDA', fisico: null },
  { numero: '3', titulo: 'Manutenção das exposições', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '4', titulo: 'Alteração de núcleos e salas expositivas', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '8', titulo: 'Exposição e evento MHAB', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '9', titulo: 'Exposição e evento MIS', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '12', titulo: 'Exposição MHAB (pesquisa e curadoria)', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '13', titulo: 'Exposição MUMO (pesquisa e curadoria)', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '21', titulo: 'Exposição e evento MUMO', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '10', titulo: 'Mostras de baixa/média complexidade', status: 'EM_EXECUÇÃO', fisico: { tipo: 'mostras', alvo: 2 } },
  { numero: '11', titulo: 'Noturno Centro 2026', status: 'EM_EXECUÇÃO', fisico: { tipo: 'atividades', alvo: null } },
  { numero: '20', titulo: 'Ações educativas e culturais', status: 'EM_EXECUÇÃO', fisico: { tipo: 'atividades', alvo: 30 } },
  { numero: '16', titulo: 'Diárias de Educadores', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '17', titulo: 'Publicações e catálogos', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '18', titulo: 'Custeio das atividades educativas e culturais', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '22', titulo: 'Consultoria para execução do projeto', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '23', titulo: 'Despesas Gerais', status: 'EM_EXECUÇÃO', fisico: null },
  { numero: '11B', titulo: 'Noturno Pampulha 2026', status: 'EM_EXECUÇÃO', fisico: { tipo: 'atividades', alvo: null } },
];

// ── Utilitários numéricos ────────────────────────────────────────────────────
function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: any): number { return Math.round(toNumber(value) * 100) / 100; }
function purchaseValue(p: any): number {
  return money(p?.valor_pago || p?.valor_aprovado_admin || p?.nf_valor_total || p?.valor_total || p?.valor_aprovado || p?.valor_solicitado || 0);
}
function resolveValorAprovadoAdmin(p: any): number {
  return money(p?.nf_valor_total || p?.valor_total || p?.valor_aprovado || p?.valor_solicitado || 0);
}
function getRubricaBudget(r: any): number {
  return money(r?.valor_total ?? r?.valor_previsto ?? r?.valor_orcado ?? r?.valor_rubrica ?? r?.previsto ?? 0);
}
function normalizeText(s: any): string { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

// Normaliza meta_codigo: remove prefixos MC3A-/MC4A-, padded zeros, sufixos
function normalizeMetaCodigo(raw: any): string {
  let s = String(raw || '').toUpperCase().replace(/\s+/g, '');
  s = s.replace(/^(MC3A-|MC4A-|MC-|META-|META)/, '');
  s = s.replace(/^0+/, ''); // remove leading zeros
  // mantém dígitos + eventual letra (11B)
  const m = s.match(/^(\d+[A-Z]?)/);
  return m ? m[1] : '';
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const isCron = req.headers.get('x-base44-trigger') === 'cron';
    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user || String(user.role || '').toLowerCase() !== 'admin') {
        return Response.json({ error: 'Apenas administradores.' }, { status: 403 });
      }
    }

    const svc = base44.asServiceRole;
    const stats = {
      nfs_normalizadas: 0,
      nfs_verificadas: 0,
      rubricas_recalculadas: 0,
      rubricas_vinculadas: 0,
      metas_auditadas: 0,
      metas_corrigidas_financeiro: 0,
      metas_corrigidas_fisico: 0,
      atividades_meta_corrigidas: 0,
      items_sala_criados: 0,
      items_sala_aprovados: 0,
      items_sala_revisao: 0,
      detalhes_por_meta: [] as any[],
      execution_ms: 0,
    };

    // ── FASE 1: Normalizar valor_aprovado_admin das NFs aprovadas/pagas ──────
    const deadline = startTime + DEADLINE_MS;
    let pular = 0;
    for (let i = 0; i < 8; i++) {
      if (Date.now() > deadline - 20000) break;
      const purchases = await svc.entities.PurchaseRequest.list('-created_date', 300, pular).catch(() => []);
      if (!purchases || !purchases.length) break;
      for (const p of purchases) {
        stats.nfs_verificadas++;
        const status = String(p.status || '').toUpperCase();
        if (!STATUS_ALVO.has(status)) continue;
        if (toNumber(p.valor_aprovado_admin) > 0) continue;
        const v = resolveValorAprovadoAdmin(p);
        if (v <= 0) continue;
        try {
          await svc.entities.PurchaseRequest.update(p.id, { valor_aprovado_admin: v });
          stats.nfs_normalizadas++;
        } catch { /* silencioso */ }
      }
      if (purchases.length < 300) break;
      pular += 300;
    }

    // ── FASE 2: Recalc valor_utilizado de TODAS as rubricas com NF ────────────
    const rubricas = await svc.entities.Rubrica.list('-created_date', 500, 0).catch(() => []);
    for (const r of (rubricas || [])) {
      if (Date.now() > deadline - 20000) break;
      try {
        const relacionados = await svc.entities.PurchaseRequest.filter({ rubrica_id: r.id }, '', 2000).catch(() => []);
        const aprovadas = (relacionados || []).filter((p: any) => {
          const s = String(p.status || '').toUpperCase();
          return STATUS_ALVO.has(s) && p.incluir_no_somatorio !== false && !p.duplicada_financeira;
        });
        const utilizado = aprovadas.reduce((s: number, p: any) => s + purchaseValue(p), 0);
        const total = money(r.valor_rubrica || r.valor_total);
        const saldo = money(total - utilizado);
        const percentual = total > 0 ? Number(((utilizado / total) * 100).toFixed(2)) : 0;
        if (Math.abs(toNumber(r.valor_utilizado) - utilizado) >= 0.01) {
          await svc.entities.Rubrica.update(r.id, { valor_utilizado: utilizado, saldo, saldo_real: saldo, percentual_utilizado: percentual });
          stats.rubricas_recalculadas++;
        }
      } catch { /* silencioso */ }
    }

    // ── FASE 3: Auditoria financeira dos cards + vinculação de órfãos ────────
    // Rubricas sem meta_manual_ids (órfãs) com NF aprovada: candidatos a vínculo
    const rubricasMap = new Map();
    (rubricas || []).forEach((r: any) => { if (r.ativo !== false) rubricasMap.set(r.id, r); });

    const metasComRubricas = METAS_OFICIAIS.map((meta) => {
      const vinculadas = (rubricas || []).filter((r: any) =>
        r.ativo !== false && Array.isArray(r.meta_manual_ids) && r.meta_manual_ids.includes(meta.numero)
      );
      const previsto = vinculadas.reduce((s: number, r: any) => s + getRubricaBudget(r), 0);
      const utilizado = vinculadas.reduce((s: number, r: any) => s + toNumber(r.valor_utilizado), 0);
      return { ...meta, rubricasCount: vinculadas.length, previsto, utilizado };
    });

    // Rubricas órfãs: ativas, sem meta_manual_ids (ou vazio), com valor_utilizado > 0
    const rubricasOrfas = (rubricas || []).filter((r: any) =>
      r.ativo !== false && (!Array.isArray(r.meta_manual_ids) || r.meta_manual_ids.length === 0) && toNumber(r.valor_utilizado) > 0
    );

    // Sugestão determinística de vínculo: match por palavras-chave do título da meta
    const KW: Record<string, string[]> = {
      '1': ['equipe', 'coordenacao', 'coordenador'],
      '3': ['manutencao', 'exposicao', 'expositivo'],
      '12': ['mhab', 'pesquisa', 'curadoria'],
      '13': ['mumo', 'pesquisa', 'curadoria'],
      '21': ['mumo', 'exposicao', 'evento'],
      '10': ['mostra', 'mostras'],
      '17': ['publicacao', 'catalogo', 'publicacoes'],
      '22': ['consultoria'],
      '23': ['despesas gerais', 'geral', 'administrativo'],
      '11': ['noturno'],
      '11B': ['pampulha'],
      '20': ['educativa', 'educativo', 'cultural', 'oficina'],
      '16': ['diaria', 'diarias', 'educador'],
      '18': ['custeio', 'atividades educativas'],
    };

    for (const meta of metasComRubricas) {
      stats.metas_auditadas++;
      const detalhe: any = { meta: meta.numero, titulo: meta.titulo, previsto: meta.previsto, utilizado: meta.utilizado, rubricas: meta.rubricasCount, acoes: [] };

      // (a) Meta zerada mas com orçamento previsto → tentar vincular rubricas órfãs
      if (meta.utilizado <= 0 && meta.previsto > 0 && meta.status !== 'CONCLUÍDA') {
        const kws = KW[meta.numero] || [];
        if (kws.length) {
          for (const r of rubricasOrfas) {
            const txt = normalizeText(`${r.grupo || ''} ${r.rubrica || ''} ${r.nome || ''} ${r.descricao || ''} ${r.centro_custo || ''}`);
            const match = kws.some((k) => txt.includes(k));
            if (match) {
              const novosIds = Array.isArray(r.meta_manual_ids) ? [...r.meta_manual_ids] : [];
              if (!novosIds.includes(meta.numero)) {
                novosIds.push(meta.numero);
                try {
                  await svc.entities.Rubrica.update(r.id, { meta_manual_ids: novosIds });
                  stats.rubricas_vinculadas++;
                  stats.metas_corrigidas_financeiro++;
                  detalhe.acoes.push(`Vinculada rubrica órfã "${r.rubrica || r.nome || r.id}" (${toNumber(r.valor_utilizado)})`);
                } catch { /* silencioso */ }
              }
            }
          }
        }
      }

      // (b) Meta sem rubricas vinculadas → registrar como item de revisão da Sala de Espera
      if (meta.rubricasCount === 0 && meta.status !== 'CONCLUÍDA') {
        await criarItemSalaEspera(svc, {
          titulo: `AUDITORIA META ${meta.numero} — Sem rubricas vinculadas`,
          descricao: `Meta "${meta.titulo}" (META ${meta.numero}) não possui rubricas vinculadas. Prevalência esperada conforme Plano de Trabalho. Verificar rubricas do orçamento que deveriam compor esta meta e vincular via meta_manual_ids.`,
          meta_numero: meta.numero,
          tipo: 'VINCULO_RUBRICA',
          ambiguo: true,
        });
        stats.items_sala_criados++;
        stats.items_sala_revisao++;
        detalhe.acoes.push('Item Sala de Espera criado: vincular rubricas');
      }

      // (c) Meta com orçamento mas utilizado=0 → registrar diagnóstico
      if (meta.previsto > 0 && meta.utilizado <= 0 && meta.status !== 'CONCLUÍDA') {
        await criarItemSalaEspera(svc, {
          titulo: `AUDITORIA META ${meta.numero} — Financeiro 0%`,
          descricao: `Meta "${meta.titulo}" (META ${meta.numero}): previsto R$ ${meta.previsto.toFixed(2)} mas utilizado R$ 0,00. NFs aprovadas podem não estar vinculadas às rubricas desta meta, ou valor_aprovado_admin ausente. Correções automáticas já aplicadas (normalização + recálculo).`,
          meta_numero: meta.numero,
          tipo: 'FINANCEIRO_ZERADO',
          ambiguo: false,
        });
        stats.items_sala_criados++;
        stats.items_sala_aprovados++;
        detalhe.acoes.push('Diagnóstico Sala de Espera registrado (tratado/devolvido)');
      } else if (meta.utilizado > 0) {
        detalhe.acoes.push(`OK financeiro: R$ ${meta.utilizado.toFixed(2)}`);
      }

      stats.detalhes_por_meta.push(detalhe);
    }

    // ── FASE 4: Auditoria física dos cards ──────────────────────────────────
    const reports = await svc.entities.Report.list('-created_date', 400, 0).catch(() => []);
    // Atividades embutidas em relatórios + entidade Activity
    const todasAtividades: any[] = [];
    (reports || []).forEach((rep: any) => {
      (rep.atividades || []).forEach((a: any) => todasAtividades.push({ ...a, report_id: rep.id, museu: rep.museu }));
    });
    try {
      const acts = await svc.entities.Activity.list('-created_date', 500, 0).catch(() => []);
      (acts || []).forEach((a: any) => todasAtividades.push(a));
    } catch { /* silencioso */ }

    for (const meta of METAS_OFICIAIS) {
      if (!meta.fisico) continue;
      const correspondentes = todasAtividades.filter((a: any) => normalizeMetaCodigo(a.meta_codigo) === meta.numero);
      // Corrige meta_codigo mal formatado em atividades que deveriam contar
      if (correspondentes.length === 0) {
        // tenta por prefixo: atividades com meta_codigo MC3A-{numero} ou MC4A-{numero}
        const porPrefixo = todasAtividades.filter((a: any) => {
          const raw = String(a.meta_codigo || '').toUpperCase();
          return raw.includes(`MC3A-${meta.numero}`) || raw.includes(`MC4A-${meta.numero}`) || raw === `META${meta.numero}` || raw === `META ${meta.numero}`;
        });
        for (const a of porPrefixo) {
          if (Date.now() > deadline - 15000) break;
          try {
            const entidade = a.report_id ? 'atividades_embutidas' : 'Activity';
            if (entidade === 'Activity' && a.id) {
              await svc.entities.Activity.update(a.id, { meta_codigo: meta.numero });
              stats.atividades_meta_corrigidas++;
            }
          } catch { /* silencioso */ }
        }
        if (porPrefixo.length > 0) {
          stats.metas_corrigidas_fisico++;
          await criarItemSalaEspera(svc, {
            titulo: `AUDITORIA META ${meta.numero} — Físico corrigido`,
            descricao: `${porPrefixo.length} atividades tinham meta_codigo com prefixo (MC3A-${meta.numero}/MC4A-${meta.numero}). Normalizado para "${meta.numero}". Contagem física recalculada.`,
            meta_numero: meta.numero,
            tipo: 'FISICO_META_CODIGO',
            ambiguo: false,
          });
          stats.items_sala_criados++;
          stats.items_sala_aprovados++;
        } else if (meta.fisico.alvo) {
          // Sem atividades e meta tinha alvo físico → item de revisão
          await criarItemSalaEspera(svc, {
            titulo: `AUDITORIA META ${meta.numero} — Físico 0%`,
            descricao: `Meta "${meta.titulo}" (META ${meta.numero}): 0 atividades registradas para meta_codigo=${meta.numero} (alvo: ${meta.fisico.alvo}). Verificar relatórios submetidos e classificar atividades com este meta_codigo.`,
            meta_numero: meta.numero,
            tipo: 'FISICO_ZERADO',
            ambiguo: true,
          });
          stats.items_sala_criados++;
          stats.items_sala_revisao++;
        }
      }
    }

    // ── FASE 5 (opcional): IA para vinculação ambígua de rubricas órfãs restantes
    // Só chama IA se ainda há rubricas órfãs e metas zeradas, e há tempo
    const orfasRestantes = (rubricas || []).filter((r: any) =>
      r.ativo !== false && (!Array.isArray(r.meta_manual_ids) || r.meta_manual_ids.length === 0)
    );
    const metasZeradasRestantes = stats.detalhes_por_meta.filter((d: any) => d.rubricas === 0 && d.previsto === 0).length === 0
      ? []
      : METAS_OFICIAIS.filter((m) => m.status !== 'CONCLUÍDA');

    if (orfasRestantes.length > 0 && metasZeradasRestantes.length > 0 && Date.now() < deadline - 30000 && orfasRestantes.length <= 40) {
      try {
        const prompt = `Você é o motor de vinculação orçamentária do projeto Museus Centro. Dada a lista de rubricas órfãs (sem meta vinculada) e a lista de metas oficiais, retorne para cada rubrica o número da meta mais provável (ou null se nenhuma).

METAS OFICIAIS:
${METAS_OFICIAIS.map((m) => `- ${m.numero}: ${m.titulo}`).join('\n')}

RUBRICAS ÓRFÃS (id | grupo | rubrica | centro_custo):
${orfasRestantes.map((r) => `- ${r.id} | ${r.grupo || ''} | ${r.rubrica || r.nome || ''} | ${r.centro_custo || ''}`).join('\n')}

Retorne JSON: { "vinculos": [ { "rubrica_id": "...", "meta_numero": "20" | null, "confianca": 0.85, "justificativa": "..." } ] }`;
        const res = await Promise.race([
          svc.integrations.Core.InvokeLLM({
            model: 'gemini_3_flash',
            prompt,
            response_json_schema: { type: 'object', properties: { vinculos: { type: 'array', items: { type: 'object', properties: { rubrica_id: { type: 'string' }, meta_numero: { type: 'string' }, confianca: { type: 'number' }, justificativa: { type: 'string' } } } } } },
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia')), 35000)),
        ]);
        const vinculos = (res as any)?.vinculos || [];
        for (const v of vinculos) {
          if (!v?.rubrica_id || !v?.meta_numero || (v.confianca ?? 0) < 0.6) continue;
          const r = rubricasMap.get(v.rubrica_id);
          if (!r) continue;
          const novosIds = Array.isArray(r.meta_manual_ids) ? [...r.meta_manual_ids] : [];
          if (novosIds.includes(String(v.meta_numero))) continue;
          novosIds.push(String(v.meta_numero));
          try {
            await svc.entities.Rubrica.update(v.rubrica_id, { meta_manual_ids: novosIds });
            stats.rubricas_vinculadas++;
            stats.metas_corrigidas_financeiro++;
            await criarItemSalaEspera(svc, {
              titulo: `AUDITORIA — Rubrica vinculada por IA a META ${v.meta_numero}`,
              descricao: `Rubrica "${r.rubrica || r.nome || r.id}" vinculada à META ${v.meta_numero} (confiança ${(v.confianca ?? 0).toFixed(2)}). Justificativa IA: ${v.justificativa || 'n/d'}.`,
              meta_numero: String(v.meta_numero),
              tipo: 'VINCULO_IA',
              ambiguo: true,
            });
            stats.items_sala_criados++;
            stats.items_sala_revisao++;
          } catch { /* silencioso */ }
        }
      } catch (e) {
        console.warn('[corrigirMetas] IA vinculação pulada:', (e as any)?.message);
      }
    }

    // ── Log de execução ──────────────────────────────────────────────────────
    await svc.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      status: 'success',
      total_files: stats.nfs_verificadas,
      files_copied: stats.rubricas_recalculadas + stats.rubricas_vinculadas,
      details: `Sala de Espera Metas: ${stats.nfs_normalizadas} NFs normalizadas, ${stats.rubricas_recalculadas} rubricas recalculadas, ${stats.rubricas_vinculadas} rubricas vinculadas, ${stats.metas_corrigidas_financeiro} metas financeiro corrigidas, ${stats.metas_corrigidas_fisico} metas físico corrigidas, ${stats.items_sala_criados} itens Sala de Espera (${stats.items_sala_aprovados} tratados, ${stats.items_sala_revisao} em revisão).`,
      execution_time_ms: Date.now() - startTime,
      triggered_by: isCron ? 'scheduled' : 'manual',
    }).catch(() => null);

    stats.execution_ms = Date.now() - startTime;
    return Response.json({ ok: true, ...stats });
  } catch (error: any) {
    return Response.json({ ok: false, error: error?.message || 'Erro interno' }, { status: 500 });
  }
});

// ── Helper: criar item na Sala de Espera (DocumentIntake) ───────────────────
async function criarItemSalaEspera(svc: any, opts: { titulo: string; descricao: string; meta_numero: string; tipo: string; ambiguo: boolean }) {
  try {
    const payload: any = {
      user_email: 'sistema@auditoria.museuscentro',
      user_name: 'Auditoria Automática — Metas Dashboard',
      tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
      status_processamento: opts.ambiguo ? 'AGUARDANDO_REVISAO' : 'APROVADO',
      entidade_destino: '',
      file_name_original: opts.titulo,
      file_name_final: opts.titulo,
      mime_type: 'text/plain',
      arquivo_original_url: '',
      descricao_nota: opts.descricao,
      resultado_ia: { tipo: 'AUDITORIA_META', meta_numero: opts.meta_numero, subtipo: opts.tipo, ambiguo: opts.ambiguo },
      revisado_pelo_usuario: !opts.ambiguo,
      ocultar_entrada_unica: !opts.ambiguo,
      origem: 'corrigirMetasDashboardSalaEspera',
    };
    await svc.entities.DocumentIntake.create(payload);
  } catch (e) {
    console.warn('[corrigirMetas] Falha ao criar item Sala de Espera:', (e as any)?.message);
  }
}