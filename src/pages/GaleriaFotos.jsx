import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '@/components/auth/RequireAuth';
import LoadingPage from '@/components/common/LoadingPage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Images, MapPin, RefreshCw, X, Filter, CheckCircle2, Moon, ExternalLink, BookImage, ChevronDown, HardDriveDownload, TriangleAlert, FileDown, Pencil, Check, MoreVertical, Download, Calendar, Layers, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from
'@/components/ui/dropdown-menu';
import { Link } from 'react-router-dom';
import { loadGalleryReportData } from '@/utils/galleryReportData';
import RestaurarFotosDrive from '@/components/gallery/RestaurarFotosDrive';
import SincronizarInventarioDialog from '@/components/gallery/SincronizarInventarioDialog';
import ExportarGaleriaPDFDialog from '@/components/gallery/ExportarGaleriaPDFDialog';
import ExportarMuseuPDFDialog from '@/components/gallery/ExportarMuseuPDFDialog';
import PainelAjustarVinculos from '@/components/gallery/PainelAjustarVinculos';
import ModalExposicao from '@/components/gallery/ModalExposicao';
import ConsolidarFotosDriveDialog from '@/components/gallery/ConsolidarFotosDriveDialog';
import RelatorioExecutivoPDFDialog from '@/components/gallery/RelatorioExecutivoPDFDialog';
import RelatorioCompletoDialog from '@/components/gallery/RelatorioCompletoDialog';
import ReconstruirGaleriaDialog from '@/components/gallery/ReconstruirGaleriaDialog';
import Importar6PastasDialog from '@/components/gallery/Importar6PastasDialog';
import DeduplicarIAFotosDialog from '@/components/gallery/DeduplicarIAFotosDialog';
import { gerarAmostraRelatorioExecutivo } from '@/utils/exportarAmostraRelatorioExecutivo';
import ActivityChipsBar, { getAtividadeKey } from '@/components/gallery/ActivityChipsBar';
import { PhotoActionBar, BulkActionBar, EditCaptionDialog, DeleteConfirmDialog, EmailPhotosDialog } from '@/components/gallery/GalleryPhotoActions';
import { base44 } from '@/api/base44Client';
import { normalizeMuseuKey, normalizePeriodoKeys, MUSEU_OFFICIAL_ORDER, resolvePhotoCaption, normalizePeriodoForComparison } from '@/utils/galleryNormalization';

const INITIAL_VISIBLE_IMAGES = 100;
const VISIBLE_IMAGES_STEP = 100;
const MAX_FOTOS_POR_ATIVIDADE = 5;
// Inclui data do dia na chave para invalidar o cache automaticamente a cada novo dia
const TODAY = new Date().toISOString().slice(0, 10);
const GALLERY_CACHE_KEY = `museus_centro_galeria_fotos_cache_v17_resilient_${TODAY}`;
const GALLERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min para pegar fotos novas mais rápido

const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som de Belo Horizonte',
  MUMO: 'MUMO — Museu da Moda de Belo Horizonte',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBaile: 'Casa do Baíle',
  Noturno: 'Noturno nos Museus',
  MuseuEscolaArquitetura: 'Museu da Escola de Arquitetura',
  GaleriaArteUnimed: 'Galeria de Arte Centro Cultural Unimed',
  CasaRosadaGasmig: 'Casa Rosada Gasmig Minas',
  MemorialDireitosHumanos: 'Memorial dos Direitos Humanos',
  MemorialLegislativoMineiro: 'Memorial do Legislativo Mineiro',
  CentroMemoria: 'Centro de Memória',
  MuseuCabral: 'Museu Cabral',
  SEM_IDENTIFICACAO: 'Sem identificação de museu'
};

function safeText(value = '') {
  return String(value || '').toLowerCase();
}

function thumbUrl(url) {
  if (!url) return url;
  // lh3.googleusercontent.com/d/... — redimensionar para 200px
  if (url.includes('lh3.googleusercontent.com')) {
    return url.replace(/=s?\d+(-[a-z]+)*$/, '') + '=w200';
  }
  // Google Drive thumbnail com sz param (sz=w1600, sz=200, etc)
  if (url.includes('drive.google.com') && url.includes('sz=')) {
    return url.replace(/sz=w?\d+/i, 'sz=w200');
  }
  // Base44 / storage com width param
  if (url.includes('width=') || url.includes('w=')) {
    return url.replace(/width=\d+/, 'width=200').replace(/[?&]w=\d+/, (m) => m.replace(/\d+/, '200'));
  }
  return url;
}

function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
}

function clearGalleryCache() {
  try {
    // Limpa versões antigas e a atual
    ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16'].forEach((v) => {
      localStorage.removeItem(`museus_centro_galeria_fotos_cache_${v}`);
      localStorage.removeItem(`museus_centro_galeria_fotos_cache_${v}_deduped_3layers`);
      localStorage.removeItem(`museus_centro_galeria_fotos_cache_${v}_drive_thumbs_${TODAY}`);
    });
    window.localStorage.removeItem(GALLERY_CACHE_KEY);
  } catch {





    // noop
  }}function FilterChip({ label, active, onClick }) {return <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all
        ${active ?
    'border-black bg-black text-white shadow' :
    'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'}`
    }>
      
      {label}
      {active && <X className="h-3 w-3 opacity-70" />}
    </button>;

}

function GalleryCard({ image, onClick, eager = false, selected, onToggleSelect, onDelete, onEditCaption, selectionMode }) {
  const museuLabel = image.sectionKey !== 'SEM_IDENTIFICACAO' ?
  image.sectionTitle || image.museu || 'Museus Centro' :
  null;
  // Prioridade: legenda própria da foto > título de atividade > "Foto da galeria"
  // NUNCA exibir nome de arquivo como legenda — nomes de arquivo são técnicos
  const legendaDisplay = resolvePhotoCaption(image);

  return (
    <div className={`group relative overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md
      ${selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200'}`}>
      
      <PhotoActionBar
        image={image}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onDelete={onDelete}
        onEditCaption={onEditCaption}
        selectionMode={selectionMode} />
      
      <button
        type="button"
        onClick={selectionMode ? () => onToggleSelect(image) : onClick}
        className="w-full text-left">
        
        <div className="aspect-video overflow-hidden bg-gray-100">
          <img
            src={thumbUrl(image.fileUrl)}
            alt={legendaDisplay}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(event) => {
              const img = event.currentTarget;
              const tried = img.dataset.tried || '';
              const fallbacks = image.fallbackUrls || [];
              // Tenta fallbacks em sequência antes de desistir
              if (!tried) {
                img.dataset.tried = '1';
                if (fallbacks[0]) {img.src = fallbacks[0];return;}
                img.dataset.tried = '2';
              } else if (tried === '1' && fallbacks[1]) {
                img.dataset.tried = '2';
                img.src = fallbacks[1];
                return;
              } else if (tried === '2' && image.originalFileUrl) {
                img.dataset.tried = '3';
                img.src = image.originalFileUrl;
                return;
              }
              img.style.opacity = '0.15';
            }} />
          
        </div>
        <div className="space-y-1.5 p-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-black">
            {legendaDisplay}
          </p>
          <div className="space-y-0.5 text-[11px] text-gray-500">
            {museuLabel &&
            <p className="font-medium text-gray-700 truncate">{museuLabel}</p>
            }
            {image.reportMes &&
            <p className="text-gray-500">{image.reportMes}</p>
            }
            {image.localizacao && image.localizacao !== image.museu && image.localizacao !== 'Sem identificação' &&
            <p className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {image.localizacao}
              </p>
            }
            {!image.localizacao && image.geoCoordinates &&
            <p className="inline-flex items-center gap-1 font-mono text-[10px] text-gray-400">
                <MapPin className="h-3 w-3" />
                {image.geoCoordinates}
              </p>
            }
          </div>
        </div>
      </button>
    </div>);

}

function GaleriaFotosInner() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [filterMuseu, setFilterMuseu] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState('');
  const [groupMode, setGroupMode] = useState('museu'); // 'museu' | 'periodo'
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_IMAGES);
  const [showRestaurar, setShowRestaurar] = useState(false);
  const [showSincInventario, setShowSincInventario] = useState(false);
  const [showExportarPDF, setShowExportarPDF] = useState(false);
  const [showExportarMuseu, setShowExportarMuseu] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [deletingPhotos, setDeletingPhotos] = useState(null);
  const [emailingPhotos, setEmailingPhotos] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [editingAlbumKey, setEditingAlbumKey] = useState(null);
  const [albumLabels, setAlbumLabels] = useState({});
  const [editingAlbumValue, setEditingAlbumValue] = useState('');
  const [showAjustarVinculos, setShowAjustarVinculos] = useState(false);
  const [showConsolidarDrive, setShowConsolidarDrive] = useState(false);
  const [showRelatorioExecutivo, setShowRelatorioExecutivo] = useState(false);
  const [showRelatorioCompleto, setShowRelatorioCompleto] = useState(false);
  const [showReconstruir, setShowReconstruir] = useState(false);
  const [showImportar6Pastas, setShowImportar6Pastas] = useState(false);
  const [showDedupIA, setShowDedupIA] = useState(false);
  const [gerandoAmostra, setGerandoAmostra] = useState(false);
  const [progressoAmostra, setProgressoAmostra] = useState({ pct: 0, texto: '' });
  const [modoExposicao, setModoExposicao] = useState(null); // { images, startIndex }
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const captionGenerationRanRef = useRef(false);
  // Chips de atividade por seção (museu): { [sectionKey]: atividadeKey }
  const [selectedAtividade, setSelectedAtividade] = useState({});
  // Rótulos editados inline para chips de atividade, persistidos em sessionStorage
  const [atividadeLabels, setAtividadeLabels] = useState(() => {
    try {
      const raw = sessionStorage.getItem('galeria_atividade_labels');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const autoSyncRanRef = useRef(false);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['galeria-fotos-stable-v7'],
    queryFn: async () => loadGalleryReportData({
      limitAttachments: 0,
      useCache: true,
      cacheKey: GALLERY_CACHE_KEY,
      cacheTtlMs: GALLERY_CACHE_TTL_MS,
      skipDedup: true
    }),
    staleTime: GALLERY_CACHE_TTL_MS,
    cacheTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false
  });

  const totalBruto = data?.totalBruto || 0;
  const totalOcultadas = data?.totalOcultadas || 0;
  const duplicates = data?.duplicates || [];

  React.useEffect(() => {
    base44.auth.me().then((u) => setCurrentUser(u)).catch(() => {});
  }, []);

  // Sincronização automática e geração de legendas desativadas para evitar travamento
  const rawImages = Array.isArray(data?.images) ? data.images : [];

  // Normaliza sectionKey de cada foto para a chave canônica do museu
  // e normaliza reportMes para incluir ano quando possível (consolida 'Abril' e 'Abril/2026')
  const images = useMemo(() => {
    return rawImages.map((img) => {
      const canonicalKey = normalizeMuseuKey(img.sectionKey);
      // Normaliza período: se tem 'Mês' sem ano mas existe 'Mês/Ano' nos dados, usa a versão com ano
      let normalizedMes = img.reportMes;
      if (normalizedMes && !/\/\d{4}$/.test(normalizedMes) && img.ano) {
        normalizedMes = `${normalizedMes}/${img.ano}`;
      }
      if (canonicalKey === img.sectionKey && normalizedMes === img.reportMes) return img;
      return {
        ...img,
        sectionKey: canonicalKey,
        sectionTitle: SECTION_LABELS[canonicalKey] || img.sectionTitle || canonicalKey,
        museu: SECTION_LABELS[canonicalKey] ? SECTION_LABELS[canonicalKey].split(' — ')[0] : img.museu,
        reportMes: normalizedMes
      };
    });
  }, [rawImages]);

  // Chips de museu: chaves canônicas únicas presentes nos dados, na ordem oficial
  const museuOptions = useMemo(() => {
    const present = new Set();
    images.forEach((img) => {present.add(img.sectionKey || 'SEM_IDENTIFICACAO');});
    return MUSEU_OFFICIAL_ORDER.filter((key) => present.has(key));
  }, [images]);

  // Chips de período: normalizados (sem duplicatas Mês vs Mês/Ano), ordenados cronologicamente
  const periodoOptions = useMemo(() => {
    const raw = [];
    images.forEach((img) => {if (img.reportMes) raw.push(img.reportMes);});
    return normalizePeriodoKeys(raw);
  }, [images]);

  const filteredImages = useMemo(() => {
    const q = safeText(searchTerm).trim();
    return images.filter((image) => {
      if (!image?.fileUrl) return false;
      if (filterMuseu && (image.sectionKey || 'SEM_IDENTIFICACAO') !== filterMuseu) return false;
      if (filterPeriodo && normalizePeriodoForComparison(image.reportMes) !== normalizePeriodoForComparison(filterPeriodo)) return false;
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
      image.authorName].
      some((value) => safeText(value).includes(q));
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

  // Aplica limite de 5 fotos por atividade ANTES da paginação,
  // para que "Carregar mais" traga novas atividades em vez de repetir fotos da mesma.
  const limitedByActivity = useMemo(() => {
    const porAtividade = new Map();
    sortedImages.forEach((image) => {
      const atividade = getAtividadeKey(image);
      if (!porAtividade.has(atividade)) porAtividade.set(atividade, []);
      const arr = porAtividade.get(atividade);
      if (arr.length < MAX_FOTOS_POR_ATIVIDADE) arr.push(image);
    });
    return Array.from(porAtividade.values()).flat();
  }, [sortedImages]);

  const visibleImages = limitedByActivity.slice(0, visibleCount);

  const PERIODO_LABELS = useMemo(() => {
    const map = new Map();
    images.forEach((img) => {
      if (img.reportMes) {
        const ano = img.ano || img.reportAno || (img.timestamp ? new Date(img.timestamp).getFullYear() : '');
        const label = ano ? `${img.reportMes} — ${ano}` : img.reportMes;
        map.set(img.reportMes, label);
      }
    });
    return map;
  }, [images]);

  const groupedImages = useMemo(() => {
    const groups = new Map();
    visibleImages.forEach((image, renderIndex) => {
      let key;
      if (groupMode === 'periodo') {
        key = image.reportMes || 'SEM_PERIODO';
      } else {
        key = image.sectionKey || 'SEM_IDENTIFICACAO';
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ image, renderIndex });
    });
    return Array.from(groups.entries()).map(([key, items]) => {
      const porAtividade = new Map();
      items.forEach((entry) => {
        const atividade = getAtividadeKey(entry.image);
        if (!porAtividade.has(atividade)) porAtividade.set(atividade, []);
        porAtividade.get(atividade).push(entry);
      });
      const allItems = Array.from(porAtividade.values()).flat();
      const filtrados = Array.from(porAtividade.values()).
      map((group) => group.slice(0, MAX_FOTOS_POR_ATIVIDADE)).
      flat();
      const selAtividade = selectedAtividade[key];
      const itemsFiltrados = selAtividade ?
      filtrados.filter((entry) => getAtividadeKey(entry.image) === selAtividade) :
      filtrados;
      const ocultadas = allItems.length - filtrados.length;
      return { key, items: itemsFiltrados, allItems, ocultadas };
    });
  }, [visibleImages, selectedAtividade, groupMode]);

  const selectionMode = selectedPhotos.length > 0;

  function toggleSelectPhoto(image) {
    const id = image.id || image.fileUrl;
    setSelectedPhotos((prev) =>
    prev.some((p) => (p.id || p.fileUrl) === id) ?
    prev.filter((p) => (p.id || p.fileUrl) !== id) :
    [...prev, image]
    );
  }

  function isPhotoSelected(image) {
    const id = image.id || image.fileUrl;
    return selectedPhotos.some((p) => (p.id || p.fileUrl) === id);
  }

  async function baixarPacotesDe4() {
    if (selectedPhotos.length === 0) return;
    const pacotes = [];
    for (let i = 0; i < selectedPhotos.length; i += 4) {
      pacotes.push(selectedPhotos.slice(i, i + 4));
    }
    toast.info(`Baixando ${pacotes.length} ${pacotes.length === 1 ? 'pacote' : 'pacotes'} de 4 fotos...`);
    for (let p = 0; p < pacotes.length; p++) {
      const lote = pacotes[p];
      const zipName = `pacote_fotos_${p + 1}_de_${pacotes.length}`;
      const links = lote.map((photo, i) =>
      `${i + 1}. ${photo.legenda || photo.activityTitulo || photo.fileName || 'Foto'}\n   ${photo.fileUrl}`
      ).join('\n\n');
      const blob = new Blob([links], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      // Pequeno intervalo entre downloads para não bloquear o browser
      if (p < pacotes.length - 1) await new Promise((r) => setTimeout(r, 500));
    }
    toast.success(`${pacotes.length} ${pacotes.length === 1 ? 'pacote baixado' : 'pacotes baixados'}!`);
  }

  const hasActiveFilters = filterMuseu || filterPeriodo;

  function resetFilters() {
    setFilterMuseu('');
    setFilterPeriodo('');
    setVisibleCount(INITIAL_VISIBLE_IMAGES);
    setSelectedAtividade({});
  }

  if (isLoading) {
    return (
      <LoadingPage
        message="Carregando galeria..."
        description="Buscando fotos recentes e cache local da galeria." />);


  }

  if (isError && images.length === 0) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar a galeria"
        errorDescription={error?.message || 'Atualize a página ou tente novamente em alguns instantes.'} />);


  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-10">
        {/* Cabeçalho */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight text-black">Galeria de Fotos</h1>
            













            
            {totalBruto > 0 && totalOcultadas > 0 &&
            <p className="mt-1 text-xs text-gray-400">
                {totalBruto} fotos encontradas · {totalBruto - totalOcultadas} exibidas após deduplicação
              </p>
            }
            {totalBruto > 0 && totalOcultadas === 0 &&
            <p className="mt-1 text-xs text-gray-400">{totalBruto} fotos na galeria</p>
            }
            {data?.cacheUsed && !data?.cacheStale && <p className="mt-1 text-xs text-gray-400">Dados do cache local.</p>}
            {data?.cacheStale &&
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                <TriangleAlert className="h-3.5 w-3.5" />
                <span>Exibindo fotos do cache anterior — clique em atualizar para recarregar</span>
              </div>
            }
            {isAutoSyncing &&
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-blue-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Sincronizando com o Drive...
              </p>
            }
            {isFetching && !isAutoSyncing && <p className="mt-2 text-xs text-gray-400">Atualizando galeria...</p>}
            {isGeneratingCaptions &&
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Gerando legendas automáticas...
              </p>
            }
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Exportar PDF (dropdown) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100 transition-colors">
                  <FileDown className="h-4 w-4" />
                  Exportar PDF
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onClick={() => setShowExportarPDF(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <FileDown className="h-3.5 w-3.5" /> Galeria completa
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Gera um PDF com todas as fotos de todos os museus.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowExportarMuseu(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <BookImage className="h-3.5 w-3.5" /> PDF por Museu
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Gera um PDF individual para um museu específico.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowRelatorioExecutivo(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <BookImage className="h-3.5 w-3.5" /> Relatório Executivo de Fotos
                  </span>
                  <span className="text-xs text-gray-500 pl-5">PDF com até 5 fotos por atividade física do mês, em grade de 4 fotos/página.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowRelatorioCompleto(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> Relatório Consolidado por Museu/Equipe
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Consolida todas as atividades e fotos, agrupadas por museu e equipe, em um único PDF.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={gerandoAmostra}
                  onClick={async () => {
                    setGerandoAmostra(true);
                    setProgressoAmostra({ pct: 0, texto: 'Iniciando...' });
                    try {
                      const res = await gerarAmostraRelatorioExecutivo('MHAB', 'Abril', 2026, {
                        onProgresso: (pct, texto) => setProgressoAmostra({ pct, texto })
                      });
                      toast.success(`Amostra gerada! ${res.totalFotos} fotos em ${res.totalAtividades} atividades.`);
                    } catch (e) {
                      toast.error('Erro ao gerar amostra: ' + (e.message || 'tente novamente.'));
                    } finally {
                      setGerandoAmostra(false);
                      setProgressoAmostra({ pct: 0, texto: '' });
                    }
                  }}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    {gerandoAmostra ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    Gerar Amostra (MHAB · Abr/2026)
                  </span>
                  <span className="text-xs text-gray-500 pl-5">
                    {gerandoAmostra ? `${progressoAmostra.texto} (${progressoAmostra.pct}%)` : 'Gera um PDF de exemplo para validar layout, timbre e legendas.'}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 2. Menu ⋮ de ações */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais ações"
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-100 transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wide">Visualizações</DropdownMenuLabel>
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
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wide">Ações</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={async () => {clearGalleryCache();await refetch();}}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Atualizar galeria
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Limpa o cache e recarrega todas as fotos.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowSincInventario(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <HardDriveDownload className="h-3.5 w-3.5" /> Forçar sincronização com Drive
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Envia e atualiza os arquivos da galeria no Google Drive.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowConsolidarDrive(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <HardDriveDownload className="h-3.5 w-3.5" /> Consolidar Fotos do Drive
                    {duplicates.length > 0 &&
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        {duplicates.length}
                      </span>
                    }
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Importa fotos de pastas avulsas, gera legendas por IA e organiza na galeria.</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-amber-600 uppercase tracking-wide flex items-center gap-1">
                  <TriangleAlert className="h-3 w-3" /> Ação administrativa
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setShowRestaurar((v) => !v)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-gray-900 flex items-center gap-1.5">
                    <HardDriveDownload className="h-3.5 w-3.5" /> Restaurar do Drive
                    {showRestaurar && <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">Ativo</span>}
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Recupera arquivos e vínculos já armazenados no Drive.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowImportar6Pastas(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-blue-600 flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Importar 6 Pastas do Drive
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Escaneia 6 pastas recursivamente (máx 5 fotos por subpasta) e importa para a galeria.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDedupIA(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-violet-600 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Deduplicação por IA
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Analisa fotos por atividade com IA visual e oculta duplicatas, mantendo apenas a melhor.</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowReconstruir(true)}
                  className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                  <span className="font-medium text-red-600 flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Reconstruir Galeria do Zero
                  </span>
                  <span className="text-xs text-gray-500 pl-5">Apaga tudo e reimporta das pastas do Drive, com IA para fotos do MIS.</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
          onDownloadBatch={baixarPacotesDe4} />

        {/* Banner de duplicatas detectadas */}
        {duplicates.length > 0 && !showAjustarVinculos &&
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>{duplicates.length}</strong> {duplicates.length === 1 ? 'foto duplicada detectada' : 'fotos duplicadas detectadas'}
            </span>
            <button
            type="button"
            onClick={() => setShowAjustarVinculos(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-200 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-300 transition-colors">
              Revisar
            </button>
          </div>
        }
        

        {/* Feedback de sincronização */}
        {syncStatus &&
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{syncStatus}</span>
            <button type="button" onClick={() => setSyncStatus(null)} className="ml-auto text-blue-400 hover:text-blue-700"><X className="h-4 w-4" /></button>
          </div>
        }

        {/* Painel restaurar do Drive */}
        {showRestaurar &&
        <div className="mb-6">
            <RestaurarFotosDrive
            onImportConcluida={() => {
              clearGalleryCache();
              queryClient.invalidateQueries(['galeria-fotos-stable-v7']);
              refetch();
              setShowRestaurar(false);
            }} />
          
          </div>
        }

        {/* Painel de filtros */}
        

































































































































        

        {sortedImages.length === 0 ?
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <Images className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="font-medium text-black">Nenhuma foto encontrada</p>
            <p className="mt-1 text-sm text-gray-500">
              {hasActiveFilters ?
            'Nenhuma foto corresponde aos filtros selecionados. Tente limpar os filtros.' :
            'A galeria não recebeu imagens neste carregamento. Tente atualizar novamente após alguns instantes.'}
            </p>
            {hasActiveFilters &&
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            
                Limpar filtros
              </button>
          }
          </div> :

        <div className="space-y-10">
            {groupedImages.map(({ key, items, allItems, ocultadas }) => null











































































































          )}

            {limitedByActivity.length > visibleCount &&
          <div className="flex justify-center pt-2 pb-4">
                 <button
              type="button"
              onClick={() => {
                setVisibleCount((count) => Math.min(count + VISIBLE_IMAGES_STEP, limitedByActivity.length));
                // Rola até as novas fotos após renderizar
                setTimeout(() => {
                  const sections = document.querySelectorAll('section');
                  if (sections.length > 0) {
                    const lastSection = sections[sections.length - 1];
                    lastSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }}
              className="rounded-full border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-50">

                   Carregar mais ({limitedByActivity.length - visibleCount} restantes)
                 </button>
               </div>
          }
          </div>
        }
      </div>

      <EditCaptionDialog
        photo={editingPhoto}
        open={!!editingPhoto}
        onClose={() => setEditingPhoto(null)}
        onSave={() => {clearGalleryCache();refetch();}} />
      

      <DeleteConfirmDialog
        photos={deletingPhotos || []}
        open={!!deletingPhotos}
        onClose={() => setDeletingPhotos(null)}
        onConfirm={() => {setDeletingPhotos(null);setSelectedPhotos([]);clearGalleryCache();refetch();}} />
      

      <EmailPhotosDialog
        photos={emailingPhotos || []}
        open={!!emailingPhotos}
        onClose={() => setEmailingPhotos(null)} />
      

      <SincronizarInventarioDialog
        open={showSincInventario}
        onClose={() => {
          setShowSincInventario(false);
          clearGalleryCache();
          refetch();
        }} />
      

      <ExportarGaleriaPDFDialog
        open={showExportarPDF}
        onClose={() => setShowExportarPDF(false)}
        fotos={sortedImages} />

      <ExportarMuseuPDFDialog
        open={showExportarMuseu}
        onClose={() => setShowExportarMuseu(false)}
        fotos={sortedImages} />

      <PainelAjustarVinculos
        open={showAjustarVinculos}
        onClose={() => setShowAjustarVinculos(false)}
        duplicates={duplicates}
        onConcluido={() => {
          clearGalleryCache();
          queryClient.invalidateQueries(['galeria-fotos-stable-v7']);
          refetch();
        }} />

      <ModalExposicao
        open={!!modoExposicao}
        images={modoExposicao?.images || []}
        startIndex={modoExposicao?.startIndex || 0}
        onClose={() => setModoExposicao(null)} />

      <RelatorioExecutivoPDFDialog
        open={showRelatorioExecutivo}
        onClose={() => setShowRelatorioExecutivo(false)} />

      <RelatorioCompletoDialog
        open={showRelatorioCompleto}
        onClose={() => setShowRelatorioCompleto(false)} />

      <ReconstruirGaleriaDialog
        open={showReconstruir}
        onClose={() => {
          setShowReconstruir(false);
          clearGalleryCache();
          queryClient.invalidateQueries(['galeria-fotos-stable-v7']);
          refetch();
        }} />

      <Importar6PastasDialog
        open={showImportar6Pastas}
        onClose={() => {
          setShowImportar6Pastas(false);
          clearGalleryCache();
          queryClient.invalidateQueries(['galeria-fotos-stable-v7']);
          refetch();
        }} />

      <DeduplicarIAFotosDialog
        open={showDedupIA}
        onClose={() => setShowDedupIA(false)}
        onConcluido={() => {
          clearGalleryCache();
          queryClient.invalidateQueries(['galeria-fotos-stable-v7']);
          refetch();
        }} />

      <ConsolidarFotosDriveDialog
        open={showConsolidarDrive}
        onClose={() => setShowConsolidarDrive(false)}
        onConcluido={async () => {
          clearGalleryCache();
          queryClient.invalidateQueries(['galeria-fotos-stable-v7']);
          await refetch();
          // Backup automático pós-importação
          try {
            const res = await base44.functions.invoke('backupPhotosToDrive', {});
            const saved = res?.data?.total_backed_up ?? res?.data?.saved ?? 0;
            toast.success(`Backup concluído — ${saved} ${saved === 1 ? 'foto salva' : 'fotos salvas'} no Drive.`);
          } catch (e) {
            console.warn('Backup automático falhou:', e?.message);
          }
        }} />
      </div>);

}

export default function GaleriaFotos() {
  return (
    <RequireAuth>
      <GaleriaFotosInner />
    </RequireAuth>);

}