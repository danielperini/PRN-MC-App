import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2, FolderSync, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function SincronizarInventarioDialog({ open, onClose }) {
  const [status, setStatus] = useState('idle');
  const [preview, setPreview] = useState(null);
  const [progresso, setProgresso] = useState({ criadas: 0, ja_existia: 0, duplicatas: 0, erros: [] });
  const [limparDuplicatas, setLimparDuplicatas] = useState(true);

  async function analisar() {
    setStatus('analisando');
    setPreview(null);
    try {
      const res = await base44.functions.invoke('sincronizarInventarioCompleto', { modo: 'preview' });
      setPreview(res.data);
      setStatus('idle');
    } catch (e) {
      setStatus('erro');
    }
  }

  async function sincronizar() {
    if (!preview) return;
    setStatus('sincronizando');
    setProgresso({ criadas: 0, ja_existia: 0, duplicatas: 0, erros: [] });

    let offset = 0;
    const limite = 10;
    let hasMore = true;
    let totalCriadas = 0;
    let totalJaExistia = 0;
    let totalDuplicatas = 0;
    let todosErros = [];

    while (hasMore) {
      try {
        const res = await base44.functions.invoke('sincronizarInventarioCompleto', {
          modo: 'sync',
          offset,
          limite,
          limpar_duplicatas: offset === 0 && limparDuplicatas,
        });
        const d = res.data;
        totalCriadas += d.criadas || 0;
        totalJaExistia += d.ja_existia || 0;
        totalDuplicatas += d.duplicatas_removidas || 0;
        if (d.falhas?.length) todosErros = [...todosErros, ...d.falhas];

        setProgresso({ criadas: totalCriadas, ja_existia: totalJaExistia, duplicatas: totalDuplicatas, erros: todosErros });

        hasMore = d.has_more;
        offset = d.next_offset;
        if (!hasMore || d.lote_processado === 0) break;
      } catch (e) {
        hasMore = false;
      }
    }

    setStatus('concluido');
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSync className="w-5 h-5 text-blue-600" />
            Sincronizar Inventário com o Drive
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">
            Analisa as pastas existentes no Google Drive, identifica fotos novas que ainda não estão no sistema,
            remove duplicatas e garante que os álbuns estejam consistentes — sem criar novas pastas.
          </p>

          {preview && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 border rounded-lg p-3">
                <p className="text-slate-500 text-xs">No Drive</p>
                <p className="text-2xl font-bold text-slate-800">{preview.total_drive}</p>
                <p className="text-xs text-slate-400">{preview.total_pastas} álbuns/pastas</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-blue-500 text-xs">Fotos novas a importar</p>
                <p className="text-2xl font-bold text-blue-700">{preview.total_novas}</p>
                <p className="text-xs text-blue-400">{preview.total_ja_existentes} já existem</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-500 text-xs">No sistema (galeria)</p>
                <p className="text-2xl font-bold text-green-700">{preview.total_db_fotos}</p>
              </div>
              {preview.total_duplicatas_db > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-amber-500 text-xs">Duplicatas no banco</p>
                  <p className="text-2xl font-bold text-amber-700">{preview.total_duplicatas_db}</p>
                </div>
              )}
            </div>
          )}

          {preview?.total_duplicatas_db > 0 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={limparDuplicatas} onChange={e => setLimparDuplicatas(e.target.checked)} />
              <Trash2 className="w-4 h-4 text-amber-500" />
              Remover {preview.total_duplicatas_db} duplicatas do banco durante a sync
            </label>
          )}

          {status === 'sincronizando' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2 text-blue-700 font-medium">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando…
              </div>
              <p>✅ {progresso.criadas} importadas &nbsp;·&nbsp; 🔁 {progresso.ja_existia} já existiam &nbsp;·&nbsp; 🗑 {progresso.duplicatas} removidas</p>
              {progresso.erros.length > 0 && <p className="text-amber-600">⚠ {progresso.erros.length} erros</p>}
            </div>
          )}

          {status === 'concluido' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <div className="flex items-center gap-2 font-medium mb-1">
                <CheckCircle2 className="w-4 h-4" />
                Sincronização concluída!
              </div>
              <p>✅ {progresso.criadas} fotos importadas</p>
              <p>🔁 {progresso.ja_existia} já estavam no sistema</p>
              {progresso.duplicatas > 0 && <p>🗑 {progresso.duplicatas} duplicatas removidas</p>}
              {progresso.erros.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-amber-700">⚠ {progresso.erros.length} erros</summary>
                  <ul className="mt-1 text-xs space-y-1">
                    {progresso.erros.slice(0, 10).map((e, i) => (
                      <li key={i}>{e.arquivo}: {e.erro}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {status === 'erro' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Erro ao conectar ao Drive. Verifique a conexão e tente novamente.
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {status !== 'sincronizando' && status !== 'concluido' && (
            <Button
              variant="outline"
              onClick={analisar}
              disabled={status === 'analisando'}
            >
              {status === 'analisando' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Analisar Drive
            </Button>
          )}
          {preview && status !== 'sincronizando' && status !== 'concluido' && (
            <Button onClick={sincronizar} className="bg-blue-600 hover:bg-blue-700 text-white">
              <FolderSync className="w-4 h-4 mr-2" />
              {preview.total_novas > 0 ? `Sincronizar (${preview.total_novas} novas)` : 'Sincronizar'}
            </Button>
          )}
          {status === 'concluido' && (
            <Button onClick={() => { setStatus('idle'); setPreview(null); onClose(); }} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Concluído
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}