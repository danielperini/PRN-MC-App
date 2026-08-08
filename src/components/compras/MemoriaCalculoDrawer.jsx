import React, { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { rubricaPrevisto, rubricaUtilizado } from '@/services/canonicalMetrics';
import { isFinanciallyActiveStatus, getPurchaseValue } from '@/utils/finance/financeiroUtils';
import EditRubricaNfDialog from './EditRubricaNfDialog';
import EditRubricaDialog from './EditRubricaDialog';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v ?? 0);
}

function fmtData(d) {
  const s = String(d || '').slice(0, 10);
  if (!s) return '—';
  const [y, m, day] = s.split('-');
  return y && m && day ? `${day}/${m}/${y}` : s;
}

/**
 * Drawer lateral (Sheet right, 520px) de Memória de Cálculo para um aditivo.
 * Props:
 *  - open / onOpenChange
 *  - aditivo: {
 *      titulo, badge, badgeColor,
 *      previsto, utilizado, saldo, qtdNFs, qtdDuplicatas,
 *      rubricasList: Rubrica[],  // rubricas ativas deste aditivo
 *      nfsAtivas: PurchaseRequest[], // NFs que compõem o Utilizado (já filtradas)
 *    }
 *  - onRefresh: chamado pós-edição de NF para recarregar dados no pai
 *  - onRubricasRefresh: chamado pós-edição de Rubrica
 */
export default function MemoriaCalculoDrawer({
  open,
  onOpenChange,
  aditivo,
  onRefresh,
  onRubricasRefresh,
}) {
  const [editingNf, setEditingNf] = useState(null);
  const [editingRubrica, setEditingRubrica] = useState(null);

  const rubricasList = aditivo?.rubricasList || [];
  const nfsAtivas = aditivo?.nfsAtivas || [];

  // Tabela somatória das NFs ativas — compara com o Utilizado exibido no card
  const somaNFs = useMemo(() => nfsAtivas.reduce((s, c) => s + getPurchaseValue(c), 0), [nfsAtivas]);
  const somaPrevistoRubricas = useMemo(() => rubricasList.reduce((s, r) => s + rubricaPrevisto(r), 0), [rubricasList]);
  const somaUtilizadoRubricas = useMemo(() => rubricasList.reduce((s, r) => s + rubricaUtilizado(r), 0), [rubricasList]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[520px] max-w-[90vw] flex flex-col gap-4 overflow-hidden">
          <SheetHeader>
            <SheetTitle className="text-base flex items-center gap-2 flex-wrap">
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${aditivo?.badgeColor || 'bg-gray-100 text-gray-700'}`}>
                {aditivo?.badge}
              </span>
              <span className="leading-tight">{aditivo?.titulo}</span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              Memória de cálculo do card: origem do Previsto, Utilizado e Saldo.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
            {/* Valor contratual fixo */}
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[11px] text-gray-500 font-medium">Valor contratual fixo (Previsto)</p>
              <p className="text-sm font-bold text-gray-900 tabular-nums">{fmtBRL(aditivo?.previsto || 0)}</p>
            </div>

            {/* Bloco de rubricas */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700">
                Rubricas vinculadas ({rubricasList.length})
              </h3>
              {rubricasList.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic px-1">Nenhuma rubrica ativa neste aditivo.</p>
              ) : (
                <div className="space-y-1">
                  {rubricasList.map((r) => {
                    const prev = rubricaPrevisto(r);
                    const util = rubricaUtilizado(r);
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 border-b border-gray-100 py-1.5 text-[11px]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 font-medium truncate">{r.rubrica || r.nome || '(sem nome)'}</p>
                          <div className="flex gap-3 text-gray-400">
                            <span>P: {fmtBRL(prev)}</span>
                            <span>U: {fmtBRL(util)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingRubrica(r)}
                          title="Editar rubrica"
                          className="text-gray-400 hover:text-blue-600 p-0.5"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {rubricasList.length > 0 && (
                <p className="text-[10px] text-gray-400 pt-1">
                  Σ previsto rubricas: <span className="tabular-nums font-medium">{fmtBRL(somaPrevistoRubricas)}</span>
                  {' · '}
                  Σ utilizado: <span className="tabular-nums font-medium">{fmtBRL(somaUtilizadoRubricas)}</span>
                </p>
              )}
            </div>

            {/* Tabela de NFs ativas */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700">
                NFs que compõem o Utilizado ({nfsAtivas.length})
              </h3>
              {nfsAtivas.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic px-1">Nenhuma NF ativa registrada para este aditivo.</p>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">NF</th>
                        <th className="px-2 py-1.5 text-left font-medium">Fornecedor</th>
                        <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                        <th className="px-2 py-1.5 text-left font-medium">Data</th>
                        <th className="px-2 py-1.5 text-left font-medium">Rubrica</th>
                        <th className="px-2 py-1.5 text-left font-medium">Status</th>
                        <th className="px-1 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfsAtivas.map((c, idx) => {
                        const rubNome = c?.rubrica_nome || rubricasList.find((r) => r.id === c.rubrica_id)?.rubrica || '—';
                        return (
                          <tr key={c.id} className={idx % 2 ? 'bg-gray-50/60' : 'bg-white'}>
                            <td className="px-2 py-1 text-gray-700 tabular-nums">{c?.nf_numero || '—'}</td>
                            <td className="px-2 py-1 text-gray-600 max-w-[120px] truncate" title={c?.fornecedor_nome}>{c?.fornecedor_nome || '—'}</td>
                            <td className="px-2 py-1 text-right text-gray-800 font-medium tabular-nums">{fmtBRL(getPurchaseValue(c))}</td>
                            <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{fmtData(c?.nf_data_emissao)}</td>
                            <td className="px-2 py-1 text-gray-600 max-w-[110px] truncate" title={rubNome}>{rubNome}</td>
                            <td className="px-2 py-1">
                              <span className="text-[10px] rounded bg-green-50 text-green-700 px-1.5 py-0.5">
                                {c?.status || '—'}
                              </span>
                            </td>
                            <td className="px-1 py-1">
                              <button
                                type="button"
                                onClick={() => setEditingNf(c)}
                                title="Editar rubrica da NF"
                                className="text-gray-400 hover:text-blue-600 p-0.5"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé totalizador */}
          <div className="rounded-md border-t-2 border-gray-200 bg-gray-50 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <div>
                <p className="text-gray-500">Σ NFs ativas (valor no somatório)</p>
                <p className="text-gray-300 text-[10px]">Utilizado do card: <span className="tabular-nums">{fmtBRL(aditivo?.utilizado || 0)}</span></p>
              </div>
              <p className={`text-sm font-bold tabular-nums ${Math.abs(somaNFs - (aditivo?.utilizado || 0)) > 0.01 ? 'text-amber-600' : 'text-gray-900'}`}>
                {fmtBRL(somaNFs)}
              </p>
            </div>
            {Math.abs(somaNFs - (aditivo?.utilizado || 0)) > 0.01 && (
              <p className="mt-1 text-[10px] text-amber-600">
                Divergência entre Σ NFs e Utilizado do card — alguns lançamentos podem usar valor_utilizado pré-computado na Rubrica.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialogs de edição */}
      <EditRubricaNfDialog
        open={!!editingNf}
        onOpenChange={(o) => !o && setEditingNf(null)}
        compra={editingNf}
        rubricasDoAditivo={rubricasList}
        onSaved={onRefresh}
      />
      <EditRubricaDialog
        open={!!editingRubrica}
        onOpenChange={(o) => !o && setEditingRubrica(null)}
        rubrica={editingRubrica}
        onSaved={onRubricasRefresh}
      />
    </>
  );
}