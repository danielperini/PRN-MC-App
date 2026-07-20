import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Sparkles, Check, AlertTriangle, FileDown } from 'lucide-react';
import { detectarDuplicatas, sugerirManter, isLegendaGenerica } from './deduplicarFotosGaleria';

export default function RevisaoAntesExportar({
  fotos,
  onLegendasAtualizadas,
  onRemoverFotos,
  onGerarPDF,
  loading,
}) {
  const [aba, setAba] = useState('duplicatas');
  const [legendasLocais, setLegendasLocais] = useState(() => {
    const m = {};
    fotos.forEach((f) => { m[f.id || f.fileUrl] = f.legenda || f.caption || ''; });
    return m;
  });

  const gruposDuplicatas = useMemo(() => detectarDuplicatas(fotos), [fotos]);
  const idsRemoverInicial = useMemo(() => {
    const set = new Set();
    gruposDuplicatas.forEach((g) => {
      const manter = sugerirManter(g);
      g.fotos.forEach((f) => {
        if (manter && (f.id || f.fileUrl) !== (manter.id || manter.fileUrl)) {
          set.add(f.id || f.fileUrl);
        }
      });
    });
    return set;
  }, [gruposDuplicatas]);

  const [removidos, setRemovidos] = useState(() => new Set(idsRemoverInicial));

  const fotosSemLegenda = useMemo(
    () => fotos.filter((f) => isLegendaGenerica(f.legenda || f.caption)),
    [fotos]
  );

  const fotosFinais = useMemo(
    () => fotos.filter((f) => !removidos.has(f.id || f.fileUrl)),
    [fotos, removidos]
  );

  function toggleRemover(id) {
    setRemovidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function atualizarLegenda(id, valor) {
    setLegendasLocais((prev) => ({ ...prev, [id]: valor }));
    onLegendasAtualizadas?.({ id, legenda: valor });
  }

  const legendasRevisadasIA = fotos.filter((f) => {
    const original = isLegendaGenerica(f.legenda || f.caption);
    const atual = legendasLocais[f.id || f.fileUrl] || '';
    return original && atual && !isLegendaGenerica(atual);
  }).length;

  const tabs = [
    { id: 'duplicatas', label: `Duplicatas (${gruposDuplicatas.length})`, icon: Copy },
    { id: 'legendas', label: `Legendas (${fotosSemLegenda.length})`, icon: Sparkles },
    { id: 'gerar', label: 'Gerar PDF', icon: FileDown },
  ];

  function irParaGerar() { setAba('gerar'); }

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAba(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              aba === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Aba: Duplicatas */}
      {aba === 'duplicatas' && (
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {gruposDuplicatas.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
              <Check className="h-8 w-8 text-green-500" />
              <p className="text-xs">Nenhuma duplicata encontrada.</p>
            </div>
          ) : (
            gruposDuplicatas.map((g, idx) => {
              const manter = sugerirManter(g);
              return (
                <div key={idx} className="rounded-xl border border-border p-2 bg-muted/30">
                  <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">
                    Grupo {idx + 1} · {g.tipo}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {g.fotos.map((f) => {
                      const fid = f.id || f.fileUrl;
                      const isManter = manter && (f.id || f.fileUrl) === (manter.id || manter.fileUrl);
                      const isRemovido = removidos.has(fid);
                      return (
                        <div
                          key={fid}
                          className={`relative w-[60px] h-[60px] rounded-lg overflow-hidden border-2 ${
                            isRemovido ? 'border-red-400 opacity-50' : isManter ? 'border-green-500' : 'border-border'
                          }`}
                        >
                          <img
                            src={f.fileUrl}
                            alt={f.fileName || ''}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          {isManter && (
                            <span className="absolute top-0 left-0 bg-green-600 text-white text-[8px] px-1 rounded-br">
                              manter
                            </span>
                          )}
                          {!isManter && (
                            <button
                              type="button"
                              onClick={() => toggleRemover(fid)}
                              className="absolute bottom-0 right-0 bg-red-600 text-white p-1 rounded-tl"
                              title={isRemovido ? 'Reverter' : 'Remover do PDF'}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          <Button onClick={irParaGerar} variant="outline" className="w-full gap-1.5 mt-2" size="sm">
            Continuar para geração do PDF →
          </Button>
        </div>
      )}

      {/* Aba: Legendas */}
      {aba === 'legendas' && (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {fotosSemLegenda.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
              <Check className="h-8 w-8 text-green-500" />
              <p className="text-xs">Todas as fotos possuem legenda.</p>
            </div>
          ) : (
            fotosSemLegenda.map((f) => {
              const fid = f.id || f.fileUrl;
              const original = f.legenda || f.caption || '';
              const atual = legendasLocais[fid] || '';
              const revisada = atual && !isLegendaGenerica(atual) && atual !== original;
              return (
                <div key={fid} className="rounded-xl border border-border p-2 space-y-1.5">
                  <div className="flex gap-2 items-start">
                    <img
                      src={f.fileUrl}
                      alt={f.fileName || ''}
                      className="w-12 h-12 rounded object-cover shrink-0"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      {original && (
                        <p className="text-[10px] text-muted-foreground line-through truncate">
                          {original}
                        </p>
                      )}
                      <Input
                        value={atual}
                        onChange={(e) => atualizarLegenda(fid, e.target.value)}
                        placeholder="Legenda sugerida pela IA..."
                        className={`h-7 text-xs ${revisada ? 'border-green-400 text-green-700' : ''}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <Button onClick={irParaGerar} variant="outline" className="w-full gap-1.5 mt-2" size="sm">
            Continuar para geração do PDF →
          </Button>
        </div>
      )}

      {/* Aba: Gerar PDF */}
      {aba === 'gerar' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total de fotos carregadas</span>
              <strong>{fotos.length}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duplicatas detectadas</span>
              <strong className={gruposDuplicatas.length > 0 ? 'text-amber-600' : 'text-green-600'}>
                {gruposDuplicatas.length}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fotos a remover</span>
              <strong className={removidos.size > 0 ? 'text-red-600' : 'text-green-600'}>
                {removidos.size}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Legendas revisadas por IA</span>
              <strong className="text-green-600">{legendasRevisadasIA}</strong>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 mt-1">
              <span className="text-muted-foreground">Fotos no PDF final</span>
              <strong className="text-primary">{fotosFinais.length}</strong>
            </div>
          </div>

          {removidos.size === 0 && gruposDuplicatas.length > 0 && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Foram detectadas duplicatas mas nenhuma foi marcada para remoção. Volte à aba "Duplicatas" para revisar.</span>
            </div>
          )}

          <Button
            onClick={() => onGerarPDF(fotosFinais)}
            disabled={loading || fotosFinais.length === 0}
            className="w-full gap-2"
          >
            <FileDown className="h-4 w-4" />
            {loading ? 'Gerando PDF...' : `Gerar PDF com ${fotosFinais.length} foto(s)`}
          </Button>
        </div>
      )}
    </div>
  );
}