import React, { useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, RefreshCw, Search, Image, Newspaper, Megaphone, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

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
    principal: true,
    defaultCategory: 'RELEASE',
  },
  {
    id: FOLDER_IDS.IMAGENS,
    name: 'Imagens',
    url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    principal: false,
    defaultCategory: 'FOTOGRAFIA',
  },
  {
    id: FOLDER_IDS.REDES_SOCIAIS,
    name: 'Redes Sociais',
    url: 'https://drive.google.com/drive/folders/1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    principal: false,
    defaultCategory: 'POSTS',
  },
];

const SUMMARY_CARDS = [
  {
    key: 'RELEASES',
    label: 'Releases',
    icon: Megaphone,
    folderId: FOLDER_IDS.RELEASES_CLIPPING,
    categories: ['RELEASE'],
  },
  {
    key: 'IMAGENS',
    label: 'Imagens',
    icon: Image,
    folderId: FOLDER_IDS.IMAGENS,
    categories: ['FOTOGRAFIA'],
  },
  {
    key: 'CLIPPING',
    label: 'Clipping',
    icon: FolderOpen,
    folderId: FOLDER_IDS.RELEASES_CLIPPING,
    categories: ['CLIPPING'],
  },
  {
    key: 'POSTS',
    label: 'Posts',
    icon: Newspaper,
    folderId: FOLDER_IDS.REDES_SOCIAIS,
    categories: ['POSTS'],
  },
];

const CATEGORIES = [
  { key: 'RELEASE', label: 'Releases', icon: Megaphone },
  { key: 'FOTOGRAFIA', label: 'Imagens', icon: Image },
  { key: 'CLIPPING', label: 'Clipping', icon: FolderOpen },
  { key: 'POSTS', label: 'Posts', icon: Newspaper },
];

const STATIC_ITEMS = DRIVE_FOLDERS.map((folder) => ({
  id: folder.id,
  name: folder.name,
  month: 'Pastas sincronizadas',
  category: folder.defaultCategory,
  typeLabel: folder.principal ? 'Pasta principal' : 'Pasta complementar',
  createdTime: null,
  modifiedTime: null,
  url: folder.url,
  sourceFolderName: folder.name,
  sourceFolderId: folder.id,
  isFolderShortcut: true,
}));

function inferCategory(name = '', mimeType = '', defaultCategory = 'RELEASE') {
  const text = `${name} ${mimeType}`.toLowerCase();

  if (text.includes('clipping') || text.includes('clipagem') || text.includes('imprensa')) return 'CLIPPING';
  if (text.includes('post') || text.includes('instagram') || text.includes('facebook') || text.includes('cards') || text.includes('social')) return 'POSTS';
  if (text.includes('foto') || text.includes('fotografia') || text.includes('imagem') || text.startsWith('image/')) return 'FOTOGRAFIA';
  if (text.includes('release') || text.includes('relise') || text.includes('assessoria')) return 'RELEASE';

  return defaultCategory;
}

function formatMonth(value) {
  if (!value) return 'Sem data informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data informada';
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function normalizeDriveFile(file, sourceFolder) {
  const category = file.category || inferCategory(file.name, file.mimeType, sourceFolder?.defaultCategory);

  return {
    id: file.id,
    name: file.name || 'Arquivo sem nome',
    month: file.month || formatMonth(file.createdTime || file.modifiedTime),
    category,
    typeLabel: CATEGORIES.find((item) => item.key === category)?.label || 'Releases',
    createdTime: file.createdTime || null,
    modifiedTime: file.modifiedTime || null,
    mimeType: file.mimeType || '',
    url: file.webViewLink || file.url || `https://drive.google.com/file/d/${file.id}/view`,
    sourceFolderName: sourceFolder?.name || file.sourceFolderName || 'Google Drive',
    sourceFolderId: sourceFolder?.id || file.sourceFolderId || '',
    isFolderShortcut: false,
  };
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

export default function ComunicacaoVisibilidade() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('TODOS');
  const [items, setItems] = useState(STATIC_ITEMS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncMessage, setSyncMessage] = useState('Sincronização automática programada para 12:59 e 23:59.');

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory = category === 'TODOS' || item.category === category;
      const matchesQuery = !normalizedQuery || [item.name, item.typeLabel, item.month, item.sourceFolderName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [items, query, category]);

  const groupedByMonth = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const month = item.month || 'Sem data informada';
      if (!acc[month]) acc[month] = [];
      acc[month].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const totals = useMemo(() => {
    return SUMMARY_CARDS.map((card) => ({
      ...card,
      total: items.filter((file) => (
        !file.isFolderShortcut &&
        file.sourceFolderId === card.folderId &&
        card.categories.includes(file.category)
      )).length,
    }));
  }, [items]);

  async function handleSync() {
    setIsSyncing(true);
    setSyncMessage('Sincronizando arquivos do Google Drive...');

    try {
      const filesByFolder = await Promise.all(DRIVE_FOLDERS.map(fetchFolderFiles));
      const mergedFiles = filesByFolder.flat();

      if (mergedFiles.length === 0) {
        setItems(STATIC_ITEMS);
        setSyncMessage('Pastas disponíveis. Para listagem automática dos arquivos, configure VITE_GOOGLE_DRIVE_API_KEY no ambiente.');
      } else {
        setItems(mergedFiles);
        setSyncMessage(`${mergedFiles.length} arquivo(s) sincronizado(s) do Google Drive.`);
      }

      setLastSync(new Date());
    } catch (error) {
      console.error('Erro ao sincronizar Comunicação:', error);
      setItems(STATIC_ITEMS);
      setSyncMessage('Não foi possível listar os arquivos automaticamente. Os links das pastas continuam disponíveis.');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <FolderOpen className="w-4 h-4" />
            <span>Acervo público de comunicação</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Comunicação
          </h1>

          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Área de consulta para releases, clipping, imagens, posts e materiais de redes sociais organizados por mês.
          </p>
        </div>

        <Button onClick={handleSync} disabled={isSyncing} className="bg-slate-900 hover:bg-slate-800 text-white gap-2">
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
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
            {lastSync && <span>Última sincronização manual: {lastSync.toLocaleString('pt-BR')}</span>}
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
                            <p className="text-xs text-slate-500 mt-1 truncate">{file.sourceFolderName}</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        </div>

                        <div className="text-xs text-slate-500 space-y-1">
                          <p>Origem: Google Drive</p>
                          <p>{file.isFolderShortcut ? 'Abrir pasta' : 'Abrir arquivo'}</p>
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
