import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '@/components/auth/RequireAuth';
import LoadingPage from '@/components/common/LoadingPage';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Images, MapPin, RefreshCw, X, Filter, CheckCircle2, Moon, ExternalLink, BookImage, ChevronDown, Eye, HardDriveDownload, TriangleAlert, FileDown, Pencil, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { loadGalleryReportData } from '@/utils/galleryReportData';
import RestaurarFotosDrive from '@/components/gallery/RestaurarFotosDrive';
import SincronizarInventarioDialog from '@/components/gallery/SincronizarInventarioDialog';
import ExportarGaleriaPDFDialog from '@/components/gallery/ExportarGaleriaPDFDialog';
import { PhotoActionBar, BulkActionBar, EditCaptionDialog, DeleteConfirmDialog, EmailPhotosDialog } from '@/components/gallery/GalleryPhotoActions';
import { base44 } from '@/api/base44Client';

const INITIAL_VISIBLE_IMAGES = 60;
const VISIBLE_IMAGES_STEP = 60;
const GALLERY_CACHE_KEY = 'museus_centro_galeria_fotos_cache_v7_deduped';
const GALLERY_CACHE_TTL_MS = 10 * 60 * 1000;

const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som de Belo Horizonte',
  MUMO: 'MUMO — Museu da Moda de Belo Horizonte',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
  SEM_IDENTIFICACAO: 'Sem identificação de museu',
};

function safeText(value = '') {
  return String(value || '').toLowerCase();
}

function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
}

function clearGalleryCache() {
  try {
    // Limpa versões antigas e a atual
    ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].forEach(v => {
      localStorage.removeItem(`museus_centro_galeria_fotos_cache_${v}`);
    });
    window.localStorage.removeItem(GALLERY_CACHE_KEY);
  } catch {
    // noop
  }
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all
        ${active
          ? 'border-black bg-black text-white shadow'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
        }`}
    >
      {label}
      {active && <X className="h-3 w-3 opacity-70" />}
    </button>
  );
}

function GalleryCard({ image, onClick, eager = false, selected, onToggleSelect, onDelete, onEditCaption, selectionMode }) {
  const museuLabel = image.sectionKey !== 'SEM_IDENTIFICACAO'
    ? (image.sectionTitle || image.museu || 'Museus Centro')
    : null;
  // Prioridade: título de atividade > legenda/caption do banco > extração do nome do arquivo > nome do arquivo
  function extrairNomeAtv(fileName = '') {
    const m = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
    if (m) return m[1].replace(/_/g, ' ').trim();
    return null;
  }
  const legendaDisplay =
    image.activityTitulo ||
    image.legenda ||
    (image.fileName ? extrairNomeAtv(image.fileName) : null) ||
    image.fileName ||
    'Foto da galeria';

  return (
    <div className={`group relative overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md
      ${selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200'}`}
    >
      <PhotoActionBar
        image={image}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onDelete={onDelete}
        onEditCaption={onEditCaption}
        selectionMode={selectionMode}
      />
      <button
        type="button"
        onClick={selectionMode ? () => onToggleSelect(image) : onClick}
        className="w-full text-left"
      >
        <div className="aspect-video overflow-hidden bg-gray-100">
          <img
            src={image.fileUrl}
            alt={legendaDisplay}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(event) => {
              event.currentTarget.style.opacity = '0.2';
            }}
          />
        </div>
        <div className="space-y-1.5 p-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-black">
            {legendaDisplay}
          </p>
          <div className="space-y-0.5 text-[11px] text-gray-500">
            {museuLabel && (
              <p className="font-medium text-gray-700 truncate">{museuLabel}</p>
            )}
            {image.reportMes && (
              <p className="text-gray-500">{image.reportMes}</p>
            )}
            {image.localizacao && image.localizacao !== image.museu && image.localizacao !== 'Sem identificação' && (
              <p className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {image.localizacao}
              </p>
            )}
            {!image.localizacao && image.geoCoordinates && (
              <p className="inline-flex items-center gap-1 font-mono text-[10px] text-gray-400">
                <MapPin className="h-3 w-3" />
                {image.geoCoordinates}
              </p>
            )}
            {image.date && <p>{formatDateBR(image.date)}</p>}
          </div>
        </div>
      </button>
    </div>
  );
}

function GaleriaFotosInner() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [filterMuseu, setFilterMuseu] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_IMAGES);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showRestaurar, setShowRestaurar] = useState(false);
  const [showSincInventario, setShowSincInventario] = useState(false);
  const [showExportarPDF, setShowExportarPDF] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [deletingPhotos, setDeletingPhotos] = useState(null);
  const [emailingPhotos, setEmailingPhotos] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [editingAlbumKey, setEditingAlbumKey] = useState(null);
  const [albumLabels, setAlbumLabels] = useState({});
  const [editingAlbumValue, setEditingAlbumValue] = useState('');
  const queryClient = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['galeria-fotos-stable-v1'],
    queryFn: async () => loadGalleryReportData({
      limitAttachments: 2000,
      useCache: true,
      cacheKey: GALLERY_CACHE_KEY,
      cacheTtlMs: GALLERY_CACHE_TTL_MS,
    }),
    staleTime: GALLERY_CACHE_TTL_MS,
    cacheTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const images = Array.isArray(data?.images) ? data.images : [];

  // Chips de museu: chaves únicas presentes nos dados
  const museuOptions = useMemo(() => {
    const set = new Set();
    images.forEach((img) => { set.add(img.sectionKey || 'SEM_IDENTIFICACAO'); });
    return Array.from(set).sort();
  }, [images]);

  // Chips de período: reportMes únicos
  const periodoOptions = useMemo(() => {
    const set = new Set();
    images.forEach((img) => { if (img.reportMes) set.add(img.reportMes); });
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }, [images]);

  const filteredImages = useMemo(() => {
    const q = safeText(searchTerm).trim();
    return images.filter((image) => {
      if (!image?.fileUrl) return false;
      if (filterMuseu && (image.sectionKey || 'SEM_IDENTIFICACAO') !== filterMuseu) return false;
      if (filterPeriodo && image.reportMes !== filterPeriodo) return false;
      if (!q) return true;
      return [
        image.fileName,
        image.legenda,
        image.description,
        image.museu,
        image.sectionTitle,
        image.localizacao,
        image.geoCoordinates,
        image.reportLabel,
        image.activityTitulo,
        image.reportMes,
        image.authorName,
      ].some((value) => safeText(value).includes(q));
    });
  }, [images, searchTerm, filterMuseu, filterPeriodo]);

  const sortedImages = useMemo(() => {
    return [...filteredImages].sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.timestamp || a.date || 0) - new Date(b.timestamp || b.date || 0);
      if (sortBy === 'name-asc') return String(a.fileName || '').localeCompare(String(b.fileName || ''), 'pt-BR');
      if (sortBy === 'name-desc') return String(b.fileName || '').localeCompare(String(a.fileName || ''), 'pt-BR');
      return new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0);
    });
  }, [filteredImages, sortBy]);

  const visibleImages = sortedImages.slice(0, visibleCount);

  const groupedImages = useMemo(() => {
    const groups = new Map();
    visibleImages.forEach((image, renderIndex) => {
      const key = image.sectionKey || 'SEM_IDENTIFICACAO';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ image, renderIndex });
    });
    return Array.from(groups.entries()).map(([key, items]) => ({ key, items }));
  }, [visibleImages]);

  const selectionMode = selectedPhotos.length > 0;

  function toggleSelectPhoto(image) {
    const id = image.id || image.fileUrl;
    setSelectedPhotos(prev =>
      prev.some(p => (p.id || p.fileUrl) === id)
        ? prev.filter(p => (p.id || p.fileUrl) !== id)
        : [...prev, image]
    );
  }

  function isPhotoSelected(image) {
    const id = image.id || image.fileUrl;
    return selectedPhotos.some(p => (p.id || p.fileUrl) === id);
  }

  const hasActiveFilters = filterMuseu || filterPeriodo;

  function resetFilters() {
    setFilterMuseu('');
    setFilterPeriodo('');
    setVisibleCount(INITIAL_VISIBLE_IMAGES);
  }

  if (isLoading) {
    return (
      <LoadingPage
        message="Carregando galeria..."
        description="Buscando fotos recentes e cache local da galeria."
      />
    );
  }

  if (isError && images.length === 0) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar a galeria"
        errorDescription={error?.message || 'Atualize a página ou tente novamente em alguns instantes.'}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-10">
        {/* Cabeçalho */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight text-black">Galeria de Fotos</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-gray-700 font-semibold">{sortedImages.length} {sortedImages.length === 1 ? 'imagem única' : 'imagens únicas'}</span>
              {images.length !== sortedImages.length && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">de {images.length} total</span>
              )}
              {data?.sources && (
                <>
                  <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700">{data.sources.Attachment || 0} anexos</span>
                  <span className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-xs text-purple-700">{data.sources.ReportPhoto || 0} fotos de relatório</span>
                  {data.total && data.total > images.length && (
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700">{data.total - images.length} agrupadas</span>
                  )}
                </>
              )}
            </div>
            {data?.cacheUsed && <p className="mt-1 text-xs text-gray-400">Dados do cache local.{data?.cacheStale ? ' (cache antigo)' : ''}</p>}
            {isFetching && <p className="mt-2 text-xs text-gray-400">Atualizando galeria...</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* 1. Atualizar */}
            <button
              type="button"
              onClick={async () => { clearGalleryCache(); await refetch(); }}
              aria-label="Atualizar galeria"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>

            {/* 2. Visualizações */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Visualizações"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100 transition-colors"
                >
                  <Eye className="h-4 w-4" />
                  Visualizações
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wide">Modos de exibição</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to="/RelatorioAtividadesFotos" className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                    <span className="font-medium text-gray-900 flex items-center gap-1.5">
                      <BookImage className="h-3.5 w-3.5" /> Álbuns por Museu <ExternalLink className="h-3 w-3 opacity-50" />
                    </span>
                    <span className="text-xs text-gray-500 pl-5">Organiza fotos por equipamento cultural.</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/GaleriaNoturno" className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                    <span className="font-medium text-gray-900 flex items-center gap-1.5">
                      <Moon className="h-3.5 w-3.5" /> Galeria Noturno <ExternalLink className="h-3 w-3 opacity-50" />
                    </span>
                    <span className="text-xs text-gray-500 pl-5">Exibe somente imagens vinculadas ao Noturno.</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 3. Drive e Backup */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Drive e Backup"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100 transition-colors"
                >
                  <HardDriveDownload className="h-4 w-4" />
                  Drive e Backup
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wide">Google Drive</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setShowSincInventario(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
                >
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <HardDriveDownload className="h-3.5 w-3.5" /> Sincronizar Drive
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Envia e atualiza os arquivos da galeria no Google Drive.</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-amber-600 uppercase tracking-wide flex items-center gap-1">
                  <TriangleAlert className="h-3 w-3" /> Ação administrativa
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setShowRestaurar(v => !v)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
                >
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <HardDriveDownload className="h-3.5 w-3.5" /> Restaurar do Drive
                    {showRestaurar && <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">Ativo</span>}
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Recupera arquivos e vínculos já armazenados no Drive.</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 4. Exportar PDF */}
            <button
              type="button"
              onClick={() => setShowExportarPDF(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100 transition-colors"
            >
              <FileDown className="h-4 w-4" />
              Exportar PDF
            </button>
          </div>
        </div>

        {/* Barra de seleção em bloco */}
        <BulkActionBar
          selectedPhotos={selectedPhotos}
          onDeselectAll={() => setSelectedPhotos([])}
          onDeleteSelected={() => setDeletingPhotos(selectedPhotos)}
          onEmailSelected={() => setEmailingPhotos(selectedPhotos)}
          onCopyLinks={() => {
            const text = selectedPhotos.map((p, i) =>
              `${i + 1}. ${p.legenda || p.activityTitulo || p.fileName || 'Foto'}\n   ${p.fileUrl}`
            ).join('\n\n');
            navigator.clipboard.writeText(text);
          }}
        />

        {/* Feedback de sincronização */}
        {syncStatus && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{syncStatus}</span>
            <button type="button" onClick={() => setSyncStatus(null)} className="ml-auto text-blue-400 hover:text-blue-700"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Painel restaurar do Drive */}
        {showRestaurar && (
          <div className="mb-6">
            <RestaurarFotosDrive
              onImportConcluida={() => {
                clearGalleryCache();
                queryClient.invalidateQueries(['galeria-fotos-stable-v1']);
                refetch();
                setShowRestaurar(false);
              }}
            />
          </div>
        )}

        {/* Painel de filtros */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          {/* Busca + Ordenação */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-600">Buscar</Label>
              <Input
                placeholder="Nome, legenda, museu, local ou coordenadas..."
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setVisibleCount(INITIAL_VISIBLE_IMAGES);
                }}
                className="text-sm"
              />
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-600">Ordenar</Label>
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setVisibleCount(INITIAL_VISIBLE_IMAGES);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="recent">Mais recentes</option>
                <option value="oldest">Mais antigas</option>
                <option value="name-asc">Nome (A-Z)</option>
                <option value="name-desc">Nome (Z-A)</option>
              </select>
            </div>
          </div>

          {/* Chips — Museu */}
          {museuOptions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Museu</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {museuOptions.map((key) => (
                  <FilterChip
                    key={key}
                    label={SECTION_LABELS[key] || key}
                    active={filterMuseu === key}
                    onClick={() => {
                      setFilterMuseu(filterMuseu === key ? '' : key);
                      setVisibleCount(INITIAL_VISIBLE_IMAGES);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Chips — Período */}
          {periodoOptions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Período</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {periodoOptions.map((periodo) => (
                  <FilterChip
                    key={periodo}
                    label={periodo}
                    active={filterPeriodo === periodo}
                    onClick={() => {
                      setFilterPeriodo(filterPeriodo === periodo ? '' : periodo);
                      setVisibleCount(INITIAL_VISIBLE_IMAGES);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Limpar filtros */}
          {hasActiveFilters && (
            <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Filtros ativos:{' '}
                {filterMuseu && <span className="font-medium">{SECTION_LABELS[filterMuseu] || filterMuseu}</span>}
                {filterMuseu && filterPeriodo && ' · '}
                {filterPeriodo && <span className="font-medium">{filterPeriodo}</span>}
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-red-500 hover:underline font-medium"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {sortedImages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <Images className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="font-medium text-black">Nenhuma foto encontrada</p>
            <p className="mt-1 text-sm text-gray-500">
              {hasActiveFilters
                ? 'Nenhuma foto corresponde aos filtros selecionados. Tente limpar os filtros.'
                : 'A galeria não recebeu imagens neste carregamento. Tente atualizar novamente após alguns instantes.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            {groupedImages.map(({ key, items }) => (
              <section key={key} className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  {editingAlbumKey === key ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editingAlbumValue}
                        onChange={e => setEditingAlbumValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            setAlbumLabels(prev => ({ ...prev, [key]: editingAlbumValue }));
                            setEditingAlbumKey(null);
                          }
                          if (e.key === 'Escape') setEditingAlbumKey(null);
                        }}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-lg font-semibold text-black focus:outline-none focus:ring-2 focus:ring-black/20"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAlbumLabels(prev => ({ ...prev, [key]: editingAlbumValue }));
                          setEditingAlbumKey(null);
                        }}
                        className="rounded-lg bg-black p-1.5 text-white hover:bg-gray-800"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setEditingAlbumKey(null)} className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <h2 className="text-xl font-semibold text-black">
                        {albumLabels[key] || SECTION_LABELS[key] || key}
                      </h2>
                      <button
                        type="button"
                        title="Renomear álbum"
                        onClick={() => {
                          setEditingAlbumValue(albumLabels[key] || SECTION_LABELS[key] || key);
                          setEditingAlbumKey(key);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {items.length} {items.length === 1 ? 'foto exibida' : 'fotos exibidas'} neste bloco
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map(({ image, renderIndex }) => (
                    <GalleryCard
                      key={image.id || image.fileUrl || `${image.sourceEntity}-${image.sourceId}`}
                      image={image}
                      eager={renderIndex < 4}
                      onClick={() => setSelectedImage(image)}
                      selected={isPhotoSelected(image)}
                      onToggleSelect={toggleSelectPhoto}
                      onDelete={(img) => setDeletingPhotos([img])}
                      onEditCaption={(img) => setEditingPhoto(img)}
                      selectionMode={selectionMode}
                    />
                  ))}
                </div>
              </section>
            ))}

            {sortedImages.length > visibleCount && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => Math.min(count + VISIBLE_IMAGES_STEP, sortedImages.length))}
                  className="rounded-full border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-50"
                >
                  Carregar mais
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <EditCaptionDialog
        photo={editingPhoto}
        open={!!editingPhoto}
        onClose={() => setEditingPhoto(null)}
        onSave={() => { clearGalleryCache(); refetch(); }}
      />

      <DeleteConfirmDialog
        photos={deletingPhotos || []}
        open={!!deletingPhotos}
        onClose={() => setDeletingPhotos(null)}
        onConfirm={() => { setDeletingPhotos(null); setSelectedPhotos([]); clearGalleryCache(); refetch(); }}
      />

      <EmailPhotosDialog
        photos={emailingPhotos || []}
        open={!!emailingPhotos}
        onClose={() => setEmailingPhotos(null)}
      />

      <SincronizarInventarioDialog
        open={showSincInventario}
        onClose={() => {
          setShowSincInventario(false);
          clearGalleryCache();
          refetch();
        }}
      />

      <ExportarGaleriaPDFDialog
        open={showExportarPDF}
        onClose={() => setShowExportarPDF(false)}
        fotos={sortedImages}
        userEmail={currentUser?.email || ''}
      />

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="w-full max-w-5xl overflow-hidden border-0 bg-black p-0">
          {selectedImage && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-2 text-white hover:bg-black"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>

              <img
                src={selectedImage.fileUrl}
                alt={selectedImage.legenda || selectedImage.fileName || 'Foto da galeria'}
                className="max-h-[78vh] w-full object-contain"
              />

              <div className="space-y-2 bg-black/85 p-5 text-white">
                <p className="text-lg font-semibold leading-snug">
                  {selectedImage.activityTitulo || selectedImage.legenda || selectedImage.fileName || 'Foto da galeria'}
                </p>
                {selectedImage.activityTitulo && selectedImage.legenda && selectedImage.legenda !== selectedImage.activityTitulo && (
                  <p className="text-sm text-white/75">{selectedImage.legenda}</p>
                )}
                {selectedImage.description && selectedImage.description !== selectedImage.legenda && (
                  <p className="text-sm text-white/60">{selectedImage.description}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-white/70">
                  {selectedImage.sectionKey !== 'SEM_IDENTIFICACAO' && (
                    <span className="font-medium text-white/90">{selectedImage.sectionTitle || selectedImage.museu}</span>
                  )}
                  {selectedImage.reportMes && <span>{selectedImage.reportMes}</span>}
                  {selectedImage.localizacao && selectedImage.localizacao !== selectedImage.museu && <span>{selectedImage.localizacao}</span>}
                  {selectedImage.geoCoordinates && <span className="font-mono">📍 {selectedImage.geoCoordinates}</span>}
                  {selectedImage.date && <span>{formatDateBR(selectedImage.date)}</span>}
                </div>
                {/* Chips clicáveis no modal para filtrar diretamente */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  {selectedImage.sectionKey && selectedImage.sectionKey !== 'SEM_IDENTIFICACAO' && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterMuseu(selectedImage.sectionKey);
                        setSelectedImage(null);
                        setVisibleCount(INITIAL_VISIBLE_IMAGES);
                      }}
                      className="rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/20"
                    >
                      🏛 Filtrar por museu
                    </button>
                  )}
                  {selectedImage.reportMes && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterPeriodo(selectedImage.reportMes);
                        setSelectedImage(null);
                        setVisibleCount(INITIAL_VISIBLE_IMAGES);
                      }}
                      className="rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/20"
                    >
                      📅 Filtrar por período
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GaleriaFotos() {
  return (
    <RequireAuth>
      <GaleriaFotosInner />
    </RequireAuth>
  );
}