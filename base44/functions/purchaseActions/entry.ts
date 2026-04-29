import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

export default async function handler(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { action, id } = body;

    console.log('⚙️ purchaseActions', { action, id });

    const request = await base44.entities.PurchaseRequest.get(id);

    if (!request) {
      return new Response(JSON.stringify({ success: false, error: 'Solicitação não encontrada' }), { status: 404 });
    }

    const rubricaId = request.rubrica_id;

    // =========================
    // APROVAR
    // =========================
    if (action === 'aprovar' || action === 'approve') {
      if (!rubricaId) {
        return new Response(JSON.stringify({ success: false, error: 'Sem rubrica' }));
      }

      const rubrica = await base44.entities.Rubrica.get(rubricaId);

      await base44.entities.Rubrica.update(rubricaId, {
        saldo_comprometido: (rubrica.saldo_comprometido || 0) + (request.valor_total || 0),
      });

      await base44.entities.PurchaseRequest.update(id, {
        status: 'APROVADO',
      });

      return new Response(JSON.stringify({ success: true }));
    }

    // =========================
    // PAGAR
    // =========================
    if (action === 'pagar' || action === 'pay') {
      const rubrica = await base44.entities.Rubrica.get(rubricaId);

      await base44.entities.Rubrica.update(rubricaId, {
        valor_utilizado: (rubrica.valor_utilizado || 0) + (request.valor_total || 0),
        saldo_comprometido: (rubrica.saldo_comprometido || 0) - (request.valor_total || 0),
      });

      await base44.entities.PurchaseRequest.update(id, {
        status: 'PAGO',
      });

      return new Response(JSON.stringify({ success: true }));
    }

    // =========================
    // DEVOLVER
    // =========================
    if (action === 'devolver' || action === 'reject') {
      await base44.entities.PurchaseRequest.update(id, {
        status: 'DEVOLVIDO',
      });

      return new Response(JSON.stringify({ success: true }));
    }

    // =========================
    // DELETAR
    // =========================
    if (action === 'delete' || action === 'deletar') {
      await base44.entities.PurchaseRequest.delete(id);
      return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({ success: false, error: 'Ação inválida' }));
  } catch (err: any) {
    console.error('❌ purchaseActions', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}
