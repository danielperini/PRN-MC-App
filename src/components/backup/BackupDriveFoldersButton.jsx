import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cloud, Loader2, CheckCircle2, AlertCircle, FolderOpen, Files } from 'lucide-react';
import { toast } from 'sonner';

export default function BackupDriveFoldersButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const handleBackup = async () => {
    setIsLoading(true);
    setResult(null);
    try {
      const response = await base44.functions.invoke('backupDriveFolders', {});
      const count = response.data?.totalFilesCopied || 0;
      setResult({ success: true, count, data: response.data });
      setShowResult(true);
      toast.success(count > 0 ? `Backup concluído: ${count} arquivo(s) copiado(s)` : 'Backup concluído. Nenhum arquivo novo.');
    } catch (error) {
      const msg = error.message || 'Erro desconhecido';
      setResult({ success: false, message: msg });
      setShowResult(true);
      toast.error('Erro no backup: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleBackup}
        disabled={isLoading}
        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
        size="sm"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Fazendo backup...
          </>
        ) : (
          <>
            <Cloud className="w-4 h-4" />
            Backup Drive
          </>
        )}
      </Button>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Cloud className="w-5 h-5 text-blue-600" />
              Resultado do Backup
            </DialogTitle>
          </DialogHeader>

          {result?.success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-900 text-sm">Backup realizado com sucesso!</p>
                  <p className="text-xs text-green-700 mt-1">
                    {result.count > 0
                      ? `${result.count} arquivo(s) copiado(s) para o Google Drive.`
                      : 'Nenhum arquivo novo para copiar. Drive já atualizado.'}
                  </p>
                </div>
              </div>

              {result.data?.backupFolderName && (
                <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>Pasta: <strong className="text-gray-800">{result.data.backupFolderName}</strong></span>
                </div>
              )}

              {result.count > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <Files className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span><strong className="text-gray-800">{result.count}</strong> arquivo(s) sincronizado(s)</span>
                </div>
              )}

              <Button onClick={() => setShowResult(false)} className="w-full bg-black hover:bg-gray-800 text-white">
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-900 text-sm">Erro ao realizar backup</p>
                  <p className="text-xs text-red-700 mt-1 break-words">{result?.message}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowResult(false)} className="flex-1">
                  Fechar
                </Button>
                <Button
                  onClick={() => { setShowResult(false); setTimeout(handleBackup, 100); }}
                  className="flex-1 bg-black hover:bg-gray-800 text-white"
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}