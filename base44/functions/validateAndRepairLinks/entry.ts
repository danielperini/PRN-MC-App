import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Valida integridade relacional entre Attachment e report/activity.
 * - Detecta Attachments órfãos (sem report_id válido)
 * - Loga relatório de inconsistências
 * - Modo dry_run: só reporta, não deleta
 * Requer role admin.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false; // default true

    const [attachments, reports] = await Promise.all([
      base44.asServiceRole.entities.Attachment.list('-created_date', 5000),
      base44.asServiceRole.entities.Report.list('-created_date', 2000),
    ]);

    const reportIds = new Set(reports.map(r => r.id));
    const orphanAttachments = attachments.filter(a => !a.report_id || !reportIds.has(a.report_id));

    const result = {
      total_attachments: attachments.length,
      total_reports: reports.length,
      orphan_attachments: orphanAttachments.length,
      orphan_ids: orphanAttachments.map(a => ({ id: a.id, file_name: a.file_name, activity_id: a.activity_id })),
      dry_run,
      deleted: 0,
    };

    if (!dry_run && orphanAttachments.length > 0) {
      for (const att of orphanAttachments) {
        await base44.asServiceRole.entities.Attachment.delete(att.id);
        result.deleted++;
      }
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'UPDATE',
      entity_type: 'ATTACHMENT',
      entity_id: 'bulk',
      actor_email: user.email,
      actor_name: user.full_name,
      details: `validateAndRepairLinks: ${orphanAttachments.length} órfãos encontrados, ${result.deleted} removidos. dry_run=${dry_run}`,
    });

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});