// purchaseActions — Gestão de compras do 3º Termo Aditivo
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { action, purchaseId, ...data } = payload;

    // --- AÇÃO: Analisar correspondência com meta via IA ---
    if (action === 'analyze_meta') {
      const { descricao_item, meta_id, categoria, tipo_gasto, valor_solicitado } = data;

      const metas = {
        'MC3A-20': 'Realizar 30 ações educativas e/ou culturais: oficinas, palestras, mesas, filmes, apresentações relacionadas às vocações dos museus.',
        'MC3A-21': 'Realizar 1 exposição e evento de abertura no MUMO: pesquisa, curadoria, projeto curatorial e expográfico, identidade visual, montagem, divulgação e evento inaugural.',
        'MC3A-22': 'Consultorias transversais + formação em ambiente seguro e acessibilidade: 2 consultorias em temas transversais + 1 formação.',
        'MC3A-EXTRA': 'Meta extra: compras que não se vinculam diretamente às metas 20–22.'
      };

      const prompt = `Você é um especialista em gestão de projetos culturais e contratos públicos (Termos de Colaboração).

Analise se a seguinte solicitação de compra/contratação corresponde à meta indicada.

SOLICITAÇÃO:
- Descrição: ${descricao_item}
- Categoria: ${categoria}
- Tipo: ${tipo_gasto}
- Valor: R$ ${valor_solicitado}

META INDICADA (${meta_id}):
${metas[meta_id] || 'Meta extra sem descrição específica.'}

TODAS AS METAS DISPONÍVEIS:
${Object.entries(metas).map(([k, v]) => `${k}: ${v}`).join('\n')}

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
    if (action === 'check_budget') {
      const { budgetline_id, valor } = data;

      if (!budgetline_id) {
        return Response.json({ error: 'budgetline_id é obrigatório' }, { status: 400 });
      }

      const line = await base44.asServiceRole.entities.BudgetLine.get(budgetline_id);
      if (!line) {
        return Response.json({ error: 'Rubrica não encontrada' }, { status: 404 });
      }

      const saldo_disponivel = (line.saldo_inicial || 0) - (line.saldo_comprometido || 0);
      const aprovavel = saldo_disponivel >= (valor || 0);

      return Response.json({ success: true, saldo_disponivel, aprovavel, linha: line });
    }

    // --- AÇÃO: Aprovar compra ---
    if (action === 'aprovar' || action === 'approve_coord') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      const userPerms = await base44.asServiceRole.entities.UserPermission.filter({
        user_email: user.email
      });

      const isCoordinator =
        user.role === 'admin' ||
        user.role === 'ADMIN' ||
        user.role === 'COORDENADOR' ||
        user.role === 'COORD_COMUNICACAO' ||
        user.role === 'COORD_ADMINISTRATIVA' ||
        user.role === 'COORD_PRODUCAO' ||
        (userPerms.length > 0 &&
          (
            userPerms[0].can_review_reports === true ||
            userPerms[0].pode_aprovar_solicitacoes === true ||
            userPerms[0].gestao_compras === true
          ));

      if (!isCoordinator) {
        return Response.json({ error: 'Apenas coordenadores podem aprovar compras' }, { status: 403 });
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'SOLICITADO') {
        return Response.json(
          { error: `Apenas solicitações pendentes podem ser aprovadas. Status atual: ${purchase.status}` },
          { status: 400 }
        );
      }

      if (!purchase.budgetline_id) {
        return Response.json(
          { error: 'A compra não possui linha orçamentária vinculada' },
          { status: 400 }
        );
      }

      const budgetLine = await base44.asServiceRole.entities.BudgetLine.get(purchase.budgetline_id);
      if (!budgetLine) {
        return Response.json({ error: 'Linha orçamentária não encontrada' }, { status: 404 });
      }

      const valorFinal = Number(purchase.valor_aprovado_admin || purchase.valor_solicitado || 0);
      const saldoDisponivel = (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0);

      if (saldoDisponivel < valorFinal) {
        return Response.json(
          {
            error: `Saldo insuficiente para aprovação. Disponível: R$ ${saldoDisponivel.toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}`
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

      const novoComprometido = (budgetLine.saldo_comprometido || 0) + valorFinal;

      await base44.asServiceRole.entities.BudgetLine.update(purchase.budgetline_id, {
        saldo_comprometido: novoComprometido,
      });

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({ email: purchase.created_by });
        if (solicitante.length > 0) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: solicitante[0].email,
            subject: `✅ Sua solicitação de compra foi aprovada`,
            body: `Olá ${solicitante[0].full_name},

Sua solicitação de compra foi aprovada pelo coordenador ${user.full_name}.

📋 Item: ${purchase.descricao_item}
💰 Valor: R$ ${valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

Atenção: esta compra está pronta para pagamento.

Atenciosamente,
Plataforma — Museus Centro`,
            from_name: 'Museus Centro'
          });
        }
      } catch (e) {
        console.error('Erro ao enviar email de aprovação:', e.message);
      }

      return Response.json({ success: true, action: novoStatus });
    }

    // --- AÇÃO: Recusar compra ---
    if (action === 'reject') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
        aprov_coord_comentario: data.comentario || 'Solicitação recusada'
      });

      try {
        await base44.asServiceRole.functions.invoke('notifyUserOnPurchaseStatusChange', {
          purchaseId,
          newStatus: 'RECUSADO',
          comentario: data.comentario || ''
        });
      } catch (e) {
        console.error('Erro ao notificar mudança de status:', e.message);
      }

      return Response.json({ success: true, action: 'RECUSADO' });
    }

    // --- AÇÃO: Marcar como PAGO ---
    if (action === 'marcar_pago') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      const { comprovante_url, data_pagamento } = data;

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'APROVADO_COORD' && purchase.status !== 'APROVADO_ADMIN') {
        return Response.json(
          { error: 'A compra precisa estar aprovada antes de ser marcada como paga.' },
          { status: 400 }
        );
      }

      const docs = await base44.asServiceRole.entities.PurchaseDocument.filter({
        purchase_id: purchaseId
      });

      const temDocumentoFiscalAprovado = docs.some(
        d =>
          (d.tipo_documento === 'nota_fiscal' || d.tipo_documento === 'xml_nf') &&
          d.status === 'aprovado'
      );

      if (!temDocumentoFiscalAprovado) {
        return Response.json(
          { error: 'É necessário ter uma Nota Fiscal ou XML aprovados antes do pagamento.' },
          { status: 400 }
        );
      }

      const paymentDate =
        data_pagamento && String(data_pagamento).trim()
          ? data_pagamento
          : new Date().toISOString().split('T')[0];

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        data_pagamento: paymentDate,
        comprovante_url: comprovante_url || '',
        pago_por: user.email,
      });

      // Buscar solicitante
      let solicitanteEmail = purchase.created_by || '';
      let solicitanteNome = 'Solicitante';

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({
          email: purchase.created_by
        });
        if (solicitante.length > 0) {
          solicitanteEmail = solicitante[0].email || solicitanteEmail;
          solicitanteNome = solicitante[0].full_name || solicitanteNome;
        }
      } catch (e) {
        console.error('Erro ao buscar solicitante:', e.message);
      }

      const valorFmt = Number(
        purchase.valor_aprovado_admin || purchase.valor_solicitado || 0
      ).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      // Email para solicitante
      if (solicitanteEmail) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: solicitanteEmail,
            subject: `💸 Sua compra foi marcada como paga`,
            body: `Olá ${solicitanteNome},

Sua compra foi marcada como paga.

📋 Item: ${purchase.descricao_item}
💰 Valor: R$ ${valorFmt}
📅 Data do pagamento: ${paymentDate}
${comprovante_url ? `🔗 Comprovante: ${comprovante_url}` : ''}

Atenciosamente,
Plataforma — Museus Centro`,
            from_name: 'Museus Centro'
          });
        } catch (e) {
          console.error('Erro ao enviar email ao solicitante:', e.message);
        }
      }

      // Buscar coordenadores
      try {
        const userPerms = await base44.asServiceRole.entities.UserPermission.list('', 9999);

        const coordinatorEmails = [
          ...new Set(
            userPerms
              .filter(p =>
                p?.user_email &&
                (
                  p?.can_review_reports === true ||
                  p?.pode_aprovar_solicitacoes === true ||
                  p?.gestao_compras === true
                )
              )
              .map(p => p.user_email)
          )
        ];

        for (const email of coordinatorEmails) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: email,
              subject: `💸 Compra marcada como paga`,
              body: `Olá,

Uma compra foi marcada como paga na plataforma.

📋 Item: ${purchase.descricao_item}
👤 Solicitante: ${solicitanteNome}
📧 E-mail do solicitante: ${solicitanteEmail || 'Não informado'}
💰 Valor: R$ ${valorFmt}
📅 Data do pagamento: ${paymentDate}
${comprovante_url ? `🔗 Comprovante: ${comprovante_url}` : ''}

Atenciosamente,
Plataforma — Museus Centro`,
              from_name: 'Museus Centro'
            });
          } catch (e) {
            console.error(`Erro ao enviar email ao coordenador ${email}:`, e.message);
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
      });
    }

    // --- AÇÃO: Submeter solicitação (RASCUNHO → SOLICITADO) ---
    if (action === 'submeter') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'SOLICITADO'
      });

      try {
        await base44.asServiceRole.functions.invoke('notifyCoordinatorPurchaseSubmitted', {
          purchaseId
        });
      } catch (e) {
        console.error('Erro ao notificar coordenador:', e.message);
      }

      return Response.json({ success: true, action: 'SOLICITADO' });
    }

    // --- AÇÃO: Garantir relatório mensal ---
    if (action === 'ensure_report') {
      const { mes_referencia, ano } = data;

      const existing = await base44.asServiceRole.entities.Report.filter({
        created_by: user.email,
        mes_referencia,
        ano
      });

      if (existing.length > 0) {
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