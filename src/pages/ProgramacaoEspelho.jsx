import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, Calendar, Search, ExternalLink, Image, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ExportProgramacaoDialog from '@/components/programacao/ExportProgramacaoDialog';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO', 'Externo'];
const DATA_CORRECAO_NOTURNO_2024 = '06/12/2024';
const DATA_ISO_CORRECAO_NOTURNO_2024 = '2024-12-06';
const MONTH_KEY_CORRECAO_NOTURNO_2024 = '2024-12';

const MUSEU_COLORS = {
  MIS: 'bg-blue-100 text-blue-800',
  MHAB: 'bg-green-100 text-green-800',
  MUMO: 'bg-purple-100 text-purple-800',
  Externo: 'bg-gray-100 text-gray-700',
};

const MONTH_NAME_TO_NUMBER = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

const ATIVIDADES_NOTURNO_2024 = [
  'pensamento do fora',
  'iluminacao das esculturas dos jardins',
  'instalacao da obra pensamento do fora',
  'corpo agua',
  'corpo-agua',
  'samba de roda oridende',
  'mostra digital de trabalhos de arte da galeria aut',
  'coletivo as pandeirista',
  'oficina de estamparia com preta aya',
  'aline calixto',
  'clara nunes',
  'victor santana',
  'samba da meia noite',
  'visitas mediadas complexa cidade',
  'belo horizonte fora dos planos',
  'quarteto chico amaral',
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["“”'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProgramacaoTitle(item) {
  return item?.titulo || item?.nome_acao || item?.nome || item?.acao || '';
}

function isAtividadeNoturno2024(item) {
  const text = normalizeText([
    getProgramacaoTitle(item),
    item?.sinopse,
    item?.descricao,
    item?.local,
  ].filter(Boolean).join(' '));

  return ATIVIDADES_NOTURNO_2024.some((needle) => text.includes(normalizeText(needle)));
}

function getMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getYearFromSheetContext(item) {
  const explicitYear = Number(item?.ano || item?.ano_referencia || item?.year || item?.sync_year);
  if (Number.isFinite(explicitYear) && explicitYear >= 2020 && explicitYear <= 2035) return explicitYear;

  const possibleKeys = [
    item?.month_key,
    item?.sync_month,
    item?.aba,
    item?.sheet_name,
    item?.sheet,
    item?.worksheet,
    item?.origem_aba,
    item?.nome_aba,
    item?.tab,
    item?.source_tab,
    item?.source_sheet,
  ];

  for (const value of possibleKeys) {
    const text = String(value || '');
    const fullYear = text.match(/20\d{2}/);
    if (fullYear) return Number(fullYear[0]);

    const shortYear = text.match(/(?:^|\D)(2[4-9]|3[0-5])(?:\D|$)/);
    if (shortYear) return 2000 + Number(shortYear[1]);
  }

  return null;
}

function getMonthFromSheetContext(item) {
  const key = item?.month_key || item?.sync_month;
  const keyMatch = String(key || '').match(/20\d{2}-(\d{2})/);
  if (keyMatch) return Number(keyMatch[1]);

  const text = normalizeText([
    item?.month_key,
    item?.sync_month,
    item?.aba,
    item?.sheet_name,
    item?.sheet,
    item?.worksheet,
    item?.origem_aba,
    item?.nome_aba,
    item?.tab,
    item?.source_tab,
    item?.source_sheet,
    item?.mes,
    item?.mes_referencia,
  ].filter(Boolean).join(' '));

  for (const [monthName, monthNumber] of Object.entries(MONTH_NAME_TO_NUMBER)) {
    if (text.includes(monthName)) return monthNumber;
  }

  return null;
}

function parseDateInfo(value, item = {}) {
  const raw = String(value || '').trim();
  const text = normalizeText(raw);

  if (!raw) return null;

  const iso = raw.match(/^(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) {
    return { day: Number(iso[3]), month: Number(iso[2]), year: Number(iso[1]), hasYear: true };
  }

  const brFull = raw.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  if (brFull) {
    return { day: Number(brFull[1]), month: Number(brFull[2]), year: Number(brFull[3]), hasYear: true };
  }

  const dayMonth = raw.match(/(\d{1,2})\/(\d{1,2})(?!\/) /) || raw.match(/(\d{1,2})\/(\d{1,2})(?!\/)/);
  if (dayMonth) {
    return { day: Number(dayMonth[1]), month: Number(dayMonth[2]), year: null, hasYear: false };
  }

  const monthFromName = Object.entries(MONTH_NAME_TO_NUMBER).find(([name]) => text.includes(name));
  const dayMatch = text.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
  if (monthFromName && dayMatch) {
    return { day: Number(dayMatch[1]), month: monthFromName[1], year: null, hasYear: false };
  }

  const contextMonth = getMonthFromSheetContext(item);
  if (dayMatch && contextMonth) {
    return { day: Number(dayMatch[1]), month: contextMonth, year: null, hasYear: false };
  }

  return null;
}

function formatDateBR(day, month, year) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function formatDateISO(day, month, year) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDateBySheetYear(item) {
  if (isAtividadeNoturno2024(item)) {
    return {
      ...item,
      data: DATA_CORRECAO_NOTURNO_2024,
      data_inicio: DATA_ISO_CORRECAO_NOTURNO_2024,
      data_realizacao: DATA_ISO_CORRECAO_NOTURNO_2024,
      month_key: MONTH_KEY_CORRECAO_NOTURNO_2024,
      sync_month: MONTH_KEY_CORRECAO_NOTURNO_2024,
      ano: 2024,
      ano_referencia: 2024,
    };
  }

  const sheetYear = getYearFromSheetContext(item);
  if (!sheetYear) return item;

  const dateInfo = parseDateInfo(item?.data || item?.data_inicio || item?.data_realizacao, item);
  if (!dateInfo || dateInfo.hasYear) return item;

  const month = dateInfo.month || getMonthFromSheetContext(item);
  if (!dateInfo.day || !month) return item;

  const data = formatDateBR(dateInfo.day, month, sheetYear);
  const iso = formatDateISO(dateInfo.day, month, sheetYear);
  const monthKey = `${sheetYear}-${String(month).padStart(2, '0')}`;

  return {
    ...item,
    data,
    data_inicio: item?.data_inicio || iso,
    data_realizacao: item?.data_realizacao || iso,
    month_key: item?.month_key || monthKey,
    sync_month: item?.sync_month || monthKey,
    ano: item?.ano || sheetYear,
    ano_referencia: item?.ano_referencia || sheetYear,
  };
}

function getItemMonthKey(item) {
  return item.month_key || item.sync_month || (item.data_inicio ? getMonthKey(new Date(item.data_inicio)) : null);
}

function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function formatMonthLabel(key) {
  const date = parseMonthKey(key);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function prevMonth(key) {
  const date = parseMonthKey(key);
  date.setMonth(date.getMonth() - 1);
  return getMonthKey(date);
}

function nextMonth(key) {
  const date = parseMonthKey(key);
  date.setMonth(date.getMonth() + 1);
  return getMonthKey(date);
}

export default function ProgramacaoEspelho() {
   const [allItems, setAllItems] = useState([]);
   const [loading, setLoading] = useState(true);
   const [currentMonth, setCurrentMonth] = useState(getMonthKey(new Date()));
   const [museuFilter, setMuseuFilter] = useState('Todos');
   const [search, setSearch] = useState('');
   const [availableMonths, setAvailableMonths] = useState([]);
   const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
   const [availableYears, setAvailableYears] = useState([]);
   const [showExportDialog, setShowExportDialog] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await base44.entities.Programacao.list('-data_inicio', 5000);
      const items = (Array.isArray(data) ? data : []).map(normalizeDateBySheetYear);
      setAllItems(items);

      const monthSet = new Set();
      items.forEach((item) => {
        const key = getItemMonthKey(item);
        if (key) monthSet.add(key);
      });
      const sorted = Array.from(monthSet).sort().reverse();
      setAvailableMonths(sorted);

      const yearSet = new Set(sorted.map(k => parseInt(k.split('-')[0])));
      const years = Array.from(yearSet).sort().reverse();
      setAvailableYears(years);

      const latestYear = years[0] || new Date().getFullYear();
      setYearFilter(latestYear);

      const latestMonthOfYear = sorted.find(k => k.startsWith(String(latestYear)));
      if (latestMonthOfYear) setCurrentMonth(latestMonthOfYear);

      setLoading(false);
    }
    load();
  }, []);

  const monthsOfYear = availableMonths.filter(k => k.startsWith(String(yearFilter)));
  const hasPrevInYear = monthsOfYear.includes(prevMonth(currentMonth));
  const hasNextInYear = monthsOfYear.includes(nextMonth(currentMonth));

  const filtered = allItems.filter((item) => {
    const key = getItemMonthKey(item) || '';
    if (key !== currentMonth) return false;
    if (museuFilter !== 'Todos' && item.museu !== museuFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (item.titulo || '').toLowerCase().includes(q) ||
        (item.sinopse || item.descricao || '').toLowerCase().includes(q) ||
        (item.local || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hasPrev = hasPrevInYear;
  const hasNext = hasNextInYear;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-500" />
          <h1 className="text-xl font-semibold text-slate-800">Programação — Espelho da Planilha</h1>
        </div>
        <Button onClick={() => setShowExportDialog(true)} className="gap-2" variant="outline">
          <Download className="w-4 h-4" />
          Exportar
        </Button>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {availableYears.map(y => (
              <Button
                key={y}
                variant={yearFilter === y ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setYearFilter(y);
                  const firstMonth = availableMonths.find(k => k.startsWith(String(y)));
                  if (firstMonth) setCurrentMonth(firstMonth);
                }}
              >
                {y}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="outline" size="icon" disabled={!hasPrev} onClick={() => setCurrentMonth(prevMonth(currentMonth))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {monthsOfYear.slice().sort().map(mk => {
              const label = parseMonthKey(mk).toLocaleDateString('pt-BR', { month: 'short' });
              return (
                <Button key={mk} variant={mk === currentMonth ? 'default' : 'outline'} size="sm" className="capitalize text-xs px-2" onClick={() => setCurrentMonth(mk)}>
                  {label}
                </Button>
              );
            })}
            <Button variant="outline" size="icon" disabled={!hasNext} onClick={() => setCurrentMonth(nextMonth(currentMonth))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar atividade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {MUSEUS.map((m) => (
            <Button key={m} variant={museuFilter === m ? 'default' : 'outline'} size="sm" onClick={() => setMuseuFilter(m)}>
              {m}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          Nenhuma atividade encontrada para {formatMonthLabel(currentMonth)}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Museu</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Data</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Horário</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nome da Ação</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Sinopse</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Público-alvo</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Vagas</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Inscrição</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Local</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Link Imagens</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Minibios</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Mat. Divulgação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge className={`text-xs ${MUSEU_COLORS[item.museu] || 'bg-gray-100 text-gray-700'}`}>
                      {item.museu || '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{item.data || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{item.horario || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[220px]">{item.titulo || item.nome_acao || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[260px]"><span className="line-clamp-3">{item.sinopse || item.descricao || '—'}</span></td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.publico_alvo || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.vagas || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[160px]">{item.inscricao || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.local || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.link_imagens ? (
                      <a href={item.link_imagens} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                        <Image className="w-3.5 h-3.5" />
                        <span>Ver</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[180px]"><span className="line-clamp-3 text-xs">{item.minibios || '—'}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.material_divulgacao_aprovado ? (
                      item.material_divulgacao_aprovado.startsWith('http') ? (
                        <a href={item.material_divulgacao_aprovado} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 text-xs">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Ver</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-600">{item.material_divulgacao_aprovado}</span>
                      )
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
            {filtered.length} atividade{filtered.length !== 1 ? 's' : ''} em {formatMonthLabel(currentMonth)}
          </div>
        </div>
      )}

      <ExportProgramacaoDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} data={filtered} currentMonth={currentMonth} formatMonthLabel={formatMonthLabel} />
    </div>
  );
}
