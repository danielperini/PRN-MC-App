import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all reports
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 1000);
    const activities = await base44.asServiceRole.entities.Activity.list('-created_date', 2000);
    const opportunities = await base44.asServiceRole.entities.AuditLog.list('-created_date', 500);

    // Prepare backup data
    const backupData = {
      timestamp: new Date().toISOString(),
      backup_user: user.email,
      backup_user_name: user.full_name,
      statistics: {
        total_reports: reports.length,
        total_activities: activities.length,
        total_audit_logs: opportunities.length,
      },
      data: {
        reports: Array.isArray(reports) ? reports : [],
        activities: Array.isArray(activities) ? activities : [],
        audit_logs: Array.isArray(opportunities) ? opportunities : [],
      }
    };

    // Convert to JSON string
    const backupJson = JSON.stringify(backupData, null, 2);
    const backupBlob = new Blob([backupJson], { type: 'application/json' });

    // Get Google Drive connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Upload to Google Drive
    const fileName = `MuseuCentro_Backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: backupBlob,
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.text();
      console.error('Google Drive upload failed:', errorData);
      return Response.json({
        success: false,
        error: 'Falha ao enviar arquivo para Google Drive',
        details: errorData
      }, { status: 500 });
    }

    const uploadedFile = await uploadResponse.json();

    // Log backup action
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'CREATE',
      entity_type: 'BACKUP',
      entity_id: uploadedFile.id || 'unknown',
      actor_email: user.email,
      actor_name: user.full_name,
      details: `Backup criado: ${fileName}. Total de ${reports.length} relatórios, ${activities.length} atividades salvos.`
    });

    return Response.json({
      success: true,
      message: 'Backup criado com sucesso no Google Drive',
      backup_file: {
        name: fileName,
        size: backupJson.length,
        google_drive_id: uploadedFile.id,
        timestamp: backupData.timestamp,
        statistics: backupData.statistics
      }
    });

  } catch (error) {
    console.error('Backup error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Erro ao criar backup'
    }, { status: 500 });
  }
});