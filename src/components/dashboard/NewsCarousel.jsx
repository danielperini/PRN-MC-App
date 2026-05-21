import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

const NEWS_CACHE_KEY = 'museus_centro_news_highlight_cache_v3';
const NEWS_REFRESH_MS = 2 * 24 * 60 * 60 * 1000;

function readNewsCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeNewsCache(items = []) {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({
      items,
      savedAt: Date.now(),
    }));
  } catch {
    // cache local é apenas otimização
  }
}

function isCacheFresh(cache) {
  return Boolean(
    cache?.items?.length &&
    Date.now() - Number(cache.savedAt || 0) < NEWS_REFRESH_MS
  );
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeSvgText(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDailyNumber() {
  const now = new Date();
  const d = new Date(now);
  const utcHour = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();

  if (utcHour < 9 || (utcHour === 9 && utcMinutes === 0)) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

function getOriginalImage(n = {}) {
  return (
    n?.imagem_artigo ||
    n?.imagem_original ||
    n?.imagem_origem ||
    n?.image ||
    n?.image_url ||
    n?.cover_image ||
    n?.cover_url ||
    n?.capa ||
    n?.thumbnail ||
    n?.thumbnail_url ||
    n?.imagem ||
    n?.imagem_url ||
    n?.url_imagem ||
    null
  );
}

function makeGeneratedImage(item = {}) {
  const title = escapeSvgText(item?.titulo || 'Notícia');
  const source = escapeSvgText(item?.fonte || 'Museus Centro');
  const tag = escapeSvgText(item?.tags?.[0] || 'Cultura');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="60%" stop-color="#374151"/>
          <stop offset="100%" stop-color="#e5e7eb"/>
        </linearGradient>
      </defs>
      <rect width="900" height="520" fill="url(#g)"/>
      <circle cx="760" cy="120" r="120" fill="#ffffff" opacity="0.10"/>
      <circle cx="160" cy="270" r="95" fill="#ffffff" opacity="0.12"/>
      <rect x="56" y="52" width="260" height="42" rx="21" fill="#ffffff" opacity="0.16"/>
      <text x="76" y="80" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#ffffff">${source}</text>
      <text x="58" y="154" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#ffffff" opacity="0.86">${tag}</text>
      <foreignObject x="56" y="178" width="770" height="210">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; color: white; font-size: 42px; line-height: 1.08; font-weight: 850; letter-spacing: -1px;">${title}</div>
      </foreignObject>
      <text x="58" y="462" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="#ffffff" opacity="0.80">Imagem ilustrativa gerada automaticamente</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isPublishedNews(item = {}) {
  if (!item?.id) return false;
  if (item?.ativo === false) return false;
  if (item?.deleted === true || item?.deletado === true || item?.removido === true) return false;

  const status = String(item?.status_curadoria || item?.status || '').toUpperCase();
  return status === 'PUBLICADO_AUTO' || status === 'APROVADO_MANUAL' || status === 'PUBLICADO';
}

function normalizeNewsItem(n = {}) {
  const item = {
    id: n?.id,
    titulo: n?.titulo || 'Sem título',
    resumo: n?.resumo || n?.conteudo_resumido || n?.descricao || '',
    link: n?.link || n?.url || '#',
    data_publicacao: n?.data_publicacao || n?.created_date,
    imagem: getOriginalImage(n),
    tags: Array.isArray(n?.tags) ? n.tags : [],
    fonte: n?.fonte || 'Museus Centro',
    status_curadoria: n?.status_curadoria || n?.status || '',
    ativo: n?.ativo !== false,
    updated_date: n?.updated_date || n?.modified_date || n?.created_date || '',
  };

  return {
    ...item,
    imagem: item.imagem || n?.imagem_ia || n?.imagem_gerada || makeGeneratedImage(item),
  };
}

function sortByPublishedDate(a, b) {
  const da = new Date(a?.data_publicacao || a?.updated_date || 0);
  const db = new Date(b?.data_publicacao || b?.updated_date || 0);
  return db - da;
}

function getDailyStartIndex(total, pageSize = 4) {
  if (!total) return 0;
  return (getDailyNumber() * pageSize) % total;
}

export default function NewsCarousel() {
  const { isCoordenador } = useCurrentUser();
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function load({ force = false } = {}) {
      const cached = readNewsCache();

      if (!isCoordenador && cached?.items?.length) {
        if (!isMounted) return;
        setItems(cached.items);
        setIndex(getDailyStartIndex(cached.items.length, 4));
        return;
      }

      if (!force && isCacheFresh(cached)) {
        if (!isMounted) return;
        setItems(cached.items);
        setIndex(getDailyStartIndex(cached.items.length, 4));
        return;
      }

      try {
        const noticias = await base44.entities.NewsHighlight.filter(
          { ativo: true },
          '-created_date',
          100
        );

        const curated = (Array.isArray(noticias) ? noticias : [])
          .filter(isPublishedNews)
          .filter((n) =>
            normalizeText(n?.titulo) !==
            normalizeText('Porto submerso egípcio pode levar ao túmulo de Cleópatra')
          )
          .sort(sortByPublishedDate)
          .slice(0, 100)
          .map(normalizeNewsItem);

        writeNewsCache(curated);

        if (!isMounted) return;
        setItems(curated);
        setIndex(getDailyStartIndex(curated.length, 4));
      } catch (error) {
        if (cached?.items?.length) {
          if (!isMounted) return;
          setItems(cached.items);
          setIndex(getDailyStartIndex(cached.items.length, 4));
          return;
        }

        console.warn(
          'Notícias publicadas indisponíveis no dashboard. Mantendo carrossel vazio.',
          error
        );

        if (isMounted) setItems([]);
      }
    }

    load();
    const interval = isCoordenador
      ? setInterval(() => load({ force: true }), NEWS_REFRESH_MS)
      : null;

    const handleVisibility = () => {
      if (!document.hidden && isCoordenador) load();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isCoordenador]);

  const visible = useMemo(() => {
    if (!items.length) return [];
    return Array.from({ length: Math.min(4, items.length) }, (_, i) => items[(index + i) % items.length]);
  }, [items, index]);

  const groupCount = Math.max(1, Math.ceil(items.length / 4));
  const activeGroup = Math.floor(index / 4);

  function goPrevious() {
    if (!items.length) return;
    setIndex((prev) => {
      const next = prev - 4;
      return next < 0 ? Math.max((groupCount - 1) * 4, 0) : next;
    });
  }

  function goNext() {
    if (!items.length) return;
    setIndex((prev) => (prev + 4) % items.length);
  }

  if (!visible.length) return null;

  return (
    <section className="relative w-full rounded-[1.35rem] border border-border bg-card px-5 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-7 lg:px-10">
      {items.length > 4 && (
        <button type="button" aria-label="Notícias anteriores" onClick={goPrevious} className="absolute left-0 top-1/2 z-10 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-all hover:-translate-x-[55%] hover:bg-secondary lg:flex">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary p-2 text-primary-foreground"><Newspaper className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Notícias Publicadas</h2>
            <p className="text-sm text-muted-foreground">Rodízio diário das publicações do LeitorNoticias</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((item, i) => (
          <article key={`${item?.id || item?.titulo || 'noticia'}-${i}-${index}`} className="group min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-muted hover:shadow-md">
            <div className="flex h-full min-h-[150px] flex-col">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="truncate rounded-full border border-border bg-secondary px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-secondary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]">📡 {item.fonte}</span>
                {item.tags?.[0] && <span className="hidden truncate rounded-full border border-border bg-secondary px-2 py-1 text-[9px] font-semibold text-secondary-foreground sm:inline">{item.tags[0]}</span>}
              </div>

              <div className="mb-3 overflow-hidden rounded-xl border border-border bg-secondary">
                <img src={item.imagem || makeGeneratedImage(item)} alt={item?.titulo || 'Notícia'} className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] hidden" loading="lazy" onError={(event) => { event.currentTarget.src = makeGeneratedImage(item); }} />
              </div>

              <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground">{item.titulo}</h3>
              {item.resumo && <p className="mt-3 line-clamp-3 flex-1 text-xs leading-relaxed text-foreground">{item.resumo}</p>}

              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="truncate text-xs text-muted-foreground">{item?.data_publicacao ? new Date(item.data_publicacao).toLocaleDateString('pt-BR') : ''}</span>
                {item.link && item.link !== '#' ? (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground">Ver <ExternalLink className="h-3.5 w-3.5" /></a>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"><Newspaper className="h-3.5 w-3.5" />Interno</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {items.length > 4 && (
        <button type="button" aria-label="Próximas notícias" onClick={goNext} className="absolute right-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-all hover:translate-x-[55%] hover:bg-secondary lg:flex">
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {items.length > 4 && (
        <div className="mt-6 flex justify-center gap-3">
          {Array.from({ length: groupCount }).map((_, idx) => {
            const active = activeGroup === idx;
            return <button key={idx} type="button" aria-label={`Ir para grupo ${idx + 1}`} onClick={() => setIndex((idx * 4) % items.length)} className={`h-2.5 w-2.5 rounded-full transition-all ${active ? 'bg-primary' : 'bg-muted hover:bg-muted-foreground'}`} />;
          })}
        </div>
      )}
    </section>
  );
}
