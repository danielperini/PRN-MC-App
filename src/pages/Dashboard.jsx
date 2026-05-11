import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

import CoordDashboard from '../components/dashboard/CoordDashboard';
import ComplianceStats from '../components/dashboard/ComplianceStats';
import NewsCarousel from '../components/dashboard/NewsCarousel';
import ExecutiveIndicators from '../components/dashboard/ExecutiveIndicators';

import { usePullToRefresh } from '../hooks/usePullToRefresh';

function DashboardInner() {
  const {
    user: currentUser,
    isLoading: userLoading,
    isCoordenador
  } = useCurrentUser();

  const [isRefreshing, setIsRefreshing] =
    React.useState(false);

  const now = new Date();

  const monthNames = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro'
  ];

  const currentMonth =
    monthNames[now.getMonth()];

  const currentYear =
    now.getFullYear();

  const {
    data: allReports = [],
    isLoading: loadingAll,
    refetch: refetchAll
  } = useQuery({
    queryKey: ['all-reports'],
    queryFn: async () => {
      try {
        const data =
          await base44.entities.Report.list(
            '-created_date',
            200
          );

        return Array.isArray(data)
          ? data
          : [];
      } catch {
        return [];
      }
    },
    enabled: isCoordenador
  });

  const {
    data: myReports = [],
    refetch: refetchMy
  } = useQuery({
    queryKey: ['my-reports', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) {
        return [];
      }

      try {
        const data =
          await base44.entities.Report.filter(
            {
              created_by: currentUser.email
            },
            '-created_date'
          );

        return Array.isArray(data)
          ? data
          : [];
      } catch {
        return [];
      }
    },
    enabled:
      !!currentUser?.email &&
      !userLoading
  });

  const {
    data: rubricas = []
  } = useQuery({
    queryKey: ['dashboard-rubricas'],
    queryFn: async () => {
      try {
        const data =
          await base44.entities.Rubrica.list(
            'rubrica',
            1000
          );

        return Array.isArray(data)
          ? data.filter(
              (r) => r.ativo !== false
            )
          : [];
      } catch {
        return [];
      }
    },
    enabled:
      !!currentUser?.email
  });

  const refetchDashboardData =
    React.useCallback(async () => {
      await refetchMy();

      if (isCoordenador) {
        await refetchAll();
      }

      window.dispatchEvent(
        new CustomEvent(
          'dashboard:update'
        )
      );
    }, [
      refetchMy,
      refetchAll,
      isCoordenador
    ]);

  React.useEffect(() => {
    let dailyTimer = null;

    const scheduleDailyUpdate = () => {
      if (dailyTimer) {
        clearTimeout(dailyTimer);
      }

      const now = new Date();

      const nextUpdate =
        new Date();

      nextUpdate.setHours(
        23,
        59,
        0,
        0
      );

      if (now >= nextUpdate) {
        nextUpdate.setDate(
          nextUpdate.getDate() + 1
        );
      }

      const timeout =
        nextUpdate.getTime() -
        now.getTime();

      dailyTimer = setTimeout(
        async () => {
          await refetchDashboardData();

          localStorage.setItem(
            'dashboard-update',
            Date.now().toString()
          );

          scheduleDailyUpdate();
        },
        timeout
      );
    };

    const handleDashboardUpdate =
      () => {
        refetchDashboardData();
      };

    const handleStorageUpdate =
      (event) => {
        if (
          event.key ===
          'dashboard-update'
        ) {
          refetchDashboardData();
        }
      };

    const unsubReport =
      base44.entities.Report.subscribe(
        () => {
          refetchDashboardData();

          localStorage.setItem(
            'dashboard-update',
            Date.now().toString()
          );
        }
      );

    const unsubActivity =
      base44.entities.Activity.subscribe(
        () => {
          refetchDashboardData();

          localStorage.setItem(
            'dashboard-update',
            Date.now().toString()
          );
        }
      );

    window.addEventListener(
      'dashboard:update',
      handleDashboardUpdate
    );

    window.addEventListener(
      'storage',
      handleStorageUpdate
    );

    scheduleDailyUpdate();

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

  const handleRefresh =
    async () => {
      setIsRefreshing(true);

      try {
        await refetchDashboardData();

        localStorage.setItem(
          'dashboard-update',
          Date.now().toString()
        );

        window.dispatchEvent(
          new CustomEvent(
            'dashboardRefreshed'
          )
        );
      } finally {
        setIsRefreshing(false);
      }
    };

  const {
    containerRef
  } = usePullToRefresh(
    handleRefresh
  );

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-white"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-black">
              Dashboard
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              Atualização automática ativa
            </p>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RotateCw
              className={`w-4 h-4 ${
                isRefreshing
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </Button>
        </div>

        <NewsCarousel />

        <ComplianceStats
          currentMonth={
            currentMonth
          }
          currentYear={
            currentYear
          }
        />

        <CoordDashboard
          reports={
            isCoordenador
              ? allReports
              : myReports
          }
          isLoading={
            loadingAll
          }
        />

        <ExecutiveIndicators
          reports={
            isCoordenador
              ? allReports
              : myReports
          }
          rubricas={rubricas}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
