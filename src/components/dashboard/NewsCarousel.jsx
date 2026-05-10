import React, { useEffect, useMemo, useState } from 'react'
import { base44 } from '@/api/base44Client'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Newspaper
} from 'lucide-react'

function escapeSvgText(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function makeGeneratedImage(item = {}) {
  const title = escapeSvgText(item?.titulo || 'Notícia')
  const source = escapeSvgText(item?.fonte || 'Museus Centro')
  const tag = escapeSvgText(item?.tags?.[0] || 'Cultura')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="55%" stop-color="#374151"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <radialGradient id="r" cx="80%" cy="10%" r="80%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="900" height="520" fill="url(#g)"/>
      <rect width="900" height="520" fill="url(#r)"/>

      <circle cx="735" cy="95" r="90" fill="#ffffff" opacity="0.08"/>
      <circle cx="810" cy="180" r="42" fill="#ffffff" opacity="0.08"/>

      <rect x="52" y="54" width="190" height="38" rx="19" fill="#ffffff" opacity="0.14"/>

      <text
        x="76"
        y="79"
        font-family="Arial, Helvetica, sans-serif"
        font-size="18"
        font-weight="700"
        fill="#ffffff"
      >
        ${source}
      </text>

      <text
        x="58"
        y="174"
        font-family="Arial, Helvetica, sans-serif"
        font-size="24"
        font-weight="700"
        fill="#d1d5db"
      >
        ${tag}
      </text>

      <foreignObject x="54" y="205" width="760" height="210">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style="
            font-family: Arial, Helvetica, sans-serif;
            color: white;
            font-size: 46px;
            line-height: 1.08;
            font-weight: 800;
            letter-spacing: -1.2px;
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
        fill="#e5e7eb"
      >
        Imagem gerada automaticamente a partir do texto
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
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
  )
}

export default function NewsCarousel() {
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)

  // 🔁 carregar SOMENTE notícias publicadas no LeitorNoticias
  useEffect(() => {
    async function load() {
      try {
        let noticias = []

        try {
          noticias = await base44.entities.Noticia.filter({
            status: 'PUBLICADO'
          })
        } catch (e) {
          console.warn(
            'Entidade Noticia indisponível, tentando NewsHighlight'
          )

          noticias = await base44.entities.NewsHighlight.list(
            '-data_publicacao',
            50
          )
        }

        const curated = (Array.isArray(noticias) ? noticias : [])
          .filter((n) => {
            return (
              n?.status === 'PUBLICADO' ||
              n?.publicado === true ||
              !n?.status
            )
          })
          .sort((a, b) => {
            const da = new Date(
              b?.data_publicacao || b?.created_date || 0
            )

            const db = new Date(
              a?.data_publicacao || a?.created_date || 0
            )

            return da - db
          })
          .slice(0, 20)
          .map((n) => {
            const item = {
              titulo: n?.titulo || 'Sem título',
              resumo:
                n?.resumo ||
                n?.conteudo_resumido ||
                n?.descricao ||
                '',
              link: n?.link || n?.url || '#',
              data_publicacao:
                n?.data_publicacao || n?.created_date,

              imagem: getOriginalImage(n),

              tags: Array.isArray(n?.tags)
                ? n.tags
                : [],

              fonte: n?.fonte || 'Museus Centro'
            }

            return {
              ...item,

              imagem:
                item.imagem ||
                n?.imagem_ia ||
                n?.imagem_gerada ||
                makeGeneratedImage(item),

              imagemGerada:
                !item.imagem &&
                !n?.imagem_ia &&
                !n?.imagem_gerada
            }
          })

        setItems(curated)
      } catch (e) {
        console.error('Erro ao carregar notícias:', e)
        setItems([])
      }
    }

    load()
  }, [])

  // 🔁 rotação automática
  useEffect(() => {
    if (!items.length) return undefined

    const i = setInterval(() => {
      setIndex((prev) => (prev + 4) % items.length)
    }, 15000)

    return () => clearInterval(i)
  }, [items.length])

  // 📦 grupo de 4 cards
  const visible = useMemo(() => {
    if (!items.length) return []

    return Array.from(
      { length: Math.min(4, items.length) },
      (_, i) => items[(index + i) % items.length]
    )
  }, [items, index])

  const groupCount = Math.ceil(items.length / 4)
  const activeGroup = Math.floor(index / 4)

  function goPrevious() {
    if (!items.length) return

    setIndex((prev) => {
      const next = prev - 4

      return next < 0
        ? Math.max((groupCount - 1) * 4, 0)
        : next
    })
  }

  function goNext() {
    if (!items.length) return
    setIndex((prev) => (prev + 4) % items.length)
  }

  if (!visible.length) return null

  return (
    <section className="relative w-full rounded-[1.35rem] border border-gray-200 bg-white px-5 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-7 lg:px-10">

      {items.length > 4 && (
        <button
          type="button"
          aria-label="Notícias anteriores"
          onClick={goPrevious}
          className="absolute left-0 top-1/2 z-10 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-black shadow-lg transition-all hover:-translate-x-[55%] hover:bg-gray-50 lg:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

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

        {visible.map((item, i) => (
          <article
            key={`${item?.titulo || 'noticia'}-${i}-${index}`}
            className="group min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
          >
            <div className="flex h-full min-h-[150px] flex-col">

              <div className="mb-3 flex items-center justify-between gap-2">

                <span className="truncate rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-black shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  📡 {item.fonte}
                </span>

                {item.tags?.[0] && (
                  <span className="hidden truncate rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[9px] font-semibold text-gray-600 sm:inline">
                    {item.tags[0]}
                  </span>
                )}
              </div>

              {/* IMAGEM ORIGINAL OU GERADA */}
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">

                <img
                  src={item.imagem}
                  alt={item?.titulo || 'Notícia'}
                  className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src =
                      makeGeneratedImage(item)
                  }}
                />

              </div>

              <h3 className="line-clamp-2 text-base font-bold leading-snug text-black">
                {item.titulo}
              </h3>

              {item.resumo && (
                <p className="mt-3 line-clamp-3 flex-1 text-xs leading-relaxed text-gray-700">
                  {item.resumo}
                </p>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">

                <span className="truncate text-xs text-gray-500">
                  {item?.data_publicacao
                    ? new Date(
                        item.data_publicacao
                      ).toLocaleDateString('pt-BR')
                    : ''}
                </span>

                {item.link && item.link !== '#' ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-black bg-white px-2.5 py-1 text-xs font-semibold text-black transition-colors hover:bg-black hover:text-white"
                  >
                    Ver <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-black bg-white px-2.5 py-1 text-xs font-semibold text-black">
                    <Newspaper className="h-3.5 w-3.5" />
                    Interno
                  </span>
                )}

              </div>
            </div>
          </article>
        ))}

      </div>

      {items.length > 4 && (
        <button
          type="button"
          aria-label="Próximas notícias"
          onClick={goNext}
          className="absolute right-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-black shadow-lg transition-all hover:translate-x-[55%] hover:bg-gray-50 lg:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {items.length > 4 && (
        <div className="mt-6 flex justify-center gap-3">

          {Array.from({ length: groupCount }).map((_, idx) => {
            const active = activeGroup === idx

            return (
              <button
                key={idx}
                type="button"
                aria-label={`Ir para grupo ${idx + 1}`}
                onClick={() =>
                  setIndex((idx * 4) % items.length)
                }
                className={`h-2.5 w-2.5 rounded-full transition-all ${
                  active
                    ? 'bg-black'
                    : 'bg-gray-300 hover:bg-gray-500'
                }`}
              />
            )
          })}

        </div>
      )}

    </section>
  )
}
