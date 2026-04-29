import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function getValor(p: any) {
  return Number(
    p?.valor_pago ??
    p?.valor_aprovado ??
    p?.valor_total ??
    p?.valor_solicitado ??
    p?.valor ??
    p?.nf_valor_total ??
    0
  ) || 0;
}

function normalizeAction(action: any) {
  const a = String(action || '').toLowerCase();
  if (a.includes('aprov') || a.includes('approve')) return 'aprovar';
  if (a.includes('devol') || a.includes('reject') || a.includes('rejeit')) return 'devolver';
  if (a.includes('pag') || a.includes('pay')) return 'pagar';
  if (a.includes('del') || a.includes('remov') || a.includes('exclu')) return 'deletar';
  return a;
}

async function getRubrica(base44: any, rubricaId: string) {
  if (!rubricaId) throw new Error('Rubrica obrigatória');
  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);
  if (!rubrica) throw new Error('Rubrica não encontrada');
  return rubrica;
}

async function debitarRealizado(base44: any, rubricaId: string, valor: number) {
  const rubrica = await getRubrica(base44, rubricaId);

  await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
    valor_utilizado: Number(rubrica?.valor_utilizado || 0) + valor,
    saldo_comprometido: Math.max(0, Number(rubrica?.saldo_comprometido || 0) - valor),
  });
}

async function estornarRealizado(base44: any, rubricaId: string, valor: number) {
  const rubrica = await getRubrica(base44, rubricaId);

  await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
    valor_utilizado: Math.max(0, Number(rubrica?.valor_utilizado || 0) - valor),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const action = normalizeAction(body.action);
    const id =
      body.id ||
      body.purchaseId ||
      body.purchase_id ||
      body.requestId ||
      body.request_id;

    if (!id) return json({ success: false, error: 'ID da solicitação obrigatório' }, 400);

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(id);
    if (!purchase) return json({ success: false, error: 'Solicitação não encontrada' }, 404);

    const statusAtual = String(purchase.status || '').toUpperCase();
    const valor = getValor(purchase);
    const rubricaId = purchase.rubrica_id;

    if (['aprovar', 'pagar'].includes(action)) {
      if (!rubricaId) return json({ success: false, error: 'Solicitação sem rubrica vinculada' }, 400);
      if (!valor) return json({ success: false, error: 'Valor da solicitação inválido' }, 400);
    }

    if (action === 'aprovar') {
      const jaDebitado = Boolean(purchase.rubrica_debitada_em || purchase.financeiro_lancado_em);

      if (!jaDebitado) {
        await debitarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(id, {
        status: 'APROVADO_COORD',
        valor_aprovado: valor,
        valor_pago: valor,
        aprovado_em: purchase.aprovado_em || new Date().toISOString(),
        financeiro_lancado_em: purchase.financeiro_lancado_em || new Date().toISOString(),
        rubrica_debitada_em: purchase.rubrica_debitada_em || new Date().toISOString(),
        rubrica_debitada_valor: valor,
        comentario_aprovacao: body.comentario || purchase.comentario_aprovacao || '',
      });

      return json({ success: true, status: 'APROVADO_COORD', valor_debitado: jaDebitado ? 0 : valor });
    }

    if (action === 'pagar') {
      const jaDebitado = Boolean(purchase.rubrica_debitada_em || purchase.financeiro_lancado_em);

      if (!jaDebitado) {
        await debitarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(id, {
        status: 'PAGO',
        valor_pago: valor,
        pago_em: purchase.pago_em || new Date().toISOString(),
        financeiro_lancado_em: purchase.financeiro_lancado_em || new Date().toISOString(),
        rubrica_debitada_em: purchase.rubrica_debitada_em || new Date().toISOString(),
        rubrica_debitada_valor: valor,
      });

      return json({ success: true, status: 'PAGO', valor_debitado: jaDebitado ? 0 : valor });
    }

    if (action === 'devolver') {
      const jaDebitado = Boolean(purchase.rubrica_debitada_em || purchase.financeiro_lancado_em);

      if (jaDebitado && rubricaId && valor) {
        await estornarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(id, {
        status: 'DEVOLVIDO',
        devolvido_em: new Date().toISOString(),
        comentario_devolucao: body.comentario || body.motivo || body.reason || 'Devolvido pela coordenação.',
        financeiro_lancado_em: null,
        rubrica_debitada_em: null,
        rubrica_debitada_valor: 0,
      });

      return json({ success: true, status: 'DEVOLVIDO' });
    }

    if (action === 'deletar') {
      const jaDebitado = Boolean(purchase.rubrica_debitada_em || purchase.financeiro_lancado_em);

      if (jaDebitado && rubricaId && valor) {
        await estornarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.PurchaseRequest.delete(id);
      return json({ success: true, deleted: true });
    }

    return json({ success: false, error: 'Ação inválida' }, 400);
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Erro interno' }, 500);
  }
});
