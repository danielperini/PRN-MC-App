import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
  if (raw === 'geral' || raw === 'global') return 'GLOBAL';
  if (raw.includes('publica')) return 'PUBLICAÇÕES';
  if (raw.includes('noturno')) return 'NOTURNO NOS MUSEUS 2026';

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
  if (entityMuseu === 'GLOBAL') return true;
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

async function syncPurchaseFinanceData(
  base44: any,
  purchaseId: string,
  rubricas: any[],
  budgetLineById: Record<string, any>
) {
  const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
  if (!purchase) return null;

  const resolved = resolveRubricaFromPurchase(purchase, rubricas, budgetLineById);

  const patch: Record<string, any> = {};

  if (!purchase.rubrica_id && resolved?.rubricaId) {
    patch.rubrica_id = resolved.rubricaId;
  }

  const budgetLineId = getPurchaseBudgetlineId(purchase);
  if (budgetLineId && !purchase.budgetline_id) {
    patch.budgetline_id = budgetLineId;
  }

  if (Object.keys(patch).length > 0) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, patch);
  }

  return {
    purchase: { ...purchase, ...patch },
    resolved,
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

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
    }

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

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const budgetLines = await listAll(
      base44.asServiceRole.entities.BudgetLine,
      'codigo',
      300
    ).catch(() => []);

    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      300
    ).catch(() => []);

    const budgetLineById: Record<string, any> = {};
    for (const line of budgetLines) {
      if (line?.id) budgetLineById[line.id] = line;
    }

    const synced = await syncPurchaseFinanceData(
      base44,
      purchaseId,
      rubricas,
      budgetLineById
    );

    const effectivePurchase = synced?.purchase || purchase;

    const purchaseBudgetlineId = getPurchaseBudgetlineId(effectivePurchase);
    const purchaseBudgetLine = purchaseBudgetlineId
      ? budgetLineById[purchaseBudgetlineId] || null
      : null;

    const purchaseCentro = getPurchaseCentroCusto(effectivePurchase);

    const hasFinanceLink =
      !!effectivePurchase?.rubrica_id || !!purchaseBudgetlineId;

    if (
      effectivePurchase?.rubrica_id &&
      rubricas.length > 0
    ) {
      const linkedRubrica = rubricas.find((r) => r.id === effectivePurchase.rubrica_id);
      const rubricaCentro = getRubricaCentroCusto(linkedRubrica);
      if (
        purchaseCentro &&
        rubricaCentro &&
        rubricaCentro !== 'GLOBAL' &&
        !sameMuseuOrGlobal(rubricaCentro, purchaseCentro)
      ) {
        return Response.json(
          { error: 'Rubrica incompatível com o centro de custo da compra' },
          { status: 400 }
        );
      }
    }

    if (
      purchaseBudgetLine &&
      purchaseCentro
    ) {
      const budgetLineCentro = getBudgetLineCentroCusto(purchaseBudgetLine);
      if (
        budgetLineCentro &&
        budgetLineCentro !== 'GLOBAL' &&
        !sameMuseuOrGlobal(budgetLineCentro, purchaseCentro)
      ) {
        return Response.json(
          { error: 'Linha orçamentária incompatível com o centro de custo da compra' },
          { status: 400 }
        );
      }
    }

    if (normalizedAction === 'aprovar') {
      if (!isCoordinator) {
        return Response.json(
          { error: 'Sem permissão para aprovar solicitações' },
          { status: 403 }
        );
      }

      if (!hasFinanceLink) {
        return Response.json(
          { error: 'Vincule uma rubrica ou linha orçamentária antes de aprovar' },
          { status: 400 }
        );
      }

      if (purchaseBudgetLine) {
        const disponivel =
          toNumber(purchaseBudgetLine?.saldo_inicial) -
          toNumber(purchaseBudgetLine?.saldo_comprometido);

        const valorCompra = getPurchaseValue(effectivePurchase);

        if (disponivel < valorCompra) {
          return Response.json(
            { error: 'Saldo insuficiente na linha orçamentária para aprovação' },
            { status: 400 }
          );
        }
      }

      if (effectivePurchase?.team_payment_id) {
        let tp = null;
        try {
          tp = await base44.asServiceRole.entities.TeamPayment.get(
            effectivePurchase.team_payment_id
          );
        } catch {}

        if (tp) {
          let validation = null;
          try {
            if (tp.resultado_validacao) {
              validation = JSON.parse(tp.resultado_validacao);
            }
          } catch {}

          if (validation?.status === 'divergente') {
            return Response.json(
              { error: 'NF com divergência detectada. Aprovação bloqueada.' },
              { status: 400 }
            );
          }

          await base44.asServiceRole.entities.TeamPayment.update(tp.id, {
            status: 'APROVADO_COORD',
            observacoes: data?.comentario || tp?.observacoes || null,
            aprov_coord_nome: user.full_name || '',
            aprov_coord_email: user.email || '',
            aprov_coord_data: new Date().toISOString(),
          });
        }
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
        valor_aprovado: getPurchaseValue(effectivePurchase),
        comentario_aprovacao: data?.comentario || null,
        approved_by: user.email,
        approved_at: new Date().toISOString(),
      });

      try {
        await base44.functions.invoke('recalcularRubricas3Aditivo', {});
      } catch (error) {
        console.error('Erro ao recalcular rubricas após aprovação:', error);
      }

      return Response.json({ success: true, status: 'APROVADO_COORD' });
    }

    if (normalizedAction === 'devolver_usuario') {
      if (!isCoordinator) {
        return Response.json(
          { error: 'Sem permissão para devolver solicitações' },
          { status: 403 }
        );
      }

      if (!String(data?.comentario || '').trim()) {
        return Response.json(
          { error: 'Comentário é obrigatório para devolver ao usuário' },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RASCUNHO',
        comentario_aprovacao: String(data?.comentario || '').trim(),
        devolvido_por: user.email,
        devolvido_em: new Date().toISOString(),
      });

      if (effectivePurchase?.team_payment_id) {
        try {
          await base44.asServiceRole.entities.TeamPayment.update(
            effectivePurchase.team_payment_id,
            {
              status: 'DEVOLVIDO_REVISAO',
              observacoes: String(data?.comentario || '').trim(),
            }
          );
        } catch (error) {
          console.error('Erro ao devolver TeamPayment:', error);
        }
      }

      return Response.json({ success: true, status: 'RASCUNHO' });
    }

    if (normalizedAction === 'reject') {
      if (!isCoordinator) {
        return Response.json(
          { error: 'Sem permissão para recusar solicitações' },
          { status: 403 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
        comentario_aprovacao: data?.comentario || null,
        recusado_por: user.email,
        recusado_em: new Date().toISOString(),
      });

      if (effectivePurchase?.team_payment_id) {
        try {
          await base44.asServiceRole.entities.TeamPayment.update(
            effectivePurchase.team_payment_id,
            {
              status: 'DEVOLVIDO_REVISAO',
              observacoes: data?.comentario || null,
            }
          );
        } catch (error) {
          console.error('Erro ao atualizar TeamPayment recusado:', error);
        }
      }

      try {
        await base44.functions.invoke('recalcularRubricas3Aditivo', {});
      } catch (error) {
        console.error('Erro ao recalcular rubricas após recusa:', error);
      }

      return Response.json({ success: true, status: 'RECUSADO' });
    }

    if (normalizedAction === 'mark_paid') {
      if (!isCoordinator) {
        return Response.json(
          { error: 'Sem permissão para marcar pagamento' },
          { status: 403 }
        );
      }

      if (!effectivePurchase.rubrica_id && !purchaseBudgetlineId) {
        return Response.json(
          { error: 'Não pode pagar sem rubrica ou linha orçamentária' },
          { status: 400 }
        );
      }

      let tp = null;

      if (effectivePurchase.team_payment_id) {
        try {
          tp = await base44.asServiceRole.entities.TeamPayment.get(
            effectivePurchase.team_payment_id
          );
        } catch {}
      }

      if (tp) {
        let validation = null;

        try {
          if (tp.resultado_validacao) {
            validation = JSON.parse(tp.resultado_validacao);
          }
        } catch {}

        if (!validation) {
          return Response.json(
            { error: 'NF ainda não validada' },
            { status: 400 }
          );
        }

        if (validation.status === 'divergente') {
          return Response.json(
            { error: 'NF divergente — pagamento bloqueado' },
            { status: 400 }
          );
        }
      }

      const valor = getPurchaseValue(effectivePurchase);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
        pago_por: user.email,
        pago_em: new Date().toISOString(),
      });

      if (tp) {
        await base44.asServiceRole.entities.TeamPayment.update(tp.id, {
          status: 'PAGO',
          valor_pago: valor,
          data_pagamento: new Date().toISOString(),
        });
      }

      try {
        await base44.functions.invoke('recalcularRubricas3Aditivo', {});
      } catch (error) {
        console.error('Erro ao recalcular rubricas após pagamento:', error);
      }

      return Response.json({ success: true, status: 'PAGO' });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('purchaseActions error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
