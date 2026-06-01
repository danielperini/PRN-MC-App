import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Interruptor global de e-mails de notificação.
// POST { "pausar": true }  → pausa todos os e-mails
// POST { "pausar": false } → reativa
// GET                      → retorna status atual

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const existentes = await base44.asServiceRole.entities.MetadadosConfig.filter({
      categoria: 'sistema',
      valor: 'notificacoes_email_pausadas'
    });

    if (req.method === 'GET') {
      const pausado = Array.isArray(existentes) && existentes.length > 0 && existentes[0].ativo === true;
      return Response.json({ pausado });
    }

    const body = await req.json().catch(() => ({}));
    const pausar = body.pausar === true;

    if (existentes && existentes.length > 0) {
      await base44.asServiceRole.entities.MetadadosConfig.update(existentes[0].id, { ativo: pausar });
    } else {
      await base44.asServiceRole.entities.MetadadosConfig.create({
        categoria: 'sistema',
        valor: 'notificacoes_email_pausadas',
        label: 'Notificações de e-mail pausadas',
        descricao: 'Quando ativo, bloqueia o envio de todos os e-mails de notificação do sistema.',
        ativo: pausar
      });
    }

    console.log(`[toggleEmailNotifications] E-mails ${pausar ? 'PAUSADOS' : 'REATIVADOS'} por ${user.email}`);

    return Response.json({ success: true, pausado: pausar });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});