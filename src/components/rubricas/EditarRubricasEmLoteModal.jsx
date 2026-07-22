import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { X, Search, CheckSquare, Square, Save, Tag, Building2 } from 'lucide-react';
import { METAS_OFICIAIS } from '@/utils/finance/metaFinancialMetrics';
import { normalizeText } from '@/utils/constants';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

const CENTROS_CUSTO_OPTS = [
  'MHAB', 'MIS BH', 'MUMO',
  'Noturno nos Museus', 'Noturno Pampulha',
  'Coordenação', 'Comunicação', 'Educação', 'Produção',
  'Administrativo-financeiro', 'Publicações', 'Consultorias',
  'Despesas Gerais', 'Geral/Transversal',
];

/**
 * Modal para edição em lote de rubricas:
 * - Selecionar/desvincular metas (meta_manual_ids)
 * - Alterar centro_custo
 *
 * Props:
 *   rubricas: array de rubricas
 *   initialQuery: string opcional para pré-filtrar
 *   onClose: fn
 *   onUpdated: fn async
 */
export default function EditarRubricasEmLoteModal({ rubricas = [], initialQuery = '', onClose, onUpdated }) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(new Set()); // ids de rubricas selecionadas
  const [mode, setMode] = useState('meta'); // 'meta' | 'centro'
  const [metaAlvo, setMetaAlvo] = useState('');   // numero da meta
  const [metaAcao, setMetaAcao] = useState('vincular'); // 'vincular' | 'desvincular'
  const [centroAlvo, setCentroAlvo] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return (rubricas || []).filter(r => {
      if (!r || r.ativo === false) return false;
      const hay = normalizeText([r.rubrica, r.nome, r.grupo, r.centro_custo, r.meta].filter(Boolean).join(' '));
      return !q || hay.includes(q);
    });
  }, [rubricas, query]);

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(r => r.id)));
    }
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  async function handleSalvar() {
    if (!someSelected) { toast.error('Selecione ao menos uma rubrica'); return; }
    if (mode === 'meta' && !metaAlvo) { toast.error('Selecione uma meta'); return; }
    if (mode === 'centro' && !centroAlvo) { toast.error('Selecione um centro de custo'); return; }

    setSaving(true);
    try {
      const rubricasSelecionadas = (rubricas || []).filter(r => selected.has(r.id));
      const metaNome = METAS_OFICIAIS.find(m => m.numero === metaAlvo);

      const promises = rubricasSelecionadas.map(async (r) => {
        if (mode === 'meta') {
          const current = Array.isArray(r.meta_manual_ids) ? [...r.meta_manual_ids] : [];
          const next = metaAcao === 'vincular'
            ? [...new Set([...current, metaAlvo])]
            : current.filter(m => m !== metaAlvo);
          return base44.entities.Rubrica.update(r.id, {
            meta_manual_ids: next,
            meta: next.length > 0 ? (metaNome?.numeroFormatado || next[0]) : (r.meta || ''),
            meta_titulo: metaAcao === 'vincular' ? (metaNome?.titulo || '') : (r.meta_titulo || ''),
          });
        } else {
          return base44.entities.Rubrica.update(r.id, { centro_custo: centroAlvo });
        }
      });

      await Promise.all(promises);
      toast.success(`${rubricasSelecionadas.length} rubrica(s) atualizada(s) com sucesso!`);
      setSelected(new Set());
      if (onUpdated) await onUpdated();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="text-lg font-bold">Edição em Lote de Rubricas</h3>
            <p className="text-sm text-neutral-500">Selecione rubricas e aplique vínculos de meta ou centro de custo em lote</p>
          </div>
          <button onClick={onClose} className="rounded-lg border p-2 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
        </div>

        {/* Ação alvo */}
        <div className="border-b px-4 py-3 bg-neutral-50 space-y-3">
          {/* Modo */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('meta')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${mode === 'meta' ? 'bg-black text-white border-black' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}
            >
              <Tag className="h-3.5 w-3.5" /> Vínculo de Meta
            </button>
            <button
              onClick={() => setMode('centro')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${mode === 'centro' ? 'bg-black text-white border-black' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}
            >
              <Building2 className="h-3.5 w-3.5" /> Centro de Custo
            </button>
          </div>

          {mode === 'meta' && (
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={metaAlvo}
                onChange={e => setMetaAlvo(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm bg-white"
              >
                <option value="">Selecione a meta...</option>
                {METAS_OFICIAIS.map(m => (
                  <option key={m.numero} value={m.numero}>{m.numeroFormatado} — {m.titulo}</option>
                ))}
              </select>
              <div className="flex items-center rounded-lg border overflow-hidden text-sm font-semibold">
                {[['vincular', 'Vincular'], ['desvincular', 'Desvincular']].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setMetaAcao(v)}
                    className={`px-3 py-2 transition ${metaAcao === v ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
                  >{l}</button>
                ))}
              </div>
            </div>
          )}

          {mode === 'centro' && (
            <select
              value={centroAlvo}
              onChange={e => setCentroAlvo(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm bg-white"
            >
              <option value="">Selecione o centro de custo...</option>
              {CENTROS_CUSTO_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Busca + select all */}
        <div className="border-b p-4 flex items-center gap-3">
          <button onClick={toggleAll} className="flex-shrink-0 text-neutral-500 hover:text-black">
            {allSelected ? <CheckSquare className="h-5 w-5 text-black" /> : <Square className="h-5 w-5" />}
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar rubrica por nome, grupo, centro de custo..."
              className="w-full rounded-xl border pl-10 pr-4 py-2 text-sm"
            />
          </div>
          <span className="text-xs text-neutral-500 whitespace-nowrap">{selected.size} selecionada(s)</span>
        </div>

        {/* Lista de rubricas */}
        <div className="flex-1 overflow-auto p-4 space-y-1.5">
          {filtered.map(r => {
            const isSelected = selected.has(r.id);
            const metas = Array.isArray(r.meta_manual_ids) && r.meta_manual_ids.length > 0 ? r.meta_manual_ids.join(', ') : null;
            const previsto = Number(r.valor_rubrica || r.valor_total || 0);
            const utilizado = Number(r.valor_utilizado || 0);
            return (
              <label
                key={r.id}
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition hover:bg-neutral-50 ${isSelected ? 'border-black bg-black/5' : 'border-neutral-200'}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(r.id)}
                  className="mt-0.5 h-4 w-4 accent-black flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-neutral-900">{r.rubrica || r.nome || 'Sem nome'}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-neutral-500">
                    {r.grupo && <span>{r.grupo}</span>}
                    {r.centro_custo && <span className="font-semibold text-neutral-600">{r.centro_custo}</span>}
                    {metas && <span className="text-blue-600">Metas: {metas}</span>}
                    <span>Prev: {fmtBRL(previsto)} · Util: {fmtBRL(utilizado)}</span>
                  </div>
                </div>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-neutral-400 py-10 text-sm">Nenhuma rubrica encontrada</p>
          )}
        </div>

        {/* Rodapé */}
        <div className="border-t p-4 flex justify-between items-center gap-3">
          <p className="text-sm text-neutral-500">
            {someSelected ? `${selected.size} rubrica(s) selecionada(s) de ${filtered.length} exibida(s)` : 'Nenhuma rubrica selecionada'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm text-neutral-600 hover:bg-neutral-50">
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={saving || !someSelected}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition ${someSelected && !saving ? 'bg-black text-white hover:bg-neutral-800' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Aplicar em Lote'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}