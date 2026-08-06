import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SyncOrchestrator from '@/services/SyncOrchestrator';

const INTERVALO_MS = 15 * 60 * 1000;
const CHAVE_ULTIMA_EXECUCAO = 'auditoria:notas-drive-auto-sync-at';
const CHAVE_PASTA = 'auditoria:notas-drive-folder-id';
const CHAVE_PASTAS = 'auditoria:notas-drive-folder-ids';

function obterPastasConfiguradas() {
  const env = String(import.meta.env.VITE_GOOGLE_DRIVE_NF_FOLDER_ID || '').trim();
  const unica = String(localStorage.getItem(CHAVE_PASTA) || '').trim();
  let varias = [];

  try {
    const parsed = JSON.parse(localStorage.getItem(CHAVE_PASTAS) || '[]');
    if (Array.isArray(parsed)) varias = parsed;
  } catch {
    varias = [];
  }

  return [...new Set([env, unica, ...varias].map((item) => String(item || '').trim()).filter(Boolean))];
}

export default function AutoNotasDriveSync() {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function sincronizar(force = false) {
      if (!mounted || runningRef.current || !navigator.onLine) return;

      const folderIds = obterPastasConfiguradas();
      if (!folderIds.length) return;

      const ultima = Number(localStorage.getItem(CHAVE_ULTIMA_EXECUCAO) || 0);
      if (!force && Date.now() - ultima < INTERVALO_MS) return;

      runningRef.current = true;
      try {
        const response = await base44.functions.invoke('syncNotasFiscaisDrive', {
          folder_id: folderIds[0],
          folder_ids: folderIds,
          origem_execucao: 'automatica_app',
        });
        const result = response?.data || response || {};
        if (result.success === false && result.erros === 0) {
          throw new Error(result.error || 'Falha na sincronização automática das notas fiscais.');
        }

        localStorage.setItem(CHAVE_ULTIMA_EXECUCAO, String(Date.now()));

        // Sincroniza também comprovantes de pagamento (RECIBO_PDF) da Entrada Única
        try {
          await base44.functions.invoke('sincronizarDriveEntradaUnica', {
            mode: 'execute',
            incluir_comprovantes: true,
            triggered_by: 'manual',
          });
        } catch (compErr) {
          console.warn('Sincronização de comprovantes do Drive:', compErr);
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['notas-drive-conciliacao-prestacao'] }),
          queryClient.invalidateQueries({ queryKey: ['purchase-requests-conciliacao-drive'] }),
          queryClient.invalidateQueries({ queryKey: ['document-intakes'] }),
          queryClient.invalidateQueries({ queryKey: ['aprovacao-nfs'] }),
        ]);

        SyncOrchestrator.emit('notas-drive:sincronizadas', result);
      } catch (error) {
        console.error('Sincronização automática das notas fiscais do Drive:', error);
      } finally {
        runningRef.current = false;
      }
    }

    const intervalId = window.setInterval(() => sincronizar(false), INTERVALO_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sincronizar(false);
    };
    const handleOnline = () => sincronizar(true);
    const handleManual = () => sincronizar(true);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('notas-drive:sync', handleManual); // retrocompat — SyncOrchestrator.emit também despacha window event

    sincronizar(false);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('notas-drive:sync', handleManual);
    };
  }, [queryClient]);

  return null;
}