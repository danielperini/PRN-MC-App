import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalizeStatus(v: any) {
  return String(v || '').trim().toUpperCase();
}

function isAfterApril2026(mes: string, ano: number) {
  const meses = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
  ];

  const idx = meses.indexOf(String(mes || '').toUpperCase());
  if (idx === -1) return true;

  if (ano > 2026) return true;
  if (ano < 2026) return false;

  return idx >= 3;
}

Deno.serve(async (_req) => {
  try {
    const base44 = createClientFromRequest(_req);

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);
    const payments = await base44.asServiceRole.entities.TeamPayment.list('-created_date', 1000);
    const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.list('-created_date', 1000);
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 1000);

    for (const rubrica of rubricas || []) {
      const rubricaId = rubrica.id;

      /* =========================
         🔒 1. LANCAMENTOS MANUAIS
      ========================= */

      const lancamentosDaRubrica = (lancamentos || []).filter(
        (l: any) => l?.rubrica_id === rubricaId
      );

      let manualUtilizado = 0;
      let manualComprometido = 0;

      for (const l of lancamentosDaRubrica) {
        const valor = toNumber(l?.valor);
        const tipo = normalizeStatus(l?.tipo);

        if (tipo === 'UTILIZADO') {
          manualUtilizado += valor;
        }

        if (tipo === 'COMPROMETIDO') {
          manualComprometido += valor;
        }
      }

      /* =========================
         🔒 2. TEAM PAYMENTS
      ========================= */

      const paymentsDaRubrica = (payments || []).filter(
        (p: any) =>
          p?.rubrica_id === rubricaId &&
          isAfterApril2026(p?.mes_referencia, Number(p?.ano || 0))
      );

      let tpUtilizado = 0;
      let tpComprometido = 0;

      for (const p of paymentsDaRubrica) {
        const valor = toNumber(p?.valor_nf || p?.valor_parcela_previsto || p?.valor_pago);
        const status = normalizeStatus(p?.status);

        if (status === 'PAGO') {
          tpUtilizado += valor;
        } else if (status === 'APROVADO_COORD') {
          tpComprometido += valor;
        }
      }

      /* =========================
         🔒 3. PURCHASE REQUEST
      ========================= */

      const purchasesDaRubrica = (purchases || []).filter(
        (p: any) => p?.rubrica_id === rubricaId
      );

      let prUtilizado = 0;
      let prComprometido = 0;

      for (const p of purchasesDaRubrica) {
        const valor =
          toNumber(p?.valor_pago) ||
          toNumber(p?.valor_aprovado) ||
          toNumber(p?.valor_aprovado_admin) ||
          toNumber(p?.valor_final) ||
          toNumber(p?.valor_solicitado);

        const status = normalizeStatus(p?.status);

        if (status === 'PAGO' || status === 'PAGO_PARCIAL') {
          prUtilizado += valor;
        } else if (status === 'APROVADO_COORD' || status === 'APROVADO_ADMIN') {
          prComprometido += valor;
        }
      }

      /* =========================
         🔒 4. CONSOLIDAÇÃO FINAL
      ========================= */

      const valor_utilizado =
        manualUtilizado +
        tpUtilizado +
        prUtilizado;

      const saldo_comprometido =
        manualComprometido +
        tpComprometido +
        prComprometido;

      const valor_total =
        toNumber(rubrica?.valor_rubrica) ||
        toNumber(rubrica?.valor_total);

      const saldo_real =
        valor_total -
        valor_utilizado -
        saldo_comprometido;

      const percentual_utilizado =
        valor_total > 0
          ? Number(((valor_utilizado / valor_total) * 100).toFixed(2))
          : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado,
        saldo_comprometido,
        saldo: saldo_real,
        saldo_real,
        percentual_utilizado
      });
    }

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json(
      { error: e?.message || 'Erro interno' },
      { status: 500 }
    );
  }
});
