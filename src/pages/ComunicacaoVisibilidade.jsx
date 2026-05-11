import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Search,
  Image,
  Newspaper,
  Megaphone,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';

const FOLDER_IDS = {
  RELEASES_CLIPPING: '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
  IMAGENS: '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
  REDES_SOCIAIS: '1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
};

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut';

const DRIVE_FOLDERS = [
  {
    id: FOLDER_IDS.RELEASES_CLIPPING,
    rootKey: 'RELEASES_CLIPPING',
    name: 'Releases e Clipping',
    url: 'https://drive.google.com/drive/folders/1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    defaultCategory: 'RELEASE',
  },
  {
    id: FOLDER_IDS.IMAGENS,
    rootKey: 'IMAGENS',
    name: 'Imagens',
    url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    defaultCategory: 'FOTOGRAFIA',
  },
  {
    id: FOLDER_IDS.REDES_SOCIAIS,
    rootKey: 'REDES_SOCIAIS',
    name: 'Redes Sociais',
    url: 'https://drive.google.com/drive/folders/1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    defaultCategory: 'POSTS',
  },
];

const SUMMARY_CARDS = [
  {
    key: 'RELEASES',
    summaryKey: 'releases',
    label: 'Releases',
    icon: Megaphone,
    folderId: FOLDER_IDS.RELEASES_CLIPPING,
    categories: ['RELEASE'],
    folderTerms: ['releases e clipping', 'release', 'releases', 'nota'],
  },
  {
    key: 'IMAGENS',
    summaryKey: 'imagens',
    label: 'Imagens',
    icon: Image,
    folderId: FOLDER_IDS.IMAGENS,
    categories: ['FOTOGRAFIA'],
    folderTerms: ['imagens', 'imagem', 'foto', 'fotos', 'fotografia'],
  },
  {
    key: 'CLIPPING',
    summaryKey: 'clipping',
    label: 'Clipping',
    icon: FolderOpen,
    folderId: FOLDER_IDS.RELEASES_CLIPPING,
    categories: ['CLIPPING'],
    folderTerms: ['releases e clipping', 'clipping', 'clipagem', 'imprensa', 'materia', 'jornal', 'noticia'],
  },
  {
    key: 'POSTS',
    summaryKey: 'posts',
    label: 'Posts',
    icon: Newspaper,
    folderId: FOLDER_IDS.REDES_SOCIAIS,
    categories: ['POSTS'],
    folderTerms: ['redes sociais', 'posts', 'post', 'social', 'instagram', 'facebook'],
  },
];

const CATEGORIES = [
  { key: 'RELEASE', label: 'Releases' },
  { key: 'FOTOGRAFIA', label: 'Imagens' },
  { key: 'CLIPPING', label: 'Clipping' },
  { key: 'POSTS', label: 'Posts' },
];

const ZERO_SUMMARY = {
  releases: 0,
  imagens: 0,
  clipping: 0,
  posts: 0,
};

const STATIC_ITEMS = DRIVE_FOLDERS.map((folder) => ({
  id: folder.id,
  name: folder.name,
  month: 'Pastas sincronizadas',
  category: folder.defaultCategory,
  typeLabel: folder.name,
  url: folder.url,
  sourceFolderName: folder.name,
  sourceFolderId: folder.id,
  sourceFolderPath: folder.name,
  driveRootFolderId: folder.id,
  driveRootFolderKey: folder.rootKey,
  isFolderShortcut: true,
}));

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function inferCategory(name = '', mimeType = '', defaultCategory = 'RELEASE', folderPath = '', rootKey = '') {
  const text = normalizeText(`${folderPath} ${name} ${mimeType}`);

  if (rootKey === 'IMAGENS') return 'FOTOGRAFIA';
  if (rootKey === 'REDES_SOCIAIS') return 'POSTS';

  if (rootKey === 'RELEASES_CLIPPING') {
    if (
      text.includes('clipping') ||
      text.includes('clipagem') ||
      text.includes('imprensa') ||
      text.includes('jornal') ||
      text.includes('materia') ||
      text.includes('noticia')
    ) {
      return 'CLIPPING';
    }

    return 'RELEASE';
  }

  if (
    text.includes('clipping') ||
    text.includes('clipagem') ||
    text.includes('imprensa') ||
    text.includes('jornal') ||
    text.includes('materia') ||
    text.includes('noticia')
  ) {
    return 'CLIPPING';
  }

  if (
    text.includes('post') ||
    text.includes('instagram') ||
    text.includes('facebook') ||
    text.includes('cards') ||
    text.includes('social') ||
    text.includes('redes')
  ) {
    return 'POSTS';
  }

  if (
    text.includes('foto') ||
    text.includes('fotografia') ||
    text.includes('imagem') ||
    text.includes('imagens') ||
    String(mimeType).startsWith('image/')
  ) {
    return 'FOTOGRAFIA';
  }

  if (
    text.includes('release') ||
    text.includes('relise') ||
    text.includes('assessoria') ||
    text.includes('nota')
  ) {
    return 'RELEASE';
  }

  return defaultCategory;
}

function formatMonth(value) {
  if (!value) return 'Sem data informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data informada';
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getCategoryLabel(category) {
  return CATEGORIES.find((item) => item.key === category)?.label || 'Arquivo';
}

function getKnownFolderById(folderId) {
  return DRIVE_FOLDERS.find((folder) => folder.id === folderId) || null;
}

function normalizeDriveFile(file, sourceFolder) {
  const rawName = file.name || file.nome || 'Arquivo sem nome';
  const rawMimeType = file.mimeType || file.mime_type || '';
  const rootFolderId = file.drive_root_folder_id || file.driveRootFolderId || sourceFolder?.id || file.sourceFolderId || file.drive_folder_id || '';
  const knownFolder = sourceFolder || getKnownFolderById(rootFolderId);
  const folderId = file.sourceFolderId || file.drive_folder_id || file.drive_parent_folder_id || rootFolderId;
  const folderName = knownFolder?.name || file.sourceFolderName || file.drive_folder_name || 'Google Drive';
  const folderPath = sourceFolder?.path || file.sourceFolderPath || file.drive_parent_folder_path || folderName;
  const rootKey = file.drive_root_folder_key || file.driveRootFolderKey || knownFolder?.rootKey || '';
  const category = file.category || file.tipo || inferCategory(rawName, rawMimeType, knownFolder?.defaultCategory, folderPath, rootKey);
  const createdTime = file.createdTime || file.criado_em_drive || file.created_date || file.modifiedTime || file.atualizado_em_drive || null;
  const fileId = file.id || file.drive_file_id;

  return {
    id: fileId,
    name: rawName,
    month: file.month || file.mes || formatMonth(createdTime),
    category,
    typeLabel: file.typeLabel || getCategoryLabel(category),
    createdTime: file.createdTime || file.criado_em_drive || null,
    modifiedTime: file.modifiedTime || file.atualizado_em_drive || null,
    mimeType: rawMimeType,
    thumbnail: file.thumbnail || file.thumbnailLink || file.thumbnail_link || '',
    url: file.webViewLink || file.url || file.link || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : ''),
    sourceFolderName: folderName,
    sourceFolderId: rootFolderId || folderId,
    sourceFolderPath: folderPath,
    driveRootFolderId: rootFolderId || folderId,
    driveRootFolderKey: rootKey,
    isFolderShortcut: false,
  };
}

function fileBelongsToSummaryCard(file, card) {
  if (!file || file.isFolderShortcut) return false;
  if (!card.categories.includes(file.category)) return false;

  if (file.sourceFolderId === card.folderId || file.driveRootFolderId === card.folderId) return true;

  const searchableFolderText = normalizeText([
    file.sourceFolderName,
    file.sourceFolderPath,
    file.drive_folder_name,
    file.drive_parent_folder_path,
    file.name,
  ].filter(Boolean).join(' '));

  return card.folderTerms.some((term) => searchableFolderText.includes(normalizeText(term)));
}

function buildLocalSummary(files = []) {
  const actualFiles = files.filter((file) => !file.isFolderShortcut);

  return {
    releases: actualFiles.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[0])).length,
    imagens: actualFiles.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[1])).length,
    clipping: actualFiles.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[2])).length,
    posts: actualFiles.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[3])).length,
  };
}

function normalizeSummary(summary) {
  if (!summary || typeof summary !== 'object') return ZERO_SUMMARY;

  return {
    releases: Number(summary.releases || summary.RELEASES || 0),
    imagens: Number(summary.imagens || summary.images || summary.FOTOGRAFIA || 0),
    clipping: Number(summary.clipping || summary.CLIPPING || 0),
    posts: Number(summary.posts || summary.POSTS || 0),
  };
}

function extractPayload(response) {
  return response?.data?.data || response?.data || response?.response || response?.result || response || {};
}

function extractFilesFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.files)) return payload.files;
  if (Array.isArray(payload?.data?.files)) return payload.data.files;
  if (Array.isArray(payload?.result?.files)) return payload.result.files;
  return [];
}

function extractSummaryFromPayload(payload) {
  return normalizeSummary(payload?.summary || payload?.data?.summary || payload?.result?.summary || null);
}

async function listDirectChildrenByApiKey(folderId) {
  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return [];

  const files = [];
  let pageToken = '';

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink,shortcutDetails)');
    const pageTokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&key=${apiKey}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true${pageTokenParam}`;

    const response = await fetch(url);
    if (!response.ok) return files;
    const payload = await response.json();
    files.push(...(Array.isArray(payload.files) ? payload.files : []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return files;
}

async function fetchFolderFilesRecursive(folder) {
  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return [];

  const result = [];
  const queue = [{ id: folder.id, path: folder.name }];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);

    const children = await listDirectChildrenByApiKey(current.id);

    for (const child of children) {
      if (child.mimeType === FOLDER_MIME_TYPE) {
        queue.push({ id: child.id, path: `${current.path} / ${child.name}` });
      } else if (child.mimeType === SHORTCUT_MIME_TYPE && child.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE && child.shortcutDetails?.targetId) {
        queue.push({ id: child.shortcutDetails.targetId, path: `${current.path} / ${child.name}` });
      } else {
        result.push(normalizeDriveFile(child, { ...folder, path: current.path }));
      }
    }
  }

  return result;
}

async function syncViaBase44Function(action = 'sync') {
  const response = await base44.functions.invoke('syncComunicacaoVisibilidade', { action });
  const payload = extractPayload(response);
  const files = extractFilesFromPayload(payload).map((file) => normalizeDriveFile(file));
  const summary = extractSummaryFromPayload(payload);

  return {
    files,
    summary: Object.values(summary).some((value) => Number(value || 0) > 0)
      ? summary
      : buildLocalSummary(files),
  };
}

async function syncViaEntityCache() {
  const entity = base44.entities?.CommunicationAsset;
  if (!entity) return { files: [], summary: ZERO_SUMMARY };

  const cached = await entity.list('-criado_em_drive', 5000);
  const files = Array.isArray(cached) ? cached.map((file) => normalizeDriveFile(file)) : [];

  return {
    files,
    summary: buildLocalSummary(files),
  };
}

export default function ComunicacaoVisibilidade() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('TODOS');
  const [items, setItems] = useState(STATIC_ITEMS);
  const [summary, setSummary] = useState(ZERO_SUMMARY);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncMessage, setSyncMessage] = useState('Carregando acervo de comunicação...');

  const actualItems = useMemo(() => {
    return items.filter((item) => !item.isFolderShortcut);
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());

    return actualItems.filter((item) => {
      const matchesCategory = category === 'TODOS' || item.category === category;
      const searchable = normalizeText([
        item.name,
        item.typeLabel,
        item.month,
        item.sourceFolderName,
        item.sourceFolderPath,
      ].filter(Boolean).join(' '));
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [actualItems, query, category]);

  const groupedByMonth = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const month = item.month || 'Sem data informada';
      if (!acc[month]) acc[month] = [];
      acc[month].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const totals = useMemo(() => {
    const localSummary = buildLocalSummary(actualItems);
    const effectiveSummary = {
      releases: Math.max(Number(summary.releases || 0), localSummary.releases),
      imagens: Math.max(Number(summary.imagens || 0), localSummary.imagens),
      clipping: Math.max(Number(summary.clipping || 0), localSummary.clipping),
      posts: Math.max(Number(summary.posts || 0), localSummary.posts),
    };

    return SUMMARY_CARDS.map((card) => ({
      ...card,
      total: effectiveSummary[card.summaryKey] || 0,
    }));
  }, [actualItems, summary]);

  async function runSync({ silent = false, preferCache = false } = {}) {
    if (isSyncing) return;

    setIsSyncing(true);
    if (!silent) setSyncMessage('Sincronizando arquivos do Google Drive...');

    try {
      let mergedFiles = [];
      let nextSummary = ZERO_SUMMARY;
      let syncMode = preferCache ? 'cache' : 'Base44 Function';

      try {
        const result = await syncViaBase44Function(preferCache ? 'list-cache' : 'sync');
        mergedFiles = result.files;
        nextSummary = result.summary;
      } catch (functionError) {
        console.warn('Function syncComunicacaoVisibilidade indisponível.', functionError);
      }

      if (mergedFiles.length === 0) {
        try {
          const entityResult = await syncViaEntityCache();
          mergedFiles = entityResult.files;
          nextSummary = entityResult.summary;
          if (mergedFiles.length > 0) syncMode = 'CommunicationAsset';
        } catch (entityError) {
          console.warn('Entity CommunicationAsset indisponível.', entityError);
        }
      }

      if (mergedFiles.length === 0 && !preferCache) {
        const filesByFolder = await Promise.all(DRIVE_FOLDERS.map(fetchFolderFilesRecursive));
        mergedFiles = filesByFolder.flat();
        nextSummary = buildLocalSummary(mergedFiles);
        if (mergedFiles.length > 0) syncMode = 'API key';
      }

      if (mergedFiles.length === 0 && preferCache) {
        const result = await syncViaBase44Function('sync').catch(() => ({ files: [], summary: ZERO_SUMMARY }));
        mergedFiles = result.files;
        nextSummary = result.summary;
        if (mergedFiles.length > 0) syncMode = 'Base44 Function';
      }

      const totalFromSummary = Object.values(nextSummary).reduce((acc, value) => acc + Number(value || 0), 0);

      if (mergedFiles.length === 0 && totalFromSummary === 0) {
        setItems(STATIC_ITEMS);
        setSummary(ZERO_SUMMARY);
        setSyncMessage('Pastas disponíveis. A sincronização não retornou arquivos. Verifique permissão do conector Google Drive e VITE_GOOGLE_DRIVE_API_KEY.');
      } else {
        setItems(mergedFiles.length > 0 ? mergedFiles : STATIC_ITEMS);
        setSummary(nextSummary);
        setSyncMessage(`${mergedFiles.length || totalFromSummary} arquivo(s) analisado(s) via ${syncMode}. Releases: ${nextSummary.releases}; Clipping: ${nextSummary.clipping}; Imagens: ${nextSummary.imagens}; Posts: ${nextSummary.posts}.`);
      }

      setLastSync(new Date());
    } catch (error) {
      console.error('Erro ao sincronizar Comunicação:', error);
      setItems(STATIC_ITEMS);
      setSummary(ZERO_SUMMARY);
      setSyncMessage('Não foi possível listar os arquivos automaticamente. Verifique o conector Google Drive e as permissões das pastas.');
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    runSync({ silent: true, preferCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <FolderOpen className="w-4 h-4" />
            <span>Acervo público de comunicação</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Comunicação</h1>

          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Área de consulta para releases, clipping, imagens, posts e materiais de redes sociais organizados por mês.
          </p>
        </div>

        <Button
          onClick={() => runSync({ silent: false, preferCache: false })}
          type="button"
          className="bg-slate-900 hover:bg-slate-800 text-white gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {totals.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key} className="border-slate-200 bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="text-2xl font-bold text-slate-900">{item.total}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-slate-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome, mês, tipo ou pasta..."
                className="pl-9"
              />
            </div>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="TODOS">Todos os tipos</option>
              {CATEGORIES.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              <span>{syncMessage}</span>
            </div>
            {lastSync && <span>Última sincronização: {lastSync.toLocaleString('pt-BR')}</span>}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {Object.keys(groupedByMonth).length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Nenhum arquivo encontrado para os filtros selecionados.
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedByMonth).map(([month, files]) => (
            <section key={month} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900 capitalize">{month}</h2>
                <Badge variant="outline" className="bg-white">{files.length} item(ns)</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {files.map((file) => (
                  <a
                    key={`${file.sourceFolderId}-${file.id}`}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <Card className="h-full border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm transition-all">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 mb-2">{file.typeLabel}</Badge>
                            <h3 className="font-semibold text-slate-900 truncate">{file.name}</h3>
                            <p className="text-xs text-slate-500 mt-1 truncate">{file.sourceFolderPath || file.sourceFolderName}</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        </div>

                        <div className="text-xs text-slate-500 space-y-1">
                          <p>Origem: Google Drive</p>
                          <p>Abrir arquivo</p>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
