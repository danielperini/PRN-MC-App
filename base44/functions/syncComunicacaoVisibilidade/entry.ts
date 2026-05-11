import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CONNECTOR_NAMES = [
  'googledrive comunicacao',
  'googledrive_comunicacao',
  'googledrive',
];

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

const DRIVE_FOLDERS = [
  {
    id: '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    name: 'Releases e Clipping',
    url: 'https://drive.google.com/drive/folders/1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    defaultCategory: 'RELEASE',
  },
  {
    id: '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    name: 'Imagens',
    url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    defaultCategory: 'FOTOGRAFIA',
  },
  {
    id: '1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    name: 'Redes Sociais',
    url: 'https://drive.google.com/drive/folders/1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    defaultCategory: 'POSTS',
  },
];

function inferCategory(name = '', mimeType = '', defaultCategory = 'RELEASE', folderPath = '') {
  const text = `${folderPath} ${name} ${mimeType}`.toLowerCase();

  if (text.includes('clipping') || text.includes('clipagem') || text.includes('imprensa')) return 'CLIPPING';
  if (text.includes('post') || text.includes('posts') || text.includes('instagram') || text.includes('facebook') || text.includes('card') || text.includes('cards') || text.includes('social') || text.includes('redes')) return 'POSTS';
  if (text.includes('foto') || text.includes('fotos') || text.includes('fotografia') || text.includes('imagem') || text.includes('imagens') || mimeType.startsWith('image/')) return 'FOTOGRAFIA';
  if (text.includes('release') || text.includes('releases') || text.includes('relise') || text.includes('assessoria')) return 'RELEASE';

  return defaultCategory;
}

function formatMonth(value: string | null | undefined) {
  if (!value) return 'Sem data informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data informada';
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getFileUrl(file: any) {
  if (file.webViewLink) return file.webViewLink;
  if (file.id) return `https://drive.google.com/file/d/${file.id}/view`;
  return '';
}

async function getGoogleDriveAccessToken(base44: any) {
  const errors: string[] = [];

  for (const connectorName of CONNECTOR_NAMES) {
    try {
      const connection = await base44.asServiceRole.connectors.getConnection(connectorName);
      const accessToken = connection?.accessToken;

      if (accessToken) {
        return { accessToken, connectorName };
      }

      errors.push(`${connectorName}: sem accessToken`);
    } catch (error) {
      errors.push(`${connectorName}: ${error?.message || 'indisponível'}`);
    }
  }

  throw new Error(`Conexão Google Drive não configurada ou sem token. Tentativas: ${errors.join(' | ')}`);
}

async function listDirectChildren(accessToken: string, folderId: string) {
  const files: any[] = [];
  let pageToken = '';

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink,size)');
    const pageTokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000&orderBy=folder,name${pageTokenParam}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Erro ao acessar pasta ${folderId}: ${response.status} ${details}`);
    }

    const data = await response.json();
    files.push(...(Array.isArray(data.files) ? data.files : []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return files;
}

async function listFolderFilesRecursive(accessToken: string, rootFolder: any) {
  const files: any[] = [];
  const queue = [
    {
      id: rootFolder.id,
      path: rootFolder.name,
    },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentFolder = queue.shift();
    if (!currentFolder || visited.has(currentFolder.id)) continue;

    visited.add(currentFolder.id);

    const children = await listDirectChildren(accessToken, currentFolder.id);

    for (const child of children) {
      if (child.mimeType === FOLDER_MIME_TYPE) {
        queue.push({
          id: child.id,
          path: `${currentFolder.path} / ${child.name}`,
        });
      } else {
        files.push({
          file: child,
          folder: {
            ...rootFolder,
            currentFolderId: currentFolder.id,
            currentFolderPath: currentFolder.path,
          },
        });
      }
    }
  }

  return files;
}

function normalizeAsset(file: any, folder: any) {
  const folderPath = folder.currentFolderPath || folder.name;
  const category = inferCategory(file.name, file.mimeType, folder.defaultCategory, folderPath);
  const createdTime = file.createdTime || file.modifiedTime || null;

  return {
    id: file.id,
    drive_file_id: file.id,
    drive_folder_id: folder.id,
    drive_folder_name: folder.name,
    drive_parent_folder_id: folder.currentFolderId || folder.id,
    drive_parent_folder_path: folderPath,
    sourceFolderId: folder.id,
    sourceFolderName: folder.name,
    sourceFolderPath: folderPath,
    name: file.name || 'Arquivo sem nome',
    nome: file.name || 'Arquivo sem nome',
    category,
    tipo: category,
    typeLabel: category === 'FOTOGRAFIA' ? 'Imagens' : category === 'POSTS' ? 'Posts' : category === 'CLIPPING' ? 'Clipping' : 'Releases',
    month: formatMonth(createdTime),
    mes: formatMonth(createdTime),
    ano: createdTime ? new Date(createdTime).getFullYear() : null,
    mimeType: file.mimeType || '',
    mime_type: file.mimeType || '',
    tamanho_bytes: file.size ? Number(file.size) : null,
    url: getFileUrl(file),
    link: getFileUrl(file),
    thumbnail: file.thumbnailLink || '',
    createdTime: file.createdTime || null,
    modifiedTime: file.modifiedTime || null,
    criado_em_drive: file.createdTime || null,
    atualizado_em_drive: file.modifiedTime || null,
    sincronizado_em: new Date().toISOString(),
    origem: 'GOOGLE_DRIVE_COMUNICACAO',
    ativo: true,
    isFolderShortcut: false,
  };
}

async function upsertAssets(base44: any, assets: any[]) {
  const entity = base44.asServiceRole.entities.CommunicationAsset;
  if (!entity) {
    return { saved: 0, skipped: assets.length, cacheAvailable: false };
  }

  let saved = 0;
  let skipped = 0;

  for (const asset of assets) {
    try {
      const existing = await entity.filter({ drive_file_id: asset.drive_file_id }, '-created_date', 1);
      if (Array.isArray(existing) && existing[0]?.id) {
        await entity.update(existing[0].id, asset);
      } else {
        await entity.create(asset);
      }
      saved += 1;
    } catch (error) {
      console.error('Erro ao salvar CommunicationAsset:', asset.drive_file_id, error?.message || error);
      skipped += 1;
    }
  }

  return { saved, skipped, cacheAvailable: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'sync';

    if (action === 'list-cache') {
      try {
        const cached = await base44.entities.CommunicationAsset.list('-criado_em_drive', 1000);
        return Response.json({ success: true, mode: 'cache', files: Array.isArray(cached) ? cached : [] });
      } catch (error) {
        return Response.json({ success: false, mode: 'cache_unavailable', files: [], error: error?.message || 'Cache indisponível' });
      }
    }

    const { accessToken, connectorName } = await getGoogleDriveAccessToken(base44);

    const filesByFolder = await Promise.all(
      DRIVE_FOLDERS.map((folder) => listFolderFilesRecursive(accessToken, folder))
    );
    const normalizedAssets = filesByFolder.flat().map(({ file, folder }) => normalizeAsset(file, folder));
    const dedupedAssets = Array.from(
      new Map(normalizedAssets.map((asset) => [asset.drive_file_id, asset])).values()
    );

    const saveResult = await upsertAssets(base44, dedupedAssets);

    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'SYNC_COMUNICACAO',
        actor_email: user.email || 'sistema',
        actor_name: user.full_name || user.email || 'Sistema',
        details: `Sincronização Comunicação: ${dedupedAssets.length} arquivo(s), ${saveResult.saved} salvo(s), ${saveResult.skipped} ignorado(s).`,
        metadata: {
          total_files: dedupedAssets.length,
          saved: saveResult.saved,
          skipped: saveResult.skipped,
          cache_available: saveResult.cacheAvailable,
          connector_name: connectorName,
          folders: DRIVE_FOLDERS.map((folder) => folder.id),
        },
      });
    } catch (error) {
      console.warn('Auditoria não registrada:', error?.message || error);
    }

    return Response.json({
      success: true,
      mode: saveResult.cacheAvailable ? 'drive-cache' : 'drive-direct',
      connector_name: connectorName,
      files: dedupedAssets,
      total_files: dedupedAssets.length,
      saved: saveResult.saved,
      skipped: saveResult.skipped,
      folders: DRIVE_FOLDERS,
      synced_at: new Date().toISOString(),
      schedule_hint: 'Agendar esta função no Base44 para 12:59 e 23:59 diariamente.',
    });
  } catch (error) {
    console.error('syncComunicacaoVisibilidade error:', error);
    return Response.json({
      success: false,
      error: error?.message || 'Erro inesperado ao sincronizar Comunicação.',
    }, { status: 500 });
  }
});
