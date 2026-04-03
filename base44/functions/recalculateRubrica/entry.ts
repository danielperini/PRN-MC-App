// 🔥 VERSÃO ESTÁVEL — REGRAS FINANCEIRAS CORRETAS + PRESERVAÇÃO TOTAL

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DEFAULT_MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalizeStatus(v: any) {
  return String(v || '').toUpperCase();
}

/* 🔒 REGRA DE CORTE */
function isAfterApril2026(mes: string, ano: number) {
  const meses = [
    'JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
    'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'
  ];

  const idx = meses.indexOf(String(mes || '').toUpperCase());

  if (ano > 2026) return true;
  if (ano < 2026) return false;

  return idx >= 3;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const rubricaId = body.rubricaId || body.rubrica_id;

    if (!rubricaId) {
      return Response.json({ error: 'rubricaId obrigatório' }, { status: 400 });
    }

    const rubrica = await base44.entities.Rubrica.get(rubricaId);

    if (!rubrica) {
      return Response.json({ error: 'Rubrica não encontrada' }, { status: 404 });
    }

    /* =========================
       🔒 LANCAMENTOS MANUAIS
    ========================= */

    const lancamentos = await base44.entities.LancamentoRubrica.filter({
      rubrica_id: rubricaId
    });

    let manualUtilizado = 0;
    let manualComprometido = 0;

    for (const l of lancamentos) {
      const valor = toNumber(l.valor);

      if (normalizeStatus(l.tipo) === 'UTILIZADO') {
        manualUtilizado += valor;
      }

      if (normalizeStatus(l.tipo) === 'COMPROMETIDO') {
        manualComprometido += valor;
      }
    }

    /* =========================
       🔒 TEAM PAYMENT
    ========================= */

    const payments = await base44.entities.TeamPayment.filter({
      rubrica_id: rubricaId
    });

    let tpUtilizado = 0;
    let tpComprometido = 0;

    for (const p of payments) {
      if (!isAfterApril2026(p.mes_referencia, p.ano)) continue;

      const valor = toNumber(p.valor_nf || p.valor_parcela_previsto);
      const status = normalizeStatus(p.status);

      if (status === 'PAGO') {
        tpUtilizado += valor;
      }

      if (status === 'APROVADO_COORD') {
        tpComprometido += valor;
      }
    }

    /* =========================
       🔒 PURCHASE REQUEST (LEGADO)
    ========================= */

    const purchases = await base44.entities.PurchaseRequest.filter({
      rubrica_id: rubricaId
    });

    let prUtilizado = 0;
    let prComprometido = 0;

    for (const p of purchases) {
      const valor =
        toNumber(p.valor_pago) ||
        toNumber(p.valor_aprovado) ||
        toNumber(p.valor_solicitado);

      const status = normalizeStatus(p.status);

      if (status === 'PAGO' || status === 'PAGO_PARCIAL') {
        prUtilizado += valor;
      }

      if (status === 'APROVADO_COORD' || status === 'APROVADO_ADMIN') {
        prComprometido += valor;
      }
    }

    /* =========================
       🔒 CONSOLIDAÇÃO FINAL
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
      toNumber(rubrica.valor_rubrica) ||
      toNumber(rubrica.valor_total);

    const saldo =
      valor_total -
      valor_utilizado -
      saldo_comprometido;

    const percentual_utilizado =
      valor_total > 0
        ? Number(((valor_utilizado / valor_total) * 100).toFixed(2))
        : 0;

    await base44.entities.Rubrica.update(rubricaId, {
      valor_utilizado,
      saldo_comprometido,
      saldo,
      percentual_utilizado
    });

    return Response.json({
      success: true,
      rubrica_id: rubricaId,
      valor_utilizado,
      saldo_comprometido,
      saldo,
      percentual_utilizado
    });

  } catch (e: any) {
    return Response.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
});
