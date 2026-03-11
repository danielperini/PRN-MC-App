import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Upload, Loader2, CheckCircle, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function PurchaseDocumentUpload({ 
  documents = [], 
  onDocumentsChange,
  type = 'orcamento' // 'orcamento' | 'nota_fiscal'
}) {
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const TIPOS = {
    orcamento: {
      label: 'Orçamento',
      icon: '📋',
      accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx',
      maxSize: 5 * 1024 * 1024, // 5MB
      description: 'PDF ou imagem do orçamento do fornecedor'
    },
    nota_fiscal: {
      label: 'Nota Fiscal',
      icon: '🧾',
      accept: '.pdf,.jpg,.jpeg,.png',
      maxSize: 5 * 1024 * 1024, // 5MB
      description: 'PDF ou imagem da nota fiscal'
    }
  };

  const tipoConfig = TIPOS[type];

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamanho
    if (file.size > tipoConfig.maxSize) {
      toast.error(`Arquivo muito grande. Máximo: ${tipoConfig.maxSize / 1024 / 1024}MB`);
      setFileInputKey(prev => prev + 1);
      return;
    }

    setUploading(true);
    try {
      // Upload para servidor
      const uploadRes = await base44.integrations.Core.UploadFile({
        file: file
      });

      if (uploadRes.data?.file_url) {
        const newDoc = {
          id: Date.now(),
          name: file.name,
          url: uploadRes.data.file_url,
          uploadedAt: new Date().toISOString(),
          type: file.type
        };

        onDocumentsChange([...documents, newDoc]);
        toast.success(`${tipoConfig.label} enviado com sucesso! ✅`);
        setFileInputKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Erro ao upload:', error);
      toast.error(`Erro ao enviar ${tipoConfig.label.toLowerCase()}: ${error.message}`);
      setFileInputKey(prev => prev + 1);
    }
    setUploading(false);
  };

  const removeDocument = (docId) => {
    onDocumentsChange(documents.filter(d => d.id !== docId));
    toast.success('Arquivo removido');
  };

  return (
    <div className="space-y-3">
      {/* Lista de documentos */}
      {documents.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {documents.map((doc) => (
            <div 
              key={doc.id} 
              className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
            >
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <a 
                  href={doc.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-green-700 hover:text-green-900 underline truncate"
                  title={doc.name}
                >
                  {doc.name}
                </a>
                <p className="text-xs text-green-600 mt-0.5">
                  {new Date(doc.uploadedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDocument(doc.id)}
                className="h-8 w-8 flex-shrink-0 text-green-700 hover:bg-green-100"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 text-center hover:border-gray-400 transition">
        <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-700">
            {tipoConfig.icon} {tipoConfig.label}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">{tipoConfig.description}</p>
        </div>
        <Input 
          key={fileInputKey}
          type="file" 
          accept={tipoConfig.accept}
          onChange={handleFileUpload}
          disabled={uploading}
          className="text-xs cursor-pointer"
        />
        {uploading && (
          <div className="flex items-center justify-center gap-2 text-xs text-gray-600 mt-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Enviando...
          </div>
        )}
      </div>

      {/* Info */}
      <p className="text-xs text-gray-500 flex items-start gap-1">
        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
        Máximo: {tipoConfig.maxSize / 1024 / 1024}MB por arquivo
      </p>
    </div>
  );
}