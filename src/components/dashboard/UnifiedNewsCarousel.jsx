import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
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
    <div className="group min-w-0 rounded-xl border border-black/70 bg-white p-2.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-black hover:shadow-md">
      <div className="flex h-full min-h-[92px] flex-col">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="truncate rounded-full border border-black/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
            {item.fonte}
          </span>

          {item.tags?.[0] && (
            <span className="hidden truncate rounded-full border border-black/40 px-1.5 py-0.5 text-[9px] font-semibold text-gray-600 sm:inline">
              {item.tags[0]}
            </span>
          )}
        </div>

        <h3 className="line-clamp-1 text-xs font-bold leading-tight text-black">
          {item.titulo}
        </h3>

        <p className="mt-1 line-clamp-1 flex-1 text-[11px] leading-snug text-gray-700">
          {item.resumo}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] text-gray-500">
            {item.data_publicacao || todayBR()}
          </span>

          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-black/70 px-2 py-0.5 text-[10px] font-semibold text-black transition-colors hover:bg-black hover:text-white"
            >
              Ver <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-black/70 px-2 py-0.5 text-[10px] font-semibold text-black">
              <Newspaper className="h-3 w-3" /> Interno
            </span>
          )}
        </div>
      </div>
    </div>
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
    <section className="mb-6 rounded-2xl border border-black/70 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-black">
            Notícias e destaques
          </p>
          <p className="text-[10px] text-gray-500">
            Curadoria diária com rotação automática a cada 15 segundos
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUpdateWithIA}
          disabled={updating}
          className="h-7 border-black/70 px-2 text-[10px] text-black hover:bg-black hover:text-white"
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${updating ? 'animate-spin' : ''}`} />
          IA
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {visibleItems.map((item, idx) => (
          <NewsCard key={`${item.titulo}-${idx}-${offset}`} item={item} />
        ))}
      </div>

      {items.length > 4 && (
        <div className="mt-2 flex justify-center gap-1">
          {Array.from({ length: Math.ceil(items.length / 4) }).map((_, idx) => {
            const active = Math.floor(offset / 4) === idx;
            return (
              <button
                key={idx}
                type="button"
                aria-label={`Ir para grupo ${idx + 1}`}
                onClick={() => setOffset((idx * 4) % items.length)}
                className={`h-1.5 rounded-full transition-all ${
                  active ? 'w-5 bg-black' : 'w-1.5 bg-gray-300 hover:bg-gray-500'
                }`}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
