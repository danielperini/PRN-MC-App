import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, DollarSign, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import GastoRubricaForm from './GastoRubricaForm';
import ServicosMensaisForm from './ServicosMensaisForm';
import GastoNFUploader from './GastoNFUploader';
import ConfirmDialog from '@/components/common/ConfirmDialog';

const fmt = (v) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const CATEGORIA_COLORS = {
  contabilidade: 'bg-blue-100 text-blue-800',
  audiovisual: 'bg-purple-100 text-purple-800',
  design: 'bg-pink-100 text-pink-800',
  producao: 'bg-green-100 text-green-800',
  consultoria: 'bg-indigo-100 text-indigo-800',
  manutencao: 'bg-orange-100 text-orange-800',
  limpeza: 'bg-cyan-100 text-cyan-800',
  seguranca: 'bg-red-100 text-red-800',
  alimentacao: 'bg-yellow-100 text-yellow-800',
  transporte: 'bg-amber-100 text-amber-800',
  tecnologia: 'bg-slate-100 text-slate-800',
  outro: 'bg-gray-100 text-gray-800',
};

export default function GastosRubricaPanel({ rubricaId, rubricaCodigo, rubrica }) {
  const [showForm, setShowForm] = useState(false);
  const [showServicos, setShowServicos] = useState(false);
  const [showNFUpload, setShowNFUpload] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const queryClient = useQueryClient();

  const { data: gastos = [] } = useQuery({
    queryKey: ['gastos-rubrica', rubricaId],
    queryFn: () => base44.entities.GastoRubrica.filter({ rubrica_id: rubricaId }, '-data_gasto', 100),
  });

  const deleteMutation = useMutation({
    mutationFn: (gastoId) => base44.entities.GastoRubrica.delete(gastoId),
    onSuccess: (_, gastoId) => {
      const gasto = gastos.find(g => g.id === gastoId);
      queryClient.invalidateQueries(['gastos-rubrica', rubricaId]);
      toast.success(`Gasto de R$ ${(gasto?.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} removido`);
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error('Erro ao remover: ' + e.message),
  });

  const totalGastos = gastos.reduce((s, g) => s + (g.valor || 0), 0);
  const gastosPagos = gastos.filter(g => g.status === 'pago').reduce((s, g) => s + (g.valor || 0), 0);
  const gastosPendentes = gastos.filter(g => g.status === 'pendente').reduce((s, g) => s + (g.valor || 0), 0);

  return (
    <div className="space-y-4">
      {/* Totalizadores */}
      <div className="grid grid-cols-3 gap-3 bg-gradient-to-r from-gray-50 to-blue-50 p-4 rounded-lg border border-gray-200">
        <div>
          <p className="text-xs text-gray-500 mb-1">Total de Gastos</p>
          <p className="text-lg font-bold text-gray-800">{fmt(totalGastos)}</p>
        </div>
        <div>
          <p className="text-xs text-green-600 mb-1">Gastos Pagos</p>
          <p className="text-lg font-bold text-green-700">{fmt(gastosPagos)}</p>
        </div>
        <div>
          <p className="text-xs text-amber-600 mb-1">Gastos Pendentes</p>
          <p className="text-lg font-bold text-amber-700">{fmt(gastosPendentes)}</p>
        </div>
      </div>

      {/* Botões adicionar */}
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-gray-800">
          {gastos.length} Gasto(s) Registrado(s)
        </h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setShowServicos(true)}>
            <Calendar className="w-3.5 h-3.5" />Serviço Mensal
          </Button>
          <Button size="sm" className="bg-black text-white h-8 gap-1" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5" />Adicionar Gasto
          </Button>
        </div>
      </div>

      {/* Lista de gastos */}
      {gastos.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
          <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-500">Nenhum gasto registrado nesta rubrica</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gastos.map(gasto => (
            <div key={gasto.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:border-gray-200 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900">{gasto.fornecedor_nome}</span>
                  {gasto.categoria && (
                    <Badge className={`text-[10px] ${CATEGORIA_COLORS[gasto.categoria] || CATEGORIA_COLORS.outro}`}>
                      {gasto.categoria}
                    </Badge>
                  )}
                  <Badge variant={gasto.status === 'pago' ? 'default' : 'outline'} className="text-[10px]">
                    {gasto.status === 'pago' ? 'Pago' : 'Pendente'}
                  </Badge>
                </div>
                {gasto.descricao && (
                  <p className="text-xs text-gray-500">{gasto.descricao}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {format(new Date(gasto.data_gasto), 'dd MMM yyyy', { locale: ptBR })} • {gasto.tipo_pagamento}
                </p>
              </div>

              <div className="flex items-center gap-3 ml-4">
                <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{fmt(gasto.valor)}</span>
                <button
                  onClick={() => setDeleteConfirm(gasto)}
                  disabled={deleteMutation.isPending}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title="Remover gasto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GastoRubricaForm
        rubricaId={rubricaId}
        rubrica={rubrica}
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={() => queryClient.invalidateQueries(['gastos-rubrica', rubricaId])}
      />

      <ServicosMensaisForm
        rubricaId={rubricaId}
        rubrica={rubrica}
        isOpen={showServicos}
        onClose={() => setShowServicos(false)}
        onSuccess={() => queryClient.invalidateQueries(['gastos-rubrica', rubricaId])}
      />

      {showNFUpload && (
        <GastoNFUploader
          gastoId={showNFUpload.id}
          fornecedorNome={showNFUpload.fornecedor_nome}
          isOpen={!!showNFUpload}
          onClose={() => setShowNFUpload(null)}
          onSuccess={() => queryClient.invalidateQueries(['gastos-rubrica', rubricaId])}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          isOpen={!!deleteConfirm}
          title="Remover gasto"
          description={`Remover gasto de R$ ${deleteConfirm.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de ${deleteConfirm.fornecedor_nome}?`}
          confirmText="Remover"
          variant="destructive"
          onConfirm={() => deleteMutation.mutate(deleteConfirm.id)}
          onCancel={() => setDeleteConfirm(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}