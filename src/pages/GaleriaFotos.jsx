import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Images, ChevronLeft, ChevronRight, X, Download, Loader2, MapPin, CalendarDays, LinkIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastMessages } from '@/lib/toastMessages';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'bmp', 'avif'];

function isImageByFileName(fileName = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
}

function isImageByMime(fileType = '') {
  return String(fileType).toLowerCase().startsWith('image/');
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function readNested(obj, paths = []) {
  for (const path of paths) {
    const value = String(path)
      .split('.')
      .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function extractMetadata(item = {}) {
  const raw = item.metadata || item.meta_data || item.metadados || item.exif || item.image_metadata || item.file_metadata || {};

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  return raw && typeof raw === 'object' ? raw : {};
}

function decimalFromDms(value) {
  if (!Array.isArray(value) || value.length < 3) return null;

  const toNumber = (part) => {
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
  };

  const deg = toNumber(value[0]);
  const min = toNumber(value[1]);
  const sec = toNumber(value[2]);

  if (![deg, min, sec].every(Number.isFinite)) return null;
  return deg + min / 60 + sec / 3600;
}

function extractLocationFromMetadata(item = {}) {
  const metadata = extractMetadata(item);

  const direct = readNested(item, [
    'localizacao',
    'localização',
    'location',
    'cidade',
    'municipio',
    'local',
    'endereco',
    'gps_location',
    'geo_location'
  ]);

  if (direct) return String(direct);

  const metaDirect = readNested(metadata, [
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
  ]);

  if (metaDirect) return String(metaDirect);

  const latitude =
    readNested(item, ['latitude', 'lat', 'gps_latitude']) ||
    readNested(metadata, ['latitude', 'lat', 'gps_latitude', 'GPSLatitude', 'gps.GPSLatitude', 'GPS.GPSLatitude']);
  const longitude =
    readNested(item, ['longitude', 'lng', 'lon', 'gps_longitude']) ||
    readNested(metadata, ['longitude', 'lng', 'lon', 'gps_longitude', 'GPSLongitude', 'gps.GPSLongitude', 'GPS.GPSLongitude']);

  if (latitude && longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  const gpsLat = readNested(metadata, ['GPSLatitude', 'gps.GPSLatitude', 'GPS.GPSLatitude']);
  const gpsLng = readNested(metadata, ['GPSLongitude', 'gps.GPSLongitude', 'GPS.GPSLongitude']);
  const latRef = String(readNested(metadata, ['GPSLatitudeRef', 'gps.GPSLatitudeRef', 'GPS.GPSLatitudeRef']) || '').toUpperCase();
  const lngRef = String(readNested(metadata, ['GPSLongitudeRef', 'gps.GPSLongitudeRef', 'GPS.GPSLongitudeRef']) || '').toUpperCase();

  const latDms = decimalFromDms(gpsLat);
  const lngDms = decimalFromDms(gpsLng);

  if (latDms !== null && lngDms !== null) {
    const lat = latRef === 'S' ? -latDms : latDms;
    const lng = lngRef === 'W' ? -lngDms : lngDms;
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  return '';
}

function extractMetadataDate(item = {}) {
  const metadata = extractMetadata(item);
  return (
    readNested(item, ['data_foto', 'photo_date', 'taken_at', 'captured_at']) ||
    readNested(metadata, ['DateTimeOriginal', 'CreateDate', 'created_at', 'taken_at', 'photo_date', 'exif.DateTimeOriginal']) ||
    ''
  );
}

function getActivityTitle(activity = {}) {
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

function getActivityDate(activity = {}) {
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

function getActivityLocation(activity = {}) {
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

function buildActivityMaps(reports = [], programacao = []) {
  const byId = new Map();
  const byText = [];

  (Array.isArray(programacao) ? programacao : []).forEach((item) => {
    const activity = {
      id: item.id,
      title: getActivityTitle(item),
      date: getActivityDate(item),
      museu: item.museu || item.centro_custo || item.equipamento || '',
      local: getActivityLocation(item),
      source: 'Programação'
    };

    if (item.id) byId.set(String(item.id), activity);
    if (activity.title) byText.push({ key: normalizeText(activity.title), activity });
  });

  (Array.isArray(reports) ? reports : []).forEach((report) => {
    const atividades = Array.isArray(report?.atividades) ? report.atividades : [];

    atividades.forEach((item, idx) => {
      const activity = {
        id: item.id || item.atividade_id || item.programacao_id || `${report.id || 'report'}-${idx}`,
        title: getActivityTitle(item),
        date: getActivityDate(item) || `${report.mes_referencia || ''}/${report.ano || ''}`,
        museu: item.museu || report.museu || '',
        local: getActivityLocation(item) || report.museu || '',
        source: report.author_name ? `Relatório — ${report.author_name}` : 'Relatório'
      };

      [item.id, item.atividade_id, item.programacao_id, item.activity_id, item.id_programacao].filter(Boolean).forEach((id) => {
        byId.set(String(id), activity);
      });

      if (activity.title) byText.push({ key: normalizeText(activity.title), activity });
    });
  });

  return { byId, byText };
}

function resolveLinkedActivity(item = {}, maps) {
  const possibleIds = [
    item.atividade_id,
    item.activity_id,
    item.programacao_id,
    item.id_atividade,
    item.vinculo_atividade_id,
    item.linked_activity_id,
    item.report_activity_id,
    item.metadata?.atividade_id,
    item.metadata?.activity_id,
    item.metadata?.programacao_id,
    item.meta_data?.atividade_id,
    item.metadados?.atividade_id
  ].filter(Boolean);

  for (const id of possibleIds) {
    const activity = maps.byId.get(String(id));
    if (activity) return activity;
  }

  const textHints = [
    item.atividade_nome,
    item.nome_atividade,
    item.activity_name,
    item.titulo_atividade,
    item.atividade,
    item.legenda,
    item.descricao,
    item.description,
    item.file_name
  ].filter(Boolean).map(normalizeText);

  for (const hint of textHints) {
    if (!hint) continue;
    const found = maps.byText.find(({ key }) => key && (hint.includes(key) || key.includes(hint)));
    if (found?.activity) return found.activity;
  }

  return null;
}

function buildPhotoCaption(item = {}, activity = null) {
  const manualCaption = item.legenda || item.caption || item.titulo || item.title || '';
  const description = item.descricao || item.description || '';

  if (manualCaption) return String(manualCaption);

  if (activity?.title) {
    const date = formatDateBR(activity.date);
    const local = activity.local || activity.museu || '';
    return [activity.title, local, date].filter(Boolean).join(' · ');
  }

  if (description) return String(description);

  return String(item.file_name || item.fileName || 'Foto da galeria');
}

function uniqueByFileUrl(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.fileUrl || '';
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapMediaItem(item, activityMaps) {
  const linkedActivity = resolveLinkedActivity(item, activityMaps);
  const metadataDate = extractMetadataDate(item);
  const localizacao = extractLocationFromMetadata(item) || linkedActivity?.local || item.museu || '';
  const timestamp = normalizeDate(metadataDate || item.created_at || item.created_date || item.updated_date);

  return {
    id: `media-${item.id}`,
    fileName: item.file_name || 'imagem',
    fileUrl: item.file_url,
    timestamp,
    date: timestamp.split('T')[0],
    reportLabel: item.origem === 'relatorio' ? 'Relatório' : (item.origem || 'Galeria'),
    description: item.descricao || item.description || '',
    legenda: buildPhotoCaption(item, linkedActivity),
    museu: item.museu || linkedActivity?.museu || '',
    localizacao,
    metadataLocation: extractLocationFromMetadata(item),
    metadataDate,
    linkedActivity,
  };
}

function mapAttachmentItem(att, approvedReports, activityMaps) {
  const report = approvedReports.find((r) => r.id === att.report_id);
  const linkedActivity = resolveLinkedActivity(att, activityMaps);
  const metadataDate = extractMetadataDate(att);
  const localizacao = extractLocationFromMetadata(att) || linkedActivity?.local || report?.museu || '';
  const timestamp = normalizeDate(metadataDate || att.created_date || att.updated_date);

  return {
    id: `legacy-${att.id}`,
    fileName: att.file_name || 'imagem',
    fileUrl: att.file_url,
    timestamp,
    date: timestamp.split('T')[0],
    reportLabel: report
      ? `${report.author_name || 'Relatório'} — ${report.mes_referencia || ''}/${report.ano || ''}`
      : 'Relatório (legado)',
    description: att.description || '',
    legenda: buildPhotoCaption(att, linkedActivity),
    museu: linkedActivity?.museu || report?.museu || '',
    localizacao,
    metadataLocation: extractLocationFromMetadata(att),
    metadataDate,
    linkedActivity,
  };
}

function GaleriaFotosInner() {
  const { user: currentUser } = useCurrentUser();
  const [selectedImage, setSelectedImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['galeria-fotos-v5-legendas-atividade-localizacao', currentUser?.email],
    queryFn: async () => {
      const allImages = [];
      let approvedReports = [];
      let programacao = [];

      try {
        const reports = await base44.entities.Report.filter({ status: 'APPROVED' });
        approvedReports = Array.isArray(reports) ? reports : [];
      } catch (error) {
        console.warn('Relatórios aprovados indisponíveis para vínculo da galeria:', error);
      }

      try {
        const listaProgramacao = await base44.entities.Programacao.list('-data_realizacao', 1000);
        programacao = Array.isArray(listaProgramacao) ? listaProgramacao : [];
      } catch (error) {
        console.warn('Programação indisponível para vínculo da galeria:', error);
      }

      const activityMaps = buildActivityMaps(approvedReports, programacao);

      try {
        const media = await base44.entities.MediaLibrary.list();

        const imageMedia = (Array.isArray(media) ? media : [])
          .filter((item) => {
            const tipo = String(item?.tipo || '').toLowerCase();
            return (
              tipo === 'imagem' ||
              tipo === 'image' ||
              isImageByMime(item?.file_type) ||
              isImageByFileName(item?.file_name)
            );
          })
          .map((item) => mapMediaItem(item, activityMaps));

        allImages.push(...imageMedia);
      } catch (error) {
        console.warn('MediaLibrary indisponível, usando fallback de Attachment:', error);
      }

      try {
        const approvedIds = new Set((approvedReports || []).map((r) => r.id));
        const attachments = await base44.entities.Attachment.list();

        const legacyImages = (Array.isArray(attachments) ? attachments : [])
          .filter((att) => {
            return (
              approvedIds.has(att.report_id) &&
              (isImageByMime(att.file_type) || isImageByFileName(att.file_name))
            );
          })
          .map((att) => mapAttachmentItem(att, approvedReports, activityMaps));

        allImages.push(...legacyImages);
      } catch (error) {
        console.error('Erro ao carregar imagens legadas da galeria:', error);
        toastMessages.warning('Erro ao carregar imagens da galeria');
      }

      return uniqueByFileUrl(allImages).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
    },
    enabled: !!currentUser?.email,
  });

  const filteredImages = useMemo(() => images.filter((img) => {
    const q = searchTerm.toLowerCase();
    return (
      img.fileName.toLowerCase().includes(q) ||
      img.reportLabel.toLowerCase().includes(q) ||
      String(img.description || '').toLowerCase().includes(q) ||
      String(img.legenda || '').toLowerCase().includes(q) ||
      String(img.museu || '').toLowerCase().includes(q) ||
      String(img.localizacao || '').toLowerCase().includes(q) ||
      String(img.linkedActivity?.title || '').toLowerCase().includes(q)
    );
  }), [images, searchTerm]);

  const sortedImages = useMemo(() => [...filteredImages].sort((a, b) => {
    if (sortBy === 'recent') return new Date(b.timestamp) - new Date(a.timestamp);
    if (sortBy === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
    if (sortBy === 'name-asc') return a.fileName.localeCompare(b.fileName);
    if (sortBy === 'name-desc') return b.fileName.localeCompare(a.fileName);
    return 0;
  }), [filteredImages, sortBy]);

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

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">

        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight mb-2">Galeria de Fotos</h1>
          <p className="text-gray-600">
            {sortedImages.length} {sortedImages.length === 1 ? 'imagem' : 'imagens'} com legenda, atividade vinculada e localização quando disponível no metadata
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-8 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-600 mb-2 block">Buscar</Label>
              <Input
                placeholder="Nome, legenda, atividade, museu ou local..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-600 mb-2 block">Ordenar</Label>
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
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : sortedImages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <Images className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="font-medium text-black">Nenhuma foto encontrada</p>
            <p className="text-sm text-gray-500 mt-1">As fotos vinculadas a relatórios aprovados aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {sortedImages.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedImage(image)}
                className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
              >
                <div className="relative aspect-square overflow-hidden bg-gray-100">
                  <img
                    src={image.fileUrl}
                    alt={image.legenda || image.fileName}
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

                  <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                    {image.museu && <span>{image.museu}</span>}
                    {image.localizacao && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {image.localizacao}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
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
                </div>

                {selectedImage.linkedActivity?.title && (
                  <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-white/60 mb-1">Atividade vinculada</p>
                    <p className="font-semibold text-white">{selectedImage.linkedActivity.title}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/75">
                      {selectedImage.linkedActivity.source && <span>{selectedImage.linkedActivity.source}</span>}
                      {selectedImage.linkedActivity.date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {formatDateBR(selectedImage.linkedActivity.date) || selectedImage.linkedActivity.date}
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

                <div className="flex flex-wrap gap-4 text-xs opacity-85 items-center">
                  {selectedImage.reportLabel && <span>{selectedImage.reportLabel}</span>}
                  {selectedImage.museu && <span>{selectedImage.museu}</span>}
                  {selectedImage.localizacao && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {selectedImage.localizacao}
                      {selectedImage.metadataLocation && <span className="opacity-60">metadata</span>}
                    </span>
                  )}
                  {selectedImage.metadataDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {formatDateBR(selectedImage.metadataDate) || selectedImage.metadataDate}
                    </span>
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
