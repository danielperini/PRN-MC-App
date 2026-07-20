import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, RefreshCw, CheckCircle2, XCircle, Images, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const BATCH_SIZE = 5;

export default function ReconstruirGaleriaDialog({ open, onClose }) {
  const [fase, setFase] = useState('idle'); // idle, limpando, listando, processando_geral, processando_mis, concluido
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState(null);
  const [resultados, setResultados] = useState({ geral: null, mis: null });

  const limparGaleria = useCallback(async () => {
    setFase('limpando');
    setErro(null);
    try {
      const res = await base44.functions.invoke('reconstruirGaleriaDrive', { modo: 'limpar' });
      toast.success(`${res.deletadas || 0} fotos antigas removidas.`);
      setFase('listando');
      return true;
    } catch (e) {
      setErro(String(e?.message || e));
      setFase('idle');
      return false;
    }
  }, []);

  const listarPastas = useCallback(async () => {
    setFase('listando');
    setErro(null);
    try {
      const res = await base44.functions.invoke('reconstruirGaleriaDrive', { modo: 'listar' });
      setProgresso({
        total_geral: res.total_geral || 0,
        total_mis: res.total_mis || 0,
        total: res.total || 0,
        processadas_geral: 0,
        processadas_mis: 0,
      });
      setFase('processar_geral');
      return true;
    } catch (e) {
      setErro(String(e?.message || e));
      setFase('idle');
      return false;
    }
  }, []);

  const processarLote = useCallback(async (modo, offsetKey) => {
    try {
      const res = await base44.functions.invoke('reconstruirGaleriaDrive', { modo, offset: offsetKey });
      return res;
    } catch (e) {
      return { error: String(e?.message || e) };
    }
  }, []);

  const processarTudo = useCallback(async () => {
    // Limpar primeiro
    const limpo = await limparGaleria();
    if (!limpo) return;

    // Listar
    setFase('listando');
    try {
      const listRes = await base44.functions.invoke('reconstruirGaleriaDrive', { modo: 'listar' });
      const totalGeral = listRes.total_geral || 0;
      const totalMis = listRes.total_mis || 0;
      setProgresso({
        total_geral: totalGeral,
        total_mis: totalMis,
        total: totalGeral + totalMis,
        processadas_geral: 0,
        processadas_mis: 0,
        criadas_geral: 0,
        criadas_mis: 0,
        erros_geral: 0,
        erros_mis: 0,
      });

      // Processar pasta geral
      setFase('processar_geral');
      let offsetGeral = 0;
      let criadasGeral = 0, errosGeral = 0;
      while (offsetGeral < totalGeral) {
        const res = await processarLote('processar_geral', offsetGeral);
        if (res.error) { errosGeral += BATCH_SIZE; offsetGeral += BATCH_SIZE; }
        else {
          criadasGeral += res.criadas || 0;
          errosGeral += res.erros || 0;
          offsetGeral = res.next_offset || offsetGeral + BATCH_SIZE;
        }
        setProgresso(prev => ({
          ...prev,
          processadas_geral: Math.min(offsetGeral, totalGeral),
          criadas_geral: criadasGeral,
          erros_geral: errosGeral,
        }));
        if (res.has_more === false) break;
      }

      // Processar pasta MIS Mediação (com IA)
      setFase('processar_mis');
      let offsetMis = 0;
      let criadasMis = 0, errosMis = 0;
      while (offsetMis < totalMis) {
        const res = await processarLote('processar_mis', offsetMis);
        if (res.error) { errosMis += BATCH_SIZE; offsetMis += BATCH_SIZE; }
        else {
          criadasMis += res.criadas || 0;
          errosMis += res.erros || 0;
          offsetMis = res.next_offset || offsetMis + BATCH_SIZE;
        }
        setProgresso(prev => ({
          ...prev,
          processadas_mis: Math.min(offsetMis, totalMis),
          criadas_mis: criadasMis,
          erros_mis: errosMis,
        }));
        if (res.has_more === false) break;
      }

      setResultados({
        geral: { criadas: criadasGeral, erros: errosGeral, total: totalGeral },
        mis: { criadas: criadasMis, erros: errosMis, total: totalMis },
      });
      setFase('concluido');
      toast.success('Galeria reconstruída com sucesso!');
    } catch (e) {
      setErro(String(e?.message || e));
      setFase('idle');
    }
  }, [limparGaleria, processarLote]);

  const handleClose = () => {
    if (fase === 'processar_geral' || fase === 'processar_mis') {
      toast.warning('Reconstrução em andamento — aguarde a conclusão.');
      return;
    }
    setFase('idle');
    setProgresso(null);
    setErro(null);
    setResultados({ geral: null, mis: null });
    onClose();
  };

  const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-5 w-5" />
            Reconstruir Galeria do Zero
          </DialogTitle>
        </DialogHeader>

        {fase === 'idle' && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Atenção — esta ação é irreversível</p>
                  <p>Todas as {progresso?.total || 'atuais'} fotos da galeria serão <strong>removidas</strong> e reimportadas das seguintes pastas do Google Drive:</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <div>
                  <p className="font-medium">Pasta Geral (fotos de todos os museus)</p>
                  <p className="text-xs text-gray-500 truncate max-w-[400px]">drive.google.com/drive/folders/1KHek34-ES3eef7E7YAh4q8ZhLgjPZuZC</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <div>
                  <p className="font-medium">Pasta MIS Mediação (análise com IA)</p>
                  <p className="text-xs text-gray-500 truncate max-w-[400px]">drive.google.com/drive/folders/1s8t3ERUthNKEStvFAKyGChXlu3MLVuzn</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              As fotos da pasta MIS Mediação serão analisadas individualmente por IA para identificar atividade, data, local e legenda.
            </p>
          </div>
        )}

        {(fase === 'limpando' || fase === 'listando') && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-3 text-sm text-gray-600">
              {fase === 'limpando' ? 'Removendo fotos antigas...' : 'Listando pastas do Drive...'}
            </span>
          </div>
        )}

        {(fase === 'processar_geral' || fase === 'processar_mis') && progresso && (
          <div className="space-y-4 py-4">
            {fase === 'processar_geral' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Pasta Geral
                  </span>
                  <span className="text-gray-500">{progresso.processadas_geral}/{progresso.total_geral}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct(progresso.processadas_geral, progresso.total_geral)}%` }} />
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="text-green-600">✓ {progresso.criadas_geral || 0} importadas</span>
                  {progresso.erros_geral > 0 && <span className="text-red-600">✗ {progresso.erros_geral} erros</span>}
                </div>
              </div>
            )}
            {fase === 'processar_mis' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    MIS Mediação (IA)
                  </span>
                  <span className="text-gray-500">{progresso.processadas_mis}/{progresso.total_mis}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 transition-all" style={{ width: `${pct(progresso.processadas_mis, progresso.total_mis)}%` }} />
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="text-green-600">✓ {progresso.criadas_mis || 0} analisadas</span>
                  {progresso.erros_mis > 0 && <span className="text-red-600">✗ {progresso.erros_mis} erros</span>}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processando em lotes de {BATCH_SIZE} fotos...
            </div>
          </div>
        )}

        {fase === 'concluido' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">Galeria reconstruída!</p>
                <p className="text-xs text-green-600">Todas as fotos foram importadas e processadas.</p>
              </div>
            </div>
            {resultados.geral && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium mb-1">Pasta Geral</p>
                <p className="text-gray-600">{resultados.geral.criadas} fotos importadas de {resultados.geral.total}</p>
                {resultados.geral.erros > 0 && <p className="text-red-500 text-xs">{resultados.geral.erros} erros</p>}
              </div>
            )}
            {resultados.mis && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium mb-1">MIS Mediação (IA)</p>
                <p className="text-gray-600">{resultados.mis.criadas} fotos analisadas de {resultados.mis.total}</p>
                {resultados.mis.erros > 0 && <p className="text-red-500 text-xs">{resultados.mis.erros} erros</p>}
              </div>
            )}
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">Erro</p>
            <p className="text-xs mt-1">{erro}</p>
          </div>
        )}

        <DialogFooter>
          {fase === 'idle' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={processarTudo} className="bg-red-600 hover:bg-red-700">
                <Trash2 className="h-4 w-4 mr-2" />
                Reconstruir do Zero
              </Button>
            </>
          )}
          {fase === 'concluido' && (
            <Button onClick={handleClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}