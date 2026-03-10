import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * createProductLinkedToActivity
 * Cria um produto na entidade Product, herdando automaticamente
 * o report_id e user_email da atividade pai.
 * Payload: { activity_id, nome, tipo, descricao, quantidade, link_arquivo }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { activity_id, nome, tipo, descricao, quantidade, link_arquivo } = await req.json();

    if (!activity_id) {
      return Response.json({ error: 'Parâmetro obrigatório: activity_id' }, { status: 400 });
    }
    if (!nome || !tipo) {
      return Response.json({ error: 'Parâmetros obrigatórios: nome, tipo' }, { status: 400 });
    }

    // Buscar atividade para herdar report_id
    const atividade = await base44.asServiceRole.entities.Activity.get(activity_id);
    if (!atividade) {
      return Response.json({ error: 'Atividade não encontrada' }, { status: 404 });
    }

    if (!atividade.report_id) {
      return Response.json({ error: 'Atividade não possui report_id vinculado' }, { status: 400 });
    }

    // Criar produto vinculado
    const produto = await base44.asServiceRole.entities.Product.create({
      activity_id,
      report_id: atividade.report_id,
      user_email: user.email,
      nome,
      tipo,
      descricao: descricao || '',
      quantidade: quantidade || 1,
      link_arquivo: link_arquivo || '',
    });

    return Response.json({ produto, activity_id, report_id: atividade.report_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});