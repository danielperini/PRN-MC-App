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
    const aviso = toast.loading('Corrigindo legendas de toda a galeria...');
    try {
      let skip = 0;
      let total = 0;
      let paginas = 0;
      let hasMore = true;
      while (hasMore && paginas < 40) {
        const res = await base44.functions.invoke('reforcarLegendasGaleria', { skip, limit: 200 });
        const data = res?.data || {};
        total += data.atualizadas || 0;
        hasMore = Boolean(data.has_more);
        skip = data.proximo_skip ?? skip + 200;
        paginas += 1;
        toast.loading(`Corrigindo legendas... ${total} atualizadas`, { id: aviso });
      }
      toast.success(`${total} ${total === 1 ? 'legenda persistida' : 'legendas persistidas'} com dados reais.`, { id: aviso });
      onConcluido?.();
    } catch (error) {
      toast.error('Não foi possível corrigir as legendas: ' + (error?.message || 'tente novamente.'), { id: aviso });
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
        Corrigir legendas de toda a galeria
      </span>
      <span className="text-xs text-gray-500 pl-5">
        Substitui legendas genéricas pelos dados reais da atividade, museu e data.
      </span>
    </DropdownMenuItem>
  );
}