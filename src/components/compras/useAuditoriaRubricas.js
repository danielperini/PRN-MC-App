import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

export function useAuditoriaRubricas(autoLoad = true) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [inconsistencias, setInconsistencias] = useState([]);
  const [error, setError] = useState(null);

  const fetchAuditoria = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await base44.functions.invoke('recalculateAllRubricas', {
        trigger: 'auditoria'
      });

      setData(res || {});
      setInconsistencias(res?.inconsistencias || []);

    } catch (e) {
      console.error('Erro auditoria:', e);
      setError(e.message || 'Erro ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    fetchAuditoria();
  }, [fetchAuditoria]);

  useEffect(() => {
    if (autoLoad) {
      fetchAuditoria();
    }
  }, [autoLoad, fetchAuditoria]);

  return {
    loading,
    data,
    inconsistencias,
    error,
    refresh
  };
}
