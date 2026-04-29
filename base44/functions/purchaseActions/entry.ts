import { base44 } from 'base44'

function toNumber(v: any) {
  const n = Number(String(v || '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function getValue(p: any) {
  return toNumber(
    p?.valor_solicitado ||
    p?.valor ||
    p?.valor_total ||
    p?.valor_aprovado ||
    p?.valor_pago
  )
}

async function getRubrica(id: string) {
  if (!id) throw new Error('Rubrica obrigatória')

  const r = await base44.entity('Rubrica').get(id)

  if (!r) throw new Error('Rubrica inválida')

  return r
}

async function debitarRubrica(rubrica: any, valor: number) {
  const utilizado = toNumber(rubrica.valor_utilizado)
  const total = toNumber(rubrica.valor_rubrica)
  const comprometido = toNumber(rubrica.saldo_comprometido)

  const novoUtilizado = utilizado + valor
  const saldo = total - novoUtilizado - comprometido

  await base44.entity('Rubrica').update({
    id: rubrica.id,
    valor_utilizado: novoUtilizado,
    saldo_real: saldo
  })
}

async function estornarRubrica(rubrica: any, valor: number) {
  const utilizado = toNumber(rubrica.valor_utilizado)
  const total = toNumber(rubrica.valor_rubrica)
  const comprometido = toNumber(rubrica.saldo_comprometido)

  const novoUtilizado = Math.max(0, utilizado - valor)
  const saldo = total - novoUtilizado - comprometido

  await base44.entity('Rubrica').update({
    id: rubrica.id,
    valor_utilizado: novoUtilizado,
    saldo_real: saldo
  })
}

async function syncDocumento(purchase: any, status = 'APROVADO') {
  const docs = await base44.entity('Attachment').filter({
    purchase_id: purchase.id
  })

  for (const d of docs || []) {
    await base44.entity('Attachment').update({
      id: d.id,
      status,
      nf_status: status,
      ocultar_entrada_unica: true,
      inconsistencias: 0
    })
  }
}

export default async function handler(req: any, res: any) {
  try {
    const { action, purchaseId, comentario } = req.body

    if (!purchaseId) {
      throw new Error('purchaseId obrigatório')
    }

    const purchase = await base44.entity('PurchaseRequest').get(purchaseId)

    if (!purchase) {
      throw new Error('Compra não encontrada')
    }

    const valor = getValue(purchase)

    if (action === 'aprovar') {
      const rubrica = await getRubrica(purchase.rubrica_id)

      const jaDebitada =
        !!purchase.rubrica_debitada_em ||
        !!purchase.financeiro_lancado_em ||
        purchase.financeiro_comprometido === true

      if (!jaDebitada) {
        await debitarRubrica(rubrica, valor)
      }

      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'APROVADO_COORD',
        financeiro_comprometido: true,
        financeiro_lancado_em: purchase.financeiro_lancado_em || new Date().toISOString(),
        rubrica_debitada_em: purchase.rubrica_debitada_em || new Date().toISOString(),
        rubrica_debitada_valor: purchase.rubrica_debitada_valor || valor
      })

      await syncDocumento(updated, 'APROVADO')

      return res.json({
        success: true,
        purchase: updated
      })
    }

    if (action === 'pagar') {
      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'PAGO',
        pago_em: purchase.pago_em || new Date().toISOString()
      })

      await syncDocumento(updated, 'PAGO')

      return res.json({
        success: true,
        purchase: updated
      })
    }

    if (action === 'rejeitar' || action === 'devolver') {
      const deveEstornar =
        !!purchase.rubrica_debitada_em ||
        !!purchase.financeiro_lancado_em ||
        purchase.financeiro_comprometido === true

      if (deveEstornar && purchase.rubrica_id) {
        const rubrica = await getRubrica(purchase.rubrica_id)
        const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valor
        await estornarRubrica(rubrica, valorEstorno)
      }

      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'DEVOLVIDO',
        comentario_devolucao: comentario || 'Devolvido pela coordenação.',
        financeiro_comprometido: false,
        financeiro_lancado_em: null,
        rubrica_debitada_em: null,
        rubrica_debitada_valor: 0
      })

      await syncDocumento(updated, 'DEVOLVIDO')

      return res.json({
        success: true,
        purchase: updated
      })
    }

    if (action === 'deletar' || action === 'cancelar') {
      const deveEstornar =
        !!purchase.rubrica_debitada_em ||
        !!purchase.financeiro_lancado_em ||
        purchase.financeiro_comprometido === true

      if (deveEstornar && purchase.rubrica_id) {
        const rubrica = await getRubrica(purchase.rubrica_id)
        const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valor
        await estornarRubrica(rubrica, valorEstorno)
      }

      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'CANCELADO',
        financeiro_comprometido: false,
        financeiro_lancado_em: null,
        rubrica_debitada_em: null,
        rubrica_debitada_valor: 0
      })

      await syncDocumento(updated, 'CANCELADO')

      return res.json({
        success: true,
        purchase: updated
      })
    }

    return res.status(400).json({
      success: false,
      error: 'Ação inválida'
    })
  } catch (e: any) {
    return res.status(400).json({
      success: false,
      error: e.message
    })
  }
}
