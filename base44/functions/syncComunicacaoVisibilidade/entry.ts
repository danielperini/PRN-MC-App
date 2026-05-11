import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CONNECTOR_NAMES = [
  'googledrive comunicacao',
  'googledrive_comunicacao',
  'googledrive',
];

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut';

const ROOT_FOLDER_IDS = {
  RELEASES_CLIPPING: '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
  IMAGENS: '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
  REDES_SOCIAIS: '1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
};

const DRIVE_FOLDERS = [
  {
    id: ROOT_FOLDER_IDS.RELEASES_CLIPPING,
    rootKey: 'RELEASES_CLIPPING',
    name: 'Releases e Clipping',
    url: 'https://drive.google.com/drive/folders/1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    defaultCategory: 'RELEASE',
  },
  {
    id: ROOT_FOLDER_IDS.IMAGENS,
    rootKey: 'IMAGENS',
    name: 'Imagens',
    url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    defaultCategory: 'FOTOGRAFIA',
  },
  {
    id: ROOT_FOLDER_IDS.REDES_SOCIAIS,
    rootKey: 'REDES_SOCIAIS',
    name: 'Redes Sociais',
    url: 'https://drive.google.com/drive/folders/1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    defaultCategory: 'POSTS',
  },
];

const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.svg',
];

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isImageFile(name = '', mimeType = '') {
  const normalizedName = normalizeText(name);
  const normalizedMime = normalizeText(mimeType);

  if (normalizedMime.startsWith('image/')) return true;

  return IMAGE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}

function inferCategory(name = '', mimeType = '', defaultCategory = 'RELEASE', folderPath = '', rootKey = '') {
  const text = normalizeText(`${folderPath} ${name} ${mimeType}`);

  if (rootKey === 'IMAGENS') {
    return isImageFile(name, mimeType) ? 'FOTOGRAFIA' : 'OUTRO';
  }

  if (rootKey === 'REDES_SOCIAIS') return 'POSTS';

  if (rootKey === 'RELEASES_CLIPPING') {
    if (
      text.includes('clipping') ||
      text.includes('clipagem') ||
      text.includes('imprensa') ||
      text.includes('midia') ||
      text.includes('jornal') ||
      text.includes('materia') ||
      text.includes('noticia')
    ) {
      return 'CLIPPING';
    }

    return 'RELEASE';
  }

  if (text.includes('clipping') || text.includes('clipagem') || text.includes('imprensa')) return 'CLIPPING';
  if (text.includes('post') || text.includes('posts') || text.includes('instagram') || text.includes('facebook') || text.includes('card') || text.includes('cards') || text.includes('social') || text.includes('redes')) return 'POSTS';
  if (isImageFile(name, mimeType)) return 'FOTOGRAFIA';
  if (text.includes('release') || text.includes('releases') || text.includes('relise') || text.includes('assessoria') || text.includes('nota')) return 'RELEASE';

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
      const accessToken = connection?.accessToken || connection?.access_token;

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
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink,size,shortcutDetails)');
    const pageTokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true${pageTokenParam}`;

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
      } else if (
        child.mimeType === SHORTCUT_MIME_TYPE &&
        child.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE &&
        child.shortcutDetails?.targetId
      ) {
        queue.push({
          id: child.shortcutDetails.targetId,
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
  const imageFile = isImageFile(file.name, file.mimeType);
  const category = inferCategory(file.name, file.mimeType, folder.defaultCategory, folderPath, folder.rootKey);
  const createdTime = file.createdTime || file.modifiedTime || null;

  return {
    id: file.id,
    drive_file_id: file.id,
    drive_folder_id: folder.id,
    drive_folder_name: folder.name,
    drive_root_folder_id: folder.id,
    drive_root_folder_key: folder.rootKey,
    drive_parent_folder_id: folder.currentFolderId || folder.id,
    drive_parent_folder_path: folderPath,
    sourceFolderId: folder.id,
    sourceFolderName: folder.name,
    sourceFolderPath: folderPath,
    name: file.name || 'Arquivo sem nome',
    nome: file.name || 'Arquivo sem nome',
    category,
    tipo: category,
    typeLabel: category === 'FOTOGRAFIA' ? 'Imagens' : category === 'POSTS' ? 'Posts' : category === 'CLIPPING' ? 'Clipping' : category === 'RELEASE' ? 'Releases' : 'Outros',
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
    is_image_file: imageFile,
    isFolderShortcut: false,
  };
}

function buildSummary(files: any[]) {
  return {
    releases: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.RELEASES_CLIPPING && file.category === 'RELEASE').length,
    clipping: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.RELEASES_CLIPPING && file.category === 'CLIPPING').length,
    imagens: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.IMAGENS && file.is_image_file === true).length,
    posts: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.REDES_SOCIAIS && file.category === 'POSTS').length,
  };
}

async function upsertAssets(base44: any, assets: any[]) {
  const entity = base44.asServiceRole.entities.CommunicationAsset || base44.entities.CommunicationAsset;

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
        const entity = base44.asServiceRole.entities.CommunicationAsset || base44.entities.CommunicationAsset;
        const cached = entity ? await entity.list('-criado_em_drive', 5000) : [];
        const files = Array.isArray(cached) ? cached : [];

        return Response.json({
          success: true,
          mode: 'cache',
          files,
          summary: buildSummary(files),
        });
      } catch (error) {
        return Response.json({
          success: false,
          mode: 'cache_unavailable',
          files: [],
          summary: buildSummary([]),
          error: error?.message || 'Cache indisponível',
        });
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

    const summary = buildSummary(dedupedAssets);
    const saveResult = await upsertAssets(base44, dedupedAssets);

    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'SYNC_COMUNICACAO',
        actor_email: user.email || 'sistema',
        actor_name: user.full_name || user.email || 'Sistema',
        details: `Sincronização Comunicação: ${dedupedAssets.length} arquivo(s). Releases: ${summary.releases}; Clipping: ${summary.clipping}; Imagens: ${summary.imagens}; Posts: ${summary.posts}.`,
        metadata: {
          total_files: dedupedAssets.length,
          saved: saveResult.saved,
          skipped: saveResult.skipped,
          cache_available: saveResult.cacheAvailable,
          connector_name: connectorName,
          summary,
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
      summary,
      total_files: dedupedAssets.length,
      total_image_files: summary.imagens,
      saved: saveResult.saved,
      skipped: saveResult.skipped,
      folders: DRIVE_FOLDERS,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('syncComunicacaoVisibilidade error:', error);

    return Response.json({
      success: false,
      error: error?.message || 'Erro inesperado ao sincronizar Comunicação.',
    }, { status: 500 });
  }
});
