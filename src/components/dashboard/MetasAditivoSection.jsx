import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, X, Search, Users } from 'lucide-react';
import { calculateMetaFinancialMetrics } from '@/utils/finance/metaFinancialMetrics';
import { getRubricaBudget, getRubricaUsed } from '@/utils/auditoria/reconcileFinancialTotals';
import { normalizeText } from '@/utils/constants';

// Metas com quantitativos físicos definidos no Plano de Trabalho
const METAS_FISICAS_QUANTITATIVAS = {
  '5':  { meta: 60,  label: '60 ações educativas' },
  '6':  { meta: 36,  label: '36 ações culturais' },
  '10': { meta: 18,  label: '18 mostras' },
  '16': { meta: 101, label: '101 diárias de educador' },
  '19': { meta: 4,   label: '4 ações Iemanjá' },
  '20': { meta: 30,  label: '30 ações educativas/culturais' },
  '11': { meta: 3,   label: '3 edições Noturno' },
  '11B':{ meta: 1,   label: '1 edição Noturno Pampulha' },
};

const SEIS_MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Casa Kubitschek', 'Casa do Baile', 'MAP'];
const MUSEU_SHORT = { 'MHAB': 'MHAB', 'MIS': 'MIS', 'MUMO': 'MUMO', 'Casa Kubitschek': 'C.Kubi', 'Casa do Baile': 'C.Baile', 'MAP': 'MAP' };

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

function getMetaNumeroFromActivity(a) {
  const cod = (a.meta_codigo || a.meta_id || '').toLowerCase();
  const titulo = (a.titulo || a.nome || '').toLowerCase();
  if (cod.includes('16') || titulo.includes('diária') || titulo.includes('diaria')) return '16';
  if (cod.includes('19') || titulo.includes('iemanjá') || titulo.includes('iemanja')) return '19';
  if (cod.includes('10') || titulo.includes('mostra')) return '10';
  if (cod.includes('11b') || cod.includes('pampulha')) return '11B';
  if (cod.includes('11')) return '11';
  if (cod.includes('20')) return '20';
  if (cod.includes('6') || (a.classificacao || '').toLowerCase() === 'cultural') return '6';
  if (cod.includes('5') || (a.classificacao || '').toLowerCase() === 'meta') return '5';
  return null;
}

function barColor(pct) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 60) return 'bg-blue-500';
  if (pct >= 30) return 'bg-yellow-400';
  return 'bg-red-400';
}

function FisicoMiniPanel({ metaNumero, atividadesPorMuseu }) {
  const quantDef = METAS_FISICAS_QUANTITATIVAS[metaNumero];
  if (!quantDef) return null;

  const totalRealizado = Object.values(atividadesPorMuseu).reduce((s, v) => s + v, 0);
  const pctGeral = Math.min(100, Math.round((totalRealizado / quantDef.meta) * 100));

  const museusComDados = SEIS_MUSEUS.filter(m => (atividadesPorMuseu[m] || 0) > 0);

  return (
    <div className="mt-2 pt-2 border-t border-neutral-100 space-y-2">
      {/* Barra geral */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-neutral-500">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {totalRealizado} realizada{totalRealizado !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-neutral-700">{pctGeral}% <span className="font-normal">de {quantDef.meta}</span></span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
          <div className={`h-1.5 rounded-full transition-all ${barColor(pctGeral)}`} style={{ width: `${pctGeral}%` }} />
        </div>
      </div>
      {/* Mini grid por museu */}
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
      {museusComDados.length === 0 && (
        <p className="text-[11px] text-neutral-400 italic">Sem atividades registradas por museu</p>
      )}
    </div>
  );
}

function fmtBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(Number(value || 0));
}

function getRubricaNome(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome';
}

function isRubricaLinkedToMeta(rubrica, meta) {
  const metaRubrica = normalizeText(rubrica?.meta || rubrica?.meta_numero || rubrica?.meta_titulo);
  const numero = normalizeText(meta.numero);
  const numeroFormatado = normalizeText(meta.numeroFormatado);
  const titulo = normalizeText(meta.titulo);
  
  return metaRubrica === numero || 
         metaRubrica.includes(numero) || 
         metaRubrica.includes(numeroFormatado) ||
         metaRubrica.includes(titulo);
}

function MetaCard({ meta, onOpen, atividadesPorMuseu }) {
  const isConcluida = meta.status === 'CONCLUÍDA';
  const StatusIcon = isConcluida ? CheckCircle2 : AlertCircle;
  const metaNumero = (meta.numero || '').replace('META ', '');

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

        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${isConcluida ? 'border-black bg-black text-white' : 'border-neutral-300 bg-neutral-100 text-neutral-800'}`}>
          {meta.status}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-black">{meta.titulo}</p>
        <p className="mt-1 text-sm leading-snug text-neutral-600">{meta.detalhe}</p>
      </div>

      <div className="mt-auto">
        <div className="mb-1 flex items-end justify-between gap-3 text-sm text-neutral-700">
          <span className="leading-snug">{meta.indicador}</span>
          <span className="shrink-0 font-bold text-black">{meta.percentual}%</span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
          <div className="h-1.5 rounded-full bg-black transition-all" style={{ width: `${Math.min(meta.percentual, 100)}%` }} />
        </div>
      </div>

      {/* Painel físico por museu */}
      <FisicoMiniPanel metaNumero={metaNumero} atividadesPorMuseu={atividadesPorMuseu || {}} />
    </button>
  );
}

function MetaRubricasModal({ meta, rubricas, onClose, onUpdated }) {
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState(null);

  if (!meta) return null;

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

  async function toggleRubrica(rubrica) {
    const id = rubrica?.id;
    if (!id) return;

    const linked = isRubricaLinkedToMeta(rubrica, meta);
    setSavingId(id);

    try {
      await base44.entities.Rubrica.update(id, linked ? { meta: '', meta_titulo: '' } : { meta: meta.numeroFormatado || meta.numero, meta_titulo: meta.titulo });
      toast.success(linked ? 'Rubrica retirada da meta' : 'Rubrica vinculada à meta');
      if (onUpdated) await onUpdated();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível atualizar a rubrica');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="text-lg font-bold">{meta.numero} · {meta.titulo}</h3>
            <p className="text-sm text-neutral-500">Vincular e revisar memória de cálculo das rubricas</p>
          </div>

          <button onClick={onClose} className="rounded-lg border p-2 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
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

        <div className="max-h-[60vh] overflow-auto p-4 space-y-2">
          {filteredRubricas.map((rubrica) => {
            const linked = isRubricaLinkedToMeta(rubrica, meta);
            const previsto = getRubricaBudget(rubrica);
            const utilizado = getRubricaUsed(rubrica);

            return (
              <div key={rubrica.id} className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="font-medium">{getRubricaNome(rubrica)}</p>
                  <p className="text-xs text-neutral-500">
                    Previsto: {fmtBRL(previsto)} · Utilizado: {fmtBRL(utilizado)}
                  </p>
                </div>

                <button
                  disabled={savingId === rubrica.id}
                  onClick={() => toggleRubrica(rubrica)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${linked ? 'bg-black text-white' : 'border'}`}
                >
                  {linked ? 'Vinculada' : 'Vincular'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function MetasAditivoSection({ rubricas: rubricasProp = [], onRefresh }) {
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [rubricas, setRubricas] = useState(rubricasProp || []);

  // Busca relatórios com atividades para calcular cumprimento físico
  const { data: relatorios = [] } = useQuery({
    queryKey: ['reports-metas-fisicas-aditivosection'],
    queryFn: () => base44.entities.Report.filter(
      { status: { $in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] } },
      '-ano', 500
    ),
    staleTime: 120000,
  });

  // Também busca da entidade Activity diretamente
  const { data: activities = [] } = useQuery({
    queryKey: ['activities-metas-fisicas-aditivosection'],
    queryFn: () => base44.entities.Activity.filter(
      { classificacao: 'META' }, '-created_date', 1000
    ),
    staleTime: 120000,
  });

  async function loadRubricas() {
    try {
      const data = await base44.entities.Rubrica.list('rubrica', 1000);
      setRubricas(Array.isArray(data) ? data.filter((item) => item?.ativo !== false) : []);
    } catch (error) {
      console.error(error);
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
    if (onRefresh) onRefresh();
  }

  // Consolida atividades de relatórios + entidade Activity
  const todasAtividades = useMemo(() => {
    const arr = [];
    for (const r of relatorios) {
      for (const a of (r.atividades || [])) {
        arr.push({ ...a, _museu: a.museu || r.museu || '' });
      }
    }
    for (const a of activities) {
      arr.push({ ...a, _museu: a.museu || '' });
    }
    return arr;
  }, [relatorios, activities]);

  // Contagem por meta e por museu
  const atividadesPorMetaEMuseu = useMemo(() => {
    // { '5': { MHAB: 3, MIS: 2, ... }, '6': { ... }, ... }
    const result = {};
    for (const a of todasAtividades) {
      const metaNum = getMetaNumeroFromActivity(a);
      if (!metaNum) continue;
      if (!result[metaNum]) result[metaNum] = {};
      const museu = getMuseuFromActivity(a);
      if (!museu) continue;
      result[metaNum][museu] = (result[metaNum][museu] || 0) + 1;
    }
    return result;
  }, [todasAtividades]);

  const metasCalculadas = useMemo(() => {
    const metrics = calculateMetaFinancialMetrics(rubricas);
    return metrics.map(meta => ({
      numero: meta.numeroFormatado,
      titulo: meta.titulo,
      status: meta.status,
      detalhe: meta.indicador,
      percentual: meta.percentualFinanceiro,
      percentualFisico: meta.percentualFisico,
      previsto: meta.previsto,
      utilizado: meta.utilizado,
      saldo: meta.saldo,
      rubricasCount: meta.rubricasCount,
      indicador: meta.indicador,
      _numero: meta.numero,
    }));
  }, [rubricas]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Metas do 3º e 4º Aditivo</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metasCalculadas.map((meta) => (
          <MetaCard
            key={meta.numero}
            meta={meta}
            onOpen={setSelectedMeta}
            atividadesPorMuseu={atividadesPorMetaEMuseu[meta._numero] || {}}
          />
        ))}
      </div>

      <MetaRubricasModal
        meta={selectedMeta}
        rubricas={rubricas}
        onClose={() => setSelectedMeta(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}