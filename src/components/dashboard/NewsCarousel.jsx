import React, { useEffect, useState, useMemo } from 'react'
import { base44 } from '@/api/base44Client'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Newspaper
} from 'lucide-react'

export default function NewsCarousel() {
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)

  // 🔁 carregar SOMENTE notícias publicadas no LeitorNoticias
  useEffect(() => {
    async function load() {
      try {
        let noticias = []

        // 🔥 tenta entidade principal do LeitorNoticias
        try {
          noticias = await base44.entities.Noticia.filter({
            status: 'PUBLICADO'
          })
        } catch (e) {
          console.warn('Entidade Noticia indisponível, tentando NewsHighlight')

          // 🔥 fallback seguro
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
          .map((n) => ({
            titulo: n?.titulo || 'Sem título',
            resumo: n?.resumo || n?.conteudo_resumido || '',
            link: n?.link || n?.url || '#',
            data_publicacao: n?.data_publicacao,
            imagem:
              n?.imagem ||
              n?.imagem_url ||
              n?.thumbnail ||
              null,
            tags: Array.isArray(n?.tags) ? n.tags : [],
            fonte: n?.fonte || 'Museus Centro'
          }))

        setItems(curated)
      } catch (e) {
        console.error('Erro ao carregar notícias:', e)
        setItems([])
      }
    }

    load()
  }, [])

  // 🔁 rotação a cada 15s
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

      <div className="mb-6 flex items-center justify-between gap-4">
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
            className="group min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
          >
            <div className="flex h-full min-h-[210px] flex-col">

              <div className="mb-5 flex items-center justify-between gap-2">
                <span className="truncate rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-black shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  📡 {item.fonte}
                </span>

                {item.tags?.[0] && (
                  <span className="hidden truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-600 sm:inline">
                    {item.tags[0]}
                  </span>
                )}
              </div>

              {item.imagem && (
                <div className="mb-4 overflow-hidden rounded-xl border border-gray-100">
                  <img
                    src={item.imagem}
                    alt={item?.titulo || 'Notícia'}
                    className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </div>
              )}

              <h3 className="line-clamp-2 text-lg font-bold leading-tight text-black">
                {item.titulo}
              </h3>

              <p className="mt-4 line-clamp-4 flex-1 text-sm leading-relaxed text-gray-700">
                {item.resumo}
              </p>

              <div className="mt-8 flex items-center justify-between gap-3">

                <span className="truncate text-sm text-gray-500">
                  {item?.data_publicacao
                    ? new Date(item.data_publicacao).toLocaleDateString('pt-BR')
                    : ''}
                </span>

                {item.link && item.link !== '#' ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-black bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-white"
                  >
                    Ver <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-black bg-white px-3 py-1.5 text-sm font-semibold text-black">
                    <Newspaper className="h-4 w-4" /> Interno
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
        <div className="mt-7 flex justify-center gap-3">

          {Array.from({ length: groupCount }).map((_, idx) => {
            const active = activeGroup === idx

            return (
              <button
                key={idx}
                type="button"
                aria-label={`Ir para grupo ${idx + 1}`}
                onClick={() => setIndex((idx * 4) % items.length)}
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
