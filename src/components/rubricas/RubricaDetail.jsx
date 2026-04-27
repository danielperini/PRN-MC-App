import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import LancarValorDialog from './LancarValorDialog';
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
  FileText,
  Receipt,
  BookOpen,
  CreditCard,
  ExternalLink,
  ChevronDown,
  ChevronUp,
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

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export default function RubricaDetail({ rubrica, onClose }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showLancarValor, setShowLancarValor] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [formData, setFormData] = useState({
    valor: '',
    data_lancamento: todayIso(),
    descricao: '',
    observacao: '',
    justificativa_ajuste: 'Ajuste manual excepcional do mês com base no controle real.',
  });

  const queryClient = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

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

  // NFs vinculadas via Attachment (nf_numero preenchido + compras com nota_fiscal_url)
  const { data: notasFiscais = [] } = useQuery({
    queryKey: ['nfs-by-rubrica', rubricaId],
    queryFn: async () => {
      const all = await base44.entities.Attachment.list('-created_date', 500);
      return all.filter(a => a.nf_numero && a.nf_numero !== '');
    },
    enabled: !!rubricaId,
  });

  // Relatórios vinculados via report_id das compras
  const { data: relatoriosVinculados = [] } = useQuery({
    queryKey: ['reports-by-rubrica', rubricaId],
    queryFn: async () => {
      const reportIds = [...new Set(purchases.filter(p => p.report_id).map(p => p.report_id))];
      if (reportIds.length === 0) return [];
      const all = await base44.entities.Report.list('-created_date', 200);
      return all.filter(r => reportIds.includes(r.id));
    },
    enabled: !!rubricaId && purchases.length > 0,
  });

  // Pagamentos realizados (compras pagas com comprovante)
  const pagamentosRealizados = useMemo(
    () => purchases.filter(p => p.status === 'PAGO' || (p.data_pagamento && p.valor_pago)),
    [purchases]
  );

  const [showNFs, setShowNFs] = useState(true);
  const [showRelatorios, setShowRelatorios] = useState(true);
  const [showPagamentos, setShowPagamentos] = useState(true);

  const invalidateRubricaQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['lancamentos-rubrica', rubricaId],
      }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-consolidadas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-total-utilizado'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase'] }),
      queryClient.invalidateQueries({ queryKey: ['compra'] }),
      queryClient.invalidateQueries({ queryKey: ['museu'] }),
      queryClient.invalidateQueries({
        queryKey: ['purchases-by-rubrica-detail', rubricaId],
      }),
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

  async function applyManualOverride(valor, descricao, observacao, justificativa) {
    const saldoNovo = toNumber(rubrica?.valor_rubrica) - valor;

    await base44.entities.Rubrica.update(rubricaId, {
      valor_utilizado: valor,
      saldo: saldoNovo,
      observacao_uso: observacao || rubrica?.observacao_uso || null,
      observacao_ajuste_manual_mes: justificativa || null,
      data_ajuste_manual_mes: new Date().toISOString(),
    });
  }

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
        descricao: formData.descricao || 'Lançamento manual excepcional',
        valor,
        observacao: formData.observacao,
        justificativa_ajuste:
          formData.justificativa_ajuste ||
          'Ajuste manual excepcional do mês com base no controle real.',
        criado_por: user?.email,
      });

      await applyManualOverride(
        valor,
        formData.descricao,
        formData.observacao,
        formData.justificativa_ajuste
      );

      try {
        await base44.functions.invoke('recalculateRubrica', {
          rubricaId,
          preserveManualOverride: true,
        });
      } catch (_e) {}

      await invalidateRubricaQueries();

      toast.success('Lançamento manual do mês salvo com sucesso');

      setFormData({
        valor: '',
        data_lancamento: todayIso(),
        descricao: '',
        observacao: '',
        justificativa_ajuste: 'Ajuste manual excepcional do mês com base no controle real.',
      });

      setShowForm(false);
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLancamento = async (lancamentoId) => {
    const ok = window.confirm(
      'Tem certeza que deseja remover este lançamento manual excepcional?'
    );
    if (!ok) return;

    setDeletingId(lancamentoId);

    try {
      await base44.entities.LancamentoRubrica.delete(lancamentoId);

      const lancamentosAtualizados = lancamentos.filter((l) => l.id !== lancamentoId);
      const somaRestante = lancamentosAtualizados.reduce(
        (acc, item) => acc + toNumber(item.valor),
        0
      );
      const saldoNovo = toNumber(rubrica?.valor_rubrica) - somaRestante;

      await base44.entities.Rubrica.update(rubricaId, {
        valor_utilizado: somaRestante,
        saldo: saldoNovo,
      });

      try {
        await base44.functions.invoke('recalculateRubrica', {
          rubricaId,
          preserveManualOverride: true,
        });
      } catch (_e) {}

      await invalidateRubricaQueries();

      toast.success('Lançamento removido com sucesso');
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
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

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Este lançamento é apenas para ajuste manual excepcional deste mês. Depois, o fluxo normal volta a valer.
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-black hover:bg-gray-800 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Fechar' : 'Adicionar Lançamento'}
        </Button>

        {currentUser?.role === 'COORDENADOR' && (
          <Button
            onClick={() => setShowLancarValor(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            Lançar Valor
          </Button>
        )}

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
              Valor utilizado do mês (R$) *
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
            <p className="text-xs text-gray-500 mt-1">
              Informe o valor real utilizado nesta rubrica para este mês.
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">
              Descrição
            </label>
            <Input
              placeholder="Ex.: Ajuste manual excepcional de março"
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
              placeholder="Ex.: Valor lançado conforme controle real do mês."
              rows={2}
              value={formData.observacao}
              onChange={(e) =>
                setFormData((f) => ({ ...f, observacao: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">
              Justificativa *
            </label>
            <Textarea
              placeholder="Motivo do ajuste manual excepcional..."
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
              Salvar lançamento
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
                      {p.fornecedor_nome && <span>{p.fornecedor_nome}</span>}
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
                      R$ {formatMoney(
                        p.valor_pago ||
                          p.valor_aprovado_admin ||
                          p.valor_aprovado ||
                          p.valor_solicitado
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── NOTAS FISCAIS ── */}
      <div className="space-y-3">
        <button
          onClick={() => setShowNFs(v => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-lg font-semibold text-black flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            Notas Fiscais Vinculadas
            <span className="text-sm font-normal text-gray-500 ml-1">
              ({purchases.filter(p => p.nota_fiscal_url).length + notasFiscais.length})
            </span>
          </h3>
          {showNFs ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showNFs && (
          <>
            {/* NFs via nota_fiscal_url nas compras */}
            {purchases.filter(p => p.nota_fiscal_url).length === 0 && notasFiscais.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-400 text-sm">
                Nenhuma nota fiscal vinculada
              </div>
            ) : (
              <div className="space-y-2">
                {purchases.filter(p => p.nota_fiscal_url).map(p => (
                  <div key={'nf-pr-' + p.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black truncate">
                          {p.numero_nf ? `NF ${p.numero_nf}` : 'Nota Fiscal'} — {p.fornecedor_nome || p.descricao_item || '—'}
                        </p>
                        <div className="flex gap-3 text-xs text-gray-500 flex-wrap mt-0.5">
                          {p.data_emissao && <span>{new Date(p.data_emissao).toLocaleDateString('pt-BR')}</span>}
                          <span className={`font-medium px-1 rounded ${p.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold text-blue-700">R$ {formatMoney(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado)}</span>
                      <a href={p.nota_fiscal_url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-blue-600">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
                {notasFiscais.map(nf => (
                  <div key={'nf-att-' + nf.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black truncate">
                          NF {nf.nf_numero} — {nf.nf_emitente_nome || nf.file_name}
                        </p>
                        <div className="flex gap-3 text-xs text-gray-500 flex-wrap mt-0.5">
                          {nf.nf_data_emissao && <span>{new Date(nf.nf_data_emissao).toLocaleDateString('pt-BR')}</span>}
                          {nf.nf_nome_renomeado && <span className="truncate max-w-xs">{nf.nf_nome_renomeado}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {nf.nf_valor_total > 0 && <span className="text-sm font-bold text-blue-700">R$ {formatMoney(nf.nf_valor_total)}</span>}
                      <a href={nf.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-blue-600">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RELATÓRIOS VINCULADOS ── */}
      <div className="space-y-3">
        <button
          onClick={() => setShowRelatorios(v => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-lg font-semibold text-black flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            Relatórios Vinculados
            <span className="text-sm font-normal text-gray-500 ml-1">({relatoriosVinculados.length})</span>
          </h3>
          {showRelatorios ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showRelatorios && (
          relatoriosVinculados.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-400 text-sm">
              Nenhum relatório vinculado às compras desta rubrica
            </div>
          ) : (
            <div className="space-y-2">
              {relatoriosVinculados.map(r => (
                <div key={r.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <BookOpen className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-black">
                        {r.author_name} — {r.mes_referencia} {r.ano}
                      </p>
                      <div className="flex gap-3 text-xs text-gray-500 flex-wrap mt-0.5">
                        <span>{r.museu}</span>
                        <span className={`font-medium px-1 rounded ${r.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                        {r.numero_protocolo && <span>{r.numero_protocolo}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── PAGAMENTOS REALIZADOS ── */}
      <div className="space-y-3">
        <button
          onClick={() => setShowPagamentos(v => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-lg font-semibold text-black flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-600" />
            Pagamentos Realizados
            <span className="text-sm font-normal text-gray-500 ml-1">({pagamentosRealizados.length})</span>
          </h3>
          {showPagamentos ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showPagamentos && (
          pagamentosRealizados.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-400 text-sm">
              Nenhum pagamento realizado ainda
            </div>
          ) : (
            <div className="space-y-2">
              {pagamentosRealizados.map(p => (
                <div key={'pag-' + p.id} className="border border-green-200 bg-green-50 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <CreditCard className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-black truncate">
                        {p.fornecedor_nome || p.descricao_item || '—'}
                      </p>
                      <div className="flex gap-3 text-xs text-gray-600 flex-wrap mt-0.5">
                        {p.data_pagamento && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(p.data_pagamento).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                        {p.meio_pagamento && <span>{p.meio_pagamento}</span>}
                        {p.aprov_admin_nome && <span>Aprovado por: {p.aprov_admin_nome}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-base font-bold text-green-700">R$ {formatMoney(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado)}</span>
                    {p.comprovante_url && (
                      <a href={p.comprovante_url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-green-600">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <span className="text-sm font-bold text-green-800 bg-green-100 px-3 py-1 rounded-lg">
                  Total pago: R$ {formatMoney(pagamentosRealizados.reduce((s, p) => s + (p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado || 0), 0))}
                </span>
              </div>
            </div>
          )
        )}
      </div>

      <LancarValorDialog
        rubrica={rubrica}
        isOpen={showLancarValor}
        onClose={() => setShowLancarValor(false)}
        onSuccess={async () => {
          await invalidateRubricaQueries();
        }}
      />

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