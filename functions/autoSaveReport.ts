import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, formData } = await req.json();
    if (!reportId || !formData) {
      return Response.json({ error: 'Parâmetros obrigatórios: reportId, formData' }, { status: 400 });
    }

    // Buscar versão mais recente do relatório
    const reportVersions = await base44.asServiceRole.entities.ReportVersion.filter(
      { report_id: reportId },
      '-version_number',
      1
    );

    const lastVersion = reportVersions?.[0];
    const newVersionNumber = (lastVersion?.version_number || 0) + 1;

    // Detectar conflito: se a versão local é diferente da última no BD
    const currentReport = await base44.asServiceRole.entities.Report.get(reportId);
    const hasConflict = lastVersion && JSON.stringify(lastVersion.data_snapshot) !== JSON.stringify(currentReport);

    // Salvar nova versão
    await base44.asServiceRole.entities.ReportVersion.create({
      report_id: reportId,
      version_number: newVersionNumber,
      data_snapshot: formData,
      changed_by_email: user.email,
      changed_by_name: user.full_name,
      change_description: 'Auto-save',
      last_update_timestamp: new Date().toISOString(),
    });

    // Atualizar relatório principal
    const { id, created_date, updated_date, created_by, ...payload } = formData;
    await base44.asServiceRole.entities.Report.update(reportId, payload);

    return Response.json({
      success: true,
      versionNumber: newVersionNumber,
      hasConflict,
      conflictMessage: hasConflict
        ? 'Conflito detectado: outro usuário editou este relatório. Suas alterações serão mantidas, mas verifique as mudanças.'
        : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});