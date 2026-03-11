import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '@/components/common/ConfirmDialog';

export default function GastoNFUploader({ gastoId, fornecedorNome, isOpen, onClose, onSuccess }) {
  const [mes, setMes] = useState(new Date().toISOString().substring(0, 7));
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const queryClient = useQueryClient();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error('Arquivo muito grande (máx 10MB)');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = () => {
    if (!file || !mes) {
      toast.error('Selecione o arquivo e o mês');
      return;
    }
    setShowConfirm(true);
  };

  const confirmUpload = async () => {
    setUploading(true);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      
      // Atualizar gasto com URL da NF
      const nfUrl = uploadRes.file_url;
      await base44.entities.GastoRubrica.update(gastoId, {
        nf_url: nfUrl,
        nf_mes: mes,
        nf_nome: file.name,
        status: 'pago',
      });

      toast.success(`Nota fiscal de ${mes} anexada com sucesso!`);
      queryClient.invalidateQueries(['gastos-rubrica']);
      setShowConfirm(false);
      setFile(null);
      setMes(new Date().toISOString().substring(0, 7));
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error('Erro ao anexar NF: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anexar Nota Fiscal - {fornecedorNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Mês da NF *</label>
            <Input
              type="month"
              value={mes}
              onChange={e => setMes(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Arquivo PDF/Imagem *</label>
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {file ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-700 font-medium">{file.name}</span>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-5 h-5 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-600">Clique para selecionar arquivo</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancelar</Button>
          <Button className="bg-black text-white" onClick={handleSubmit} disabled={uploading || !file}>
            <Upload className="w-4 h-4 mr-2" />{uploading ? 'Enviando...' : 'Anexar NF'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirmar anexação"
        description={`Anexar ${file?.name} como NF de ${mes}?`}
        confirmText="Anexar"
        onConfirm={confirmUpload}
        onCancel={() => setShowConfirm(false)}
        isLoading={uploading}
      />
    </Dialog>
  );
}