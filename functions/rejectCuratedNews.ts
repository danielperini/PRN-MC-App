import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { newsId } = await req.json();

    if (!newsId) {
      return Response.json({ error: 'newsId required' }, { status: 400 });
    }

    await base44.asServiceRole.entities.NewsHighlight.update(newsId, {
      status_curadoria: 'REJEITADO',
      ativo: false
    });

    return Response.json({ success: true, message: 'Notícia rejeitada' });
  } catch (error) {
    console.error('Erro em rejectCuratedNews:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});