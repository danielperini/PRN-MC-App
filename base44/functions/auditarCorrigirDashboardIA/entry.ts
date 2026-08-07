import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';

// ============================================================================
// auditarCorrigirDashboardIA
// Orquestrador determinístico + IA que audita e corrige automaticamente:
//   P1 — Deduplicação de Rubricas (mesma _chave_oficial ou grupo::rubrica::meta)
//   P2 — Correção de centro_custo ausente/inválido em Rubricas (regras determinísticas)
//   P3 — Atribuição de rubrica_id a PurchaseRequests sem rubrica
//        (histórico do fornecedor → palavras-chave → IA)
//   P4 — Recálculo de valor_utilizado / saldo / percentual
// Retorna relatório estruturado de todas as correções aplicadas.
// ============================================================================

const CENTRO_CUSTO_VALIDOS = [
  'MHAB', 'MIS BH', 'MUMO',
  'Geral/Transversal', 'Coordenação', 'Comunicação',
  'Educação', 'Produção', 'Administrativo-financeiro',
  'Noturno 2026', 'Noturno Pampulha', 'Noturno nos Museus',
  'Publicações', 'Consultorias', 'Despesas Gerais',
];

function normalizarChaveOficial(r: any): string {
  const grupo = String(r.grupo || '').trim().toLowerCase();
  const rubrica = String(r.rubrica || r.item_rubrica || r.nome || '').trim().toLowerCase();
  const meta = String(r.meta || r.meta_id || '').trim().toLowerCase();
  return `${grupo}::${rubrica}::${meta}`;
}

function inferirCentroCusto(r: any): string | null {
  const museu = String(r.museu_codigo || '').toUpperCase();
  const escopo = String(r.escopo_orcamentario || '').toUpperCase();
  const grupo = String(r.grupo || '').toLowerCase();

  if (escopo === 'NOTURNO') {
    if (grupo.includes('pampulha')) return 'Noturno Pampulha';
    return 'Noturno nos Museus';
  }
  if (museu === 'MIS') return 'MIS BH';
  if (museu === 'MUMO') return 'MUMO';
  if (museu === 'MHAB' || museu === 'MAB') return 'MHAB';
  if (museu === 'GERAL') return 'Geral/Transversal';
  if (museu === 'NOTURNO') return 'Noturno nos Museus';

  if (grupo.includes('comunica')) return 'Comunicação';
  if (grupo.includes('coordena')) return 'Coordenação';
  if (grupo.includes('educa')) return 'Educação';
  if (grupo.includes('produ')) return 'Produção';
  if (grupo.includes('publica')) return 'Publicações';
  if (grupo.includes('consult')) return 'Consultorias';
  if (grupo.includes('admin') || grupo.includes('finance')) return 'Administrativo-financeiro';

  return null;
}

function calcularUtilizacao(rubricaId: string, purchases: any[]) {
  const relacionados = purchases.filter(
    (p) => p.rubrica_id === rubricaId && (p.status === 'APROVADO_ADMIN' || p.status === 'PAGO')
  );
  const utilizado = relacionados.reduce((s, p) => s + (Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0)), 0);
  return utilizado;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const COORD_GERAL_EMAILS = [
      'daniel@periniprojetos.com.br',
      'danielperini@periniprojetos.com.br',
      'periniprojetos@gmail.com',
    ];
    const isCoordGeral = COORD_GERAL_EMAILS.includes(String(user.email || '').toLowerCase());
    if (user.role !== 'admin' && !isCoordGeral) {
      return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const modo = body?.modo || 'completo'; // completo | diagnostico
    const dryRun = modo === 'diagnostico';

    const report = {
      started_at: new Date().toISOString(),
      modo,
      dry_run: dryRun,
      fases: {
        deduplicacao: { analisadas: 0, duplicatas_encontradas: 0, mescladas: 0, redirecionados: 0 },
        centro_custo: { analisadas: 0, corrigidas: 0, sem_inferencia: 0 },
        rubricas_compras: { analisadas: 0, por_historico: 0, por_palavras: 0, por_ia: 0, sem_sugestao: 0 },
        recalculo: { rubricas_recalculadas: 0 },
      },
      detalhes: {
        deduplicacao: [] as any[],
        centro_custo: [] as any[],
        rubricas_compras: [] as any[],
        recalculo: [] as any[],
      },
      erros: [] as string[],
    };

    // Carrega rubricas e purchases (service role para auditoria completa)
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('rubrica', 2000);
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 2000);

    // ======================= P1: DEDUPLICAÇÃO DE RUBRICAS =======================
    report.fases.deduplicacao.analisadas = rubricas.length;
    const grupos = new Map<string, any[]>();
    for (const r of rubricas) {
      if (r.ativo === false) continue;
      const chave = r._chave_oficial || normalizarChaveOficial(r);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(r);
    }

    for (const [chave, items] of grupos.entries()) {
      if (items.length <= 1) continue;
      report.fases.deduplicacao.duplicatas_encontradas++;
      // Ordenar por updated_date desc — manter a mais recente
      items.sort((a, b) => new Date(b.updated_date || b.created_date || 0).getTime() - new Date(a.updated_date || a.created_date || 0).getTime());
      const manter = items[0];
      const duplicatas = items.slice(1);
      report.detalhes.deduplicacao.push({
        chave,
        manter_id: manter.id,
        manter_rubrica: manter.rubrica,
        duplicatas: duplicatas.map((d) => ({ id: d.id, rubrica: d.rubrica, grupo: d.grupo })),
      });

      if (!dryRun) {
        // Redirecionar PurchaseRequests das duplicatas para a rubrica mantida
        for (const dup of duplicatas) {
          const relacionados = purchases.filter((p) => p.rubrica_id === dup.id);
          for (const p of relacionados) {
            try {
              await base44.asServiceRole.entities.PurchaseRequest.update(p.id, { rubrica_id: manter.id });
              report.fases.deduplicacao.redirecionados++;
            } catch (e) {
              report.erros.push(`Erro ao redirecionar PR ${p.id}: ${e.message}`);
            }
          }
          // Desativar duplicata
          try {
            await base44.asServiceRole.entities.Rubrica.update(dup.id, { ativo: false, _chave_oficial: chave });
            report.fases.deduplicacao.mescladas++;
          } catch (e) {
            report.erros.push(`Erro ao desativar rubrica ${dup.id}: ${e.message}`);
          }
        }
      }
    }

    // ======================= P2: CENTRO DE CUSTO =======================
    // Recarregar rubricas ativas após dedup
    const rubricasAtivas = dryRun
      ? rubricas.filter((r) => r.ativo !== false)
      : await base44.asServiceRole.entities.Rubrica.list('rubrica', 2000).then((rs) => rs.filter((r) => r.ativo !== false));

    for (const r of rubricasAtivas) {
      report.fases.centro_custo.analisadas++;
      const cc = String(r.centro_custo || '').trim();
      const valido = CENTRO_CUSTO_VALIDOS.includes(cc);
      if (valido && cc) continue;

      const inferred = inferirCentroCusto(r);
      if (!inferred) {
        report.fases.centro_custo.sem_inferencia++;
        continue;
      }
      report.detalhes.centro_custo.push({
        rubrica_id: r.id,
        rubrica: r.rubrica,
        grupo: r.grupo,
        centro_custo_anterior: cc || '(vazio)',
        centro_custo_novo: inferred,
        motivo: `Inferido de museu_codigo=${r.museu_codigo || ''} / escopo=${r.escopo_orcamentario || ''} / grupo=${r.grupo || ''}`,
      });
      if (!dryRun) {
        try {
          await base44.asServiceRole.entities.Rubrica.update(r.id, { centro_custo: inferred });
          report.fases.centro_custo.corrigidas++;
        } catch (e) {
          report.erros.push(`Erro ao atualizar centro_custo rubrica ${r.id}: ${e.message}`);
        }
      } else {
        report.fases.centro_custo.corrigidas++;
      }
    }

    // ======================= P3: RUBRICA → COMPRA =======================
    // Indexar rubricas ativas por palavras-chave
    const rubricasKW = rubricasAtivas
      .filter((r) => r.rubrica)
      .map((r) => ({
        id: r.id,
        rubrica: String(r.rubrica).toLowerCase(),
        grupo: String(r.grupo || '').toLowerCase(),
        centro_custo: r.centro_custo,
      }));

    // Histórico: fornecedor_cnpj → rubrica_id mais frequente
    const fornecedorHist = new Map<string, string>();
    for (const p of purchases) {
      if (p.rubrica_id && p.fornecedor_cnpj) {
        const key = String(p.fornecedor_cnpj).replace(/\D/g, '');
        if (key) fornecedorHist.set(key, p.rubrica_id);
      }
    }

    const semRubrica = purchases.filter((p) => !p.rubrica_id && p.descricao_item);
    report.fases.rubricas_compras.analisadas = semRubrica.length;

    // Agrupar por lote para IA (máx 30 por chamada)
    const pendentesIA: any[] = [];

    for (const p of semRubrica) {
      // 3.1 — Histórico do fornecedor
      const cnpj = String(p.fornecedor_cnpj || '').replace(/\D/g, '');
      if (cnpj && fornecedorHist.has(cnpj)) {
        const rubId = fornecedorHist.get(cnpj)!;
        report.detalhes.rubricas_compras.push({
          purchase_id: p.id,
          descricao: p.descricao_item,
          fornecedor: p.fornecedor_nome,
          origem: 'historico_fornecedor',
          rubrica_id_atribuida: rubId,
        });
        if (!dryRun) {
          try {
            await base44.asServiceRole.entities.PurchaseRequest.update(p.id, { rubrica_id: rubId, vinculo_automatico_ia: true });
            report.fases.rubricas_compras.por_historico++;
          } catch (e) {
            report.erros.push(`Erro ao atribuir (hist) PR ${p.id}: ${e.message}`);
          }
        } else {
          report.fases.rubricas_compras.por_historico++;
        }
        continue;
      }

      // 3.2 — Match por palavras-chave
      const desc = String(p.descricao_item).toLowerCase();
      const match = rubricasKW.find((r) => {
        if (!r.rubrica) return false;
        const tokens = r.rubrica.split(/\s+/).filter((t) => t.length > 4);
        if (tokens.length === 0) return false;
        return tokens.every((t) => desc.includes(t));
      });
      if (match) {
        report.detalhes.rubricas_compras.push({
          purchase_id: p.id,
          descricao: p.descricao_item,
          fornecedor: p.fornecedor_nome,
          origem: 'palavras_chave',
          rubrica_id_atribuida: match.id,
        });
        if (!dryRun) {
          try {
            await base44.asServiceRole.entities.PurchaseRequest.update(p.id, { rubrica_id: match.id, vinculo_automatico_ia: true });
            report.fases.rubricas_compras.por_palavras++;
          } catch (e) {
            report.erros.push(`Erro ao atribuir (kw) PR ${p.id}: ${e.message}`);
          }
        } else {
          report.fases.rubricas_compras.por_palavras++;
        }
        continue;
      }

      pendentesIA.push(p);
    }

    // 3.3 — IA para os ambíguos (lote de até 30)
    if (pendentesIA.length > 0) {
      const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
      const listaRubricas = rubricasAtivas
        .slice(0, 250)
        .map((r, i) => ({ i, id: r.id, rubrica: r.rubrica, grupo: r.grupo, centro_custo: r.centro_custo }));

      const lotes = [];
      for (let i = 0; i < pendentesIA.length; i += 30) lotes.push(pendentesIA.slice(i, i + 30));

      for (const lote of lotes) {
        const prompt = `Você é um especialista em orçamento público cultural. Para cada compra abaixo, escolha EXATAMENTE UM rubrica_id da lista fornecida. Retorne JSON: { "atribuicoes": [ { "purchase_id": "...", "rubrica_id": "...", "confianca": 0-1, "motivo": "..." } ] }. Se nenhuma rubrica for adequada, use "rubrica_id": null e "confianca": 0.

LISTA DE RUBRICAS:
${JSON.stringify(listaRubricas)}

COMPRAS:
${JSON.stringify(lote.map((p) => ({ id: p.id, descricao_item: p.descricao_item, fornecedor_nome: p.fornecedor_nome, valor_solicitado: p.valor_solicitado, centro_custo: p.centro_custo, categoria: p.categoria, natureza_despesa: p.natureza_despesa })))}`;

        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Você atribui rubricas orçamentárias a compras. Retorne APENAS JSON válido.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' },
          });
          const content = completion.choices[0]?.message?.content || '{}';
          const parsed = JSON.parse(content);
          const atrib = parsed.atribuicoes || [];
          for (const a of atrib) {
            if (!a.rubrica_id || !a.purchase_id) {
              report.fases.rubricas_compras.sem_sugestao++;
              continue;
            }
            // Validar que rubrica_id existe
            const exists = rubricasAtivas.find((r) => r.id === a.rubrica_id);
            if (!exists) {
              report.fases.rubricas_compras.sem_sugestao++;
              continue;
            }
            report.detalhes.rubricas_compras.push({
              purchase_id: a.purchase_id,
              origem: 'ia_gpt4o_mini',
              rubrica_id_atribuida: a.rubrica_id,
              confianca: a.confianca,
              motivo: a.motivo,
            });
            if (!dryRun) {
              try {
                await base44.asServiceRole.entities.PurchaseRequest.update(a.purchase_id, {
                  rubrica_id: a.rubrica_id,
                  vinculo_automatico_ia: true,
                  ai_meta_score: Number(a.confianca) || 0,
                });
                report.fases.rubricas_compras.por_ia++;
              } catch (e) {
                report.erros.push(`Erro ao atribuir (IA) PR ${a.purchase_id}: ${e.message}`);
              }
            } else {
              report.fases.rubricas_compras.por_ia++;
            }
          }
        } catch (e) {
          report.erros.push(`Erro IA lote: ${e.message}`);
          report.fases.rubricas_compras.sem_sugestao += lote.length;
        }
      }
    }

    // ======================= P4: RECÁLCULO DE UTILIZAÇÃO =======================
    if (!dryRun) {
      const purchasesAtualizadas = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 2000);
      for (const r of rubricasAtivas) {
        const utilizado = calcularUtilizacao(r.id, purchasesAtualizadas);
        const valorRubrica = Number(r.valor_rubrica || 0);
        const saldo = valorRubrica - utilizado;
        const pct = valorRubrica > 0 ? (utilizado / valorRubrica) * 100 : 0;
        // Só atualizar se mudou
        if (Math.abs(Number(r.valor_utilizado || 0) - utilizado) > 0.01 ||
            Math.abs(Number(r.saldo || 0) - saldo) > 0.01) {
          try {
            await base44.asServiceRole.entities.Rubrica.update(r.id, {
              valor_utilizado: utilizado,
              saldo,
              percentual_utilizado: pct,
            });
            report.fases.recalculo.rubricas_recalculadas++;
            report.detalhes.recalculo.push({
              rubrica_id: r.id,
              rubrica: r.rubrica,
              valor_utilizado_anterior: r.valor_utilizado || 0,
              valor_utilizado_novo: utilizado,
              saldo_novo: saldo,
              percentual: pct,
            });
          } catch (e) {
            report.erros.push(`Erro recalc rubrica ${r.id}: ${e.message}`);
          }
        }
      }
    } else {
      report.fases.recalculo.rubricas_recalculadas = rubricasAtivas.length;
    }

    report['finished_at'] = new Date().toISOString();
    return Response.json({ ok: true, report });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});