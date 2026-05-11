import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Search,
  Image,
  Newspaper,
  Megaphone,
  CalendarDays,
  Globe2,
  Share2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';

const FOLDER_IDS = {
  RELEASES_CLIPPING: '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
  IMAGENS: '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
  REDES_SOCIAIS: '1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
};

const DRIVE_FOLDERS = [
  {
    id: FOLDER_IDS.RELEASES_CLIPPING,
    name: 'Releases e Clipping',
    url: 'https://drive.google.com/drive/folders/1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8',
    defaultCategory: 'RELEASE',
  },
  {
    id: FOLDER_IDS.IMAGENS,
    name: 'Imagens',
    url: 'https://drive.google.com/drive/folders/1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J',
    defaultCategory: 'FOTOGRAFIA',
  },
  {
    id: FOLDER_IDS.REDES_SOCIAIS,
    name: 'Redes Sociais',
    url: 'https://drive.google.com/drive/folders/1WneHTmI8GYPMpdeumPNhIB9lzDiiArU_',
    defaultCategory: 'POSTS',
  },
];

const KEYWORDS = [
  'Museus Centro',
  'Viaduto das Artes',
  'Museu Histórico Abílio Barreto',
  'MHAB',
  'Museu da Moda',
  'MUMO',
  'Museu da Imagem e do Som',
  'MIS BH',
  'Noturno nos Museus',
];

const SEEDED_CLIPPING = [
  {
    id: 'pbh-semana-museus-2026-05',
    title: '24ª Semana Nacional de Museus agita a programação de maio em BH',
    sourceName: 'PBH Notícias',
    sourceType: 'Imprensa institucional',
    publishedDate: '2026-05-05',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'MIS BH', 'MHAB', 'MUMO'],
    url: 'https://prefeitura.pbh.gov.br/noticias/24a-semana-nacional-de-museus-agita-programacao-de-maio-em-bh',
    summary: 'Matéria institucional com programação de maio e menção direta aos espaços do Museus Centro.',
  },
  {
    id: 'pbh-museus-centro-abril-2026',
    title: 'Projeto Museus Centro traz experimentações visuais e manuais em abril',
    sourceName: 'PBH Notícias',
    sourceType: 'Imprensa institucional',
    publishedDate: '2026-04-01',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Programação'],
    url: 'https://prefeitura.pbh.gov.br/noticias/projeto-museus-centro-traz-experimentacoes-visuais-e-manuais-em-abril',
    summary: 'Divulgação direta da programação do projeto Museus Centro em abril.',
  },
  {
    id: 'culturadoria-museus-centro-abril-2026',
    title: 'Museus Centro com inscrições abertas para oficinas e experiências',
    sourceName: 'Culturadoria',
    sourceType: 'Mídia cultural',
    publishedDate: '2026-04-10',
    relevance: 'Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Oficinas'],
    url: 'https://culturadoria.com.br/museus-centro-em-abril/',
    summary: 'Publicação de agenda cultural com foco em oficinas e experiências do Museus Centro.',
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
    summary: 'Cobertura cultural sobre a Semana Nacional de Museus e programação dos espaços.',
  },
  {
    id: 'bheventos-semana-museus-2026-05',
    title: '24ª Semana Nacional de Museus agita a programação do Museus Centro',
    sourceName: 'BH Eventos',
    sourceType: 'Agenda cultural',
    publishedDate: '2026-05-06',
    relevance: 'Média/Alta',
    platform: 'Site',
    relatedTo: ['Museus Centro', 'Semana Nacional de Museus'],
    url: 'https://www.bheventos.com.br/noticia/05-06-2026-24-semana-nacional-de-museus-agita-a-programacao-de-maio-do-museus-centro',
    summary: 'Agenda cultural com chamada para programação do Museus Centro.',
  },
  {
    id: 'portal-belohorizonte-museus-centro',
    title: 'Portal oficial de notícias Museus Centro',
    sourceName: 'Portal Belo Horizonte',
    sourceType: 'Canal institucional',
    publishedDate: '2026-04-15',
    relevance: 'Média',
    platform: 'Site',
    relatedTo: ['Museus Centro'],
    url: 'https://portalbelohorizonte.com.br/museuscentro/2025/noticias',
    summary: 'Página agregadora institucional de notícias e conteúdos do projeto.',
  },
  {
    id: 'reddit-bh-museus-2026',
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
];

const ZERO_SUMMARY = {
  releases: 0,
  imagens: 0,
  clipping: 0,
  posts: 0,
};

const STATIC_ITEMS = DRIVE_FOLDERS.map((folder) => ({
  id: folder.id,
  name: folder.name,
  month: 'Pastas sincronizadas',
  category: folder.defaultCategory,
  typeLabel: folder.name,
  url: folder.url,
  sourceFolderName: folder.name,
  sourceFolderId: folder.id,
  sourceFolderPath: folder.name,
  isFolderShortcut: true,
}));

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function formatMonth(value) {
  if (!value) return 'Sem data informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data informada';
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function inferCategory(name = '', mimeType = '', defaultCategory = 'RELEASE', folderPath = '') {
  const text = normalizeText(`${folderPath} ${name} ${mimeType}`);

  if (text.includes('clipping') || text.includes('clipagem') || text.includes('imprensa') || text.includes('jornal') || text.includes('materia') || text.includes('noticia')) return 'CLIPPING';
  if (text.includes('post') || text.includes('instagram') || text.includes('facebook') || text.includes('cards') || text.includes('social') || text.includes('redes')) return 'POSTS';
  if (text.includes('foto') || text.includes('fotografia') || text.includes('imagem') || text.includes('imagens') || String(mimeType).startsWith('image/')) return 'FOTOGRAFIA';
  if (text.includes('release') || text.includes('relise') || text.includes('assessoria') || text.includes('nota')) return 'RELEASE';

  return defaultCategory;
}

function getCategoryLabel(category) {
  const map = {
    RELEASE: 'Releases',
    FOTOGRAFIA: 'Imagens',
    CLIPPING: 'Clipping',
    POSTS: 'Posts',
  };
  return map[category] || 'Arquivo';
}

function normalizeDriveFile(file, sourceFolder) {
  const rawName = file.name || file.nome || 'Arquivo sem nome';
  const rawMimeType = file.mimeType || file.mime_type || '';
  const rootFolderId = file.drive_root_folder_id || sourceFolder?.id || file.sourceFolderId || file.drive_folder_id || '';
  const folderId = file.sourceFolderId || file.drive_folder_id || rootFolderId;
  const folderName = sourceFolder?.name || file.sourceFolderName || file.drive_folder_name || 'Google Drive';
  const folderPath = sourceFolder?.path || file.sourceFolderPath || file.drive_parent_folder_path || folderName;
  const category = file.category || file.tipo || inferCategory(rawName, rawMimeType, sourceFolder?.defaultCategory, folderPath);
  const createdTime = file.createdTime || file.criado_em_drive || file.created_date || file.modifiedTime || file.atualizado_em_drive || null;
  const fileId = file.id || file.drive_file_id;

  return {
    id: fileId,
    name: rawName,
    month: file.month || file.mes || formatMonth(createdTime),
    category,
    typeLabel: file.typeLabel || getCategoryLabel(category),
    createdTime,
    modifiedTime: file.modifiedTime || file.atualizado_em_drive || null,
    mimeType: rawMimeType,
    url: file.webViewLink || file.url || file.link || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : ''),
    sourceFolderName: folderName,
    sourceFolderId: folderId,
    sourceFolderPath: folderPath,
    driveRootFolderId: rootFolderId,
    isFolderShortcut: false,
  };
}

function buildLocalSummary(files = []) {
  return {
    releases: files.filter((file) => file.category === 'RELEASE').length,
    imagens: files.filter((file) => file.category === 'FOTOGRAFIA').length,
    clipping: files.filter((file) => file.category === 'CLIPPING').length,
    posts: files.filter((file) => file.category === 'POSTS').length,
  };
}

function normalizeSummary(summary) {
  if (!summary || typeof summary !== 'object') return ZERO_SUMMARY;

  return {
    releases: Number(summary.releases || summary.RELEASES || 0),
    imagens: Number(summary.imagens || summary.images || summary.FOTOGRAFIA || 0),
    clipping: Number(summary.clipping || summary.CLIPPING || 0),
    posts: Number(summary.posts || summary.POSTS || 0),
  };
}

function extractPayload(response) {
  return response?.data?.data || response?.data || response?.response || response?.result || response || {};
}

function extractFilesFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.files)) return payload.files;
  if (Array.isArray(payload?.data?.files)) return payload.data.files;
  if (Array.isArray(payload?.result?.files)) return payload.result.files;
  return [];
}

function extractSummaryFromPayload(payload) {
  return normalizeSummary(payload?.summary || payload?.data?.summary || payload?.result?.summary || null);
}

async function syncViaBase44Function(action = 'sync') {
  const response = await base44.functions.invoke('syncComunicacaoVisibilidade', { action });
  const payload = extractPayload(response);
  const files = extractFilesFromPayload(payload).map((file) => normalizeDriveFile(file));
  const summary = extractSummaryFromPayload(payload);

  return {
    files,
    summary: Object.values(summary).some((value) => Number(value || 0) > 0) ? summary : buildLocalSummary(files),
  };
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

function ClippingRow({ item }) {
  const mentions = detectMentions(item);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-3 align-top text-xs text-gray-500 tabular-nums">{formatDate(item.publishedDate)}</td>
      <td className="px-3 py-3 align-top">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900">{item.title}</p>
        <p className="line-clamp-2 text-xs text-gray-500 mt-1">{item.summary}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {mentions.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] bg-white">{tag}</Badge>
          ))}
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

export default function ComunicacaoVisibilidade() {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('TODOS');
  const [items, setItems] = useState(STATIC_ITEMS);
  const [summary, setSummary] = useState(ZERO_SUMMARY);
  const [clippingItems, setClippingItems] = useState(SEEDED_CLIPPING);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncMessage, setSyncMessage] = useState('Clipping consolidado com base nas publicações identificadas no último mês.');

  const filteredClipping = useMemo(() => {
    const q = normalizeText(query);
    return clippingItems.filter((item) => {
      const sourceMatch = sourceFilter === 'TODOS' || item.platform === sourceFilter || item.sourceType === sourceFilter;
      const searchable = normalizeText([item.title, item.sourceName, item.sourceType, item.platform, item.summary, ...(item.relatedTo || [])].join(' '));
      return sourceMatch && (!q || searchable.includes(q));
    });
  }, [clippingItems, query, sourceFilter]);

  const clippingSummary = useMemo(() => {
    const total = filteredClipping.length;
    const alta = filteredClipping.filter((item) => normalizeText(item.relevance).includes('alta')).length;
    const sociais = filteredClipping.filter((item) => ['Reddit', 'Instagram', 'Facebook', 'TikTok', 'YouTube'].includes(item.platform)).length;
    const veiculos = new Set(filteredClipping.map((item) => item.sourceName)).size;
    return { total, alta, sociais, veiculos };
  }, [filteredClipping]);

  const groupedByMonth = useMemo(() => {
    return items.reduce((acc, item) => {
      const month = item.month || 'Sem data informada';
      if (!acc[month]) acc[month] = [];
      acc[month].push(item);
      return acc;
    }, {});
  }, [items]);

  async function runSync({ silent = false, preferCache = false } = {}) {
    if (isSyncing) return;

    setIsSyncing(true);
    if (!silent) setSyncMessage('Sincronizando clipping e acervo de comunicação...');

    try {
      let mergedFiles = [];
      let nextSummary = ZERO_SUMMARY;

      try {
        const result = await syncViaBase44Function(preferCache ? 'list-cache' : 'sync');
        mergedFiles = result.files;
        nextSummary = result.summary;
      } catch (functionError) {
        console.warn('Function syncComunicacaoVisibilidade indisponível. Mantendo painel local.', functionError);
      }

      setItems(mergedFiles.length > 0 ? mergedFiles : STATIC_ITEMS);
      setSummary(Object.values(nextSummary).some((value) => Number(value || 0) > 0) ? nextSummary : ZERO_SUMMARY);

      try {
        const clippingResponse = await base44.functions.invoke('searchComunicacaoClipping', {
          keywords: KEYWORDS,
          periodo: 'ultimo_mes',
        });
        const payload = extractPayload(clippingResponse);
        const found = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
        if (found.length > 0) {
          setClippingItems(found.map((item, index) => ({
            id: item.id || `ai-${index}`,
            title: item.title || item.titulo || 'Publicação sem título',
            sourceName: item.sourceName || item.veiculo || item.source || 'Fonte não identificada',
            sourceType: item.sourceType || item.tipo_fonte || 'Clipping IA',
            publishedDate: item.publishedDate || item.data_publicacao || item.date || null,
            relevance: item.relevance || item.relevancia || 'Média',
            platform: item.platform || item.plataforma || 'Web',
            relatedTo: item.relatedTo || item.tags || item.mencoes || [],
            url: item.url || item.link || '#',
            summary: item.summary || item.resumo || 'Publicação identificada por busca assistida por IA.',
          })));
        }
      } catch (clippingError) {
        console.warn('Busca IA de clipping indisponível. Usando base consolidada local.', clippingError);
      }

      setLastSync(new Date());
      setSyncMessage('Painel atualizado. Quando a função IA estiver disponível, novas publicações serão incorporadas automaticamente.');
    } catch (error) {
      console.error('Erro ao sincronizar Comunicação:', error);
      setItems(STATIC_ITEMS);
      setSummary(ZERO_SUMMARY);
      setSyncMessage('Não foi possível sincronizar automaticamente. Painel local preservado.');
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    runSync({ silent: true, preferCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-black tracking-tight">Comunicação e Visibilidade</h1>
          <p className="text-sm text-gray-500 mt-1">Painel de clipping, menções públicas, redes sociais e acervo de comunicação do projeto.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => runSync({ silent: false })} disabled={isSyncing} className="gap-2 rounded-xl">
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Atualizar IA
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Publicações" value={clippingSummary.total} helper="último mês" icon={Newspaper} dark />
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
              <p className="text-xs text-gray-500 mt-1">Busca por menções a Museus Centro, Viaduto das Artes, MHAB, MUMO, MIS BH e Noturno nos Museus.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input className="h-9 pl-8 text-sm" placeholder="Buscar publicação, veículo ou museu..." value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
              >
                <option value="TODOS">Todas as fontes</option>
                <option value="Site">Sites</option>
                <option value="Reddit">Redes sociais</option>
                <option value="Imprensa institucional">Institucional</option>
                <option value="Mídia cultural">Mídia cultural</option>
                <option value="Agenda cultural">Agenda cultural</option>
              </select>
            </div>
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
              <tbody>
                {filteredClipping.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">Nenhuma publicação encontrada para o filtro selecionado.</td>
                  </tr>
                ) : (
                  filteredClipping.map((item) => <ClippingRow key={item.id} item={item} />)
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <span>{syncMessage}</span>
            {lastSync && <span>Última atualização: {lastSync.toLocaleString('pt-BR')}</span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Releases" value={summary.releases} helper="Drive" icon={Megaphone} />
        <KpiCard label="Imagens" value={summary.imagens} helper="Drive" icon={Image} />
        <KpiCard label="Clipping" value={summary.clipping} helper="Drive" icon={FolderOpen} />
        <KpiCard label="Posts" value={summary.posts} helper="Drive" icon={CalendarDays} />
      </div>

      <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-black">Acervo de comunicação</h2>
              <p className="text-xs text-gray-500 mt-1">Pastas e arquivos sincronizados do Google Drive.</p>
            </div>
            <Badge variant="outline" className="bg-white">{items.length} item(ns)</Badge>
          </div>

          {Object.keys(groupedByMonth).length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Nenhum arquivo encontrado.</div>
          ) : (
            Object.entries(groupedByMonth).map(([month, files]) => (
              <section key={month} className="space-y-3">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 capitalize">{month}</h3>
                  <Badge variant="outline" className="bg-white">{files.length} item(ns)</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {files.map((file) => (
                    <a key={`${file.sourceFolderId}-${file.id}`} href={file.url} target="_blank" rel="noreferrer" className="block">
                      <Card className="h-full border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm transition-all">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 mb-2">{file.typeLabel}</Badge>
                              <h3 className="font-semibold text-slate-900 truncate">{file.name}</h3>
                              <p className="text-xs text-slate-500 mt-1 truncate">{file.sourceFolderPath || file.sourceFolderName}</p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          </div>

                          <div className="text-xs text-slate-500 space-y-1">
                            <p>Origem: Google Drive</p>
                            <p>{file.isFolderShortcut ? 'Abrir pasta' : 'Abrir arquivo'}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </a>
                  ))}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
