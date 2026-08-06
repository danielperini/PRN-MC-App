import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Dispara silenciosamente, ao montar a Entrada Única, a função backend
 * `reclassificarComprovantesMalClassificados` com apenas_novos=true (documentos
 * criados há menos de 24h). Comprovantes de pagamento mal classificados como
 * NOTA_FISCAL_PDF são reclassificados para RECIBO_PDF, ocultados da fila
 * principal e (quando possível) vinculados a PurchaseRequests pelo número da
 * NF extraído do nome do arquivo.
 *
 * Erros são engolidos silenciosamente (log de warning). Se houver mudanças
 * (reclassificados > 0 ou vinculados > 0), chama onUpdate() para recarregar a
 * fila.
 *
 * @param {() => void|Promise<void>} onUpdate - callback de recarga da fila
 */
export default function useReclassificarComprovantesSilencioso(onUpdate) {
  const ref = useRef(onUpdate);
  useEffect(() => {
    ref.current = onUpdate;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('reclassificarComprovantesMalClassificados', { apenas_novos: true });
        if (cancelled) return;
        const data = res?.data || res || {};
        if (data?.ok === false) {
          console.warn('[reclassificarComprovantesSilencioso] backend reportou erro:', data.error);
          return;
        }
        if (data.ok && (data.reclassificados > 0 || data.vinculados > 0)) {
          const fn = ref.current;
          if (typeof fn === 'function') {
            try { await fn(); } catch (_e) { /* não bloqueia */ }
          }
        }
      } catch (e) {
        console.warn('[reclassificarComprovantesSilencioso] silencioso:', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}