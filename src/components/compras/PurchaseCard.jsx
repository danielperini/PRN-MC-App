import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, ExternalLink, Sparkles, Activity, DollarSign, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import PurchaseTimeline from './PurchaseTimeline';

export default function PurchaseCard({ purchase, budgetLines, statusConfig, isCoordenador, isAdmin, onRefresh, currentUser }) {
  const [expanded, setExpanded] = useState(false);
  const [relatedActivity, setRelatedActivity] = useState(null);
  const [showApproval, setShowApproval] = useState(false);
  const [comentario, setComentario] = useState('');
  const [valorAdmin, setValorAdmin] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const s = statusConfig[purchase.status] || { label: purchase.status, color: 'bg-gray-100 text-gray-700' };
  const budgetLine = budgetLines.find(l => l.id === purchase.budgetline_id);

  const canApproveCoord = (isCoordenador || isAdmin) && purchase.status === 'SOLICITADO';
  const canApproveAdmin = isAdmin && purchase.status === 'APROVADO_COORD';
  const canAct = canApproveCoord || canApproveAdmin;

  const filaCoord = purchase.status === 'SOLICITADO';

  useEffect(() => {
    if (purchase.activity_id) {
      base44.entities.Activity.list('-created_date', 50)
        .then(list => setRelatedActivity(list.find(a => a.id === purchase.activity_id)))
        .catch(() => {});
    }
  }, [purchase.activity_id]);

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      const valor_aprovado = parseFloat(valorAdmin) || purchase.valor_solicitado;

      if (action === 'approve_admin') {
        const saldoDisponivel = budgetLine ? (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0) : Infinity;
        if (saldoDisponivel < valor_aprovado) {
          toast.error(`Saldo insuficiente! Disponível: R$ ${saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
          setActionLoading(false);
          return;
        }
      }

      await base44.functions.invoke('processPurchaseApproval', {
        purchaseId: purchase.id,
        action: action === 'approve_coord' ? 'approve_coord' : action === 'approve_admin' ? 'approve_admin' : 'reject',
        comentario,
        valor_aprovado,
      });

      const msgs = {
        approve_coord: 'Aprovado! Aguarda aprovação administrativa.',
        approve_admin: 'Aprovação administrativa concluída!',
        recusar: 'Solicitação recusada.',
      };
      toast.success(msgs[action] || 'Ação realizada!');
      setShowApproval(false);
      setComentario('');
      onRefresh();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
    setActionLoading(false);
  };

  const META_LABELS = {
    'MC3A-20': 'Ações Educativas', 'MC3A-21': 'Exposição / Produção',
    'MC3A-22': 'Comunicação', 'MC3A-23': 'Noturno 2026',
    'MC3A-24': 'Emenda Parlamentar', 'MC3A-25': 'Outras Ações', 'MC3A-EXTRA': 'Extra',
  };

  const scoreColor = purchase.ai_meta_score >= 80
    ? 'text-green-700 bg-green-50' : purchase.ai_meta_score >= 50
    ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';

  return (
    <div className={`border rounded-xl transition-colors ${canAct && !showApproval ? 'border-blue-100 hover:border-blue-200' : 'border-gray-100 hover:border-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
              {purchase.meta_id && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{META_LABELS[purchase.meta_id] || purchase.meta_id}</span>
              )}
              {purchase.tipo_gasto && (
                <span className="text-xs border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{purchase.tipo_gasto}</span>
              )}
              {purchase.ai_meta_score !== undefined && purchase.ai_meta_score !== null && (
                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${scoreColor}`}>
                  <Sparkles className="w-3 h-3" />IA: {purchase.ai_meta_score}%
                </span>
              )}
            </div>
            <p className="font-medium text-black text-sm truncate">{purchase.descricao_item}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
              {purchase.fornecedor_nome && <span>Fornecedor: {purchase.fornecedor_nome}</span>}
              {budgetLine && (
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  <span>[{budgetLine.codigo}] {budgetLine.descricao?.substring(0, 35)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="font-bold text-black">R$ {(purchase.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              {purchase.valor_aprovado_admin && purchase.valor_aprovado_admin !== purchase.valor_solicitado && (
                <p className="text-xs text-green-600">Aprv: R$ {purchase.valor_aprovado_admin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              )}
            </div>
            {canAct && (
              <Button
                size="sm"
                variant={showApproval ? 'default' : 'outline'}
                className={showApproval ? 'bg-black text-white text-xs' : 'text-xs'}
                onClick={() => setShowApproval(!showApproval)}
              >
                {showApproval ? 'Fechar' : 'Analisar'}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Timeline sempre visível */}
        <div className="mt-3">
          <PurchaseTimeline purchase={purchase} />
        </div>

        {/* Painel de aprovação inline */}
        {showApproval && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-black">
              {canApproveCoord ? '✅ Aprovação — Coordenador Geral' : '✅ Aprovação — Coordenador Administrativo'}
            </p>

            {/* Saldo */}
            {budgetLine && (
              <div className="text-xs bg-white border rounded-lg px-3 py-2">
                <span className="text-gray-500">[{budgetLine.codigo}] Saldo disponível: </span>
                <strong className={((budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)) >= (purchase.valor_solicitado || 0) ? 'text-green-700' : 'text-red-700'}>
                  R$ {Math.max(0, (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            )}

            {/* Valor a aprovar (admin) */}
            {canApproveAdmin && (
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Valor a aprovar (R$)</label>
                <Input
                  type="number" step="0.01"
                  placeholder={purchase.valor_solicitado}
                  value={valorAdmin}
                  onChange={e => setValorAdmin(e.target.value)}
                  className="max-w-48 text-sm"
                />
              </div>
            )}

            {/* Justificativa */}
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Justificativa / Comentário</label>
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
                onClick={() => handleAction('recusar')}
                disabled={actionLoading || !comentario.trim()}
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <XCircle className="w-3.5 h-3.5 mr-1" />}
                Recusar
              </Button>
              <Button
                className="bg-black hover:bg-gray-800 text-white text-sm"
                onClick={() => handleAction(canApproveCoord ? 'approve_coord' : 'approve_admin')}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                {canApproveCoord ? 'Aprovar → Admin' : 'Aprovar e Comprometer'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-4">
          {/* Análise IA */}
          {purchase.ai_analise && (
            <div className={`p-3 rounded-lg text-xs ${purchase.ai_meta_score >= 80 ? 'bg-green-50 border border-green-100' : 'bg-amber-50 border border-amber-100'}`}>
              <p className="font-semibold mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Análise da IA</p>
              <p className="text-gray-700">{purchase.ai_analise}</p>
              {purchase.ai_meta_sugerida && purchase.ai_meta_sugerida !== purchase.meta_id && (
                <p className="mt-1 text-amber-700 font-medium">Meta sugerida: {purchase.ai_meta_sugerida}</p>
              )}
            </div>
          )}

          {/* Rubrica */}
          {budgetLine && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="font-semibold text-xs mb-2 text-blue-900">📋 Rubrica Orçamentária</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-blue-800">
                <div><span className="text-blue-600 font-medium">Código:</span> {budgetLine.codigo}</div>
                <div><span className="text-blue-600 font-medium">Natureza:</span> {budgetLine.natureza_codigo}</div>
                <div><span className="text-blue-600 font-medium">Valor PO:</span> R$ {(budgetLine.valor_total_previsto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div><span className="text-blue-600 font-medium">Comprometido:</span> R$ {(budgetLine.saldo_comprometido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div><span className="text-blue-600 font-medium">Saldo:</span> R$ {Math.max(0, (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          )}

          {/* Detalhes */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {purchase.categoria && <div><span className="text-gray-400">Categoria</span><p className="font-medium text-gray-700">{purchase.categoria}</p></div>}
            {purchase.centro_custo && <div><span className="text-gray-400">Centro de custo</span><p className="font-medium text-gray-700">{purchase.centro_custo}</p></div>}
            {purchase.meio_pagamento && <div><span className="text-gray-400">Pagamento</span><p className="font-medium text-gray-700">{purchase.meio_pagamento}</p></div>}
            {purchase.qtd && <div><span className="text-gray-400">Qtd</span><p className="font-medium text-gray-700">{purchase.qtd} {purchase.unidade}</p></div>}
            {purchase.data_pagamento && <div><span className="text-gray-400">Data pgto</span><p className="font-medium text-gray-700">{purchase.data_pagamento}</p></div>}
          </div>

          {/* Atividade Relacionada */}
          {relatedActivity && (
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
              <p className="font-semibold text-xs mb-2 text-purple-900 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Atividade Relacionada
              </p>
              <div className="space-y-1 text-xs text-purple-800">
                <p><span className="font-medium">Título:</span> {relatedActivity.titulo}</p>
                {relatedActivity.data_realizacao && <p><span className="font-medium">Data:</span> {relatedActivity.data_realizacao}</p>}
              </div>
            </div>
          )}

          {/* Links */}
          {(purchase.link_proposta || purchase.comprovante_url || purchase.orcamento_url) && (
            <div className="flex gap-2 flex-wrap">
              {purchase.link_proposta && (
                <a href={purchase.link_proposta} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-xs gap-1"><ExternalLink className="w-3 h-3" />Ver Proposta</Button>
                </a>
              )}
              {purchase.orcamento_url && (
                <a href={purchase.orcamento_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-xs gap-1"><ExternalLink className="w-3 h-3" />Orçamento</Button>
                </a>
              )}
              {purchase.comprovante_url && (
                <a href={purchase.comprovante_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-xs gap-1"><ExternalLink className="w-3 h-3" />Comprovante/NF</Button>
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}