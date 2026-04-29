import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function getValor(request: any) {
  return Number(
    request?.valor_total ??
    request?.valor ??
    request?.nf_valor_total ??
    0
  ) || 0;
}

function normalizeAction(action: any) {
  const value = String(action || '').trim().toLowerCase();

  if (['aprovar', 'approve', 'approved'].includes(value)) return 'aprovar';
  if (['devolver', 'reject', 'rejeitar', 'rejected'].includes(value)) return 'devolver';
  if (['pagar', 'pay', 'marcar_pago', 'marcar-pago', 'paid'].includes(value)) return 'pagar';
  if (['delete', 'deletar', 'excluir', 'remove', 'remover'].includes(value)) return 'deletar';

  return value;
}

export default async function handler(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const action = normalizeAction(body.action);
    const id = body.id || body.purchaseId || body.purchase_id || body.requestId || body.request_id;

    console.log('⚙️ purchaseActions', { action, id, body });

    if (!id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'ID da solicitação obrigatório'
      }), { status: 400 });
    }

    const request = await base44.entities.PurchaseRequest.get(id);

    if (!request) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Solicitação não encontrada'
      }), { status: 404 });
    }

    const rubricaId = request.rubrica_id;
    const valor = getValor(request);

    if (['aprovar', 'pagar'].includes(action)) {
      if (!rubricaId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Solicitação sem rubrica vinculada'
        }), { status: 400 });
      }

      if (!valor) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Valor da solicitação inválido'
        }), { status: 400 });
      }
    }

    if (action === 'aprovar') {
      const rubrica = await base44.entities.Rubrica.get(rubricaId);

      await base44.entities.Rubrica.update(rubricaId, {
        saldo_comprometido: Number(rubrica?.saldo_comprometido || 0) + valor,
      });

      await base44.entities.PurchaseRequest.update(id, {
        status: 'APROVADO',
        aprovado_em: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true }));
    }

    if (action === 'pagar') {
      const rubrica = await base44.entities.Rubrica.get(rubricaId);

      await base44.entities.Rubrica.update(rubricaId, {
        valor_utilizado: Number(rubrica?.valor_utilizado || 0) + valor,
        saldo_comprometido: Math.max(0, Number(rubrica?.saldo_comprometido || 0) - valor),
      });

      await base44.entities.PurchaseRequest.update(id, {
        status: 'PAGO',
        pago_em: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true }));
    }

    if (action === 'devolver') {
      await base44.entities.PurchaseRequest.update(id, {
        status: 'DEVOLVIDO',
        devolvido_em: new Date().toISOString(),
        comentario_devolucao: body.comentario || body.motivo || body.reason || '',
      });

      return new Response(JSON.stringify({ success: true }));
    }

    if (action === 'deletar') {
      await base44.entities.PurchaseRequest.delete(id);
      return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Ação inválida'
    }), { status: 400 });

  } catch (err: any) {
    console.error('❌ purchaseActions', err);

    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Erro interno'
    }), { status: 500 });
  }
}
