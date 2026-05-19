import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import LoadingPage from '@/components/common/LoadingPage';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Images,
  LinkIcon,
  MapPin,
  Sparkles,
  X
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastMessages } from '@/lib/toastMessages';
import {
  dedupePhotosByTechnicalIdentity,
  dedupePhotosByVisualSimilarity,
  getPhotoIdentity,
} from '@/utils/photoSimilarity';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'bmp', 'avif'];
const INITIAL_VISIBLE_IMAGES = 48;
const VISIBLE_IMAGES_STEP = 48;

const MUSEUM_SECTIONS = {
  MHAB: {
    key: 'MHAB',
    title: 'MHAB — Museu Histórico Abílio Barreto',
    shortTitle: 'MHAB',
    address: 'Av. Prudente de Morais, 202 — Cidade Jardim',
    coordinates: '-19.936787, -43.947651',
  },
  MIS: {
    key: 'MIS',
    title: 'MIS — Museu da Imagem e do Som de Belo Horizonte',
    shortTitle: 'MIS',
    address: 'Av. Álvares Cabral, 560 — Lourdes/Centro',
    coordinates: '-19.927057, -43.940157',
  },
  MUMO: {
    key: 'MUMO',
    title: 'MUMO — Museu da Moda de Belo Horizonte',
    shortTitle: 'MUMO',
    address: 'Rua da Bahia, 1149 — Centro',
    coordinates: '-19.924875, -43.937250',
  },
};

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO'];

function isImageByFileName(fileName = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
}

function isImageByMime(fileType = '') {
  return String(fileType).toLowerCase().startsWith('image/');
}

function normalizeDate(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function formatDateBR(value) {
  if (!value) return '';

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function readPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function firstValue(obj, paths = []) {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

function parseMetadata(item = {}) {
  const raw =
    item.metadata ||
    item.meta_data ||
    item.metadados ||
    item.exif ||
    item.image_metadata ||
    item.file_metadata ||
    {};

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  return raw && typeof raw === 'object' ? raw : {};
}

function rationalToNumber(part) {
  if (typeof part === 'number') return part;

  if (typeof part === 'string' && part.includes('/')) {
    const [a, b] = part.split('/').map(Number);
    return b ? a / b : 0;
  }

  if (Array.isArray(part) && part.length >= 2) {
    const [a, b] = part.map(Number);
    return b ? a / b : 0;
  }

  return Number(part || 0);
}

function dmsToDecimal(value) {
  if (!Array.isArray(value) || value.length < 3) return null;

  const deg = rationalToNumber(value[0]);
  const min = rationalToNumber(value[1]);
  const sec = rationalToNumber(value[2]);

  if (![deg, min, sec].every(Number.isFinite)) return null;

  return deg + min / 60 + sec / 3600;
}

function extractGeoCoordinates(item = {}) {
  const meta = parseMetadata(item);

  const latRaw =
    firstValue(item, ['latitude', 'lat', 'gps_latitude']) ||
    firstValue(meta, [
      'latitude',
      'lat',
      'gps_latitude',
      'GPSLatitude',
      'gps.GPSLatitude',
      'GPS.GPSLatitude'
    ]);

  const lngRaw =
    firstValue(item, ['longitude', 'lng', 'lon', 'gps_longitude']) ||
    firstValue(meta, [
      'longitude',
      'lng',
      'lon',
      'gps_longitude',
      'GPSLongitude',
      'gps.GPSLongitude',
      'GPS.GPSLongitude'
    ]);

  if (latRaw && lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

  const latDms = dmsToDecimal(firstValue(meta, [
    'GPSLatitude',
    'gps.GPSLatitude',
    'GPS.GPSLatitude'
  ]));

  const lngDms = dmsToDecimal(firstValue(meta, [
    'GPSLongitude',
    'gps.GPSLongitude',
    'GPS.GPSLongitude'
  ]));

  const latRef = String(firstValue(meta, [
    'GPSLatitudeRef',
    'gps.GPSLatitudeRef',
    'GPS.GPSLatitudeRef'
  ]) || '').toUpperCase();

  const lngRef = String(firstValue(meta, [
    'GPSLongitudeRef',
    'gps.GPSLongitudeRef',
    'GPS.GPSLongitudeRef'
  ]) || '').toUpperCase();

  if (latDms !== null && lngDms !== null) {
    const lat = latRef === 'S' ? -latDms : latDms;
    const lng = lngRef === 'W' ? -lngDms : lngDms;

    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  return '';
}

function extractLocation(item = {}) {
  const meta = parseMetadata(item);

  return String(
    firstValue(item, [
      'localizacao',
      'localização',
      'location',
      'cidade',
      'municipio',
      'local',
      'endereco',
      'gps_location',
      'geo_location'
    ]) ||
    firstValue(meta, [
      'localizacao',
      'localização',
      'location',
      'city',
      'cidade',
      'municipio',
      'address',
      'endereco',
      'place',
      'local',
      'gps.location',
      'GPS.location'
    ]) ||
    ''
  );
}

function extractPhotoDate(item = {}) {
  const meta = parseMetadata(item);

  return String(
    firstValue(item, ['data_foto', 'photo_date', 'taken_at', 'captured_at']) ||
    firstValue(meta, [
      'DateTimeOriginal',
      'CreateDate',
      'created_at',
      'taken_at',
      'photo_date',
      'exif.DateTimeOriginal'
    ]) ||
    ''
  );
}

function activityTitle(activity = {}) {
  return (
    activity.nome_atividade ||
    activity.nome_acao ||
    activity.titulo ||
    activity.atividade ||
    activity.acao ||
    activity.nome ||
    activity.descricao_curta ||
    ''
  );
}

function activityDate(activity = {}) {
  return (
    activity.data_realizacao ||
    activity.data_programacao ||
    activity.data_inicio ||
    activity.data ||
    activity.inicio ||
    activity.created_date ||
    ''
  );
}

function activityPlace(activity = {}) {
  return (
    activity.local ||
    activity.localizacao ||
    activity.localização ||
    activity.espaco ||
    activity.equipamento ||
    activity.museu ||
    activity.centro_custo ||
    ''
  );
}

function normalizeMuseum(value) {
  const text = normalizeText(value);

  if (!text) return '';
  if (text.includes('mhab') || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';

  return '';
}

function buildActivityMaps(reports = [], programacao = []) {
  const byId = new Map();
  const byText = [];

  const add = (activity) => {
    if (!activity) return;

    if (activity.id) {
      byId.set(String(activity.id), activity);
    }

    if (activity.title) {
      byText.push({
        key: normalizeText(activity.title),
        activity
      });
    }
  };

  (programacao || []).forEach((item) => add({
    id: item.id,
    title: activityTitle(item),
    date: activityDate(item),
    museu:
      normalizeMuseum(item.museu || item.centro_custo || item.equipamento || item.local) ||
      item.museu ||
      item.centro_custo ||
      item.equipamento ||
      '',
    local: activityPlace(item),
    source: 'Programação'
  }));

  (reports || []).forEach((report) => {
    (Array.isArray(report.atividades) ? report.atividades : []).forEach((item, idx) => {
      const activity = {
        id: item.id || item.atividade_id || item.programacao_id || `${report.id || 'report'}-${idx}`,
        title: activityTitle(item),
        date: activityDate(item) || `${report.mes_referencia || ''}/${report.ano || ''}`,
        museu:
          normalizeMuseum(item.museu || report.museu || item.centro_custo || item.local) ||
          item.museu ||
          report.museu ||
          '',
        local: activityPlace(item) || report.museu || '',
        source: report.author_name ? `Relatório — ${report.author_name}` : 'Relatório'
      };

      add(activity);

      [
        item.id,
        item.atividade_id,
        item.programacao_id,
        item.activity_id,
        item.id_programacao
      ]
        .filter(Boolean)
        .forEach((id) => byId.set(String(id), activity));
    });
  });

  return { byId, byText };
}

function resolveActivity(item = {}, maps) {
  const meta = parseMetadata(item);

  const ids = [
    item.atividade_id,
    item.activity_id,
    item.programacao_id,
    item.id_atividade,
    item.vinculo_atividade_id,
    item.linked_activity_id,
    item.report_activity_id,
    meta.atividade_id,
    meta.activity_id,
    meta.programacao_id
  ].filter(Boolean);

  for (const id of ids) {
    const found = maps.byId.get(String(id));

    if (found) return found;
  }

  const hints = [
    item.atividade_nome,
    item.nome_atividade,
    item.activity_name,
    item.titulo_atividade,
    item.atividade,
    item.legenda,
    item.descricao,
    item.description,
    item.file_name
  ]
    .filter(Boolean)
    .map(normalizeText);

  for (const hint of hints) {
    const found = maps.byText.find(({ key }) => key && (hint.includes(key) || key.includes(hint)));

    if (found?.activity) return found.activity;
  }

  return null;
}

function captionFor(item = {}, activity = null) {
  const manual = item.legenda || item.caption || item.titulo || item.title || '';

  const isMis =
    String(activity?.museu || '').toUpperCase().includes('MIS') ||
    String(activity?.local || '').toUpperCase().includes('MIS');

  const sourceText = `${manual} ${activity?.title || ''} ${item?.file_name || ''}`.toLowerCase();

  if (isMis && sourceText.includes('entrevista')) {
    return `Exposição do Traço ao Pixel · MIS · ${formatDateBR(activity?.date || item?.created_date)}`;
  }

  if (manual) return String(manual);

  if (activity?.title) {
    return [
      activity.title,
      activity.local || activity.museu || '',
      formatDateBR(activity.date)
    ].filter(Boolean).join(' · ');
  }

  return String(item.descricao || item.description || item.file_name || item.fileName || 'Foto da galeria');
}

function resolveMuseumSection({ item = {}, report = null, linkedActivity = null, metadataLocation = '' }) {
  const values = [
    item.museu,
    item.centro_custo,
    item.local,
    item.localizacao,
    item.descricao,
    item.description,
    item.legenda,
    item.file_name,
    report?.museu,
    report?.museu_secundario,
    linkedActivity?.museu,
    linkedActivity?.local,
    metadataLocation,
  ];

  for (const value of values) {
    const found = normalizeMuseum(value);

    if (found) return found;
  }

  return 'MHAB';
}

function uniqueByFileUrl(items = []) {
  return dedupePhotosByTechnicalIdentity(items);
}

function buildDuplicateGroups(items = [], visualRemoved = []) {
  const groups = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = getPhotoIdentity(item);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const technicalGroups = Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      keep: group[0],
      duplicates: group.slice(1),
      items: group,
      reason: 'identidade_tecnica',
    }));

  if (!Array.isArray(visualRemoved) || !visualRemoved.length) {
    return technicalGroups;
  }

  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    [item?.id, item?.sourceId, item?.duplicateIdentity]
      .filter(Boolean)
      .forEach((key) => byId.set(String(key), item));
  });

  const visualGroups = visualRemoved
    .map((duplicate, index) => {
      const keep = byId.get(String(duplicate.keptId)) || byId.get(String(duplicate.keptIdentity));
      const removed = byId.get(String(duplicate.removedId)) || byId.get(String(duplicate.removedIdentity));
      const itemsForGroup = [keep, removed].filter(Boolean);

      if (itemsForGroup.length < 2) return null;

      return {
        key: `visual:${duplicate.keptId || duplicate.keptIdentity}:${duplicate.removedId || duplicate.removedIdentity}:${index}`,
        count: itemsForGroup.length,
        keep: itemsForGroup[0],
        duplicates: itemsForGroup.slice(1),
        items: itemsForGroup,
        similarity: duplicate.similarity,
        reason: duplicate.reason || 'similaridade_visual',
      };
    })
    .filter(Boolean);

  return [...technicalGroups, ...visualGroups];
}

function mapPhoto(item, activityMaps, report = null, prefix = 'media') {
  const linkedActivity = resolveActivity(item, activityMaps);
  const metadataDate = extractPhotoDate(item);
  const metadataLocation = extractLocation(item);
  const metadataCoordinates = extractGeoCoordinates(item);

  const sectionKey = resolveMuseumSection({
    item,
    report,
    linkedActivity,
    metadataLocation
  });

  const section = MUSEUM_SECTIONS[sectionKey] || MUSEUM_SECTIONS.MHAB;

  const localizacao =
    metadataLocation ||
    linkedActivity?.local ||
    item.museu ||
    report?.museu ||
    section.shortTitle;

  const timestamp = normalizeDate(
    metadataDate ||
    item.created_at ||
    item.created_date ||
    item.updated_date
  );

  const mapped = {
    id: `${prefix}-${item.id}`,
    sourceEntity: prefix === 'media' ? 'MediaLibrary' : 'Attachment',
    sourceId: item.id,
    fileName: item.file_name || 'imagem',
    fileUrl: item.file_url,
    timestamp,
    date: timestamp.split('T')[0],
    reportLabel: report
      ? `${report.author_name || 'Relatório'} — ${report.mes_referencia || ''}/${report.ano || ''}`
      : item.origem === 'relatorio'
        ? 'Relatório'
        : item.origem || 'Galeria',
    description: item.descricao || item.description || '',
    legenda: captionFor(item, linkedActivity),
    museu: section.shortTitle,
    sectionKey,
    sectionTitle: section.title,
    sectionAddress: section.address,
    sectionCoordinates: section.coordinates,
    localizacao,
    metadataLocation,
    metadataCoordinates,
    geoCoordinates: metadataCoordinates || section.coordinates,
    metadataDate,
    linkedActivity,
  };
  return {
    ...mapped,
    duplicateIdentity: getPhotoIdentity(mapped),
  };
}

function PhotoCard({ image, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <img
          src={image.fileUrl}
          alt={image.legenda || image.fileName}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="p-3 space-y-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-black">
          {image.legenda || image.fileName}
        </p>

        {image.linkedActivity?.title && (
          <p className="line-clamp-1 text-xs text-gray-600 flex items-center gap-1">
            <LinkIcon className="w-3 h-3 flex-shrink-0" />
            {image.linkedActivity.title}
          </p>
        )}

        <div className="space-y-1 text-[11px] text-gray-500">
          <p className="font-medium text-gray-600">{image.museu}</p>
          <p className="font-mono text-[10px] text-gray-500">
            Lat/Lon: {image.geoCoordinates}
          </p>

          {image.localizacao && (
            <p className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {image.localizacao}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function GaleriaFotosInner() {
  const {
    user: currentUser,
    isLoading: userLoading
  } = useCurrentUser();

  const [selectedImage, setSelectedImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_IMAGES);
  const [duplicateAnalysis, setDuplicateAnalysis] = useState(null);
  const [duplicateReviewOpen, setDuplicateReviewOpen] = useState(false);
  const [isAnalyzingDuplicates, setIsAnalyzingDuplicates] = useState(false);
  const [editingImage, setEditingImage] = useState(null);
  const [editForm, setEditForm] = useState({ legenda: '', museu: '', localizacao: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const {
    data: galleryData = { images: [], duplicateGroups: [] },
    isLoading,
    isError,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['galeria-fotos-v10-visual-dedup', currentUser?.email],
    queryFn: async () => {
      const allImages = [];
      let reports = [];
      let programacao = [];

      try {
        const result = await base44.entities.Report.filter({ status: 'APPROVED' });
        reports = Array.isArray(result) ? result : [];
      } catch (error) {
        console.warn('Relatórios aprovados indisponíveis para vínculo da galeria:', error);
      }

      try {
        const result = await base44.entities.Programacao.list('-data_realizacao', 1000);
        programacao = Array.isArray(result) ? result : [];
      } catch (error) {
        console.warn('Programação indisponível para vínculo da galeria:', error);
      }

      const activityMaps = buildActivityMaps(reports, programacao);

      try {
        const media = await base44.entities.MediaLibrary.list('-created_date', 1000);

        allImages.push(
          ...(Array.isArray(media) ? media : [])
            .filter((item) => {
              const tipo = String(item?.tipo || '').toLowerCase();

              return (
                tipo === 'imagem' ||
                tipo === 'image' ||
                isImageByMime(item?.file_type) ||
                isImageByFileName(item?.file_name)
              );
            })
            .map((item) => mapPhoto(item, activityMaps, null, 'media'))
        );
      } catch (error) {
        console.warn('MediaLibrary indisponível, usando fallback de Attachment:', error);
      }

      try {
        const approvedIds = new Set(reports.map((r) => r.id));
        const attachments = await base44.entities.Attachment.list('-created_date', 1200);

        allImages.push(
          ...(Array.isArray(attachments) ? attachments : [])
            .filter(
              (att) =>
                approvedIds.has(att.report_id) &&
                (isImageByMime(att.file_type) || isImageByFileName(att.file_name))
            )
            .map((att) =>
              mapPhoto(
                att,
                activityMaps,
                reports.find((r) => r.id === att.report_id),
                'legacy'
              )
            )
        );
      } catch (error) {
        console.error('Erro ao carregar imagens legadas da galeria:', error);
        toastMessages.warning('Erro ao carregar imagens da galeria');
      }

      let dedupedImages = [];
      let visualRemoved = [];

      try {
        const visualResult = await dedupePhotosByVisualSimilarity(allImages, {
          threshold: 0.8,
        });

        dedupedImages = visualResult.photos;
        visualRemoved = visualResult.removed;
      } catch (error) {
        console.warn('Deduplicação visual indisponível. Usando deduplicação técnica:', error);
        dedupedImages = uniqueByFileUrl(allImages);
        visualRemoved = [];
      }

      return {
        images: dedupedImages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
        duplicateGroups: buildDuplicateGroups(allImages, visualRemoved),
      };
    },
    enabled: !!currentUser?.email,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const images = Array.isArray(galleryData) ? galleryData : galleryData.images || [];
  const duplicateGroups = Array.isArray(galleryData) ? [] : galleryData.duplicateGroups || [];

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_IMAGES);
  }, [searchTerm, sortBy]);

  const filteredImages = useMemo(() => {
    const q = searchTerm.toLowerCase();

    return images.filter((img) => (
      img.fileName.toLowerCase().includes(q) ||
      img.reportLabel.toLowerCase().includes(q) ||
      String(img.description || '').toLowerCase().includes(q) ||
      String(img.legenda || '').toLowerCase().includes(q) ||
      String(img.museu || '').toLowerCase().includes(q) ||
      String(img.localizacao || '').toLowerCase().includes(q) ||
      String(img.geoCoordinates || '').toLowerCase().includes(q) ||
      String(img.sectionTitle || '').toLowerCase().includes(q) ||
      String(img.linkedActivity?.title || '').toLowerCase().includes(q)
    ));
  }, [images, searchTerm]);

  const sortedImages = useMemo(() => {
    return [...filteredImages].sort((a, b) => {
      if (sortBy === 'recent') return new Date(b.timestamp) - new Date(a.timestamp);
      if (sortBy === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
      if (sortBy === 'name-asc') return a.fileName.localeCompare(b.fileName);
      if (sortBy === 'name-desc') return b.fileName.localeCompare(a.fileName);

      return 0;
    });
  }, [filteredImages, sortBy]);

  const groupedImages = useMemo(() => {
    const visibleImages = sortedImages.slice(0, visibleCount);
    const groups = SECTION_ORDER.map((key) => ({
      key,
      section: MUSEUM_SECTIONS[key],
      images: []
    }));

    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));

    visibleImages.forEach((image) => {
      const key = MUSEUM_SECTIONS[image.sectionKey] ? image.sectionKey : 'MHAB';
      byKey[key].images.push(image);
    });

    return groups.filter((group) => group.images.length > 0);
  }, [sortedImages, visibleCount]);

  const currentImageIndex = selectedImage
    ? sortedImages.findIndex((img) => img.id === selectedImage.id)
    : -1;

  const handlePrevImage = () => {
    if (currentImageIndex > 0) {
      setSelectedImage(sortedImages[currentImageIndex - 1]);
    }
  };

  const handleNextImage = () => {
    if (currentImageIndex < sortedImages.length - 1) {
      setSelectedImage(sortedImages[currentImageIndex + 1]);
    }
  };

  const analyzeDuplicateGroupsWithAI = async () => {
    if (!duplicateGroups.length) {
      setDuplicateAnalysis({
        summary: 'Nenhuma imagem repetida foi encontrada pelos critérios técnicos ou visuais da galeria.',
        groups: [],
      });
      setDuplicateReviewOpen(true);
      return;
    }

    setIsAnalyzingDuplicates(true);
    setDuplicateReviewOpen(true);

    const candidates = duplicateGroups.slice(0, 40).map((group, index) => ({
      groupKey: group.key,
      index: index + 1,
      count: group.count,
      similarity: group.similarity ? Math.round(group.similarity * 100) : null,
      reason: group.reason || '',
      keepId: group.keep.id,
      keepFile: group.keep.fileName,
      keepMuseum: group.keep.museu,
      keepCaption: group.keep.legenda,
      duplicates: group.duplicates.map((item) => ({
        id: item.id,
        file: item.fileName,
        museu: item.museu,
        legenda: item.legenda,
        atividade: item.linkedActivity?.title || '',
      })),
    }));

    try {
      const prompt = `
Você é uma curadoria técnica da Galeria de Fotos do Museus Centro.
Analise os grupos abaixo e aponte quais parecem ser fotos repetidas do mesmo arquivo, da mesma identidade técnica ou do mesmo registro visual.
Use apenas os metadados fornecidos. Não invente dados.
Responda em JSON puro, sem markdown, neste formato:
{
  "summary": "síntese curta",
  "groups": [
    {
      "groupKey": "chave recebida",
      "confidence": "alta|media|baixa",
      "reason": "motivo curto",
      "keepId": "id recomendado para manter",
      "duplicateIds": ["ids repetidos"]
    }
  ]
}

GRUPOS CANDIDATOS:
${JSON.stringify(candidates, null, 2)}
`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false,
      });
      const raw = String(response || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(raw);
      setDuplicateAnalysis({
        summary: parsed.summary || `${duplicateGroups.length} grupo(s) candidato(s) a repetição encontrados.`,
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      });
    } catch (error) {
      console.warn('IA indisponível para análise de duplicadas. Usando análise técnica local:', error);
      setDuplicateAnalysis({
        summary: `${duplicateGroups.length} grupo(s) de imagens repetidas foram detectados por identidade técnica ou similaridade visual.`,
        groups: duplicateGroups.map((group) => ({
          groupKey: group.key,
          confidence: 'alta',
          reason: group.reason === 'similaridade_visual'
            ? `Similaridade visual local estimada em ${Math.round((group.similarity || 0) * 100)}%.`
            : 'Mesmo arquivo normalizado encontrado em mais de uma origem da galeria.',
          keepId: group.keep.id,
          duplicateIds: group.duplicates.map((item) => item.id),
        })),
      });
    } finally {
      setIsAnalyzingDuplicates(false);
    }
  };

  const openEditImage = (image) => {
    setEditingImage(image);
    setEditForm({
      legenda: image?.legenda || image?.description || '',
      museu: image?.museu || '',
      localizacao: image?.localizacao || '',
    });
  };

  const saveImageEdit = async () => {
    if (!editingImage?.sourceEntity || !editingImage?.sourceId) return;
    setIsSavingEdit(true);

    try {
      const payload = {
        descricao: editForm.legenda,
        description: editForm.legenda,
        legenda: editForm.legenda,
        museu: editForm.museu,
        localizacao: editForm.localizacao,
      };

      await base44.entities[editingImage.sourceEntity].update(editingImage.sourceId, payload);
      toastMessages.updateSuccess();
      setEditingImage(null);
      await refetch();
    } catch (error) {
      console.error('Erro ao editar foto da galeria:', error);
      toastMessages.updateFailed();
    } finally {
      setIsSavingEdit(false);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!selectedImage) return;

      if (e.key === 'ArrowLeft') handlePrevImage();
      if (e.key === 'ArrowRight') handleNextImage();
      if (e.key === 'Escape') setSelectedImage(null);
    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);
  }, [selectedImage, sortedImages, currentImageIndex]);

  const isInitialPageLoading = userLoading || (!!currentUser?.email && isLoading);

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando a galeria, fotos, vínculos com atividades, relatórios aprovados e programação. Aguarde alguns instantes."
      />
    );
  }

  if (isError) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar a galeria"
        errorDescription="Atualize a página ou tente novamente em alguns instantes."
      />
    );
  }

  if (!currentUser) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos validando seu acesso à galeria. Aguarde alguns instantes."
      />
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight mb-2">
            Galeria de Fotos
          </h1>

          <p className="text-gray-600">
            {sortedImages.length} {sortedImages.length === 1 ? 'imagem' : 'imagens'} organizadas por museu, com vínculo a atividades e relatórios.
          </p>

          {isFetching && !isLoading && (
            <p className="mt-2 text-xs text-gray-400">
              Atualizando galeria...
            </p>
          )}

          {sortedImages.length > visibleCount && (
            <p className="mt-2 text-xs text-gray-500">
              Exibindo {visibleCount} de {sortedImages.length} imagens. Use "Carregar mais" para continuar.
            </p>
          )}

          {duplicateGroups.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {duplicateGroups.length} grupo(s) de imagens repetidas foram detectados e removidos da exibição por identidade técnica ou similaridade visual.
            </p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-8 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-600 mb-2 block">
                Buscar
              </Label>

              <Input
                placeholder="Nome, legenda, atividade, museu, local ou coordenadas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-600 mb-2 block">
                Ordenar
              </Label>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
              >
                <option value="recent">Mais Recentes</option>
                <option value="oldest">Mais Antigas</option>
                <option value="name-asc">Nome (A-Z)</option>
                <option value="name-desc">Nome (Z-A)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Revisão de repetidas por IA</p>
              <p className="text-xs text-gray-500">
                Analisa grupos técnicos de duplicidade e aponta quais registros parecem ser o mesmo arquivo.
              </p>
            </div>
            <button
              type="button"
              onClick={analyzeDuplicateGroupsWithAI}
              disabled={isAnalyzingDuplicates}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className={`h-4 w-4 ${isAnalyzingDuplicates ? 'animate-pulse' : ''}`} />
              {isAnalyzingDuplicates ? 'Analisando...' : 'Analisar repetidas'}
            </button>
          </div>
        </div>

        {sortedImages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <Images className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium text-black">Nenhuma foto encontrada</p>
            <p className="text-sm text-gray-500 mt-1">
              As fotos vinculadas a relatórios aprovados aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {groupedImages.map(({ key, section, images: sectionImages }) => (
              <section key={key} className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-black">
                        {section.title}
                      </h2>

                      <p className="mt-1 text-xs text-gray-500">
                        {sectionImages.length} {sectionImages.length === 1 ? 'foto vinculada' : 'fotos vinculadas'}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="text-sm text-gray-700">
                        {section.address}
                      </p>
                      <p className="font-mono text-xs text-gray-500">
                        Lat/Lon: {section.coordinates}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {sectionImages.map((image) => (
                    <PhotoCard
                      key={image.id}
                      image={image}
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

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-5xl w-full p-0 bg-black border-0 overflow-hidden">
          {selectedImage && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-2 text-white hover:bg-black"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              {currentImageIndex > 0 && (
                <button
                  type="button"
                  onClick={handlePrevImage}
                  className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {currentImageIndex < sortedImages.length - 1 && (
                <button
                  type="button"
                  onClick={handleNextImage}
                  className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
                  aria-label="Próxima foto"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}

              <img
                src={selectedImage.fileUrl}
                alt={selectedImage.legenda || selectedImage.fileName}
                className="w-full max-h-[78vh] object-contain"
              />

              <div className="p-5 text-white bg-black/80 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-snug">
                      {selectedImage.legenda || selectedImage.fileName}
                    </p>

                    {selectedImage.description && selectedImage.description !== selectedImage.legenda && (
                      <p className="text-sm opacity-80 mt-1">
                        {selectedImage.description}
                      </p>
                    )}
                  </div>

                  {selectedImage.fileUrl && (
                    <a
                      href={selectedImage.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white hover:bg-white hover:text-black"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Abrir
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditImage(selectedImage)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white hover:bg-white hover:text-black"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                </div>

                <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-white/60 mb-1">
                    Seção do museu
                  </p>
                  <p className="font-semibold text-white">
                    {selectedImage.sectionTitle}
                  </p>
                  <p className="mt-1 text-xs text-white/75">
                    {selectedImage.sectionAddress}
                  </p>
                  <p className="mt-1 font-mono text-xs text-white/75">
                    Lat/Lon: {selectedImage.sectionCoordinates}
                  </p>
                </div>

                {selectedImage.linkedActivity?.title && (
                  <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-white/60 mb-1">
                      Atividade vinculada
                    </p>
                    <p className="font-semibold text-white">
                      {selectedImage.linkedActivity.title}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/75">
                      {selectedImage.linkedActivity.source && (
                        <span>{selectedImage.linkedActivity.source}</span>
                      )}

                      {selectedImage.linkedActivity.date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {formatDateBR(selectedImage.linkedActivity.date)}
                        </span>
                      )}

                      {selectedImage.linkedActivity.local && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {selectedImage.linkedActivity.local}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1 text-xs opacity-85">
                  {selectedImage.reportLabel && <p>{selectedImage.reportLabel}</p>}
                  {selectedImage.museu && <p>{selectedImage.museu}</p>}

                  <p className="font-mono text-[11px] text-white/80">
                    Lat/Lon: {selectedImage.geoCoordinates}
                  </p>

                  {selectedImage.localizacao && (
                    <p className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {selectedImage.localizacao}
                    </p>
                  )}

                  {selectedImage.metadataCoordinates && (
                    <p className="font-mono text-[11px] text-white/60">
                      GPS original: {selectedImage.metadataCoordinates}
                    </p>
                  )}

                  {selectedImage.metadataDate && (
                    <p className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {formatDateBR(selectedImage.metadataDate)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateReviewOpen} onOpenChange={setDuplicateReviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Galeria de Fotos</p>
              <h2 className="text-xl font-semibold text-black">Análise de imagens repetidas</h2>
              <p className="mt-1 text-sm text-gray-600">
                A IA usa os metadados da galeria e os grupos técnicos de arquivo repetido. A lista não apaga arquivos automaticamente.
              </p>
            </div>

            {isAnalyzingDuplicates ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
                Analisando os grupos de imagens repetidas...
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-700">
                    {duplicateAnalysis?.summary || 'Nenhuma análise executada ainda.'}
                  </p>
                </div>

                <div className="space-y-3">
                  {(duplicateAnalysis?.groups || []).map((group, index) => {
                    const sourceGroup = duplicateGroups.find((item) => item.key === group.groupKey);
                    const keepImage = sourceGroup?.items.find((item) => item.id === group.keepId) || sourceGroup?.keep;
                    const requestedDuplicateIds = Array.isArray(group.duplicateIds) ? group.duplicateIds : null;
                    const duplicateImages = requestedDuplicateIds
                      ? sourceGroup?.items.filter((item) => requestedDuplicateIds.includes(item.id)) || []
                      : sourceGroup?.duplicates || [];

                    return (
                      <article key={`${group.groupKey}-${index}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-black">
                              Grupo {index + 1} · confiança {group.confidence || 'média'}
                            </p>
                            <p className="text-xs text-gray-500">{group.reason}</p>
                          </div>
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                            {(sourceGroup?.count || duplicateImages.length + 1)} ocorrências
                          </span>
                        </div>

                        {keepImage && (
                          <div className="mt-3 grid gap-3 md:grid-cols-[120px_1fr]">
                            <img src={keepImage.fileUrl} alt={keepImage.legenda || keepImage.fileName} className="h-28 w-full rounded-xl object-cover" />
                            <div className="text-sm">
                              <p className="font-medium text-black">Manter: {keepImage.legenda || keepImage.fileName}</p>
                              <p className="text-xs text-gray-500">{keepImage.museu} · {keepImage.reportLabel}</p>
                              <button
                                type="button"
                                onClick={() => openEditImage(keepImage)}
                                className="mt-2 inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50"
                              >
                                <Edit3 className="h-3 w-3" />
                                Editar metadados
                              </button>
                            </div>
                          </div>
                        )}

                        {duplicateImages.length > 0 && (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {duplicateImages.map((image) => (
                              <div key={image.id} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-2">
                                <img src={image.fileUrl} alt={image.legenda || image.fileName} className="h-16 w-16 rounded-lg object-cover" />
                                <div className="min-w-0 text-xs">
                                  <p className="line-clamp-2 font-medium text-gray-900">{image.legenda || image.fileName}</p>
                                  <p className="text-gray-500">{image.museu}</p>
                                  <button
                                    type="button"
                                    onClick={() => openEditImage(image)}
                                    className="mt-1 text-gray-800 underline"
                                  >
                                    Editar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {!isAnalyzingDuplicates && (duplicateAnalysis?.groups || []).length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                      Nenhuma repetição para revisar.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
        <DialogContent className="max-w-xl">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Editar foto</p>
              <h2 className="text-xl font-semibold text-black">Metadados da imagem</h2>
              <p className="mt-1 text-sm text-gray-600">A edição ajusta legenda, museu e localização do registro selecionado.</p>
            </div>

            {editingImage && (
              <img src={editingImage.fileUrl} alt={editingImage.legenda || editingImage.fileName} className="max-h-64 w-full rounded-2xl object-contain bg-gray-100" />
            )}

            <div className="space-y-3">
              <div>
                <Label>Legenda</Label>
                <Input value={editForm.legenda} onChange={(event) => setEditForm((prev) => ({ ...prev, legenda: event.target.value }))} />
              </div>
              <div>
                <Label>Museu</Label>
                <select
                  value={editForm.museu}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, museu: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                >
                  <option value="">Sem classificação</option>
                  <option value="MHAB">MHAB</option>
                  <option value="MIS">MIS</option>
                  <option value="MUMO">MUMO</option>
                </select>
              </div>
              <div>
                <Label>Localização</Label>
                <Input value={editForm.localizacao} onChange={(event) => setEditForm((prev) => ({ ...prev, localizacao: event.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingImage(null)} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveImageEdit}
                disabled={isSavingEdit}
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSavingEdit ? 'Salvando...' : 'Salvar edição'}
              </button>
            </div>
          </div>
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
