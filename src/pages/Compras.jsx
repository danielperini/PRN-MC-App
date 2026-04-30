async function recalcularTodasRubricas() {
  if (!window.confirm('Executar agora a restauração/recalculo das rubricas oficiais do 3º Aditivo?')) return;

  setRecalculando(true);

  try {
    let result = null;

    try {
      const response = await base44.functions.invoke('recalculateAllRubricas', {});
      result = response?.data || response;
    } catch (errorInvoke) {
      console.error('Falha em base44.functions.invoke:', errorInvoke);

      if (typeof base44.functions.recalculateAllRubricas === 'function') {
        const response = await base44.functions.recalculateAllRubricas();
        result = response?.data || response;
      } else {
        throw errorInvoke;
      }
    }

    console.log('Resultado recalculateAllRubricas:', result);

    if (!result?.success) {
      throw new Error(result?.error || 'A function executou, mas não retornou success=true.');
    }

    await invalidateComprasQueries();
    await refetchRubricas();

    setTimeout(async () => {
      await invalidateComprasQueries();
      await refetchRubricas();
    }, 1200);

    smartToast.success(
      `Rubricas recalculadas. Total oficial: ${fmtBRL(result.totalOficial || result.totalBase || 1320000)}`
    );
  } catch (error) {
    console.error('Erro no recálculo:', error);
    smartToast.error('Erro ao executar function', error.message);
  } finally {
    setRecalculando(false);
  }
}
