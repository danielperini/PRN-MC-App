/**
 * adminUpdateUser — atualiza dados de um usuário via service role
 * Exige que o chamador seja admin.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = String(user.role || '').toUpperCase();
    const isAdmin = role === 'ADMIN' || role === 'COORDENADOR';
    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { userId, data } = body;

    if (!userId || !data) {
      return Response.json({ error: 'userId e data são obrigatórios' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.User.update(userId, data);
    return Response.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('adminUpdateUser error:', error);
    return Response.json({ success: false, error: error?.message || 'Erro desconhecido' }, { status: 500 });
  }
});