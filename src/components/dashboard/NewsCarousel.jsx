import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Newspaper } from
'lucide-react';

function escapeSvgText(value = '') {
  return String(value).
  replace(/&/g, '&amp;').
  replace(/</g, '&lt;').
  replace(/>/g, '&gt;').
  replace(/"/g, '&quot;');
}

function pickIllustrationTheme(item = {}) {
  const text = `${item?.titulo || ''} ${item?.resumo || ''} ${(item?.tags || []).join(' ')} ${item?.fonte || ''}`.
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  toLowerCase();

  if (
  text.includes('museu') ||
  text.includes('exposicao') ||
  text.includes('galeria') ||
  text.includes('arte'))
  {
    return {
      tag: 'Museu',
      emoji: '🏛️',
      colors: ['#111827', '#7c2d12', '#f59e0b'],
      shapes: 'frames'
    };
  }

  if (
  text.includes('natureza') ||
  text.includes('paisagem') ||
  text.includes('parque') ||
  text.includes('jardim') ||
  text.includes('territorio'))
  {
    return {
      tag: 'Paisagem',
      emoji: '🌿',
      colors: ['#064e3b', '#047857', '#a7f3d0'],
      shapes: 'landscape'
    };
  }

  if (
  text.includes('educacao') ||
  text.includes('oficina') ||
  text.includes('formacao') ||
  text.includes('escola'))
  {
    return {
      tag: 'Educação',
      emoji: '📚',
      colors: ['#1e3a8a', '#2563eb', '#bfdbfe'],
      shapes: 'books'
    };
  }

  if (
  text.includes('cidade') ||
  text.includes('bh') ||
  text.includes('belo horizonte') ||
  text.includes('urbano') ||
  text.includes('rua'))
  {
    return {
      tag: 'Cidade',
      emoji: '🌆',
      colors: ['#312e81', '#6366f1', '#c7d2fe'],
      shapes: 'city'
    };
  }

  if (
  text.includes('tecnologia') ||
  text.includes('digital') ||
  text.includes('ia') ||
  text.includes('dados'))
  {
    return {
      tag: 'Tecnologia',
      emoji: '💡',
      colors: ['#0f172a', '#0ea5e9', '#bae6fd'],
      shapes: 'network'
    };
  }

  if (
  text.includes('patrimonio') ||
  text.includes('memoria') ||
  text.includes('historico') ||
  text.includes('historia'))
  {
    return {
      tag: 'Patrimônio',
      emoji: '🗿',
      colors: ['#422006', '#ca8a04', '#fde68a'],
      shapes: 'archive'
    };
  }

  return {
    tag: 'Cultura',
    emoji: '✨',
    colors: ['#111827', '#4b5563', '#e5e7eb'],
    shapes: 'abstract'
  };
}

function makeGeneratedImage(item = {}) {
  const theme = pickIllustrationTheme(item);

  const title = escapeSvgText(item?.titulo || 'Notícia');
  const source = escapeSvgText(item?.fonte || 'Museus Centro');
  const tag = escapeSvgText(item?.tags?.[0] || theme.tag);

  const [c1, c2, c3] = theme.colors;

  const visual = {
    frames: `
      <rect x="82" y="210" width="150" height="105" rx="14" fill="#ffffff" opacity="0.14"/>
      <rect x="260" y="190" width="180" height="135" rx="16" fill="#ffffff" opacity="0.20"/>
      <rect x="480" y="215" width="150" height="100" rx="14" fill="#ffffff" opacity="0.12"/>
      <line x1="60" y1="350" x2="840" y2="350" stroke="#ffffff" stroke-opacity="0.20" stroke-width="8"/>
    `,

    landscape: `
      <circle cx="725" cy="145" r="58" fill="#ffffff" opacity="0.28"/>
      <path d="M0 390 C160 300 240 330 370 260 C520 170 640 270 900 190 L900 520 L0 520 Z" fill="#ffffff" opacity="0.16"/>
      <path d="M0 430 C220 340 340 400 520 310 C680 230 760 320 900 260 L900 520 L0 520 Z" fill="#ffffff" opacity="0.22"/>
    `,

    books: `
      <rect x="95" y="250" width="95" height="170" rx="10" fill="#ffffff" opacity="0.20"/>
      <rect x="210" y="220" width="95" height="200" rx="10" fill="#ffffff" opacity="0.14"/>
      <rect x="325" y="270" width="95" height="150" rx="10" fill="#ffffff" opacity="0.22"/>
      <circle cx="690" cy="275" r="75" fill="#ffffff" opacity="0.12"/>
    `,

    city: `
      <rect x="70" y="250" width="80" height="190" rx="8" fill="#ffffff" opacity="0.15"/>
      <rect x="175" y="190" width="105" height="250" rx="8" fill="#ffffff" opacity="0.20"/>
      <rect x="310" y="235" width="90" height="205" rx="8" fill="#ffffff" opacity="0.13"/>
      <rect x="430" y="165" width="120" height="275" rx="8" fill="#ffffff" opacity="0.18"/>
      <rect x="585" y="270" width="90" height="170" rx="8" fill="#ffffff" opacity="0.14"/>
    `,

    network: `
      <circle cx="160" cy="260" r="24" fill="#ffffff" opacity="0.22"/>
      <circle cx="320" cy="190" r="18" fill="#ffffff" opacity="0.18"/>
      <circle cx="475" cy="300" r="28" fill="#ffffff" opacity="0.22"/>
      <circle cx="665" cy="210" r="20" fill="#ffffff" opacity="0.18"/>
      <line x1="160" y1="260" x2="320" y2="190" stroke="#ffffff" stroke-opacity="0.20" stroke-width="6"/>
      <line x1="320" y1="190" x2="475" y2="300" stroke="#ffffff" stroke-opacity="0.20" stroke-width="6"/>
      <line x1="475" y1="300" x2="665" y2="210" stroke="#ffffff" stroke-opacity="0.20" stroke-width="6"/>
    `,

    archive: `
      <rect x="95" y="220" width="270" height="180" rx="18" fill="#ffffff" opacity="0.14"/>
      <rect x="125" y="250" width="210" height="22" rx="11" fill="#ffffff" opacity="0.22"/>
      <rect x="125" y="295" width="170" height="18" rx="9" fill="#ffffff" opacity="0.18"/>
      <rect x="125" y="335" width="195" height="18" rx="9" fill="#ffffff" opacity="0.18"/>
      <circle cx="680" cy="290" r="82" fill="#ffffff" opacity="0.11"/>
    `,

    abstract: `
      <circle cx="160" cy="245" r="92" fill="#ffffff" opacity="0.13"/>
      <circle cx="760" cy="135" r="110" fill="#ffffff" opacity="0.10"/>
      <rect x="375" y="235" width="190" height="120" rx="32" fill="#ffffff" opacity="0.14" transform="rotate(-8 470 295)"/>
    `
  }[theme.shapes];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="58%" stop-color="${c2}"/>
          <stop offset="100%" stop-color="${c3}"/>
        </linearGradient>

        <radialGradient id="r" cx="80%" cy="10%" r="80%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="900" height="520" fill="url(#g)"/>
      <rect width="900" height="520" fill="url(#r)"/>

      ${visual}

      <rect
        x="52"
        y="52"
        width="240"
        height="42"
        rx="21"
        fill="#ffffff"
        opacity="0.16"
      />

      <text
        x="76"
        y="80"
        font-family="Arial, Helvetica, sans-serif"
        font-size="19"
        font-weight="700"
        fill="#ffffff"
      >
        ${theme.emoji} ${source}
      </text>

      <text
        x="58"
        y="154"
        font-family="Arial, Helvetica, sans-serif"
        font-size="24"
        font-weight="800"
        fill="#ffffff"
        opacity="0.86"
      >
        ${tag}
      </text>

      <foreignObject x="56" y="178" width="770" height="210">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style="
            font-family: Arial, Helvetica, sans-serif;
            color: white;
            font-size: 42px;
            line-height: 1.08;
            font-weight: 850;
            letter-spacing: -1px;
          "
        >
          ${title}
        </div>
      </foreignObject>

      <text
        x="58"
        y="462"
        font-family="Arial, Helvetica, sans-serif"
        font-size="18"
        font-weight="600"
        fill="#ffffff"
        opacity="0.80"
      >
        Imagem ilustrativa gerada automaticamente
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
    null);

}

export default function NewsCarousel() {
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        let noticias = [];

        try {
          noticias = await base44.entities.Noticia.filter({
            status: 'PUBLICADO'
          });
        } catch (e) {
          noticias = await base44.entities.NewsHighlight.list(
            '-data_publicacao',
            50
          );
        }

        const curated = (Array.isArray(noticias) ?
        noticias :
        []).

        filter((n) => {
          return (
            n?.status === 'PUBLICADO' ||
            n?.publicado === true ||
            !n?.status);

        }).
        sort((a, b) => {
          const da = new Date(
            b?.data_publicacao ||
            b?.created_date ||
            0
          );

          const db = new Date(
            a?.data_publicacao ||
            a?.created_date ||
            0
          );

          return da - db;
        }).
        slice(0, 20).
        map((n) => {
          const item = {
            titulo: n?.titulo || 'Sem título',

            resumo:
            n?.resumo ||
            n?.conteudo_resumido ||
            n?.descricao ||
            '',

            link:
            n?.link ||
            n?.url ||
            '#',

            data_publicacao:
            n?.data_publicacao ||
            n?.created_date,

            imagem: getOriginalImage(n),

            tags: Array.isArray(n?.tags) ?
            n.tags :
            [],

            fonte:
            n?.fonte ||
            'Museus Centro'
          };

          return {
            ...item,

            imagem:
            item.imagem ||
            n?.imagem_ia ||
            n?.imagem_gerada ||
            makeGeneratedImage(item)
          };
        });

        setItems(curated);
      } catch (e) {
        console.error(
          'Erro ao carregar notícias:',
          e
        );

        setItems([]);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!items.length) return undefined;

    const i = setInterval(() => {
      setIndex((prev) => (prev + 4) % items.length);
    }, 15000);

    return () => clearInterval(i);
  }, [items.length]);

  const visible = useMemo(() => {
    if (!items.length) return [];

    return Array.from(
      { length: Math.min(4, items.length) },
      (_, i) => items[(index + i) % items.length]
    );
  }, [items, index]);

  const groupCount = Math.ceil(items.length / 4);
  const activeGroup = Math.floor(index / 4);

  function goPrevious() {
    if (!items.length) return;

    setIndex((prev) => {
      const next = prev - 4;

      return next < 0 ?
      Math.max((groupCount - 1) * 4, 0) :
      next;
    });
  }

  function goNext() {
    if (!items.length) return;

    setIndex((prev) => (prev + 4) % items.length);
  }

  if (!visible.length) return null;

  return (
    <section className="relative w-full rounded-[1.35rem] border border-gray-200 bg-white px-5 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-7 lg:px-10">

      {items.length > 4 &&
      <button
        type="button"
        aria-label="Notícias anteriores"
        onClick={goPrevious}
        className="absolute left-0 top-1/2 z-10 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-black shadow-lg transition-all hover:-translate-x-[55%] hover:bg-gray-50 lg:flex">
        
          <ChevronLeft className="h-5 w-5" />
        </button>
      }

      <div className="mb-5 flex items-center justify-between gap-4">

        <div className="flex items-center gap-3">

          <div className="rounded-xl bg-black p-2 text-white">
            <Newspaper className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-black">
              Notícias Publicadas
            </h2>

            <p className="text-sm text-gray-500">
              Conteúdo publicado no módulo LeitorNoticias
            </p>
          </div>

        </div>

      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">

        {visible.map((item, i) =>
        <article
          key={`${item?.titulo || 'noticia'}-${i}-${index}`}
          className="group min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md">
          
            <div className="flex h-full min-h-[150px] flex-col">

              <div className="mb-3 flex items-center justify-between gap-2">

                <span className="truncate rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-black shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  📡 {item.fonte}
                </span>

                {item.tags?.[0] &&
              <span className="hidden truncate rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[9px] font-semibold text-gray-600 sm:inline">
                    {item.tags[0]}
                  </span>
              }

              </div>

              <div className="mb-3 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">

                <img
                src={item.imagem || makeGeneratedImage(item)}
                alt={item?.titulo || 'Notícia'}
                className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] hidden"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.src =
                  makeGeneratedImage(item);
                }} />
              

              </div>

              <h3 className="line-clamp-2 text-base font-bold leading-snug text-black">
                {item.titulo}
              </h3>

              {item.resumo &&
            <p className="mt-3 line-clamp-3 flex-1 text-xs leading-relaxed text-gray-700">
                  {item.resumo}
                </p>
            }

              <div className="mt-5 flex items-center justify-between gap-3">

                <span className="truncate text-xs text-gray-500">
                  {item?.data_publicacao ?
                new Date(
                  item.data_publicacao
                ).toLocaleDateString('pt-BR') :
                ''}
                </span>

                {item.link && item.link !== '#' ?
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-black bg-white px-2.5 py-1 text-xs font-semibold text-black transition-colors hover:bg-black hover:text-white">
                
                    Ver <ExternalLink className="h-3.5 w-3.5" />
                  </a> :

              <span className="inline-flex items-center gap-1 rounded-full border border-black bg-white px-2.5 py-1 text-xs font-semibold text-black">
                    <Newspaper className="h-3.5 w-3.5" />
                    Interno
                  </span>
              }

              </div>

            </div>
          </article>
        )}

      </div>

      {items.length > 4 &&
      <button
        type="button"
        aria-label="Próximas notícias"
        onClick={goNext}
        className="absolute right-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-black shadow-lg transition-all hover:translate-x-[55%] hover:bg-gray-50 lg:flex">
        
          <ChevronRight className="h-5 w-5" />
        </button>
      }

      {items.length > 4 &&
      <div className="mt-6 flex justify-center gap-3">

          {Array.from({ length: groupCount }).map((_, idx) => {
          const active = activeGroup === idx;

          return (
            <button
              key={idx}
              type="button"
              aria-label={`Ir para grupo ${idx + 1}`}
              onClick={() =>
              setIndex(idx * 4 % items.length)
              }
              className={`h-2.5 w-2.5 rounded-full transition-all ${
              active ?
              'bg-black' :
              'bg-gray-300 hover:bg-gray-500'}`
              } />);


        })}

        </div>
      }

    </section>);

}