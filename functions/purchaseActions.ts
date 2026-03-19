import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(purchase) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getDocTipo(doc) {
  return String(doc?.tipo_documento || doc?.tipo || '').trim().toLowerCase();
}

function getDocStatus(doc) {
  return String(doc?.status || '').trim().toLowerCase();
}

function getPurchaseBudgetlineId(purchase) {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
  );
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
      user_email: user.email
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

    // --- AÇÃO: Analisar correspondência com meta via IA ---
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
          'Meta extra: compras que não se vinculam diretamente às metas 20–22.'
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
            alerta: { type: 'boolean' }
          }
        }
      });

      return Response.json({ success: true, analysis: result });
    }

    // --- AÇÃO: Verificar saldo da rubrica ---
    if (normalizedAction === 'check_budget') {
      const { budgetline_id, valor } = data;

      if (!budgetline_id) {
        return Response.json({ error: 'budgetline_id é obrigatório' }, { status: 400 });
      }

      const line = await base44.asServiceRole.entities.BudgetLine.get(budgetline_id);
      if (!line) {
        return Response.json({ error: 'Rubrica não encontrada' }, { status: 404 });
      }

      const valorNumerico = toNumber(valor);
      const saldo_disponivel =
        toNumber(line.saldo_inicial) - toNumber(line.saldo_comprometido);
      const aprovavel = saldo_disponivel >= valorNumerico;

      return Response.json({
        success: true,
        saldo_disponivel,
        aprovavel,
        linha: line
      });
    }

    // --- AÇÃO: Aprovar compra ---
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
            error: `Apenas solicitações pendentes podem ser aprovadas. Status atual: ${purchase.status}`
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

      const valorFinal = getPurchaseValue(purchase);
      const saldoDisponivel =
        toNumber(budgetLine.saldo_inicial) - toNumber(budgetLine.saldo_comprometido);

      if (saldoDisponivel < valorFinal) {
        return Response.json(
          {
            error:
              'Saldo insuficiente para aprovação. Disponível: R$ ' +
              saldoDisponivel.toLocaleString('pt-BR', {
                minimumFractionDigits: 2
              })
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
        data_aprovacao: dataAprovacao
      });

      const novoComprometido =
        toNumber(budgetLine.saldo_comprometido) + valorFinal;

      await base44.asServiceRole.entities.BudgetLine.update(purchaseBudgetlineId, {
        saldo_comprometido: novoComprometido
      });

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({
          email: purchase.created_by
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
            from_name: 'Museus Centro'
          });
        }
      } catch (e) {
        console.error('Erro ao enviar email de aprovação:', e.message);
      }

      return Response.json({
        success: true,
        action: novoStatus,
        budgetline_id: purchaseBudgetlineId
      });
    }

    // --- AÇÃO: Recusar compra ---
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
            error: `Apenas solicitações pendentes podem ser recusadas. Status atual: ${purchase.status}`
          },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
        aprov_coord_comentario: data.comentario || 'Solicitação recusada'
      });

      try {
        await base44.asServiceRole.functions.invoke(
          'notifyUserOnPurchaseStatusChange',
          {
            purchaseId,
            newStatus: 'RECUSADO',
            comentario: data.comentario || ''
          }
        );
      } catch (e) {
        console.error('Erro ao notificar mudança de status:', e.message);
      }

      return Response.json({ success: true, action: 'RECUSADO' });
    }

    // --- AÇÃO: Marcar como PAGO ---
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
            error: 'A compra precisa estar aprovada antes de ser marcada como paga.'
          },
          { status: 400 }
        );
      }

      const docs = await base44.asServiceRole.entities.PurchaseDocument.filter({
        purchase_id: purchaseId
      });

      const docsFiscaisAprovados = (docs || []).filter((d) => {
        const tipo = getDocTipo(d);
        const status = getDocStatus(d);
        const tipoValido = tipo === 'nota_fiscal' || tipo === 'xml_nf';
        const statusValido = status === 'aprovado' || status === 'approved';
        return tipoValido && statusValido;
      });

      if (docsFiscaisAprovados.length === 0) {
        return Response.json(
          {
            error: 'É necessário ter uma Nota Fiscal ou XML aprovados antes do pagamento.'
          },
          { status: 400 }
        );
      }

      const paymentDate =
        data_pagamento && String(data_pagamento).trim()
          ? String(data_pagamento).trim()
          : new Date().toISOString().split('T')[0];

      const valorPago = getPurchaseValue(purchase);
      const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        data_pagamento: paymentDate,
        comprovante_url: comprovante_url || '',
        pago_por: user.email,
        valor_pago: valorPago
      });

      const syncResults = [];
      const syncErrors = [];

      for (const doc of docsFiscaisAprovados) {
        try {
          const syncResult = await base44.asServiceRole.functions.invoke(
            'syncDocumentToRubrica',
            {
              documentId: doc.id,
              purchaseId
            }
          );

          syncResults.push({
            document_id: doc.id,
            result: syncResult
          });
        } catch (e) {
          console.error(
            'Erro ao sincronizar documento ' + doc.id + ' com a rubrica:',
            e.message
          );
          syncErrors.push({
            document_id: doc.id,
            error: e.message
          });
        }
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateRubrica', {
          purchaseId,
          budgetline_id: purchaseBudgetlineId
        });
      } catch (e) {
        console.error('Erro ao recalcular rubrica:', e.message);
        syncErrors.push({
          etapa: 'recalculateRubrica',
          error: e.message
        });
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
          trigger: 'purchase_paid',
          purchaseId,
          budgetline_id: purchaseBudgetlineId
        });
      } catch (e) {
        console.error('Erro ao recalcular todas as rubricas:', e.message);
        syncErrors.push({
          etapa: 'recalculateAllRubricas',
          error: e.message
        });
      }

      let solicitanteEmail = purchase.created_by || '';
      let solicitanteNome = 'Solicitante';

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({
          email: purchase.created_by
        });

        if (solicitante && solicitante.length > 0) {
          solicitanteEmail = solicitante[0].email || solicitanteEmail;
          solicitanteNome = solicitante[0].full_name || solicitanteNome;
        }
      } catch (e) {
        console.error('Erro ao buscar solicitante:', e.message);
      }

      const valorFmt = valorPago.toLocaleString('pt-BR', {
        minimumFractionDigits: 2
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
            from_name: 'Museus Centro'
          });
        } catch (e) {
          console.error('Erro ao enviar email ao solicitante:', e.message);
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
          )
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
              from_name: 'Museus Centro'
            });
          } catch (e) {
            console.error(
              'Erro ao enviar email ao coordenador ' + email + ':',
              e.message
            );
          }
        }
      } catch (e) {
        console.error('Erro ao buscar coordenadores:', e.message);
      }

      return Response.json({
        success: true,
        action: 'PAGO',
        purchaseId,
        data_pagamento: paymentDate,
        comprovante_url: comprovante_url || '',
        valor_pago: valorPago,
        budgetline_id: purchaseBudgetlineId,
        docs_fiscais_aprovados: docsFiscaisAprovados.map((d) => d.id),
        sync_results: syncResults,
        sync_errors: syncErrors
      });
    }

    // --- AÇÃO: Submeter solicitação (RASCUNHO / RECUSADO → SOLICITADO) ---
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
            error: `Somente compras em rascunho ou recusadas podem ser submetidas. Status atual: ${purchase.status}`
          },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'SOLICITADO'
      });

      try {
        await base44.asServiceRole.functions.invoke(
          'notifyCoordinatorPurchaseSubmitted',
          {
            purchaseId
          }
        );
      } catch (e) {
        console.error('Erro ao notificar coordenador:', e.message);
      }

      return Response.json({ success: true, action: 'SOLICITADO' });
    }

    // --- AÇÃO: Garantir relatório mensal ---
    if (normalizedAction === 'ensure_report') {
      const { mes_referencia, ano } = data;

      const existing = await base44.asServiceRole.entities.Report.filter({
        created_by: user.email,
        mes_referencia,
        ano
      });

      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          report_id: existing[0].id,
          created: false
        });
      }

      const newReport = await base44.asServiceRole.entities.Report.create({
        author_name: user.full_name,
        museu: user.museu || '',
        equipe: user.equipe || '',
        funcao: user.funcao || '',
        mes_referencia,
        ano,
        status: 'DRAFT'
      });

      return Response.json({
        success: true,
        report_id: newReport.id,
        created: true
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('purchaseActions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});