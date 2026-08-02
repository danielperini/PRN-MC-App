import React, { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function CorrigirLegendasLoteItem({ onConcluido }) {
  const [running, setRunning] = useState(false);

  async function corrigir(event) {
    event?.preventDefault?.();
    setRunning(true);
    try {
      const res = await base44.functions.invoke('reforcarLegendasGaleria', { limit: 500 });
      const total = res?.data?.atualizadas ?? 0;
      toast.success(`${total} ${total === 1 ? 'legenda corrigida' : 'legendas corrigidas'} com dados reais.`);
      onConcluido?.();
    } catch (error) {
      toast.error('Não foi possível corrigir as legendas: ' + (error?.message || 'tente novamente.'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <DropdownMenuItem
      disabled={running}
      onSelect={corrigir}
      className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
      <span className="font-medium text-gray-900 flex items-center gap-1.5">
        {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Corrigir legendas em lote
      </span>
      <span className="text-xs text-gray-500 pl-5">
        Substitui legendas genéricas pelos dados reais da atividade, museu e data.
      </span>
    </DropdownMenuItem>
  );
}