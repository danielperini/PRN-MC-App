import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RecalcularTotaisButton({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handleRecalcular() {
    if (!window.confirm('Recalcular rubricas e totais financeiros?\n\nIsso irá:\n• Normalizar centros de custo\n• Detectar e marcar duplicatas\n• Recalcular totais dos cards\n\nNenhum registro será deletado.')) return;

    setLoading(true);
    setResultado(null);
    try {
      // Operações privilegiadas ficam na função de backend. O cliente web
      // nunca deve acessar asServiceRole, pois não possui serviceToken.
      const response = await base44.functions.invoke('recalcularSaldosRubricas', {
        corrigir_duplicidades: true,
      });
      const payload = response?.data || response || {};
      if (payload.success === false) throw new Error(payload.error || 'Falha ao recalcular rubricas.');

      const res = {
        total_nfs: Number(payload.comprasLidas || 0),
        ativas: Number(payload.comprasContabilizadas || 0),
        duplicatas_detectadas: Number(payload.duplicatasDetectadas || 0),
        nfs_corrigidas: Number(payload.duplicatasCorrigidas || 0),
        rubricas_atualizadas: Number(payload.atualizadas || 0),
        total_utilizado: Number(payload.totalUtilizado || 0),
      };

      setResultado(res);
      toast.success(`Recálculo concluído — ${res.duplicatas_detectadas} duplicata(s), ${res.rubricas_atualizadas} rubrica(s) atualizada(s).`);

      if (onDone) onDone();
    } catch (e) {
      toast.error('Erro no recálculo: ' + (e?.message || 'desconhecido'));
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRecalcular}
        disabled={loading}
        className="flex items-center gap-2 border-amber-300 text-amber-800 hover:bg-amber-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {loading ? 'Recalculando...' : 'Recalcular rubricas e totais'}
      </Button>

      {resultado && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-green-900">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Recálculo concluído
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
            <span>NFs analisadas:</span><span className="font-medium">{resultado.total_nfs}</span>
            <span>Status ativo:</span><span className="font-medium">{resultado.ativas}</span>
            <span>Duplicatas detectadas:</span>
            <span className={`font-medium ${resultado.duplicatas_detectadas > 0 ? 'text-amber-700' : ''}`}>
              {resultado.duplicatas_detectadas}
            </span>
            <span>Rubricas atualizadas:</span><span className="font-medium">{resultado.rubricas_atualizadas}</span>
            <span>Total utilizado válido:</span>
            <span className="font-medium">{fmt(resultado.total_utilizado)}</span>
          </div>
          {resultado.duplicatas_detectadas > 0 && (
            <div className="flex items-center gap-1 text-amber-700 mt-1">
              <AlertTriangle className="h-3 w-3" />
              Duplicatas marcadas — verifique a tabela
            </div>
          )}
        </div>
      )}
    </div>
  );
}
