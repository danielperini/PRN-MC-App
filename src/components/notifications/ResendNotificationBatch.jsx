import React, { useRef, useState } from 'react';
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
  const requestId = useRef(null);

  async function handleReenviar() {
    const confirmation = batchSlot === 'agora'
      ? 'Enviar agora um único compilado por e-mail com todas as solicitações aprovadas ainda não pagas? Os destinatários são notasfiscais, Daniel Perini e administração.'
      : `Reenviar o último lote de ${batchSlot === 'manha' ? 'manhã' : 'tarde'}?`;
    if (!window.confirm(confirmation)) {
      return;
    }

    setReenviando(true);

    try {
      if (batchSlot === 'agora' && !requestId.current) requestId.current = crypto.randomUUID();
      const res = await base44.functions.invoke('reenviarLoteNotificacoes', {
        batchSlot,
        ...(batchSlot === 'agora' ? { requestId: requestId.current } : {}),
      });

      const result = res?.data || res;

      if (result?.success) {
        toast.success(result.message || 'Lote reenviado com sucesso!');
        requestId.current = null;
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
      {reenviando ? 'Reenviando...' : `Reenviar Lote ${batchSlot === 'agora' ? 'Agora' : (batchSlot === 'manha' ? 'Manhã' : 'Tarde')}`}
    </Button>
  );
}
