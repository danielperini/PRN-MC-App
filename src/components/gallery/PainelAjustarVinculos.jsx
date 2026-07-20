import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';

/**
 * Painel que lista todas as fotos identificadas como duplicatas,
 * permitindo ao coordenador revisar e confirmar exclusão permanente
 * das duplicatas do banco (ReportPhoto e Attachment) em lote.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - duplicates: array de { kept, removed, layer, reason }
 *  - onConcluido: () => void (após exclusão em lote)
 */
export default function PainelAjustarVinculos({ open, onClose, duplicates = [], onConcluido }) {
  const [selecionados, setSelecionados] = useState(new Set());
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);

  React.useEffect(() => {
    if (open) {
      setSelecionados(new Set());
      setResultado(null);
      setProcessando(false);
    }
  }, [open]);

  const toggleSelecionar = (idx) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selecionarTodos = () => {
    setSelecionados(new Set(duplicates.map((_, i) => i)));
  };

  const limparSelecao = () => {
    setSelecionados(new Set());
  };

  const excluirSelecionados = async () => {
    setProcessando(true);
    setResultado(null);
    const paraExcluir = duplicates
      .filter((_, i) => selecionados.has(i))
      .map((d) => d.removed)
      .filter(Boolean);

    let excluidas = 0;
    let erros = 0;
    const errosDetalhe = [];

    for (const foto of paraExcluir) {
      try {
        const entity = foto.sourceEntity === 'ReportPhoto' ? 'ReportPhoto' : foto.sourceEntity === 'Attachment' ? 'Attachment' : null;
        if (!entity || !foto.sourceId) {
          erros++;
          errosDetalhe.push(`Sem ID/entidade: ${foto.fileName || foto.fileUrl || 'desconhecido'}`);
          continue;
        }
        await base44.entities[entity].delete(foto.sourceId);
        excluidas++;
      } catch (error) {
        erros++;
        errosDetalhe.push(`${foto.fileName || 'foto'}: ${error?.message || 'erro'}`);
      }
    }

    setProcessando(false);
    setResultado({ excluidas, erros, total: paraExcluir.length, errosDetalhe });
    if (excluidas > 0 && typeof onConcluido === 'function') {
      onConcluido();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Ajustar vínculos e repetidas
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {duplicates.length} {duplicates.length === 1 ? 'duplicata identificada' : 'duplicatas identificadas'} pela deduplicação automática.
            Selecione quais remover permanentemente do banco de dados.
          </p>
        </DialogHeader>

        {resultado && (
          <div className={`rounded-xl border p-4 text-sm ${resultado.erros > 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-green-300 bg-green-50 text-green-800'}`}>
            <p className="font-medium">
              {resultado.excluidas} {resultado.excluidas === 1 ? 'foto removida' : 'fotos removidas'} com sucesso.
              {resultado.erros > 0 && ` ${resultado.erros} com erro.`}
            </p>
            {resultado.errosDetalhe.length > 0 && (
              <ul className="mt-2 text-xs space-y-0.5">
                {resultado.errosDetalhe.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
        )}

        {duplicates.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-gray-500">Nenhuma duplicata detectada na galeria.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selecionarTodos} disabled={processando}>
                  Selecionar todas
                </Button>
                <Button size="sm" variant="outline" onClick={limparSelecao} disabled={processando || selecionados.size === 0}>
                  Limpar seleção
                </Button>
              </div>
              <span className="text-xs text-gray-500">
                {selecionados.size} selecionada(s)
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mt-2">
              {duplicates.map((dup, idx) => {
                const sel = selecionados.has(idx);
                return (
                  <div
                    key={idx}
                    className={`grid grid-cols-2 gap-3 rounded-xl border p-3 transition ${sel ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}
                  >
                    {/* Foto original (mantida) */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Original (mantida)</span>
                      <div className="flex gap-2">
                        <img
                          src={dup.kept?.fileUrl}
                          alt=""
                          className="h-16 w-16 rounded-lg object-cover bg-gray-100 flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{dup.kept?.fileName || '—'}</p>
                          <p className="text-[11px] text-gray-500 truncate">{dup.kept?.legenda || dup.kept?.caption || 'Sem legenda'}</p>
                          <p className="text-[10px] text-gray-400">{dup.kept?.sourceEntity}</p>
                        </div>
                      </div>
                    </div>

                    {/* Duplicata (removida da exibição) */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Duplicata</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => toggleSelecionar(idx)}
                            disabled={processando}
                            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="text-[11px] text-gray-600">Excluir</span>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <img
                          src={dup.removed?.fileUrl}
                          alt=""
                          className="h-16 w-16 rounded-lg object-cover bg-gray-100 flex-shrink-0 opacity-60"
                          onError={(e) => { e.currentTarget.style.opacity = '0.1'; }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{dup.removed?.fileName || '—'}</p>
                          <p className="text-[11px] text-gray-500 truncate">{dup.removed?.legenda || dup.removed?.caption || 'Sem legenda'}</p>
                          <p className="text-[10px] text-amber-500">{dup.reason}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processando}>
            Fechar
          </Button>
          {duplicates.length > 0 && (
            <Button
              onClick={excluirSelecionados}
              disabled={processando || selecionados.size === 0}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {processando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir {selecionados.size > 0 ? `(${selecionados.size})` : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}