import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Check, AlertCircle } from 'lucide-react';

export default function PagamentoComprovante({ fornecedor, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    valor_pago: '',
    tipo_pagamento: 'transferencia_bancaria',
    data_pagamento: new Date().toISOString().split('T')[0],
    referencia_bancaria: '',
    descricao: '',
    comprovante: null,
  });

  const handleFileChange = (e) => {
    setFormData(prev => ({ ...prev, comprovante: e.target.files?.[0] || null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      let comprovante_url = null;

      // Upload do comprovante se existir
      if (formData.comprovante) {
        const uploadResp = await base44.integrations.Core.UploadFile({
          file: formData.comprovante,
        });
        comprovante_url = uploadResp.file_url;
      }

      // Registrar pagamento
      await base44.functions.invoke('registrarPagamentoFornecedor', {
        fornecedor_id: fornecedor.id,
        valor_pago: parseFloat(formData.valor_pago),
        tipo_pagamento: formData.tipo_pagamento,
        data_pagamento: formData.data_pagamento,
        comprovante_url,
        descricao: formData.descricao,
        referencia_bancaria: formData.referencia_bancaria,
      });

      setSuccess(true);
      setFormData({
        valor_pago: '',
        tipo_pagamento: 'transferencia_bancaria',
        data_pagamento: new Date().toISOString().split('T')[0],
        referencia_bancaria: '',
        descricao: '',
        comprovante: null,
      });

      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Erro ao registrar pagamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Registrar Pagamento</h2>
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700">Pagamento registrado com sucesso! Notificação enviada ao fornecedor.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Fornecedor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fornecedor</label>
          <input
            type="text"
            disabled
            value={fornecedor.nome}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
          />
        </div>

        {/* Valor pago */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Valor Pago *</label>
          <div className="flex items-center">
            <span className="text-gray-600 mr-2">R$</span>
            <Input
              type="number"
              step="0.01"
              required
              value={formData.valor_pago}
              onChange={(e) => setFormData(prev => ({ ...prev, valor_pago: e.target.value }))}
              placeholder="0,00"
              className="flex-1"
            />
          </div>
        </div>

        {/* Tipo de pagamento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Pagamento *</label>
          <select
            required
            value={formData.tipo_pagamento}
            onChange={(e) => setFormData(prev => ({ ...prev, tipo_pagamento: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="transferencia_bancaria">Transferência Bancária</option>
            <option value="pix">PIX</option>
            <option value="deposito">Depósito em Espécie</option>
          </select>
        </div>

        {/* Data pagamento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Data do Pagamento *</label>
          <Input
            type="date"
            required
            value={formData.data_pagamento}
            onChange={(e) => setFormData(prev => ({ ...prev, data_pagamento: e.target.value }))}
          />
        </div>

        {/* Referência bancária */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Referência / Número de Confirmação</label>
          <Input
            type="text"
            placeholder="Ex: TED 123456, Código PIX XXXXX..."
            value={formData.referencia_bancaria}
            onChange={(e) => setFormData(prev => ({ ...prev, referencia_bancaria: e.target.value }))}
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
          <textarea
            value={formData.descricao}
            onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
            placeholder="Detalhes adicionais sobre o pagamento..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows="3"
          />
        </div>

        {/* Comprovante */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Comprovante de Pagamento</label>
          <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 bg-gray-50">
            <div className="flex flex-col items-center">
              <Upload className="w-6 h-6 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">
                {formData.comprovante ? formData.comprovante.name : 'Clique para adicionar comprovante'}
              </p>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG, PDF até 5MB</p>
            </div>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Botões */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            type="submit"
            disabled={loading || !formData.valor_pago}
            className="flex-1"
          >
            {loading ? 'Processando...' : 'Registrar Pagamento'}
          </Button>
        </div>
      </form>
    </div>
  );
}