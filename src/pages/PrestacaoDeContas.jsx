import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import InvoiceUploader from '@/components/contas/InvoiceUploader';
import AnnualAccountingExport from '@/components/reports/AnnualAccountingExport';

export default function PrestacaoDeContas() {
  const [showForm, setShowForm] = useState(false);
  const [selectedPrestacao, setSelectedPrestacao] = useState(null);
  const [uploading, setUploading] = useState(false);

  const queryClient = useQueryClient();

  const { data: prestacoes = [] } = useQuery({
    queryKey: ['prestacoes-contas'],
    queryFn: () => base44.entities.PrestacaoDeContas.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PrestacaoDeContas.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prestacoes-contas'] });
      setShowForm(false);
    }
  });

  const handleNewPrestacao = async () => {
    const now = new Date();
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const protocolNum = `PC-${meses[now.getMonth()].substring(0, 3).toUpperCase()}${now.getFullYear()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
    
    createMutation.mutate({
      numero_protocolo: protocolNum,
      periodo_mes: meses[now.getMonth()],
      periodo_ano: now.getFullYear(),
      museu: 'MHAB',
      status: 'rascunho'
    });
  };

  const statusColors = {
    rascunho: 'bg-gray-100 text-gray-800',
    sob_analise: 'bg-blue-100 text-blue-800',
    aprovada: 'bg-green-100 text-green-800',
    rejeitada: 'bg-red-100 text-red-800'
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Prestação de Contas</h1>
        <div className="flex gap-2">
          <AnnualAccountingExport />
          <Button onClick={handleNewPrestacao} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Prestação
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {prestacoes.map(prestacao => (
          <Card key={prestacao.id} className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedPrestacao(prestacao)}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{prestacao.numero_protocolo}</h3>
                <p className="text-sm text-gray-600">
                  {prestacao.periodo_mes} de {prestacao.periodo_ano} • {prestacao.museu}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-lg font-bold">R$ {(prestacao.valor_total || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                  <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${statusColors[prestacao.status]}`}>
                    {prestacao.status}
                  </span>
                </div>
              </div>
            </div>

            {prestacao.notas_fiscais?.length > 0 && (
              <div className="mt-3 flex gap-2">
                {prestacao.notas_fiscais.slice(0, 3).map((nf, idx) => (
                  <span key={idx} className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">
                    NF {nf.numero}
                  </span>
                ))}
                {prestacao.notas_fiscais.length > 3 && (
                  <span className="text-xs text-gray-500">+{prestacao.notas_fiscais.length - 3}</span>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedPrestacao} onOpenChange={() => setSelectedPrestacao(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPrestacao?.numero_protocolo}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Seção de Notas Fiscais */}
            <div>
              <h3 className="font-bold text-lg mb-3">Notas Fiscais</h3>
              <InvoiceUploader prestacaoId={selectedPrestacao?.id} />
              
              {selectedPrestacao?.notas_fiscais?.length > 0 && (
                <div className="space-y-2 mt-4">
                  {selectedPrestacao.notas_fiscais.map((nf, idx) => (
                    <Card key={idx} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="font-semibold text-sm">NF {nf.numero}</p>
                          <p className="text-xs text-gray-600">
                            {nf.dados_extraidos?.fornecedor_nome || 'Fornecedor'}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold">R$ {(nf.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Total de NFs</p>
                  <p className="text-2xl font-bold">{selectedPrestacao?.notas_fiscais?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Valor Total</p>
                  <p className="break-words text-xl font-bold leading-tight tabular-nums">R$ {(selectedPrestacao?.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
