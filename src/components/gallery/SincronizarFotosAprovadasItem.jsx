import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, CheckCircle2, Images } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

/**
 * Item de menu administrativo que sincroniza fotos de relatórios aprovados
 * na galeria central (ReportPhoto), reutilizando a função backend
 * `publicarFotosRelatorioAprovado`. Carrega o contador de relatórios APPROVED
 * sem ReportPhoto correspondente ao montar a página.
 */
export default function SincronizarFotosAprovadasItem({ onConcluido }) {
  const [sincronizando, setSincronizando] = useState(false);

  const { data: pendentes = 0, isLoading, refetch } = useQuery({
    queryKey: ['relatorios-aprovados-sem-galeria'],
    queryFn: async () => {
      try {
        const reports = await base44.entities.Report.filter({ status: 'APPROVED' }, '-updated_date', 100);
        if (!Array.isArray(reports) || reports.length === 0) return 0;
        const photos = await base44.entities.ReportPhoto.list('-updated_date', 500);
        const comPhoto = new Set((photos || []).map((p) => p.report_id).filter(Boolean));
        return reports.filter((r) => !comPhoto.has(r.id)).length;
      } catch {
        return 0;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const handleSync = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const res = await base44.functions.invoke('publicarFotosRelatorioAprovado', {});
      const data = res?.data || {};
      const criadas = Number(data.fotos_criadas || 0);
      const atualizadas = Number(data.fotos_atualizadas || 0);
      const erros = Array.isArray(data.erros) ? data.erros : [];

      if (erros.length > 0 && criadas === 0 && atualizadas === 0) {
        toast.error('Sincronização falhou. Verifique os logs do sistema.');
      } else if (criadas === 0 && atualizadas === 0) {
        toast.info('Nenhuma foto nova para sincronizar — todos os relatórios aprovados já estão na galeria.');
      } else {
        const partes = [];
        if (criadas > 0) partes.push(`${criadas} ${criadas === 1 ? 'foto criada' : 'fotos criadas'}`);
        if (atualizadas > 0) partes.push(`${atualizadas} ${atualizadas === 1 ? 'atualizada' : 'atualizadas'}`);
        toast.success(`Galeria sincronizada — ${partes.join(' · ')}.`);
      }

      await refetch();
      onConcluido?.();
    } catch (e) {
      toast.error('Erro ao sincronizar fotos: ' + (e?.message || 'tente novamente.'));
    } finally {
      setSincronizando(false);
    }
  }, [sincronizando, refetch, onConcluido]);

  const desabilitado = sincronizando || isLoading;
  const subtexto = sincronizando
    ? 'Sincronizando fotos na galeria...'
    : pendentes > 0
      ? `${pendentes} ${pendentes === 1 ? 'relatório aprovado sem' : 'relatórios aprovados sem'} fotos na galeria.`
      : 'Todos os relatórios aprovados já têm fotos sincronizadas.';

  return (
    <DropdownMenuItem
      disabled={desabilitado}
      onSelect={handleSync}
      className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
    >
      <span className="font-medium text-gray-900 flex items-center gap-1.5">
        {sincronizando
          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          : <CheckCircle2 className="h-3.5 w-3.5" />}
        Sincronizar fotos de relatórios aprovados
        {!sincronizando && pendentes > 0 && (
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
            {pendentes}
          </span>
        )}
      </span>
      <span className="text-xs text-gray-500 pl-5 flex items-center gap-1">
        <Images className="h-3 w-3 opacity-60" />
        {subtexto}
      </span>
    </DropdownMenuItem>
  );
}