import React, { useMemo, useState } from 'react';
import { ExternalLink, Search, Newspaper, TrendingUp, Share2, Globe2, CalendarDays, Sparkles, FolderOpen, Image, Megaphone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const CLIPPING_START_DATE = '2026-02-02';

const KEYWORDS = [
  'Museus Centro',
  'Viaduto das Artes',
  'Museu Histórico Abílio Barreto',
  'Abílio Barreto',
  'MHAB',
  'Museu da Moda',
  'MUMO',
  'Museu da Imagem e do Som',
  'MIS BH',
  'Noturno nos Museus',
  'Semana Nacional de Museus',
  'Fundação Municipal de Cultura',
];

const ARCHIVE_MONTH_LINKS = [
  {
    key: '2026-01',
    label: 'janeiro de 2026',
    url: 'https://portalbelohorizonte.com.br/museuscentro/2025/noticias',
    helper: 'Arquivo mensal anterior à data inicial do clipping',
  },
  {
    key: '2025-12',
    label: 'dezembro de 2025',
    url: 'https://portalbelohorizonte.com.br/museuscentro/2025/noticias',
    helper: 'Arquivo histórico do projeto',
  },
];

const DRIVE_FOLDERS = [
  {
    id: '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    name: 'Releases e Clipping',
    url: 'https://drive.google.com/drive/folders/1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    typeLabel: 'Releases e Clipping',
  },
  {
    id: '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    name: 'Imagens',
    url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    typeLabel: 'Imagens',
  },
  {
    id: '1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    name: 'Redes Sociais',
    url: 'https://drive.google.com/drive/folders/1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    typeLabel: 'Redes Sociais',
  },
];

const CLIPPING_ITEMS = [
  {
    id: 'pbh-semana-museus-2026-05',
    title: '24ª Semana Nacional de Museus agita a programação de maio em BH',
    sourceName: 'PBH Notícias',
    sourceType: 'Imprensa institucional',
    publishedDate: '2026-05-05',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'MIS BH', 'MHAB', 'MUMO', 'Viaduto das Artes'],
    url: 'https://prefeitura.pbh.gov.br/noticias/24a-semana-nacional-de-museus-agita-programacao-de-maio-em-bh',
    summary: 'Publicação da PBH sobre a programação de maio, com menção direta ao projeto Museus Centro e aos museus participantes.',
  },
  {
    id: 'bheventos-semana-museus-2026-05',
    title: '24ª Semana nacional de museus agita a programação de maio do Museus Centro',
    sourceName: 'BH Eventos',
    sourceType: 'Agenda cultural',
    publishedDate: '2026-05-06',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Semana Nacional de Museus', 'MIS BH', 'MHAB', 'MUMO'],
    url: 'https://www.bheventos.com.br/noticia/05-06-2026-24-semana-nacional-de-museus-agita-a-programacao-de-maio-do-museus-centro',
    summary: 'Agenda cultural com chamada para a programação de maio do Museus Centro.',
  },
  {
    id: 'culturadoria-semana-museus-2026-05',
    title: 'Semana Nacional de Museus movimenta espaços culturais de BH',
    sourceName: 'Culturadoria',
    sourceType: 'Mídia cultural',
    publishedDate: '2026-05-06',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['MIS BH', 'MUMO', 'MHAB', 'Museus Centro'],
    url: 'https://culturadoria.com.br/semana-dos-museus-em-bh/',
    summary: 'Cobertura cultural sobre a Semana Nacional de Museus e programação dos espaços associados ao projeto.',
  },
  {
    id: 'pbh-projeto-museus-centro-2026-04',
    title: 'Projeto Museus Centro',
    sourceName: 'PBH / Fundação Municipal de Cultura',
    sourceType: 'Institucional',
    publishedDate: '2026-04-09',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Viaduto das Artes', 'MHAB', 'MIS BH', 'MUMO'],
    url: 'https://prefeitura.pbh.gov.br/fundacao-municipal-de-cultura/projeto-museus-centro',
    summary: 'Página institucional descrevendo o projeto, museus participantes e parceria com o Viaduto das Artes.',
  },
  {
    id: 'portal-bh-museus-centro-2026-04',
    title: 'Museus Centro - página oficial no Portal Belo Horizonte',
    sourceName: 'Portal Belo Horizonte',
    sourceType: 'Canal institucional',
    publishedDate: '2026-04-10',
    relevance: 'Média/Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'MHAB', 'MIS BH', 'MUMO', 'Viaduto das Artes'],
    url: 'https://portalbelohorizonte.com.br/en/node/44715',
    summary: 'Página oficial com apresentação do projeto, programação regular e descrição dos museus participantes.',
  },
  {
    id: 'pbh-museus-centro-abril-2026',
    title: 'Projeto Museus Centro traz experimentações visuais e manuais em abril',
    sourceName: 'PBH Notícias',
    sourceType: 'Imprensa institucional',
    publishedDate: '2026-04-01',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Programação', 'MIS BH', 'MHAB', 'MUMO', 'Viaduto das Artes'],
    url: 'https://prefeitura.pbh.gov.br/noticias/projeto-museus-centro-traz-experimentacoes-visuais-e-manuais-em-abril',
    summary: 'Divulgação direta da programação de abril do Museus Centro.',
  },
  {
    id: 'culturadoria-museus-centro-abril-2026',
    title: 'Museus Centro com inscrições abertas para oficinas e experiências',
    sourceName: 'Culturadoria',
    sourceType: 'Mídia cultural',
    publishedDate: '2026-04-10',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Oficinas', 'Programação'],
    url: 'https://culturadoria.com.br/museus-centro-em-abril/',
    summary: 'Publicação de agenda cultural com foco em oficinas e experiências do projeto.',
  },
  {
    id: 'reddit-bh-museus-2026-04',
    title: 'Discussão espontânea sobre museus em BH',
    sourceName: 'Reddit Belo Horizonte',
    sourceType: 'Rede social',
    publishedDate: '2026-04-20',
    relevance: 'Média',
    platform: 'Reddit',
    relatedTo: ['Museu da Moda', 'MIS BH', 'Museus de BH'],
    url: 'https://www.reddit.com/r/BeloHorizonte/comments/1rb4q2y/museus_em_bh/',
    summary: 'Menções espontâneas a museus de Belo Horizonte em comunidade aberta.',
  },
  {
    id: 'pbh-mulheres-museus-centro-2026-03',
    title: 'Mês das Mulheres é destaque na programação dos Museus do Centro de BH',
    sourceName: 'PBH Notícias',
    sourceType: 'Imprensa institucional',
    publishedDate: '2026-03-09',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'MIS BH', 'MHAB', 'MUMO', 'Viaduto das Artes'],
    url: 'https://prefeitura.pbh.gov.br/noticias/mes-das-mulheres-e-destaque-na-programacao-dos-museus-do-centro-de-bh',
    summary: 'Divulgação da programação de março dedicada à visibilidade das mulheres nas artes, história e cidade.',
  },
  {
    id: 'revista-encontro-mulheres-museus-2026-03',
    title: 'Museus do Centro de BH celebram mulheres com programação especial',
    sourceName: 'Revista Encontro / Estado de Minas',
    sourceType: 'Mídia cultural',
    publishedDate: '2026-03-10',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['MIS BH', 'MHAB', 'MUMO', 'Museus Centro'],
    url: 'https://www.revistaencontro.com.br/canal/atualidades/2026/03/museus-do-centro-de-bh-celebram-mulheres-com-programacao-especial.html',
    summary: 'Cobertura jornalística da programação especial de março nos museus do centro de Belo Horizonte.',
  },
  {
    id: 'portal-bh-noticias-museus-centro-2026-03',
    title: 'Museus Centro - Notícias no Portal Belo Horizonte',
    sourceName: 'Portal Belo Horizonte',
    sourceType: 'Canal institucional',
    publishedDate: '2026-03-16',
    relevance: 'Média/Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Mês das Mulheres', 'Programação'],
    url: 'https://portalbelohorizonte.com.br/museuscentro/2025/noticias',
    summary: 'Arquivo oficial de notícias com registro da programação de março e abril do Museus Centro.',
  },
  {
    id: 'agenda-bh-mulheres-museus-2026-03',
    title: 'Programação dos Museus do Centro de BH no Mês das Mulheres',
    sourceName: 'Agenda BH',
    sourceType: 'Agenda cultural',
    publishedDate: '2026-03-20',
    relevance: 'Média/Alta',
    platform: 'Site',
    relatedTo: ['MHAB', 'MIS BH', 'MUMO', 'Viaduto das Artes', 'Museus Centro'],
    url: 'https://www.agendabh.com.br/programacao-dos-museus-do-centro-de-bh-no-mes-das-mulheres/',
    summary: 'Publicação de agenda com atividades do mês das mulheres e menção ao projeto Museus Centro.',
  },
  {
    id: 'agenciamg-mis-animacao-2026-02',
    title: 'MIS BH inaugura exposição sobre história da animação brasileira com entrada gratuita',
    sourceName: 'Agência MG',
    sourceType: 'Imprensa pública',
    publishedDate: '2026-02-03',
    relevance: 'Média/Alta',
    platform: 'Site',
    relatedTo: ['MIS BH', 'Museus Centro', 'Viaduto das Artes'],
    url: 'https://agenciamg.com.br/2026/02/03/animacao-brasileira-mis-bh/',
    summary: 'Divulgação da exposição Do Traço ao Pixel, inaugurada no MIS BH em 03/02/2026.',
  },
];

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isAfterStartDate(value) {
  const date = parseDate(value);
  const start = parseDate(CLIPPING_START_DATE);
  return !!date && !!start && date >= start;
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('pt-BR') : '—';
}

function getMonthKey(value) {
  const date = parseDate(value);
  if (!date) return 'sem-data';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key) {
  if (key === 'sem-data') return 'Sem data';
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getRelevanceClass(relevance) {
  const value = normalizeText(relevance);
  if (value.includes('alta')) return 'bg-black text-white';
  if (value.includes('media')) return 'bg-gray-800 text-white';
  return 'bg-gray-100 text-gray-700';
}

function detectMentions(item) {
  const text = normalizeText([item.title, item.summary, item.sourceName, ...(item.relatedTo || [])].join(' '));
  return KEYWORDS.filter((keyword) => text.includes(normalizeText(keyword)) || (item.relatedTo || []).some((tag) => normalizeText(tag).includes(normalizeText(keyword))));
}

function groupByMonth(items) {
  const grouped = items.reduce((acc, item) => {
    const key = getMonthKey(item.publishedDate);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, monthItems]) => ({
      key,
      label: getMonthLabel(key),
      items: monthItems.sort((a, b) => (parseDate(b.publishedDate)?.getTime() || 0) - (parseDate(a.publishedDate)?.getTime() || 0)),
    }));
}

function KpiCard({ label, value, helper, icon: Icon, dark = false }) {
  return (
    <Card className={`rounded-2xl shadow-sm ${dark ? 'bg-black border-black text-white' : 'bg-white border-gray-200 text-black'}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-4 h-4 ${dark ? 'text-white' : 'text-gray-500'}`} />
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{label}</p>
        </div>
        <p className={`text-3xl font-bold ${dark ? 'text-white' : 'text-black'}`}>{value}</p>
        {helper && <p className={`text-xs mt-1 ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{helper}</p>}
      </CardContent>
    </Card>
  );
}

function ClippingRow({ item }) {
  const mentions = detectMentions(item);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-3 align-top text-xs text-gray-500 tabular-nums">{formatDate(item.publishedDate)}</td>
      <td className="px-3 py-3 align-top">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900">{item.title}</p>
        <p className="line-clamp-2 text-xs text-gray-500 mt-1">{item.summary}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {mentions.slice(0, 4).map((tag) => <Badge key={tag} variant="outline" className="text-[10px] bg-white">{tag}</Badge>)}
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <p className="text-sm font-medium text-gray-800 truncate">{item.sourceName}</p>
        <p className="text-xs text-gray-500 truncate">{item.sourceType}</p>
      </td>
      <td className="px-3 py-3 align-top"><Badge className={getRelevanceClass(item.relevance)}>{item.relevance}</Badge></td>
      <td className="px-3 py-3 align-top text-xs text-gray-600">{item.platform}</td>
      <td className="px-3 py-3 align-top text-center">
        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-black">
          <ExternalLink className="w-4 h-4" />
        </a>
      </td>
    </tr>
  );
}

export default function ComunicacaoVisibilidadeClipping() {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('TODOS');

  const openClipping = useMemo(() => CLIPPING_ITEMS.filter((item) => isAfterStartDate(item.publishedDate)), []);

  const filteredClipping = useMemo(() => {
    const q = normalizeText(query);
    return openClipping.filter((item) => {
      const sourceMatch = sourceFilter === 'TODOS' || item.platform === sourceFilter || item.sourceType === sourceFilter;
      const searchable = normalizeText([item.title, item.sourceName, item.sourceType, item.platform, item.summary, ...(item.relatedTo || [])].join(' '));
      return sourceMatch && (!q || searchable.includes(q));
    });
  }, [openClipping, query, sourceFilter]);

  const clippingByMonth = useMemo(() => groupByMonth(filteredClipping), [filteredClipping]);

  const clippingSummary = useMemo(() => {
    const total = filteredClipping.length;
    const alta = filteredClipping.filter((item) => normalizeText(item.relevance).includes('alta')).length;
    const sociais = filteredClipping.filter((item) => ['Reddit', 'Instagram', 'Facebook', 'TikTok', 'YouTube'].includes(item.platform)).length;
    const veiculos = new Set(filteredClipping.map((item) => item.sourceName)).size;
    return { total, alta, sociais, veiculos };
  }, [filteredClipping]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-black tracking-tight">Comunicação e Visibilidade</h1>
          <p className="text-sm text-gray-500 mt-1">Painel de clipping, menções públicas, redes sociais e acervo de comunicação do projeto.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Publicações" value={clippingSummary.total} helper="desde 02/02/2026" icon={Newspaper} dark />
        <KpiCard label="Alta relevância" value={clippingSummary.alta} helper="menção direta" icon={TrendingUp} />
        <KpiCard label="Redes sociais" value={clippingSummary.sociais} helper="menções sociais" icon={Share2} />
        <KpiCard label="Veículos" value={clippingSummary.veiculos} helper="fontes distintas" icon={Globe2} />
      </div>

      <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-black" />
                <h2 className="text-lg font-semibold text-black">Painel de notícias e publicações</h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">Clipping aberto com data inicial em 02/02/2026. Meses anteriores ficam disponíveis apenas como links mensais.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input className="h-9 pl-8 text-sm" placeholder="Buscar publicação, veículo, palavra-chave..." value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700">
                <option value="TODOS">Todas as fontes</option>
                <option value="Site">Sites</option>
                <option value="Reddit">Redes sociais</option>
                <option value="Imprensa institucional">Institucional</option>
                <option value="Mídia cultural">Mídia cultural</option>
                <option value="Agenda cultural">Agenda cultural</option>
                <option value="Canal institucional">Canal institucional</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">Palavras-chave monitoradas:</span> {KEYWORDS.join(' · ')}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-black">Meses anteriores à data inicial</p>
              <Badge variant="outline" className="bg-white">links de arquivo</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {ARCHIVE_MONTH_LINKS.map((month) => (
                <a key={month.key} href={month.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-black" title={month.helper}>
                  <CalendarDays className="w-3.5 h-3.5" />
                  {month.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>

          {clippingByMonth.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Nenhuma publicação encontrada para os filtros selecionados desde 02/02/2026.</div>
          ) : (
            <div className="space-y-5">
              {clippingByMonth.map((group) => (
                <section key={group.key} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <h3 className="text-sm font-semibold capitalize text-black">{group.label}</h3>
                    <Badge variant="outline" className="bg-white">{group.items.length} publicação(ões)</Badge>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
                      <colgroup>
                        <col className="w-[10%]" />
                        <col className="w-[36%]" />
                        <col className="w-[18%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[8%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-left">
                          <th className="px-3 py-2 text-xs font-medium text-gray-600">Data</th>
                          <th className="px-3 py-2 text-xs font-medium text-gray-600">Publicação</th>
                          <th className="px-3 py-2 text-xs font-medium text-gray-600">Veículo</th>
                          <th className="px-3 py-2 text-xs font-medium text-gray-600">Relevância</th>
                          <th className="px-3 py-2 text-xs font-medium text-gray-600">Origem</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Link</th>
                        </tr>
                      </thead>
                      <tbody>{group.items.map((item) => <ClippingRow key={item.id} item={item} />)}</tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Releases" value="—" helper="Drive" icon={Megaphone} />
        <KpiCard label="Imagens" value="—" helper="Drive" icon={Image} />
        <KpiCard label="Clipping" value="—" helper="Drive" icon={FolderOpen} />
        <KpiCard label="Posts" value="—" helper="Drive" icon={CalendarDays} />
      </div>

      <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-black">Acervo de comunicação</h2>
            <p className="text-xs text-gray-500 mt-1">Pastas de referência no Google Drive.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DRIVE_FOLDERS.map((folder) => (
              <a key={folder.id} href={folder.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50">
                <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 mb-2">{folder.typeLabel}</Badge>
                <p className="font-semibold text-gray-900 truncate">{folder.name}</p>
                <p className="text-xs text-gray-500 mt-1">Abrir pasta</p>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
