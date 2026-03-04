import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Cloud, Check, AlertCircle, Loader } from 'lucide-react';
import { toast } from 'sonner';

export default function BackupButton() {
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('backupToGoogleDrive', {});

      if (response.data.success) {
        setLastBackup(response.data.backup_file.timestamp);
        toast.success('✓ Backup realizado com sucesso!', {
          description: `${response.data.backup_file.statistics.total_reports} relatórios salvos no Google Drive`
        });
      } else {
        toast.error('Erro ao fazer backup', {
          description: response.data.error
        });
      }
    } catch (error) {
      toast.error('Erro ao fazer backup', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleBackup}
        disabled={loading}
        variant="outline"
        className="gap-2 w-full"
      >
        {loading ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Fazendo backup...
          </>
        ) : (
          <>
            <Cloud className="w-4 h-4" />
            Backup no Google Drive
          </>
        )}
      </Button>

      {lastBackup && (
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <Check className="w-3 h-3 text-green-600" />
          Último backup: {new Date(lastBackup).toLocaleString('pt-BR')}
        </div>
      )}
    </div>
  );
}