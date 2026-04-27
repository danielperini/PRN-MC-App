import { useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';

/**
 * Hook customizado para evitar duplicação de toasts
 * - Só exibe 1 toast por tipo de evento
 * - Dismiss anterior antes de novo (se houver)
 * - Padrão visual consistente
 * - Timeout automático 3s
 */
export function useSmartToast() {
  const { toast, dismiss } = useToast();
  const lastToastKeyRef = useRef(null);

  const showToast = useCallback((config) => {
    const { key = 'default', title, description, variant = 'default', duration = 3000 } = config;

    // Dismiss toast anterior se existir e for mesma chave
    if (lastToastKeyRef.current === key) {
      dismiss(lastToastKeyRef.current);
    }

    const id = toast({
      title,
      description,
      variant,
      duration,
    });

    lastToastKeyRef.current = key;
    return id;
  }, [toast, dismiss]);

  const success = useCallback((title, description = '') => {
    return showToast({
      key: 'success',
      title: `✅ ${title}`,
      description,
      variant: 'default',
    });
  }, [showToast]);

  const error = useCallback((title, description = '') => {
    return showToast({
      key: 'error',
      title: `❌ ${title}`,
      description,
      variant: 'destructive',
    });
  }, [showToast]);

  const info = useCallback((title, description = '') => {
    return showToast({
      key: 'info',
      title,
      description,
      variant: 'default',
    });
  }, [showToast]);

  const warning = useCallback((title, description = '') => {
    return showToast({
      key: 'warning',
      title: `⚠️ ${title}`,
      description,
      variant: 'default',
    });
  }, [showToast]);

  return {
    toast: showToast,
    success,
    error,
    info,
    warning,
    dismiss,
  };
}