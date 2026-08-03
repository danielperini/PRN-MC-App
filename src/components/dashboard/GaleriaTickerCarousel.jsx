import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

const PHOTO_COUNT = 4;
const ROTATION_INTERVAL_MS = 30000;
const GALLERY_ROUTE = '/GaleriaFotos';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

function getDailySeed() {
  return Math.floor(Date.now() / 86400000);
}

function getImageUrl(item) {
  return item?.file_url || item?.url || item?.imagem_url || item?.photo_url || item?.image_url || item?.src || '';
}

function getMetadataText(item) {
  return normalizeText([
    item?.filename, item?.file_name, item?.nome, item?.titulo, item?.title,
    item?.descricao, item?.description, item?.caption, item?.legenda,
    item?.tags, item?.keywords, item?.tipo, item?.categoria, item?.classificacao,
    item?.ai_classificacao, item?.ai_categoria, item?.ai_descricao, item?.analise_ia,
    item?.resultado_ia?.descricao, item?.resultado_ia?.categoria, item?.resultado_ia?.tipo,
    item?.resultado_ia?.tags, item?.mime_type, item?.file_type, getImageUrl(item)
  ].filter(Boolean).join(' '));
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
    'pdf', 'xml', 'documento', 'document', 'nota fiscal', 'nf ', 'nfs',
    'recibo', 'comprovante', 'boleto', 'contrato', 'orcamento', 'orçamento',
    'planilha', 'spreadsheet', 'relatorio financeiro', 'lista', 'listagem',
    'tabela', 'print', 'screenshot', 'captura de tela', 'whatsapp', 'email',
    'e-mail', 'formulario', 'comprovacao', 'assinatura', 'cnpj', 'cpf',
    'danfe', 'fatura', 'extrato', 'pagamento', 'transferencia', 'pix'
  ];

  return blockedTerms.some((term) => text.includes(term));
}

function scorePeoplePhoto(item) {
  const text = getMetadataText(item);
  let score = 0;

  const peopleTerms = [
    'pessoa', 'pessoas', 'publico', 'participante', 'participantes',
    'crianca', 'criancas', 'adulto', 'adultos', 'jovem', 'jovens',
    'idoso', 'idosos', 'familia', 'familias', 'grupo', 'visitante',
    'visitantes', 'oficina', 'atividade', 'evento', 'encontro', 'roda',
    'aula', 'turma', 'mediacao', 'mediacao cultural', 'educativo',
    'educativa', 'apresentacao', 'show', 'espetaculo', 'performance',
    'plateia', 'audiencia', 'auditorio', 'face', 'rosto', 'portrait',
    'people', 'person', 'persons', 'crowd', 'audience'
  ];

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

  const seed = getDailySeed();
  const candidates = Array.from(dedup.values());
  const strongCandidates = candidates.filter((candidate) => candidate.score > 0);
  const source = strongCandidates.length >= PHOTO_COUNT ? strongCandidates : candidates;

  return shuffleSeeded(source, seed)
    .sort((a, b) => b.score - a.score)
    .map((candidate) => candidate.url);
}

function sliceWithWrap(pool, startIdx, count) {
  const result = [];
  const safeStart = ((startIdx % pool.length) + pool.length) % pool.length;
  for (let i = 0; i < count; i += 1) {
    result.push(pool[(safeStart + i) % pool.length]);
  }
  return result;
}

export default function GaleriaTickerCarousel() {
  const navigate = useNavigate();
  const [pool, setPool] = useState([]);
  const [round, setRound] = useState(0);
  const [visible, setVisible] = useState(true);
  const rotationRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function loadImages() {
      try {
        const [attachments, momentos, reportPhotos] = await Promise.allSettled([
          base44.entities.Attachment.list('-created_date', 500),
          base44.entities.Momento.list('-created_date', 300),
          base44.entities.ReportPhoto.list('-created_date', 300)
        ]);

        if (!mounted) return;

        let allItems = [];
        if (attachments.status === 'fulfilled') allItems.push(...(Array.isArray(attachments.value) ? attachments.value : []));
        if (momentos.status === 'fulfilled') allItems.push(...(Array.isArray(momentos.value) ? momentos.value : []));
        if (reportPhotos.status === 'fulfilled') allItems.push(...(Array.isArray(reportPhotos.value) ? reportPhotos.value : []));

        const curated = curatePeoplePhotos(allItems);
        if (mounted && curated.length > 0) setPool(curated);
      } catch (e) {
        console.error('GaleriaTickerCarousel: erro ao carregar imagens', e);
      }
    }

    loadImages();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (pool.length <= PHOTO_COUNT) return () => {};

    rotationRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setRound((prev) => (pool.length > PHOTO_COUNT ? prev + PHOTO_COUNT : prev));
        setVisible(true);
      }, 400);
    }, ROTATION_INTERVAL_MS);

    return () => {
      if (rotationRef.current) clearInterval(rotationRef.current);
    };
  }, [pool]);

  if (pool.length === 0) return null;

  const display = sliceWithWrap(pool, round, PHOTO_COUNT);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Imagens do Museus Centro</h3>
        <button
          type="button"
          onClick={() => navigate(GALLERY_ROUTE)}
          className="flex-none rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          Ver Galeria →
        </button>
      </div>
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        {display.map((url, index) => (
          <button
            key={`${round}-${index}-${url}`}
            type="button"
            onClick={() => navigate(GALLERY_ROUTE)}
            className="block w-full focus:outline-none"
          >
            <img
              src={url}
              alt=""
              loading="lazy"
              className="h-40 md:h-48 w-full rounded-xl object-cover shadow-sm hover:shadow-md transition-shadow"
            />
          </button>
        ))}
      </div>
    </div>
  );
}