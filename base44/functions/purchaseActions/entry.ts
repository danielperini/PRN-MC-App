import { base44 } from 'base44';

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
    purchase?.rubrica_debitada_valor ||
      purchase?.valor_pago ||
      purchase?.valor_aprovado_admin ||
      purchase?.valor_aprovado ||
      purchase?.valor_final ||
      purchase?.valor_solicitado ||
      purchase?.valor_total ||
      purchase?.valor ||
      0
  );
}

async function getRubrica(rubricaId: string) {
  if (!rubricaId) {
    throw new Error('Rubrica obrigatória.');
  }

  const rubrica = await base44.entity('Rubrica').get(rubricaId);

  if (!rubrica) {
    throw new Error('Rubrica inválida.');
  }

  return rubrica;
}

async function debitarRubrica(rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);
  const comprometido = toNumber(rubrica.saldo_comprometido);

  const novoUtilizado = utilizadoAtual + valor;
  const novoSaldo = total - novoUtilizado - comprometido;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.entity('Rubrica').update({
    id: rubrica.id,
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function estornarRubrica(rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);
  const comprometido = toNumber(rubrica.saldo_comprometido);

  const novoUtilizado = Math.max(0, utilizadoAtual - valor);
  const novoSaldo = total - novoUtilizado - comprometido;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.entity('Rubrica').update({
    id: rubrica.id,
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function syncAttachments(purchase: any, status: string) {
  try {
    const docs = await base44.entity('Attachment').filter({
      purchase_id: purchase.id
    });

    for (const doc of docs || []) {
      await base44.entity('Attachment').update({
        id: doc.id,
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

export default async function handler(req: any, res: any) {
  try {
    const { action, purchaseId, comentario } = req.body || {};

    if (!purchaseId) {
      throw new Error('purchaseId obrigatório.');
    }

    const purchase = await base44.entity('PurchaseRequest').get(purchaseId);

    if (!purchase) {
      throw new Error('Solicitação não encontrada.');
    }

    const valor = getPurchaseValue(purchase);

    if (action === 'aprovar') {
      const rubrica = await getRubrica(purchase.rubrica_id);

      const jaDebitado =
        !!purchase.rubrica_debitada_em ||
        !!purchase.financeiro_lancado_em ||
        purchase.financeiro_comprometido === true;

      if (!jaDebitado) {
        await debitarRubrica(rubrica, valor);
      }

      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'APROVADO_COORD',
        financeiro_comprometido: true,
        financeiro_lancado_em: purchase.financeiro_lancado_em || new Date().toISOString(),
        rubrica_debitada_em: purchase.rubrica_debitada_em || new Date().toISOString(),
        rubrica_debitada_valor: purchase.rubrica_debitada_valor || valor
      });

      await syncAttachments(updated, 'APROVADO');

      return res.json({
        success: true,
        purchase: updated
      });
    }

    if (action === 'rejeitar' || action === 'devolver') {
      const deveEstornar =
        !!purchase.rubrica_debitada_em ||
        !!purchase.financeiro_lancado_em ||
        purchase.financeiro_comprometido === true;

      if (deveEstornar && purchase.rubrica_id) {
        const rubrica = await getRubrica(purchase.rubrica_id);
        const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valor;
        await estornarRubrica(rubrica, valorEstorno);
      }

      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'DEVOLVIDO',
        comentario_devolucao: comentario || 'Devolvido pela coordenação para ajustes.',
        financeiro_comprometido: false,
        financeiro_lancado_em: null,
        rubrica_debitada_em: null,
        rubrica_debitada_valor: 0
      });

      await syncAttachments(updated, 'DEVOLVIDO');

      return res.json({
        success: true,
        purchase: updated
      });
    }

    if (action === 'cancelar' || action === 'deletar') {
      const deveEstornar =
        !!purchase.rubrica_debitada_em ||
        !!purchase.financeiro_lancado_em ||
        purchase.financeiro_comprometido === true;

      if (deveEstornar && purchase.rubrica_id) {
        const rubrica = await getRubrica(purchase.rubrica_id);
        const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valor;
        await estornarRubrica(rubrica, valorEstorno);
      }

      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'CANCELADO',
        financeiro_comprometido: false,
        financeiro_lancado_em: null,
        rubrica_debitada_em: null,
        rubrica_debitada_valor: 0
      });

      await syncAttachments(updated, 'CANCELADO');

      return res.json({
        success: true,
        purchase: updated
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Ação inválida.'
    });
  } catch (error: any) {
    console.error('purchaseActions error:', error);

    return res.status(400).json({
      success: false,
      error: error?.message || 'Erro ao processar ação.'
    });
  }
}
