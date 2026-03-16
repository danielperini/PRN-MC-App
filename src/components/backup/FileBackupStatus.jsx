import React, { useState } from 'react';
import { CheckCircle2, CloudOff, Loader2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function FileBackupStatus({ attachment, onBackupDone }) {
  const [loading, setLoading] = useState(false);

  const isDone = attachment?.backup_done && attachment?.drive_file_id;

  const handleBackup = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await base44.functions.invoke('backupSingleFile', { attachment_id: attachment.id });
      if (res.data?.skipped) {
        toast.info('Backup já havia sido realizado');
      } else if (res.data?.success) {
        toast.success('Backup realizado com sucesso!');
        onBackupDone?.({ drive_file_id: res.data.drive_file_id, backup_date: res.data.backup_date });
      } else {
        throw new Error(res.data?.error || 'Erro desconhecido');
      }
    } catch (err) {
      toast.error('Erro no backup: ' + (err.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  if (isDone) {
    return (
      <span
        title={`Backup realizado em ${attachment.backup_date ? new Date(attachment.backup_date).toLocaleString('pt-BR') : 'data desconhecida'}`}
        className="inline-flex items-center gap-1 text-xs text-green-600 font-medium"
      >
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        No Drive
      </span>
    );
  }

  return (
    <button
      onClick={handleBackup}
      disabled={loading}
      title="Fazer backup no Google Drive"
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <CloudOff className="w-4 h-4" />
      )}
      {loading ? 'Enviando...' : 'Sem backup'}
    </button>
  );
}