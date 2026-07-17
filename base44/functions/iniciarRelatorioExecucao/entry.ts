import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { tipo = 'parcial', data_inicio, data_fim, filtro_museu = 'todos', filtro_meta_ids = [], filtro_versao = 'consolidado' } = body;

    if (!data_inicio || !data_fim) {
      return Response.json({ error: 'data_inicio e data_fim são obrigatórios' }, { status: 400 });
    }

    const relatorio = await base44.asServiceRole.entities.RelatorioExecucaoObjeto.create({
      tipo,
      data_inicio,
      data_fim,
      filtro_museu,
      filtro_meta_ids,
      filtro_versao,
      status: 'rascunho',
      gerado_por_email: user.email,
      gerado_por_nome: user.full_name,
      identificacao_projeto: {
        organizacao: 'Viaduto das Artes',
        projeto: 'Museus Centro',
        responsavel: user.full_name,
        email: user.email
      }
    });

    return Response.json({ success: true, relatorio_id: relatorio.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});