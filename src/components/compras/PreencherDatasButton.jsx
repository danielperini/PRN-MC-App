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
import { Button } from '@/components/ui/button';

/**
 * Botão "Preencher Datas Faltantes" — invoca a função backend
 * `preencherDataEmissaoNFsLote` no modo `ambos` (DocumentIntake + PurchaseRequests
 * aprovadas). Extrai a data de emissão via XML (dhEmi/dEmi) e, em fallback, via
 * IA sobre o PDF. Idempotente: nunca sobrescreve data já preenchida.
 */
export default function PreencherDatasButton({ onDone, size = 'sm', className = '' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [estimando, setEstimando] = useState(false);

  async function carregarEstimativa() {
    setEstimando(true);
    try {
      const [intakes, prs] = await Promise.all([
        base44.entities.DocumentIntake.list('-created_date', 500).catch(() => []),
        base44.entities.PurchaseRequest.filter({ status: 'APROVADO_ADMIN' }).catch(() => []),
      ]);
      const nfPendentes = (intakes || []).filter((i) => {
        const s = String(i?.status_registro || '').toUpperCase();
        if (s === 'REMOVIDO') return false;
        return !String(i?.nf_data_emissao || '').trim();
      }).length;
      const prPendentes = (prs || []).filter((p) => !String(p?.nf_data_emissao || '').trim()).length;
      setEstimate({ nf: nfPendentes, pr: prPendentes, total: nfPendentes + prPendentes });
    } catch {
      setEstimate(null);
    } finally {
      setEstimando(false);
    }
  }

  async function executar() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('preencherDataEmissaoNFsLote', { modo: 'ambos' });
      const data = res?.data || res || {};
      const xml = data.preenchidos_xml || 0;
      const ia = data.preenchidos_ia || 0;
      const sem = data.sem_data || 0;
      const erros = data.erros || 0;
      toast.success(
        `${xml} datas via XML, ${ia} via IA, ${sem} sem data encontrada${erros ? `, ${erros} erros` : ''}.`
      );
      setOpen(false);
      if (typeof onDone === 'function') onDone(data);
    } catch (e) {
      toast.error('Erro ao preencher datas: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !estimate && !estimando) carregarEstimativa();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size={size} className={`gap-2 ${className}`}>
          <CalendarClock className="h-4 w-4" />
          Preencher Datas Faltantes
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Preencher datas de emissão faltantes</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Este processo lê os XMLs vinculados (campo <code>dhEmi</code>/<code>dEmi</code>) e,
                quando não houver XML, usa IA sobre o PDF para extrair a data de emissão de notas
                fiscais e solicitações aprovadas com esse campo vazio.
              </p>
              {estimando && (
                <p className="text-xs text-gray-500">Calculando estimativa...</p>
              )}
              {estimate && (
                <p className="text-xs">
                  Estimativa de registros afetados: <strong>{estimate.total}</strong>
                  {' '}({estimate.nf} notas fiscais + {estimate.pr} solicitações aprovadas).
                  Pode levar alguns minutos.
                </p>
              )}
              <p className="text-xs text-gray-500">
                Idempotente: não sobrescreve datas já preenchidas.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              executar();
            }}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Processando...' : 'Confirmar e preencher'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}