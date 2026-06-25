import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { RotateCw } from 'lucide-react';

/**
 * Componente para reenviar lote de notificações
 * 
 * Uso:
 * <ResendNotificationBatch batchSlot="manha" onSuccess={handleSuccess} />
 */
export default function ResendNotificationBatch({ batchSlot = 'manha', onSuccess }) {
  const [reenviando, setReenviando] = useState(false);

  async function handleReenviar() {
    if (!window.confirm(`Reenviar o último lote de ${batchSlot === 'manha' ? 'manhã' : 'tarde'}? Isso criará novos registros na fila para o próximo horário disponível.`)) {
      return;
    }

    setReenviando(true);

    try {
      const res = await base44.functions.invoke('reenviarLoteNotificacoes', {
        batchSlot,
      });

      const result = res?.data || res;

      if (result?.success) {
        toast.success(result.message || 'Lote reenviado com sucesso!');
        onSuccess?.(result);
      } else {
        toast.error(result?.error || 'Erro ao reenviar lote.');
      }
    } catch (error) {
      toast.error('Erro ao reenviar: ' + (error?.message || 'desconhecido'));
    } finally {
      setReenviando(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReenviar}
      disabled={reenviando}
      className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
    >
      <RotateCw className={`h-4 w-4 ${reenviando ? 'animate-spin' : ''}`} />
      {reenviando ? 'Reenviando...' : `Reenviar Lote ${batchSlot === 'manha' ? 'Manhã' : 'Tarde'}`}
    </Button>
  );
}