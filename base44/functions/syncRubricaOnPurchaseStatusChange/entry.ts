import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APPROVED_STATUSES = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO', 'PAGO']);

function toNum(v) {
  const n = parseFloat(String(v || '0').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function normCC(cc) {
  if (!cc) return '';
  const s = String(cc).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('mumo')) return 'mumo';
  if (s.includes('pampulha')) return 'noturno pampulha';
  if (s.includes('noturno') && s.includes('2026')) return 'noturno 2026';
  if (s.includes('noturno nos museus')) return 'noturno nos museus';
  if (s.includes('noturno')) return 'noturno 2026';
  if (s.includes('mis')) return 'mis bh';
  if (s.includes('mhab') || s.includes('mab')) return 'mhab';
  if (s.includes('publicacoes') || s.includes('publicações')) return 'publicacoes';
  if (s.includes('coordenacao') || s.includes('coordenação')) return 'coordenacao';
  if (s.includes('comunicacao') || s.includes('comunicação')) return 'comunicacao';
  if (s.includes('educacao') || s.includes('educação')) return 'educacao';
  if (s.includes('producao') || s.includes('produção')) return 'producao';
  if (s.includes('administrativo')) return 'administrativo';
  if (s.includes('consultor')) return 'consultorias';
  if (s.includes('geral') || s.includes('transversal')) return 'geral';
  return s.trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const purchaseId = payload?.event?.entity_id || payload?.entity_id || payload?.purchase_id;
    const purchaseData = payload?.data || null;

    if (!purchaseId) {
      return Response.json({ ok: false, message: 'Nenhum purchase_id fornecido' });
    }

    // Buscar dados da PurchaseRequest
    let purchase = purchaseData;
    if (!purchase || !purchase.status) {
      purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    }

    if (!purchase) {
      return Response.json({ ok: false, message: 'PurchaseRequest não encontrada' });
    }

    const status = purchase.status;

    // Só processa se status for APROVADO_ADMIN ou PAGO
    if (!APPROVED_STATUSES.has(status)) {
      return Response.json({ ok: true, message: `Status ${status} não requer recálculo de rubrica` });
    }

    const rubricaId = purchase.rubrica_id;
    if (!rubricaId) {
      console.log(`[syncRubrica] PurchaseRequest ${purchaseId} sem rubrica_id — ignorando`);
      return Response.json({ ok: true, message: 'Sem rubrica_id vinculada' });
    }

    // Buscar rubrica
    const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);
    if (!rubrica) {
      console.log(`[syncRubrica] Rubrica ${rubricaId} não encontrada`);
      return Response.json({ ok: false, message: 'Rubrica não encontrada' });
    }

    // Calcular valor_utilizado somando todas as compras aprovadas/pagas desta rubrica
    const comprasVinculadas = await base44.asServiceRole.entities.PurchaseRequest.filter({
      rubrica_id: rubricaId
    });

    const valorUtilizado = comprasVinculadas
      .filter(c => APPROVED_STATUSES.has(c.status))
      .reduce((sum, c) => {
        const valor = toNum(c.valor_aprovado_admin || c.valor_pago || c.valor_solicitado || 0);
        return sum + valor;
      }, 0);

    const valorRubrica = toNum(rubrica.valor_rubrica || rubrica.valor_total || 0);
    const saldo = valorRubrica - valorUtilizado;
    const percentual = valorRubrica > 0 ? (valorUtilizado / valorRubrica) * 100 : 0;

    // Atualizar rubrica
    await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      saldo_real: saldo,
      percentual_utilizado: percentual
    });

    console.log(`[syncRubrica] Rubrica ${rubricaId} atualizada: utilizado=${valorUtilizado}, saldo=${saldo}`);

    // Corrigir centro_custo da PurchaseRequest se divergente
    const ccRubrica = rubrica.centro_custo || '';
    const ccPurchase = purchase.centro_custo || '';

    if (ccRubrica && normCC(ccPurchase) !== normCC(ccRubrica)) {
      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        centro_custo: ccRubrica
      });
      console.log(`[syncRubrica] CC corrigido: "${ccPurchase}" → "${ccRubrica}" na compra ${purchaseId}`);
    }

    return Response.json({
      ok: true,
      rubrica_id: rubricaId,
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      percentual_utilizado: percentual,
      cc_corrigido: ccRubrica && normCC(ccPurchase) !== normCC(ccRubrica) ? ccRubrica : null
    });

  } catch (error) {
    console.error('[syncRubrica] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});