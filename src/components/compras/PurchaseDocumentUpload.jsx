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
import { Upload, X, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

const DOCUMENT_TYPES = [
  { value: 'orcamento', label: '📊 Orçamento' },
  { value: 'contrato', label: '📜 Contrato Assinado' },
  { value: 'nota_fiscal', label: '🧾 Nota Fiscal' },
  { value: 'xml_nf', label: '🧾 XML da Nota Fiscal' },
  { value: 'recibo', label: '✅ Recibo' },
  { value: 'comprovante_pagamento', label: '💸 Comprovante de Pagamento' },
  { value: 'outro', label: '📎 Outro' },
];

export default function PurchaseDocumentUpload({
  purchaseId,
  rubricaId = null,
  onUploadSuccess,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [formData, setFormData] = useState({
    tipo_documento: 'orcamento',
    descricao: '',
    numero_documento: '',
    data_documento: '',
    fornecedor: '',
    valor_documento: '',
  });

  const resetForm = () => {
    setFiles([]);
    setFormData({
      tipo_documento: 'orcamento',
      descricao: '',
      numero_documento: '',
      data_documento: '',
      fornecedor: '',
      valor_documento: '',
    });
  };

  const handleClose = () => {
    resetForm();
    setIsOpen(false);
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;

    const maxSize = 20 * 1024 * 1024;
    const tooLarge = selectedFiles.find((f) => f.size > maxSize);

    if (tooLarge) {
      toast.error(`Arquivo muito grande: ${tooLarge.name} (máx 20MB)`);
      return;
    }

    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (!purchaseId) {
      toast.error('Compra não identificada para vincular os documentos.');
      return;
    }

    if (!files.length) {
      toast.error('Selecione ao menos um arquivo.');
      return;
    }

    if (!formData.tipo_documento) {
      toast.error('Selecione o tipo de documento.');
      return;
    }

    setUploading(true);

    try {
      const user = await base44.auth.me();
      const purchase = await base44.entities.PurchaseRequest.get(purchaseId);

      if (!purchase) {
        toast.error('Compra não encontrada.');
        setUploading(false);
        return;
      }

      const effectiveRubricaId =
        rubricaId ||
        purchase.rubrica_id ||
        purchase.budgetline_id ||
        purchase.budget_line_id || // 🔥 FIX
        null;

      const createdDocs = [];

      for (const currentFile of files) {
        const uploadRes = await base44.integrations.Core.UploadFile({
          file: currentFile,
        });

        const file_url = uploadRes?.file_url || uploadRes?.url || '';

        if (!file_url) {
          throw new Error(`Falha ao obter URL do arquivo ${currentFile.name}`);
        }

        const docPayload = {
          purchase_id: purchaseId,
          rubrica_id: effectiveRubricaId,
          tipo_documento: formData.tipo_documento,
          nome_arquivo: currentFile.name,
          file_url,
          file_size: currentFile.size || 0,
          mime_type: currentFile.type || '',
          descricao: formData.descricao || '',
          numero_documento: formData.numero_documento || '',
          data_documento: formData.data_documento || '',
          fornecedor: formData.fornecedor || purchase.fornecedor_nome || '',
          valor_documento: formData.valor_documento
            ? parseFloat(formData.valor_documento)
            : null,
          uploadado_por: user?.email || '',
          status: 'pendente_revisao',
          data_upload: new Date().toISOString(),
          revisado_por: '',
          comentario_revisao: '',
        };

        const created = await base44.entities.PurchaseDocument.create(docPayload);
        createdDocs.push(created);

        try {
          await base44.functions.invoke('syncDocumentToRubrica', {
            documentId: created.id,
          });
        } catch (syncError) {
          console.error('Erro ao sincronizar documento com rubrica:', syncError);
        }

        /* 🔥 NOVO: vincular NF automaticamente em pagamento de equipe */
        if (purchase.team_payment_id && formData.tipo_documento === 'nota_fiscal') {
          try {
            await base44.entities.TeamPayment.update(purchase.team_payment_id, {
              nota_fiscal_url: file_url,
            });
          } catch (e) {
            console.error('Erro ao vincular NF ao TeamPayment:', e);
          }
        }

        if (purchase.team_payment_id && formData.tipo_documento === 'xml_nf') {
          try {
            await base44.entities.TeamPayment.update(purchase.team_payment_id, {
              xml_url: file_url,
            });
          } catch (e) {
            console.error('Erro ao vincular XML ao TeamPayment:', e);
          }
        }
      }

      toast.success(`✅ ${createdDocs.length} documento(s) enviado(s) para aprovação!`);
      handleClose();
      onUploadSuccess?.(createdDocs);

    } catch (e) {
      toast.error('Erro ao enviar documentos: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        className="rounded-xl"
        onClick={() => setIsOpen(true)}
      >
        <Upload className="w-4 h-4 mr-2" />
        Anexar Documento
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Anexar Documento</h3>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Tipo de Documento *</label>
          <Select
            value={formData.tipo_documento}
            onValueChange={(v) => setFormData((f) => ({ ...f, tipo_documento: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Arquivos *</label>
          <div className="border-2 border-dashed rounded-xl p-4 text-center">
            <Input type="file" multiple onChange={handleFileChange} />
            <p className="text-xs text-gray-500 mt-2">
              Selecione um ou mais arquivos (máx. 20MB por arquivo)
            </p>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="flex items-center gap-3 rounded-xl border p-3"
              >
                <FileText className="w-4 h-4 text-gray-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-gray-500">
                    {(f.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-sm font-medium mb-1 block">
            Número do documento
          </label>
          <Input
            value={formData.numero_documento}
            onChange={(e) =>
              setFormData((f) => ({ ...f, numero_documento: e.target.value }))
            }
            placeholder="Ex.: NF-12345"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Data do documento</label>
          <Input
            type="date"
            value={formData.data_documento}
            onChange={(e) =>
              setFormData((f) => ({ ...f, data_documento: e.target.value }))
            }
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Fornecedor</label>
          <Input
            value={formData.fornecedor}
            onChange={(e) =>
              setFormData((f) => ({ ...f, fornecedor: e.target.value }))
            }
            placeholder="Nome do fornecedor"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Valor (R$)</label>
          <Input
            type="number"
            step="0.01"
            value={formData.valor_documento}
            onChange={(e) =>
              setFormData((f) => ({ ...f, valor_documento: e.target.value }))
            }
            placeholder="0,00"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Descrição adicional</label>
          <Textarea
            value={formData.descricao}
            onChange={(e) =>
              setFormData((f) => ({ ...f, descricao: e.target.value }))
            }
            placeholder="Detalhes complementares sobre o documento"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t">
        <Button
          className="bg-black hover:bg-gray-800 text-white flex-1"
          onClick={handleUpload}
          disabled={!files.length || uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {uploading ? 'Enviando...' : 'Enviar para aprovação'}
        </Button>

        <Button variant="outline" onClick={handleClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
