import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { isTechnicalFileName, isInventedCaption } from '@/utils/galleryNormalization';
import { filterByCooldown, registerImpressions } from '@/utils/carouselCooldown';

const PHOTO_COUNT = 4;
const ROTATION_INTERVAL_MS = 600000; // 10 minutos — rotação mais tranquila
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

function getSessionSeed() {
  // Semente que muda a cada 10 minutos — alinhada ao ROTATION_INTERVAL_MS
  return Math.floor(Date.now() / (10 * 60 * 1000));
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

  const seed = getSessionSeed();
  const candidates = Array.from(dedup.values());
  const strongCandidates = candidates.filter((candidate) => candidate.score > 0);
  const source = strongCandidates.length >= PHOTO_COUNT ? strongCandidates : candidates;

  // Preserva variedade: embaralha primeiro (variedade visual), depois prioriza score
  // apenas como desempate aproximado nos primeiros itens — mantém pool grande e diverso.
  const shuffled = shuffleSeeded(source, seed);
  // Levar os de score mais alto para o topo, mas sem espremer o pool — top 30% por score, resto embaralhado
  const sorted = [...shuffled].sort((a, b) => b.score - a.score);
  const topCount = Math.min(Math.floor(sorted.length * 0.3), 40);
  const top = sorted.slice(0, topCount);
  const rest = shuffled.filter((c) => !top.includes(c));
  const finalPool = [...shuffleSeeded(top, seed + 1), ...rest];

  return finalPool.map((candidate) => ({
    url: candidate.url,
    caption: getCaption(candidate.item),
  }));
}

function getCaption(item) {
  if (!item) return '';
  // Prioriza legenda curada humana (curta, não-verbosa). Cai para metadados se
  // for nome técnico, descrição inventada pela IA ou estiver vazia.
  const rawCaption = String(item?.legenda || item?.caption || '').trim();
  const realCaption = rawCaption && !isTechnicalFileName(rawCaption) && !isInventedCaption(rawCaption) ? rawCaption : '';
  if (realCaption) {
    return realCaption.length > 90 ? realCaption.slice(0, 87).trimEnd() + '…' : realCaption;
  }
  const atividadeRaw = String(item?.activityTitulo || item?.atividade_titulo || '').trim();
  const atividade = atividadeRaw && !isTechnicalFileName(atividadeRaw) && !isInventedCaption(atividadeRaw) ? atividadeRaw : '';
  const localRaw = String(item?.atividade_local || item?.local || item?.localizacao || '').trim();
  const museuRaw = String(item?.museu || item?.sectionTitle || '').trim();
  const local = localRaw && localRaw !== museuRaw ? localRaw : '';
  const periodo = String(item?.reportMes || item?.mes_referencia || '').trim();
  const value = [atividade, local, periodo].filter(Boolean).join(' — ');
  if (!value) return '';
  return value.length > 90 ? value.slice(0, 87).trimEnd() + '…' : value;
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
        if (!mounted) return;
        const filtered = filterByCooldown(curated, PHOTO_COUNT);
        if (filtered.length > 0) setPool(filtered);
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
        // Salto pseudo-aleatório baseado no timestamp — varia completamente o conjunto exibido
        // a cada rotação, em vez de apenas avançar sequencialmente pelo pool.
        setRound(() => Math.floor(Math.random() * Math.max(1, pool.length - PHOTO_COUNT)));
        setVisible(true);
      }, 400);
    }, ROTATION_INTERVAL_MS);

    return () => {
      if (rotationRef.current) clearInterval(rotationRef.current);
    };
  }, [pool]);

  // Registra impressões do conjunto atual sempre que o round muda.
  useEffect(() => {
    if (pool.length === 0) return;
    registerImpressions(sliceWithWrap(pool, round, PHOTO_COUNT).map((p) => p.url));
  }, [round, pool]);

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
        {display.map((photo, index) => (
          <button
            key={`${round}-${index}-${photo.url}`}
            type="button"
            onClick={() => navigate(GALLERY_ROUTE)}
            className="group relative block w-full overflow-hidden rounded-xl focus:outline-none"
          >
            <img
              src={photo.url}
              alt={photo.caption || ''}
              loading="lazy"
              className="h-40 md:h-48 w-full object-cover shadow-sm transition-transform duration-300 group-hover:scale-105"
            />
            {photo.caption && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2 pt-8 text-left text-[11px] font-medium leading-snug text-white">
                {photo.caption}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}