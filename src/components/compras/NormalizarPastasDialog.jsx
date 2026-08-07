import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { FolderGit, Loader2, AlertTriangle, CheckCircle2, ArrowRight, Trash2, Copy, FileCheck, FilePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

const fmtBR = (n) => new Intl.NumberFormat('pt-BR').format(Number(n || 0));

export default function NormalizarPastasDialog({ open, onOpenChange, onComplete }) {
  const [step, setStep] = useState('confirm'); // confirm | running | done
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [logTimer, setLogTimer] = useState(null);

  async function executar() {
    setStep('running');
    setLoading(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('normalizarPastasDriveNFs', { mode: 'normalizar_completo' });
      const data = res?.data || res || {};
      if (data?.ok === false) throw new Error(data?.error || 'Falha na normalização');
      setResultado(data);
      setStep('done');
      toast.success(
        `Normalização concluída: ${data.arquivos_movidos || 0} movidos, ${data.prs_aprovados || 0} aprovados, ${data.intakes_criados || 0} intakes.`
      );
      if (onComplete) onComplete();
    } catch (e) {
      toast.error('Erro na normalização: ' + (e?.message || e));
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setStep('confirm');
      setResultado(null);
      setLoading(false);
    }, 200);
  }

  const erros = resultado?.erros || [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderGit className="h-5 w-5 text-black" />
            Normalizar pastas de Notas Fiscais (Drive)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pasta origem: <code className="text-gray-700">13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T</code>
            <span className="mx-2 text-gray-300">·</span>
            Backup: <code className="text-gray-700">1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp</code>
          </DialogDescription>
        </DialogHeader>

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <div className="space-y-1.5">
                  <p className="font-semibold">Operação irreversível</p>
                  <p>Esta ação <strong>renomeia e mescla</strong> as subpastas da pasta raiz de NFs para o padrão canônico <em>"Mês Ano"</em> (ex: "Julho 2026"). Pastas duplicadas com nomes alternativos serão <strong>removidas</strong> após a movimentação dos arquivos.</p>
                  <p>Para cada arquivo XML: cria/atualiza PurchaseRequest, sugere rubrica/meta via IA e <strong>aprova automaticamente</strong> se sem duplicata. PDFs sem XML geram intakes para revisão humana.</p>
                  <p>Todos os arquivos são copiados para a pasta de backup com nome padronizado.</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Recomendado: execute <strong>uma única vez</strong> após configurar a pasta origem. Use a sincronização diária automática para manter atualizado após isso.
            </p>
          </div>
        )}

        {step === 'running' && (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <Loader2 className="h-10 w-10 animate-spin text-gray-700" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">Normalizando pastas...</p>
              <p className="text-xs text-gray-500 mt-1">Varrendo Drive, mesclando pastas, processando XMLs/PDFs e copiando backup. Pode levar até 55s.</p>
            </div>
          </div>
        )}

        {step === 'done' && resultado && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Normalização concluída</span>
              <span className="text-emerald-600">· {resultado.elapsed_ms ? Math.round(resultado.elapsed_ms / 1000) : 0}s</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <MetricBox icon={ArrowRight} tone="bg-blue-100 text-blue-700" label="Arquivos movidos" value={fmtBR(resultado.arquivos_movidos)} />
              <MetricBox icon={Copy} tone="bg-emerald-100 text-emerald-700" label="Backups feitos" value={fmtBR(resultado.backups_feitos)} />
              <MetricBox icon={FilePlus} tone="bg-purple-100 text-purple-700" label="PRs criados" value={fmtBR(resultado.prs_criados)} />
              <MetricBox icon={FileCheck} tone="bg-green-100 text-green-700" label="PRs aprovados" value={fmtBR(resultado.prs_aprovados)} />
              <MetricBox icon={FilePlus} tone="bg-indigo-100 text-indigo-700" label="Intakes criados" value={fmtBR(resultado.intakes_criados)} />
              <MetricBox icon={Trash2} tone="bg-rose-100 text-rose-700" label="Pastas removidas" value={fmtBR(resultado.pastas_removidas?.length || 0)} />
            </div>

            {resultado.pastas_canonicas?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Pastas canônicas criadas/confirmadas:</p>
                <div className="flex flex-wrap gap-1.5">
                  {resultado.pastas_canonicas.slice(0, 20).map((p, i) => (
                    <span key={i} className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {erros.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <p className="font-semibold mb-1">{erros.length} erro(s) registrado(s):</p>
                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                  {erros.slice(0, 30).map((e, i) => (
                    <li key={i} className="truncate"><span className="text-red-500">⚠</span> {e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'confirm' && (
            <>
              <Button variant="outline" size="sm" onClick={handleClose} disabled={loading}>Cancelar</Button>
              <Button size="sm" onClick={executar} disabled={loading} className="gap-2 bg-black text-white hover:bg-gray-800">
                <FolderGit className="h-4 w-4" />
                Normalizar agora
              </Button>
            </>
          )}
          {step === 'running' && (
            <Button size="sm" disabled className="gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </Button>
          )}
          {step === 'done' && (
            <Button size="sm" onClick={handleClose} className="gap-2 bg-black text-white hover:bg-gray-800">
              <CheckCircle2 className="h-4 w-4" />
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricBox({ icon: Icon, tone, label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2">
      <div className="flex items-center gap-1.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded ${tone}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400">{label}</div>
          <div className="text-sm font-bold text-gray-900">{value}</div>
        </div>
      </div>
    </div>
  );
}