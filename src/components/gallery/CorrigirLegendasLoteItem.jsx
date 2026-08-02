import React, { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, AlignLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function CorrigirLegendasLoteItem({ onConcluido }) {
  const [running, setRunning] = useState(false);

  async function executar(event) {
    event?.preventDefault?.();
    setRunning(true);
    const toastId = toast.loading('Iniciando correção de legendas...');
    try {
      let skip = 0;
      let totalAtualizadas = 0;
      let lote = 0;
      let hasMore = true;
      const LIMIT = 100;
      const MAX_LOTES = 100; // até 10.000 fotos

      while (hasMore && lote < MAX_LOTES) {
        const res = await base44.functions.invoke('reformatarLegendasGaleria', {
          skip,
          limit: LIMIT,
          dry_run: false,
        });
        const data = res?.data || {};

        totalAtualizadas += data.atualizadas || 0;
        hasMore = Boolean(data.has_more);
        skip = data.proximo_skip ?? skip + LIMIT;
        lote++;

        toast.loading(
          `Lote ${lote} — ${totalAtualizadas} legendas atualizadas`,
          { id: toastId }
        );
      }

      toast.success(
        `${totalAtualizadas} ${totalAtualizadas === 1 ? 'legenda atualizada' : 'legendas atualizadas'} no padrão Atividade — Museu — Mês/Ano.`,
        { id: toastId }
      );
      onConcluido?.();
    } catch (error) {
      toast.error(
        'Erro ao corrigir legendas: ' + (error?.message || 'tente novamente.'),
        { id: toastId }
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <DropdownMenuItem
      disabled={running}
      onSelect={executar}
      className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
    >
      <span className="font-medium text-gray-900 flex items-center gap-1.5">
        {running
          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          : <AlignLeft className="h-3.5 w-3.5" />}
        Corrigir legendas em lote
      </span>
      <span className="text-xs text-gray-500 pl-5">
        Aplica o padrão "Atividade — Museu — Mês/Ano" em todas as fotos usando apenas os metadados salvos.
      </span>
    </DropdownMenuItem>
  );
}