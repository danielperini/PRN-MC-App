import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Cloud, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BackupDriveFoldersButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleBackup = async () => {
    setIsLoading(true);
    try {
      const response = await base44.functions.invoke('backupDriveFolders', {});
      toast.success(`Backup realizado! ${response.data.totalFilesCopied} arquivos copiados.`);
    } catch (error) {
      toast.error('Erro ao fazer backup: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleBackup}
      disabled={isLoading}
      className="gap-2 bg-blue-600 hover:bg-blue-700"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Fazendo backup...
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