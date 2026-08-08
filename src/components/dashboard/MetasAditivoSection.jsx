import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, X, Search, Users, Layers } from 'lucide-react';
import EditarRubricasEmLoteModal from '@/components/rubricas/EditarRubricasEmLoteModal';
import { calculateMetaFinancialMetrics } from '@/utils/finance/metaFinancialMetrics';
import { getRubricaBudget, getRubricaUsed } from '@/utils/auditoria/reconcileFinancialTotals';
import { normalizeText } from '@/utils/constants';
import { resolveMetaPercentual } from '@/utils/finance/resolveMetaPercentual';
import { MESES_PT, isRelatorioNoPeriodo } from '@/hooks/useMetasPeriodoFiltro';
import { useDashboardCriterios, classificarComCriterios } from '@/hooks/useDashboardCriterios';

// Metas com quantitativos físicos definidos no Plano de Trabalho
const METAS_FISICAS_QUANTITATIVAS = {
  '5':   { meta: 60,  label: '60 ações educativas' },
  '6':   { meta: 36,  label: '36 ações culturais' },
  '10':  { meta: 18,  label: '18 mostras' },
  '19':  { meta: 4,   label: '4 ações Iemanjá' },
  '20':  { meta: 30,  label: '30 ações educativas/culturais' },
};

// Metas puramente financeiras que ainda exibem contagem de atividades como texto
const METAS_APENAS_FINANCEIRAS_COM_CONTAGEM = new Set(['11', '11B', '16']);

const SEIS_MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Casa Kubitschek', 'Casa do Baile', 'MAP'];
const MUSEU_SHORT = { 'MHAB': 'MHAB', 'MIS': 'MIS', 'MUMO': 'MUMO', 'Casa Kubitschek': 'C.Kubi', 'Casa do Baile': 'C.Baile', 'MAP': 'MAP' };

const ANOS = [2026, 2027, 2028];
const METAS_OCULTAS_3_ADITIVO = new Set(['2', '4', '7', '8', '9', '14', '15']);

function deveOcultarMetaTerceiroAditivo(meta) {
  const numero = String(meta?._numero || meta?.numero || '').replace(/\D/g, '');
  const titulo = normalizeText(meta?.titulo || '');
  return METAS_OCULTAS_3_ADITIVO.has(numero) ||
    titulo.includes('inscricao') ||
    titulo.includes('leis de incentivo');
}

function getMuseuFromActivity(a) {
  const raw = (a.museu || a.equipe_responsavel || a._museu || '').toLowerCase();
  if (raw.includes('mhab') || raw.includes('abílio') || raw.includes('abilio')) return 'MHAB';
  if (raw.includes('mis') || raw.includes('imagem')) return 'MIS';
  if (raw.includes('mumo') || raw.includes('moda')) return 'MUMO';
  if (raw.includes('kubitschek') || raw.includes('kubit')) return 'Casa Kubitschek';
  if (raw.includes('baile')) return 'Casa do Baile';
  if (raw.includes('map') || raw.includes('pampulha')) return 'MAP';
  return null;
}

// Função robusta: extrai número da meta de activity mesmo em formatos como "MC3A-20"
function getMetaNumeroFromActivity(a) {
  const codRaw = String(a.meta_codigo || '').toLowerCase().trim();
  const midRaw = String(a.meta_id || '').toLowerCase().trim();
  const KNOWN = new Set(['16', '19', '10', '11', '20', '5', '6']);
  const test = (n) => {
    if (!n) return null;
    const up = String(n).toUpperCase();
    if (up === '11B') return '11B';
    if (KNOWN.has(up)) return (up === '5' || up === '6' ? '20' : up);
    return null;
  };
  if (codRaw) {
    if (codRaw.includes('11b')) return '11B';
    const direct = codRaw.match(/^(\d+[a-z]?)/);
    if (direct) { const r = test(direct[1]); if (r) return r; }
    const parts = codRaw.match(/[-\s](\d+[a-z]?)\b/g);
    if (parts) {
      const last = parts[parts.length - 1].replace(/^[-\s]/, '');
      const r = test(last); if (r) return r;
    }
  }
  if (midRaw) {
    if (midRaw.includes('11b')) return '11B';
    const parts = midRaw.match(/[-\s](\d+[a-z]?)\b/g);
    if (parts) { const r = test(parts[parts.length - 1].replace(/^[-\s]/, '')); if (r) return r; }
    const direct = midRaw.match(/^(\d+[a-z]?)/);
    if (direct) { const r = test(direct[1]); if (r) return r; }
  }
  return null;
}

function barColorFromPct(pct) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 60)  return 'bg-blue-500';
  if (pct >= 30)  return 'bg-yellow-400';
  return 'bg-red-400';
}

function badgeClassFromPct(pct) {
  if (pct >= 100) return 'border-green-500 bg-green-50 text-green-800';
  if (pct >= 60)  return 'border-blue-500 bg-blue-50 text-blue-800';
  if (pct >= 30)  return 'border-yellow-400 bg-yellow-50 text-yellow-800';
  return 'border-red-400 bg-red-50 text-red-800';
}

function getRubricaNome(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome';
}

// Vínculo é 100% manual via meta_manual_ids
function isRubricaLinkedToMeta(rubrica, meta) {
  const metaNum = meta?._numero || meta?.numero || '';
  return Array.isArray(rubrica?.meta_manual_ids) && rubrica.meta_manual_ids.includes(metaNum);
}

// ─── FisicoMiniPanel ────────────────────────────────────────────────────────
function FisicoMiniPanel({ metaNumero, atividadesPorMuseu }) {
  const quantDef = METAS_FISICAS_QUANTITATIVAS[metaNumero];
  if (!quantDef) return null;

  const totalRealizado = Object.values(atividadesPorMuseu).reduce((s, v) => s + v, 0);
  const pctGeral = Math.min(100, Math.round((totalRealizado / quantDef.meta) * 100));
  const museusComDados = SEIS_MUSEUS.filter(m => (atividadesPorMuseu[m] || 0) > 0);

  return (
    <div className="mt-2 pt-2 border-t border-neutral-100 space-y-2">
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-neutral-500">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {totalRealizado} realizada{totalRealizado !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-neutral-700">{pctGeral}% <span className="font-normal">de {quantDef.meta}</span></span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
          <div className={`h-1.5 rounded-full transition-all ${barColorFromPct(pctGeral)}`} style={{ width: `${pctGeral}%` }} />
        </div>
      </div>
      {museusComDados.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {museusComDados.map(m => (
            <div key={m} className="flex items-center justify-between rounded bg-neutral-50 px-1.5 py-1 border border-neutral-100">
              <span className="text-[10px] font-medium text-neutral-500 truncate">{MUSEU_SHORT[m]}</span>
              <span className="text-[11px] font-bold text-neutral-800 ml-1">{atividadesPorMuseu[m]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MetaCard ────────────────────────────────────────────────────────────────
function MetaCard({ meta, onOpen, atividadesPorMuseu, nfsAprovadas }) {
  const metaNumero = (meta._numero || meta.numero || '').replace('META ', '').replace(/^0+/, '');
  const totalAtividades = Object.values(atividadesPorMuseu || {}).reduce((s, v) => s + v, 0);

  const resolved = resolveMetaPercentual(meta, totalAtividades, METAS_FISICAS_QUANTITATIVAS);
  const { principal, secundario, tipoPrincipal, principalReal } = resolved;
  const pctDisplay = principal; // já limitado a 100 em resolveMetaPercentual
  const isConcluida = meta.status === 'CONCLUÍDA';
  const StatusIcon = (isConcluida || principal >= 100) ? CheckCircle2 : AlertCircle;

  return (
    <button
      type="button"
      onClick={() => onOpen(meta)}
      className="text-left rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/10 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon className="h-4 w-4 flex-shrink-0 text-black" />
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{meta.numero}</span>
        </div>
        {/* Badge status */}
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${badgeClassFromPct(tipoPrincipal === 'fisico' ? principal : principal)}`}>
          {tipoPrincipal === 'fisico' ? `${principal}% fís.` : `${principal}%`}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-black">{meta.titulo}</p>
        {METAS_FISICAS_QUANTITATIVAS[metaNumero]?.valorUnitario && (
          <p className="mt-0.5 text-xs text-neutral-500">
            Valor unitário: R$ {METAS_FISICAS_QUANTITATIVAS[metaNumero].valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / diária
          </p>
        )}
        <p className="mt-1 text-sm leading-snug text-neutral-600">{meta.detalhe}</p>
      </div>

      <div className="mt-auto space-y-2">
        {tipoPrincipal === 'fisico' ? (
          <>
            {/* Barra Física */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-neutral-500 font-medium">Físico</span>
                <span className="font-bold text-black">
                  {principal}%{principalReal > 100 ? <span className="ml-1 text-green-600 font-semibold">({principalReal}% real)</span> : ''}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                <div className={`h-2 rounded-full transition-all ${barColorFromPct(principal)}`} style={{ width: `${pctDisplay}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] text-neutral-400">{totalAtividades} atividade{totalAtividades !== 1 ? 's' : ''} realizadas</p>
            </div>

            {/* Barra Financeira (quando há dados financeiros) */}
            {secundario !== null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-medium">Financeiro</span>
                  <span className="font-bold text-neutral-700">{secundario}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div className={`h-1.5 rounded-full transition-all ${barColorFromPct(secundario)}`} style={{ width: `${Math.min(secundario, 100)}%` }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Barra Financeira apenas */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-neutral-500 font-medium">Financeiro</span>
                <span className="font-bold text-black">{principal}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                <div className={`h-2 rounded-full transition-all ${barColorFromPct(principal)}`} style={{ width: `${pctDisplay}%` }} />
              </div>
              {/* Metas puramente financeiras: exibe contagem de atividades como texto */}
              {METAS_APENAS_FINANCEIRAS_COM_CONTAGEM.has(metaNumero) && totalAtividades > 0 && (
                <p className="mt-0.5 text-[10px] text-neutral-400">{totalAtividades} atividade{totalAtividades !== 1 ? 's' : ''} registradas</p>
              )}
            </div>
          </>
        )}

        {/* NFs aprovadas */}
        {nfsAprovadas > 0 && (
          <p className="text-xs text-neutral-500">
            NFs aprovadas: <span className="font-bold text-neutral-700">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(nfsAprovadas)}</span>
          </p>
        )}
      </div>

      {/* Painel físico por museu */}
      <FisicoMiniPanel metaNumero={metaNumero} atividadesPorMuseu={atividadesPorMuseu || {}} />
    </button>
  );
}

// ─── MetaRubricasModal ────────────────────────────────────────────────────────
function MetaRubricasModal({ meta, rubricas, onClose, onUpdated }) {
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dirty, setDirty] = useState(false);

  // Re-inicializa seleção sempre que a meta ou a lista de rubricas muda
  useEffect(() => {
    if (!meta) { setSelectedIds(new Set()); setDirty(false); return; }
    const metaNum = meta._numero || meta.numero;
    setSelectedIds(new Set(
      (rubricas || [])
        .filter(r => Array.isArray(r.meta_manual_ids) && r.meta_manual_ids.includes(metaNum))
        .map(r => r.id)
    ));
    setDirty(false);
  }, [meta, rubricas]);

  if (!meta) return null;

  function fmtBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(Number(value || 0));
  }

  const filteredRubricas = (rubricas || []).filter((rubrica) => {
    const haystack = normalizeText([
      getRubricaNome(rubrica),
      rubrica?.grupo,
      rubrica?.categoria,
      rubrica?.centro_custo,
      rubrica?.meta,
    ].filter(Boolean).join(' '));
    const q = normalizeText(query);
    return !q || haystack.includes(q);
  });

  function toggleLocal(rubricaId) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(rubricaId)) next.delete(rubricaId);
      else next.add(rubricaId);
      return next;
    });
    setDirty(true);
  }

  async function handleSalvar() {
    setSaving(true);
    const metaNum = meta._numero || meta.numero;
    const metaLabel = meta.numeroFormatado || meta.numero;
    const metaTitulo = meta.titulo;
    try {
      // Para cada rubrica, atualiza meta_manual_ids de acordo com a seleção
      const promises = (rubricas || []).map(async (rubrica) => {
        const eraVinculada = Array.isArray(rubrica.meta_manual_ids) && rubrica.meta_manual_ids.includes(metaNum);
        const deveVincular = selectedIds.has(rubrica.id);
        if (eraVinculada === deveVincular) return; // sem mudança
        const current = Array.isArray(rubrica.meta_manual_ids) ? [...rubrica.meta_manual_ids] : [];
        const next = deveVincular
          ? [...new Set([...current, metaNum])]
          : current.filter(m => m !== metaNum);
        // Atualiza meta_manual_ids + meta (campo legado para compatibilidade de cálculo)
        await base44.entities.Rubrica.update(rubrica.id, {
          meta_manual_ids: next,
          meta: next.length > 0 ? (next.includes(metaNum) ? metaLabel : rubrica.meta || '') : '',
          meta_titulo: deveVincular ? metaTitulo : (rubrica.meta_titulo || ''),
        });
      });
      await Promise.all(promises);
      toast.success('Vínculos salvos com sucesso!');
      setDirty(false);
      if (onUpdated) await onUpdated();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar vínculos');
    } finally {
      setSaving(false);
    }
  }

  const totalPrevisto = (rubricas || [])
    .filter(r => selectedIds.has(r.id))
    .reduce((s, r) => s + getRubricaBudget(r), 0);
  const totalUtilizado = (rubricas || [])
    .filter(r => selectedIds.has(r.id))
    .reduce((s, r) => s + getRubricaUsed(r), 0);
  const pctFinanceiro = totalPrevisto > 0 ? Math.round((totalUtilizado / totalPrevisto) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="text-lg font-bold">{meta.numero} · {meta.titulo}</h3>
            <p className="text-sm text-neutral-500">Selecione as rubricas vinculadas e clique em <b>Salvar</b> para confirmar</p>
          </div>
          <button onClick={onClose} className="rounded-lg border p-2 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Totais calculados das selecionadas */}
        <div className="border-b px-4 py-3 bg-neutral-50 flex flex-wrap gap-6 text-sm">
          <span className="text-neutral-600">Previsto total: <b>{fmtBRL(totalPrevisto)}</b></span>
          <span className="text-neutral-600">Utilizado total: <b>{fmtBRL(totalUtilizado)}</b></span>
          <span className="text-neutral-600">% Execução: <b>{pctFinanceiro}%</b></span>
          <span className="text-neutral-500">{selectedIds.size} rubrica{selectedIds.size !== 1 ? 's' : ''} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
        </div>

        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar rubrica"
              className="w-full rounded-xl border pl-10 pr-4 py-3"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-2">
          {filteredRubricas.map((rubrica) => {
            const linked = selectedIds.has(rubrica.id);
            const previsto = getRubricaBudget(rubrica);
            const utilizado = getRubricaUsed(rubrica);
            return (
              <label
                key={rubrica.id}
                className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition hover:bg-neutral-50 ${linked ? 'border-black bg-black/5' : 'border-neutral-200'}`}
              >
                <input
                  type="checkbox"
                  checked={linked}
                  onChange={() => toggleLocal(rubrica.id)}
                  className="h-4 w-4 accent-black flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{getRubricaNome(rubrica)}</p>
                  <p className="text-xs text-neutral-500">
                    {rubrica.grupo && <span className="mr-2">{rubrica.grupo}</span>}
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

        {/* Rodapé com botão Salvar */}
        <div className="border-t p-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm text-neutral-600 hover:bg-neutral-50">
            Cancelar
          </button>
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

// ─── Controles de Filtro ──────────────────────────────────────────────────────
function FiltroControles({ aditivo, setAditivo, dataInicio, setDataInicio, dataFim, setDataFim }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Toggle aditivo */}
      <div className="flex items-center rounded-lg border border-neutral-200 overflow-hidden text-xs font-semibold">
        {[['3º', '3º Aditivo'], ['4º', '4º Aditivo'], ['ambos', 'Ambos']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setAditivo(val)}
            className={`px-3 py-2 transition ${aditivo === val ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Seletor de intervalo */}
      <div className="flex items-center gap-2 text-xs text-neutral-600">
        <span className="font-medium text-neutral-500">De</span>
        <select
          value={dataInicio.mes}
          onChange={e => setDataInicio(d => ({ ...d, mes: e.target.value }))}
          className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs bg-white"
        >
          {MESES_PT.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={dataInicio.ano}
          onChange={e => setDataInicio(d => ({ ...d, ano: Number(e.target.value) }))}
          className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs bg-white"
        >
          {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <span className="font-medium text-neutral-500">até</span>
        <select
          value={dataFim.mes}
          onChange={e => setDataFim(d => ({ ...d, mes: e.target.value }))}
          className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs bg-white"
        >
          {MESES_PT.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={dataFim.ano}
          onChange={e => setDataFim(d => ({ ...d, ano: Number(e.target.value) }))}
          className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs bg-white"
        >
          {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MetasAditivoSection({ rubricas: rubricasProp = [], onRefresh, filtro, museuFiltro }) {
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [showLoteModal, setShowLoteModal] = useState(false);
  // Critérios dinamicos persistidos (Mesma fonte de verdade do CumprimentoMetasFisicas)
  const { criterios: criteriosMeta20 } = useDashboardCriterios('dashboard_criterios_meta_20');
  const { criterios: criteriosNoturno } = useDashboardCriterios('dashboard_criterios_noturno');
  const [rubricas, setRubricas] = useState(rubricasProp || []);
  const [loadingRubricas, setLoadingRubricas] = useState(false);
  const queryClient = useQueryClient();

  // Filtro interno (se não passado como prop)
  const [aditivoInterno, setAditivoInterno] = useState('ambos');
  const [dataInicioInterno, setDataInicioInterno] = useState({ mes: 'Fevereiro', ano: 2026 });
  const [dataFimInterno, setDataFimInterno] = useState({ mes: 'Dezembro', ano: 2028 });

  const aditivo = filtro?.aditivo ?? aditivoInterno;
  const setAditivo = filtro?.setAditivo ?? setAditivoInterno;
  const dataInicio = filtro?.dataInicio ?? dataInicioInterno;
  const setDataInicio = filtro?.setDataInicio ?? setDataInicioInterno;
  const dataFim = filtro?.dataFim ?? dataFimInterno;
  const setDataFim = filtro?.setDataFim ?? setDataFimInterno;

  const { data: relatorios = [] } = useQuery({
    queryKey: ['reports-metas-fisicas-aditivosection'],
    queryFn: () => base44.entities.Report.filter(
      { status: { $in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] } },
      '-ano', 500
    ),
    staleTime: 0,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities-metas-fisicas-aditivosection'],
    queryFn: () => base44.entities.Activity.filter(
      { classificacao: 'META' }, '-created_date', 1000
    ),
    staleTime: 0,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases-nfs-metas-aditivosection'],
    queryFn: () => base44.entities.PurchaseRequest.filter(
      { status: { $in: ['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO'] } },
      '-created_date', 2000
    ),
    staleTime: 0,
  });

  async function loadRubricas() {
    setLoadingRubricas(true);
    try {
      const data = await base44.entities.Rubrica.list('rubrica', 1000);
      setRubricas(Array.isArray(data) ? data.filter((item) => item?.ativo !== false) : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingRubricas(false);
    }
  }

  useEffect(() => {
    if (Array.isArray(rubricasProp) && rubricasProp.length > 0) {
      setRubricas(rubricasProp);
      return;
    }
    loadRubricas();
  }, [rubricasProp]);

  async function handleUpdated() {
    await loadRubricas();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.refetchQueries({ queryKey: ['purchases-nfs-metas-aditivosection'] }),
      queryClient.refetchQueries({ queryKey: ['activities-metas-fisicas-aditivosection'] }),
    ]);
    if (onRefresh) onRefresh();
  }

  // Filtrar rubricas por aditivo
  const rubricasFiltradas = useMemo(() => {
    if (aditivo === 'ambos') return rubricas;
    const suffix = aditivo === '3º' ? '3º ADITIVO' : '4º ADITIVO';
    return rubricas.filter(r => (r.origem_recurso || '').toUpperCase().includes(suffix.toUpperCase()));
  }, [rubricas, aditivo]);

  // Filtrar relatórios por período
  const relatoriosFiltrados = useMemo(() => {
    return relatorios.filter(r => isRelatorioNoPeriodo(r.mes_referencia, r.ano, dataInicio, dataFim));
  }, [relatorios, dataInicio, dataFim]);

  // Consolidar atividades filtradas
  const todasAtividades = useMemo(() => {
    const arr = [];
    for (const r of relatoriosFiltrados) {
      for (const a of (r.atividades || [])) {
        arr.push({ ...a, _museu: a.museu || r.museu || '' });
      }
    }
    // Activities da entidade: filtrar por relatório (via report_id) ou pela data da atividade
    for (const a of activities) {
      // Se tiver data_realizacao, usar para filtrar
      if (a.data_realizacao) {
        const dt = new Date(a.data_realizacao);
        if (!isNaN(dt.getTime())) {
          const mesNome = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][dt.getMonth()];
          if (!isRelatorioNoPeriodo(mesNome, dt.getFullYear(), dataInicio, dataFim)) continue;
        }
      }
      arr.push({ ...a, _museu: a.museu || '' });
    }
    return arr;
  }, [relatoriosFiltrados, activities, dataInicio, dataFim]);

  // Contagem por meta e por museu
  const atividadesPorMetaEMuseu = useMemo(() => {
    const result = {};
    for (const a of todasAtividades) {
      // 1. Tenta critérios dinâmicos (Meta 20 / Noturno 11) para consistência total com CumprimentoMetasFisicas
      let metaNum = null;
      if (criteriosMeta20 && classificarComCriterios(a, criteriosMeta20)) metaNum = '20';
      else if (criteriosNoturno && classificarComCriterios(a, criteriosNoturno)) metaNum = '11';
      else metaNum = getMetaNumeroFromActivity(a);
      if (!metaNum) continue;
      if (!result[metaNum]) result[metaNum] = {};
      const museu = getMuseuFromActivity(a);
      if (!museu) continue;
      result[metaNum][museu] = (result[metaNum][museu] || 0) + 1;
    }
    return result;
  }, [todasAtividades, criteriosMeta20, criteriosNoturno]);

  // Mapa: rubricaId → valor total NFs aprovadas/pagas
  // Cadeia oficial: valor_pago -> valor_aprovado_admin -> nf_valor_total -> valor_total -> valor_aprovado -> valor_solicitado
  // Apenas NFs APROVADO_ADMIN, APROVADO_COORD ou PAGO, que não estejam fora do somatório nem marcadas como duplicata financeira.
  const nfsPorRubrica = useMemo(() => {
    const map = {};
    const STATUS_OK = new Set(['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO']);
    for (const p of purchases) {
      if (!p.rubrica_id) continue;
      if (!STATUS_OK.has(p.status)) continue;
      if (p.incluir_no_somatorio === false) continue;
      if (p.duplicada_financeira === true) continue;
      const valor = Number(
        p.valor_pago || p.valor_aprovado_admin || p.nf_valor_total || p.valor_total || p.valor_aprovado || p.valor_solicitado || 0
      );
      if (valor <= 0) continue;
      map[p.rubrica_id] = (map[p.rubrica_id] || 0) + valor;
    }
    return map;
  }, [purchases]);

  // Mapa: metaNum → total NFs aprovadas cruzando rubricas vinculadas
  const nfsPorMeta = useMemo(() => {
    const map = {};
    for (const r of rubricas) {
      if (!Array.isArray(r.meta_manual_ids) || r.meta_manual_ids.length === 0) continue;
      const valorNF = nfsPorRubrica[r.id] || 0;
      if (valorNF === 0) continue;
      for (const metaNum of r.meta_manual_ids) {
        map[metaNum] = (map[metaNum] || 0) + valorNF;
      }
    }
    return map;
  }, [rubricas, nfsPorRubrica]);

  const metasCalculadas = useMemo(() => {
    const metrics = calculateMetaFinancialMetrics(rubricasFiltradas);
    return metrics.map(meta => {
      // Executado Real = soma das PurchaseRequests aprovadas/pagas vinculadas às rubricas desta meta
      const executadoReal = nfsPorMeta[meta.numero] || 0;
      // Percentual financeiro baseado no executado real (PurchaseRequests) vs previsto das rubricas
      const percentualFinanceiroReal = meta.previsto > 0
        ? Math.min(100, Number(((executadoReal / meta.previsto) * 100).toFixed(2)))
        : meta.percentualFinanceiro;

      const indicadorReal = meta.previsto > 0
        ? `${Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(executadoReal)} de ${Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(meta.previsto)} (NFs aprovadas)`
        : meta.indicador;

      return {
        numero: meta.numeroFormatado,
        titulo: meta.titulo,
        status: meta.status,
        detalhe: indicadorReal,
        percentual: percentualFinanceiroReal,
        percentualFisico: meta.status === 'CONCLUÍDA' ? 100 : percentualFinanceiroReal,
        previsto: meta.previsto,
        utilizado: executadoReal,
        saldo: meta.previsto - executadoReal,
        rubricasCount: meta.rubricasCount,
        indicador: indicadorReal,
        _numero: meta.numero,
        numeroFormatado: meta.numeroFormatado,
      };
    });
  }, [rubricasFiltradas, nfsPorMeta]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Metas do 3º e 4º Aditivo</h2>
          {loadingRubricas && <span className="text-xs text-neutral-400 animate-pulse">Atualizando...</span>}
          <button
            onClick={() => setShowLoteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition"
          >
            <Layers className="h-3.5 w-3.5" /> Editar Rubricas em Lote
          </button>
        </div>
        <FiltroControles
          aditivo={aditivo}
          setAditivo={setAditivo}
          dataInicio={dataInicio}
          setDataInicio={setDataInicio}
          dataFim={dataFim}
          setDataFim={setDataFim}
        />
      </div>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-opacity ${loadingRubricas ? 'opacity-60' : 'opacity-100'}`}>
        {metasCalculadas
          .filter((meta) => !deveOcultarMetaTerceiroAditivo(meta))
          .filter((meta) => {
            if (!museuFiltro) return true;
            const atividadesMuseu = atividadesPorMetaEMuseu[meta._numero] || {};
            const totalGeral = Object.values(atividadesPorMetaEMuseu[meta._numero] || {}).reduce((s, v) => s + v, 0);
            // Mostrar se tem atividades no museu do usuário, ou se não tem nenhum museu associado (meta geral)
            return (atividadesMuseu[museuFiltro] || 0) > 0 || totalGeral === 0;
          })
          .map((meta) => (
            <MetaCard
              key={meta.numero}
              meta={meta}
              onOpen={setSelectedMeta}
              atividadesPorMuseu={atividadesPorMetaEMuseu[meta._numero] || {}}
              nfsAprovadas={nfsPorMeta[meta._numero] || 0}
            />
          ))}
      </div>

      <MetaRubricasModal
        meta={selectedMeta}
        rubricas={rubricas}
        onClose={() => setSelectedMeta(null)}
        onUpdated={handleUpdated}
      />

      {showLoteModal && (
        <EditarRubricasEmLoteModal
          rubricas={rubricas}
          onClose={() => setShowLoteModal(false)}
          onUpdated={async () => { await handleUpdated(); setShowLoteModal(false); }}
        />
      )}
    </div>
  );
}