import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function toNumber(value: any): number {
  const raw = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(purchase: any): number {
  return toNumber(
    purchase?.valor_pago ||
      purchase?.valor_aprovado_admin ||
      purchase?.valor_aprovado ||
      purchase?.valor_final ||
      purchase?.valor_solicitado ||
      purchase?.valor_total ||
      purchase?.valor ||
      purchase?.rubrica_debitada_valor ||
      0
  );
}

async function getRubrica(base44: any, rubricaId: string) {
  if (!rubricaId) throw new Error('Rubrica obrigatória.');

  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

  if (!rubrica) throw new Error('Rubrica inválida.');

  return rubrica;
}

async function debitarRubrica(base44: any, rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);

  const novoUtilizado = utilizadoAtual + valor;
  const novoSaldo = total - novoUtilizado;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function estornarRubrica(base44: any, rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);

  const novoUtilizado = Math.max(0, utilizadoAtual - valor);
  const novoSaldo = total - novoUtilizado;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function syncAttachments(base44: any, purchase: any, status: string) {
  try {
    const docs = await base44.asServiceRole.entities.Attachment.filter({
      purchase_id: purchase.id
    });

    for (const doc of docs || []) {
      await base44.asServiceRole.entities.Attachment.update(doc.id, {
        status,
        nf_status: status,
        ocultar_entrada_unica: true,
        inconsistencias: 0
      });
    }
  } catch (error) {
    console.error('Erro ao sincronizar anexos:', error);
  }
}

async function estornarSeNecessario(base44: any, purchase: any, valor: number) {
  const deveEstornar =
    !!purchase.rubrica_debitada_em ||
    !!purchase.financeiro_lancado_em;

  if (!deveEstornar || !purchase.rubrica_id) return;

  const rubrica = await getRubrica(base44, purchase.rubrica_id);
  const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valor;

  await estornarRubrica(base44, rubrica, valorEstorno);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { action, purchaseId, comentario } = body;

    if (!purchaseId) {
      return json({ success: false, error: 'purchaseId obrigatório.' }, 400);
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return json({ success: false, error: 'Solicitação não encontrada.' }, 404);
    }

    if (!purchase.rubrica_id) {
      return json({ success: false, error: 'Envio bloqueado: rubrica obrigatória.' }, 400);
    }

    const valor = getPurchaseValue(purchase);

    // =========================
    // APROVAR
    // =========================
    if (action === 'aprovar') {
      const rubrica = await getRubrica(base44, purchase.rubrica_id);

      const jaDebitado = !!purchase.rubrica_debitada_em;

      if (!jaDebitado) {
        await debitarRubrica(base44, rubrica, valor);
      }

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'APROVADO_COORD',
          financeiro_lancado_em:
            purchase.financeiro_lancado_em || new Date().toISOString(),
          rubrica_debitada_em:
            purchase.rubrica_debitada_em || new Date().toISOString(),
          rubrica_debitada_valor:
            purchase.rubrica_debitada_valor || valor
        }
      );

      await syncAttachments(base44, updated, 'APROVADO');

      try {
        await base44.asServiceRole.functions.invoke('notifyPurchaseApprovedToFinanceiro', {
          purchaseId: purchase.id
        });
      } catch (e) {
        console.warn('email fail', e);
      }

      return json({ success: true, purchase: updated });
    }

    // =========================
    // DESAPROVAR
    // =========================
    if (action === 'desaprovar' || action === 'reprovar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: action === 'reprovar' ? 'RECUSADO' : 'AGUARDANDO_APROVACAO',
          comentario_desaprovacao: comentario || '',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, action === 'reprovar' ? 'REPROVADO' : 'AGUARDANDO_APROVACAO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // DEVOLVER
    // =========================
    if (action === 'devolver' || action === 'rejeitar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'DEVOLVIDO',
          comentario_devolucao: comentario || '',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, 'DEVOLVIDO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // CANCELAR
    // =========================
    if (action === 'cancelar' || action === 'deletar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'CANCELADO',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, 'CANCELADO');

      return json({ success: true, purchase: updated });
    }

    return json({ success: false, error: 'Ação inválida.' }, 400);
  } catch (error: any) {
    console.error('purchaseActions error:', error);

    return json({
      success: false,
      error: error?.message || 'Erro ao processar ação.'
    }, 500);
  }
});
