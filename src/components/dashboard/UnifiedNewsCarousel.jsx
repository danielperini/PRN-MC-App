import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FALLBACK_NEWS = [
  {
    titulo: 'Museus Centro em destaque',
    resumo: 'Acompanhe as principais ações do projeto Museus Centro.',
    fonte: 'Museus Centro',
    data_publicacao: '',
    link: '',
    tags: ['Projeto'],
  },
  {
    titulo: 'Programação cultural integrada',
    resumo: 'Atividades, ações educativas e eventos dos museus parceiros.',
    fonte: 'Agenda',
    data_publicacao: '',
    link: '',
    tags: ['Programação'],
  },
  {
    titulo: 'Relatórios atualizados',
    resumo: 'Indicadores e informações consolidadas disponíveis no painel.',
    fonte: 'Sistema',
    data_publicacao: '',
    link: '',
    tags: ['Relatórios'],
  },
  {
    titulo: 'Gestão e transparência',
    resumo: 'Acompanhamento de metas, orçamento e execução do projeto.',
    fonte: 'Gestão',
    data_publicacao: '',
    link: '',
    tags: ['Indicadores'],
  },
];

function todayBR() {
  return new Date().toLocaleDateString('pt-BR');
}

function getDailySeed() {
  const now = new Date();
  return Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`);
}

function seededShuffle(items) {
  const arr = [...items];
  let seed = getDailySeed();

  function random() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function normalizeNews(item) {
  return {
    titulo: item?.titulo || item?.title || 'Notícia sem título',
    resumo: item?.resumo || item?.description || item?.descricao || 'Sem resumo disponível.',
    fonte: item?.fonte || item?.source || 'Notícia',
    data_publicacao: item?.data_publicacao || item?.date || todayBR(),
    link: item?.link || item?.url || '',
    tags: Array.isArray(item?.tags) ? item.tags : [],
  };
}

function NewsCard({ item }) {
  return (
    <article className="group min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md">
      <div className="flex h-full min-h-[210px] flex-col">
        <div className="mb-5 flex items-center justify-between gap-2">
          <span className="truncate rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-black shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {item.fonte}
          </span>

          {item.tags?.[0] && (
            <span className="hidden truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-600 sm:inline">
              {item.tags[0]}
            </span>
          )}
        </div>

        <h3 className="line-clamp-2 text-lg font-bold leading-tight text-black">
          {item.titulo}
        </h3>

        <p className="mt-4 line-clamp-4 flex-1 text-sm leading-relaxed text-gray-700">
          {item.resumo}
        </p>

        <div className="mt-8 flex items-center justify-between gap-3">
          <span className="truncate text-sm text-gray-500">
            {item.data_publicacao || todayBR()}
          </span>

          {item.link ? (
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
  );
}

export default function NewsCarousel() {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [updating, setUpdating] = useState(false);

  async function loadNews() {
    try {
      const [newsHighlights, momentos] = await Promise.all([
        base44.entities.NewsHighlight?.list?.('-data_publicacao', 50).catch(() => []) || [],
        base44.entities.Momento?.list?.('-created_date', 20).catch(() => []) || [],
      ]);

      const normalized = [
        ...(newsHighlights || []).map(normalizeNews),
        ...(momentos || []).map((m) => normalizeNews({
          titulo: m.titulo || m.nome || 'Destaque interno',
          resumo: m.resumo || m.descricao || 'Momento relevante do projeto.',
          fonte: 'Museus Centro',
          data_publicacao: m.data_publicacao || m.created_date,
          link: m.link || '',
          tags: ['Destaque'],
        })),
      ];

      const curated = seededShuffle(normalized.length ? normalized : FALLBACK_NEWS).slice(0, 20);
      setItems(curated);
      setOffset(0);
    } catch (e) {
      setItems(seededShuffle(FALLBACK_NEWS).slice(0, 20));
    }
  }

  useEffect(() => {
    loadNews();
  }, []);

  useEffect(() => {
    if (!items.length) return undefined;

    const timer = window.setInterval(() => {
      setOffset((prev) => (prev + 4) % items.length);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [items.length]);

  const visibleItems = useMemo(() => {
    if (!items.length) return [];
    return Array.from({ length: Math.min(4, items.length) }, (_, i) => items[(offset + i) % items.length]);
  }, [items, offset]);

  const groupCount = Math.ceil(items.length / 4);
  const activeGroup = Math.floor(offset / 4);

  function goPrevious() {
    if (!items.length) return;
    setOffset((prev) => {
      const next = prev - 4;
      return next < 0 ? Math.max((groupCount - 1) * 4, 0) : next;
    });
  }

  function goNext() {
    if (!items.length) return;
    setOffset((prev) => (prev + 4) % items.length);
  }

  async function handleUpdateWithIA() {
    setUpdating(true);

    try {
      if (base44.functions?.invoke) {
        await base44.functions.invoke('searchAndIndexNews', {});
      }
      await loadNews();
    } catch (e) {
      await loadNews();
    } finally {
      setUpdating(false);
    }
  }

  if (!visibleItems.length) return null;

  return (
    <section className="relative mb-8 rounded-[1.35rem] border border-gray-200 bg-white px-8 py-7 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:px-10 lg:px-14">
      <div className="mb-7 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">
            Notícias e destaques
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Curadoria diária com rotação automática a cada 15 segundos
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUpdateWithIA}
          disabled={updating}
          className="h-9 rounded-xl border-gray-200 bg-white px-3 text-xs text-black shadow-sm hover:bg-black hover:text-white"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${updating ? 'animate-spin' : ''}`} />
          IA
        </Button>
      </div>

      {items.length > 4 && (
        <button
          type="button"
          aria-label="Notícias anteriores"
          onClick={goPrevious}
          className="absolute left-0 top-1/2 z-10 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-black shadow-lg transition-all hover:-translate-x-[55%] hover:bg-gray-50 lg:flex"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {visibleItems.map((item, idx) => (
          <NewsCard key={`${item.titulo}-${idx}-${offset}`} item={item} />
        ))}
      </div>

      {items.length > 4 && (
        <button
          type="button"
          aria-label="Próximas notícias"
          onClick={goNext}
          className="absolute right-0 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-black shadow-lg transition-all hover:translate-x-[55%] hover:bg-gray-50 lg:flex"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {items.length > 4 && (
        <div className="mt-7 flex justify-center gap-3">
          {Array.from({ length: groupCount }).map((_, idx) => {
            const active = activeGroup === idx;
            return (
              <button
                key={idx}
                type="button"
                aria-label={`Ir para grupo ${idx + 1}`}
                onClick={() => setOffset((idx * 4) % items.length)}
                className={`h-2.5 w-2.5 rounded-full transition-all ${
                  active ? 'bg-black' : 'bg-gray-300 hover:bg-gray-500'
                }`}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
