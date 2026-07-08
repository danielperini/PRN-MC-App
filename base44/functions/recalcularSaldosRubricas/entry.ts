/**
 * recalcularSaldosRubricas
 * ─────────────────────────────────────────────────────────────────────────
 * Recalcula valor_utilizado, saldo, saldo_real e percentual_utilizado em
 * TODAS as rubricas ativas, somando apenas compras aprovadas (status:
 * APROVADO_COORD | APROVADO_ADMIN | APROVADO | PAGO) que possuam rubrica_id.
 *
 * Regra central: a vinculação é feita pelo campo rubrica_id da solicitação,
 * que já carrega o contexto de centro de custo e aditivo.  Não precisamos
 * filtrar por museu aqui — cada rubrica já pertence a um centro.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function toNumber(v: any): number {
  const raw = String(v ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function money(v: any): number {
  return Math.round(toNumber(v) * 100) / 100;
}

function getPurchaseValue(p: any): number {
  return money(
    p?.valor_pago ||
    p?.valor_aprovado_admin ||
    p?.valor_aprovado ||
    p?.valor_final ||
    p?.valor_solicitado ||
    p?.valor_total ||
    p?.valor ||
    p?.rubrica_debitada_valor ||
    0
  );
}

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verifica permissão (admin ou invocação interna)
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (_) {
      isAdmin = true; // invocação interna via functions.invoke
    }
    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    // Permite recalcular rubrica específica (para auditorias pontuais)
    const soRubricaId: string | null = body?.rubrica_id || null;

    // ── 1. Carrega todas as rubricas ativas ─────────────────────────────
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 3000);
    const rubricasAtivas: any[] = (todasRubricas || []).filter((r: any) =>
      r?.ativo !== false &&
      r?.id &&
      (!soRubricaId || r.id === soRubricaId)
    );

    if (rubricasAtivas.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma rubrica ativa encontrada.', atualizadas: 0 });
    }

    // ── 2. Carrega todas as compras aprovadas com rubrica vinculada ──────
    // Pagina para cobrir volumes grandes
    let todasCompras: any[] = [];
    let skip = 0;
    const pageSize = 500;
    while (true) {
      const page = await base44.asServiceRole.entities.PurchaseRequest.filter(
        { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO', 'PAGO'] } },
        '-created_date',
        pageSize,
        skip
      );
      if (!page || page.length === 0) break;
      todasCompras = todasCompras.concat(page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    // ── 3. Acumula valores por rubrica_id ────────────────────────────────
    const acumulado: Record<string, number> = {};
    let comprasSemRubrica = 0;
    let comprasContabilizadas = 0;

    for (const p of todasCompras) {
      if (!p?.rubrica_id) { comprasSemRubrica++; continue; }
      if (!STATUS_APROVADOS.has(String(p.status || '').toUpperCase())) continue;
      if (p?.duplicada === true) continue;

      const valor = getPurchaseValue(p);
      if (valor <= 0) continue;

      acumulado[p.rubrica_id] = money((acumulado[p.rubrica_id] || 0) + valor);
      comprasContabilizadas++;
    }

    // ── 4. Atualiza cada rubrica ativa ───────────────────────────────────
    let atualizadas = 0;
    let erros = 0;
    const log: any[] = [];

    for (const r of rubricasAtivas) {
      const total = money(r.valor_rubrica || r.valor_total || 0);
      const utilizado = money(acumulado[r.id] || 0);
      const saldo = money(total - utilizado);
      const percentual = total > 0 ? money((utilizado / total) * 100) : 0;

      // Só atualiza se houver diferença (evita writes desnecessários)
      const utilizadoAtual = money(r.valor_utilizado || 0);
      if (Math.abs(utilizadoAtual - utilizado) < 0.01 &&
          Math.abs(money(r.saldo_real || r.saldo || 0) - saldo) < 0.01) {
        continue;
      }

      try {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          valor_utilizado: utilizado,
          saldo,
          saldo_real: saldo,
          percentual_utilizado: percentual,
          recalculado_em: new Date().toISOString(),
        });
        atualizadas++;
        if (log.length < 20) {
          log.push({
            rubrica: r.rubrica || r.nome,
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

    return Response.json({
      success: true,
      rubricasAtivas: rubricasAtivas.length,
      comprasAprovadas: todasCompras.length,
      comprasContabilizadas,
      comprasSemRubrica,
      atualizadas,
      erros,
      log,
      recalculado_em: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('recalcularSaldosRubricas error:', error);
    return Response.json({ success: false, error: error?.message || 'Erro desconhecido.' }, { status: 500 });
  }
});