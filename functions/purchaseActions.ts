// purchaseActions — Gestão de compras do 3º Termo Aditivo
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
      const line = await base44.asServiceRole.entities.BudgetLine.get(budgetline_id);
      if (!line) return Response.json({ error: 'Rubrica não encontrada' }, { status: 404 });

      const saldo_disponivel = (line.saldo_inicial || 0) - (line.saldo_comprometido || 0);
      const aprovavel = saldo_disponivel >= (valor || 0);

      return Response.json({ success: true, saldo_disponivel, aprovavel, linha: line });
    }

    // --- AÇÃO: Aprovação do coordenador geral ---
    if (action === 'approve_coord') {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      if (purchase.status !== 'SOLICITADO') return Response.json({ error: 'Status inválido para esta ação' }, { status: 400 });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
        aprov_coord_nome: user.full_name,
        aprov_coord_data: new Date().toISOString().split('T')[0],
        aprov_coord_comentario: data.comentario || ''
      });

      // Notificar coordenadores admin
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      await Promise.all(admins.map(admin =>
        base44.asServiceRole.integrations.Core.SendEmail({
          to: admin.email,
          subject: `💼 Compra aprovada pela coord. — aguarda aprovação administrativa`,
          body: `Olá ${admin.full_name},\n\nUma solicitação de compra foi aprovada pelo coordenador geral e aguarda sua aprovação administrativa.\n\n📋 Item: ${purchase.descricao_item}\n💰 Valor solicitado: R$ ${purchase.valor_solicitado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n🏷️ Categoria: ${purchase.categoria}\n🎯 Meta: ${purchase.meta_id}\n\nAcesse a plataforma para revisar e aprovar.\n\nAtenciosamente,\nPlataforma — Museus Centro`,
          from_name: 'Museus Centro'
        })
      ));

      return Response.json({ success: true, action: 'APROVADO_COORD' });
    }

    // --- AÇÃO: Aprovação administrativa (com verificação de saldo) ---
    if (action === 'approve_admin') {
      const { valor_aprovado, comentario } = data;
      if (!valor_aprovado) return Response.json({ error: 'valor_aprovado obrigatório' }, { status: 400 });

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      if (purchase.status !== 'APROVADO_COORD') return Response.json({ error: 'Status inválido para esta ação' }, { status: 400 });

      // Verificar saldo
      const line = await base44.asServiceRole.entities.BudgetLine.get(purchase.budgetline_id);
      const saldo_disponivel = (line.saldo_inicial || 0) - (line.saldo_comprometido || 0);
      if (saldo_disponivel < valor_aprovado) {
        return Response.json({
          error: `Saldo insuficiente. Disponível: R$ ${saldo_disponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Solicitado: R$ ${valor_aprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          saldo_insuficiente: true,
          saldo_disponivel
        }, { status: 422 });
      }

      // Atualizar solicitação
      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_ADMIN',
        aprov_admin_nome: user.full_name,
        aprov_admin_data: new Date().toISOString().split('T')[0],
        aprov_admin_comentario: comentario || '',
        valor_aprovado_admin: valor_aprovado
      });

      // Comprometer saldo na rubrica
      await base44.asServiceRole.entities.BudgetLine.update(purchase.budgetline_id, {
        saldo_comprometido: (line.saldo_comprometido || 0) + valor_aprovado
      });

      // Notificar solicitante
      const solicitanteEmail = purchase.created_by;
      if (solicitanteEmail) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: solicitanteEmail,
          subject: `✅ Sua solicitação de compra foi aprovada!`,
          body: `Olá,\n\nSua solicitação de compra foi aprovada administrativamente.\n\n📋 Item: ${purchase.descricao_item}\n💰 Valor aprovado: R$ ${valor_aprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\nO pagamento será processado em breve.\n\nAtenciosamente,\nPlataforma — Museus Centro`,
          from_name: 'Museus Centro'
        });
      }

      return Response.json({ success: true, action: 'APROVADO_ADMIN', valor_aprovado, saldo_disponivel });
    }

    // --- AÇÃO: Recusar ---
    if (action === 'recusar') {
      const { motivo } = data;
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

      const stage = purchase.status === 'SOLICITADO' ? 'coord' : 'admin';
      const updateData = { status: 'RECUSADO' };
      if (stage === 'coord') {
        updateData.aprov_coord_nome = user.full_name;
        updateData.aprov_coord_comentario = motivo || '';
      } else {
        updateData.aprov_admin_nome = user.full_name;
        updateData.aprov_admin_comentario = motivo || '';
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, updateData);

      // Notificar solicitante
      if (purchase.created_by) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: purchase.created_by,
          subject: `❌ Sua solicitação de compra foi recusada`,
          body: `Olá,\n\nInfelizmente sua solicitação de compra foi recusada.\n\n📋 Item: ${purchase.descricao_item}\n💰 Valor: R$ ${purchase.valor_solicitado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n📝 Motivo: ${motivo || 'Sem comentário adicional'}\n\nVocê pode criar uma nova solicitação com ajustes.\n\nAtenciosamente,\nPlataforma — Museus Centro`,
          from_name: 'Museus Centro'
        });
      }

      return Response.json({ success: true, action: 'RECUSADO' });
    }

    // --- AÇÃO: Marcar como PAGO ---
    if (action === 'marcar_pago') {
      const { comprovante_url, data_pagamento } = data;
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      if (purchase.status !== 'APROVADO_ADMIN') return Response.json({ error: 'Aprovação administrativa necessária antes de marcar como pago' }, { status: 400 });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        data_pagamento: data_pagamento || new Date().toISOString().split('T')[0],
        comprovante_url: comprovante_url || ''
      });

      return Response.json({ success: true, action: 'PAGO' });
    }

    // --- AÇÃO: Submeter solicitação (RASCUNHO → SOLICITADO) ---
    if (action === 'submeter') {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, { status: 'SOLICITADO' });

      // Notificar coordenadores
      const coords = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      await Promise.all(coords.map(coord =>
        base44.asServiceRole.integrations.Core.SendEmail({
          to: coord.email,
          subject: `📥 Nova solicitação de compra para aprovação`,
          body: `Olá ${coord.full_name},\n\nUma nova solicitação de compra foi enviada e aguarda sua aprovação.\n\n📋 Item: ${purchase.descricao_item}\n💰 Valor: R$ ${purchase.valor_solicitado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n🏷️ Categoria: ${purchase.categoria}\n🎯 Meta: ${purchase.meta_id}\n👤 Solicitante: ${user.full_name}\n\nAcesse a plataforma para revisar.\n\nAtenciosamente,\nPlataforma — Museus Centro`,
          from_name: 'Museus Centro'
        })
      ));

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
        return Response.json({ success: true, report_id: existing[0].id, created: false });
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

      return Response.json({ success: true, report_id: newReport.id, created: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('purchaseActions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});