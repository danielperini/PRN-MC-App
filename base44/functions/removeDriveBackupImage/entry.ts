import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportPhotoId, driveFileId } = await req.json();

    if (!driveFileId) {
      return Response.json({ error: 'driveFileId required' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obter access token do Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Deletar arquivo do Drive
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete file from Drive: ${response.statusText}`);
    }

    // Atualizar status no sistema
    if (reportPhotoId) {
      await base44.entities.ReportPhoto.update(reportPhotoId, {
        backup_status: 'REMOVIDO_DO_DRIVE',
        drive_file_id: null,
        drive_file_url: null,
      });
    }

    console.log(`[REMOVED] Drive file ${driveFileId} deleted successfully`);

    return Response.json({
      success: true,
      action: 'DELETED',
      fileId: driveFileId,
    });
  } catch (error) {
    console.error('Remove backup error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});