import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================================
// sincronizarValorUtilizadoRubricas
//
// Sincronização DEFINITIVA do campo `valor_utilizado` das Rubricas com o total
// real das NFs aprovadas/pagas vinculadas. Pagina por RUBRICA (não por NF),
// garantindo que TODAS as rubricas — mesmo aquelas cujas NFs já tinham
// `valor_aprovado_admin` preenchido — tenham seu valor_utilizado recalculado a
// partir dos valores reais das NFs aprovadas.
//
// Cadeia oficial de valor de uma NF (mesma da Auditoria 360°):
//   valor_pago -> valor_aprovado_admin -> nf_valor_total -> valor_total
//   -> valor_aprovado -> valor_solicitado
//
// Filtros: status APROVADO_ADMIN | APROVADO_COORD | PAGO,
// incluir_no_somatorio !== false, duplicada_financeira !== true.
//
// Endpoint admin-only. Aceita { limite, pular } para paginação por rubrica.
// ============================================================================

const STATUS_ALVO = new Set(['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO']);

function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: any): number {
  return Math.round(toNumber(value) * 100) / 100;
}

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ error: 'Apenas administradores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Number(body?.limite || 100), 300);
    const pular = Number(body?.pular || 0);

    const svc = base44.asServiceRole;

    const rubricas = await svc.entities.Rubrica.list('-created_date', limite, pular);

    const stats = {
      total_rubricas: 0,
      atualizadas: 0,
      sem_nfs_aprovadas: 0,
      sem_valor: 0,
      erros: 0,
      proximo_pular: pular + (Array.isArray(rubricas) ? rubricas.length : 0),
      has_more: false,
    };

    if (!rubricas || !rubricas.length) {
      return Response.json({ ...stats, concluido: true });
    }

    for (const r of rubricas) {
      stats.total_rubricas++;
      try {
        const relacionados = await svc.entities.PurchaseRequest.filter(
          { rubrica_id: r.id },
          '',
          2000
        ).catch(() => []);

        const aprovadas = (relacionados || []).filter((p: any) => {
          const s = String(p.status || '').toUpperCase();
          return STATUS_ALVO.has(s) && p.incluir_no_somatorio !== false && !p.duplicada_financeira;
        });

        if (!aprovadas.length) {
          stats.sem_nfs_aprovadas++;
          // Zera valor_utilizado se não há NFs aprovadas (evita resíduo estornado).
          const totalRub = money(r.valor_rubrica || r.valor_total);
          const atualZero = toNumber(r.valor_utilizado) !== 0;
          if (atualZero) {
            await svc.entities.Rubrica.update(r.id, {
              valor_utilizado: 0,
              saldo: totalRub,
              saldo_real: totalRub,
              percentual_utilizado: 0,
            });
            stats.atualizadas++;
          }
          continue;
        }

        const utilizado = aprovadas.reduce((s: number, p: any) => s + purchaseValue(p), 0);
        if (utilizado <= 0) {
          stats.sem_valor++;
          continue;
        }

        const totalRub = money(r.valor_rubrica || r.valor_total);
        const saldo = money(totalRub - utilizado);
        const percentual = totalRub > 0 ? Number(((utilizado / totalRub) * 100).toFixed(2)) : 0;

        // Só atualiza se mudou (idempotente, evita escritas desnecessárias).
        const atualUtil = toNumber(r.valor_utilizado);
        if (Math.abs(atualUtil - utilizado) >= 0.01) {
          await svc.entities.Rubrica.update(r.id, {
            valor_utilizado: utilizado,
            saldo,
            saldo_real: saldo,
            percentual_utilizado: percentual,
          });
          stats.atualizadas++;
        }
      } catch {
        stats.erros++;
      }
    }

    stats.has_more = rubricas.length === limite;

    return Response.json({
      ...stats,
      concluido: !stats.has_more,
      mensagem: stats.has_more
        ? `${stats.atualizadas} rubricas sincronizadas. Execute novamente com pular=${stats.proximo_pular} para continuar.`
        : 'Sincronização definitiva concluída.',
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
});