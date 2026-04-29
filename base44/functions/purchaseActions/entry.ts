import { base44 } from 'base44'

function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function getPurchaseValue(purchase: any): number {
  return toNumber(
    purchase?.valor_pago ??
      purchase?.valor_aprovado_admin ??
      purchase?.valor_aprovado ??
      purchase?.valor_final ??
      purchase?.valor_solicitado ??
      purchase?.valor_total ??
      purchase?.valor
  )
}

function normalizeAction(value: any): string {
  return String(value || '').trim().toLowerCase()
}

async function getEntity(entityName: string, id: string) {
  if (!id) return null
  return await base44.entity(entityName).get(id)
}

async function updateEntity(entityName: string, payload: any) {
  return await base44.entity(entityName).update(payload)
}

async function createEntity(entityName: string, payload: any) {
  return await base44.entity(entityName).create(payload)
}

async function validateRubrica(rubrica_id: string) {
  if (!rubrica_id) {
    throw new Error('Envio bloqueado: rubrica não informada.')
  }

  const rubrica = await getEntity('Rubrica', rubrica_id)

  if (!rubrica) {
    throw new Error('Envio bloqueado: rubrica inválida ou inexistente.')
  }

  return rubrica
}

async function registrarAuditoriaFinanceira(payload: any) {
  try {
    await createEntity('FinanceMovement', {
      ...payload,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.warn('Auditoria financeira não registrada em FinanceMovement:', error)
  }
}

async function sincronizarDocumentosDaCompra(purchase: any, statusDocumento: string) {
  try {
    const attachments = await base44.entity('Attachment').filter({
      purchase_id: purchase.id
    })

    for (const att of attachments || []) {
      await updateEntity('Attachment', {
        id: att.id,
        status: statusDocumento,
        nf_status: statusDocumento,
        aprovado_em:
          statusDocumento === 'APROVADO'
            ? new Date().toISOString()
            : att.aprovado_em || null,
        inconsistencias:
          statusDocumento === 'APROVADO'
            ? 0
            : att.inconsistencias
      })
    }
  } catch (error) {
    console.warn('Erro ao sincronizar documentos da compra:', error)
  }
}

async function comprometerRubricaNaAprovacao(purchase: any) {
  if (!purchase?.id) {
    throw new Error('Compra inválida.')
  }

  if (purchase?.financeiro_comprometido === true) {
    return {
      alreadyCommitted: true,
      rubrica: purchase?.rubrica_id
        ? await getEntity('Rubrica', purchase.rubrica_id)
        : null,
      valor: getPurchaseValue(purchase)
    }
  }

  const rubrica = await validateRubrica(purchase.rubrica_id)
  const valor = getPurchaseValue(purchase)

  if (valor <= 0) {
    throw new Error('Envio bloqueado: valor da compra inválido para aprovação.')
  }

  const saldoComprometidoAtual = toNumber(rubrica.saldo_comprometido)
  const valorUtilizadoAtual = toNumber(rubrica.valor_utilizado)
  const valorRubrica = toNumber(
    rubrica.valor_rubrica ?? rubrica.valor_total ?? rubrica.valor
  )

  const novoSaldoComprometido = saldoComprometidoAtual + valor
  const saldoReal =
    valorRubrica > 0
      ? valorRubrica - valorUtilizadoAtual - novoSaldoComprometido
      : rubrica.saldo_real

  await updateEntity('Rubrica', {
    id: rubrica.id,
    saldo_comprometido: novoSaldoComprometido,
    saldo_real: saldoReal,
    updated_at: new Date().toISOString()
  })

  await registrarAuditoriaFinanceira({
    tipo: 'COMPROMISSO_COMPRA_APROVADA',
    purchase_id: purchase.id,
    rubrica_id: rubrica.id,
    rubrica_nome: rubrica.nome || rubrica.rubrica,
    valor,
    status_origem: purchase.status || null,
    observacao: 'Compra aprovada pela coordenação; valor comprometido na rubrica.'
  })

  return {
    alreadyCommitted: false,
    rubrica,
    valor
  }
}

async function baixarCompromissoNoPagamento(purchase: any) {
  if (!purchase?.id) {
    throw new Error('Compra inválida.')
  }

  if (purchase?.financeiro_utilizado === true) {
    return {
      alreadyUsed: true,
      rubrica: purchase?.rubrica_id
        ? await getEntity('Rubrica', purchase.rubrica_id)
        : null,
      valor: getPurchaseValue(purchase)
    }
  }

  const rubrica = await validateRubrica(purchase.rubrica_id)
  const valor = getPurchaseValue(purchase)

  if (valor <= 0) {
    throw new Error('Pagamento bloqueado: valor inválido.')
  }

  const saldoComprometidoAtual = toNumber(rubrica.saldo_comprometido)
  const valorUtilizadoAtual = toNumber(rubrica.valor_utilizado)
  const valorRubrica = toNumber(
    rubrica.valor_rubrica ?? rubrica.valor_total ?? rubrica.valor
  )

  const novoSaldoComprometido = Math.max(0, saldoComprometidoAtual - valor)
  const novoValorUtilizado = valorUtilizadoAtual + valor
  const saldoReal =
    valorRubrica > 0
      ? valorRubrica - novoValorUtilizado - novoSaldoComprometido
      : rubrica.saldo_real

  await updateEntity('Rubrica', {
    id: rubrica.id,
    saldo_comprometido: novoSaldoComprometido,
    valor_utilizado: novoValorUtilizado,
    saldo_real: saldoReal,
    updated_at: new Date().toISOString()
  })

  await registrarAuditoriaFinanceira({
    tipo: 'PAGAMENTO_COMPRA',
    purchase_id: purchase.id,
    rubrica_id: rubrica.id,
    rubrica_nome: rubrica.nome || rubrica.rubrica,
    valor,
    status_origem: purchase.status || null,
    observacao: 'Compra marcada como paga; valor transferido de comprometido para utilizado.'
  })

  return {
    alreadyUsed: false,
    rubrica,
    valor
  }
}

export default async function handler(req: any, res: any) {
  try {
    const body = req.body || {}
    const action = normalizeAction(body.action)
    const data = body.data || body
    const purchaseId = body.purchaseId || data?.purchaseId || data?.id

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Ação não enviada.'
      })
    }

    if (action === 'updatepurchase') {
      const { id, rubrica_id, centro_custo } = data

      const rubrica = await validateRubrica(rubrica_id)

      if (
        rubrica.centro_custo &&
        centro_custo &&
        rubrica.centro_custo !== 'GERAL' &&
        rubrica.centro_custo !== centro_custo
      ) {
        console.warn('⚠️ Rubrica com centro diferente — permitido com alerta')
      }

      const updated = await updateEntity('PurchaseRequest', {
        id,
        ...data,
        rubrica_nome: rubrica.nome || rubrica.rubrica,
        rubrica_grupo: rubrica.grupo || rubrica.categoria || '',
        updated_at: new Date().toISOString()
      })

      return res.status(200).json({
        success: true,
        purchase: updated
      })
    }

    if (action === 'createpurchase') {
      const rubrica = await validateRubrica(data.rubrica_id)

      const created = await createEntity('PurchaseRequest', {
        ...data,
        rubrica_nome: rubrica.nome || rubrica.rubrica,
        rubrica_grupo: rubrica.grupo || rubrica.categoria || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      return res.status(200).json({
        success: true,
        purchase: created
      })
    }

    if (action === 'aprovar' || action === 'approve') {
      if (!purchaseId) {
        return res.status(400).json({
          success: false,
          error: 'Compra não informada para aprovação.'
        })
      }

      const purchase = await getEntity('PurchaseRequest', purchaseId)

      if (!purchase) {
        return res.status(404).json({
          success: false,
          error: 'Compra não encontrada.'
        })
      }

      const { rubrica, valor, alreadyCommitted } =
        await comprometerRubricaNaAprovacao(purchase)

      const updated = await updateEntity('PurchaseRequest', {
        id: purchase.id,
        status: 'APROVADO_COORD',
        rubrica_id: purchase.rubrica_id,
        rubrica_nome:
          purchase.rubrica_nome || rubrica?.nome || rubrica?.rubrica || '',
        rubrica_grupo:
          purchase.rubrica_grupo || rubrica?.grupo || rubrica?.categoria || '',
        financeiro_comprometido: true,
        valor_comprometido_financeiro:
          purchase.valor_comprometido_financeiro || valor || getPurchaseValue(purchase),
        aprovado_coord_em: purchase.aprovado_coord_em || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      await sincronizarDocumentosDaCompra(
        {
          ...purchase,
          ...updated
        },
        'APROVADO'
      )

      return res.status(200).json({
        success: true,
        purchase: updated,
        rubrica_id: purchase.rubrica_id,
        financeiro_comprometido: true,
        alreadyCommitted
      })
    }

    if (action === 'pagar' || action === 'pago' || action === 'pay') {
      if (!purchaseId) {
        return res.status(400).json({
          success: false,
          error: 'Compra não informada para pagamento.'
        })
      }

      const purchase = await getEntity('PurchaseRequest', purchaseId)

      if (!purchase) {
        return res.status(404).json({
          success: false,
          error: 'Compra não encontrada.'
        })
      }

      const { rubrica, valor, alreadyUsed } =
        await baixarCompromissoNoPagamento(purchase)

      const updated = await updateEntity('PurchaseRequest', {
        id: purchase.id,
        status: 'PAGO',
        rubrica_id: purchase.rubrica_id,
        rubrica_nome:
          purchase.rubrica_nome || rubrica?.nome || rubrica?.rubrica || '',
        rubrica_grupo:
          purchase.rubrica_grupo || rubrica?.grupo || rubrica?.categoria || '',
        financeiro_comprometido: true,
        financeiro_utilizado: true,
        valor_utilizado_financeiro:
          purchase.valor_utilizado_financeiro || valor || getPurchaseValue(purchase),
        pago_em: purchase.pago_em || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      await sincronizarDocumentosDaCompra(
        {
          ...purchase,
          ...updated
        },
        'PAGO'
      )

      return res.status(200).json({
        success: true,
        purchase: updated,
        rubrica_id: purchase.rubrica_id,
        financeiro_utilizado: true,
        alreadyUsed
      })
    }

    if (action === 'rejeitar' || action === 'devolver' || action === 'return') {
      if (!purchaseId) {
        return res.status(400).json({
          success: false,
          error: 'Compra não informada para devolução.'
        })
      }

      const purchase = await getEntity('PurchaseRequest', purchaseId)

      if (!purchase) {
        return res.status(404).json({
          success: false,
          error: 'Compra não encontrada.'
        })
      }

      const updated = await updateEntity('PurchaseRequest', {
        id: purchase.id,
        status: 'DEVOLVIDO',
        comentario_devolucao:
          body.comentario || data?.comentario || 'Devolvido pela coordenação.',
        devolvido_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      await sincronizarDocumentosDaCompra(
        {
          ...purchase,
          ...updated
        },
        'DEVOLVIDO'
      )

      return res.status(200).json({
        success: true,
        purchase: updated
      })
    }

    return res.status(400).json({
      success: false,
      error: 'Ação inválida.'
    })
  } catch (err: any) {
    console.error('❌ purchaseActions error:', err)

    return res.status(400).json({
      success: false,
      error: err?.message || 'Erro interno em purchaseActions.'
    })
  }
}
