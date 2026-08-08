import React, { useState, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const MAX_ITERACOES = 30; // 30 × 10 itens = 300 NFs no máximo

export default function ZerarFilaButton({ onRefresh, disabled, open: externalOpen, onOpenChange, renderTrigger = true }) {
  const [internalConfirmOpen, setInternalConfirmOpen] = useState(false);
  const confirmOpen = externalOpen !== undefined ? externalOpen : internalConfirmOpen;
  const setConfirmOpen = (v) => { if (onOpenChange) onOpenChange(v); setInternalConfirmOpen(v); };
  const [totalPendentes, setTotalPendentes] = useState(0);
  const [contando, setContando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, arquivoAtual: '' });
  const [resumo, setResumo] = useState(null);
  const [errosAbertos, setErrosAbertos] = useState(true);
  const canceladoRef = useRef(false);

  const abrirConfirm = useCallback(async () => {
    setContando(true);
    try {
      const r = await base44.functions.invoke('zerarFilaEntradaUnica', { count: true });
      const total = r?.data?.total_pendentes ?? r?.total_pendentes ?? 0;
      setTotalPendentes(total);
    } catch (e) {
      toast.error('Não foi possível contar a fila: ' + (e?.message || e));
      return;
    } finally {
      setContando(false);
    }
    setConfirmOpen(true);
  }, []);

  const executar = useCallback(async () => {
    setConfirmOpen(false);
    setExecutando(true);
    setResumo(null);
    canceladoRef.current = false;

    const acc = {
      total: 0,
      enviados_aprovacao: 0,
      comprovantes_ocultados: 0,
      xmls_vinculados: 0,
      xmls_backup: 0,
      erros: [],
      itens: [],
    };

    try {
      for (let i = 0; i < MAX_ITERACOES; i++) {
        if (canceladoRef.current) break;
        setProgresso((p) => ({ ...p, arquivoAtual: 'Processando lote…' }));
        const r = await base44.functions.invoke('zerarFilaEntradaUnica', { limit: 10 });
        const d = r?.data ?? r;
        if (!d || d.ok === false) {
          toast.error('Erro no lote: ' + (d?.error || r?.error || 'falha'));
          break;
        }
        acc.total += d.total || 0;
        acc.enviados_aprovacao += d.enviados_aprovacao || 0;
        acc.comprovantes_ocultados += d.comprovantes_ocultados || 0;
        acc.xmls_vinculados += d.xmls_vinculados || 0;
        acc.xmls_backup += d.xmls_backup || 0;
        if (Array.isArray(d.erros)) acc.erros.push(...d.erros);
        if (Array.isArray(d.itens)) acc.itens.push(...d.itens);

        const processados = acc.enviados_aprovacao + acc.comprovantes_ocultados + acc.xmls_vinculados + acc.xmls_backup + acc.erros.length;
        setProgresso({
          atual: processados,
          total: processados + (d.restantes_fila || 0),
          arquivoAtual: d.itens?.[d.itens.length - 1]?.nome || '',
        });

        if (!d.total || (d.restantes_fila || 0) === 0) break;
        if (d.total === 0 && (d.restantes_fila || 0) === 0) break;
      }

      setResumo(acc);
      if (onRefresh) onRefresh();
      if (acc.erros.length === 0 && acc.enviados_aprovacao + acc.comprovantes_ocultados + acc.xmls_vinculados + acc.xmls_backup > 0) {
        toast.success('Fila zerada! Todos os itens foram processados.');
      } else if (acc.erros.length > 0) {
        toast.warning(`Processamento concluído com ${acc.erros.length} item(ns) em erro.`);
      }
    } catch (e) {
      toast.error('Falha ao executar: ' + (e?.message || e));
      setResumo(acc);
    } finally {
      setExecutando(false);
    }
  }, [onRefresh]);

  return (
    <>
      {renderTrigger && (
      <button
        onClick={abrirConfirm}
        disabled={disabled || contando || executando}
        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm hover:bg-amber-200 transition-colors disabled:opacity-50"
        title="Processa toda a fila automaticamente: envia NFs para aprovação, oculta comprovantes e vincula XMLs"
      >
        {contando || executando ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {executando ? 'Zerando fila…' : 'Zerar Fila Automático'}
      </button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              Zerar Fila Automático
            </AlertDialogTitle>
            <AlertDialogDescription>
              {totalPendentes > 0 ? (
                <>
                  Serão processados <strong className="text-black">{totalPendentes} item(ns)</strong> pendentes na fila.
                  As NFs-PDF serão analisadas pela IA, enviadas para aprovação como solicitações de compra;
                  comprovantes serão arquivados; XMLs órfãos serão vinculados ou enviados ao backup.
                  <br /><br />
                  <span className="text-amber-700 font-medium">Ação irreversível em lote. Continuar?</span>
                </>
              ) : (
                <span className="text-emerald-700 font-medium">A fila já está zerada — nenhum item pendente.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executar}
              disabled={totalPendentes === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirmar e processar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {executando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-black">Zerando fila automaticamente…</h3>
                <p className="text-xs text-gray-500">{progresso.atual} de {progresso.total || totalPendentes} processados</p>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-amber-100 overflow-hidden mb-3">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${progresso.total ? Math.min(100, (progresso.atual / progresso.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 truncate">
              {progresso.arquivoAtual || 'Preparando…'}
            </p>
          </div>
        </div>
      )}

      {resumo && !executando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-black">Processamento concluído</h3>
              </div>
              <button onClick={() => setResumo(null)} className="text-gray-400 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <Card label="Enviados p/ aprovação" value={resumo.enviados_aprovacao} tone="emerald" />
              <Card label="Comprovantes arquivados" value={resumo.comprovantes_ocultados} tone="blue" />
              <Card label="XMLs vinculados" value={resumo.xmls_vinculados} tone="violet" />
              <Card label="XMLs p/ backup" value={resumo.xmls_backup} tone="amber" />
            </div>

            {resumo.erros.length > 0 && (
              <div className="border border-red-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setErrosAbertos((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-red-50 text-red-700 text-xs font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {resumo.erros.length} item(ns) com erro (revisar manualmente)
                  </span>
                  {errosAbertos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {errosAbertos && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-red-100">
                    {resumo.erros.map((e, idx) => (
                      <div key={idx} className="px-3 py-2 text-xs">
                        <p className="font-medium text-black truncate">{e.nome || e.id}</p>
                        <p className="text-red-600">{e.motivo}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setResumo(null)}
              className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Card({ label, value, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone] || tones.emerald}`}>
      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}