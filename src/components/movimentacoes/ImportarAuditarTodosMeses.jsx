import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { EXTRATO_DRIVE_FOLDERS_2026 } from '@/config/extratoDriveFolders';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'calculando…';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

export default function ImportarAuditarTodosMeses({ onConcluido }) {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState({ percent: 0, stage: '', eta: null, imported: 0, updated: 0, errors: 0, corrected: 0 });

  async function run() {
    const months = EXTRATO_DRIVE_FOLDERS_2026.filter(item => item.folder_id);
    setRunning(true);
    setState({ percent: 1, stage: 'Preparando leitura de todos os meses…', eta: null, imported: 0, updated: 0, errors: 0, corrected: 0 });
    const startedAt = Date.now();
    let completedUnits = 0;
    let totalUnits = months.length;
    let imported = 0;
    let updated = 0;
    let errors = 0;

    try {
      for (const month of months) {
        let remaining = 1;
        let cycles = 0;
        while (remaining > 0 && cycles < 50) {
          cycles += 1;
          setState(prev => ({ ...prev, stage: `${month.mes}: lendo e processando lote ${cycles}…` }));
          const response = await base44.functions.invoke('lerExtratosBancariosDrive', {
            mes_num: month.mes_num,
            ano: month.ano,
            folder_id: month.folder_id,
            batch_size: 3,
          });
          const data = response?.data || response || {};
          if (!data.success) throw new Error(`${month.mes}: ${data.error || 'falha na importação'}`);
          const summary = data.resumo || {};
          imported += Number(summary.novos_criados || 0);
          updated += Number(summary.atualizados || 0);
          errors += Number(summary.erros || 0);
          remaining = Number(summary.restantes || 0);
          if (cycles === 1 && remaining > 0) totalUnits += Math.ceil(remaining / 3);
          completedUnits += 1;
          const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
          const avg = elapsed / completedUnits;
          const percent = Math.min(94, Math.max(2, Math.round((completedUnits / Math.max(totalUnits, completedUnits)) * 94)));
          setState(prev => ({ ...prev, percent, imported, updated, errors, eta: avg * Math.max(0, totalUnits - completedUnits) }));
          await onConcluido?.();
          if (remaining > 0 && Number(summary.processados_neste_lote || 0) === 0) throw new Error(`${month.mes}: a fila não avançou.`);
          if (remaining > 0 && Number(summary.erros || 0) === Number(summary.processados_neste_lote || 0) && Number(summary.novos_criados || 0) === 0) throw new Error(`${month.mes}: todos os PDFs do lote falharam.`);
        }
      }

      setState(prev => ({ ...prev, percent: 96, stage: 'Auditando totais, duplicidades e dados desatualizados…', eta: null }));
      const auditResponse = await base44.functions.invoke('auditarMovimentacoesBancarias', { ano: 2026 });
      const audit = auditResponse?.data || auditResponse || {};
      if (!audit.success) throw new Error(audit.error || 'Falha na auditoria');
      const corrected = Number(audit.resumo?.registros_corrigidos || 0);
      const auditErrors = Number(audit.resumo?.erros || 0);
      const duplicateGroups = Number(audit.resumo?.duplicidades_drive_detectadas || 0);
      errors += auditErrors;
      setState({ percent: 100, stage: 'Importação e auditoria concluídas.', eta: 0, imported, updated, errors, corrected });
      await onConcluido?.();
      if (duplicateGroups > 0) {
        toast.warning(`Concluído: ${imported} importado(s), ${updated} atualizado(s), ${corrected} corrigido(s). ${duplicateGroups} grupo(s) duplicado(s) sinalizado(s) sem exclusão automática.`, { duration: 12000 });
      } else {
        toast.success(`Concluído: ${imported} importado(s), ${updated} atualizado(s) e ${corrected} registro(s) corrigido(s).`);
      }
    } catch (error) {
      setState(prev => ({ ...prev, stage: `Interrompido: ${error?.message || String(error)}`, eta: null }));
      toast.error(error?.message || String(error), { duration: 12000 });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">Importação e auditoria geral</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">Processa todas as pastas configuradas, acrescenta apenas arquivos novos, atualiza os cards e gráficos e reconcilia os totais sem excluir registros.</p>
        </div>
        <Button onClick={run} disabled={running} className="rounded-xl bg-slate-900 text-white hover:bg-slate-700 gap-2">
          {running ? <><Loader2 className="w-4 h-4 animate-spin" />Processando…</> : <><RefreshCw className="w-4 h-4" />Processar todos os meses</>}
        </Button>
      </div>

      {(running || state.percent > 0) && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs gap-3">
            <span className="font-medium text-slate-700">{state.stage}</span>
            <span className="font-bold text-slate-800">{state.percent}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-slate-800 transition-all duration-500" style={{ width: `${state.percent}%` }} />
          </div>
          <div className="flex justify-between gap-3 text-[10px] text-gray-500 flex-wrap">
            <span>{state.imported} importados · {state.updated} atualizados · {state.corrected} corrigidos · {state.errors} erros</span>
            {running && <span>Tempo restante: {formatTime(state.eta)}</span>}
            {!running && state.percent === 100 && <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="w-3 h-3" />Concluído</span>}
          </div>
        </div>
      )}
    </div>
  );
}
