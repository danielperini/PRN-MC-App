import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Wand2, AlertTriangle, CheckCircle2, CopyCheck } from 'lucide-react';
import { toast } from 'sonner';

const fmtBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

// Tratar Solicitações em lote:
//   1. Detecta duplicatas (CNPJ + nf_numero + data + valor)
//   2. Infere rubrica/centro do histórico do fornecedor
//   3. Aprova direto ou marca PAGO para NFs < 14/07/2026
//   4. Dispara backup das NFs ao Google Drive
export default function TratarSolicitacoesButton({ onDone }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('idle'); // idle | dry | running | done
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  async function runDry() {
    setLoading(true);
    setStep('dry');
    try {
      const res = await base44.functions.invoke('tratarSolicitacoesLote', { dry_run: true });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || 'Falha na análise');
      setPreview(data);
    } catch (e) {
      toast.error('Erro na análise: ' + (e?.message || 'desconhecido'));
      setStep('idle');
    } finally {
      setLoading(false);
    }
  }

  async function runApply() {
    setLoading(true);
    setStep('running');
    try {
      const res = await base44.functions.invoke('tratarSolicitacoesLote', { dry_run: false });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || 'Falha na execução');
      setResult(data);
      setStep('done');
      toast.success(
        `Tratamento concluído: ${data.aprovados_direto || 0} aprovadas, ${data.marcados_pago || 0} pagas, ${data.duplicatas_marcadas || 0} duplicatas, ${data.rubricas_inferidas || 0} rubricas inferidas.`
      );
      onDone?.();
    } catch (e) {
      toast.error('Erro ao executar: ' + (e?.message || 'desconhecido'));
      setStep('dry');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setStep('idle');
    setPreview(null);
    setResult(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-700 transition-colors"
        title="Detecta duplicatas, infere rubrica/centro do histórico, aprova/marca pago NFs < 14/07 e dispara backup"
      >
        <Wand2 className="h-3.5 w-3.5" />
        Tratar Solicitações
      </button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-indigo-600" />
              Tratar Solicitações em Lote
            </DialogTitle>
            <DialogDescription>
              Executa 4 etapas: detecção de duplicatas, inferência de rubrica/centro pelo histórico do
              fornecedor, aprovação/pagamento de NFs anteriores a 14/07/2026 e backup das NFs no Google Drive.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            {step === 'idle' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600">
                <p className="mb-2 font-medium text-slate-800">O que será executado:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Marcas duplicatas (mesmo CNPJ + NF + data + valor) como <strong>fora do somatório</strong></li>
                  <li>Preencher rubrica e centro de custo pelo histórico do fornecedor</li>
                  <li>Aprovar direto (APROVADO_COORD) NFs &lt; 14/07 com rubrica definida</li>
                  <li>Marcar como PAGO NFs já aprovadas &lt; 14/07</li>
                  <li>Disparar backup das NFs para o Google Drive</li>
                </ul>
                <Button
                  type="button"
                  className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700"
                  onClick={runDry}
                  disabled={loading}
                >
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analisando...</> : 'Analisar (dry-run)'}
                </Button>
              </div>
            )}

            {step === 'dry' && preview && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCard label="Analisadas" value={preview.total_analisadas} />
                  <StatCard label="Duplicatas" value={preview.duplicatas_marcadas} tone="red" />
                  <StatCard label="Rubricas inferidas" value={preview.rubricas_inferidas} tone="amber" />
                  <StatCard label="Aprovar/Pagar" value={(preview.aprovados_direto || 0) + (preview.marcados_pago || 0)} tone="green" />
                </div>

                {preview.dry_run_duplicatas?.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium text-slate-700">Duplicatas detectadas:</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-red-100 bg-red-50/40 p-2">
                      {preview.dry_run_duplicatas.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-slate-700">
                            <AlertTriangle className="mr-1 inline h-3 w-3 text-red-500" />
                            {d.fornecedor} · NF {d.nf_numero} · {d.data}
                          </span>
                          <span className="font-medium text-slate-900">{fmtBRL(d.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    Ao confirmar, as duplicatas serão marcadas como <strong>fora do somatório</strong>,
                    rubricas serão aplicadas, NFs &lt; 14/07 aprovadas/pagas e o backup será disparado.
                    Ação irreversível.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={runApply}
                    disabled={loading}
                  >
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Executando...</> : 'Confirmar e executar'}
                  </Button>
                </div>
              </div>
            )}

            {step === 'done' && result && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-medium">Tratamento concluído em {(result.elapsed_ms / 1000).toFixed(1)}s</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCard label="Duplicatas marcadas" value={result.duplicatas_marcadas || 0} tone="red" />
                  <StatCard label="Rubricas inferidas" value={result.rubricas_inferidas || 0} tone="amber" />
                  <StatCard label="Aprovadas direto" value={result.aprovados_direto || 0} tone="green" />
                  <StatCard label="Marcadas pago" value={result.marcados_pago || 0} tone="green" />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <CopyCheck className="h-4 w-4" />
                  Backup disparado: {result.backup_disparado ? 'Sim' : 'Não'}
                </div>
                {result.erros?.length > 0 && (
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {result.erros.length} erro(s): {result.erros.slice(0, 3).join(' · ')}
                  </div>
                )}
                <Button type="button" className="w-full" onClick={handleClose}>
                  Concluir
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-green-200 bg-green-50 text-green-700',
  };
  return (
    <div className={`rounded-lg border p-2 text-center ${tones[tone]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide">{label}</p>
    </div>
  );
}