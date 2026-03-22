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

function resolveRubricaFromPurchase(
  purchase: any,
  rubricas: any[],
  budgetLineById: Record<string, any>
) {
  const purchaseMuseu = getPurchaseCentroCusto(purchase);

  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);

    if (!rubrica) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'rubrica_id_nao_encontrada',
        motivo: 'rubrica_id informado na compra não foi encontrado',
      };
    }

    const rubricaMuseu = getRubricaCentroCusto(rubrica);

    if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'rubrica_id_incompativel_museu',
        motivo: `Rubrica vinculada ao museu ${rubricaMuseu}, mas a compra está em ${purchaseMuseu}`,
      };
    }

    const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

    if (purchaseBudgetlineId) {
      const budgetLine = budgetLineById[purchaseBudgetlineId];

      if (!budgetLine) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_nao_encontrada',
          motivo: 'BudgetLine vinculada na compra não foi encontrada',
        };
      }

      const budgetMuseu = getBudgetLineCentroCusto(budgetLine);

      if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_incompativel_museu',
          motivo: `BudgetLine vinculada ao museu ${budgetMuseu}, mas a compra está em ${purchaseMuseu}`,
        };
      }

      if (budgetLine?.rubrica_id && budgetLine.rubrica_id !== rubrica.id) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_rubrica_divergente',
          motivo: 'BudgetLine aponta para rubrica diferente da rubrica_id informada na compra',
        };
      }
    }

    return {
      rubricaId: rubrica.id,
      rubricaMuseu,
      purchaseMuseu,
      origem: 'rubrica_id',
      motivo: null,
    };
  }

  const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

  if (!purchaseBudgetlineId) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'sem_rubrica_id_e_sem_budgetline',
      motivo: 'Compra sem rubrica_id e sem BudgetLine vinculada',
    };
  }

  const budgetLine = budgetLineById[purchaseBudgetlineId];

  if (!budgetLine) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_nao_encontrada',
      motivo: 'BudgetLine vinculada na compra não foi encontrada',
    };
  }

  const budgetMuseu = getBudgetLineCentroCusto(budgetLine);

  if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_incompativel_museu',
      motivo: `BudgetLine vinculada ao museu ${budgetMuseu}, mas a compra está em ${purchaseMuseu}`,
    };
  }

  if (!budgetLine?.rubrica_id) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_sem_rubrica_id',
      motivo: 'BudgetLine não possui rubrica_id vinculado',
    };
  }

  const rubrica = rubricas.find((r) => r.id === budgetLine.rubrica_id);

  if (!rubrica) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_nao_encontrada',
      motivo: 'rubrica_id da BudgetLine não foi encontrado',
    };
  }

  const rubricaMuseu = getRubricaCentroCusto(rubrica);

  if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_incompativel_museu',
      motivo: `Rubrica da BudgetLine vinculada ao museu ${rubricaMuseu}, mas a compra está em ${purchaseMuseu}`,
    };
  }

  return {
    rubricaId: rubrica.id,
    rubricaMuseu,
    purchaseMuseu,
    origem: 'budgetline_rubrica_id',
    motivo: null,
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

    if (normalizedAction === 'analyze_meta') {
      const { descricao_item, meta_id, categoria, tipo_gasto, valor_solicitado } = data;

      const metas = {
        'MC3A-20':
          'Realizar 30 ações educativas e/ou culturais: oficinas, palestras, mesas, filmes, apresentações relacionadas às vocações dos museus.',
        'MC3A-21':
          'Realizar 1 exposição e evento de abertura no MUMO: pesquisa, curadoria, projeto curatorial e expográfico, identidade visual, montagem, divulgação e evento inaugural.',
        'MC3A-22':
          'Consultorias transversais + formação em ambiente seguro e acessibilidade: 2 consultorias em temas transversais + 1 formação.',
        'MC3A-EXTRA':
          'Meta extra: compras que não se vinculam diretamente às metas 20–22.',
      };

      const prompt = `Você é um especialista em gestão de projetos culturais e contratos públicos (Termos de Colaboração).

Analise se a seguinte solicitação de compra/contratação corresponde à meta indicada.

SOLICITAÇÃO:
- Descrição: ${descricao_item || ''}
- Categoria: ${categoria || ''}
- Tipo: ${tipo_gasto || ''}
- Valor: R$ ${valor_solicitado || 0}

META INDICADA (${meta_id || 'não informada'}):
${metas[meta_id] || 'Meta extra sem descrição específica.'}

TODAS AS METAS DISPONÍVEIS:
${Object.entries(metas)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}

Retorne um JSON com:
- score: número de 0 a 100 indicando o grau de correspondência com a meta indicada
- meta_sugerida: código da meta mais adequada (pode ser a mesma se for correta)
- justificativa: texto curto (2-3 frases) explicando o score
- alerta: true se score < 80, false caso contrário`;

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            meta_sugerida: { type: 'string' },
            justificativa: { type: 'string' },
            alerta: { type: 'boolean' },
          },
        },
      });

      return Response.json({ success: true, analysis: result });
    }

    if (normalizedAction === 'check_budget') {
      const { budgetline_id, valor } = data;

      if (!budgetline_id) {
        return Response.json({ error: 'budgetline_id é obrigatório' }, { status: 400 });
      }

      const line = await base44.asServiceRole.entities.BudgetLine.get(budgetline_id);
      if (!line) {
        return Response.json({ error: 'BudgetLine não encontrada' }, { status: 404 });
      }

      let rubrica = null;
      if (line?.rubrica_id) {
        try {
          rubrica = await base44.asServiceRole.entities.Rubrica.get(line.rubrica_id);
        } catch {
          rubrica = null;
        }
      }

      const valorNumerico = toNumber(valor);
      const saldoBudgetLine =
        toNumber(line.saldo_inicial) - toNumber(line.saldo_comprometido);

      const saldoRubrica = rubrica ? toNumber(rubrica.saldo) : null;
      const saldoDisponivel =
        saldoRubrica !== null ? Math.min(saldoBudgetLine, saldoRubrica) : saldoBudgetLine;

      const aprovavel = saldoDisponivel >= valorNumerico;

      return Response.json({
        success: true,
        saldo_disponivel: saldoDisponivel,
        aprovavel,
        linha: line,
        rubrica: rubrica || null,
        criterio: rubrica ? 'min(budgetline, rubrica)' : 'budgetline',
      });
    }

    if (normalizedAction === 'aprovar') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json(
          { error: 'Apenas coordenadores podem aprovar compras' },
          { status: 403 }
        );
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'SOLICITADO') {
        return Response.json(
          {
            error: `Apenas solicitações pendentes podem ser aprovadas. Status atual: ${purchase.status}`,
          },
          { status: 400 }
        );
      }

      const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

      if (!purchaseBudgetlineId) {
        return Response.json(
          { error: 'A compra não possui linha orçamentária vinculada' },
          { status: 400 }
        );
      }

      const budgetLine = await base44.asServiceRole.entities.BudgetLine.get(
        purchaseBudgetlineId
      );
      if (!budgetLine) {
        return Response.json(
          { error: 'Linha orçamentária não encontrada' },
          { status: 404 }
        );
      }

      const allRubricas = await listAll(
        base44.asServiceRole.entities.Rubrica,
        'ordem_exibicao',
        500
      );

      const rubricasMap = new Map<string, any>();
      for (const r of allRubricas) {
        const key = r?.rubrica_key || buildRubricaKey(r);
        if (!rubricasMap.has(key)) {
          rubricasMap.set(key, r);
        }
      }
      const rubricasUnicas = Array.from(rubricasMap.values());

      const allBudgetLines = await listAll(
        base44.asServiceRole.entities.BudgetLine,
        'descricao',
        500
      );

      const budgetLineById: Record<string, any> = {};
      for (const bl of allBudgetLines) {
        if (bl?.id) budgetLineById[bl.id] = bl;
      }

      const resolvedRubrica = resolveRubricaFromPurchase(
        purchase,
        rubricasUnicas,
        budgetLineById
      );

      if (!resolvedRubrica.rubricaId) {
        return Response.json(
          {
            error: 'A compra não possui vínculo financeiro válido para aprovação.',
            motivo: resolvedRubrica.motivo,
            purchase_id: purchaseId,
            centro_custo: resolvedRubrica.purchaseMuseu || null,
            rubrica_id: purchase.rubrica_id || null,
            budgetline_id: purchaseBudgetlineId,
          },
          { status: 400 }
        );
      }

      const rubrica = rubricasUnicas.find((r) => r.id === resolvedRubrica.rubricaId) || null;
      if (!rubrica) {
        return Response.json(
          { error: 'Rubrica vinculada não encontrada' },
          { status: 404 }
        );
      }

      const valorFinal = getPurchaseValue(purchase);
      const saldoDisponivelBudgetLine =
        toNumber(budgetLine.saldo_inicial) - toNumber(budgetLine.saldo_comprometido);
      const saldoDisponivelRubrica = toNumber(rubrica.saldo);
      const saldoDisponivel = Math.min(saldoDisponivelBudgetLine, saldoDisponivelRubrica);

      if (saldoDisponivel < valorFinal) {
        return Response.json(
          {
            error:
              'Saldo insuficiente para aprovação. Disponível: R$ ' +
              saldoDisponivel.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              }),
            saldo_budgetline: saldoDisponivelBudgetLine,
            saldo_rubrica: saldoDisponivelRubrica,
            rubrica_id: rubrica.id,
          },
          { status: 400 }
        );
      }

      const novoStatus = 'APROVADO_COORD';
      const dataAprovacao = new Date().toISOString();

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        aprovado_por_email: user.email,
        aprovado_por_nome: user.full_name,
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: dataAprovacao,
        aprov_coord_comentario: data.comentario || '',
        data_aprovacao: dataAprovacao,
        rubrica_id: resolvedRubrica.rubricaId,
      });

      const novoComprometido =
        toNumber(budgetLine.saldo_comprometido) + valorFinal;

      await base44.asServiceRole.entities.BudgetLine.update(purchaseBudgetlineId, {
        saldo_comprometido: novoComprometido,
      });

      try {
        await base44.asServiceRole.functions.invoke('recalculateRubrica', {
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular rubrica após aprovação:', e?.message || e);
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
          trigger: 'purchase_approved',
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular todas as rubricas após aprovação:', e?.message || e);
      }

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({
          email: purchase.created_by,
        });

        if (solicitante && solicitante.length > 0) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: solicitante[0].email,
            subject: '✅ Sua solicitação de compra foi aprovada',
            body: `Olá ${solicitante[0].full_name},

Sua solicitação de compra foi aprovada pelo coordenador ${user.full_name}.

Item: ${purchase.descricao_item || ''}
Valor: R$ ${valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

Atenção: esta compra está pronta para pagamento.

Atenciosamente,
Plataforma — Museus Centro`,
            from_name: 'Museus Centro',
          });
        }
      } catch (e: any) {
        console.error('Erro ao enviar email de aprovação:', e?.message || e);
      }

      return Response.json({
        success: true,
        action: novoStatus,
        budgetline_id: purchaseBudgetlineId,
        rubrica_id: resolvedRubrica.rubricaId,
      });
    }

    if (normalizedAction === 'devolver_usuario') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json(
          { error: 'Apenas coordenadores podem devolver compras ao usuário' },
          { status: 403 }
        );
      }

      const comentario = String(data.comentario || '').trim();
      if (!comentario) {
        return Response.json(
          { error: 'Comentário é obrigatório para devolver ao usuário' },
          { status: 400 }
        );
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'SOLICITADO') {
        return Response.json(
          {
            error: `Apenas solicitações pendentes podem ser devolvidas. Status atual: ${purchase.status}`,
          },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RASCUNHO',
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
        aprov_coord_comentario: comentario,
      });

      try {
        await base44.asServiceRole.functions.invoke(
          'notifyUserOnPurchaseStatusChange',
          {
            purchaseId,
            newStatus: 'RASCUNHO',
            comentario,
          }
        );
      } catch (e: any) {
        console.error('Erro ao notificar devolução ao usuário:', e?.message || e);
      }

      return Response.json({
        success: true,
        action: 'RASCUNHO',
        devolvido_para_usuario: true,
      });
    }

    if (normalizedAction === 'reject') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json(
          { error: 'Apenas coordenadores podem recusar compras' },
          { status: 403 }
        );
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'SOLICITADO') {
        return Response.json(
          {
            error: `Apenas solicitações pendentes podem ser recusadas. Status atual: ${purchase.status}`,
          },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
        aprov_coord_comentario: data.comentario || 'Solicitação recusada',
      });

      try {
        await base44.asServiceRole.functions.invoke(
          'notifyUserOnPurchaseStatusChange',
          {
            purchaseId,
            newStatus: 'RECUSADO',
            comentario: data.comentario || '',
          }
        );
      } catch (e: any) {
        console.error('Erro ao notificar mudança de status:', e?.message || e);
      }

      return Response.json({ success: true, action: 'RECUSADO' });
    }

    if (normalizedAction === 'marcar_pago') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json(
          { error: 'Apenas coordenadores podem marcar compras como pagas' },
          { status: 403 }
        );
      }

      const { comprovante_url, data_pagamento } = data;

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (
        purchase.status !== 'APROVADO_COORD' &&
        purchase.status !== 'APROVADO_ADMIN'
      ) {
        return Response.json(
          {
            error: 'A compra precisa estar aprovada antes de ser marcada como paga.',
          },
          { status: 400 }
        );
      }

      const allRubricas = await listAll(
        base44.asServiceRole.entities.Rubrica,
        'ordem_exibicao',
        500
      );

      const rubricasMap = new Map<string, any>();
      for (const r of allRubricas) {
        const key = r?.rubrica_key || buildRubricaKey(r);
        if (!rubricasMap.has(key)) {
          rubricasMap.set(key, r);
        }
      }
      const rubricasUnicas = Array.from(rubricasMap.values());

      const allBudgetLines = await listAll(
        base44.asServiceRole.entities.BudgetLine,
        'descricao',
        500
      );

      const budgetLineById: Record<string, any> = {};
      for (const bl of allBudgetLines) {
        if (bl?.id) budgetLineById[bl.id] = bl;
      }

      const resolvedRubrica = resolveRubricaFromPurchase(
        purchase,
        rubricasUnicas,
        budgetLineById
      );

      if (!resolvedRubrica.rubricaId) {
        return Response.json(
          {
            error: 'Não é permitido marcar a compra como PAGA sem rubrica vinculada.',
            motivo: resolvedRubrica.motivo,
            purchase_id: purchaseId,
            centro_custo: resolvedRubrica.purchaseMuseu || null,
            rubrica_id: purchase.rubrica_id || null,
            budgetline_id: getPurchaseBudgetlineId(purchase),
          },
          { status: 400 }
        );
      }

      const docs = await base44.asServiceRole.entities.PurchaseDocument.filter({
        purchase_id: purchaseId,
      });

      const docsFiscaisAprovados = (docs || []).filter((d) => {
        const tipo = getDocTipo(d);
        const status = getDocStatus(d);
        const tipoValido = tipo === 'nota_fiscal' || tipo === 'xml_nf';
        const statusValido = status === 'aprovado' || status === 'approved';
        return tipoValido && statusValido;
      });

      const isTeamPayment =
        purchase?.origem === 'TEAM_PAYMENT' || !!purchase?.team_payment_id;

      if (!isTeamPayment && docsFiscaisAprovados.length === 0) {
        return Response.json(
          {
            error: 'É necessário ter uma Nota Fiscal ou XML aprovados antes do pagamento.',
          },
          { status: 400 }
        );
      }

      let linkedTeamPayment: any = null;

      if (purchase?.team_payment_id) {
        try {
          linkedTeamPayment = await base44.asServiceRole.entities.TeamPayment.get(
            purchase.team_payment_id
          );
        } catch {
          linkedTeamPayment = null;
        }
      }

      if (!linkedTeamPayment && isTeamPayment) {
        try {
          const teamPayments = await base44.asServiceRole.entities.TeamPayment.filter({
            purchase_id: purchaseId,
          });
          linkedTeamPayment = teamPayments?.[0] || null;
        } catch {
          linkedTeamPayment = null;
        }
      }

      if (isTeamPayment && linkedTeamPayment?.nf_valida === false) {
        return Response.json(
          {
            error: 'Não é permitido pagar equipe com NF inválida.',
          },
          { status: 400 }
        );
      }

      const paymentDate =
        data_pagamento && String(data_pagamento).trim()
          ? String(data_pagamento).trim()
          : new Date().toISOString().split('T')[0];

      const valorPago =
        getPurchaseValue(purchase) ||
        toNumber(linkedTeamPayment?.valor_nf) ||
        toNumber(linkedTeamPayment?.valor_parcela_previsto);

      const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        data_pagamento: paymentDate,
        comprovante_url: comprovante_url || '',
        pago_por: user.email,
        valor_pago: valorPago,
        rubrica_id: resolvedRubrica.rubricaId,
      });

      const syncResults: any[] = [];
      const syncErrors: any[] = [];

      for (const doc of docsFiscaisAprovados) {
        try {
          const syncResult = await base44.asServiceRole.functions.invoke(
            'syncDocumentToRubrica',
            {
              documentId: doc.id,
              purchaseId,
            }
          );

          syncResults.push({
            document_id: doc.id,
            result: syncResult,
          });
        } catch (e: any) {
          console.error(
            'Erro ao sincronizar documento ' + doc.id + ' com a rubrica:',
            e?.message || e
          );
          syncErrors.push({
            document_id: doc.id,
            error: e?.message || String(e),
          });
        }
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateRubrica', {
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular rubrica:', e?.message || e);
        syncErrors.push({
          etapa: 'recalculateRubrica',
          error: e?.message || String(e),
        });
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
          trigger: 'purchase_paid',
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular todas as rubricas:', e?.message || e);
        syncErrors.push({
          etapa: 'recalculateAllRubricas',
          error: e?.message || String(e),
        });
      }

      if (linkedTeamPayment) {
        try {
          await base44.asServiceRole.entities.TeamPayment.update(linkedTeamPayment.id, {
            status: 'PAGO',
            data_pagamento: paymentDate,
            valor_pago: valorPago,
            rubrica_id: resolvedRubrica.rubricaId,
            budgetline_id: purchaseBudgetlineId,
            budget_line_id: purchaseBudgetlineId,
          });

          if (linkedTeamPayment?.team_member_id) {
            const member = await base44.asServiceRole.entities.TeamMember.get(
              linkedTeamPayment.team_member_id
            );

            if (member) {
              const parcelasPagasAtuais = toNumber(member?.parcelas_pagas);
              const numeroParcelaAtual = toNumber(linkedTeamPayment?.numero_parcela);

              const novoTotalParcelasPagas = Math.max(
                parcelasPagasAtuais,
                numeroParcelaAtual || parcelasPagasAtuais + 1
              );

              await base44.asServiceRole.entities.TeamMember.update(member.id, {
                parcelas_pagas: novoTotalParcelasPagas,
              });
            }
          }
        } catch (e: any) {
          console.error('Erro integração equipe:', e?.message || e);
          syncErrors.push({
            etapa: 'integracao_equipe',
            error: e?.message || String(e),
          });
        }
      }

      let solicitanteEmail = purchase.created_by || '';
      let solicitanteNome = 'Solicitante';

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({
          email: purchase.created_by,
        });

        if (solicitante && solicitante.length > 0) {
          solicitanteEmail = solicitante[0].email || solicitanteEmail;
          solicitanteNome = solicitante[0].full_name || solicitanteNome;
        }
      } catch (e: any) {
        console.error('Erro ao buscar solicitante:', e?.message || e);
      }

      const valorFmt = valorPago.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      });

      if (solicitanteEmail) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: solicitanteEmail,
            subject: 'Sua compra foi marcada como paga',
            body: `Olá ${solicitanteNome},

Sua compra foi marcada como paga.

Item: ${purchase.descricao_item || ''}
Valor: R$ ${valorFmt}
Data do pagamento: ${paymentDate}
${comprovante_url ? `Comprovante: ${comprovante_url}` : ''}

Atenciosamente,
Plataforma — Museus Centro`,
            from_name: 'Museus Centro',
          });
        } catch (e: any) {
          console.error('Erro ao enviar email ao solicitante:', e?.message || e);
        }
      }

      try {
        const allPerms = await base44.asServiceRole.entities.UserPermission.list(
          '',
          9999
        );

        const coordinatorEmails = [
          ...new Set(
            (allPerms || [])
              .filter(
                (p) =>
                  p &&
                  p.user_email &&
                  (p.can_review_reports === true ||
                    p.pode_aprovar_solicitacoes === true ||
                    p.gestao_compras === true)
              )
              .map((p) => p.user_email)
          ),
        ];

        for (const email of coordinatorEmails) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: email,
              subject: 'Compra marcada como paga',
              body: `Olá,

Uma compra foi marcada como paga na plataforma.

Item: ${purchase.descricao_item || ''}
Solicitante: ${solicitanteNome}
E-mail do solicitante: ${solicitanteEmail || 'Não informado'}
Valor: R$ ${valorFmt}
Data do pagamento: ${paymentDate}
${comprovante_url ? `Comprovante: ${comprovante_url}` : ''}

Atenciosamente,
Plataforma — Museus Centro`,
              from_name: 'Museus Centro',
            });
          } catch (e: any) {
            console.error(
              'Erro ao enviar email ao coordenador ' + email + ':',
              e?.message || e
            );
          }
        }
      } catch (e: any) {
        console.error('Erro ao buscar coordenadores:', e?.message || e);
      }

      return Response.json({
        success: true,
        action: 'PAGO',
        purchaseId,
        data_pagamento: paymentDate,
        comprovante_url: comprovante_url || '',
        valor_pago: valorPago,
        rubrica_id: resolvedRubrica.rubricaId,
        budgetline_id: purchaseBudgetlineId,
        docs_fiscais_aprovados: docsFiscaisAprovados.map((d) => d.id),
        sync_results: syncResults,
        sync_errors: syncErrors,
        team_payment_id: linkedTeamPayment?.id || null,
      });
    }

    if (normalizedAction === 'submeter') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'RASCUNHO' && purchase.status !== 'RECUSADO') {
        return Response.json(
          {
            error: `Somente compras em rascunho ou recusadas podem ser submetidas. Status atual: ${purchase.status}`,
          },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'SOLICITADO',
      });

      try {
        await base44.asServiceRole.functions.invoke(
          'notifyCoordinatorPurchaseSubmitted',
          {
            purchaseId,
          }
        );
      } catch (e: any) {
        console.error('Erro ao notificar coordenador:', e?.message || e);
      }

      return Response.json({ success: true, action: 'SOLICITADO' });
    }

    if (normalizedAction === 'ensure_report') {
      const { mes_referencia, ano } = data;

      const existing = await base44.asServiceRole.entities.Report.filter({
        created_by: user.email,
        mes_referencia,
        ano,
      });

      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          report_id: existing[0].id,
          created: false,
        });
      }

      const newReport = await base44.asServiceRole.entities.Report.create({
        author_name: user.full_name,
        museu: user.museu || '',
        equipe: user.equipe || '',
        funcao: user.funcao || '',
        mes_referencia,
        ano,
        status: 'DRAFT',
      });

      return Response.json({
        success: true,
        report_id: newReport.id,
        created: true,
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('purchaseActions error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
