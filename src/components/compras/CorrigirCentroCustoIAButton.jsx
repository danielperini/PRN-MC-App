import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Wand2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Dispara `auditarAlinharNFCompras` em lotes paginados com reanálise de
 * centro_custo ativada (determinística + IA). Corrige automaticamente
 * divergências com confiança >= 95%.
 */
export default function CorrigirCentroCustoIAButton({ onDone }) {
  const [running, setRunning] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [detalhes, setDetalhes] = useState(null);
  const [showDetalhes, setShowDetalhes] = useState(false);

  async function rodarLote(dryRun) {
    if (!window.confirm(
      dryRun
        ? 'Simular auditoria de centro de custo (sem alterar o banco)?\nÚtil para ver quantas divergências existem.'
        : 'Corrigir automaticamente o centro de custo de TODAS as NFs com divergência?\n\n' +
          'Regras:\n' +
          '• Coordenação Geral / Perini Projetos → Geral (regra fixa, 100%)\n' +
          '• Rubrica menciona Pampulha → Noturno Pampulha\n' +
          '• Outros casos: IA lê a nota + metadados, corrige só com confiança ≥ 95%\n' +
          '• Abaixo de 95% fica marcado para revisão manual (não altera)'
    )) return;

    setRunning(true);
    setProgresso({ processados: 0, total: 0, corrigidos: 0, ok: 0, revisao: 0, lote: 0 });
    setDetalhes(null);

    let skip = 0;
    let totalCorrigidos = 0;
    let totalOk = 0;
    let totalRevisao = 0;
    let totalProcessados = 0;
    let totalDisponivel = 0;
    let todosDetalhes = [];
    let lote = 0;

    try {
      while (true) {
        lote++;
        const res = await base44.functions.invoke('auditarAlinharNFCompras', {
          limite: 50,
          skip,
          dryRun,
          reanalisar_centro_custo: true,
        });
        const data = res?.data || res;
        if (!data?.ok) throw new Error(data?.error || 'Falha na auditoria');

        const s = data.stats || {};
        totalDisponivel = data.total_disponivel || s.total_disponivel || totalDisponivel;
        totalProcessados += s.processados || 0;
        totalCorrigidos += s.correcoes_centro_custo || 0;
        totalOk += s.centro_custo_ok || 0;
        totalRevisao += (s.divergentes_nao_corrigidos || 0);

        // coleta apenas divergências de centro_custo para o relatório
        (data.detalhes || []).forEach((d) => {
          if (d.divergencia_centro_custo || d.acao_cc === 'corrigido_centro_custo') {
            todosDetalhes.push({
              pr_id: d.pr_id,
              fornecedor: d.fornecedor_db,
              atual: d.centro_custo_atual,
              correto: d.centro_custo_correto,
              confianca: d.centro_custo_confianca,
              origem: d.centro_custo_origem,
              acao: d.acao_cc,
              justificativa: d.centro_custo_justificativa,
            });
          }
        });

        setProgresso({
          processados: totalProcessados,
          total: totalDisponivel,
          corrigidos: totalCorrigidos,
          ok: totalOk,
          revisao: totalRevisao,
          lote,
        });

        if (!data.has_more) break;
        skip = data.proximo_skip;
        if (lote > 40) break; // hard cap ~2000 registros
      }

      setDetalhes(todosDetalhes);
      toast.success(
        dryRun
          ? `Simulação: ${totalCorrigidos} divergências encontradas, ${totalRevisao} para revisão manual.`
          : `Centro de custo corrigido em ${totalCorrigidos} NF(s). ${totalOk} já estavam ok. ${totalRevisao} marcadas para revisão.`
      );
      if (onDone) await onDone();
    } catch (e) {
      toast.error('Erro na auditoria: ' + (e?.message || 'desconhecido'));
    } finally {
      setRunning(false);
    }
  }

  const p = progresso;

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Wand2 className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Corrigir Centro de Custo com IA</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Reanalisa o centro de custo de todas as NFs. Regra fixa para Coordenação Geral/Perini → Geral.
              IA lê a nota para casos ambíguos. Corrige só com confiança ≥ 95%.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => rodarLote(true)}
            className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-100 text-xs"
          >
            {running && p?.lote >= 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Simular
          </Button>
          <Button
            size="sm"
            disabled={running}
            onClick={() => rodarLote(false)}
            className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {running ? 'Corrigindo...' : 'Corrigir Tudo'}
          </Button>
        </div>
      </div>

      {p && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="rounded-lg bg-white border px-2 py-1.5">
            <div className="text-gray-400">Processados</div>
            <div className="font-bold text-gray-900">{p.processados}{p.total ? `/${p.total}` : ''}</div>
          </div>
          <div className="rounded-lg bg-white border px-2 py-1.5">
            <div className="text-gray-400">Lote</div>
            <div className="font-bold text-gray-900">#{p.lote}</div>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 px-2 py-1.5">
            <div className="text-green-600">Corrigidos</div>
            <div className="font-bold text-green-800">{p.corrigidos}</div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-1.5">
            <div className="text-blue-600">Já OK</div>
            <div className="font-bold text-blue-800">{p.ok}</div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5">
            <div className="text-amber-600">Revisão manual</div>
            <div className="font-bold text-amber-800">{p.revisao}</div>
          </div>
        </div>
      )}

      {detalhes && detalhes.length > 0 && (
        <div className="border-t border-violet-100 pt-2">
          <button
            onClick={() => setShowDetalhes((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900"
          >
            {showDetalhes ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {detalhes.length} divergência(s) detectada(s)
          </button>
          {showDetalhes && (
            <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
              {detalhes.slice(0, 200).map((d, i) => (
                <div key={i} className="px-3 py-2 text-xs flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{d.fornecedor || '—'}</div>
                    <div className="text-gray-500">
                      <span className="text-red-600 line-through">{d.atual || '—'}</span>
                      {' → '}
                      <span className="text-green-700 font-semibold">{d.correto || '—'}</span>
                      {' '}
                      <span className="text-gray-400">({d.origem === 'regra_deterministica' ? 'regra' : 'IA'}, {d.confianca}%)</span>
                    </div>
                    {d.justificativa && (
                      <div className="text-gray-400 truncate">{d.justificativa}</div>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    d.acao === 'corrigido_centro_custo' ? 'bg-green-100 text-green-700' :
                    d.acao === 'divergente_simulado_cc' ? 'bg-amber-100 text-amber-700' :
                    d.acao === 'revisao_manual_cc' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {d.acao === 'corrigido_centro_custo' ? 'corrigido' :
                     d.acao === 'divergente_simulado_cc' ? 'simulado' :
                     d.acao === 'revisao_manual_cc' ? 'revisão' : d.acao}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}