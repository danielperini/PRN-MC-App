import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Calendar, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

export default function BackupMonthlyDialog({ isOpen, onClose }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleBackup = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await base44.functions.invoke('backupMonthlyReports', {});
      
      if (response.data.success) {
        setResult({
          success: true,
          message: `Backup criado: ${response.data.backupFolderName}`,
          reportsFound: response.data.reportsFound,
          filesCopied: response.data.totalFilesCopied,
          folderId: response.data.backupFolderId
        });
        toast.success('Backup de relatórios realizado com sucesso!');
      } else {
        setResult({
          success: false,
          message: response.data.message || 'Erro ao criar backup'
        });
        toast.error('Erro ao criar backup de relatórios');
      }
    } catch (error) {
      setResult({
        success: false,
        message: error.message
      });
      toast.error('Erro ao criar backup: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Backup de Relatórios do Mês
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">
                Criar backup dos relatórios do mês atual em uma pasta datada no Google Drive com todos os anexos.
              </p>

              <Button
                onClick={handleBackup}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isLoading ? 'Criando backup...' : 'Iniciar Backup'}
              </Button>
            </>
          ) : result.success ? (
            <div className="space-y-3">
              <div className="flex gap-2 items-start p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">{result.message}</p>
                  <p className="text-xs text-green-700 mt-1">
                    {result.reportsFound} relatórios encontrados
                  </p>
                  <p className="text-xs text-green-700">
                    {result.filesCopied} arquivos copiados
                  </p>
                </div>
              </div>

              <Button
                onClick={onClose}
                className="w-full"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2 items-start p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-900">{result.message}</p>
              </div>

              <Button
                onClick={() => {
                  setResult(null);
                  handleBackup();
                }}
                variant="outline"
                className="w-full"
              >
                Tentar Novamente
              </Button>

              <Button
                onClick={onClose}
                variant="ghost"
                className="w-full"
              >
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}