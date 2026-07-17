import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Images, X, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Galeria de fotos vinculadas a um RelatorioExecucaoObjeto.
 * Fontes: anexos_evidencias do próprio relatório + ReportPhoto do período + Attachment das atividades.
 */
export default function GaleriaDocumentosDrive({ relatorio }) {
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // índice da foto aberta

  useEffect(() => {
    if (!relatorio) return;
    carregarFotos();
  }, [relatorio?.id]);

  async function carregarFotos() {
    setLoading(true);
    try {
      const todas = [];

      // 1. Fotos já salvas diretamente no relatório (anexos_evidencias)
      const evidencias = Array.isArray(relatorio.anexos_evidencias) ? relatorio.anexos_evidencias : [];
      for (const ev of evidencias) {
        if (ev.foto_url) {
          todas.push({
            url: ev.foto_url,
            legenda: ev.legenda_editada || ev.legenda_ia || ev.atividade_nome || '',
            meta: ev.meta_nome || '',
            data: ev.atividade_data || '',
            local: ev.local || '',
            fonte: 'evidencia',
          });
        }
      }

      // 2. ReportPhoto vinculadas ao período do relatório
      if (relatorio.data_inicio && relatorio.data_fim) {
        try {
          const ano = new Date(relatorio.data_inicio).getFullYear();
          const mesInicio = new Date(relatorio.data_inicio).getMonth() + 1;
          const mesFim = new Date(relatorio.data_fim).getMonth() + 1;

          // Busca por ano (filtragem posterior por mês)
          const reportPhotos = await base44.entities.ReportPhoto.filter(
            { ano, galeria_oculta: false },
            '-created_date',
            200
          ).catch(() => []);

          for (const rp of (reportPhotos || [])) {
            if (!rp.file_url) continue;
            // Filtrar pelo período quando possível
            const rpMes = rp.mes_referencia
              ? new Date(`${ano}-${String(rp.mes_referencia).padStart(2, '0')}-01`).getMonth() + 1
              : null;
            if (rpMes !== null && (rpMes < mesInicio || rpMes > mesFim)) continue;

            todas.push({
              url: rp.file_url,
              legenda: rp.caption || rp.legenda || rp.file_name || '',
              meta: '',
              data: '',
              local: rp.museu || '',
              fonte: 'report_photo',
              id: rp.id,
            });
          }
        } catch (_) {}
      }

      // Deduplicar por URL
      const vistas = new Set();
      const unicas = todas.filter(f => {
        if (vistas.has(f.url)) return false;
        vistas.add(f.url);
        return true;
      });

      setFotos(unicas);
    } catch (_) {
      setFotos([]);
    } finally {
      setLoading(false);
    }
  }

  function abrirLightbox(idx) { setLightbox(idx); }
  function fecharLightbox() { setLightbox(null); }
  function anterior() { setLightbox(i => (i > 0 ? i - 1 : fotos.length - 1)); }
  function proximo() { setLightbox(i => (i < fotos.length - 1 ? i + 1 : 0)); }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando galeria de fotos...
      </div>
    );
  }

  if (fotos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
        <Images className="w-8 h-8 text-slate-300" />
        <p className="text-sm">Nenhuma foto encontrada para este período.</p>
      </div>
    );
  }

  const fotoAtual = lightbox !== null ? fotos[lightbox] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Images className="w-3.5 h-3.5" />
          Galeria de Fotos ({fotos.length})
        </p>
      </div>

      {/* Grid de miniaturas */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {fotos.map((foto, idx) => (
          <button
            key={foto.url + idx}
            type="button"
            onClick={() => abrirLightbox(idx)}
            className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 hover:border-slate-400 transition-all hover:shadow-md"
          >
            <img
              src={foto.url}
              alt={foto.legenda || 'Foto da atividade'}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              onError={e => { e.currentTarget.style.opacity = '0.2'; }}
            />
            {foto.legenda && (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-white line-clamp-1">{foto.legenda}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      <Dialog open={fotoAtual !== null} onOpenChange={open => !open && fecharLightbox()}>
        <DialogContent className="max-w-4xl p-0 border-0 bg-black overflow-hidden">
          {fotoAtual && (
            <div className="relative">
              {/* Fechar */}
              <button
                type="button"
                onClick={fecharLightbox}
                className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-2 text-white hover:bg-black"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Anterior / Próximo */}
              {fotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={anterior}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/60 p-2 text-white hover:bg-black"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={proximo}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/60 p-2 text-white hover:bg-black"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              <img
                src={fotoAtual.url}
                alt={fotoAtual.legenda || 'Foto'}
                className="max-h-[72vh] w-full object-contain"
              />

              <div className="bg-black/85 px-5 py-4 space-y-1">
                {fotoAtual.legenda && (
                  <p className="text-sm font-semibold text-white">{fotoAtual.legenda}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-white/60">
                  {fotoAtual.meta && <span>📌 {fotoAtual.meta}</span>}
                  {fotoAtual.local && <span>🏛 {fotoAtual.local}</span>}
                  {fotoAtual.data && <span>📅 {fotoAtual.data}</span>}
                  <span className="text-white/40">{lightbox + 1} / {fotos.length}</span>
                </div>
                <a
                  href={fotoAtual.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Abrir original
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}