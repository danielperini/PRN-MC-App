import React, { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, AlignLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function ReformatarLegendasItem({ onConcluido }) {
  const [running, setRunning] = useState(false);

  async function reformatar(event) {
    event?.preventDefault?.();
    setRunning(true);
    const aviso = toast.loading('Reformatando legendas da galeria...');
    try {
      let skip = 0;
      let total = 0;
      let paginas = 0;
      let hasMore = true;
      while (hasMore && paginas < 60) {
        const res = await base44.functions.invoke('reformatarLegendasGaleria', { skip, limit: 100 });
        const data = res?.data || {};
        total += data.atualizadas || 0;
        hasMore = Boolean(data.has_more);
        skip = data.proximo_skip ?? skip + 100;
        paginas += 1;
        toast.loading(`Reformatando... ${total} atualizadas`, { id: aviso });
      }
      toast.success(`${total} ${total === 1 ? 'legenda reformatada' : 'legendas reformatadas'} com sucesso.`, { id: aviso });
      onConcluido?.();
    } catch (error) {
      toast.error('Erro ao reformatar: ' + (error?.message || 'tente novamente.'), { id: aviso });
    } finally {
      setRunning(false);
    }
  }

  return (
    <DropdownMenuItem
      disabled={running}
      onSelect={reformatar}
      className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
      <span className="font-medium text-gray-900 flex items-center gap-1.5">
        {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <AlignLeft className="h-3.5 w-3.5" />}
        Reformatar legendas (sem IA)
      </span>
      <span className="text-xs text-gray-500 pl-5">
        Padroniza para "Atividade — Museu — Mês/Ano" usando dados dos metadados.
      </span>
    </DropdownMenuItem>
  );
}