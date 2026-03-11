import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle, XCircle, ArrowLeft, MessageSquare, Calendar,
  User, FileText, AlertCircle, Loader2, ChevronDown
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const STATUS_COLORS = {
  SOLICITADO: 'bg-blue-100 text-blue-700',
  APROVADO_COORD: 'bg-yellow-100 text-yellow-700',
  APROVADO_ADMIN: 'bg-green-100 text-green-700',
  RECUSADO: 'bg-red-100 text-red-700',
};

export default function MobileApprovalFlow({ type = 'report' }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [comment, setComment] = useState('');
  const [loadingId, setLoadingId] = useState(null);
  const queryClient = useQueryClient();

  const { data: pendingItems = [], isLoading } = useQuery({
    queryKey: ['mobile-approvals', type],
    queryFn: async () => {
      if (type === 'report') {
        const reports = await base44.entities.Report.filter({ status: 'SUBMITTED' }, '-created_date', 50);
        return reports.map(r => ({
          id: r.id,
          type: 'report',
          title: `${r.author_name} — ${r.mes_referencia}/${r.ano}`,
          subtitle: r.museu,
          status: r.status,
          date: r.created_date,
          fullData: r,
        }));
      } else {
        const purchases = await base44.entities.PurchaseRequest.filter({ status: 'SOLICITADO' }, '-created_date', 50);
        return purchases.map(p => ({
          id: p.id,
          type: 'purchase',
          title: p.descricao_item,
          subtitle: `R$ ${parseFloat(p.valor).toFixed(2)}`,
          status: p.status,
          date: p.created_date,
          fullData: p,
        }));
      }
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (itemId) => {
      if (type === 'report') {
        await base44.entities.Report.update(itemId, { status: 'APPROVED' });
      } else {
        await base44.entities.PurchaseRequest.update(itemId, { status: 'APROVADO_COORD' });
      }
      if (comment) {
        await base44.entities.ApprovalComment.create({
          [`${type === 'report' ? 'report' : 'purchase'}_id`]: itemId,
          stage: 'APPROVAL',
          author_email: (await base44.auth.me()).email,
          comment,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['mobile-approvals']);
      setSelectedItem(null);
      setComment('');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (itemId) => {
      if (type === 'report') {
        await base44.entities.Report.update(itemId, { status: 'RETURNED', return_comment: comment });
      } else {
        await base44.entities.PurchaseRequest.update(itemId, { status: 'RECUSADO' });
      }
      if (comment) {
        await base44.entities.ApprovalComment.create({
          [`${type === 'report' ? 'report' : 'purchase'}_id`]: itemId,
          stage: 'APPROVAL',
          author_email: (await base44.auth.me()).email,
          comment,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['mobile-approvals']);
      setSelectedItem(null);
      setComment('');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!selectedItem) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-20 md:pb-0">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <div className="px-4 md:px-6 py-4 md:py-6 max-w-6xl mx-auto">
            <h1 className="text-xl md:text-3xl font-bold text-gray-900">
              {type === 'report' ? 'Relatórios' : 'Compras'} Pendentes
            </h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">
              {pendingItems.length} item(ns) aguardando aprovação
            </p>
          </div>
        </div>

        {/* Lista de Items */}
        <div className="px-4 md:px-6 py-4 md:py-6 max-w-6xl mx-auto space-y-3 md:space-y-4 md:grid md:grid-cols-2 md:gap-4">
          {pendingItems.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Nenhum item pendente</p>
              <p className="text-sm text-gray-400">Tudo em dia! ✓</p>
            </div>
          ) : (
            pendingItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="w-full md:w-auto text-left md:col-span-1"
              >
                <Card className="p-4 md:p-5 hover:shadow-lg transition-all border-l-4 border-blue-400">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm md:text-base truncate">
                        {item.title}
                      </h3>
                      <p className="text-xs md:text-sm text-gray-600 mt-1 truncate">{item.subtitle}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 hidden md:block" />
                  </div>
                  <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500 mt-2">
                    <Calendar className="w-3 h-3" />
                    {new Date(item.date).toLocaleDateString('pt-BR')}
                  </div>
                </Card>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header com Voltar */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 flex items-center gap-3 px-4 md:px-6 py-4 md:py-6 max-w-6xl mx-auto w-full">
        <button onClick={() => setSelectedItem(null)} className="hover:bg-gray-100 p-2 rounded-lg transition">
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <h1 className="text-lg md:text-2xl font-bold text-gray-900 flex-1">
          {selectedItem.type === 'report' ? 'Relatório' : 'Compra'}
        </h1>
      </div>

      {/* Conteúdo */}
      <div className="px-4 md:px-6 py-6 md:py-8 pb-40 md:pb-24 space-y-6 max-w-6xl mx-auto w-full">
        {/* Card Principal */}
        <Card className="p-6 md:p-8 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
          <div className="space-y-4 md:space-y-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 break-words">
                {selectedItem.title}
              </h2>
              <p className="text-sm md:text-base text-gray-600 mt-2">{selectedItem.subtitle}</p>
            </div>

            {selectedItem.type === 'report' && selectedItem.fullData && (
              <div className="border-t border-indigo-200 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-700">
                    <span className="font-semibold">{selectedItem.fullData.author_name}</span>
                    {' — '}{selectedItem.fullData.funcao}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-700">
                    Equipe: <span className="font-semibold">{selectedItem.fullData.equipe}</span>
                  </span>
                </div>
              </div>
            )}

            {selectedItem.type === 'purchase' && selectedItem.fullData && (
              <div className="border-t border-indigo-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Fornecedor:</span>
                  <span className="font-semibold text-gray-900">
                    {selectedItem.fullData.fornecedor_nome}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Rubrica:</span>
                  <span className="font-semibold text-gray-900">
                    {selectedItem.fullData.rubrica_codigo}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-indigo-200">
                  <span className="text-sm text-gray-600">Valor:</span>
                  <span className="text-2xl font-bold text-indigo-600">
                    R$ {parseFloat(selectedItem.fullData.valor).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Resumo Executivo (Relatórios) */}
        {selectedItem.type === 'report' && selectedItem.fullData?.resumo_executivo && (
          <Card className="p-4 border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">Resumo Executivo</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              {selectedItem.fullData.resumo_executivo}
            </p>
          </Card>
        )}

        {/* Campo de Comentário */}
        <div className="space-y-2 md:space-y-3">
          <label className="text-sm md:text-base font-semibold text-gray-900">
            <MessageSquare className="w-4 h-4 inline mr-2" />
            Comentário (opcional)
          </label>
          <Textarea
            placeholder="Adicione um comentário para o autor..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="min-h-24 md:min-h-32 text-sm md:text-base"
          />
        </div>

        {/* Alerta */}
        <div className="flex gap-3 p-4 md:p-5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm md:text-base text-amber-800">
            {selectedItem.type === 'report'
              ? 'Verifique os dados antes de aprovar. Esta ação não pode ser desfeita.'
              : 'Confirme o valor e fornecedor antes de prosseguir.'}
          </p>
        </div>
      </div>

      {/* Botões Flutuantes */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 md:p-6 flex gap-3 md:gap-4 md:max-w-6xl md:mx-auto md:rounded-t-xl md:static md:border-t-0 md:border-0 md:p-0 md:mt-8">
        <Button
          onClick={() => rejectMutation.mutate(selectedItem.id)}
          disabled={rejectMutation.isPending || approveMutation.isPending}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2 md:text-base"
        >
          {rejectMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          Devolver
        </Button>
        <Button
          onClick={() => approveMutation.mutate(selectedItem.id)}
          disabled={approveMutation.isPending || rejectMutation.isPending}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2 md:text-base"
        >
          {approveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          Aprovar
        </Button>
      </div>
    </div>
  );
}