import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Hook customizado para evitar duplicação de toasts com Sonner
 * - Força duration 3000ms
 * - Máx 3 toasts visíveis
 * - Deduplica mensagens
 */
export function useSmartToast() {
  const activeToastsRef = useRef(new Set());

  const show = useCallback((message, type = 'success', duration = 3000) => {
    if (activeToastsRef.current.has(message)) return;

    activeToastsRef.current.add(message);

    toast[type](message, {
      duration,
      onDismiss: () => activeToastsRef.current.delete(message),
    });
  }, []);

  const success = useCallback((msg, desc = '') => {
    show(desc || msg, 'success', 3000);
  }, [show]);

  const error = useCallback((msg, desc = '') => {
    show(desc || msg, 'error', 3000);
  }, [show]);

  const warning = useCallback((msg, desc = '') => {
    show(desc || msg, 'warning', 3000);
  }, [show]);

  const info = useCallback((msg, desc = '') => {
    show(desc || msg, 'info', 3000);
  }, [show]);

  return {
    success,
    error,
    warning,
    info,
    toast: show,
  };
}