import { toast } from "sonner";

export function errorMessage(err, fallback = "Não foi possível concluir a ação.") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err?.message) return err.message;
  return fallback;
}

/**
 * Executa uma async action com feedback padrão:
 * - toast.loading enquanto roda
 * - toast.success se ok
 * - toast.error se falhar
 */
export async function runWithFeedback(actionFn, { loading, success, error } = {}) {
  const id = toast.loading(loading || "Processando...");
  try {
    const result = await actionFn();
    toast.dismiss(id);
    toast.success(success || "Ação concluída com sucesso.");
    return result;
  } catch (err) {
    toast.dismiss(id);
    toast.error(errorMessage(err, error || "Erro ao processar. Tente novamente."));
    throw err;
  }
}
