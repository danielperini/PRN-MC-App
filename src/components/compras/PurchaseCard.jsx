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
  Pencil,
  AlertCircle
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

  const budgetLine = budgetLines.find(
    line =>
      line.id === purchase.budgetline_id ||
      line.id === purchase.budget_line_id ||
      line.id === purchase.linha_orcamentaria_id
  );

  const hasRubricaVinculada =
    !!purchase.rubrica_id ||
    !!purchase.budgetline_id ||
    !!purchase.budget_line_id ||
    !!purchase.linha_orcamentaria_id ||
    !!budgetLine;

  // ✅ NOVO
  const semRubricaVinculada = !hasRubricaVinculada;

  const canApproveCoord =
    (isCoordenador || isAdmin) && purchase.status === 'SOLICITADO';

  const canAct = canApproveCoord;

  // ✅ NOVO (corrigido)
  const canEdit =
    !!onEdit &&
    purchase.status !== 'CANCELADO' &&
    (
      purchase.status !== 'PAGO' ||
      semRubricaVinculada
    );

  const canMarkAsPaidBase =
    (isCoordenador || isAdmin) &&
    (purchase.status === 'APROVADO_COORD' || purchase.status === 'APROVADO_ADMIN');

  const canMarkAsPaid = canMarkAsPaidBase && hasRubricaVinculada;

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

Responda em JSON.`,
      });

      setAiSecurityAnalysis(result);
    } catch (e) {
      toast.error('Erro ao analisar segurança: ' + e.message);
    }

    setLoadingAnalysis(false);
  };

  const handleMarkAsPaid = async () => {
    if (!hasRubricaVinculada) {
      toast.error('❌ Vincule uma rubrica antes de marcar como pago.');
      return;
    }

    setActionLoading(true);

    try {
      await base44.functions.invoke('purchaseActions', {
        action: 'marcar_pago',
        purchaseId: purchase.id,
      });

      toast.success('✅ Compra marcada como paga!');
      onRefresh?.();
    } catch (e) {
      toast.error('❌ Erro: ' + e.message);
    }

    setActionLoading(false);
  };

  return (
    <div className="border rounded-xl p-4">
      
      {/* ALERTA NOVO */}
      {semRubricaVinculada && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            Esta compra está aprovada ou paga sem rubrica vinculada.
            Clique em <strong>Vincular rubrica</strong>.
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <p className="font-medium">{purchase.descricao_item}</p>
          <p className="text-xs text-gray-500">{purchase.fornecedor_nome}</p>
        </div>

        <div className="flex gap-2 items-center">

          {/* BOTÃO EDITAR CORRIGIDO */}
          {canEdit && (
            <Button
              size="sm"
              variant={semRubricaVinculada ? 'destructive' : 'outline'}
              onClick={() => onEdit?.(purchase)}
            >
              <Pencil className="w-3.5 h-3.5 mr-1" />
              {semRubricaVinculada ? 'Vincular rubrica' : 'Editar'}
            </Button>
          )}

          {canMarkAsPaidBase && (
            <Button
              size="sm"
              onClick={handleMarkAsPaid}
              disabled={!canMarkAsPaid}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Marcar pago
            </Button>
          )}

        </div>
      </div>

      <div className="mt-3">
        <PurchaseTimeline purchase={purchase} />
      </div>
    </div>
  );
}