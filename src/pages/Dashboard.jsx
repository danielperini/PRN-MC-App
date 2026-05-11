const refetchDashboardData = React.useCallback(async () => {
  await refetchMy();

  if (isCoordenador) {
    await refetchAll();
  }

  window.dispatchEvent(new CustomEvent('dashboard:update'));
}, [refetchMy, refetchAll, isCoordenador]);

React.useEffect(() => {
  let dailyTimer = null;

  const scheduleDailyUpdate = () => {
    if (dailyTimer) {
      clearTimeout(dailyTimer);
    }

    const now = new Date();
    const nextUpdate = new Date();

    nextUpdate.setHours(23, 59, 0, 0);

    if (now >= nextUpdate) {
      nextUpdate.setDate(nextUpdate.getDate() + 1);
    }

    dailyTimer = setTimeout(async () => {
      await refetchDashboardData();
      localStorage.setItem('dashboard-update', Date.now().toString());
      scheduleDailyUpdate();
    }, nextUpdate.getTime() - now.getTime());
  };

  const handleDashboardUpdate = () => {
    refetchDashboardData();
  };

  const handleStorageUpdate = (event) => {
    if (event.key === 'dashboard-update') {
      refetchDashboardData();
    }
  };

  const unsubReport = base44.entities.Report.subscribe(() => {
    refetchDashboardData();
    localStorage.setItem('dashboard-update', Date.now().toString());
  });

  const unsubActivity = base44.entities.Activity.subscribe(() => {
    refetchDashboardData();
    localStorage.setItem('dashboard-update', Date.now().toString());
  });

  window.addEventListener('dashboard:update', handleDashboardUpdate);
  window.addEventListener('storage', handleStorageUpdate);

  scheduleDailyUpdate();

  return () => {
    if (dailyTimer) {
      clearTimeout(dailyTimer);
    }

    unsubReport();
    unsubActivity();

    window.removeEventListener('dashboard:update', handleDashboardUpdate);
    window.removeEventListener('storage', handleStorageUpdate);
  };
}, [refetchDashboardData]);
