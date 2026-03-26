import { runWithFeedback } from '@/lib/actionFeedback';

// ...

async function handleSave() {
  await runWithFeedback(
    async () => {
      // 🔒 mantém exatamente sua lógica atual de salvar
      // NÃO alterar nada dentro daqui, só mover para dentro do wrapper

      if (!reportData) return;

      await base44.entities.Report.update({
        id: reportData.id,
        ...reportData,
      });

      // se já existe refetch ou navegação, mantém
      if (typeof refetch === 'function') {
        await refetch();
      }
    },
    {
      loading: 'Salvando relatório...',
      success: 'Relatório salvo com sucesso',
      error: 'Erro ao salvar relatório',
    }
  );
}
