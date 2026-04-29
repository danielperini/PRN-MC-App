import { base44 } from 'base44'

function toNumber(v: any) {
  const n = Number(String(v || '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function getValue(p: any) {
  return toNumber(
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
  const comprometido = toNumber(rubrica.saldo_comprometido)
  const utilizado = toNumber(rubrica.valor_utilizado)
  const total = toNumber(rubrica.valor_rubrica)

  const novoComprometido = comprometido + valor
  const saldo = total - utilizado - novoComprometido

  await base44.entity('Rubrica').update({
    id: rubrica.id,
    saldo_comprometido: novoComprometido,
    saldo_real: saldo
  })
}

async function syncDocumento(purchase: any) {
  const docs = await base44.entity('Attachment').filter({
    purchase_id: purchase.id
  })

  for (const d of docs || []) {
    await base44.entity('Attachment').update({
      id: d.id,
      status: 'APROVADO',
      nf_status: 'APROVADO',
      ocultar_entrada_unica: true, // 🔥 REMOVE DA LISTA
      inconsistencias: 0
    })
  }
}

export default async function handler(req: any, res: any) {
  try {
    const { action, purchaseId } = req.body

    if (action === 'aprovar') {
      const purchase = await base44.entity('PurchaseRequest').get(purchaseId)

      if (!purchase) throw new Error('Compra não encontrada')

      const rubrica = await getRubrica(purchase.rubrica_id)
      const valor = getValue(purchase)

      // 🔥 DEBITA IMEDIATO
      await debitarRubrica(rubrica, valor)

      const updated = await base44.entity('PurchaseRequest').update({
        id: purchase.id,
        status: 'APROVADO_COORD',
        financeiro_comprometido: true
      })

      // 🔥 REMOVE DA ENTRADA ÚNICA
      await syncDocumento(updated)

      return res.json({ success: true })
    }

    return res.json({ success: false })
  } catch (e: any) {
    return res.status(400).json({ error: e.message })
  }
}
