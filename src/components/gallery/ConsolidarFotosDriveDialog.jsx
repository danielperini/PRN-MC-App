import React, { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FolderTree, CheckCircle2, AlertTriangle, ExternalLink, Copy, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const PASTAS_ORIGEM = [
  { id: '1JIQOY1eY29Qt-iUFgivfioaSoaFXGFJy', label: 'Pasta 1 — Atividades' },
  { id: '1KHek34-ES3eef7E7YAh4q8ZhLgjPZuZC', label: 'Pasta 2 — Fotos diversas' },
];
const PASTA_DESTINO_ID = '1s8t3ERUthNKEStvFAKyGChXlu3MLVuzn';
const PASTA_DESTINO_URL = 'https://drive.google.com/drive/folders/1s8t3ERUthNKEStvFAKyGChXlu3MLVuzn';
const LOTE_PROCESSAMENTO = 5;

const FASES = {
  idle: 'Aguardando início',
  mapeando: 'Varrendo subpastas',
  processando: 'Processando lote',
  concluido: 'Concluído',
};

export default function ConsolidarFotosDriveDialog({ open, onClose, onConcluido }) {
  const [fase, setFase] = useState('idle');
  const [arquivosMapeados, setArquivosMapeados] = useState([]);
  const [totalEncontrado, setTotalEncontrado] = useState(0);
  const [mapeadosAte, setMapeadosAte] = useState(0);
  const [processadas, setProcessadas] = useState(0);
  const [duplicatas, setDuplicatas] = useState(0);
  const [erros, setErros] = useState(0);
  const [detalhes, setDetalhes] = useState([]);
  const [erroFatal, setErroFatal] = useState(null);
  const [processando, setProcessando] = useState(false);
  const cancelRef = useRef(false);

  const reset = useCallback(() => {
    setFase('idle');
    setArquivosMapeados([]);
    setTotalEncontrado(0);
    setMapeadosAte(0);
    setProcessadas(0);
    setDuplicatas(0);
    setErros(0);
    setDetalhes([]);
    setErroFatal(null);
    setProcessando(false);
    cancelRef.current = false;
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const iniciar = async () => {
    setProcessando(true);
    setErroFatal(null);
    cancelRef.current = false;

    try {
      // FASE 1: MAPEAMENTO — varre recursivamente todas as subpastas
      setFase('mapeando');
      let skip = 0;
      const todosArquivos = [];

      while (!cancelRef.current) {
        const res = await base44.functions.invoke('consolidarFotosPastasDrive', {
          operacao: 'mapear',
          skip,
        });
        const data = res?.data || res;
        if (!data?.success) throw new Error(data?.error || 'Erro no mapeamento');

        todosArquivos.push(...(data.arquivos || []));
        setMapeadosAte(todosArquivos.length);
        setTotalEncontrado(data.totalEncontrado || 0);

        if (data.concluido || !data.proximoSkip) break;
        skip = data.proximoSkip;
      }

      if (cancelRef.current) {
        setProcessando(false);
        setFase('idle');
        return;
      }

      setArquivosMapeados(todosArquivos);

      // FASE 2: PROCESSAMENTO — em lotes de 5
      setFase('processando');
      let totalProc = 0;
      let totalDup = 0;
      let totalErr = 0;
      const todosDetalhes = [];

      for (let i = 0; i < todosArquivos.length; i += LOTE_PROCESSAMENTO) {
        if (cancelRef.current) break;

        const lote = todosArquivos.slice(i, i + LOTE_PROCESSAMENTO);
        const res = await base44.functions.invoke('consolidarFotosPastasDrive', {
          operacao: 'processar',
          arquivos: lote,
        });
        const data = res?.data || res;
        if (!data?.success && data?.erros > 0) {
          // não aborta — continua processando outros lotes
        }

        totalProc += data?.processadas || 0;
        totalDup += data?.duplicatas || 0;
        totalErr += data?.erros || 0;
        if (data?.detalhes) todosDetalhes.push(...data.detalhes);

        setProcessadas(totalProc);
        setDuplicatas(totalDup);
        setErros(totalErr);
        setDetalhes([...todosDetalhes]);
      }

      setFase('concluido');
    } catch (error) {
      setErroFatal(error?.message || String(error));
      setFase('idle');
    } finally {
      setProcessando(false);
    }
  };

  const cancelar = () => {
    cancelRef.current = true;
    setProcessando(false);
    setFase('idle');
  };

  const fechar = () => {
    if (processando) return;
    if (fase === 'concluido' && typeof onConcluido === 'function') {
      onConcluido();
    }
    onClose();
  };

  const progressoMapeamento = totalEncontrado > 0 ? Math.min(100, Math.round((mapeadosAte / totalEncontrado) * 100)) : 0;
  const progressoProcessamento = arquivosMapeados.length > 0 ? Math.round(((processadas + duplicatas + erros) / arquivosMapeados.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !processando && fechar()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-blue-600" />
            Consolidar Fotos do Drive
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Varre as pastas de origem recursivamente (incluindo subpastas), copia as fotos para a pasta de destino,
            gera legendas por IA, registra na galeria e remove os originais após sucesso.
          </p>
        </DialogHeader>

        {/* Pastas configuradas */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pastas de origem (varredura recursiva):</p>
          {PASTAS_ORIGEM.map((p) => (
            <p key={p.id} className="text-xs text-gray-700 flex items-center gap-1.5">
              <FolderTree className="h-3 w-3 text-blue-500" />
              {p.label}
            </p>
          ))}
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 pt-1.5">Pasta de destino:</p>
          <a href={PASTA_DESTINO_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1.5">
            <ExternalLink className="h-3 w-3" />
            Pasta de destino no Drive
          </a>
        </div>

        {/* Erro fatal */}
        {erroFatal && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Erro</p>
              <p className="text-xs">{erroFatal}</p>
            </div>
          </div>
        )}

        {/* Progresso */}
        {fase !== 'idle' && fase !== 'concluido' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {processando && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
              <span className="font-medium">{FASES[fase]}</span>
            </div>

            {fase === 'mapeando' && (
              <div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progressoMapeamento}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {mapeadosAte} de {totalEncontrado} imagens mapeadas
                </p>
              </div>
            )}

            {fase === 'processando' && (
              <div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-green-600 transition-all duration-300" style={{ width: `${progressoProcessamento}%` }} />
                </div>
                <div className="flex flex-wrap gap-4 mt-2 text-xs">
                  <span className="text-green-700 font-medium">✓ {processadas} copiadas</span>
                  <span className="text-amber-700 font-medium">↻ {duplicatas} duplicatas</span>
                  <span className="text-red-700 font-medium">✗ {erros} erros</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resumo final */}
        {fase === 'concluido' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-green-300 bg-green-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="font-semibold text-green-800">Consolidação concluída</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Total encontrado</p>
                  <p className="font-bold text-gray-900">{arquivosMapeados.length}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Copiadas com sucesso</p>
                  <p className="font-bold text-green-700">{processadas}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Duplicatas ignoradas</p>
                  <p className="font-bold text-amber-700">{duplicatas}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Erros</p>
                  <p className="font-bold text-red-700">{erros}</p>
                </div>
              </div>
            </div>

            <a href={PASTA_DESTINO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <ExternalLink className="h-4 w-4" />
              Abrir pasta de destino no Drive
            </a>

            {detalhes.filter((d) => d.status === 'erro').length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">Arquivos com erro (não foram deletados da origem):</p>
                <ul className="text-xs text-amber-700 space-y-0.5 max-h-24 overflow-y-auto">
                  {detalhes.filter((d) => d.status === 'erro').slice(0, 20).map((d, i) => (
                    <li key={i}>• {d.name}: {d.erro}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {fase === 'idle' && !erroFatal && (
            <Button onClick={iniciar} className="bg-blue-600 hover:bg-blue-700 text-white">
              <FolderTree className="h-4 w-4 mr-2" />
              Iniciar consolidação
            </Button>
          )}
          {processando && (
            <Button variant="outline" onClick={cancelar}>
              Cancelar
            </Button>
          )}
          {fase === 'concluido' && (
            <Button onClick={fechar}>
              Fechar
            </Button>
          )}
          {erroFatal && fase === 'idle' && (
            <Button onClick={iniciar}>
              Tentar novamente
            </Button>
          )}
          {!processando && fase === 'idle' && !erroFatal && (
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}