import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================================
// FINALIZE AI STATUS — Evita travamento em ANALISANDO_IA
// ============================================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user?.role !== 'admin') {
      return Response.json({ error: 'Admin required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { entity_id, entity_type, force_status } = body;

    let entity = null;
    let updateFn = null;

    // Busca entidade
    if (entity_type === 'DocumentIntake') {
      const result = await base44.asServiceRole.entities.DocumentIntake.filter({
        id: entity_id
      });
      if (result?.length > 0) {
        entity = result[0];
        updateFn = (data) =>
          base44.asServiceRole.entities.DocumentIntake.update(entity_id, data);
      }
    }

    if (!entity) {
      return Response.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    // Verifica se está travado
    if (entity.status !== 'ANALISANDO_IA') {
      return Response.json({
        ok: true,
        message: `Entidade não está em ANALISANDO_IA (status: ${entity.status})`,
        no_action_needed: true
      });
    }

    // Calcula tempo travado
    const created = new Date(entity.created_date);
    const now = new Date();
    const diffMinutes = (now - created) / 1000 / 60;

    console.log(`[AI_STATUS] Entity ${entity_id} travado há ${diffMinutes.toFixed(2)} minutos`);

    // Se passou 10 minutos, força finalização
    if (diffMinutes > 10) {
      const newStatus = force_status || 'ERRO_PROCESSAMENTO';

      await updateFn({
        status: newStatus,
        status_processamento: newStatus,
        erros_validacao: [
          ...(entity.erros_validacao || []),
          `IA timeout - não completou análise em ${diffMinutes.toFixed(0)} minutos (${new Date().toISOString()})`
        ]
      });

      // Log
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'UPDATE',
        entity_type: 'DocumentIntake',
        entity_id: entity_id,
        actor_email: user.email,
        actor_name: user.full_name,
        previous_status: 'ANALISANDO_IA',
        new_status: newStatus,
        details: `Forçado para ${newStatus} por timeout de IA (${diffMinutes.toFixed(0)} min)`
      });

      return Response.json({
        ok: true,
        message: `Status finalizando: ANALISANDO_IA → ${newStatus}`,
        entity_id: entity_id,
        previous_status: 'ANALISANDO_IA',
        new_status: newStatus,
        timeout_minutes: diffMinutes.toFixed(2)
      });
    }

    // Ainda dentro do timeout
    return Response.json({
      ok: true,
      message: `Entidade ainda em análise (${diffMinutes.toFixed(2)} min)`,
      status: 'ANALISANDO_IA',
      time_elapsed_minutes: diffMinutes.toFixed(2),
      will_timeout_in_minutes: (10 - diffMinutes).toFixed(2)
    });
  } catch (e) {
    console.error('finalizeAIStatus error:', e);
    return Response.json(
      { error: e.message || 'Erro ao finalizar status' },
      { status: 500 }
    );
  }
});