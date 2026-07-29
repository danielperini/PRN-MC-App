import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Hook para gerenciar edições inline de atividades no Dashboard.
 * Controla estado de edições pendentes e salva tudo de uma vez.
 */
export function useActivityEdits({ onSaved } = {}) {
  // Map de { activityId: { classificacao, meta_codigo, museu } }
  const [edits, setEdits] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const setEdit = useCallback((activityId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [activityId]: { ...(prev[activityId] || {}), [field]: value },
    }));
  }, []);

  const clearEdits = useCallback(() => setEdits({}), []);

  const dirtyCount = Object.keys(edits).length;

  const saveAll = useCallback(async () => {
    if (dirtyCount === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(
        Object.entries(edits).map(([id, fields]) =>
          base44.entities.Activity.update(id, fields)
        )
      );
      toast.success(`${dirtyCount} atividade${dirtyCount > 1 ? 's' : ''} atualizada${dirtyCount > 1 ? 's' : ''} com sucesso!`);
      setEdits({});
      onSaved?.();
    } catch (e) {
      toast.error(`Erro ao salvar: ${e?.message || 'tente novamente'}`);
    } finally {
      setIsSaving(false);
    }
  }, [edits, dirtyCount, onSaved]);

  return { edits, setEdit, saveAll, isSaving, dirtyCount, clearEdits };
}