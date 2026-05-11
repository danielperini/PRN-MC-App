import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CONNECTOR_NAMES = ['googledrive comunicacao', 'googledrive_comunicacao', 'googledrive'];
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut';

const ROOT_FOLDER_IDS = {
  RELEASES_CLIPPING: '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
  IMAGENS: '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
  REDES_SOCIAIS: '1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
};

const DRIVE_FOLDERS = [
  { id: ROOT_FOLDER_IDS.RELEASES_CLIPPING, rootKey: 'RELEASES_CLIPPING', name: 'Releases e Clipping', defaultCategory: 'RELEASE' },
  { id: ROOT_FOLDER_IDS.IMAGENS, rootKey: 'IMAGENS', name: 'Imagens', defaultCategory: 'FOTOGRAFIA' },
  { id: ROOT_FOLDER_IDS.REDES_SOCIAIS, rootKey: 'REDES_SOCIAIS', name: 'Redes Sociais', defaultCategory: 'POSTS' },
];

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function inferCategory(name = '', mimeType = '', defaultCategory = 'RELEASE', folderPath = '', rootKey = '') {
  const text = normalizeText(`${folderPath} ${name} ${mimeType}`);

  if (rootKey === 'IMAGENS') return 'FOTOGRAFIA';
  if (rootKey === 'REDES_SOCIAIS') return 'POSTS';

  if (rootKey === 'RELEASES_CLIPPING') {
    if (text.includes('clipping') || text.includes('clipagem') || text.includes('imprensa') || text.includes('midia') || text.includes('jornal') || text.includes('materia') || text.includes('noticia')) return 'CLIPPING';
    return 'RELEASE';
  }

  if (text.includes('clipping') || text.includes('clipagem') || text.includes('imprensa')) return 'CLIPPING';
  if (text.includes('post') || text.includes('posts') || text.includes('instagram') || text.includes('facebook') || text.includes('card') || text.includes('cards') || text.includes('social') || text.includes('redes')) return 'POSTS';
  if (text.includes('foto') || text.includes('fotos') || text.includes('fotografia') || text.includes('imagem') || text.includes('imagens') || mimeType.startsWith('image/')) return 'FOTOGRAFIA';
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

function getServerApiKey() {
  return (
    Deno.env.get('GOOGLE_DRIVE_API_KEY') ||
    Deno.env.get('VITE_GOOGLE_DRIVE_API_KEY') ||
    Deno.env.get('GOOGLE_API_KEY') ||
    Deno.env.get('DRIVE_API_KEY') ||
    ''
  );
}

async function getGoogleDriveAccessToken(base44: any) {
  const errors: string[] = [];

  for (const connectorName of CONNECTOR_NAMES) {
    try {
      const connection = await base44.asServiceRole.connectors.getConnection(connectorName);
      const accessToken = connection?.accessToken || connection?.access_token || connection?.credentials?.accessToken || connection?.credentials?.access_token || connection?.tokens?.accessToken || connection?.tokens?.access_token;
      if (accessToken) return { accessToken, connectorName, errors };
      errors.push(`${connectorName}: sem accessToken`);
    } catch (error) {
      errors.push(`${connectorName}: ${error?.message || 'indisponível'}`);
    }
  }

  return { accessToken: '', connectorName: '', errors };
}

async function listDirectChildren(auth: any, folderId: string) {
  const files: any[] = [];
  let pageToken = '';

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink,size,shortcutDetails)');
    const pageTokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const keyParam = auth.apiKey && !auth.accessToken ? `&key=${encodeURIComponent(auth.apiKey)}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true${pageTokenParam}${keyParam}`;

    const headers: Record<string, string> = {};
    if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

    const response = await fetch(url, { headers });
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

async function listFolderFilesRecursive(auth: any, rootFolder: any) {
  const files: any[] = [];
  const errors: any[] = [];
  const queue = [{ id: rootFolder.id, path: rootFolder.name }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentFolder = queue.shift();
    if (!currentFolder || visited.has(currentFolder.id)) continue;
    visited.add(currentFolder.id);

    let children: any[] = [];
    try {
      children = await listDirectChildren(auth, currentFolder.id);
    } catch (error) {
      errors.push({ folder_id: currentFolder.id, folder_path: currentFolder.path, error: error?.message || String(error) });
      continue;
    }

    for (const child of children) {
      if (child.mimeType === FOLDER_MIME_TYPE) {
        queue.push({ id: child.id, path: `${currentFolder.path} / ${child.name}` });
      } else if (child.mimeType === SHORTCUT_MIME_TYPE && child.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE && child.shortcutDetails?.targetId) {
        queue.push({ id: child.shortcutDetails.targetId, path: `${currentFolder.path} / ${child.name}` });
      } else {
        files.push({ file: child, folder: { ...rootFolder, currentFolderId: currentFolder.id, currentFolderPath: currentFolder.path } });
      }
    }
  }

  return { files, errors, visitedFolders: visited.size };
}

function normalizeAsset(file: any, folder: any) {
  const folderPath = folder.currentFolderPath || folder.name;
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

function buildSummary(files: any[]) {
  return {
    releases: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.RELEASES_CLIPPING && file.category === 'RELEASE').length,
    clipping: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.RELEASES_CLIPPING && file.category === 'CLIPPING').length,
    imagens: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.IMAGENS && file.category === 'FOTOGRAFIA').length,
    posts: files.filter((file) => file.drive_root_folder_id === ROOT_FOLDER_IDS.REDES_SOCIAIS && file.category === 'POSTS').length,
  };
}

async function getCommunicationEntity(base44: any) {
  return base44.asServiceRole.entities.CommunicationAsset || base44.entities.CommunicationAsset || null;
}

async function upsertAssets(base44: any, assets: any[]) {
  const entity = await getCommunicationEntity(base44);
  if (!entity) return { saved: 0, skipped: assets.length, cacheAvailable: false, errors: ['Entity CommunicationAsset indisponível'] };

  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const asset of assets) {
    try {
      const existing = await entity.filter({ drive_file_id: asset.drive_file_id }, '-created_date', 1);
      if (Array.isArray(existing) && existing[0]?.id) await entity.update(existing[0].id, asset);
      else await entity.create(asset);
      saved += 1;
    } catch (error) {
      skipped += 1;
      errors.push(`${asset.drive_file_id}: ${error?.message || String(error)}`);
    }
  }

  return { saved, skipped, cacheAvailable: true, errors: errors.slice(0, 20) };
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'sync';

    if (action === 'list-cache') {
      try {
        const entity = await getCommunicationEntity(base44);
        const cached = entity ? await entity.list('-criado_em_drive', 5000) : [];
        const files = Array.isArray(cached) ? cached : [];
        return Response.json({ success: true, mode: 'cache', files, summary: buildSummary(files), total_files: files.length });
      } catch (error) {
        return Response.json({ success: false, mode: 'cache_unavailable', files: [], summary: buildSummary([]), total_files: 0, error: error?.message || 'Cache indisponível' });
      }
    }

    const tokenResult = await getGoogleDriveAccessToken(base44);
    const apiKey = getServerApiKey();
    const auth = { accessToken: tokenResult.accessToken, apiKey };

    if (!auth.accessToken && !auth.apiKey) {
      return Response.json({
        success: false,
        error: 'Google Drive sem token OAuth e sem API key no backend.',
        files: [],
        summary: buildSummary([]),
        diagnostics: {
          connector_errors: tokenResult.errors,
          expected_envs: ['GOOGLE_DRIVE_API_KEY', 'VITE_GOOGLE_DRIVE_API_KEY', 'GOOGLE_API_KEY', 'DRIVE_API_KEY'],
        },
      }, { status: 500 });
    }

    const scanResults = await Promise.all(DRIVE_FOLDERS.map((folder) => listFolderFilesRecursive(auth, folder).then((result) => ({ folder, ...result }))));
    const normalizedAssets = scanResults.flatMap((result) => result.files).map(({ file, folder }) => normalizeAsset(file, folder));
    const dedupedAssets = Array.from(new Map(normalizedAssets.map((asset) => [asset.drive_file_id, asset])).values());
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
          connector_name: tokenResult.connectorName || null,
          used_api_key: Boolean(apiKey && !tokenResult.accessToken),
          summary,
          folders: DRIVE_FOLDERS.map((folder) => folder.id),
          folder_diagnostics: scanResults.map((result) => ({
            folder_id: result.folder.id,
            folder_name: result.folder.name,
            files_found: result.files.length,
            visited_folders: result.visitedFolders,
            errors: result.errors,
          })),
        },
      });
    } catch (error) {
      console.warn('Auditoria não registrada:', error?.message || error);
    }

    return Response.json({
      success: true,
      mode: saveResult.cacheAvailable ? 'drive-cache' : 'drive-direct',
      connector_name: tokenResult.connectorName || null,
      used_api_key: Boolean(apiKey && !tokenResult.accessToken),
      files: dedupedAssets,
      summary,
      total_files: dedupedAssets.length,
      saved: saveResult.saved,
      skipped: saveResult.skipped,
      folders: DRIVE_FOLDERS,
      diagnostics: {
        connector_errors: tokenResult.errors,
        save_errors: saveResult.errors || [],
        folder_diagnostics: scanResults.map((result) => ({
          folder_id: result.folder.id,
          folder_name: result.folder.name,
          files_found: result.files.length,
          visited_folders: result.visitedFolders,
          errors: result.errors,
        })),
        execution_time_ms: Date.now() - startedAt,
      },
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('syncComunicacaoVisibilidade error:', error);
    return Response.json({ success: false, files: [], summary: buildSummary([]), error: error?.message || 'Erro inesperado ao sincronizar Comunicação.' }, { status: 500 });
  }
});
