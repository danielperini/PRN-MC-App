import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    const allowedRoles = ['admin', 'COORDENADOR', 'ADMIN'];
    if (!user || !allowedRoles.includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { newsId } = await req.json();

    if (!newsId) {
      return Response.json({ error: 'newsId required' }, { status: 400 });
    }

    await base44.asServiceRole.entities.NewsHighlight.update(newsId, {
      ativo: true,
      status_curadoria: 'APROVADO_MANUAL'
    });

    return Response.json({ success: true, message: 'Notícia aprovada e publicada' });
  } catch (error) {
    console.error('Erro em approveCuratedNews:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});