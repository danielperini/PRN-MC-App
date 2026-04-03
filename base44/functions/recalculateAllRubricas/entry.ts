import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function isAfterApril2026(mes: string, ano: number) {
  const meses = [
    'JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
    'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'
  ];

  const idx = meses.indexOf(String(mes || '').toUpperCase());
  if (idx === -1) return true;

  if (ano > 2026) return true;
  if (ano < 2026) return false;

  return idx >= 3;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rubricas = await base44.entities.Rubrica.list();

    const payments = await base44.entities.TeamPayment.list();
    const lancamentos = await base44.entities.LancamentoRubrica.list();

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;

      /* =========================
         🔒 1. LANCAMENTOS MANUAIS
      ========================= */

      const lancamentosDaRubrica = lancamentos.filter(l => l.rubrica_id === rubricaId);

      let manualUtilizado = 0;
      let manualComprometido = 0;

      for (const l of lancamentosDaRubrica) {
        const valor = toNumber(l.valor);

        if (String(l.tipo || '').toUpperCase() === 'UTILIZADO') {
          manualUtilizado += valor;
        }

        if (String(l.tipo || '').toUpperCase() === 'COMPROMETIDO') {
          manualComprometido += valor;
        }
      }

      /* =========================
         🔒 2. TEAM PAYMENTS (FILTRADO)
      ========================= */

      const paymentsDaRubrica = payments.filter(p =>
        p.rubrica_id === rubricaId &&
        isAfterApril2026(p.mes_referencia, p.ano)
      );

      let autoUtilizado = 0;
      let autoComprometido = 0;

      for (const p of paymentsDaRubrica) {
        const valor = toNumber(p.valor_nf || p.valor_parcela_previsto);

        const status = String(p.status || '').toUpperCase();

        if (status === 'PAGO') {
          autoUtilizado += valor;
        }

        if (status === 'APROVADO_COORD') {
          autoComprometido += valor;
        }
      }

      /* =========================
         🔒 3. CONSOLIDAÇÃO FINAL
      ========================= */

      const valor_utilizado = manualUtilizado + autoUtilizado;
      const saldo_comprometido = manualComprometido + autoComprometido;

      await base44.entities.Rubrica.update(rubricaId, {
        valor_utilizado,
        saldo_comprometido
      });
    }

    return Response.json({ ok: true });

  } catch (e: any) {
    return Response.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
});
