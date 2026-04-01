/**
 * Faz backup de todos os Attachments que ainda não foram enviados ao Drive.
 * Especialmente útil para arquivos existentes antes da integração com Drive.
 * Só pode ser chamado por admin.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 200;

    // Busca todos os attachments sem backup (inclui registros onde campo não existe)
    const allAttachments = await base44.asServiceRole.entities.Attachment.list('-created_date', limit);
    const all = (allAttachments || []).filter(a => !a.backup_done || !a.drive_file_id);

    if (!all || all.length === 0) {
      return Response.json({ message: 'Nenhum arquivo pendente de backup', count: 0 });
    }

    let succeeded = 0;
    let failed = 0;
    const errors = [];

    for (const att of all) {
      try {
        const res = await base44.asServiceRole.functions.invoke('backupSingleFile', {
          attachment_id: att.id
        });
        if (res?.success || res?.skipped) {
          succeeded++;
        } else {
          failed++;
          errors.push({ id: att.id, error: res?.error || 'Desconhecido' });
        }
      } catch (err) {
        failed++;
        errors.push({ id: att.id, error: err?.message || String(err) });
      }
    }

    return Response.json({
      total: all.length,
      succeeded,
      failed,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});