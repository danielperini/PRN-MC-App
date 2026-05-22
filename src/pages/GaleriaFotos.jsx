import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '@/components/auth/RequireAuth';
import LoadingPage from '@/components/common/LoadingPage';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Images, MapPin, RefreshCw, X } from 'lucide-react';
import { loadGalleryReportData } from '@/utils/galleryReportData';

const INITIAL_VISIBLE_IMAGES = 36;
const VISIBLE_IMAGES_STEP = 36;
const GALLERY_CACHE_KEY = 'museus_centro_galeria_fotos_cache_v2';
const GALLERY_CACHE_TTL_MS = 10 * 60 * 1000;

const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som de Belo Horizonte',
  MUMO: 'MUMO — Museu da Moda de Belo Horizonte',
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
    window.localStorage.removeItem(GALLERY_CACHE_KEY);
  } catch {
    // noop
  }
}

function GalleryCard({ image, onClick, eager = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-square overflow-hidden bg-gray-100">
        <img
          src={image.fileUrl}
          alt={image.legenda || image.fileName || 'Foto da galeria'}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={(event) => {
            event.currentTarget.style.opacity = '0.2';
          }}
        />
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-black">
          {image.legenda || image.fileName || 'Foto da galeria'}
        </p>
        <div className="space-y-1 text-[11px] text-gray-500">
          <p className="font-medium text-gray-700">{image.museu || image.sectionKey || 'Museus Centro'}</p>
          {image.localizacao && (
            <p className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {image.localizacao}
            </p>
          )}
          {image.date && <p>{formatDateBR(image.date)}</p>}
        </div>
      </div>
    </button>
  );
}

function GaleriaFotosInner() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_IMAGES);
  const [selectedImage, setSelectedImage] = useState(null);

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
      limitMedia: 120,
      limitAttachments: 180,
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

  const filteredImages = useMemo(() => {
    const q = safeText(searchTerm).trim();
    const base = images.filter((image) => image?.fileUrl);
    if (!q) return base;

    return base.filter((image) => [
      image.fileName,
      image.legenda,
      image.description,
      image.museu,
      image.sectionTitle,
      image.localizacao,
      image.geoCoordinates,
      image.reportLabel,
    ].some((value) => safeText(value).includes(q)));
  }, [images, searchTerm]);

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
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight text-black">Galeria de Fotos</h1>
            <p className="text-gray-600">
              {sortedImages.length} {sortedImages.length === 1 ? 'imagem encontrada' : 'imagens encontradas'}.
              {data?.cacheUsed ? ' Dados carregados do cache local.' : ''}
              {data?.cacheStale ? ' Cache antigo usado para evitar tela vazia.' : ''}
            </p>
            {isFetching && <p className="mt-2 text-xs text-gray-400">Atualizando galeria...</p>}
          </div>

          <button
            type="button"
            onClick={async () => {
              clearGalleryCache();
              await refetch();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar galeria
          </button>
        </div>

        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
        </div>

        {sortedImages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <Images className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="font-medium text-black">Nenhuma foto encontrada</p>
            <p className="mt-1 text-sm text-gray-500">
              A galeria não recebeu imagens da MediaLibrary/Attachment neste carregamento. Tente atualizar novamente após alguns instantes.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {groupedImages.map(({ key, items }) => (
              <section key={key} className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-xl font-semibold text-black">
                    {SECTION_LABELS[key] || key}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {items.length} {items.length === 1 ? 'foto exibida' : 'fotos exibidas'} neste bloco
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map(({ image, renderIndex }) => (
                    <GalleryCard
                      key={image.id || image.fileUrl}
                      image={image}
                      eager={renderIndex < 4}
                      onClick={() => setSelectedImage(image)}
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
                  {selectedImage.legenda || selectedImage.fileName || 'Foto da galeria'}
                </p>
                {selectedImage.description && (
                  <p className="text-sm text-white/75">{selectedImage.description}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-white/70">
                  <span>{selectedImage.museu || selectedImage.sectionKey || 'Museus Centro'}</span>
                  {selectedImage.localizacao && <span>{selectedImage.localizacao}</span>}
                  {selectedImage.geoCoordinates && <span>Lat/Lon: {selectedImage.geoCoordinates}</span>}
                  {selectedImage.date && <span>{formatDateBR(selectedImage.date)}</span>}
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
