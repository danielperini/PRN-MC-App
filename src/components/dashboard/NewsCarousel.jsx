import React, { useEffect, useState, useMemo } from 'react'
import { base44 } from '@/api/base44Client'
import { ExternalLink, Newspaper } from 'lucide-react'

export default function NewsCarousel() {
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)

  // 🔁 carregar notícias (máx 20)
  useEffect(() => {
    async function load() {
      try {
        const news = await base44.entities.NewsHighlight.list('-data_publicacao', 50)

        const curated = (news || [])
          .slice(0, 20)
          .map(n => ({
            titulo: n.titulo,
            resumo: n.resumo,
            link: n.link,
            data_publicacao: n.data_publicacao,
            imagem: n.imagem_url,
            tags: n.tags || [],
            fonte: n.fonte || 'Notícia'
          }))

        setItems(curated)
      } catch (e) {
        console.error(e)
      }
    }

    load()
  }, [])

  // 🔁 rotação a cada 15s
  useEffect(() => {
    const i = setInterval(() => {
      setIndex(prev => (prev + 4) % items.length)
    }, 15000)

    return () => clearInterval(i)
  }, [items])

  // 📦 grupo de 4 cards
  const visible = useMemo(() => {
    return items.slice(index, index + 4)
  }, [items, index])

  if (!visible.length) return null

  return (
    <div className="w-full border-2 border-black rounded-2xl p-4 bg-white">

      <div className="grid grid-cols-4 gap-3">

        {visible.map((item, i) => (
          <div
            key={i}
            className="border-2 border-black rounded-xl p-3 flex flex-col justify-between bg-white hover:bg-gray-50 transition-all"
          >
            {/* header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 border border-black rounded-full">
                📡 {item.fonte}
              </span>
            </div>

            {/* título */}
            <h3 className="text-sm font-bold text-black leading-tight line-clamp-1">
              {item.titulo}
            </h3>

            {/* resumo */}
            <p className="text-xs text-gray-700 line-clamp-1 mt-1">
              {item.resumo}
            </p>

            {/* footer */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-gray-600">
                {item.data_publicacao}
              </span>

              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] border border-black px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-black hover:text-white transition-all"
                >
                  Ver <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-[10px] border border-black px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Newspaper className="w-3 h-3" /> Interno
                </span>
              )}
            </div>
          </div>
        ))}

      </div>

    </div>
  )
}
