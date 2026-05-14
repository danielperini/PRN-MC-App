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
  Radio,
  BarChart3,
  Link2,
  Building2,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import KeywordsCloud from '@/components/comunicacao/KeywordsCloud';
import ImpactoMuseu from '@/components/comunicacao/ImpactoMuseu';
import SinteseIA from '@/components/comunicacao/SintesseIA';
import RedesSociaisPanel from '@/components/comunicacao/RedesSociaisPanel';
import LinksClipping from '@/components/comunicacao/LinksClipping';

const DAYS_WINDOW = 60;

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

const SEEDED_CLIPPING = [
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
    summary: 'Publicação recente da PBH sobre a programação de maio, com menção direta ao projeto Museus Centro, MIS BH, MHAB, MUMO e Viaduto das Artes.',
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
    summary: 'Reprodução em agenda cultural da programação de maio do Museus Centro e dos museus municipais envolvidos.',
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
    summary: 'Cobertura cultural sobre a Semana Nacional de Museus e a programação dos espaços associados ao Museus Centro.',
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
    summary: 'Página institucional atualizada em abril de 2026, descrevendo o projeto, os museus participantes e a parceria com o Viaduto das Artes.',
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
    summary: 'Divulgação direta da programação do projeto Museus Centro em abril, com atividades nos três museus.',
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
    summary: 'Publicação de agenda cultural com foco em oficinas e experiências do Museus Centro.',
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
    summary: 'Menções espontâneas a museus de Belo Horizonte em comunidade aberta, úteis para monitoramento social.',
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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinLastDays(value, days = DAYS_WINDOW) {
  const date = parseDate(value);
  if (!date) return false;
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR');
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

function groupClippingByMonth(items = []) {
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

function ClippingRow({ item }) {
  const mentions = detectMentions(item);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-3 align-top text-xs text-gray-500 tabular-nums">{formatDate(item.publishedDate)}</td>
      <td className="px-3 py-3 align-top">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900">{item.title}</p>
        <p className="line-clamp-2 text-xs text-gray-500 mt-1">{item.summary}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {mentions.slice(0, 4).map((tag) => (
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
  const CACHE_KEY = 'comunicacao_cache_v2';

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      // Verificar se o cache é do dia atual
      const today = new Date().toDateString();
      if (cached.date !== today) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function saveCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, date: new Date().toDateString() }));
    } catch {}
  }

  const cached = loadCache();

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('TODOS');
  const [items, setItems] = useState(cached?.items || STATIC_ITEMS);
  const [summary, setSummary] = useState(cached?.summary || ZERO_SUMMARY);
  const [clippingItems, setClippingItems] = useState(cached?.clippingItems || SEEDED_CLIPPING);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.lastSync ? new Date(cached.lastSync) : null);
  const [syncMessage, setSyncMessage] = useState(cached ? 'Painel carregado do cache diário.' : 'Clipping consolidado dos últimos 60 dias com base nas palavras-chave do projeto.');

  const recentClipping = useMemo(() => {
    return clippingItems.filter((item) => isWithinLastDays(item.publishedDate, DAYS_WINDOW));
  }, [clippingItems]);

  const filteredClipping = useMemo(() => {
    const q = normalizeText(query);
    return recentClipping.filter((item) => {
      const sourceMatch = sourceFilter === 'TODOS' || item.platform === sourceFilter || item.sourceType === sourceFilter;
      const searchable = normalizeText([item.title, item.sourceName, item.sourceType, item.platform, item.summary, ...(item.relatedTo || [])].join(' '));
      return sourceMatch && (!q || searchable.includes(q));
    });
  }, [recentClipping, query, sourceFilter]);

  const clippingByMonth = useMemo(() => groupClippingByMonth(filteredClipping), [filteredClipping]);

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
    if (!silent) setSyncMessage('Sincronizando clipping dos últimos 60 dias e acervo de comunicação...');

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
          periodo: 'ultimos_60_dias',
          days: DAYS_WINDOW,
          include_social: true,
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

      const now = new Date();
      setLastSync(now);
      setSyncMessage('Painel atualizado. Lista aberta limitada aos últimos 60 dias e agrupada por mês.');
      saveCache({
        items: mergedFiles.length > 0 ? mergedFiles : STATIC_ITEMS,
        summary: Object.values(nextSummary).some((v) => Number(v || 0) > 0) ? nextSummary : ZERO_SUMMARY,
        clippingItems: clippingItems,
        lastSync: now.toISOString(),
      });
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
    // Só sincroniza se não houver cache válido do dia
    if (!loadCache()) {
      runSync({ silent: true, preferCache: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tabs de navegação
  const [activeTab, setActiveTab] = useState('clipping');

  const TABS = [
    { id: 'clipping', label: 'Clipping', icon: Newspaper },
    { id: 'redes', label: 'Redes Sociais', icon: Share2 },
    { id: 'analise', label: 'Análise IA', icon: Sparkles },
    { id: 'acervo', label: 'Acervo Drive', icon: FolderOpen },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho estratégico */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Painel Estratégico</span>
          </div>
          <h1 className="text-3xl font-semibold text-black tracking-tight">Comunicação e Visibilidade</h1>
          <p className="text-sm text-gray-500 mt-1">Clipping inteligente · Presença digital · Análise de impacto institucional · Monitoramento de repercussão</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => runSync({ silent: false })} disabled={isSyncing} className="gap-2 rounded-xl">
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs principais — Visibilidade Geral */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Publicações" value={clippingSummary.total} helper="últimos 60 dias" icon={Newspaper} dark />
        <KpiCard label="Alta relevância" value={clippingSummary.alta} helper="menção direta" icon={TrendingUp} />
        <KpiCard label="Redes sociais" value={clippingSummary.sociais} helper="menções sociais" icon={Share2} />
        <KpiCard label="Veículos" value={clippingSummary.veiculos} helper="fontes distintas" icon={Globe2} />
      </div>

      {/* KPIs secundários */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Releases" value={summary.releases} helper="Drive" icon={Megaphone} />
        <KpiCard label="Imagens" value={summary.imagens} helper="Drive" icon={Image} />
        <KpiCard label="Clipping" value={summary.clipping} helper="Drive" icon={FolderOpen} />
        <KpiCard label="Posts" value={summary.posts} helper="Drive" icon={CalendarDays} />
      </div>

      {/* Tabs de navegação */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(tab => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-black hover:border-gray-300'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB: CLIPPING */}
      {activeTab === 'clipping' && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-black" />
                    <h2 className="text-lg font-semibold text-black">Clipping Institucional</h2>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Notícias, matérias e publicações dos últimos 60 dias, agrupadas por mês.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <Input className="h-9 pl-8 text-sm" placeholder="Buscar publicação, veículo, palavra-chave..." value={query} onChange={(event) => setQuery(event.target.value)} />
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
                    <option value="Canal institucional">Canal institucional</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-800">Palavras-chave monitoradas:</span> {KEYWORDS.join(' · ')}
              </div>

              {clippingByMonth.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Nenhuma publicação encontrada para os filtros selecionados nos últimos 60 dias.</div>
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
                          <tbody>
                            {group.items.map((item) => <ClippingRow key={item.id} item={item} />)}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <span>{syncMessage}</span>
                {lastSync && <span>Última atualização: {lastSync.toLocaleString('pt-BR')}</span>}
              </div>
            </CardContent>
          </Card>

          {/* Links Relacionados */}
          <LinksClipping />

          {/* Impacto por museu + keywords side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <KeywordsCloud clippingItems={clippingItems} />
            <ImpactoMuseu clippingItems={clippingItems} driveItems={items} />
          </div>
        </div>
      )}

      {/* TAB: REDES SOCIAIS */}
      {activeTab === 'redes' && (
        <div className="space-y-6">
          <RedesSociaisPanel />
        </div>
      )}

      {/* TAB: ANÁLISE IA */}
      {activeTab === 'analise' && (
        <div className="space-y-6">
          <SinteseIA
            clippingItems={clippingItems}
            driveItems={items}
            keywords={KEYWORDS}
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <KeywordsCloud clippingItems={clippingItems} />
            <ImpactoMuseu clippingItems={clippingItems} driveItems={items} />
          </div>
        </div>
      )}

      {/* TAB: ACERVO DRIVE */}
      {activeTab === 'acervo' && (
        <div className="space-y-6">
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
      )}
    </div>
  );
}