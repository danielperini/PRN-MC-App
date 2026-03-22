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

function parseMoney(value) {
  if (!value) return null;
  return Number(String(value).replace(',', '.'));
}

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

    // 🔥 valida XML/NF
    if (formData.tipo_documento === 'xml_nf') {
      const invalid = selectedFiles.find(f => !f.name.toLowerCase().endsWith('.xml'));
      if (invalid) {
        toast.error('XML deve ser arquivo .xml');
        return;
      }
    }

    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (!purchaseId) {
      toast.error('Compra não identificada.');
      return;
    }

    if (!files.length) {
      toast.error('Selecione ao menos um arquivo.');
      return;
    }

    setUploading(true);

    try {
      const user = await base44.auth.me().catch(() => null);
      const purchase = await base44.entities.PurchaseRequest.get(purchaseId);

      if (!purchase) {
        throw new Error('Compra não encontrada');
      }

      // 🔥 CORREÇÃO: NÃO usar budgetline como rubrica
      const effectiveRubricaId =
        rubricaId ||
        purchase.rubrica_id ||
        null;

      const createdDocs = [];

      await Promise.all(files.map(async (currentFile) => {

        const uploadRes = await base44.integrations.Core.UploadFile({
          file: currentFile,
        });

        const file_url = uploadRes?.file_url || uploadRes?.url || '';

        if (!file_url) {
          throw new Error(`Falha upload ${currentFile.name}`);
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
          valor_documento: parseMoney(formData.valor_documento),
          uploadado_por: user?.email || '',
          status: 'pendente_revisao',
          data_upload: new Date().toISOString(),
        };

        const created = await base44.entities.PurchaseDocument.create(docPayload);
        createdDocs.push(created);

        // 🔥 sync rubrica
        try {
          await base44.functions.invoke('syncDocumentToRubrica', {
            documentId: created.id,
          });
        } catch {}

        // 🔥 integração equipe
        if (purchase.team_payment_id) {
          try {
            if (formData.tipo_documento === 'nota_fiscal') {
              await base44.entities.TeamPayment.update(purchase.team_payment_id, {
                nota_fiscal_url: file_url,
              });
            }

            if (formData.tipo_documento === 'xml_nf') {
              await base44.entities.TeamPayment.update(purchase.team_payment_id, {
                xml_url: file_url,
              });
            }
          } catch {}
        }

      }));

      toast.success(`✅ ${createdDocs.length} documento(s) enviado(s)!`);

      handleClose();
      onUploadSuccess?.(createdDocs);

    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <Upload className="w-4 h-4 mr-2" />
        Anexar Documento
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-4">
      <div className="flex justify-between">
        <h3>Anexar Documento</h3>
        <Button variant="ghost" onClick={handleClose}>
          <X />
        </Button>
      </div>

      <Select
        value={formData.tipo_documento}
        onValueChange={(v) => setFormData((f) => ({ ...f, tipo_documento: v }))}
      >
        <SelectTrigger>
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          {DOCUMENT_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input type="file" multiple onChange={handleFileChange} />

      <Input
        placeholder="Número"
        value={formData.numero_documento}
        onChange={(e) => setFormData((f) => ({ ...f, numero_documento: e.target.value }))}
      />

      <Input
        type="date"
        value={formData.data_documento}
        onChange={(e) => setFormData((f) => ({ ...f, data_documento: e.target.value }))}
      />

      <Input
        placeholder="Fornecedor"
        value={formData.fornecedor}
        onChange={(e) => setFormData((f) => ({ ...f, fornecedor: e.target.value }))}
      />

      <Input
        placeholder="Valor"
        value={formData.valor_documento}
        onChange={(e) => setFormData((f) => ({ ...f, valor_documento: e.target.value }))}
      />

      <Textarea
        placeholder="Descrição"
        value={formData.descricao}
        onChange={(e) => setFormData((f) => ({ ...f, descricao: e.target.value }))}
      />

      <div className="flex gap-2">
        <Button onClick={handleUpload} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin w-4 h-4" /> : <Upload />}
          Enviar
        </Button>

        <Button variant="outline" onClick={handleClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
