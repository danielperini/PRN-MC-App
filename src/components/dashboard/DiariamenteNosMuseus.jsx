import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Quote, Calendar, RefreshCw, BookOpen, ChevronRight } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];
const FRASES_REFRESH_MS = 48 * 60 * 60 * 1000;

const MUSEU_COLORS = {
  MIS: { accentBar: 'bg-blue-600', badge: 'bg-blue-600 text-white' },
  MHAB: { accentBar: 'bg-emerald-700', badge: 'bg-emerald-700 text-white' },
  MUMO: { accentBar: 'bg-violet-700', badge: 'bg-violet-700 text-white' },
};

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function normalizeMuseu(value) {
  const text = normalize(value);
  if (text.includes('MUMO') || text.includes('MODA')) return 'MUMO';
  if (text.includes('MHAB') || text.includes('ABILIO')) return 'MHAB';
  if (text.includes('MIS') || text.includes('IMAGEM E SOM')) return 'MIS';
  return String(value || '').trim();
}

function getMuseuStyle(museu) {
  return MUSEU_COLORS[normalizeMuseu(museu)] || { accentBar: 'bg-slate-700', badge: 'bg-slate-800 text-white' };
}

function dailySeed() {
  const now = new Date();
  if (now.getUTCHours() < 9) now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

function seedNumber(seed, salt = '') {
  let h = 2166136261;
  for (const c of `${seed}:${salt}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function deterministicRotate(items, count, seed, salt) {
  if (items.length <= count) return items;
  const start = seedNumber(seed, salt) % items.length;
  return Array.from({ length: count }, (_, i) => items[(start + i) % items.length]);
}

function cacheKey(museu) { return `museus_centro_diariamente_local_v3_${museu}`; }
function readCache(museu) {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(museu)) || 'null');
    return value && Array.isArray(value.frases) ? value : null;
  } catch { return null; }
}

function cacheFresh(value) {
  return Boolean(value?.frases?.length && Date.now() - Number(value.savedAt || 0) < FRASES_REFRESH_MS);
}

function dateLabel(report) {
  const raw = report?.mes_referencia || report?.data_referencia || report?.data_inicio || report?.created_date;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
}

function sentenceCandidates(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim().replace(/^[-•–—]+\s*/, ''))
    .filter(s => s.length >= 55 && s.length <= 360)
    .filter(s => !/^https?:\/\//i.test(s));
}

function extractFromReport(report) {
  const out = [];
  const add = (text, autor = null) => {
    for (const frase of sentenceCandidates(text)) out.push({ frase, autor });
  };

  if (Array.isArray(report?.depoimentos)) {
    for (const d of report.depoimentos) add(d?.texto || d?.depoimento || d?.fala, d?.autor || d?.nome || null);
  }

  for (const field of ['resumo_periodo', 'resumo_executivo', 'avaliacao_pontos_positivos', 'comentarios_gerais', 'oportunidades_resumo']) {
    add(report?.[field]);
  }

  if (Array.isArray(report?.atividades)) {
    for (const activity of report.atividades) {
      add(activity?.resultado_alcancado);
      add(activity?.descricao);
    }
  }

  const seen = new Set();
  return out.filter(item => {
    const key = normalize(item.frase);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadLocalFrases(museu) {
  const reports = await base44.entities.Report.list('-updated_date', 5000);
  const approved = (Array.isArray(reports) ? reports : []).filter(report => {
    const status = normalize(report?.status);
    return status === 'APPROVED' || status === 'APROVADO' || status === 'APROVADO_COORD' || status === 'APROVADO ADMIN';
  });

  const filtered = museu === 'Todos'
    ? approved
    : approved.filter(report => normalizeMuseu(report?.museu || report?.museu_secundario || report?.unidade) === museu);

  const candidates = [];
  for (const report of filtered) {
    for (const item of extractFromReport(report)) {
      candidates.push({
        frase: item.frase,
        museu: normalizeMuseu(report?.museu || report?.museu_secundario || report?.unidade) || 'Museu Centro',
        data: dateLabel(report),
        autor: item.autor || report?.author_name || null,
        fonte: 'Relatório interno',
        report_id: report?.id || null,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = normalize(item.frase);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function FraseCard({ item, idx }) {
  const style = getMuseuStyle(item.museu);
  const autorValido = item.autor && !['null', 'undefined'].includes(String(item.autor).toLowerCase());
  return (
    <div className="relative flex flex-col rounded-xl bg-white overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5" style={{ border: '1px solid rgba(0,0,0,0.18)', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', animation: 'fade-up .4s ease both', animationDelay: `${idx * 80}ms` }}>
      <div className={`h-1 w-full ${style.accentBar}`} />
      <div className="flex flex-col gap-2.5 p-4 flex-1">
        <div><Quote className="w-4 h-4 text-slate-300 mb-1" /><p className="text-slate-900 text-sm leading-relaxed font-medium">“{item.frase}”</p></div>
        {autorValido && <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${style.badge}`}>{String(item.autor).charAt(0).toUpperCase()}</div><span className="text-xs text-slate-700 font-semibold truncate">{item.autor}</span></div>}
        <div className="mt-auto pt-2.5 flex flex-col gap-1.5 border-t border-slate-200">
          <div className="flex items-center justify-between">
            {item.museu && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm tracking-wide uppercase ${style.badge}`}>{item.museu}</span>}
            {item.data && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Calendar className="w-3 h-3" />{item.data}</span>}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] text-slate-400"><BookOpen className="w-3 h-3" />{item.fonte}</span>
            {item.report_id && <a href={`/ReportEditor?id=${item.report_id}`} className="flex items-center gap-0.5 text-[10px] text-slate-600 hover:text-slate-900 font-semibold">Ver relatório <ChevronRight className="w-3 h-3" /></a>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="rounded-xl overflow-hidden animate-pulse border border-slate-200"><div className="h-1 bg-slate-300" /><div className="p-4 space-y-3 bg-white"><div className="h-3 bg-slate-200 rounded" /><div className="h-3 bg-slate-200 rounded w-4/5" /><div className="h-3 bg-slate-200 rounded w-3/5" /><div className="h-2 bg-slate-100 rounded w-1/3 mt-3" /></div></div>;
}

export default function DiariamenteNosMuseus() {
  const { isCoordenador } = useCurrentUser();
  const [frases, setFrases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [museuFilter, setMuseuFilter] = useState('Todos');
  const [forceRefresh, setForceRefresh] = useState(false);

  const load = useCallback(async (museu, force = false) => {
    setLoading(true);
    const cached = readCache(museu);
    if (!force && cacheFresh(cached)) { setFrases(cached.frases); setLoading(false); return; }

    try {
      const all = await loadLocalFrases(museu);
      const selected = deterministicRotate(all, 3, dailySeed(), museu);
      setFrases(selected);
      try { localStorage.setItem(cacheKey(museu), JSON.stringify({ frases: selected, savedAt: Date.now(), source: 'appgestor-local' })); } catch {}
    } catch (error) {
      console.error('DiariamenteNosMuseus:', error);
      if (cached?.frases?.length) setFrases(cached.frases); else setFrases([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load(museuFilter, forceRefresh);
    if (forceRefresh) setForceRefresh(false);
  }, [museuFilter, forceRefresh, load]);

  const visibleFrases = useMemo(() => frases.slice(0, 3), [frases]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-900 tracking-tight">Diariamente nos Museus</h2><p className="text-sm text-slate-500 mt-0.5">3 fragmentos em rodízio diário — alterna 100% do acervo disponível ao longo dos dias.</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">{MUSEUS.map(m => <button key={m} onClick={() => setMuseuFilter(m)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${museuFilter === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>{m}</button>)}</div>
          {isCoordenador && <button onClick={() => { try { localStorage.removeItem(cacheKey(museuFilter)); } catch {} setForceRefresh(true); }} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs text-slate-600 hover:border-slate-400 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Novas frases</button>}
        </div>
      </div>
      <div className="flex items-center gap-3"><div className="flex-1 h-px bg-slate-300" /><Quote className="w-4 h-4 text-slate-500" /><div className="flex-1 h-px bg-slate-300" /></div>
      {loading ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[0,1,2].map(i => <SkeletonCard key={i} />)}</div> : visibleFrases.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2"><Quote className="w-10 h-10 opacity-20" /><p className="text-sm">Nenhuma frase encontrada para este filtro.</p><p className="text-xs text-slate-400">São usadas frases reais dos relatórios aprovados, sem dependência de função externa.</p></div> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{visibleFrases.map((item, idx) => <FraseCard key={`${item.report_id || item.frase}-${idx}`} item={item} idx={idx} />)}</div>}
      <style>{`@keyframes fade-up { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
