import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * createProductLinkedToActivity
 * Cria um produto vinculado a uma atividade e automaticamente ao seu relatório.
 * Payload: { activity_id, nome, tipo, descricao, data_inicio?, data_fim?, meta_id?, rubrica_id?, usuario_responsavel_id? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const productData = await req.json();
    const { activity_id, nome, tipo, descricao } = productData;

    if (!activity_id || !nome || !tipo) {
      return Response.json({ error: 'Parâmetros obrigatórios: activity_id, nome, tipo' }, { status: 400 });
    }

    // Buscar atividade para obter report_id
    const activities = await base44.entities.Activity.filter({ id: activity_id });
    if (!activities || activities.length === 0) {
      return Response.json({ error: 'Atividade não encontrada' }, { status: 404 });
    }

    const activity = activities[0];

    // Criar produto vinculado à atividade e ao relatório
    const newProduct = await base44.entities.Product.create({
      activity_id: activity.id,
      report_id: activity.report_id,
      nome,
      tipo,
      descricao: descricao || '',
      data_inicio: productData.data_inicio || null,
      data_fim: productData.data_fim || null,
      meta_id: productData.meta_id || activity.meta_id || null,
      rubrica_id: productData.rubrica_id || activity.rubrica_id || null,
      usuario_responsavel_id: productData.usuario_responsavel_id || activity.usuario_responsavel_id || user.email,
      user_email: user.email,
      fotos: [],
      documentos: []
    });

    return Response.json({
      product: newProduct,
      activity: activity,
      message: 'Produto criado com sucesso e vinculado à atividade e relatório'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});