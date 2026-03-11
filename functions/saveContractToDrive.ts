import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url, member_name, member_id } = await req.json();

    if (!file_url || !member_name) {
      return Response.json({ error: 'Faltam dados obrigatórios' }, { status: 400 });
    }

    // Obter conexão Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Nome do arquivo normalizado
    const fileName = `Contrato_${member_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    const folder_id = '1nvzu_2j0GdXUFGgdN-nLr3e62lOJ_I_J';

    // Buscar arquivo enviado usando file_url (tentando obter via fetch)
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      return Response.json({ error: 'Erro ao obter arquivo' }, { status: 400 });
    }

    const fileBlob = await fileResponse.blob();
    const formData = new FormData();
    
    const metadata = {
      name: fileName,
      mimeType: fileBlob.type,
      parents: [folder_id],
    };

    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', fileBlob, fileName);

    // Upload para Google Drive
    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      console.error('Erro Google Drive:', errorText);
      return Response.json({ error: 'Erro ao salvar no Drive: ' + errorText }, { status: 400 });
    }

    const driveFile = await uploadRes.json();

    // Atualizar TeamMember com URL do Drive
    if (member_id) {
      try {
        await base44.asServiceRole.entities.TeamMember.update(member_id, {
          contrato_url: `https://drive.google.com/file/d/${driveFile.id}/view`,
        });
      } catch (e) {
        console.warn('Aviso ao atualizar TeamMember:', e.message);
      }
    }

    return Response.json({
      success: true,
      message: 'Contrato salvo no Google Drive com sucesso!',
      driveFileId: driveFile.id,
      driveLink: `https://drive.google.com/file/d/${driveFile.id}/view`,
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});