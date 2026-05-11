import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const DRIVE_FOLDERS = [
  {
    id: FOLDER_IDS.RELEASES_CLIPPING,
    name: 'Releases e Clipping',
    url: 'https://drive.google.com/drive/folders/1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    defaultCategory: 'RELEASE',
  },
  {
    id: FOLDER_IDS.IMAGENS,
    name: 'Imagens',
    url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    defaultCategory: 'FOTOGRAFIA',
  },
  {
    id: FOLDER_IDS.REDES_SOCIAIS,
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
    listTitle: 'Releases',
    listDescription: 'Documentos classificados como releases/notas dentro da pasta Releases e Clipping e suas subpastas.',
    icon: Megaphone,
    folderId: FOLDER_IDS.RELEASES_CLIPPING,
    categories: ['RELEASE'],
    folderTerms: ['releases e clipping', 'release', 'releases', 'nota'],
  },
  {
    key: 'IMAGENS',
    summaryKey: 'imagens',
    label: 'Imagens',
    listTitle: 'Imagens',
    listDescription: 'Arquivos de imagem encontrados na pasta Imagens e em todas as suas subpastas.',
    icon: Image,
    folderId: FOLDER_IDS.IMAGENS,
    categories: ['FOTOGRAFIA'],
    folderTerms: ['imagens', 'imagem', 'foto', 'fotos', 'fotografia'],
  },
  {
    key: 'CLIPPING',
    summaryKey: 'clipping',
    label: 'Clipping',
    listTitle: 'Clipping',
    listDescription: 'Matérias, PDFs, notícias e registros de imprensa dentro da pasta Releases e Clipping e suas subpastas.',
    icon: FolderOpen,
    folderId: FOLDER_IDS.RELEASES_CLIPPING,
    categories: ['CLIPPING'],
    folderTerms: ['releases e clipping', 'clipping', 'clipagem', 'imprensa', 'materia', 'jornal', 'noticia'],
  },
  {
    key: 'POSTS',
    summaryKey: 'posts',
    label: 'Posts',
    listTitle: 'Redes Sociais',
    listDescription: 'Arquivos e posts disponíveis na pasta Redes Sociais e em todas as suas subpastas.',
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
  isFolderShortcut: true,
}));

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function inferCategory(name = '', mimeType = '', defaultCategory = 'RELEASE', folderPath = '') {
  const text = normalizeText(`${folderPath} ${name} ${mimeType}`);

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

function normalizeDriveFile(file, sourceFolder) {
  const rawName = file.name || file.nome || 'Arquivo sem nome';
  const rawMimeType = file.mimeType || file.mime_type || '';
  const rootFolderId = file.drive_root_folder_id || sourceFolder?.id || file.sourceFolderId || file.drive_folder_id || '';
  const folderId = file.sourceFolderId || file.drive_folder_id || rootFolderId;
  const folderName = sourceFolder?.name || file.sourceFolderName || file.drive_folder_name || 'Google Drive';
  const folderPath = sourceFolder?.path || file.sourceFolderPath || file.drive_parent_folder_path || folderName;
  const category = file.category || file.tipo || inferCategory(rawName, rawMimeType, sourceFolder?.defaultCategory, folderPath);
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
    sourceFolderId: folderId,
    sourceFolderPath: folderPath,
    driveRootFolderId: rootFolderId,
    driveRootFolderKey: file.drive_root_folder_key || '',
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
  return {
    releases: files.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[0])).length,
    imagens: files.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[1])).length,
    clipping: files.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[2])).length,
    posts: files.filter((file) => fileBelongsToSummaryCard(file, SUMMARY_CARDS[3])).length,
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

async function fetchFolderFiles(folder) {
  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return [];

  const query = encodeURIComponent(`'${folder.id}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&key=${apiKey}&pageSize=1000&orderBy=createdTime desc`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao consultar pasta ${folder.name}`);
  const payload = await response.json();
  return Array.isArray(payload.files) ? payload.files.map((file) => normalizeDriveFile(file, folder)) : [];
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

function hasVisualPreview(file) {
  return Boolean(file.thumbnail) || String(file.mimeType || '').startsWith('image/');
}

function getFilePreview(file) {
  if (file.thumbnail) return file.thumbnail;
  return '';
}

export default function ComunicacaoVisibilidade() {
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('TODOS');
  const [activeCard, setActiveCard] = useState('TODOS');
  const [items, setItems] = useState(STATIC_ITEMS);
  const [summary, setSummary] = useState(ZERO_SUMMARY);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncMessage, setSyncMessage] = useState('Carregando acervo de comunicação...');

  const actualFiles = useMemo(() => {
    return items.filter((item) => !item.isFolderShortcut);
  }, [items]);

  const selectedCard = useMemo(() => {
    return SUMMARY_CARDS.find((card) => card.key === activeCard) || null;
  }, [activeCard]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());

    return actualFiles.filter((item) => {
      const matchesActiveCard = !selectedCard || fileBelongsToSummaryCard(item, selectedCard);
      const matchesCategory = category === 'TODOS' || item.category === category;
      const searchable = normalizeText([
        item.name,
        item.typeLabel,
        item.month,
        item.sourceFolderName,
        item.sourceFolderPath,
      ].filter(Boolean).join(' '));
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);

      return matchesActiveCard && matchesCategory && matchesQuery;
    });
  }, [actualFiles, query, category, selectedCard]);

  const groupedByMonthAndType = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const month = item.month || 'Sem data informada';
      const type = item.typeLabel || getCategoryLabel(item.category);
      if (!acc[month]) acc[month] = {};
      if (!acc[month][type]) acc[month][type] = [];
      acc[month][type].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const totals = useMemo(() => {
    const localSummary = buildLocalSummary(actualFiles);
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
  }, [actualFiles, summary]);

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
        console.warn('Function syncComunicacaoVisibilidade indisponível. Usando fallback por API key.', functionError);
        syncMode = 'API key';
      }

      if (mergedFiles.length === 0 && preferCache) {
        const result = await syncViaBase44Function('sync').catch(() => ({ files: [], summary: ZERO_SUMMARY }));
        mergedFiles = result.files;
        nextSummary = result.summary;
        syncMode = 'Base44 Function';
      }

      if (mergedFiles.length === 0 && !preferCache) {
        const filesByFolder = await Promise.all(DRIVE_FOLDERS.map(fetchFolderFiles));
        mergedFiles = filesByFolder.flat();
        nextSummary = buildLocalSummary(mergedFiles);
      }

      const totalFromSummary = Object.values(nextSummary).reduce((acc, value) => acc + Number(value || 0), 0);

      if (mergedFiles.length === 0 && totalFromSummary === 0) {
        setItems(STATIC_ITEMS);
        setSummary(ZERO_SUMMARY);
        setSyncMessage('Pastas disponíveis. A função não retornou arquivos nem resumo. Verifique se o conector Google Drive tem acesso às pastas compartilhadas.');
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

  function handleCardClick(cardKey) {
    setActiveCard((current) => (current === cardKey ? 'TODOS' : cardKey));
    setCategory('TODOS');

    window.setTimeout(() => {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
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

      <div className="grid grid-cols-4 gap-3 overflow-x-auto pb-1">
        {totals.map((item) => {
          const Icon = item.icon;
          const isActive = activeCard === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleCardClick(item.key)}
              className="text-left min-w-[160px]"
              aria-pressed={isActive}
            >
              <Card className={`border-slate-200 bg-white transition-all hover:border-slate-400 hover:shadow-sm ${isActive ? 'ring-2 ring-slate-900 border-slate-900' : ''}`}>
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
            </button>
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

      <div ref={listRef} className="space-y-6">
        {selectedCard && (
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedCard.listTitle}</h2>
                  <p className="text-sm text-slate-500 mt-1">{selectedCard.listDescription}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setActiveCard('TODOS')}>
                  Ver todos
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {Object.keys(groupedByMonthAndType).length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Nenhum arquivo encontrado para os filtros selecionados.
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedByMonthAndType).map(([month, types]) => (
            <section key={month} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900 capitalize">{month}</h2>
                <Badge variant="outline" className="bg-white">
                  {Object.values(types).flat().length} item(ns)
                </Badge>
              </div>

              {Object.entries(types).map(([type, files]) => (
                <div key={`${month}-${type}`} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{type}</Badge>
                    <span className="text-xs text-slate-500">{files.length} arquivo(s)</span>
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
                        <Card className="h-full border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm transition-all overflow-hidden">
                          {hasVisualPreview(file) && getFilePreview(file) && (
                            <div className="h-36 bg-slate-100 overflow-hidden">
                              <img
                                src={getFilePreview(file)}
                                alt={file.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}
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
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
