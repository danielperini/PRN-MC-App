import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  Activity,
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Pencil
} from 'lucide-react';
import { toast } from 'sonner';
import PurchaseTimeline from './PurchaseTimeline';
import PurchaseDocumentUpload from './PurchaseDocumentUpload';
import PurchaseDocumentViewer from './PurchaseDocumentViewer';

export default function PurchaseCard({
  purchase,
  budgetLines,
  statusConfig,
  isCoordenador,
  isAdmin,
  onRefresh,
  currentUser,
  onEdit
}) {
  const [expanded, setExpanded] = useState(false);
  const [relatedActivity, setRelatedActivity] = useState(null);
  const [showApproval, setShowApproval] = useState(false);
  const [comentario, setComentario] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [aiSecurityAnalysis, setAiSecurityAnalysis] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const statusInfo = statusConfig[purchase.status] || {
    label: purchase.status,
    color: 'bg-gray-100 text-gray-700'
  };

  const budgetLine = budgetLines.find(line => line.id === purchase.budgetline_id);

  const canApproveCoord =
    (isCoordenador || isAdmin) && purchase.status === 'SOLICITADO';

  const canAct = canApproveCoord;

  const canEdit =
    !!onEdit &&
    purchase.status !== 'PAGO' &&
    purchase.status !== 'CANCELADO';

  const canMarkAsPaid =
    (isCoordenador || isAdmin) &&
    (purchase.status === 'APROVADO_COORD' || purchase.status === 'APROVADO_ADMIN');

  useEffect(() => {
    if (purchase.activity_id) {
      base44.entities.Activity.list('-created_date', 50)
        .then(list => {
          const activity = list.find(item => item.id === purchase.activity_id);
          setRelatedActivity(activity || null);
        })
        .catch(() => {});
    }
  }, [purchase.activity_id]);

  const analyzeSecurityPayment = async () => {
    setLoadingAnalysis(true);

    try {
      const saldoDisponivel = budgetLine
        ? (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)
        : 0;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analise a segurança desta aprovação de compra:

DADOS DA SOLICITAÇÃO:
- Descrição: ${purchase.descricao_item}
- Valor solicitado: R$ ${purchase.valor_solicitado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Fornecedor: ${purchase.fornecedor_nome || 'Não informado'}
- Categoria: ${purchase.categoria}
- Tipo de gasto: ${purchase.tipo_gasto}
- Meta vinculada: ${purchase.meta_id || 'Nenhuma'}

ORÇAMENTO:
- Rubrica: [${budgetLine?.codigo}] ${budgetLine?.descricao}
- Saldo total da rubrica: R$ ${(budgetLine?.saldo_inicial || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Já comprometido: R$ ${(budgetLine?.saldo_comprometido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Saldo disponível: R$ ${saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

Avalie:
1. Conformidade orçamentária
2. Rastreabilidade
3. Riscos
4. Recomendação

Responda em JSON com:
{ "seguro": true/false, "risco_nivel": "baixo|medio|alto", "observacoes": "...", "recomendacao": "aprovar|recusar", "justificativa": "..." }`,
        response_json_schema: {
          type: 'object',
          properties: {
            seguro: { type: 'boolean' },
            risco_nivel: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
            observacoes: { type: 'string' },
            recomendacao: { type: 'string' },
            justificativa: { type: 'string' }
          },
          required: ['seguro', 'risco_nivel', 'recomendacao', 'justificativa']
        }
      });

      setAiSecurityAnalysis(result);
    } catch (e) {
      toast.error('Erro ao analisar segurança: ' + e.message);
    }

    setLoadingAnalysis(false);
  };

  const handleApprovalAction = async (action) => {
    setActionLoading(true);

    try {
      if (action === 'aprovar') {
        const saldoDisponivel = budgetLine
          ? (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)
          : Infinity;

        if (saldoDisponivel < (purchase.valor_solicitado || 0)) {
          toast.error(
            `❌ Saldo insuficiente! Disponível: R$ ${saldoDisponivel.toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}`,
            { duration: 5000 }
          );
          setActionLoading(false);
          return;
        }
      }

      await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action,
        comentario,
      });

      const messages = {
        aprovar: {
          title: '✅ Compra aprovada!',
          desc: 'Solicitação aprovada e saldo comprometido.'
        },
        reject: {
          title: '❌ Solicitação recusada',
          desc: comentario
        },
      };

      const message = messages[action] || {
        title: '✅ Ação realizada!',
        desc: ''
      };

      toast.success(message.title, {
        description: message.desc,
        duration: 5000
      });

      setShowApproval(false);
      setComentario('');
      onRefresh?.();
    } catch (e) {
      toast.error(`❌ Erro: ${e.message}`, { duration: 5000 });
    }

    setActionLoading(false);
  };

  const handleMarkAsPaid = async () => {
    const comprovante_url =
      window.prompt(
        'Cole a URL do comprovante de pagamento (opcional):',
        purchase.comprovante_url || ''
      ) || '';

    const data_pagamento =
      window.prompt(
        'Informe a data do pagamento (YYYY-MM-DD) ou deixe vazio para hoje:',
        purchase.data_pagamento || ''
      ) || '';

    setActionLoading(true);

    try {
      await base44.functions.invoke('purchaseActions', {
        action: 'marcar_pago',
        purchaseId: purchase.id,
        comprovante_url,
        data_pagamento,
      });

      toast.success('✅ Compra marcada como paga!');
      onRefresh?.();
    } catch (e) {
      toast.error('❌ Erro ao marcar como pago: ' + e.message, { duration: 5000 });
    }

    setActionLoading(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Tem certeza que deseja deletar esta solicitação?')) return;

    setActionLoading(true);

    try {
      await base44.entities.PurchaseRequest.delete(purchase.id);
      toast.success('✅ Solicitação deletada com sucesso!', {
        description: purchase.descricao_item,
        duration: 5000
      });
      onRefresh?.();
    } catch (e) {
      toast.error(`❌ Erro ao deletar: ${e.message}`, { duration: 5000 });
    }

    setActionLoading(false);
  };

  const META_LABELS = {
    'MC3A-20': 'Ações Educativas',
    'MC3A-21': 'Exposição / Produção',
    'MC3A-22': 'Comunicação',
    'MC3A-23': 'Noturno 2026',
    'MC3A-24': 'Emenda Parlamentar',
    'MC3A-25': 'Outras Ações',
    'MC3A-EXTRA': 'Extra',
  };

  const scoreColor =
    purchase.ai_meta_score >= 80
      ? 'text-green-700 bg-green-50'
      : purchase.ai_meta_score >= 50
      ? 'text-amber-700 bg-amber-50'
      : 'text-red-700 bg-red-50';

  return (
    <div
      className={`border rounded-xl transition-colors ${
        canAct && !showApproval
          ? 'border-blue-100 hover:border-blue-200'
          : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                {statusInfo.label}
              </span>

              {purchase.meta_id && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {META_LABELS[purchase.meta_id] || purchase.meta_id}
                </span>
              )}

              {purchase.tipo_gasto && (
                <span className="text-xs border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                  {purchase.tipo_gasto}
                </span>
              )}

              {purchase.ai_meta_score !== undefined && purchase.ai_meta_score !== null && (
                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${scoreColor}`}>
                  <Sparkles className="w-3 h-3" />
                  IA: {purchase.ai_meta_score}%
                </span>
              )}
            </div>

            <p className="font-medium text-black text-sm truncate">
              {purchase.descricao_item}
            </p>

            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
              {purchase.fornecedor_nome && (
                <span>Fornecedor: {purchase.fornecedor_nome}</span>
              )}

              {budgetLine && (
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  <span>
                    [{budgetLine.codigo}] {budgetLine.descricao?.substring(0, 35)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="font-bold text-black">
                R$ {(purchase.valor_solicitado || 0).toLocaleString('pt-BR', {
                  minimumFractionDigits: 2
                })}
              </p>
            </div>

            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => onEdit?.(purchase)}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Editar
              </Button>
            )}

            {canAct && (
              <Button
                size="sm"
                variant={showApproval ? 'default' : 'outline'}
                className={showApproval ? 'bg-black text-white text-xs' : 'text-xs'}
                onClick={() => {
                  setShowApproval(!showApproval);
                  if (!showApproval && !aiSecurityAnalysis) {
                    analyzeSecurityPayment();
                  }
                }}
              >
                {showApproval ? 'Fechar' : 'Analisar'}
              </Button>
            )}

            {canMarkAsPaid && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                onClick={handleMarkAsPaid}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                )}
                Marcar pago
              </Button>
            )}

            {isCoordenador && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50 text-xs h-8 w-8 p-0"
                onClick={handleDelete}
                disabled={actionLoading}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <PurchaseTimeline purchase={purchase} />
        </div>

        {showApproval && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-black">
                ✅ Aprovação — Coordenação
              </p>

              {loadingAnalysis && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analisando segurança...
                </span>
              )}
            </div>

            {aiSecurityAnalysis && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  aiSecurityAnalysis.risco_nivel === 'alto'
                    ? 'bg-red-50 border-red-200'
                    : aiSecurityAnalysis.risco_nivel === 'medio'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-green-50 border-green-200'
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <Sparkles
                    className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                      aiSecurityAnalysis.risco_nivel === 'alto'
                        ? 'text-red-600'
                        : aiSecurityAnalysis.risco_nivel === 'medio'
                        ? 'text-amber-600'
                        : 'text-green-600'
                    }`}
                  />

                  <div className="flex-1">
                    <p className="font-semibold mb-1">Análise de Segurança da IA</p>
                    <p className="text-gray-700 mb-2">{aiSecurityAnalysis.justificativa}</p>

                    {aiSecurityAnalysis.observacoes && (
                      <p className="text-gray-600 italic">
                        Observações: {aiSecurityAnalysis.observacoes}
                      </p>
                    )}

                    <p
                      className={`mt-2 font-medium ${
                        aiSecurityAnalysis.recomendacao === 'aprovar'
                          ? 'text-green-700'
                          : 'text-red-700'
                      }`}
                    >
                      💡 Recomendação:{' '}
                      {aiSecurityAnalysis.recomendacao === 'aprovar'
                        ? '✅ Aprovar'
                        : '❌ Recusar'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {budgetLine && (
              <div className="text-xs bg-white border rounded-lg px-3 py-2">
                <span className="text-gray-500">
                  [{budgetLine.codigo}] Saldo disponível:{' '}
                </span>

                <strong
                  className={
                    ((budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)) >=
                    (purchase.valor_solicitado || 0)
                      ? 'text-green-700'
                      : 'text-red-700'
                  }
                >
                  R${' '}
                  {Math.max(
                    0,
                    (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)
                  ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-600 mb-1 block">
                Justificativa / Comentário
              </label>
              <Textarea
                placeholder="Adicione um comentário ou justificativa (obrigatório para recusar)..."
                rows={2}
                value={comentario}
                onChange={e => setComentario(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 text-sm"
                onClick={() => handleApprovalAction('reject')}
                disabled={actionLoading || !comentario.trim()}
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                )}
                Recusar
              </Button>

              <Button
                className="bg-black hover:bg-gray-800 text-white text-sm"
                onClick={() => handleApprovalAction('aprovar')}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                )}
                Aprovar e comprometer
              </Button>
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-4">
          {purchase.ai_analise && (
            <div
              className={`p-3 rounded-lg text-xs ${
                purchase.ai_meta_score >= 80
                  ? 'bg-green-50 border border-green-100'
                  : 'bg-amber-50 border border-amber-100'
              }`}
            >
              <p className="font-semibold mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Análise da IA
              </p>
              <p className="text-gray-700">{purchase.ai_analise}</p>

              {purchase.ai_meta_sugerida && purchase.ai_meta_sugerida !== purchase.meta_id && (
                <p className="mt-1 text-amber-700 font-medium">
                  Meta sugerida: {purchase.ai_meta_sugerida}
                </p>
              )}
            </div>
          )}

          {budgetLine && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="font-semibold text-xs mb-2 text-blue-900">
                📋 Rubrica Orçamentária
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-blue-800">
                <div>
                  <span className="text-blue-600 font-medium">Código:</span> {budgetLine.codigo}
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Natureza:</span>{' '}
                  {budgetLine.natureza_codigo}
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Valor PO:</span> R${' '}
                  {(budgetLine.valor_total_previsto || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2
                  })}
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Comprometido:</span> R${' '}
                  {(budgetLine.saldo_comprometido || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2
                  })}
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Saldo:</span> R${' '}
                  {Math.max(
                    0,
                    (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)
                  ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {purchase.categoria && (
              <div>
                <span className="text-gray-400">Categoria</span>
                <p className="font-medium text-gray-700">{purchase.categoria}</p>
              </div>
            )}

            {purchase.centro_custo && (
              <div>
                <span className="text-gray-400">Centro de custo</span>
                <p className="font-medium text-gray-700">{purchase.centro_custo}</p>
              </div>
            )}

            {purchase.meio_pagamento && (
              <div>
                <span className="text-gray-400">Pagamento</span>
                <p className="font-medium text-gray-700">{purchase.meio_pagamento}</p>
              </div>
            )}

            {purchase.qtd && (
              <div>
                <span className="text-gray-400">Qtd</span>
                <p className="font-medium text-gray-700">
                  {purchase.qtd} {purchase.unidade}
                </p>
              </div>
            )}

            {purchase.data_pagamento && (
              <div>
                <span className="text-gray-400">Data pgto</span>
                <p className="font-medium text-gray-700">{purchase.data_pagamento}</p>
              </div>
            )}
          </div>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <p className="font-semibold text-xs mb-3 text-amber-900">
              📎 Documentos Anexados
            </p>

            <div className="space-y-2 mb-3">
              <PurchaseDocumentViewer
                purchaseId={purchase.id}
                canApproveDocuments={isCoordenador || isAdmin}
                currentUser={currentUser}
                onRefresh={onRefresh}
              />
            </div>

            <PurchaseDocumentUpload
              purchaseId={purchase.id}
              onUploadSuccess={() => onRefresh?.()}
            />
          </div>

          {relatedActivity && (
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
              <p className="font-semibold text-xs mb-2 text-purple-900 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Atividade Relacionada
              </p>

              <div className="space-y-1 text-xs text-purple-800">
                <p>
                  <span className="font-medium">Título:</span> {relatedActivity.titulo}
                </p>

                {relatedActivity.data_realizacao && (
                  <p>
                    <span className="font-medium">Data:</span>{' '}
                    {relatedActivity.data_realizacao}
                  </p>
                )}
              </div>
            </div>
          )}

          {(purchase.link_proposta || purchase.comprovante_url || purchase.orcamento_url) && (
            <div className="flex gap-2 flex-wrap">
              {purchase.link_proposta && (
                <a href={purchase.link_proposta} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-xs gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Ver Proposta
                  </Button>
                </a>
              )}

              {purchase.orcamento_url && (
                <a href={purchase.orcamento_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-xs gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Orçamento
                  </Button>
                </a>
              )}

              {purchase.comprovante_url && (
                <a href={purchase.comprovante_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-xs gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Comprovante/NF
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}