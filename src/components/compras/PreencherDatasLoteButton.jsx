import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Botão de ação em lote que dispara o preenchimento de data de emissão
// faltante em DocumentIntake e PurchaseRequests aprovadas. Extrai do XML
// vinculado (determinístico) e, sem XML, usa IA no PDF como fallback.
// Idempotente: nunca sobrescreve uma data já preenchida.
export default function PreencherDatasLoteButton({ onConcluido, variant = 'outline' }) {
  const [open, setOpen] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [estimativa, setEstimativa] = useState(null);
  const [estimando, setEstimando] = useState(false);

  async function estimar() {
    setEstimando(true);
    setEstimativa(null);
    try {
      const res = await base44.functions.invoke('preencherDataEmissaoNFsLote', {
        modo: 'contar',
      });
      const data = res?.data || res || {};
      setEstimativa({
        intakes: data.total_intakes_sem_data || 0,
        purchases: data.total_purchases_sem_data || 0,
      });
    } catch (e) {
      console.error('Erro ao estimar:', e);
      setEstimativa({ erro: String(e?.message || e) });
    } finally {
      setEstimando(false);
    }
  }

  async function executar() {
    setProcessando(true);
    try {
      const res = await base44.functions.invoke('preencherDataEmissaoNFsLote', {
        modo: 'ambos',
      });
      const data = res?.data || res || {};
      const xml = data.preenchidos_xml || 0;
      const ia = data.preenchidos_ia || 0;
      const semData = data.sem_data || 0;
      const erros = data.erros || 0;

      if (erros > 0 && xml === 0 && ia === 0) {
        toast.error(`Preenchimento falhou: ${erros} erro(s).`);
      } else {
        toast.success(
          `Datas preenchidas: ${xml} via XML, ${ia} via IA, ${semData} sem data encontrada${erros ? `, ${erros} erro(s)` : ''}.`
        );
      }

      setOpen(false);
      if (onConcluido) onConcluido();
    } catch (e) {
      console.error('Erro ao preencher datas:', e);
      toast.error('Erro ao preencher datas: ' + (e?.message || e));
    } finally {
      setProcessando(false);
    }
  }

  function handleOpenChange(v) {
    setOpen(v);
    if (v && !estimativa) {
      estimar();
    }
  }

  const baseClass =
    variant === 'outline'
      ? 'inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors'
      : 'inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors';

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <button className={baseClass} title="Preenche data de emissão faltante em NFs via XML e IA">
          <CalendarClock className="w-3.5 h-3.5" />
          Preencher Datas Faltantes
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Preencher data de emissão em lote</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Esta ação busca a data de emissão de todas as notas fiscais que ainda não têm esse campo preenchido:
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                <li>Documentos na Entrada Única (DocumentIntake) sem data de emissão</li>
                <li>Solicitações aprovadas (PurchaseRequest) sem <code>nf_data_emissao</code></li>
              </ul>
              <p className="text-xs">
                Extrai do XML vinculado (determinístico) e, sem XML, usa IA no PDF como fallback. É idempotente — nunca sobrescreve uma data já preenchida.
              </p>

              {estimando && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Estimando registros afetados...
                </div>
              )}
              {estimativa && !estimativa.erro && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-semibold text-slate-700">Registros sem data de emissão:</p>
                  <p className="mt-1">· Entrada Única: <strong>{estimativa.intakes}</strong></p>
                  <p>· Compras aprovadas: <strong>{estimativa.purchases}</strong></p>
                </div>
              )}
              {estimativa?.erro && (
                <p className="text-xs text-amber-700">Não foi possível estimar: {estimativa.erro}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              executar();
            }}
            disabled={processando}
            className="bg-slate-900 hover:bg-slate-800"
          >
            {processando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                Preenchendo...
              </>
            ) : (
              'Preencher agora'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}