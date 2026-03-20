import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Calendar,
  User,
  Loader2,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function RubricaDetail({ rubrica, onClose }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState({
    valor: '',
    data_lancamento: new Date().toISOString().split('T')[0],
    descricao: '',
    observacao: '',
    justificativa_ajuste: '',
  });

  const queryClient = useQueryClient();

  const rubricaId = rubrica?.id;
  const nomeRubrica = rubrica?.rubrica || 'Rubrica';
  const grupoRubrica = rubrica?.grupo || 'Sem grupo';
  const numeroParcelas =
    rubrica?.numero_parcelas_unidades ||
    rubrica?.numero_parcelas ||
    rubrica?.parcelas ||
    '—';

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos-rubrica', rubricaId],
    queryFn: () =>
      base44.entities.LancamentoRubrica.filter(
        { rubrica_id: rubricaId },
        '-created_date',
        100
      ),
    enabled: !!rubricaId,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases-by-rubrica-detail', rubricaId],
    queryFn: async () => {
      const all = await base44.entities.PurchaseRequest.list('-created_date', 300);
      return all.filter((p) => p.rubrica_id === rubricaId);
    },
    enabled: !!rubricaId,
  });

  const invalidateRubricaQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['lancamentos-rubrica', rubricaId],
      }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-consolidadas'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase'] }),
      queryClient.invalidateQueries({ queryKey: ['compra'] }),
      queryClient.invalidateQueries({ queryKey: ['museu'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases-by-rubrica-detail', rubricaId] }),
    ]);
  };

  const resumo = useMemo(() => {
    const valorRubrica = toNumber(rubrica?.valor_rubrica);
    const valorUtilizadoBanco = toNumber(rubrica?.valor_utilizado);
    const saldoBanco =
      rubrica?.saldo !== undefined && rubrica?.saldo !== null
        ? toNumber(rubrica?.saldo)
        : valorRubrica - valorUtilizadoBanco;

    return {
      valorRubrica,
      valorUtilizadoBanco,
      saldoBanco,
      percentualUtilizado:
        valorRubrica > 0 ? (valorUtilizadoBanco / valorRubrica) * 100 : 0,
    };
  }, [rubrica]);

  const comprasPagas = useMemo(
    () => purchases.filter((p) => p.status === 'PAGO'),
    [purchases]
  );

  const comprasAprovadas = useMemo(
    () =>
      purchases.filter(
        (p) => p.status === 'APROVADO_COORD' || p.status === 'APROVADO_ADMIN'
      ),
    [purchases]
  );

  const handleAddLancamento = async () => {
    if (!formData.valor) {
      toast.error('Valor é obrigatório');
      return;
    }

    const valor = parseFloat(formData.valor);

    if (!Number.isFinite(valor)) {
      toast.error('Informe um valor válido');
      return;
    }

    if (valor < 0 && !formData.justificativa_ajuste.trim()) {
      toast.error('Justificativa é obrigatória para ajustes negativos');
      return;
    }

    setSaving(true);

    try {
      const user = await base44.auth.me();

      await base44.entities.LancamentoRubrica.create({
        rubrica_id: rubricaId,
        data_lancamento: formData.data_lancamento,
        origem_lancamento: 'manual_usuario',
        descricao: formData.descricao || 'Lançamento manual',
        valor,
        observacao: formData.observacao,
        justificativa_ajuste: formData.justificativa_ajuste,
        criado_por: user?.email,
      });

      try {
        await base44.functions.invoke('recalculateRubrica', {
          rubricaId,
        });
      } catch (_e) {}

      try {
        await base44.functions.invoke('recalculateAllRubricas', {
          trigger: 'manual_rubrica_update',
          rubricaId,
        });
      } catch (_e) {}

      await invalidateRubricaQueries();

      toast.success('Lançamento adicionado com sucesso');

      setFormData({
        valor: '',
        data_lancamento: new Date().toISOString().split('T')[0],
        descricao: '',
        observacao: '',
        justificativa_ajuste: '',
      });

      setShowForm(false);
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLancamento = async (lancamentoId) => {
    const ok = window.confirm('Tem certeza que deseja remover este lançamento?');
    if (!ok) return;

    setDeletingId(lancamentoId);

    try {
      await base44.entities.LancamentoRubrica.delete(lancamentoId);

      try {
        await base44.functions.invoke('recalculateRubrica', {
          rubricaId,
        });
      } catch (_e) {}

      try {
        await base44.functions.invoke('recalculateAllRubricas', {
          trigger: 'manual_rubrica_delete',
          rubricaId,
        });
      } catch (_e) {}

      await invalidateRubricaQueries();

      toast.success('Lançamento removido com sucesso');
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusIcon = (percentual) => {
    const p = toNumber(percentual);
    if (p >= 100) return <AlertCircle className="w-5 h-5 text-red-600" />;
    if (p >= 80) return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    return null;
  };

  const getStatusClass = (percentual) => {
    const p = toNumber(percentual);
    if (p >= 100) return 'bg-red-50 border-red-200';
    if (p >= 80) return 'bg-yellow-50 border-yellow-200';
    return 'bg-white border-gray-200';
  };

  return (
    <div className="space-y-6">
      <div className={`border rounded-lg p-6 ${getStatusClass(resumo.percentualUtilizado)}`}>
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-black">{nomeRubrica}</h2>
              {getStatusIcon(resumo.percentualUtilizado)}
            </div>
            <p className="text-sm text-gray-600">{grupoRubrica}</p>
          </div>

          <div className="text-right">
            <p className="text-3xl font-bold text-black">
              {resumo.percentualUtilizado.toFixed(2)}%
            </p>
            <p className="text-xs text-gray-600">Utilizado</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div>
            <span className="text-xs text-gray-600 font-semibold">Nº Parcelas</span>
            <p className="text-sm font-semibold text-black mt-1">{numeroParcelas}</p>
          </div>

          <div>
            <span className="text-xs text-gray-600 font-semibold">Valor Rubrica</span>
            <p className="text-sm font-semibold text-black mt-1">
              R$ {formatMoney(resumo.valorRubrica)}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-600 font-semibold">Valor Utilizado</span>
            <p className="text-sm font-semibold text-blue-700 mt-1">
              R$ {formatMoney(resumo.valorUtilizadoBanco)}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-600 font-semibold">Saldo</span>
            <p
              className={`text-sm font-semibold mt-1 ${
                resumo.saldoBanco < 0 ? 'text-red-700' : 'text-green-700'
              }`}
            >
              R$ {formatMoney(resumo.saldoBanco)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div>
            <span className="text-xs text-gray-600 font-semibold">Compras Pagas</span>
            <p className="text-sm font-semibold text-black mt-1">{comprasPagas.length}</p>
          </div>
          <div>
            <span className="text-xs text-gray-600 font-semibold">Compras Aprovadas</span>
            <p className="text-sm font-semibold text-black mt-1">{comprasAprovadas.length}</p>
          </div>
          <div>
            <span className="text-xs text-gray-600 font-semibold">Lançamentos</span>
            <p className="text-sm font-semibold text-black mt-1">{lancamentos.length}</p>
          </div>
          <div>
            <span className="text-xs text-gray-600 font-semibold">Rubrica ID</span>
            <p className="text-sm font-semibold text-black mt-1 break-all">{rubricaId}</p>
          </div>
        </div>

        {rubrica?.observacao_uso && (
          <div className="mt-4 p-3 bg-white/50 rounded text-sm text-gray-700 italic">
            📝 {rubrica.observacao_uso}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-black hover:bg-gray-800 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Fechar' : 'Adicionar Lançamento'}
        </Button>

        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-6 space-y-4 bg-gray-50">
          <h3 className="font-semibold text-black">Novo Lançamento Manual</h3>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">Data *</label>
            <Input
              type="date"
              value={formData.data_lancamento}
              onChange={(e) =>
                setFormData((f) => ({ ...f, data_lancamento: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">
              Valor (R$) *
            </label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.valor}
              onChange={(e) =>
                setFormData((f) => ({ ...f, valor: e.target.value }))
              }
            />
            {formData.valor && parseFloat(formData.valor) < 0 && (
              <p className="text-xs text-orange-600 mt-1">
                Valor negativo: justificativa obrigatória
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">
              Descrição
            </label>
            <Input
              placeholder="Ex: Pagamento de consultor"
              value={formData.descricao}
              onChange={(e) =>
                setFormData((f) => ({ ...f, descricao: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">
              Observação
            </label>
            <Textarea
              placeholder="Anotações..."
              rows={2}
              value={formData.observacao}
              onChange={(e) =>
                setFormData((f) => ({ ...f, observacao: e.target.value }))
              }
            />
          </div>

          {formData.valor && parseFloat(formData.valor) < 0 && (
            <div>
              <label className="text-sm font-semibold text-black block mb-2">
                Justificativa (obrigatória) *
              </label>
              <Textarea
                placeholder="Motivo do ajuste negativo..."
                rows={2}
                value={formData.justificativa_ajuste}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    justificativa_ajuste: e.target.value,
                  }))
                }
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </Button>

            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={handleAddLancamento}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Adicionar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-black">Compras Vinculadas</h3>

        {purchases.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400">
            Nenhuma compra com rubrica_id vinculada
          </div>
        ) : (
          <div className="space-y-3">
            {purchases.map((p) => (
              <div
                key={p.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {p.status || 'Sem status'}
                      </span>

                      {p.budgetline_id && (
                        <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          BudgetLine vinculada
                        </span>
                      )}
                    </div>

                    <p className="font-semibold text-black">
                      {p.descricao_item || 'Sem descrição'}
                    </p>

                    <div className="flex gap-4 mt-2 text-xs text-gray-600 flex-wrap">
                      {p.fornecedor_nome && (
                        <span>{p.fornecedor_nome}</span>
                      )}
                      {p.data_pagamento && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(p.data_pagamento).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {p.created_by && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {p.created_by}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-blue-600">
                      R$ {formatMoney(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-black mb-4">
          Histórico de Lançamentos
        </h3>

        {lancamentos.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400">
            Nenhum lançamento
          </div>
        ) : (
          <div className="space-y-3">
            {lancamentos.map((l) => {
              const valorLancamento = toNumber(l.valor);

              return (
                <div
                  key={l.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {l.origem_lancamento === 'automatico_compras'
                            ? 'Auto'
                            : 'Manual'}
                        </span>

                        {valorLancamento < 0 && (
                          <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-1 rounded">
                            Ajuste
                          </span>
                        )}

                        {l.referencia_compra_id && (
                          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            Compra vinculada
                          </span>
                        )}
                      </div>

                      <p className="font-semibold text-black">
                        {l.descricao || 'Sem descrição'}
                      </p>

                      <div className="flex gap-4 mt-2 text-xs text-gray-600 flex-wrap">
                        {l.data_lancamento && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(l.data_lancamento).toLocaleDateString('pt-BR')}
                          </span>
                        )}

                        {l.criado_por && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {l.criado_por}
                          </span>
                        )}
                      </div>

                      {l.observacao && (
                        <p className="text-xs text-gray-600 italic mt-2">
                          💬 {l.observacao}
                        </p>
                      )}

                      {l.justificativa_ajuste && (
                        <p className="text-xs text-orange-700 mt-2">
                          Justificativa: {l.justificativa_ajuste}
                        </p>
                      )}
                    </div>

                    <div className="text-right flex items-start gap-2">
                      <div>
                        <p
                          className={`text-lg font-bold ${
                            valorLancamento < 0 ? 'text-red-600' : 'text-blue-600'
                          }`}
                        >
                          {valorLancamento < 0 ? '-' : '+'}R${' '}
                          {Math.abs(valorLancamento).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>

                      {l.origem_lancamento === 'manual_usuario' && (
                        <button
                          onClick={() => handleDeleteLancamento(l.id)}
                          className="p-1 hover:bg-red-100 text-red-600 rounded"
                          disabled={deletingId === l.id}
                        >
                          {deletingId === l.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}