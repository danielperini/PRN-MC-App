import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Sparkles, Loader2, X, Check, ShieldCheck, AlertTriangle, FileText, ChevronDown, ChevronRight, Send, Archive } from 'lucide-react';

const CENTRO_ORDEM = ['MHAB', 'MIS', 'MUMO', 'Noturno nos Museus 2026', 'Noturno Pampulha', 'Geral'];

function fmtBRL(v) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function normalizeCentro(value) {
  const raw = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (!raw) return 'Geral';
  if (raw === 'mhab' || raw === 'mab' || raw.includes('abilio')) return 'MHAB';
  if (raw === 'mis' || raw === 'mis bh' || raw.includes('imagem e som')) return 'MIS';
  if (raw === 'mumo' || raw.includes('moda')) return 'MUMO';
  if (raw.includes('pampulha')) return 'Noturno Pampulha';
  if (raw.includes('noturno')) return 'Noturno nos Museus 2026';
  return 'Geral';
}

function ConfiancaBadge({ score }) {
  const cls = score >= 90 ? 'bg-emerald-100 text-emerald-700' : score >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{score}%</span>;
}

export default function DashboardCompletoIA({ open, onClose, compras = [], rubricas = [], metas = [] }) {
  const [alvos, setAlvos] = useState([]);
  const [resultados, setResultados] = useState({});
  const [analisando, setAnalisando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, etapa: '' });
  const [gruposAbertos, setGruposAbertos] = useState({});

  // Filtra itens alvo: status SOLICITADO e (incluir_no_somatorio=false OU duplicada_financeira=true)
  useEffect(() => {
    if (!open) return;
    const lista = (compras || []).filter((p) => {
      if (p?.status !== 'SOLICITADO') return false;
      return p?.incluir_no_somatorio === false || p?.duplicada_financeira === true;
    });
    setAlvos(lista);
    setResultados({});
  }, [open, compras]);

  const agrupado = useMemo(() => {
    const grupos = {};
    alvos.forEach((p) => {
      const centro = normalizeCentro(p?.centro_custo);
      if (!grupos[centro]) grupos[centro] = [];
      grupos[centro].push(p);
    });
    const ord =CENTRO_ORDEM.filter((c) => grupos[c]?.length > 0);
    const rest = Object.keys(grupos).filter((c) => !CENTRO_ORDEM.includes(c));
    return [...ord, ...rest].map((centro) => ({ centro, itens: grupos[centro] || [] }));
  }, [alvos]);

  const contadores = useMemo(() => {
    let analisar = 0, prontos = 0, duplicatas = 0, baixa = 0;
    alvos.forEach((p) => {
      const r = resultados[p.id];
      if (!r) { analisar++; return; }
      if (r.is_duplicata) { duplicatas++; return; }
      if (r.confianca >= 90) prontos++;
      else baixa++;
    });
    return { analisar, prontos, duplicatas, baixa };
  }, [alvos, resultados]);

  const totalElegiveis = useMemo(() => {
    return Object.values(resultados).filter((r) => r?.confianca >= 90 && !r?.is_duplicata).length;
  }, [resultados]);

  const handleAnalisar = useCallback(async () => {
    if (alvos.length === 0) return;
    setAnalisando(true);
    setProgresso({ atual: 0, total: alvos.length, etapa: 'Analisando com IA...' });
    try {
      const ids = alvos.map((p) => p.id);
      const procRes = await base44.functions.invoke('processarComprasEmLoteIA', { purchase_ids: ids });
      const data = procRes?.data || procRes;
      if (!data?.success) throw new Error(data?.error || 'Erro ao processar');
      const map = {};
      (data.results || []).forEach((r) => {
        if (r?.id) map[r.id] = r;
      });
      setResultados(map);
      const total = (data.results || []).length;
      toast.success(`${total} itens analisados pela IA.`);
    } catch (e) {
      toast.error('Erro na análise: ' + (e?.message || e));
    } finally {
      setAnalisando(false);
      setProgresso({ atual: 0, total: 0, etapa: '' });
    }
  }, [alvos]);

  const isElegivelPagamento = (r, purchase) => {
    if (!r || r.confianca < 90 || r.is_duplicata) return false;
    const data = purchase?.nf_data_emissao;
    if (!data) return false;
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return false;
    if (d.getUTCFullYear() !== 2026) return false;
    const mes = d.getUTCMonth() + 1;
    return mes >= 3 && mes <= 6;
  };

  const handleAplicar = useCallback(async () => {
    const elegiveis = alvos.filter((p) => {
      const r = resultados[p.id];
      return r && r.confianca >= 90 && !r.is_duplicata && r.rubrica_id;
    });
    if (elegiveis.length === 0) {
      toast.warning('Nenhum item elegível (confiança ≥ 90% e não-duplicata).');
      return;
    }
    if (!window.confirm(`Aplicar IA automaticamente em ${elegiveis.length} itens? Os elegíveis com data NF de março a junho 2026 serão aprovados e marcados como PAGO.`)) return;

    setAplicando(true);
    let atualizados = 0, aprovados = 0, duplicatasIgn = 0, baixaIgn = 0;
    setProgresso({ atual: 0, total: elegiveis.length, etapa: 'Aplicando IA...' });
    try {
      for (let i = 0; i < elegiveis.length; i++) {
        const p = elegiveis[i];
        const r = resultados[p.id];
        setProgresso((prev) => ({ ...prev, atual: i + 1 }));
        const payload = {
          rubrica_id: r.rubrica_id,
          meta_id: r.meta_sugerida || '',
          ai_meta_score: r.confianca,
          ai_analise: `Lote IA: ${r.justificativa || ''} (confiança ${r.confianca}%)`,
        };
        if (isElegivelPagamento(r, p)) {
          payload.status = 'APROVADO_ADMIN';
          payload.pago = true;
          payload.status_pagamento = 'pago';
          payload.data_pagamento_efetivo = p.nf_data_emissao;
          payload.aprov_admin_nome = 'IA Automática';
          payload.aprov_admin_data = new Date().toISOString().slice(0, 10);
        }
        try {
          await base44.entities.PurchaseRequest.update(p.id, payload);
          atualizados++;
          if (payload.status === 'APROVADO_ADMIN') aprovados++;
        } catch (e) {
          console.error('Erro atualizar', p.id, e);
        }
      }
      // duplicatas marcadas como suspeita + incluir_no_somatorio=false (não altera status)
      const dups = alvos.filter((p) => resultados[p.id]?.is_duplicata);
      for (const p of dups) {
        try {
          await base44.entities.PurchaseRequest.update(p.id, {
            duplicidade_status: 'suspeita',
            incluir_no_somatorio: false,
            duplicidade_motivo: resultados[p.id]?.motivo_duplicata || 'Detectada por IA em lote',
          });
          duplicatasIgn++;
        } catch (e) { console.error('Erro marcar duplicata', p.id, e); }
      }
      baixaIgn = alvos.length - atualizados - duplicatasIgn;
      toast.success(`Resumo: ${atualizados} atualizados, ${aprovados} aprovados+pagos, ${duplicatasIgn} duplicatas marcadas, ${baixaIgn} ignora­dos (confiança baixa).`);
      if (onClose) setTimeout(() => onClose(), 1500);
    } catch (e) {
      toast.error('Erro ao aplicar: ' + (e?.message || e));
    } finally {
      setAplicando(false);
      setProgresso({ atual: 0, total: 0, etapa: '' });
    }
  }, [alvos, resultados, onClose]);

  const handleConfirmarIndividual = useCallback(async (purchase) => {
    const r = resultados[purchase.id];
    if (!r || !r.rubrica_id) {
      toast.warning('Selecione uma rubrica antes de confirmar.');
      return;
    }
    try {
      const payload = {
        rubrica_id: r.rubrica_id,
        meta_id: r.meta_sugerida || '',
        ai_meta_score: r.confianca,
        ai_analise: `Manual confirmado: ${r.justificativa || ''}`,
      };
      if (isElegivelPagamento(r, purchase)) {
        payload.status = 'APROVADO_ADMIN';
        payload.pago = true;
        payload.status_pagamento = 'pago';
        payload.data_pagamento_efetivo = purchase.nf_data_emissao;
        payload.aprov_admin_nome = 'Admin';
        payload.aprov_admin_data = new Date().toISOString().slice(0, 10);
      }
      await base44.entities.PurchaseRequest.update(purchase.id, payload);
      toast.success('Item confirmado.');
      setAlvos((prev) => prev.filter((x) => x.id !== purchase.id));
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    }
  }, [resultados]);

  const handleArquivarDuplicata = useCallback(async (purchase) => {
    try {
      await base44.entities.PurchaseRequest.update(purchase.id, {
        duplicidade_status: 'arquivada',
        incluir_no_somatorio: false,
        duplicidade_motivo: resultados[purchase.id]?.motivo_duplicata || 'Arquivada manualmente',
      });
      toast.success('Duplicata arquivada.');
      setAlvos((prev) => prev.filter((x) => x.id !== purchase.id));
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    }
  }, [resultados]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
      <div className="bg-white w-full max-w-full md:max-w-6xl h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-black flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-black" />
              Dashboard Completo — Preenchimento IA
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Itens "Fora do somatório"/SOLICITADO analisados em lote para sugerir rubrica e meta.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contadores e ações */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">A analisar: {contadores.analisar}</span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Prontos: {contadores.prontos}</span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Duplicatas: {contadores.duplicatas}</span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Confiança baixa: {contadores.baixa}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalisar}
              disabled={analisando || alvos.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {analisando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Analisar tudo com IA
            </button>
            <button
              onClick={handleAplicar}
              disabled={aplicando || totalElegiveis === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-black text-white px-4 py-2 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
            >
              {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Aplicar IA automaticamente ({totalElegiveis})
            </button>
          </div>
        </div>

        {/* Progresso */}
        {(analisando || aplicando) && progresso.total > 0 && (
          <div className="px-6 py-3 border-b border-gray-100 bg-amber-50">
            <div className="flex items-center justify-between text-xs text-amber-800 mb-1">
              <span>{progresso.etapa}</span>
              <span>{progresso.atual}/{progresso.total}</span>
            </div>
            <div className="w-full h-2 bg-amber-200 rounded-full overflow-hidden">
              <div
                className="h-2 bg-amber-600 transition-all"
                style={{ width: `${progresso.total > 0 ? (progresso.atual / progresso.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Lista por grupo */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {alvos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Check className="w-12 h-12 mb-3 text-emerald-400" />
              <p className="text-sm font-semibold">Nenhum item para processar</p>
              <p className="text-xs mt-1">Não há solicitações SOLICITADO com "Fora do somatório".</p>
            </div>
          ) : (
            <div className="space-y-4">
              {agrupado.map(({ centro, itens }) => {
                const aberto = gruposAbertos[centro] !== false;
                return (
                  <div key={centro} className="rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setGruposAbertos((p) => ({ ...p, [centro]: !aberto }))}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-2">
                        {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-semibold text-sm text-black">{centro}</span>
                        <span className="text-xs text-gray-500">({itens.length})</span>
                      </div>
                    </button>
                    {aberto && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-white border-b border-gray-100">
                            <tr className="text-left text-xs text-gray-500">
                              <th className="px-3 py-2 font-medium">Fornecedor</th>
                              <th className="px-3 py-2 font-medium">Valor</th>
                              <th className="px-3 py-2 font-medium">Rubrica</th>
                              <th className="px-3 py-2 font-medium">Meta</th>
                              <th className="px-3 py-2 font-medium">Confiança</th>
                              <th className="px-3 py-2 font-medium">Data NF</th>
                              <th className="px-3 py-2 font-medium">Status IA</th>
                              <th className="px-3 py-2 font-medium">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {itens.map((p) => {
                              const r = resultados[p.id];
                              const isDup = r?.is_duplicata;
                              return (
                                <tr key={p.id} className={`border-b border-gray-50 ${isDup ? 'bg-red-50' : ''}`}>
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-gray-800 truncate max-w-[180px]">{p.fornecedor_nome || p.nf_emitente_nome || '—'}</p>
                                    <p className="text-xs text-gray-500 truncate max-w-[180px]">{p.descricao_item}</p>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">{fmtBRL(p.valor_solicitado || p.valor_total || p.nf_valor_total)}</td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={r?.rubrica_id || p.rubrica_id || ''}
                                      onChange={(e) => setResultados((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), rubrica_id: e.target.value } }))}
                                      className="w-44 text-xs border border-gray-200 rounded px-1.5 py-1"
                                    >
                                      <option value="">—</option>
                                      {(rubricas || []).filter((r) => r?.ativo !== false).map((rb) => (
                                        <option key={rb.id} value={rb.id}>{rb.rubrica || rb.nome}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={r?.meta_sugerida || p.meta_id || ''}
                                      onChange={(e) => setResultados((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), meta_sugerida: e.target.value } }))}
                                      className="w-36 text-xs border border-gray-200 rounded px-1.5 py-1"
                                    >
                                      <option value="">—</option>
                                      {(metas || []).filter((m) => m?.ativo !== false).map((m) => (
                                        <option key={m.id} value={m.id}>{m.nome}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">{r ? <ConfiancaBadge score={r.confianca} /> : <span className="text-xs text-gray-400">—</span>}</td>
                                  <td className="px-3 py-2 text-xs">{p.nf_data_emissao ? new Date(p.nf_data_emissao).toLocaleDateString('pt-BR') : '—'}</td>
                                  <td className="px-3 py-2">
                                    {!r ? (<span className="text-xs text-gray-400">A analisar</span>) : isDup ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">DUPLICATA</span>
                                    ) : r.confianca >= 90 ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">Pronto</span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Revisar</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    {r && !isDup && (
                                      <button
                                        onClick={() => handleConfirmarIndividual(p)}
                                        className="inline-flex items-center gap-1 text-xs font-medium text-black hover:underline"
                                        title="Confirmar este item"
                                      >
                                        <Check className="w-3.5 h-3.5" /> Confirmar
                                      </button>
                                    )}
                                    {isDup && (
                                      <button
                                        onClick={() => handleArquivarDuplicata(p)}
                                        className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline"
                                        title="Arquivar duplicata"
                                      >
                                        <Archive className="w-3.5 h-3.5" /> Arquivar
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}