// ===============================
// DASHBOARD AUTO UPDATE SYSTEM
// Cole este bloco COMPLETO dentro de DashboardInner()
// logo após o useQuery de rubricas
// e antes de handleRefresh
// ===============================

const refetchDashboardData = React.useCallback(async () => {
  try {
    await refetchMy();

    if (isCoordenador) {
      await refetchAll();
    }

    window.dispatchEvent(
      new CustomEvent('dashboard:update')
    );
  } catch (error) {
    console.error('Erro ao atualizar dashboard:', error);
  }
}, [
  refetchMy,
  refetchAll,
  isCoordenador
]);

React.useEffect(() => {
  let dailyTimer = null;

  // Atualiza dashboard inteiro
  const refreshAllData = async () => {
    try {
      await refetchDashboardData();

      localStorage.setItem(
        'dashboard-update',
        Date.now().toString()
      );
    } catch (error) {
      console.error(error);
    }
  };

  // Agenda atualização diária às 23:59
  const scheduleDailyUpdate = () => {
    if (dailyTimer) {
      clearTimeout(dailyTimer);
    }

    const now = new Date();

    const nextUpdate = new Date();

    nextUpdate.setHours(23, 59, 0, 0);

    // Se já passou das 23:59 hoje
    if (now >= nextUpdate) {
      nextUpdate.setDate(
        nextUpdate.getDate() + 1
      );
    }

    const delay =
      nextUpdate.getTime() - now.getTime();

    dailyTimer = setTimeout(async () => {
      await refreshAllData();

      // reagenda próximo dia
      scheduleDailyUpdate();
    }, delay);
  };

  // Atualização por evento interno
  const handleDashboardUpdate = async () => {
    await refreshAllData();
  };

  // Atualização entre abas
  const handleStorageUpdate = async (event) => {
    if (event.key === 'dashboard-update') {
      await refreshAllData();
    }
  };

  // Atualização automática Base44
  const unsubReport =
    base44.entities.Report.subscribe(async () => {
      await refreshAllData();
    });

  const unsubActivity =
    base44.entities.Activity.subscribe(async () => {
      await refreshAllData();
    });

  // Listeners
  window.addEventListener(
    'dashboard:update',
    handleDashboardUpdate
  );

  window.addEventListener(
    'storage',
    handleStorageUpdate
  );

  // Inicializa timer diário
  scheduleDailyUpdate();

  // Cleanup
  return () => {
    if (dailyTimer) {
      clearTimeout(dailyTimer);
    }

    unsubReport();
    unsubActivity();

    window.removeEventListener(
      'dashboard:update',
      handleDashboardUpdate
    );

    window.removeEventListener(
      'storage',
      handleStorageUpdate
    );
  };
}, [refetchDashboardData]);

// ===============================
// HANDLE REFRESH COMPLETO
// substitua o handleRefresh atual
// ===============================

const handleRefresh = async () => {
  setIsRefreshing(true);

  try {
    await refetchDashboardData();

    localStorage.setItem(
      'dashboard-update',
      Date.now().toString()
    );

    window.dispatchEvent(
      new CustomEvent('dashboardRefreshed')
    );
  } catch (error) {
    console.error(error);
  } finally {
    setIsRefreshing(false);
  }
};
