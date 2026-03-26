import { toast } from 'sonner';

export function getErrorMessage(error, fallback = 'Não foi possível concluir a ação.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  if (typeof error?.error === 'string' && error.error.trim()) return error.error;
  if (typeof error?.data?.error === 'string' && error.data.error.trim()) return error.data.error;
  return fallback;
}

export async function runWithFeedback(actionFn, messages = {}) {
  const {
    loading = 'Processando...',
    success = 'Ação concluída com sucesso.',
    error = 'Erro ao processar. Tente novamente.',
    successDescription,
    errorDescription,
  } = messages;

  const toastId = toast.loading(loading);

  try {
    const result = await actionFn();

    toast.dismiss(toastId);
    toast.success(success, {
      description: successDescription,
    });

    return result;
  } catch (err) {
    toast.dismiss(toastId);
    toast.error(error, {
      description: errorDescription || getErrorMessage(err, error),
    });
    throw err;
  }
}

export function successToast(title, description) {
  toast.success(title, { description });
}

export function errorToast(title, error, fallbackDescription) {
  toast.error(title, {
    description: getErrorMessage(error, fallbackDescription),
  });
}

export function loadingToast(title = 'Processando...') {
  return toast.loading(title);
}

export function dismissToast(toastId) {
  if (toastId) toast.dismiss(toastId);
}
