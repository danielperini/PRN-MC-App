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

              {item.imagem && (
                <div className="mb-3 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  <img
                    src={item.imagem}
                    alt={item?.titulo || 'Notícia'}
                    className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                </div>
              )}

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
                    ? new Date(item.data_publicacao).toLocaleDateString('pt-BR')
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
