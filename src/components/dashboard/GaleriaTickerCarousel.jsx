import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

const CURATED_PHOTO_COUNT = 24;
const CURATION_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const GALLERY_ROUTE = '/GaleriaFotos';

function normalizeText(value) {
  return String(value || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toLowerCase().
  trim();
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function shuffleSeeded(arr, seed) {
  const random = seededRandom(seed);
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function getCurationSeed() {
  return Math.floor(Date.now() / CURATION_INTERVAL_MS);
}

function getImageUrl(item) {
  return item?.file_url || item?.url || item?.imagem_url || item?.photo_url || item?.image_url || item?.src || '';
}

function getMetadataText(item) {
  return normalizeText([
  item?.filename,
  item?.file_name,
  item?.nome,
  item?.titulo,
  item?.title,
  item?.descricao,
  item?.description,
  item?.caption,
  item?.legenda,
  item?.tags,
  item?.keywords,
  item?.tipo,
  item?.categoria,
  item?.classificacao,
  item?.ai_classificacao,
  item?.ai_categoria,
  item?.ai_descricao,
  item?.analise_ia,
  item?.resultado_ia?.descricao,
  item?.resultado_ia?.categoria,
  item?.resultado_ia?.tipo,
  item?.resultado_ia?.tags,
  item?.mime_type,
  item?.file_type,
  getImageUrl(item)].
  filter(Boolean).join(' '));
}

function isImageItem(item) {
  const url = getImageUrl(item);
  const mime = normalizeText(item?.mime_type || item?.file_type || '');

  if (!url) return false;
  if (mime && !mime.includes('image') && !mime.includes('foto')) return false;

  return /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(url) || mime.includes('image');
}

function isDocumentOrPrint(item) {
  const text = getMetadataText(item);
  const url = normalizeText(getImageUrl(item));

  if (/\.(pdf|xml|doc|docx|xls|xlsx|csv|txt|zip|rar)(\?|#|$)/i.test(url)) return true;

  const blockedTerms = [
  'pdf',
  'xml',
  'documento',
  'document',
  'nota fiscal',
  'nf ',
  'nfs',
  'recibo',
  'comprovante',
  'boleto',
  'contrato',
  'orcamento',
  'orçamento',
  'planilha',
  'spreadsheet',
  'relatorio financeiro',
  'lista',
  'listagem',
  'tabela',
  'print',
  'screenshot',
  'captura de tela',
  'whatsapp',
  'email',
  'e-mail',
  'formulario',
  'comprovacao',
  'assinatura',
  'cnpj',
  'cpf',
  'danfe',
  'fatura',
  'extrato',
  'pagamento',
  'transferencia',
  'pix'];


  return blockedTerms.some((term) => text.includes(term));
}

function scorePeoplePhoto(item) {
  const text = getMetadataText(item);
  let score = 0;

  const peopleTerms = [
  'pessoa',
  'pessoas',
  'publico',
  'participante',
  'participantes',
  'crianca',
  'criancas',
  'adulto',
  'adultos',
  'jovem',
  'jovens',
  'idoso',
  'idosos',
  'familia',
  'familias',
  'grupo',
  'visitante',
  'visitantes',
  'oficina',
  'atividade',
  'evento',
  'encontro',
  'roda',
  'aula',
  'turma',
  'mediacao',
  'mediacao cultural',
  'educativo',
  'educativa',
  'apresentacao',
  'show',
  'espetaculo',
  'performance',
  'plateia',
  'audiencia',
  'auditorio',
  'face',
  'rosto',
  'portrait',
  'people',
  'person',
  'persons',
  'crowd',
  'audience'];


  peopleTerms.forEach((term) => {
    if (text.includes(term)) score += 2;
  });

  const weakPositiveTerms = ['museu', 'galeria', 'exposicao', 'visita', 'programacao', 'cultural', 'arte', 'noturno'];
  weakPositiveTerms.forEach((term) => {
    if (text.includes(term)) score += 1;
  });

  const fileName = normalizeText(item?.filename || item?.file_name || item?.nome || getImageUrl(item));
  if (/\b(img|dsc|foto|photo|image|whatsapp image)\b/.test(fileName)) score += 1;

  return score;
}

function curatePeoplePhotos(items) {
  const dedup = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const url = getImageUrl(item);
    if (!url || dedup.has(url)) return;
    if (!isImageItem(item)) return;
    if (isDocumentOrPrint(item)) return;

    const score = scorePeoplePhoto(item);
    dedup.set(url, { url, item, score });
  });

  const seed = getCurationSeed();
  const candidates = Array.from(dedup.values());
  const strongCandidates = candidates.filter((candidate) => candidate.score > 0);
  const source = strongCandidates.length >= CURATED_PHOTO_COUNT ? strongCandidates : candidates;

  const curated = shuffleSeeded(source, seed).
  sort((a, b) => b.score - a.score).
  slice(0, CURATED_PHOTO_COUNT).
  map((candidate) => candidate.url);

  return curated;
}

function extractCuratedImageUrls(items) {
  return curatePeoplePhotos(items);
}

export default function GaleriaTickerCarousel() {
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    async function loadImages() {
      try {
        const [attachments, momentos, reportPhotos] = await Promise.allSettled([
        base44.entities.Attachment.list('-created_date', 500),
        base44.entities.Momento.list('-created_date', 300),
        base44.entities.ReportPhoto.list('-created_date', 300)]
        );

        let allItems = [];
        if (attachments.status === 'fulfilled') allItems.push(...(Array.isArray(attachments.value) ? attachments.value : []));
        if (momentos.status === 'fulfilled') allItems.push(...(Array.isArray(momentos.value) ? momentos.value : []));
        if (reportPhotos.status === 'fulfilled') allItems.push(...(Array.isArray(reportPhotos.value) ? reportPhotos.value : []));

        const curated = extractCuratedImageUrls(allItems);
        if (curated.length === 0) return;

        let final = [...curated];
        while (final.length < CURATED_PHOTO_COUNT) final = [...final, ...curated];
        setImages(final.slice(0, CURATED_PHOTO_COUNT));
      } catch (e) {
        console.error('GaleriaTickerCarousel: erro ao carregar imagens', e);
      }
    }

    loadImages();
  }, []);

  const goToGallery = () => {
    setPaused(true);
    navigate(GALLERY_ROUTE);
  };

  const looped = useMemo(() => [...images, ...images], [images]);

  if (images.length === 0) return null;

  // Duplicar para loop visual infinito
  const totalWidth = images.length * 88; // 80px + 8px gap
  const duration = images.length * 3.9; // mantém a mesma velocidade proporcional do carrossel original

  return null;










































}