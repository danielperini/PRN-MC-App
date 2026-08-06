import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  ChevronDown,
  RefreshCw,
  Loader2,
  HardDrive,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import PreencherDatasButton from '@/components/compras/PreencherDatasButton';

const LAST_KEY = 'entrada_unica:sync-drive-last';
const RESULT_KEY = 'entrada_unica:sync-drive-last-result';
const POLL_MS = 3000;

function formatDate(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function loadLast() {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function loadLastResult() {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Painel colapsável "Sincronização com o Drive" para a Entrada Única.
 * Visível apenas para admin/coordenador. Permite disparar a sincronização
 * (NFs + comprovantes) e acompanha o andamento via polling de BackupLog.
 */
export default function PainelSyncDrive({ onRefresh }) {
  const [collapsed, setCollapsed] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastTs, setLastTs] = useState(loadLast);
  const [lastResult, setLastResult] = useState(loadLastResult);
  const [liveStatus, setLiveStatus] = useState(null); // 'em_processamento' | 'concluido' | 'failure' | null
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const logs = await base44.entities.BackupLog.filter(
        { backup_type: 'auditoria_entrada_unica' },
        '-created_date',
        1
      );
      const latest = Array.isArray(logs) && logs[0];
      if (!latest) return;
      setLiveStatus(String(latest.status || '').toLowerCase());
      if (latest.status !== 'em_processamento') {
        stopPolling();
        setLastTs(Date.now());
        try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch {}
      }
    } catch (e) {
      // silencioso
    }
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setLiveStatus('em_processamento');
    // Inicia polling
    stopPolling();
    pollRef.current = setInterval(pollOnce, POLL_MS);

    try {
      const res = await base44.functions.invoke('sincronizarDriveEntradaUnica', {
        mode: 'execute',
        incluir_comprovantes: true,
        triggered_by: 'manual',
      });
      const data = res?.data || res || {};
      setLastResult(data);
      try { localStorage.setItem(RESULT_KEY, JSON.stringify(data)); } catch {}
      setLastTs(Date.now());
      try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch {}
      toast.success(
        `Sincronização concluída: ${data.total_sincronizado || 0} sincronizados, ${data.total_duplicado_bloqueado || 0} duplicados, ${data.total_recibos || 0} comprovantes.`
      );
      if (typeof onRefresh === 'function') onRefresh();
    } catch (e) {
      toast.error('Erro na sincronização: ' + (e?.message || e));
    } finally {
      setSyncing(false);
      stopPolling();
      // Atualiza status final do BackupLog
      pollOnce();
    }
  }

  const inProgress = syncing || liveStatus === 'em_processamento';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive className="w-4 h-4 text-gray-700 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-800">Sincronização com o Drive</span>
          <span className="text-xs text-gray-400 hidden sm:inline">· última execução {formatDate(lastTs)}</span>
        </div>
        <div className="flex items-center gap-2">
          {inProgress && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />}
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Lê documentos fiscais (PDF/XML) e comprovantes de pagamento do Google Drive, desduplica e cria entradas na fila da Entrada Única.
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSync}
              disabled={inProgress}
              className="inline-flex items-center gap-1.5 rounded-xl bg-black text-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {inProgress ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
            <PreencherDatasButton onDone={onRefresh} />
            <span className="text-xs text-gray-400">inclui comprovantes (RECIBO_PDF)</span>
          </div>

          {inProgress && (
            <div className="space-y-1.5">
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-2 bg-gray-400 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Acompanhando status da execução...
              </p>
            </div>
          )}

          {lastResult && !inProgress && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
              <div className="flex items-center gap-1.5 mb-2 text-gray-800 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Último resultado
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <li>Analisados: <strong>{lastResult.total_analisado ?? 0}</strong></li>
                <li>Sincronizados: <strong>{lastResult.total_sincronizado ?? 0}</strong></li>
                <li>Duplicados bloqueados: <strong>{lastResult.total_duplicado_bloqueado ?? 0}</strong></li>
                <li>Comprovantes: <strong>{lastResult.total_recibos ?? 0}</strong></li>
                <li>Ignorados (extensão): <strong>{lastResult.total_ignorado_extensao ?? 0}</strong></li>
                <li>Erros: <strong>{lastResult.erros?.length ?? 0}</strong></li>
              </ul>
            </div>
          )}

          {liveStatus === 'failure' && !syncing && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> A última execução registrou falha. Verifique o log em Auditoria.
            </p>
          )}
        </div>
      )}
    </div>
  );
}