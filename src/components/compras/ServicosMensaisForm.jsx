import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Upload, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '@/components/common/ConfirmDialog';

export default function ServicosMensaisForm({ rubricaId, rubrica, isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState({
    fornecedor_nome: '',
    categoria: '',
    valor_mensal: '',
    data_inicio: '',
    data_fim: '',
    dia_pagamento: '1',
  });
  const [contrato, setContrato] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fornecedores-mensais'],
    queryFn: () => base44.entities.Fornecedor.filter({ tem_contrato_mensal: true }, 'nome', 100),
  });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 20 * 1024 * 1024) {
        toast.error('Arquivo muito grande (máx 20MB)');
        return;
      }
      setContrato(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!form.fornecedor_nome || !form.valor_mensal || !form.data_inicio || !form.data_fim) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    setSaving(true);
    try {
      const fornecedor = fornecedores.find(f => f.nome === form.fornecedor_nome);
      
      let contrato_url = '';
      if (contrato) {
        const uploadRes = await base44.integrations.Core.UploadFile({ file: contrato });
        contrato_url = uploadRes.file_url;
      }
      
      await base44.entities.GastoRubrica.create({
        rubrica_id: rubricaId,
        fornecedor_id: fornecedor?.id || '',
        fornecedor_nome: form.fornecedor_nome,
        categoria: form.categoria || fornecedor?.categoria || '',
        descricao: `Serviço mensal - Período ${form.data_inicio} a ${form.data_fim}`,
        valor: parseFloat(form.valor_mensal),
        data_gasto: form.data_inicio,
        mes_referencia: form.data_inicio.substring(0, 7),
        tipo_pagamento: 'transferencia',
        status: 'pendente',
        eh_servico_mensal: true,
        data_inicio_servico: form.data_inicio,
        data_fim_servico: form.data_fim,
        dia_pagamento_mensal: parseInt(form.dia_pagamento),
        contrato_url: contrato_url,
        contrato_nome: contrato?.name || '',
      });

      toast.success(`Serviço mensal de R$ ${parseFloat(form.valor_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} adicionado!`);
      
      queryClient.invalidateQueries(['gastos-rubrica', rubricaId]);
      setShowConfirm(false);
      setForm({
        fornecedor_nome: '',
        categoria: '',
        valor_mensal: '',
        data_inicio: '',
        data_fim: '',
        dia_pagamento: '1',
      });
      setContrato(null);
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Serviço Mensal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Fornecedor *</label>
            <Select value={form.fornecedor_nome} onValueChange={v => setForm(p => ({ ...p, fornecedor_nome: v }))}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {fornecedores.map(f => (
                  <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Valor Mensal (R$) *</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.valor_mensal}
                onChange={e => setForm(p => ({ ...p, valor_mensal: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dia Pagamento</label>
              <Input
                type="number"
                min="1"
                max="31"
                placeholder="1"
                value={form.dia_pagamento}
                onChange={e => setForm(p => ({ ...p, dia_pagamento: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data Início *</label>
              <Input
                type="date"
                value={form.data_inicio}
                onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data Fim *</label>
              <Input
                type="date"
                value={form.data_fim}
                onChange={e => setForm(p => ({ ...p, data_fim: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Contrato (PDF/Imagem)</label>
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {contrato ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-700 font-medium truncate">{contrato.name}</span>
                  </div>
                  <button
                    onClick={() => setContrato(null)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-600">Clique para anexar contrato</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500 bg-blue-50 p-2 rounded border border-blue-100">
            📋 Você poderá anexar notas fiscais mensais no histórico de gastos
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-black text-white" onClick={handleSubmit} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirmar serviço mensal"
        description={`Adicionar serviço de R$ ${parseFloat(form.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de ${form.fornecedor_nome} de ${form.data_inicio} até ${form.data_fim}?`}
        confirmText="Adicionar Serviço"
        onConfirm={confirmSubmit}
        onCancel={() => setShowConfirm(false)}
        isLoading={saving}
      />
    </Dialog>
  );
}