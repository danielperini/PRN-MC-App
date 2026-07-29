import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, X, Search, Pencil, ArrowLeft, Link2 } from 'lucide-react';

const GRUPOS_METAS_FISICAS = {
  'm10': { meta: 18, label: '18 mostras' },
  'm16': { meta: 101, label: '101 diárias' },
  'm19': { meta: 4, label: '4 ações Iemanjá' },
  'm20': { meta: 30, label: '30 ações' },
};

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function normalizeGrupo(g) { return normalizeText(g); }
function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(Number(v || 0));
}
function barColor(pct) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 60) return 'bg-blue-500';
  if (pct >= 30) return 'bg-yellow-400';
  return 'bg-red-400';
}
function badgeClass(pct) {
  if (pct >= 100) return 'border-green-500 bg-green-50 text-green-800';
  if (pct >= 60) return 'border-blue-500 bg-blue-50 text-blue-800';
  if (pct >= 30) return 'border-yellow-400 bg-yellow-50 text-yellow-800';
  return 'border-red-400 bg-red-50 text-red-800';
}
function pctColor(pct) {
  if (pct >= 100) return 'text-green-700 font-bold';
  if (pct >= 60) return 'text-blue-700 font-semibold';
  if (pct >= 30) return 'text-yellow-700';
  return 'text-red-600';
}
function detectMetaFisica(grupoNorm) {
  for (const [key, config] of Object.entries(GRUPOS_METAS_FISICAS)) {
    if (grupoNorm.includes(key)) return config;
  }
  return null;
}

// ─── GrupoCard ────────────────────────────────────────────────────────────────
function GrupoCard({ grupo, onOpen }) {
  const pct = Math.min(100, grupo.pct);
  const rawPct = grupo.pct; // real, pode passar de 100
  const StatusIcon = rawPct >= 100 ? CheckCircle2 : AlertCircle;
  const metaFisica = detectMetaFisica(normalizeGrupo(grupo.nome));

  return (
    <button
      type="button"
      onClick={() => onOpen(grupo)}
      className="text-left rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow-md focus:outline-none flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className="h-4 w-4 flex-shrink-0 text-black" />
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 truncate">
            {grupo.rubricasCount} rubrica{grupo.rubricasCount !== 1 ? 's' : ''}
          </span>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${badgeClass(rawPct)}`}>
          {rawPct.toFixed(0)}%
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-black">{grupo.nome || '(sem grupo)'}</p>
      </div>

      <div className="mt-auto space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-neutral-500 font-medium">Financeiro</span>
            <span className="font-bold text-black">{rawPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div className={`h-2 rounded-full transition-all ${barColor(rawPct)}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {metaFisica && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-neutral-500 font-medium">Físico — {metaFisica.label}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <div className="h-1.5 rounded-full bg-purple-400" style={{ width: '0%' }} />
            </div>
          </div>
        )}

        <div className="pt-1 space-y-1 text-xs">
          <div className="flex justify-between text-neutral-500">
            <span>Previsto</span>
            <span className="font-semibold text-neutral-800">{fmtBRL(grupo.previsto)}</span>
          </div>
          <div className="flex justify-between text-neutral-500">
            <span>Utilizado (NFs)</span>
            <span className="font-semibold text-neutral-800">{fmtBRL(grupo.utilizado)}</span>
          </div>
          <div className="flex justify-between text-neutral-500 border-t border-neutral-100 pt-1 mt-1">
            <span className="font-semibold">Saldo</span>
            <span className={`font-bold ${grupo.saldo < 0 ? 'text-red-600' : 'text-neutral-900'}`}>{fmtBRL(grupo.saldo)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── GrupoRubricasModal ────────────────────────────────────────────────────────
function GrupoRubricasModal({ grupo, todasRubricas, nfsPorRubrica, onClose, onUpdated }) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dirty, setDirty] = useState(false);
  const [showVincular, setShowVincular] = useState(false);
  const [queryVincular, setQueryVincular] = useState('');

  const grupoNorm = grupo ? normalizeGrupo(grupo.nome) : '';

  // Rubricas do grupo atual (para view)
  const rubricasDoGrupo = useMemo(() => {
    if (!grupo) return [];
    return (todasRubricas || []).filter(r => normalizeGrupo(r.grupo) === grupoNorm);
  }, [grupo, todasRubricas, grupoNorm]);

  useEffect(() => {
    if (!grupo) { setSelectedIds(new Set()); setDirty(false); setMode('view'); setShowVincular(false); setQueryVincular(''); return; }
    setSelectedIds(new Set(rubricasDoGrupo.map(r => r.id)));
    setDirty(false);
    setMode('view');
    setShowVincular(false);
    setQueryVincular('');
  }, [grupo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!grupo) return null;

  // Totais das rubricas do grupo
  const totalPrevisto = rubricasDoGrupo.reduce((s, r) => s + Number(r.valor_rubrica || r.valor_total || 0), 0);
  const totalUtilizado = rubricasDoGrupo.reduce((s, r) => s + (nfsPorRubrica[r.id] || 0), 0);
  const totalSaldo = totalPrevisto - totalUtilizado;
  const totalPct = totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0;

  // Para modo edição: totais dinâmicos das selecionadas
  const totalPrevistoEdit = (todasRubricas || []).filter(r => selectedIds.has(r.id)).reduce((s, r) => s + Number(r.valor_rubrica || r.valor_total || 0), 0);
  const totalUtilizadoEdit = (todasRubricas || []).filter(r => selectedIds.has(r.id)).reduce((s, r) => s + (nfsPorRubrica[r.id] || 0), 0);
  const pctEdit = totalPrevistoEdit > 0 ? Math.round((totalUtilizadoEdit / totalPrevistoEdit) * 100) : 0;

  // Filtro para lista de view
  const filteredView = rubricasDoGrupo.filter(r => {
    const q = normalizeText(query);
    if (!q) return true;
    return normalizeText([r.rubrica, r.nome, r.grupo, r.meta, r.meta_titulo].filter(Boolean).join(' ')).includes(q);
  });

  // Filtro para lista de edição
  const filteredEdit = (todasRubricas || []).filter(r => {
    const q = normalizeText(query);
    if (!q) return true;
    return normalizeText([r.rubrica, r.nome, r.grupo, r.descricao].filter(Boolean).join(' ')).includes(q);
  });

  function toggleLocal(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setDirty(true);
  }

  async function handleSalvar() {
    setSaving(true);
    try {
      const promises = (todasRubricas || []).map(async (rubrica) => {
        const eraNesse = normalizeGrupo(rubrica.grupo || '') === grupoNorm;
        const deveEstar = selectedIds.has(rubrica.id);
        if (eraNesse === deveEstar) return;
        await base44.entities.Rubrica.update(rubrica.id, { grupo: deveEstar ? grupo.nome : '' });
      });
      await Promise.all(promises);
      toast.success('Vínculos de grupo salvos!');
      setDirty(false);
      if (onUpdated) await onUpdated();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar vínculos');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-3 min-w-0">
            {mode === 'edit' && (
              <button onClick={() => { setMode('view'); setQuery(''); }} className="rounded-lg border p-1.5 hover:bg-neutral-100 flex-shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
                {mode === 'view' ? 'Memória de cálculo' : 'Editar vínculos'}
              </p>
              <h3 className="text-lg font-bold truncate">{grupo.nome || '(sem grupo)'}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {mode === 'view' && (
              <button
                onClick={() => { setShowVincular(v => !v); setQueryVincular(''); }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${showVincular ? 'border-black bg-black text-white' : 'border-neutral-300 hover:bg-neutral-50'}`}
              >
                <Link2 className="h-3.5 w-3.5" />
                Vincular rubricas
              </button>
            )}
            <button onClick={onClose} className="rounded-lg border p-2 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* KPIs */}
        <div className="border-b px-4 py-3 bg-neutral-50 flex flex-wrap gap-6 text-sm">
          {mode === 'view' ? (
            <>
              <span className="text-neutral-600">{rubricasDoGrupo.length} rubrica{rubricasDoGrupo.length !== 1 ? 's' : ''} vinculada{rubricasDoGrupo.length !== 1 ? 's' : ''} ao grupo.</span>
              <span className="text-neutral-600">Previsto: <b>{fmtBRL(totalPrevisto)}</b></span>
              <span className="text-neutral-600">Utilizado: <b>{fmtBRL(totalUtilizado)}</b></span>
              <span className="text-neutral-600">Saldo: <b className={totalSaldo < 0 ? 'text-red-600' : ''}>{fmtBRL(totalSaldo)}</b></span>
              <span className="text-neutral-600">Execução: <b className={pctColor(totalPct)}>{totalPct.toFixed(1)}%</b></span>
            </>
          ) : (
            <>
              <span className="text-neutral-600">Previsto: <b>{fmtBRL(totalPrevistoEdit)}</b></span>
              <span className="text-neutral-600">Utilizado: <b>{fmtBRL(totalUtilizadoEdit)}</b></span>
              <span className="text-neutral-600">Execução: <b>{pctEdit}%</b></span>
              <span className="text-neutral-500">{selectedIds.size} rubrica{selectedIds.size !== 1 ? 's' : ''} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>

        {/* Busca */}
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={mode === 'view' ? 'Buscar rubrica, grupo ou meta...' : 'Buscar rubrica...'}
              className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-auto">

          {/* ── MODO VIEW: tabela detalhada ── */}
          {mode === 'view' && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">Rubrica</th>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700 hidden md:table-cell">Grupo</th>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700 hidden lg:table-cell">Meta</th>
                  <th className="text-right px-4 py-3 font-semibold text-neutral-700">Previsto</th>
                  <th className="text-right px-4 py-3 font-semibold text-neutral-700">Utilizado</th>
                  <th className="text-right px-4 py-3 font-semibold text-neutral-700">Saldo</th>
                  <th className="text-right px-4 py-3 font-semibold text-neutral-700">%</th>
                </tr>
              </thead>
              <tbody>
                {filteredView.map((r, i) => {
                  const prev = Number(r.valor_rubrica || r.valor_total || 0);
                  const util = nfsPorRubrica[r.id] || 0;
                  const sald = prev - util;
                  const pct = prev > 0 ? (util / prev) * 100 : 0;
                  const meta = r.meta_titulo || r.meta || r.meta_codigo || '';
                  return (
                    <tr key={r.id} className={`border-b last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                      <td className="px-4 py-3 font-medium text-neutral-900 max-w-xs">
                        <span className="line-clamp-2">{r.rubrica || r.nome || '(sem nome)'}</span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{r.grupo || '—'}</td>
                      <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell max-w-[160px]">
                        <span className="line-clamp-2">{meta || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-700 whitespace-nowrap">{fmtBRL(prev)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700 whitespace-nowrap">{fmtBRL(util)}</td>
                      <td className={`px-4 py-3 text-right whitespace-nowrap font-semibold ${sald < 0 ? 'text-red-600' : 'text-neutral-700'}`}>{fmtBRL(sald)}</td>
                      <td className={`px-4 py-3 text-right whitespace-nowrap ${pctColor(pct)}`}>{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                {filteredView.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-neutral-400">Nenhuma rubrica encontrada</td></tr>
                )}
              </tbody>
              {filteredView.length > 0 && (
                <tfoot className="border-t-2 border-neutral-300 bg-neutral-100">
                  <tr>
                    <td className="px-4 py-3 font-bold text-neutral-900" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right font-bold text-neutral-900 whitespace-nowrap">{fmtBRL(totalPrevisto)}</td>
                    <td className="px-4 py-3 text-right font-bold text-neutral-900 whitespace-nowrap">{fmtBRL(totalUtilizado)}</td>
                    <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${totalSaldo < 0 ? 'text-red-600' : 'text-neutral-900'}`}>{fmtBRL(totalSaldo)}</td>
                    <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${pctColor(totalPct)}`}>{totalPct.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* ── PAINEL VINCULAR (dentro do view) ── */}
          {mode === 'view' && showVincular && (
            <div className="border-t bg-neutral-50">
              <div className="p-4 border-b flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-800">Vincular rubricas manualmente ao grupo <span className="text-black">"{grupo.nome}"</span></p>
                <button onClick={() => { setShowVincular(false); setQueryVincular(''); setDirty(false); setSelectedIds(new Set(rubricasDoGrupo.map(r => r.id))); }} className="text-xs text-neutral-400 hover:text-neutral-700">Cancelar</button>
              </div>
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                  <input
                    value={queryVincular}
                    onChange={e => setQueryVincular(e.target.value)}
                    placeholder="Buscar rubrica para vincular..."
                    className="w-full rounded-lg border pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-auto p-3 space-y-1.5">
                {(todasRubricas || [])
                  .filter(r => {
                    const q = normalizeText(queryVincular);
                    if (!q) return true;
                    return normalizeText([r.rubrica, r.nome, r.grupo].filter(Boolean).join(' ')).includes(q);
                  })
                  .map(rubrica => {
                    const linked = selectedIds.has(rubrica.id);
                    const previsto = Number(rubrica.valor_rubrica || rubrica.valor_total || 0);
                    const utilizado = nfsPorRubrica[rubrica.id] || 0;
                    return (
                      <label key={rubrica.id} className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition hover:bg-white ${linked ? 'border-black bg-white' : 'border-neutral-200 bg-white'}`}>
                        <input type="checkbox" checked={linked} onChange={() => toggleLocal(rubrica.id)} className="h-4 w-4 accent-black flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm leading-tight">{rubrica.rubrica || rubrica.nome || '(sem nome)'}</p>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {rubrica.grupo ? <span className="italic mr-2">{rubrica.grupo}</span> : null}
                            {fmtBRL(previsto)} · Util: {fmtBRL(utilizado)}
                          </p>
                        </div>
                      </label>
                    );
                  })}
              </div>
              <div className="p-3 border-t flex justify-end gap-2">
                <button
                  onClick={handleSalvar}
                  disabled={saving || !dirty}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${dirty && !saving ? 'bg-black text-white hover:bg-neutral-800' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
                >
                  {saving ? 'Salvando...' : 'Salvar vínculos'}
                </button>
              </div>
            </div>
          )}

          {/* ── MODO EDIT: checkboxes ── */}
          {mode === 'edit' && (
            <div className="p-4 space-y-2">
              {filteredEdit.map(rubrica => {
                const linked = selectedIds.has(rubrica.id);
                const previsto = Number(rubrica.valor_rubrica || rubrica.valor_total || 0);
                const utilizado = nfsPorRubrica[rubrica.id] || 0;
                return (
                  <label key={rubrica.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition hover:bg-neutral-50 ${linked ? 'border-black bg-black/5' : 'border-neutral-200'}`}>
                    <input type="checkbox" checked={linked} onChange={() => toggleLocal(rubrica.id)} className="h-4 w-4 accent-black flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{rubrica.rubrica || rubrica.nome || '(sem nome)'}</p>
                      <p className="text-xs text-neutral-500">
                        {rubrica.grupo && <span className="mr-2 italic">{rubrica.grupo}</span>}
                        Previsto: {fmtBRL(previsto)} · Utilizado: {fmtBRL(utilizado)}
                      </p>
                    </div>
                  </label>
                );
              })}
              {filteredEdit.length === 0 && (
                <p className="text-center text-neutral-400 py-8">Nenhuma rubrica encontrada</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'edit' && (
          <div className="border-t p-4 flex justify-end gap-3">
            <button onClick={() => { setMode('view'); setQuery(''); }} className="px-4 py-2 rounded-lg border text-sm text-neutral-600 hover:bg-neutral-50">Cancelar</button>
            <button
              onClick={handleSalvar}
              disabled={saving || !dirty}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition ${dirty && !saving ? 'bg-black text-white hover:bg-neutral-800' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
            >
              {saving ? 'Salvando...' : 'Salvar vínculos'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrcamentoPorGrupoSection({ rubricas = [], compras = [], onUpdated }) {
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [todasRubricas, setTodasRubricas] = useState([]);

  useEffect(() => {
    // Excluir rubricas sem grupo — não devem aparecer em nenhum card de grupo
    setTodasRubricas(Array.isArray(rubricas) ? rubricas.filter(r => r?.ativo !== false && String(r?.grupo || '').trim() !== '') : []);
  }, [rubricas]);

  const nfsPorRubrica = useMemo(() => {
    const map = {};
    for (const p of (compras || [])) {
      if (!p.rubrica_id) continue;
      if (p.incluir_no_somatorio === false) continue;
      const val = Number(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0);
      map[p.rubrica_id] = (map[p.rubrica_id] || 0) + val;
    }
    return map;
  }, [compras]);

  const grupos = useMemo(() => {
    const map = new Map();
    for (const r of todasRubricas) {
      const nomeOriginal = String(r.grupo || '').trim();
      const key = normalizeGrupo(nomeOriginal) || '__sem_grupo__';
      if (!map.has(key)) map.set(key, { nome: nomeOriginal || '(sem grupo)', previsto: 0, utilizado: 0, count: 0 });
      const entry = map.get(key);
      if (nomeOriginal && entry.nome === '(sem grupo)') entry.nome = nomeOriginal;
      entry.previsto += Number(r.valor_rubrica || r.valor_total || 0);
      entry.utilizado += nfsPorRubrica[r.id] || 0;
      entry.count += 1;
    }
    return Array.from(map.values())
      .map(g => ({
        nome: g.nome,
        rubricasCount: g.count,
        previsto: g.previsto,
        utilizado: g.utilizado,
        saldo: g.previsto - g.utilizado,
        pct: g.previsto > 0 ? Number(((g.utilizado / g.previsto) * 100).toFixed(2)) : 0,
      }))
      .filter(g => g.previsto > 0 || g.utilizado > 0)
      .sort((a, b) => b.previsto - a.previsto);
  }, [todasRubricas, nfsPorRubrica]);

  async function handleUpdated() {
    const fresh = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
    setTodasRubricas(Array.isArray(fresh) ? fresh.filter(r => r?.ativo !== false) : []);
    if (onUpdated) await onUpdated();
  }

  if (grupos.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Orçamento e execução por grupo</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Percentual calculado sobre o valor original das rubricas — sem rendimentos e sem saldo comprometido.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {grupos.map(grupo => (
          <GrupoCard key={grupo.nome} grupo={grupo} onOpen={setSelectedGrupo} />
        ))}
      </div>

      <GrupoRubricasModal
        grupo={selectedGrupo}
        todasRubricas={todasRubricas}
        nfsPorRubrica={nfsPorRubrica}
        onClose={() => setSelectedGrupo(null)}
        onUpdated={async () => { setSelectedGrupo(null); await handleUpdated(); }}
      />
    </div>
  );
}