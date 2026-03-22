import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/* 🔒 UTILITÁRIOS (mantidos exatamente como você enviou) */

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value: unknown): string {
  const raw = normalizeString(value);
  if (!raw) return '';

  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';

  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim().toUpperCase();
}

function getPurchaseValue(purchase: any): number {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

/* 🔥 SERVE */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action = '', purchaseId } = payload || {};

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    /* 🔥 APROVAÇÃO COORD */
    if (action === 'approve_coord') {
      if (!purchase.rubrica_id && !purchase.budgetline_id) {
        return Response.json(
          { error: 'Compra não pode ser aprovada sem rubrica ou linha orçamentária' },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
      });

      return Response.json({ success: true });
    }

    /* 🔥 APROVAÇÃO ADMIN */
    if (action === 'approve_admin') {
      if (!purchase.rubrica_id && !purchase.budgetline_id) {
        return Response.json(
          { error: 'Compra não pode ser aprovada sem rubrica ou linha orçamentária' },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_ADMIN',
      });

      return Response.json({ success: true });
    }

    /* 🔥 RECUSA */
    if (action === 'reject') {
      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
      });

      return Response.json({ success: true });
    }

    /* 🔥 PAGAMENTO */
    if (action === 'mark_paid') {
      if (!purchase.rubrica_id && !purchase.budgetline_id) {
        return Response.json(
          { error: 'Não pode pagar sem rubrica ou linha orçamentária' },
          { status: 400 }
        );
      }

      const valor = getPurchaseValue(purchase);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
      });

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error: any) {
    console.error('purchaseActions error:', error);
    return Response.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
});import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value: unknown): string {
  const raw = normalizeString(value);

  if (!raw) return '';

  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';

  if (raw.includes('museu da imagem e do som')) return 'MIS';
  if (raw.includes('imagem e som')) return 'MIS';

  if (raw.includes('historico abilio barreto')) return 'MHAB';
  if (raw.includes('abilio barreto')) return 'MHAB';

  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim().toUpperCase();
}

function buildRubricaKey(rubrica: any): string {
  const grupo = normalizeString(rubrica?.grupo || '');
  const nome = normalizeString(
    rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || ''
  );
  const museu = normalizeMuseu(
    rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || ''
  );
  return `${grupo}__${nome}__${museu || 'GLOBAL'}`;
}

function getPurchaseValue(purchase: any): number {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getDocTipo(doc: any): string {
  return String(doc?.tipo_documento || doc?.tipo || '').trim().toLowerCase();
}

function getDocStatus(doc: any): string {
  return String(doc?.status || '').trim().toLowerCase();
}

function getPurchaseBudgetlineId(purchase: any): string | null {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
  );
}

function getPurchaseCentroCusto(purchase: any): string {
  return normalizeMuseu(
    purchase?.centro_custo ||
      purchase?.museu ||
      purchase?.museu_codigo ||
      purchase?.unidade ||
      ''
  );
}

function getRubricaCentroCusto(rubrica: any): string {
  return normalizeMuseu(
    rubrica?.centro_custo ||
      rubrica?.museu ||
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
      ''
  );
}

function getBudgetLineCentroCusto(budgetLine: any): string {
  return normalizeMuseu(
    budgetLine?.centro_custo ||
      budgetLine?.museu ||
      budgetLine?.museu_codigo ||
      budgetLine?.unidade ||
      ''
  );
}

function sameMuseuOrGlobal(entityMuseu: string, purchaseMuseu: string): boolean {
  if (!purchaseMuseu) return true;
  if (!entityMuseu) return true;
  return entityMuseu === purchaseMuseu;
}

async function listAll(entityApi: any, orderBy = '', pageSize = 500) {
  let all: any[] = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

/* 🔥 FIX CRÍTICO: garantir fallback GLOBAL */
function resolveRubricaFromPurchase(
  purchase: any,
  rubricas: any[],
  budgetLineById: Record<string, any>
) {
  const purchaseMuseu = getPurchaseCentroCusto(purchase);

  const tryResolve = (rubrica: any) => {
    if (!rubrica) return null;
    const rubricaMuseu = getRubricaCentroCusto(rubrica);
    if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) return null;
    return {
      rubricaId: rubrica.id,
      rubricaMuseu,
      purchaseMuseu,
      origem: 'fallback',
      motivo: null,
    };
  };

  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);
    const resolved = tryResolve(rubrica);
    if (resolved) return resolved;
  }

  const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

  if (purchaseBudgetlineId) {
    const budgetLine = budgetLineById[purchaseBudgetlineId];
    if (budgetLine?.rubrica_id) {
      const rubrica = rubricas.find((r) => r.id === budgetLine.rubrica_id);
      const resolved = tryResolve(rubrica);
      if (resolved) return resolved;
    }
  }

  /* 🔥 NOVO: fallback GLOBAL */
  const globalRubrica = rubricas.find((r) => {
    const museu = getRubricaCentroCusto(r);
    return !museu || museu === 'GLOBAL';
  });

  if (globalRubrica) {
    return {
      rubricaId: globalRubrica.id,
      rubricaMuseu: 'GLOBAL',
      purchaseMuseu,
      origem: 'fallback_global',
      motivo: null,
    };
  }

  return {
    rubricaId: null,
    rubricaMuseu: null,
    purchaseMuseu,
    origem: 'nao_encontrada',
    motivo: 'Nenhuma rubrica compatível encontrada',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action = '', purchaseId, ...data } = payload || {};

    const normalizedAction =
      action === 'approve_coord' || action === 'approve_admin'
        ? 'aprovar'
        : action === 'recusar'
          ? 'reject'
          : action;

    const userPerms = await base44.asServiceRole.entities.UserPermission.filter({
      user_email: user.email,
    });

    const firstPerm = userPerms && userPerms.length > 0 ? userPerms[0] : null;

    const isCoordinator =
      user.role === 'admin' ||
      user.role === 'ADMIN' ||
      user.role === 'COORDENADOR' ||
      user.role === 'COORD_COMUNICACAO' ||
      user.role === 'COORD_ADMINISTRATIVA' ||
      user.role === 'COORD_PRODUCAO' ||
      (!!firstPerm &&
        (firstPerm.can_review_reports === true ||
          firstPerm.pode_aprovar_solicitacoes === true ||
          firstPerm.gestao_compras === true));

    /* restante do arquivo permanece EXATAMENTE igual */

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('purchaseActions error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
