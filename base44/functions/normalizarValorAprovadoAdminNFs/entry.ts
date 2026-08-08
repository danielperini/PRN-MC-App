import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================================
// normalizarValorAprovadoAdminNFs
//
// Normalização histórica: varre PurchaseRequests com status APROVADO_ADMIN ou
// PAGO cujo campo `valor_aprovado_admin` está nulo/zero. Para cada um, calcula o
// valor correto usando o primeiro não-nulo de:
//   nf_valor_total -> valor_total -> valor_aprovado -> valor_solicitado
// e salva em `valor_aprovado_admin`.
//
// Ao final, recalcula `valor_utilizado`, `saldo` e `percentual_utilizado` das
// rubricas afetadas (recálculo inline, sem depender de outra função).
//
// Endpoint admin-only. Aceita { limite, pular } para paginação.
// ============================================================================

const STATUS_ALVO = new Set(['APROVADO_ADMIN', 'PAGO']);

function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: any): number {
  return Math.round(toNumber(value) * 100) / 100;
}

// Cadeia oficial de valor de uma NF — mesma usada pela Auditoria 360°.
function purchaseValue(p: any): number {
  return money(
    p?.valor_pago ||
      p?.valor_aprovado_admin ||
      p?.nf_valor_total ||
      p?.valor_total ||
      p?.valor_aprovado ||
      p?.valor_solicitado ||
      0
  );
}

// Valor a ser salvo em valor_aprovado_admin (sem valor_pago para não distorcer).
function resolveValorAprovadoAdmin(p: any): number {
  return money(
    p?.nf_valor_total ||
      p?.valor_total ||
      p?.valor_aprovado ||
      p?.valor_solicitado ||
      0
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ error: 'Apenas administradores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Number(body?.limite || 200), 500);
    const pular = Number(body?.pular || 0);

    const svc = base44.asServiceRole;

    const purchases = await svc.entities.PurchaseRequest.list('-created_date', limite, pular);

    const stats = {
      total_varridas: 0,
      corrigidas: 0,
      puladas_status: 0,
      puladas_ja_preenchidas: 0,
      puladas_sem_valor: 0,
      erros: 0,
      rubricas_afetadas: [] as string[],
      proximo_pular: pular + (Array.isArray(purchases) ? purchases.length : 0),
      has_more: false,
    };

    if (!purchases || !purchases.length) {
      return Response.json({ ...stats, concluido: true, rubricas_recalculadas: 0 });
    }

    for (const p of purchases) {
      stats.total_varridas++;
      const status = String(p.status || '').toUpperCase();
      if (!STATUS_ALVO.has(status)) {
        stats.puladas_status++;
        continue;
      }
      if (toNumber(p.valor_aprovado_admin) > 0) {
        stats.puladas_ja_preenchidas++;
        continue;
      }

      const valorCorreto = resolveValorAprovadoAdmin(p);
      if (valorCorreto <= 0) {
        stats.puladas_sem_valor++;
        continue;
      }

      try {
        await svc.entities.PurchaseRequest.update(p.id, { valor_aprovado_admin: valorCorreto });
        stats.corrigidas++;
        if (p.rubrica_id && !stats.rubricas_afetadas.includes(p.rubrica_id)) {
          stats.rubricas_afetadas.push(p.rubrica_id);
        }
      } catch {
        stats.erros++;
      }
    }

    stats.has_more = purchases.length === limite;

    // Recalcular valor_utilizado das rubricas afetadas (inline).
    let rubricas_recalculadas = 0;
    for (const rubricaId of stats.rubricas_afetadas) {
      try {
        const [rubrica, relacionados] = await Promise.all([
          svc.entities.Rubrica.get(rubricaId).catch(() => null),
          svc.entities.PurchaseRequest.filter({ rubrica_id: rubricaId }, '', 2000).catch(() => []),
        ]);
        if (!rubrica) continue;

        const utilizado = (relacionados || [])
          .filter((p: any) => {
            const s = String(p.status || '').toUpperCase();
            return STATUS_ALVO.has(s) && p.incluir_no_somatorio !== false && !p.duplicada_financeira;
          })
          .reduce((s: number, p: any) => s + purchaseValue(p), 0);

        const total = money(rubrica.valor_rubrica || rubrica.valor_total);
        const saldo = money(total - utilizado);
        const percentual = total > 0 ? Number(((utilizado / total) * 100).toFixed(2)) : 0;

        await svc.entities.Rubrica.update(rubricaId, {
          valor_utilizado: utilizado,
          saldo,
          saldo_real: saldo,
          percentual_utilizado: percentual,
        });
        rubricas_recalculadas++;
      } catch {
        // silencioso — segue para a próxima rubrica
      }
    }

    return Response.json({
      ...stats,
      rubricas_recalculadas,
      concluido: !stats.has_more,
      mensagem: stats.has_more
        ? `Corrigidas ${stats.corrigidas} NFs. Execute novamente com pular=${stats.proximo_pular} para continuar.`
        : 'Normalização concluída.',
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
});