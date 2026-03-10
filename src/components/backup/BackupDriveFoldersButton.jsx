import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Cloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BackupDriveFoldersButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleBackup = async () => {
    setIsLoading(true);
    try {
      const response = await base44.functions.invoke('backupDriveFolders', {});
      const count = response.data.totalFilesCopied || 0;
      const msg = count > 0 
        ? `Backup concluído: ${count} arquivo(s) copiado(s)` 
        : 'Backup concluído. Nenhum arquivo para copiar.';
      toast.success(msg);
    } catch (error) {
      toast.error('Erro no backup: ' + (error.message || 'desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleBackup}
      disabled={isLoading}
      className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
      size="sm"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Backup...
        </>
      ) : (
        <>
          <Cloud className="w-4 h-4" />
          Backup Agora
        </>
      )}
    </Button>
  );
}