import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Automação: quando um Attachment é deletado no app, deleta também do Google Drive
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { event, data } = body;

    // Só agir em deletes
    if (event?.type !== 'delete') {
      return Response.json({ skipped: true, reason: 'Não é evento de delete' });
    }

    // Se não tinha backup no Drive, nada a fazer
    if (!data?.drive_file_id || !data?.backup_done) {
      return Response.json({ skipped: true, reason: 'Arquivo não tinha backup no Drive' });
    }

    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Deletar do Google Drive
    const deleteRes = await fetch(`https://www.googleapis.com/drive/v3/files/${data.drive_file_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (deleteRes.status === 404) {
      return Response.json({ skipped: true, reason: 'Arquivo não encontrado no Drive (já deletado)' });
    }

    if (!deleteRes.ok && deleteRes.status !== 204) {
      const err = await deleteRes.text();
      throw new Error('Erro ao deletar do Drive: ' + err);
    }

    console.log(`Arquivo deletado do Drive: ${data.drive_file_id} (${data.file_name})`);

    return Response.json({
      success: true,
      deleted_drive_file_id: data.drive_file_id,
      file_name: data.file_name
    });

  } catch (error) {
    console.error('Erro ao deletar arquivo do Drive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});