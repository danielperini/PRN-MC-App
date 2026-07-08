/**
 * recalcularSaldosRubricas
 * ─────────────────────────────────────────────────────────────────────────
 * Recalcula valor_utilizado, saldo, saldo_real e percentual_utilizado em
 * TODAS as rubricas ativas, somando apenas compras com aprovação final
 * (APROVADO_ADMIN ou PAGO) que possuam rubrica_id.
 *
 * Regra de valor (por ordem de prioridade):
 *   1. valor_pago            — se status PAGO
 *   2. valor_aprovado_admin  — valor homologado pelo admin
 *   3. nf_valor_total        — valor da nota fiscal
 *   4. valor_solicitado      — fallback
 *
 * APROVADO_COORD não entra: é aprovação intermediária, não financeira final.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function toNumber(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const raw = String(v ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function money(v: any): number {
  return Math.round(toNumber(v) * 100) / 100;
}

/** Valor definitivo de uma compra — só chamado para status finais */
function getPurchaseValue(p: any): number {
  const pago   = money(p?.valor_pago);
  const admin  = money(p?.valor_aprovado_admin);
  const nf     = money(p?.nf_valor_total);
  const solic  = money(p?.valor_solicitado);

  // Usa o primeiro não-zero na ordem de confiabilidade
  return pago || admin || nf || solic;
}

// Apenas compras com aprovação financeira final
const STATUS_FINAIS = new Set(['APROVADO_ADMIN', 'PAGO']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verifica permissão (admin ou invocação interna via functions.invoke)
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (_) {
      isAdmin = true;
    }
    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const soRubricaId: string | null = body?.rubrica_id || null;

    // ── 1. Carrega todas as rubricas ativas ─────────────────────────────
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 3000);
    const rubricasAtivas: any[] = (todasRubricas || []).filter((r: any) =>
      r?.ativo !== false && r?.id && (!soRubricaId || r.id === soRubricaId)
    );

    if (rubricasAtivas.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma rubrica ativa encontrada.', atualizadas: 0 });
    }

    // ── 2. Carrega todas as compras com aprovação final, paginado ────────
    let todasCompras: any[] = [];
    let skip = 0;
    const pageSize = 500;
    while (true) {
      const page = await base44.asServiceRole.entities.PurchaseRequest.filter(
        { status: { $in: ['APROVADO_ADMIN', 'PAGO'] } },
        '-created_date',
        pageSize,
        skip
      );
      if (!page || page.length === 0) break;
      todasCompras = todasCompras.concat(page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    // ── 3. Acumula por rubrica_id ────────────────────────────────────────
    const acumulado: Record<string, number> = {};
    let comprasSemRubrica = 0;
    let comprasContabilizadas = 0;
    const detalhes: Record<string, any[]> = {};

    for (const p of todasCompras) {
      if (!p?.rubrica_id) { comprasSemRubrica++; continue; }
      if (!STATUS_FINAIS.has(String(p.status || '').toUpperCase())) continue;
      if (p?.duplicada === true || p?.duplicidade_status === 'confirmada') continue;

      const valor = getPurchaseValue(p);
      if (valor <= 0) continue;

      acumulado[p.rubrica_id] = money((acumulado[p.rubrica_id] || 0) + valor);
      comprasContabilizadas++;

      if (!detalhes[p.rubrica_id]) detalhes[p.rubrica_id] = [];
      detalhes[p.rubrica_id].push({ id: p.id, status: p.status, valor });
    }

    // ── 4. Atualiza cada rubrica ativa ───────────────────────────────────
    let atualizadas = 0;
    let semMudanca = 0;
    let erros = 0;
    const logAtualizacoes: any[] = [];
    const logDivergencias: any[] = [];

    for (const r of rubricasAtivas) {
      const total      = money(r.valor_rubrica || r.valor_total || 0);
      const utilizado  = money(acumulado[r.id] || 0);
      const saldo      = money(total - utilizado);
      const percentual = total > 0 ? Math.round((utilizado / total) * 10000) / 100 : 0;

      const utilizadoAtual = money(r.valor_utilizado || 0);
      const saldoAtual     = money(r.saldo_real || r.saldo || 0);
      const diffUtil  = Math.abs(utilizadoAtual - utilizado);
      const diffSaldo = Math.abs(saldoAtual - saldo);

      // Registra divergências detectadas
      if (diffUtil > 0.01) {
        logDivergencias.push({
          rubrica: (r.rubrica || r.nome || '').substring(0, 60),
          grupo: r.grupo,
          centro_custo: r.centro_custo,
          anterior: utilizadoAtual,
          correto: utilizado,
          diff: (utilizado - utilizadoAtual).toFixed(2),
        });
      }

      // Pula se já está correto
      if (diffUtil < 0.01 && diffSaldo < 0.01) { semMudanca++; continue; }

      try {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          valor_utilizado: utilizado,
          saldo,
          saldo_real: saldo,
          percentual_utilizado: percentual,
          recalculado_em: new Date().toISOString(),
        });
        atualizadas++;
        if (logAtualizacoes.length < 30) {
          logAtualizacoes.push({
            rubrica: (r.rubrica || r.nome || '').substring(0, 60),
            grupo: r.grupo,
            centro_custo: r.centro_custo,
            anterior: utilizadoAtual,
            novo: utilizado,
            saldo,
          });
        }
      } catch (e: any) {
        erros++;
        console.error(`Erro ao atualizar rubrica ${r.id}:`, e?.message);
      }
    }

    // ── 5. Sumário por centro de custo ───────────────────────────────────
    const porCentro: Record<string, { previsto: number; utilizado: number; saldo: number }> = {};
    for (const r of rubricasAtivas) {
      const cc = r.centro_custo || 'Sem CC';
      if (!porCentro[cc]) porCentro[cc] = { previsto: 0, utilizado: 0, saldo: 0 };
      porCentro[cc].previsto  = money(porCentro[cc].previsto  + money(r.valor_rubrica || 0));
      const util = money(acumulado[r.id] || 0);
      porCentro[cc].utilizado = money(porCentro[cc].utilizado + util);
      porCentro[cc].saldo     = money(porCentro[cc].saldo + money(money(r.valor_rubrica || 0) - util));
    }

    return Response.json({
      success: true,
      rubricasAtivas: rubricasAtivas.length,
      comprasAprovadas: todasCompras.length,
      comprasContabilizadas,
      comprasSemRubrica,
      atualizadas,
      semMudanca,
      erros,
      divergenciasCorrigidas: logDivergencias.length,
      divergencias: logDivergencias,
      atualizacoes: logAtualizacoes,
      resumoPorCentro: porCentro,
      regra: 'STATUS: APROVADO_ADMIN | PAGO — Valor: valor_pago > valor_aprovado_admin > nf_valor_total > valor_solicitado',
      recalculado_em: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('recalcularSaldosRubricas error:', error);
    return Response.json({ success: false, error: error?.message || 'Erro desconhecido.' }, { status: 500 });
  }
});