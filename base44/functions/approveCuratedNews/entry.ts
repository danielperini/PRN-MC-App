import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { authorizeAdminOrCoordinator } from '../_shared/authorization.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const authorization = await authorizeAdminOrCoordinator(base44);
    if (!authorization.ok) return authorization.response;

    const { newsId } = await req.json().catch(() => ({}));
    if (!newsId) {
      return Response.json({ success: false, code: 'NEWS_ID_REQUIRED', error: 'newsId é obrigatório.' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.NewsHighlight.filter({ id: newsId });
    if (!Array.isArray(existing) || !existing[0]) {
      return Response.json({ success: false, code: 'NEWS_NOT_FOUND', error: 'Notícia não encontrada.' }, { status: 404 });
    }

    await base44.asServiceRole.entities.NewsHighlight.update(newsId, {
      ativo: true,
      status_curadoria: 'APROVADO_MANUAL',
      aprovado_por: authorization.user?.email || authorization.user?.id,
      aprovado_em: new Date().toISOString(),
    });

    return Response.json({ success: true, message: 'Notícia aprovada e publicada.' });
  } catch (error: any) {
    console.error('Erro em approveCuratedNews:', error);
    return Response.json({ success: false, code: 'APPROVE_CURATED_NEWS_FAILED', error: String(error?.message || error) }, { status: 500 });
  }
});