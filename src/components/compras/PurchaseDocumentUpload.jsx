import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, X, Loader2, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const DOCUMENT_TYPES = [
  { value: 'orcamento', label: '📊 Orçamento' },
  { value: 'contrato', label: '📜 Contrato Assinado' },
  { value: 'nota_fiscal', label: '🧾 Nota Fiscal' },
  { value: 'recibo', label: '✅ Recibo' },
  { value: 'outro', label: '📎 Outro' },
];

export default function PurchaseDocumentUpload({ purchaseId, rubricaId = null, onUploadSuccess }) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [formData, setFormData] = useState({
    tipo_documento: 'orcamento',
    descricao: '',
    numero_documento: '',
    data_documento: '',
    fornecedor: '',
    valor_documento: '',
  });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (selectedFile.size > maxSize) {
        toast.error('Arquivo muito grande (máx 20MB)');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }

    if (!formData.tipo_documento) {
      toast.error('Selecione o tipo de documento');
      return;
    }

    setUploading(true);
    try {
      const user = await base44.auth.me();

      // Upload do arquivo
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const file_url = uploadRes.file_url;

      // Criar registro do documento
    const docResult = await base44.entities.PurchaseDocument.create({
  purchase_id: purchaseId,
  rubrica_id: rubricaId,
  tipo_documento: formData.tipo_documento,
  nome_arquivo: file.name,
  file_url,
  file_size: file.size,
  mime_type: file.type,
  descricao: formData.descricao,
  numero_documento: formData.numero_documento,
  data_documento: formData.data_documento,
  fornecedor: formData.fornecedor,
  valor_documento: formData.valor_documento ? parseFloat(formData.valor_documento) : null,
  uploadado_por: user?.email,

  // 🔥 CORREÇÃO PRINCIPAL
  status: 'aprovado',

  // 💡 extra recomendado
  data_upload: new Date().toISOString(),
});

      // Sincronizar com a rubrica se tiver valor
      if (formData.valor_documento && (rubricaId || purchaseId)) {
        try {
          await base44.functions.invoke('syncDocumentToRubrica', {
            documentId: docResult.id,
          });
        } catch (e) {
          console.error('Erro ao sincronizar rubrica:', e);
        }
      }

      toast.success('✅ Documento anexado!');
      setFile(null);
      setFormData({
        tipo_documento: 'orcamento',
        descricao: '',
        numero_documento: '',
        data_documento: '',
        fornecedor: '',
        valor_documento: '',
      });
      setIsOpen(false);
      onUploadSuccess?.();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button variant="outline" className="gap-2" onClick={() => setIsOpen(true)}>
        <Upload className="w-4 h-4" />
        Anexar Documento
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-black">Anexar Documento</h2>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4">
          {/* Tipo de Documento */}
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Tipo de Documento *</label>
            <Select value={formData.tipo_documento} onValueChange={(v) => setFormData(f => ({ ...f, tipo_documento: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload de Arquivo */}
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Arquivo *</label>
            <div className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-gray-400'}`}>
              <input
                type="file"
                onChange={handleFileChange}
                className="hidden"
                id="file-input"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png,.txt"
              />
              <label htmlFor="file-input" className="cursor-pointer block">
                {file ? (
                  <div className="space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-green-600" />
                    <p className="text-sm font-semibold text-green-700">{file.name}</p>
                    <p className="text-xs text-green-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 mx-auto text-gray-400" />
                    <p className="text-sm font-semibold text-gray-700">Clique para selecionar arquivo</p>
                    <p className="text-xs text-gray-500">ou arraste aqui (máx 20MB)</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Número do Documento */}
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Número (NF, Contrato, etc)</label>
            <Input
              placeholder="Ex: NF-000123"
              value={formData.numero_documento}
              onChange={e => setFormData(f => ({ ...f, numero_documento: e.target.value }))}
            />
          </div>

          {/* Data do Documento */}
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Data do Documento</label>
            <Input
              type="date"
              value={formData.data_documento}
              onChange={e => setFormData(f => ({ ...f, data_documento: e.target.value }))}
            />
          </div>

          {/* Fornecedor */}
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Fornecedor</label>
            <Input
              placeholder="Nome do fornecedor"
              value={formData.fornecedor}
              onChange={e => setFormData(f => ({ ...f, fornecedor: e.target.value }))}
            />
          </div>

          {/* Valor */}
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Valor (R$)</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.valor_documento}
              onChange={e => setFormData(f => ({ ...f, valor_documento: e.target.value }))}
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Descrição Adicional</label>
            <Textarea
              placeholder="Notas sobre o documento..."
              rows={3}
              value={formData.descricao}
              onChange={e => setFormData(f => ({ ...f, descricao: e.target.value }))}
            />
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              className="bg-black hover:bg-gray-800 text-white flex-1"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {uploading ? 'Enviando...' : 'Anexar'}
            </Button>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}