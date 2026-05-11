import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  Globe2,
  Hash,
  Image,
  Megaphone,
  Newspaper,
  Search,
  Share2,
  Sparkles,
  TrendingUp } from
'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const PAGE_SIZE = 6;
const START_DATE = '2024-01-01';

const HEAD_KEYWORDS = [
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
'Fundação Municipal de Cultura'];


const MEDIUM_TAIL_KEYWORDS = [
'programação museus centro bh',
'oficinas museu da moda bh',
'atividades mhab belo horizonte',
'exposição mis bh',
'agenda cultural museus bh',
'programação viaduto das artes',
'noturno nos museus programação',
'eventos culturais centro de bh',
'museus gratuitos belo horizonte',
'atividades culturais prefeitura bh',
'programação museus municipais bh',
'agenda museu histórico abílio barreto'];


const LONG_TAIL_KEYWORDS = [
'programação completa museus centro belo horizonte 2024',
'programação completa museus centro belo horizonte 2025',
'programação completa museus centro belo horizonte 2026',
'atividades gratuitas no museu da imagem e do som bh',
'oficinas educativas museus centro viaduto das artes',
'programação cultural do mhab em belo horizonte',
'agenda de exposições do mumo em bh',
'atividades do noturno nos museus 2024',
'atividades do noturno nos museus 2025',
'atividades do noturno nos museus 2026',
'programação integrada museus municipais de belo horizonte',
'museus centro percurso da memória de belo horizonte'];


const HASHTAGS = [
'#MuseusCentro',
'#ViadutoDasArtes',
'#NoturnoNosMuseus',
'#MuseuDaModa',
'#MUMO',
'#MHAB',
'#MISBH',
'#MuseusBH',
'#MuseusDeBH',
'#CulturaBH',
'#CircuitoCultural',
'#FundacaoMunicipalDeCultura',
'#MuseuHistoricoAbilioBarreto',
'#MuseuDaImagemEDoSom',
'#ProgramacaoCulturalBH',
'#SemanaNacionalDeMuseus'];


const SOCIAL_SEARCH_SOURCES = [
'Instagram: @museuscentro, @viadutodasartes, @pbhcultura e hashtags do projeto',
'Facebook: páginas dos museus, PBH Cultura, eventos e compartilhamentos',
'YouTube, TikTok, Threads/X e Reddit: vídeos, hashtags, comentários e menções espontâneas',
'Google Notícias, PBH, Portal Belo Horizonte, Culturadoria, BH Eventos, Agenda BH e imprensa local'];


const DRIVE_FOLDERS = [
{
  id: '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
  name: 'Releases e Clipping',
  url: 'https://drive.google.com/drive/folders/1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
  typeLabel: 'Releases e Clipping'
},
{
  id: '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
  name: 'Imagens',
  url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
  typeLabel: 'Imagens'
},
{
  id: '1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
  name: 'Redes Sociais',
  url: 'https://drive.google.com/drive/folders/1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
  typeLabel: 'Redes Sociais'
}];


const CLIPPING_ITEMS = [
{ id: '2026-05-pbh-semana', title: '24ª Semana Nacional de Museus agita a programação de maio em BH', sourceName: 'PBH Notícias', sourceType: 'Imprensa institucional', publishedDate: '2026-05-05', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'MIS BH', 'MHAB', 'MUMO', 'Viaduto das Artes', '#MuseusCentro'], url: 'https://prefeitura.pbh.gov.br/noticias/24a-semana-nacional-de-museus-agita-programacao-de-maio-em-bh', summary: 'Publicação da PBH sobre programação de maio com menção direta ao projeto e aos museus participantes.' },
{ id: '2026-05-bheventos', title: '24ª Semana nacional de museus agita a programação de maio do Museus Centro', sourceName: 'BH Eventos', sourceType: 'Agenda cultural', publishedDate: '2026-05-06', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'Semana Nacional de Museus', 'MIS BH', 'MHAB', 'MUMO'], url: 'https://www.bheventos.com.br/noticia/05-06-2026-24-semana-nacional-de-museus-agita-a-programacao-de-maio-do-museus-centro', summary: 'Agenda cultural com chamada para a programação de maio do Museus Centro.' },
{ id: '2026-05-culturadoria', title: 'Semana Nacional de Museus movimenta espaços culturais de BH', sourceName: 'Culturadoria', sourceType: 'Mídia cultural', publishedDate: '2026-05-06', relevance: 'Alta', platform: 'Site', relatedTo: ['MIS BH', 'MUMO', 'MHAB', 'Museus Centro'], url: 'https://culturadoria.com.br/semana-dos-museus-em-bh/', summary: 'Cobertura cultural sobre a Semana Nacional de Museus e programação dos espaços associados ao projeto.' },
{ id: '2026-04-pbh-projeto', title: 'Projeto Museus Centro', sourceName: 'PBH / Fundação Municipal de Cultura', sourceType: 'Institucional', publishedDate: '2026-04-09', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'Viaduto das Artes', 'MHAB', 'MIS BH', 'MUMO'], url: 'https://prefeitura.pbh.gov.br/fundacao-municipal-de-cultura/projeto-museus-centro', summary: 'Página institucional com descrição do projeto, museus participantes e parceria com o Viaduto das Artes.' },
{ id: '2026-04-portal-bh', title: 'Museus Centro - página oficial no Portal Belo Horizonte', sourceName: 'Portal Belo Horizonte', sourceType: 'Canal institucional', publishedDate: '2026-04-10', relevance: 'Média/Alta', platform: 'Site', relatedTo: ['Museus Centro', 'MHAB', 'MIS BH', 'MUMO', 'Viaduto das Artes'], url: 'https://portalbelohorizonte.com.br/en/node/44715', summary: 'Página oficial com apresentação do projeto, programação regular e descrição dos museus participantes.' },
{ id: '2026-04-pbh-abril', title: 'Projeto Museus Centro traz experimentações visuais e manuais em abril', sourceName: 'PBH Notícias', sourceType: 'Imprensa institucional', publishedDate: '2026-04-01', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'Programação', 'MIS BH', 'MHAB', 'MUMO', 'Viaduto das Artes'], url: 'https://prefeitura.pbh.gov.br/noticias/projeto-museus-centro-traz-experimentacoes-visuais-e-manuais-em-abril', summary: 'Divulgação direta da programação de abril do Museus Centro.' },
{ id: '2026-04-culturadoria-abril', title: 'Museus Centro com inscrições abertas para oficinas e experiências', sourceName: 'Culturadoria', sourceType: 'Mídia cultural', publishedDate: '2026-04-10', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'Oficinas', 'Programação'], url: 'https://culturadoria.com.br/museus-centro-em-abril/', summary: 'Agenda cultural com foco em oficinas e experiências do projeto.' },
{ id: '2026-04-reddit-bh', title: 'Discussão espontânea sobre museus em BH', sourceName: 'Reddit Belo Horizonte', sourceType: 'Rede social', publishedDate: '2026-04-20', relevance: 'Média', platform: 'Reddit', relatedTo: ['Museu da Moda', 'MIS BH', 'Museus de BH', '#MuseusBH'], url: 'https://www.reddit.com/r/BeloHorizonte/comments/1rb4q2y/museus_em_bh/', summary: 'Menções espontâneas a museus de Belo Horizonte em comunidade aberta.' },
{ id: '2026-03-pbh-mulheres', title: 'Mês das Mulheres é destaque na programação dos Museus do Centro de BH', sourceName: 'PBH Notícias', sourceType: 'Imprensa institucional', publishedDate: '2026-03-09', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'MIS BH', 'MHAB', 'MUMO', 'Viaduto das Artes'], url: 'https://prefeitura.pbh.gov.br/noticias/mes-das-mulheres-e-destaque-na-programacao-dos-museus-do-centro-de-bh', summary: 'Divulgação da programação de março dedicada à visibilidade das mulheres nas artes, história e cidade.' },
{ id: '2026-03-revista-encontro', title: 'Museus do Centro de BH celebram mulheres com programação especial', sourceName: 'Revista Encontro / Estado de Minas', sourceType: 'Mídia cultural', publishedDate: '2026-03-10', relevance: 'Alta', platform: 'Site', relatedTo: ['MIS BH', 'MHAB', 'MUMO', 'Museus Centro'], url: 'https://www.revistaencontro.com.br/canal/atualidades/2026/03/museus-do-centro-de-bh-celebram-mulheres-com-programacao-especial.html', summary: 'Cobertura jornalística da programação especial de março nos museus do centro de Belo Horizonte.' },
{ id: '2026-03-agenda-bh', title: 'Programação dos Museus do Centro de BH no Mês das Mulheres', sourceName: 'Agenda BH', sourceType: 'Agenda cultural', publishedDate: '2026-03-20', relevance: 'Média/Alta', platform: 'Site', relatedTo: ['MHAB', 'MIS BH', 'MUMO', 'Viaduto das Artes', 'Museus Centro'], url: 'https://www.agendabh.com.br/programacao-dos-museus-do-centro-de-bh-no-mes-das-mulheres/', summary: 'Publicação de agenda com atividades do mês das mulheres e menção ao Museus Centro.' },
{ id: '2026-02-agenciamg-mis', title: 'MIS BH inaugura exposição sobre história da animação brasileira com entrada gratuita', sourceName: 'Agência MG', sourceType: 'Imprensa pública', publishedDate: '2026-02-03', relevance: 'Média/Alta', platform: 'Site', relatedTo: ['MIS BH', 'Museus Centro', 'Viaduto das Artes'], url: 'https://agenciamg.com.br/2026/02/03/animacao-brasileira-mis-bh/', summary: 'Divulgação da exposição Do Traço ao Pixel, inaugurada no MIS BH em fevereiro.' },
{ id: '2025-12-arquivo-portal-bh', title: 'Arquivo de notícias Museus Centro - dezembro de 2025', sourceName: 'Portal Belo Horizonte', sourceType: 'Arquivo mensal', publishedDate: '2025-12-15', relevance: 'Média', platform: 'Site', relatedTo: ['Museus Centro', 'Arquivo histórico'], url: 'https://portalbelohorizonte.com.br/museuscentro/2025/noticias', summary: 'Arquivo histórico para consulta de publicações pretéritas.' },
{ id: '2025-06-noturno-funed', title: 'Noturno nos Museus: Serviço de Informação Científica Histórica e Cultural participa pela primeira vez do evento', sourceName: 'Funed', sourceType: 'Institucional parceiro', publishedDate: '2025-06-27', relevance: 'Média', platform: 'Site', relatedTo: ['Noturno nos Museus', 'Museus de BH', 'Fundação Municipal de Cultura'], url: 'https://www.funed.mg.gov.br/2025/06/destaque/noturno-nos-museus/', summary: 'Registro institucional da 10ª edição do Noturno nos Museus em Belo Horizonte.' },
{ id: '2024-12-pbh-lancamento-museus-centro', title: 'Exposição e catálogo marcam lançamento oficial do projeto Museus Centro', sourceName: 'PBH Notícias', sourceType: 'Imprensa institucional', publishedDate: '2024-12-12', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'Viaduto das Artes', 'MHAB', 'MIS BH', 'MUMO'], url: 'https://prefeitura.pbh.gov.br/noticias/exposicao-e-catalogo-marcam-lancamento-oficial-do-projeto-museus-centro', summary: 'Lançamento oficial do projeto Museus Centro, em parceria com o Viaduto das Artes, conectando MHAB, MIS BH e MUMO.' },
{ id: '2024-12-pbh-noturno-127anos', title: 'Noturno nos Museus celebra os 127 anos de Belo Horizonte com cultura e arte', sourceName: 'PBH Notícias', sourceType: 'Imprensa institucional', publishedDate: '2024-12-04', relevance: 'Alta', platform: 'Site', relatedTo: ['Noturno nos Museus', 'Viaduto das Artes', 'Fundação Municipal de Cultura'], url: 'https://prefeitura.pbh.gov.br/noticias/noturno-nos-museus-celebra-os-127-anos-de-belo-horizonte-com-cultura-e-arte', summary: 'Divulgação da 9ª edição do Noturno nos Museus 2024, com parceria da OSC Viaduto das Artes.' },
{ id: '2024-12-portal-noturno-home', title: 'Noturno Nos Museus - Home - 2024', sourceName: 'Portal Belo Horizonte', sourceType: 'Canal institucional', publishedDate: '2024-12-06', relevance: 'Alta', platform: 'Site', relatedTo: ['Noturno nos Museus', 'MIS BH', 'Museus de BH'], url: 'https://portalbelohorizonte.com.br/noturnonosmuseus/2024', summary: 'Página oficial da edição 2024 do Noturno nos Museus, com programação e informações gerais.' },
{ id: '2024-12-portal-noturno-programacao', title: 'Noturno nos Museus 2024 - Programação', sourceName: 'Portal Belo Horizonte', sourceType: 'Canal institucional', publishedDate: '2024-12-06', relevance: 'Alta', platform: 'Site', relatedTo: ['Noturno nos Museus', 'Programação', 'Museus de BH'], url: 'https://portalbelohorizonte.com.br/noturnonosmuseus/2024/programacao', summary: 'Programação oficial da edição 2024 do Noturno nos Museus.' },
{ id: '2024-12-pbh-pampulha-noturno', title: 'Museus da Pampulha tem o Noturno nos Museus como destaque nas ações de dezembro', sourceName: 'PBH Notícias', sourceType: 'Imprensa institucional', publishedDate: '2024-12-05', relevance: 'Média/Alta', platform: 'Site', relatedTo: ['Noturno nos Museus', 'Viaduto das Artes', 'Museus de BH'], url: 'https://prefeitura.pbh.gov.br/noticias/museus-da-pampulha-tem-o-noturno-nos-museus-como-destaque-nas-acoes-de-dezembro', summary: 'Matéria da PBH sobre a programação de dezembro e o Noturno nos Museus 2024.' },
{ id: '2024-08-pbh-termo-museus-centro', title: 'FMC - Termo de Colaboração - 2024 - 0012 - Museus Centro', sourceName: 'PBH Portal das Parcerias', sourceType: 'Transparência pública', publishedDate: '2024-08-05', relevance: 'Alta', platform: 'Site', relatedTo: ['Museus Centro', 'Viaduto das Artes', 'Fundação Municipal de Cultura'], url: 'https://prefeitura.pbh.gov.br/portaldasparcerias/parceria/97378/ij/01202431030012', summary: 'Registro público do Termo de Colaboração do projeto Museus Centro com a organização Viaduto das Artes.' }];


function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function getMonthLabel(monthKey) {
  if (monthKey === 'sem-data') return 'Sem data';
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getRelevanceClass(relevance) {
  const value = normalizeText(relevance);
  if (value.includes('alta')) return 'bg-black text-white';
  if (value.includes('media')) return 'bg-gray-800 text-white';
  return 'bg-gray-100 text-gray-700';
}

function allKeywordTerms() {
  return [...HEAD_KEYWORDS, ...MEDIUM_TAIL_KEYWORDS, ...LONG_TAIL_KEYWORDS, ...HASHTAGS];
}

function detectMentions(item) {
  const text = normalizeText([item.title, item.summary, item.sourceName, ...(item.relatedTo || [])].join(' '));
  return allKeywordTerms().filter((term) => text.includes(normalizeText(term)) || (item.relatedTo || []).some((tag) => normalizeText(tag).includes(normalizeText(term))));
}

function groupByMonth(items) {
  const grouped = items.reduce((acc, item) => {
    const monthKey = getMonthKey(item.publishedDate);
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(item);
    return acc;
  }, {});

  return Object.entries(grouped).
  sort(([a], [b]) => b.localeCompare(a)).
  map(([monthKey, monthItems]) => ({
    key: monthKey,
    label: getMonthLabel(monthKey),
    items: monthItems.sort((a, b) => (parseDate(b.publishedDate)?.getTime() || 0) - (parseDate(a.publishedDate)?.getTime() || 0))
  }));
}

function KpiCard({ label, value, helper, icon: Icon, dark = false }) {
  return (
    <Card className={`rounded-2xl shadow-sm ${dark ? 'bg-black border-black text-white' : 'bg-white border-gray-200 text-black'}`}>
      






      
    </Card>);

}

function TermGroup({ title, terms, icon: Icon }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-500" />
        <p className="text-sm font-semibold text-black">{title}</p>
        <Badge variant="outline" className="ml-auto bg-white">{terms.length}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((term) => <Badge key={term} variant="outline" className="bg-gray-50 text-[11px]">{term}</Badge>)}
      </div>
    </div>);

}

function AcervoCard() {
  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="text-lg font-semibold text-black">Acervo de comunicação</h2>
          <p className="mt-1 text-xs text-gray-500">Pastas de referência no Google Drive.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {DRIVE_FOLDERS.map((folder) =>
          <a key={folder.id} href={folder.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50">
              <Badge className="mb-2 bg-gray-100 text-gray-700 hover:bg-gray-100">{folder.typeLabel}</Badge>
              <p className="truncate font-semibold text-gray-900">{folder.name}</p>
              <p className="mt-1 text-xs text-gray-500">Abrir pasta</p>
            </a>
          )}
        </div>
      </CardContent>
    </Card>);

}

function ClippingRow({ item }) {
  const mentions = detectMentions(item);
  return (
    <tr className="border-b border-gray-100 transition-colors hover:bg-gray-50">
      <td className="px-3 py-3 align-top text-xs text-gray-500 tabular-nums">{formatDate(item.publishedDate)}</td>
      <td className="px-3 py-3 align-top">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900">{item.title}</p>
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {mentions.slice(0, 5).map((tag) => <Badge key={tag} variant="outline" className="bg-white text-[10px]">{tag}</Badge>)}
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <p className="truncate text-sm font-medium text-gray-800">{item.sourceName}</p>
        <p className="truncate text-xs text-gray-500">{item.sourceType}</p>
      </td>
      <td className="px-3 py-3 align-top"><Badge className={getRelevanceClass(item.relevance)}>{item.relevance}</Badge></td>
      <td className="px-3 py-3 align-top text-xs text-gray-600">{item.platform}</td>
      <td className="px-3 py-3 align-top text-center">
        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-black">
          <ExternalLink className="h-4 w-4" />
        </a>
      </td>
    </tr>);

}

function MonthPager({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2">
      <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPage(page - 1)} disabled={page <= 0}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      {pages.map((pageIndex) =>
      <Button
        key={pageIndex}
        type="button"
        size="sm"
        variant={pageIndex === page ? 'default' : 'outline'}
        className="h-8 min-w-8 px-2 text-xs"
        onClick={() => onPage(pageIndex)}>
        
          {pageIndex + 1}
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}>
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>);

}

export default function ComunicacaoVisibilidadeClippingCompact() {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('TODOS');
  const [activeMonthKey, setActiveMonthKey] = useState('');
  const [activePage, setActivePage] = useState(0);

  const filteredClipping = useMemo(() => {
    const q = normalizeText(query);
    const start = parseDate(START_DATE);

    return CLIPPING_ITEMS.filter((item) => {
      const date = parseDate(item.publishedDate);
      const afterStart = !start || !date || date >= start;
      const sourceMatch = sourceFilter === 'TODOS' || item.platform === sourceFilter || item.sourceType === sourceFilter;
      const searchable = normalizeText([item.title, item.sourceName, item.sourceType, item.platform, item.summary, ...(item.relatedTo || []), ...allKeywordTerms()].join(' '));
      return afterStart && sourceMatch && (!q || searchable.includes(q));
    });
  }, [query, sourceFilter]);

  const clippingByMonth = useMemo(() => groupByMonth(filteredClipping), [filteredClipping]);
  const currentMonthKey = activeMonthKey && clippingByMonth.some((group) => group.key === activeMonthKey) ? activeMonthKey : clippingByMonth[0]?.key || '';
  const currentMonth = clippingByMonth.find((group) => group.key === currentMonthKey);
  const totalPages = currentMonth ? Math.max(1, Math.ceil(currentMonth.items.length / PAGE_SIZE)) : 1;
  const page = Math.min(activePage, totalPages - 1);
  const visibleItems = currentMonth ? currentMonth.items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : [];

  const clippingSummary = useMemo(() => {
    const total = filteredClipping.length;
    const alta = filteredClipping.filter((item) => normalizeText(item.relevance).includes('alta')).length;
    const sociais = filteredClipping.filter((item) => ['Reddit', 'Instagram', 'Facebook', 'TikTok', 'YouTube', 'Threads', 'X'].includes(item.platform)).length;
    const veiculos = new Set(filteredClipping.map((item) => item.sourceName)).size;
    return { total, alta, sociais, veiculos };
  }, [filteredClipping]);

  function selectMonth(monthKey) {
    setActiveMonthKey(monthKey);
    setActivePage(0);
  }

  function resetFilters(nextQuery = query, nextSource = sourceFilter) {
    setQuery(nextQuery);
    setSourceFilter(nextSource);
    setActiveMonthKey('');
    setActivePage(0);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">Comunicação e Visibilidade</h1>
          <p className="mt-1 text-sm text-gray-500">Painel de clipping desde 01/01/2024, redes sociais, hashtags e acervo de comunicação do projeto.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Publicações" value={clippingSummary.total} helper="desde 01/01/2024" icon={Newspaper} dark />
        <KpiCard label="Alta relevância" value={clippingSummary.alta} helper="menção direta" icon={TrendingUp} />
        <KpiCard label="Redes sociais" value={clippingSummary.sociais} helper="menções sociais" icon={Share2} />
        <KpiCard label="Veículos" value={clippingSummary.veiculos} helper="fontes distintas" icon={Globe2} />
      </div>

      <AcervoCard />

      <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-black" />
                <h2 className="text-lg font-semibold text-black">Painel de notícias e publicações</h2>
              </div>
              <p className="mt-1 text-xs text-gray-500">Selecione um mês. Cada página mostra no máximo 6 entradas.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input className="h-9 pl-8 text-sm" placeholder="Buscar publicação, veículo, hashtag, cauda longa..." value={query} onChange={(event) => resetFilters(event.target.value, sourceFilter)} />
              </div>
              <select value={sourceFilter} onChange={(event) => resetFilters(query, event.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700">
                <option value="TODOS">Todas as fontes</option>
                <option value="Site">Sites</option>
                <option value="Reddit">Redes sociais</option>
                <option value="Imprensa institucional">Institucional</option>
                <option value="Mídia cultural">Mídia cultural</option>
                <option value="Agenda cultural">Agenda cultural</option>
                <option value="Arquivo mensal">Arquivo mensal</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">Palavras-chave monitoradas:</span> {HEAD_KEYWORDS.join(' · ')}
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3">
            {clippingByMonth.map((group) =>
            <button
              key={group.key}
              type="button"
              onClick={() => selectMonth(group.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${group.key === currentMonthKey ? 'border-black bg-black text-white' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
              
                <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                {group.label} · {group.items.length}
              </button>
            )}
          </div>

          {!currentMonth ?
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Nenhuma publicação encontrada para os filtros selecionados.</div> :

          <section className="space-y-2">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-sm font-semibold capitalize text-black">{currentMonth.label}</h3>
                <Badge variant="outline" className="bg-white">{currentMonth.items.length} publicação(ões)</Badge>
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
                  <tbody>{visibleItems.map((item) => <ClippingRow key={item.id} item={item} />)}</tbody>
                </table>
              </div>
              <MonthPager page={page} totalPages={totalPages} onPage={setActivePage} />
            </section>
          }
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Releases" value="—" helper="Drive" icon={Megaphone} />
        <KpiCard label="Imagens" value="—" helper="Drive" icon={Image} />
        <KpiCard label="Clipping" value="—" helper="Drive" icon={FolderOpen} />
        <KpiCard label="Posts" value="—" helper="Drive" icon={CalendarDays} />
      </div>

      <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div>
            <h2 className="text-lg font-semibold text-black">Termos de busca IA</h2>
            <p className="mt-1 text-xs text-gray-500">Palavras-chave, hashtags e expressões de cauda média/longa usadas para monitoramento de sites e redes sociais.</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">Fontes sociais e sites a monitorar:</span> {SOCIAL_SEARCH_SOURCES.join(' · ')}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <TermGroup title="Palavras-chave principais" terms={HEAD_KEYWORDS} icon={Search} />
            <TermGroup title="Hashtags e marcadores sociais" terms={HASHTAGS} icon={Hash} />
            <TermGroup title="Cauda média" terms={MEDIUM_TAIL_KEYWORDS} icon={Sparkles} />
            <TermGroup title="Cauda longa" terms={LONG_TAIL_KEYWORDS} icon={TrendingUp} />
          </div>
        </CardContent>
      </Card>
    </div>);

}