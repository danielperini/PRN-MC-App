import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function DeduplicarIAFotosDialog({ open, onClose, onConcluido }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dryRun, setDryRun] = useState(true);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke('deduplicarFotosGaleriaIA', {
        dry_run: dryRun,
      });
      const data = res?.data || res;
      setResult(data);
      if (!dryRun && data?.duplicatesHidden > 0) {
        toast.success(`${data.duplicatesHidden} foto(s) duplicada(s) ocultada(s) por IA`);
        onConcluido?.();
      } else if (dryRun && data?.duplicatesFound > 0) {
        toast.info(`Análise concluída: ${data.duplicatesFound} duplicata(s) encontrada(s) em ${data.groupsAnalyzed} atividade(s)`);
      } else {
        toast.success('Análise concluída — nenhuma duplicata encontrada');
      }
    } catch (err) {
      setError(err?.message || 'Erro ao executar deduplicação');
      toast.error('Erro na deduplicação por IA');
    } finally {
      setRunning(false);
    }
  }

  function handleClose() {
    if (running) return;
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Deduplicação por IA
          </DialogTitle>
          <DialogDescription>
            Analisa fotos agrupadas por atividade usando visão computacional via IA.
            Para cada grupo de fotos similares, mantém apenas a melhor imagem e oculta as duplicatas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Toggle dry run */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={running}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-gray-700">
              Modo análise (não oculta fotos — apenas relata duplicatas)
            </span>
          </label>

          {/* Progresso */}
          {running && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-violet-700">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analisando fotos com IA...
              </div>
              <Progress value={50} className="h-2" />
              <p className="text-xs text-gray-500">
                Isso pode levar alguns minutos. A IA analisa cada grupo de fotos por atividade.
              </p>
            </div>
          )}

          {/* Resultado */}
          {result && !running && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-gray-900">Análise concluída</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Total de fotos</p>
                  <p className="font-semibold text-gray-900">{result.total || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500">Atividades analisadas</p>
                  <p className="font-semibold text-gray-900">{result.groupsAnalyzed || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500">Duplicatas encontradas</p>
                  <p className="font-semibold text-amber-700">{result.duplicatesFound || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500">Fotos ocultadas</p>
                  <p className="font-semibold text-green-700">{result.duplicatesHidden || 0}</p>
                </div>
              </div>
              {result.duplicatesFound > 0 && dryRun && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {result.duplicatesFound} duplicata(s) encontrada(s). Desmarque o "Modo análise" e execute novamente para ocultá-las da galeria.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={running}>
            Fechar
          </Button>
          <Button
            onClick={handleRun}
            disabled={running}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            {running ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                Processando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                {dryRun ? 'Analisar' : 'Executar deduplicação'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}