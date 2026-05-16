import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, Target, X, Search } from 'lucide-react';

const BASE_METAS_ADITIVO = [
  { numero: 'META 01', titulo: 'Equipe principal', percentual: 100, detalhe: 'Cargos previstos e cargos ocupados na equipe', indicador: '100% concluído · contagem de cargos ativa', status: 'CONCLUÍDA' },
  { numero: 'META 07', titulo: 'Contratação de educadores', percentual: 100, detalhe: 'Educadores contratados para MIS, MUMO e MHAB', indicador: '100% concluído', status: 'CONCLUÍDA' },
  { numero: 'META 03', titulo: 'Manutenção das exposições', percentual: 0, detalhe: 'Execução financeira da rubrica de manutenção e disposição, sem educadoras', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 04', titulo: 'Alteração de núcleos e salas expositivas', percentual: 0, detalhe: 'Rubricas de núcleos, salas expositivas, montagem, expografia e ambientação', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 05', titulo: 'Atividades Educativas e Culturais', percentual: 0, detalhe: 'Atividades únicas da Programação/Agenda, filtradas mensalmente desde março/2026', indicador: '0/30 atividades da programação validadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 10', titulo: 'Mostras e exposições', percentual: 0, detalhe: 'MIS pequeno + MHAB + MUMO grande', indicador: 'MUMO = 70% · MIS + MHAB = 30%', status: 'EM EXECUÇÃO' },
  { numero: 'META 11', titulo: 'Noturno nos Museus', percentual: 0, detalhe: 'Execução vinculada ao grupo/rubrica Noturno nos Museus', indicador: 'Percentual do custeio Noturno utilizado', status: 'EM EXECUÇÃO' },
  { numero: 'META 12', titulo: 'Exposição MHAB', percentual: 0, detalhe: 'Rubricas relacionadas à exposição MHAB/MAB', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 12B', titulo: 'Exposição MUMO', percentual: 0, detalhe: 'Rubricas relacionadas à exposição MUMO', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 14', titulo: 'Acessibilidade', percentual: 100, detalhe: 'Entrega de dispositivos acessíveis', indicador: '100% entregue', status: 'CONCLUÍDA' },
  { numero: 'META 15', titulo: 'Diárias de educadores', percentual: 0, detalhe: 'Execução financeira da rubrica Diários Educadores', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 16', titulo: 'Publicações e catálogos', percentual: 0, detalhe: 'Rubricas de catálogo, publicação, revisão, tradução, impressão, fotógrafo, pesquisa e texto', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 17', titulo: 'Custeio das atividades educativas e culturais', percentual: 0, detalhe: 'Materiais, lanches e apoio pedagógico', indicador: 'Percentual das rubricas de custeio utilizadas', status: 'EM EXECUÇÃO' },
].sort((a, b) => {
  const prioridade = { 'META 01': 0, 'META 07': 1 };
  const pa = prioridade[a.numero] ?? 2;
  const pb = prioridade[b.numero] ?? 2;
  if (pa !== pb) return pa - pb;
  return a.titulo.localeCompare(b.titulo, 'pt-BR');
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNumber(value));
}

function getRubricaNome(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome';
}

function getRubricaValor(rubrica) {
  return toNumber(rubrica?.valor_total ?? rubrica?.valor_rubrica ?? rubrica?.valor_previsto ?? rubrica?.previsto);
}

function getRubricaUtilizado(rubrica) {
  return toNumber(rubrica?.valor_utilizado ?? rubrica?.utilizado ?? rubrica?.realizado ?? rubrica?.valor_pago);
}

function isRubricaLinkedToMeta(rubrica, meta) {
  const metaRubrica = normalizeText(rubrica?.meta || rubrica?.meta_numero || rubrica?.meta_titulo);
  const numero = normalizeText(meta.numero);
  const titulo = normalizeText(meta.titulo);
  return metaRubrica === numero || metaRubrica.includes(numero) || metaRubrica.includes(titulo);
}

function MetaCard({ meta, onOpen }) {
  const isConcluida = meta.status === 'CONCLUÍDA';
  const StatusIcon = isConcluida ? CheckCircle2 : AlertCircle;

  return (
    <button
      type="button"
      onClick={() => onOpen(meta)}
      className="text-left rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/10 flex flex-col gap-3"
      title="Clique para ver, adicionar ou retirar rubricas desta meta"
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

        <p className="mt-3 text-[11px] font-medium text-neutral-400">Clique para ver, adicionar ou retirar rubricas.</p>
      </div>
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

  const vinculadas = (rubricas || []).filter((rubrica) => isRubricaLinkedToMeta(rubrica, meta));
  const previsto = vinculadas.reduce((sum, rubrica) => sum + getRubricaValor(rubrica), 0);
  const utilizado = vinculadas.reduce((sum, rubrica) => sum + getRubricaUtilizado(rubrica), 0);

  async function toggleRubrica(rubrica) {
    const id = rubrica?.id;
    if (!id) return;

    const linked = isRubricaLinkedToMeta(rubrica, meta);
    setSavingId(id);

    try {
      await base44.entities.Rubrica.update(id, linked ? { meta: '', meta_titulo: '' } : { meta: meta.numero, meta_titulo: meta.titulo });
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
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{meta.numero}</p>
            <h3 className="text-lg font-semibold text-black">{meta.titulo}</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {vinculadas.length} rubrica{vinculadas.length === 1 ? '' : 's'} vinculada{vinculadas.length === 1 ? '' : 's'} · {fmtBRL(utilizado)} utilizados de {fmtBRL(previsto)} previstos
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-neutral-200 p-2 hover:bg-neutral-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-neutral-100 p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar rubrica..." className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-2">
            {filteredRubricas.map((rubrica) => {
              const checked = isRubricaLinkedToMeta(rubrica, meta);
              const id = rubrica?.id || getRubricaNome(rubrica);

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleRubrica(rubrica)}
                  disabled={savingId === rubrica?.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left text-sm transition ${checked ? 'border-black bg-neutral-50' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}
                >
                  <span className={`mt-1 h-4 w-4 rounded border ${checked ? 'border-black bg-black' : 'border-neutral-300 bg-white'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-black">{getRubricaNome(rubrica)}</p>
                    <p className="text-xs text-neutral-500">{rubrica?.grupo || rubrica?.categoria || rubrica?.centro_custo || 'Sem grupo informado'}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-neutral-600">
                    <p>{fmtBRL(getRubricaUtilizado(rubrica))}</p>
                    <p className="text-neutral-400">de {fmtBRL(getRubricaValor(rubrica))}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end border-t border-neutral-200 p-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Concluir</button>
        </div>
      </div>
    </div>
  );
}

export default function MetasAditivoSection({ rubricas: rubricasProp = [], onRefresh }) {
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [rubricas, setRubricas] = useState(rubricasProp || []);

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

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center gap-2">
        <Target className="h-4 w-4 text-black" />
        <h3 className="text-sm font-semibold text-black">Metas do 3º Aditivo</h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BASE_METAS_ADITIVO.map((meta) => (
          <MetaCard key={meta.numero} meta={meta} onOpen={setSelectedMeta} />
        ))}
      </div>

      <MetaRubricasModal meta={selectedMeta} rubricas={rubricas} onClose={() => setSelectedMeta(null)} onUpdated={handleUpdated} />
    </div>
  );
}
