import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, X, Search } from 'lucide-react';

// Metas físicas quantitativas por grupo (nome normalizado → config)
const GRUPOS_METAS_FISICAS = {
  'm10': { meta: 18, label: '18 mostras' },
  'm16': { meta: 101, label: '101 diárias' },
  'm19': { meta: 4, label: '4 ações Iemanjá' },
  'm20': { meta: 30, label: '30 ações' },
};

function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeGrupo(g) {
  return normalizeText(g);
}

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

function detectMetaFisicaFromGrupo(grupoNorm) {
  for (const [key, config] of Object.entries(GRUPOS_METAS_FISICAS)) {
    if (grupoNorm.includes(key)) return config;
  }
  return null;
}

// ─── GrupoCard ────────────────────────────────────────────────────────────────
function GrupoCard({ grupo, onOpen }) {
  const pct = Math.min(100, grupo.pct);
  const StatusIcon = pct >= 100 ? CheckCircle2 : AlertCircle;
  const metaFisica = detectMetaFisicaFromGrupo(normalizeGrupo(grupo.nome));

  return (
    <button
      type="button"
      onClick={() => onOpen(grupo)}
      className="text-left rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow-md focus:outline-none flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className="h-4 w-4 flex-shrink-0 text-black" />
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 truncate">{grupo.rubricasCount} rubrica{grupo.rubricasCount !== 1 ? 's' : ''}</span>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${badgeClass(pct)}`}>
          {pct.toFixed(0)}%
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-black">{grupo.nome || '(sem grupo)'}</p>
      </div>

      <div className="mt-auto space-y-2">
        {/* Barra Financeira */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-neutral-500 font-medium">Financeiro</span>
            <span className="font-bold text-black">{pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div className={`h-2 rounded-full transition-all ${barColor(pct)}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Barra Física (quando grupo tem meta física mapeada) */}
        {metaFisica && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-neutral-500 font-medium">Físico — {metaFisica.label}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <div className="h-1.5 rounded-full bg-purple-400" style={{ width: '0%' }} />
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400">Progresso físico acompanhar nas atividades</p>
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
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!grupo) { setSelectedIds(new Set()); setDirty(false); return; }
    const grupoNorm = normalizeGrupo(grupo.nome);
    setSelectedIds(new Set(
      (todasRubricas || [])
        .filter(r => normalizeGrupo(r.grupo) === grupoNorm)
        .map(r => r.id)
    ));
    setDirty(false);
  }, [grupo, todasRubricas]);

  if (!grupo) return null;

  const filteredRubricas = (todasRubricas || []).filter(r => {
    const haystack = normalizeText([r.rubrica, r.nome, r.grupo, r.descricao].filter(Boolean).join(' '));
    const q = normalizeText(query);
    return !q || haystack.includes(q);
  });

  function toggleLocal(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setDirty(true);
  }

  const totalPrevisto = (todasRubricas || []).filter(r => selectedIds.has(r.id)).reduce((s, r) => s + Number(r.valor_rubrica || r.valor_total || 0), 0);
  const totalUtilizado = (todasRubricas || []).filter(r => selectedIds.has(r.id)).reduce((s, r) => s + (nfsPorRubrica[r.id] || 0), 0);
  const pctFinanceiro = totalPrevisto > 0 ? Math.round((totalUtilizado / totalPrevisto) * 100) : 0;

  async function handleSalvar() {
    setSaving(true);
    try {
      const promises = (todasRubricas || []).map(async (rubrica) => {
        const grupoNorm = normalizeGrupo(rubrica.grupo || '');
        const eraNesse = grupoNorm === normalizeGrupo(grupo.nome);
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
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="text-lg font-bold">{grupo.nome || '(sem grupo)'}</h3>
            <p className="text-sm text-neutral-500">Selecione as rubricas vinculadas a este grupo e clique em <b>Salvar</b></p>
          </div>
          <button onClick={onClose} className="rounded-lg border p-2 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="border-b px-4 py-3 bg-neutral-50 flex flex-wrap gap-6 text-sm">
          <span className="text-neutral-600">Previsto: <b>{fmtBRL(totalPrevisto)}</b></span>
          <span className="text-neutral-600">Utilizado: <b>{fmtBRL(totalUtilizado)}</b></span>
          <span className="text-neutral-600">Execução: <b>{pctFinanceiro}%</b></span>
          <span className="text-neutral-500">{selectedIds.size} rubrica{selectedIds.size !== 1 ? 's' : ''} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
        </div>

        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar rubrica..."
              className="w-full rounded-xl border pl-10 pr-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-2">
          {filteredRubricas.map(rubrica => {
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
          {filteredRubricas.length === 0 && (
            <p className="text-center text-neutral-400 py-8">Nenhuma rubrica encontrada</p>
          )}
        </div>

        <div className="border-t p-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm text-neutral-600 hover:bg-neutral-50">Cancelar</button>
          <button
            onClick={handleSalvar}
            disabled={saving || !dirty}
            className={`px-6 py-2 rounded-lg text-sm font-semibold transition ${dirty && !saving ? 'bg-black text-white hover:bg-neutral-800' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
          >
            {saving ? 'Salvando...' : 'Salvar vínculos'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrcamentoPorGrupoSection({ rubricas = [], compras = [], onUpdated }) {
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [todasRubricas, setTodasRubricas] = useState(rubricas);

  useEffect(() => {
    setTodasRubricas(Array.isArray(rubricas) ? rubricas.filter(r => r?.ativo !== false) : []);
  }, [rubricas]);

  // Mapa: rubricaId → soma NFs aprovadas/pagas
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

  // Agregar por grupo (normalizado)
  const grupos = useMemo(() => {
    const map = new Map(); // normalizedKey → { nome, rubricas, previsto, utilizado }

    for (const r of todasRubricas) {
      const nomeOriginal = String(r.grupo || '').trim();
      const key = normalizeGrupo(nomeOriginal) || '__sem_grupo__';
      if (!map.has(key)) {
        map.set(key, { nome: nomeOriginal || '(sem grupo)', rubricas: [], previsto: 0, utilizado: 0 });
      }
      const entry = map.get(key);
      // prefer non-empty name
      if (nomeOriginal && entry.nome === '(sem grupo)') entry.nome = nomeOriginal;
      entry.rubricas.push(r);
      entry.previsto += Number(r.valor_rubrica || r.valor_total || 0);
      entry.utilizado += nfsPorRubrica[r.id] || 0;
    }

    return Array.from(map.values())
      .map(g => ({
        nome: g.nome,
        rubricasCount: g.rubricas.length,
        previsto: g.previsto,
        utilizado: g.utilizado,
        saldo: g.previsto - g.utilizado,
        pct: g.previsto > 0 ? Math.min(100, Number(((g.utilizado / g.previsto) * 100).toFixed(2))) : 0,
      }))
      .filter(g => g.previsto > 0 || g.utilizado > 0)
      .sort((a, b) => b.previsto - a.previsto);
  }, [todasRubricas, nfsPorRubrica]);

  async function handleUpdated() {
    // Refetch rubricas frescas para o modal
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