// base44/functions/purchaseActions/entry.ts

import { base44 } from 'base44'

export default async function handler(req: any, res: any) {
  try {
    const { action, data } = req.body

    if (!action || !data) {
      return res.status(400).json({ error: 'Ação ou dados não enviados' })
    }

    // ===============================
    // 🔎 VALIDAÇÃO DE RUBRICA (FIX)
    // ===============================
    const validateRubrica = async (rubrica_id: string) => {
      if (!rubrica_id) {
        throw new Error('Envio bloqueado: rubrica não informada.')
      }

      const rubrica = await base44.entity('Rubrica').get(rubrica_id)

      if (!rubrica) {
        throw new Error('Envio bloqueado: rubrica inválida ou inexistente.')
      }

      return rubrica
    }

    // ===============================
    // ✏️ UPDATE DE COMPRA
    // ===============================
    if (action === 'updatePurchase') {
      const {
        id,
        rubrica_id,
        centro_custo
      } = data

      // 🔥 valida rubrica
      const rubrica = await validateRubrica(rubrica_id)

      // 🔒 regra opcional: validar centro (SEM BLOQUEAR GERAL)
      if (
        rubrica.centro_custo &&
        centro_custo &&
        rubrica.centro_custo !== 'GERAL' &&
        rubrica.centro_custo !== centro_custo
      ) {
        console.warn('⚠️ Rubrica com centro diferente — permitido com alerta')
      }

      // ✅ update seguro
      const updated = await base44.entity('PurchaseRequest').update({
        id,
        ...data,
        rubrica_nome: rubrica.nome,
        rubrica_grupo: rubrica.grupo
      })

      return res.status(200).json(updated)
    }

    // ===============================
    // ➕ CREATE DE COMPRA
    // ===============================
    if (action === 'createPurchase') {
      const {
        rubrica_id
      } = data

      const rubrica = await validateRubrica(rubrica_id)

      const created = await base44.entity('PurchaseRequest').create({
        ...data,
        rubrica_nome: rubrica.nome,
        rubrica_grupo: rubrica.grupo
      })

      return res.status(200).json(created)
    }

    return res.status(400).json({ error: 'Ação inválida' })

  } catch (err: any) {
    console.error('❌ purchaseActions error:', err.message)

    return res.status(400).json({
      error: err.message || 'Erro interno'
    })
  }
}
