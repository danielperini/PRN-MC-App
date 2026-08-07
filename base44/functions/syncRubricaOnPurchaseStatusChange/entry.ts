import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * syncRubricaOnPurchaseStatusChange
 *
 * Orquestrador único de débito/estorno de rubrica com validação IA.
 *
 * - APROVADO_ADMIN / PAGO: valida a rubrica via IA (heurística + LLM),
 *   corrige automaticamente se divergir com score >= 70, marca
 *   rubrica_ia_validada/rubrica_ia_score/rubrica_ia_corrigida_de e debita
 *   (recalcula por re-soma de todas as aprovações da rubrica).
 * - CANCELADO / RECUSADO / DEVOLVIDO: se rubrica_debitada_em estava
 *   preenchido, recalcula a rubrica (excluindo esta solicitação) e
 *   limpa os campos de débito (estorno idempotente).
 * - Remoção de nf_pdf_url / nota_fiscal_url em solicitação aprovada:
 *   estorno (recalcula rubrica e limpa débito).
 *
 * Idempotente: nunca re-debita uma mesma aprovação (verifica
 * rubrica_debitada_em antes de marcar novo débito).
 */

const APPROVED_STATUSES = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO', 'PAGO']);
const REVERSAL_STATUSES = new Set(['CANCELADO', 'RECUSADO', 'DEVOLVIDO']);
const STATUS_UTILIZADO = new Set(['APROVADO_ADMIN', 'PAGO', 'APROVADO_COORD', 'APROVADO']);
const SCORE_THRESHOLD = 70;

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function normalizeString(value: any): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCentro(value: any): string {
  const raw = normalizeString(value);
  if (!raw) return '';
  if (raw.includes('mis')) return 'MIS';
  if (raw.includes('mhab') || raw.includes('mab')) return 'MHAB';
  if (raw.includes('mumo')) return 'MUMO';
  if (raw === 'geral' || raw === 'global' || raw.includes('transversal')) return 'Geral';
  if (raw.includes('pampulha')) return 'Noturno Pampulha';
  if (raw.includes('noturno')) return 'Noturno nos Museus 2026';
  if (raw.includes('publica')) return 'Publicações';
  return String(value || '').trim();
}

function isCentroCompativel(selected: string, entity: string): boolean {
  if (!selected || !entity) return true;
  if (entity === 'Geral') return true;
  return selected === entity;
}

function getRubricaLabel(r: any): string {
  return String(r?.rubrica || r?.nome || r?.descricao || '').trim();
}

function getRubricaGrupo(r: any): string {
  return String(r?.grupo || r?.categoria || '').trim();
}

function tokenize(text: string): string[] {
  return normalizeString(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

function similarity(a: string[], b: string[]): number {
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / Math.max(a.length, 1);
}

function heuristic(rubricas: any[], texto: string, centro: string): any {
  const rules = [
    { keys: ['lanche', 'cafe', 'buffet', 'alimentacao', 'coffee', 'coffeebreak'], hint: 'lanche' },
    { keys: ['frete', 'carreto', 'transporte', 'van', 'taxi', 'uber'], hint: 'transporte' },
    { keys: ['designer', 'video', 'foto', 'imprensa', 'grafica', 'impressao', 'social media', 'rede social'], hint: 'comunicacao' },
    { keys: ['material', 'consumo', 'epi', 'equipamento', 'insumo'], hint: 'material' },
    { keys: ['oficina', 'palestra', 'consultoria', 'facilitador', 'formacao', 'acessibilidade'], hint: 'consultoria' },
  ];
  for (const r of rules) {
    if (!r.keys.some((k) => texto.includes(k))) continue;
    const match = rubricas.find((rb) => {
      const base = normalizeString(`${getRubricaLabel(rb)} ${getRubricaGrupo(rb)}`);
      return base.includes(r.hint) && isCentroCompativel(centro, normalizeCentro(rb.centro_custo || rb.museu_codigo));
    });
    if (match) {
      return { rubrica_id: match.id, rubrica_nome: getRubricaLabel(match), score: 85, justificativa: 'Heurística baseada em padrão de compra', source: 'heuristic' };
    }
  }
  return null;
}

async function invokeOpenAI(prompt: string, jsonSchema: boolean): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const body: any = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 1024, temperature: 0.1 };
  if (jsonSchema) body.response_format = { type: 'json_object' };
  let lastErr: any;
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) { const t = await resp.text().catch(() => resp.statusText); throw new Error(`OpenAI ${resp.status}: ${t}`); }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      if (jsonSchema) {
        try { return JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
      }
      return content;
    } catch (e: any) { lastErr = e; if (i === 0) await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw lastErr;
}

async function listAllRubricas(base44: any): Promise<any[]> {
  let all: any[] = [];
  let page = 0;
  const pageSize = 200;
  while (true) {
    const batch = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', pageSize, page * pageSize).catch(() => []);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }
  return all.filter((r: any) => r?.ativo !== false);
}

async function suggestRubricaInternal(rubricas: any[], input: { descricao: string; fornecedor: string; categoria: string; centro: string }): Promise<any> {
  const { descricao, fornecedor, categoria, centro } = input;
  if (!descricao || descricao.length < 5) return null;
  const valid = rubricas.filter((r: any) => isCentroCompativel(centro, normalizeCentro(r.centro_custo || r.museu_codigo)));
  if (!valid.length) return null;

  const texto = normalizeString(`${descricao} ${categoria} ${fornecedor}`);
  const h = heuristic(valid, texto, centro);
  if (h) return h;

  const tokens = tokenize(texto);
  const ranked = valid
    .map((r: any) => ({ r, score: similarity(tokens, tokenize(`${getRubricaLabel(r)} ${getRubricaGrupo(r)}`)) }))
    .sort((a: any, b: any) => b.score - a.score);
  if (ranked[0]?.score >= 0.5) {
    return {
      rubrica_id: ranked[0].r.id,
      rubrica_nome: getRubricaLabel(ranked[0].r),
      score: Math.round(toNum(ranked[0].score) * 100),
      justificativa: 'Similaridade textual',
      source: 'similarity',
    };
  }

  const context = valid.map((r: any) => `${r.id} - ${getRubricaLabel(r)} - ${getRubricaGrupo(r)}`).join('\n');
  const prompt = `Escolha a melhor rubrica para esta compra.
Compra: ${descricao}
Fornecedor: ${fornecedor}
Categoria: ${categoria}
Centro: ${centro}
Rubricas disponíveis:
${context}
Responda somente JSON válido:
{"rubrica_id":"","score":0,"justificativa":""}`;
  let llmRaw: any = null;
  try { llmRaw = await invokeOpenAI(prompt, true); } catch (e: any) { console.warn('[syncRubrica] LLM err:', e.message); return null; }
  const found = valid.find((r: any) => r.id === llmRaw?.rubrica_id);
  if (!found) return null;
  return {
    rubrica_id: found.id,
    rubrica_nome: getRubricaLabel(found),
    score: toNum(llmRaw?.score) || 60,
    justificativa: llmRaw?.justificativa || 'IA conhecimento',
    source: 'llm',
  };
}

async function recalcRubrica(base44: any, rubricaId: string): Promise<any> {
  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
  if (!rubrica) return null;

  const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({ rubrica_id: rubricaId }, '', 1000).catch(() => []);
  const purchaseTotal = (purchases || [])
    .filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase()))
    .reduce((sum: number, p: any) => sum + (toNum(p.valor_pago) || toNum(p.valor_aprovado_admin) || toNum(p.valor_aprovado) || toNum(p.valor_solicitado)), 0);

  const payments = await base44.asServiceRole.entities.TeamPayment.filter({ rubrica_id: rubricaId }, '', 500).catch(() => []);
  const paymentTotal = (payments || [])
    .filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase()))
    .reduce((sum: number, p: any) => sum + (toNum(p.valor_nf) || toNum(p.valor_total) || toNum(p.valor_parcela_previsto) || toNum(p.valor)), 0);

  const totalUtilizado = purchaseTotal + paymentTotal;
  const valorBase = toNum(rubrica.valor_rubrica) || toNum(rubrica.valor_total);
  const novoSaldo = valorBase - totalUtilizado;
  const percentual = valorBase > 0 ? Number(((totalUtilizado / valorBase) * 100).toFixed(2)) : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
    valor_utilizado: totalUtilizado,
    saldo: novoSaldo,
    saldo_real: novoSaldo,
    percentual_utilizado: percentual,
  });
  return { rubricaId, totalUtilizado, novoSaldo, percentual };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const purchaseId = payload?.event?.entity_id || payload?.entity_id || payload?.purchase_id;
    if (!purchaseId) return Response.json({ ok: false, message: 'Nenhum purchase_id fornecido' });

    let purchase = payload?.data || null;
    const oldData = payload?.old_data || null;
    if (!purchase || !purchase.status) {
      purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    }
    if (!purchase) return Response.json({ ok: false, message: 'PurchaseRequest não encontrada' });

    const status = String(purchase.status || '').toUpperCase();
    const rubricaIdAtual = purchase.rubrica_id || '';

    // ESTORNO por status
    if (REVERSAL_STATUSES.has(status)) {
      const rubricaDebitadaEm = purchase.rubrica_debitada_em;
      if (rubricaDebitadaEm && rubricaIdAtual) {
        await recalcRubrica(base44, rubricaIdAtual);
        await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
          rubrica_debitada_em: null,
          rubrica_debitada_valor: null,
          rubrica_ia_validada: false,
          rubrica_ia_corrigida_de: null,
          rubrica_ia_score: null,
          rubrica_ia_divergente: false,
          rubrica_ia_justificativa: null,
        });
        console.log(`[syncRubrica] ESTORNO (status ${status}) compra ${purchaseId} — rubrica ${rubricaIdAtual} recalculada.`);
      }
      return Response.json({ ok: true, action: 'estorno_status', rubrica_id: rubricaIdAtual });
    }

    // ESTORNO por remoção de NF em solicitação aprovada
    if (APPROVED_STATUSES.has(status) && oldData && purchase.rubrica_debitada_em) {
      const oldNf = oldData.nf_pdf_url || oldData.nota_fiscal_url || '';
      const newNf = purchase.nf_pdf_url || purchase.nota_fiscal_url || '';
      if (oldNf && !newNf) {
        if (rubricaIdAtual) await recalcRubrica(base44, rubricaIdAtual);
        await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
          rubrica_debitada_em: null,
          rubrica_debitada_valor: null,
          rubrica_ia_validada: false,
          rubrica_ia_corrigida_de: null,
          rubrica_ia_score: null,
          rubrica_ia_divergente: false,
          rubrica_ia_justificativa: null,
        });
        console.log(`[syncRubrica] ESTORNO (NF removida) compra ${purchaseId}.`);
        return Response.json({ ok: true, action: 'estorno_nf_removida', rubrica_id: rubricaIdAtual });
      }
    }

    // DÉBITO: somente status aprovado/pago
    if (!APPROVED_STATUSES.has(status)) {
      return Response.json({ ok: true, message: `Status ${status} não requer recálculo de rubrica` });
    }
    if (!rubricaIdAtual) {
      console.log(`[syncRubrica] Compra ${purchaseId} sem rubrica_id — ignorando`);
      return Response.json({ ok: true, message: 'Sem rubrica_id vinculada' });
    }

    const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaIdAtual).catch(() => null);
    if (!rubrica) {
      console.log(`[syncRubrica] Rubrica ${rubricaIdAtual} não encontrada`);
      return Response.json({ ok: false, message: 'Rubrica não encontrada' });
    }

    // Idempotência: já debitado e IA já validou → apenas recalcula (mantém consistente)
    const jaDebitado = !!purchase.rubrica_debitada_em;
    const jaValidada = purchase.rubrica_ia_validada === true;

    let iaResult: any = null;
    let rubricaFinalId = rubricaIdAtual;
    let corrigidaDe = purchase.rubrica_ia_corrigida_de || null;
    let divergente = false;
    let iaJustificativa = purchase.rubrica_ia_justificativa || '';

    // Validação IA — só roda se ainda não validada
    if (!jaValidada && purchase.descricao_item) {
      try {
        const rubricas = await listAllRubricas(base44);
        iaResult = await suggestRubricaInternal(rubricas, {
          descricao: purchase.descricao_item,
          fornecedor: purchase.fornecedor_nome || purchase.nf_emitente_nome || '',
          categoria: purchase.categoria || '',
          centro: normalizeCentro(purchase.centro_custo),
        });
        if (iaResult && iaResult.rubrica_id && iaResult.rubrica_id !== rubricaIdAtual) {
          if (iaResult.score >= SCORE_THRESHOLD) {
            corrigidaDe = rubricaIdAtual;
            rubricaFinalId = iaResult.rubrica_id;
            iaJustificativa = iaResult.justificativa || '';
            console.log(`[syncRubrica] CORREÇÃO IA compra ${purchaseId}: ${rubricaIdAtual} → ${rubricaFinalId} (score ${iaResult.score})`);
          } else {
            divergente = true;
            iaJustificativa = iaResult.justificativa || '';
            console.log(`[syncRubrica] DIVERGÊNCIA IA compra ${purchaseId}: sugerida ${iaResult.rubrica_id} (score ${iaResult.score} < ${SCORE_THRESHOLD})`);
          }
        } else if (iaResult && iaResult.rubrica_id === rubricaIdAtual) {
          iaJustificativa = iaResult.justificativa || '';
        }
      } catch (e: any) {
        console.warn('[syncRubrica] Falha validação IA:', e.message);
      }
    }

    // Atualiza PurchaseRequest
    const updates: any = {
      rubrica_ia_validada: iaResult ? true : jaValidada,
      rubrica_ia_score: iaResult?.score ?? purchase.rubrica_ia_score ?? null,
      rubrica_ia_divergente: divergente,
      rubrica_ia_justificativa: iaJustificativa || null,
    };
    if (corrigidaDe) updates.rubrica_ia_corrigida_de = corrigidaDe;
    if (rubricaFinalId !== rubricaIdAtual) {
      updates.rubrica_id = rubricaFinalId;
      const novaRubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaFinalId).catch(() => null);
      if (novaRubrica) {
        updates.rubrica_nome = getRubricaLabel(novaRubrica);
        if (novaRubrica.centro_custo) {
          const ccComp = normalizeCentro(purchase.centro_custo);
          if (normalizeCentro(novaRubrica.centro_custo) !== ccComp && !ccComp) {
            updates.centro_custo = novaRubrica.centro_custo;
          }
        }
      }
    }
    // Débito idempotente
    if (!jaDebitado) {
      updates.rubrica_debitada_em = purchase.approved_at || purchase.aprov_admin_data || purchase.aprov_coord_data || purchase.created_date || new Date().toISOString();
      updates.rubrica_debitada_valor = toNum(purchase.valor_aprovado_admin || purchase.valor_aprovado || purchase.valor_solicitado || 0);
    }

    await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, updates);

    // Recalc rubricas (antiga e nova se divergentes)
    const rubricasParaRecalc = new Set([rubricaIdAtual]);
    if (rubricaFinalId !== rubricaIdAtual) rubricasParaRecalc.add(rubricaFinalId);
    const recalcResults: any = {};
    for (const rid of rubricasParaRecalc) {
      recalcResults[rid] = await recalcRubrica(base44, rid);
    }

    return Response.json({
      ok: true,
      action: 'debito',
      rubrica_id: rubricaFinalId,
      corrigida: rubricaFinalId !== rubricaIdAtual,
      divergente,
      ia_score: iaResult?.score ?? null,
      ia_validada: updates.rubrica_ia_validada,
      recalc: recalcResults,
    });
  } catch (error: any) {
    console.error('[syncRubrica] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});