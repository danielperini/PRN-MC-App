import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, Images, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

function PhotoCard({ photo }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(photo.legenda || photo.caption || '');
  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () =>
      base44.entities.ReportPhoto.update(photo.id, { legenda: draft, caption: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minha-galeria'] });
      setEditing(false);
      toast.success('Legenda salva!');
    },
    onError: () => toast.error('Erro ao salvar legenda.'),
  });

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden flex flex-col group">
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {photo.file_url ? (
          <img
            src={photo.file_url}
            alt={photo.legenda || photo.caption || 'Foto'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <Images className="w-8 h-8" />
          </div>
        )}
      </div>

      <div className="p-2 flex-1 flex flex-col gap-1">
        {/* Metadado: museu + mês */}
        {(photo._museu || photo._mes) && (
          <p className="text-[10px] text-muted-foreground truncate">
            {[photo._museu, photo._mes].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Legenda editável */}
        {editing ? (
          <div className="flex flex-col gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="text-xs h-7 px-2"
              placeholder="Legenda da foto..."
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveMutation.mutate(); if (e.key === 'Escape') setEditing(false); }}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                className="h-6 text-[10px] px-2 flex-1"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setDraft(photo.legenda || photo.caption || ''); setEditing(false); }}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="text-left group/leg flex items-start gap-1 w-full"
            onClick={() => setEditing(true)}
            title="Clique para editar a legenda"
          >
            <span className={`text-xs flex-1 leading-snug ${draft ? 'text-gray-700' : 'text-gray-400 italic'}`}>
              {draft || 'Adicionar legenda...'}
            </span>
            <Pencil className="w-3 h-3 text-gray-300 group-hover/leg:text-gray-500 flex-shrink-0 mt-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MinhaGaleriaTab({ targetEmail }) {
  // 1. Buscar relatórios do usuário
  const { data: relatorios = [], isLoading: loadingRels } = useQuery({
    queryKey: ['user-reports-galeria', targetEmail],
    queryFn: () => base44.entities.Report.filter({ created_by: targetEmail }, '-created_date', 100),
    enabled: !!targetEmail,
    staleTime: 120000,
  });

  // Mapa de relatório por id para metadados
  const relMap = React.useMemo(() => {
    const m = {};
    for (const r of relatorios) m[r.id] = r;
    return m;
  }, [relatorios]);

  // 2. Buscar fotos
  const relIds = relatorios.map((r) => r.id);
  const { data: rawPhotos = [], isLoading: loadingPhotos } = useQuery({
    queryKey: ['minha-galeria', targetEmail, relIds.join(',')],
    queryFn: async () => {
      if (!relIds.length) return [];
      // SDK não suporta $in nativo em todos os casos — busca em lotes de 10
      const chunks = [];
      for (let i = 0; i < relIds.length; i += 10) chunks.push(relIds.slice(i, i + 10));
      const results = await Promise.all(
        chunks.map((chunk) =>
          base44.entities.ReportPhoto.filter(
            { report_id: chunk[0] }, // filtro por id individual, depois mesclamos
            '-created_date', 500
          ).catch(() => [])
        )
      );
      // Mais simples: busca todas as fotos do usuário via created_by
      return base44.entities.ReportPhoto.filter({ created_by: targetEmail }, '-created_date', 300).catch(() => []);
    },
    enabled: !!targetEmail,
    staleTime: 60000,
  });

  const photos = React.useMemo(() => {
    return rawPhotos
      .filter((p) => p.file_url)
      .map((p) => ({
        ...p,
        _museu: relMap[p.report_id]?.museu || p.museu || '',
        _mes: relMap[p.report_id]?.mes_referencia
          ? `${relMap[p.report_id].mes_referencia} ${relMap[p.report_id].ano || ''}`.trim()
          : '',
      }));
  }, [rawPhotos, relMap]);

  const loading = loadingRels || loadingPhotos;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Carregando galeria...
      </div>
    );
  }

  if (!photos.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <Images className="w-10 h-10 opacity-30" />
        <p className="text-sm">Nenhuma foto encontrada nos seus relatórios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{photos.length} foto{photos.length !== 1 ? 's' : ''} — clique na legenda para editar</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} />
        ))}
      </div>
    </div>
  );
}