import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ID da pasta raiz fornecida pelo usuário
const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

// Subpastas a criar
const FOLDER_STRUCTURE = {
  'Relatórios em PDF': 'relatorios_pdf',
  'Financeiro': 'financeiro',
  'Notas Fiscais': 'notas_fiscais',
  'Fotos': 'fotos',
  'Documentos': 'documentos',
  'Contratos': 'contratos'
};

async function createFolder(accessToken, folderName, parentFolderId) {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function findFolders(accessToken, parentFolderId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  const data = await response.json();
  return data.files || [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admins podem configurar Drive' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Buscar pastas existentes
    const existingFolders = await findFolders(accessToken, ROOT_FOLDER_ID);
    const createdFolders = {};

    // Criar pastas que não existem
    for (const [folderName, key] of Object.entries(FOLDER_STRUCTURE)) {
      const existing = existingFolders.find(f => f.name === folderName);
      if (existing) {
        createdFolders[key] = { id: existing.id, created: false, name: folderName };
      } else {
        const folderId = await createFolder(accessToken, folderName, ROOT_FOLDER_ID);
        createdFolders[key] = { id: folderId, created: true, name: folderName };
      }
    }

    // Salvar IDs das pastas na config
    await base44.asServiceRole.integrations.Core.SaveConfig({
      key: 'drive_folder_structure',
      value: JSON.stringify({
        root: ROOT_FOLDER_ID,
        folders: createdFolders,
        createdAt: new Date().toISOString()
      })
    });

    return Response.json({
      success: true,
      message: 'Estrutura de pastas configurada com sucesso',
      root_folder: ROOT_FOLDER_ID,
      folders: createdFolders
    });

  } catch (error) {
    console.error('Erro ao configurar Drive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});