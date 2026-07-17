import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Buscar pasta raiz do Drive (My Drive)
    const rootRes = await fetch('https://www.googleapis.com/drive/v3/files/root?fields=id', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const root = await rootRes.json();
    const rootId = root.id;

    // Verificar se já existe pasta "Museus Centro" na raiz
    const searchMuseusCentroRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='Museus Centro' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchMuseusCentro = await searchMuseusCentroRes.json();
    let museusCentroId;

    if (searchMuseusCentro.files && searchMuseusCentro.files.length > 0) {
      museusCentroId = searchMuseusCentro.files[0].id;
    } else {
      // Criar pasta "Museus Centro" na raiz
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Museus Centro', mimeType: 'application/vnd.google-apps.folder', parents: [rootId] })
      });
      const created = await createRes.json();
      museusCentroId = created.id;
    }

    // Verificar se já existe pasta "Relatórios Mensais" dentro de "Museus Centro"
    const searchRelatoriosRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='Relatórios Mensais' and mimeType='application/vnd.google-apps.folder' and '${museusCentroId}' in parents and trashed=false`)}&fields=files(id,name,webViewLink)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchRelatorios = await searchRelatoriosRes.json();
    let relatoriosFolderId;
    let relatoriosFolderUrl;
    let created = false;

    if (searchRelatorios.files && searchRelatorios.files.length > 0) {
      relatoriosFolderId = searchRelatorios.files[0].id;
      relatoriosFolderUrl = searchRelatorios.files[0].webViewLink;
    } else {
      // Criar pasta "Relatórios Mensais" dentro de "Museus Centro"
      const createRelRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Relatórios Mensais', mimeType: 'application/vnd.google-apps.folder', parents: [museusCentroId] })
      });
      const createRel = await createRelRes.json();
      relatoriosFolderId = createRel.id;

      // Buscar URL da pasta criada
      const folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${relatoriosFolderId}?fields=webViewLink`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const folder = await folderRes.json();
      relatoriosFolderUrl = folder.webViewLink;
      created = true;
    }

    return Response.json({
      success: true,
      created,
      folder_id: relatoriosFolderId,
      folder_url: relatoriosFolderUrl,
      path: 'Museus Centro / Relatórios Mensais',
      message: created ? 'Pasta criada com sucesso.' : 'Pasta já existia.'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});