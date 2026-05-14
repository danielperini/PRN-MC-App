import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { RotateCw, LayoutDashboard, User, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';

import CoordDashboard from '../components/dashboard/CoordDashboard';
import ComplianceStats from '../components/dashboard/ComplianceStats';
import NewsCarousel from '../components/dashboard/NewsCarousel';
import ExecutiveIndicators from '../components/dashboard/ExecutiveIndicators';
import DashboardProfissional from './DashboardProfissional';
import DashboardPatrocinador from './DashboardPatrocinador';
import GaleriaTickerCarousel from '../components/dashboard/GaleriaTickerCarousel';
import DiariamenteNosMuseus from '../components/dashboard/DiariamenteNosMuseus';

import { usePullToRefresh } from '../hooks/usePullToRefresh';

const DASHBOARD_VIEW_KEY = 'museus_centro_dashboard_view_mode';

function DashboardViewSelector({ value, onChange }) {
  const options = [
    {
      key: 'coordenador',
      label: 'Coordenador',
      icon: LayoutDashboard,
    },
    {
      key: 'profissional',
      label: 'Profissional',
      icon: User,
    },
    {
      key: 'observador',
      label: 'Observador',
      icon: Eye,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.key;

        return (
          <Button
            key={option.key}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(option.key)}
            className={`gap-2 rounded-xl px-3 ${
              active
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function DashboardCoordenadorView({
  containerRef,
  currentMonth,
  currentYear,
  isRefreshing,
  handleRefresh,
  allReports,
  myReports,
  loadingAll,
  isCoordenador,
  rubricas,
  dashboardViewMode,
  setDashboardViewMode,
}) {
  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">
              Dashboard
            </h1>

            <p className="text-sm text-muted-foreground mt-1">
              Atualização automática ativa
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isCoordenador && (
              <DashboardViewSelector
                value={dashboardViewMode}
                onChange={setDashboardViewMode}
              />
            )}

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
        </div>

        <GaleriaTickerCarousel />

        <NewsCarousel />

        <DiariamenteNosMuseus />

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

function DashboardInner() {
  const {
    user: currentUser,
    isLoading: userLoading,
    isCoordenador
  } = useCurrentUser();

  const [isRefreshing, setIsRefreshing] =
    React.useState(false);

  const [dashboardViewMode, setDashboardViewModeState] = React.useState(() => {
    try {
      return localStorage.getItem(DASHBOARD_VIEW_KEY) || 'coordenador';
    } catch {
      return 'coordenador';
    }
  });

  const setDashboardViewMode = React.useCallback((mode) => {
    setDashboardViewModeState(mode);
    try {
      localStorage.setItem(DASHBOARD_VIEW_KEY, mode);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!isCoordenador && dashboardViewMode !== 'coordenador') {
      setDashboardViewModeState('coordenador');
      try {
        localStorage.removeItem(DASHBOARD_VIEW_KEY);
      } catch {}
    }
  }, [isCoordenador, dashboardViewMode]);

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

  if (isCoordenador && dashboardViewMode === 'profissional') {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-6 md:pt-10">
          <div className="flex justify-end mb-4">
            <DashboardViewSelector
              value={dashboardViewMode}
              onChange={setDashboardViewMode}
            />
          </div>
        </div>
        <DashboardProfissional />
      </div>
    );
  }

  if (isCoordenador && dashboardViewMode === 'observador') {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">
                Dashboard Observador
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Visão institucional restaurada para coordenadores.
              </p>
            </div>
            <DashboardViewSelector
              value={dashboardViewMode}
              onChange={setDashboardViewMode}
            />
          </div>

          <GaleriaTickerCarousel />

          <NewsCarousel />

          <DiariamenteNosMuseus />

          <DashboardPatrocinador />
        </div>
      </div>
    );
  }

  return (
    <DashboardCoordenadorView
      containerRef={containerRef}
      currentMonth={currentMonth}
      currentYear={currentYear}
      isRefreshing={isRefreshing}
      handleRefresh={handleRefresh}
      allReports={allReports}
      myReports={myReports}
      loadingAll={loadingAll}
      isCoordenador={isCoordenador}
      rubricas={rubricas}
      dashboardViewMode={dashboardViewMode}
      setDashboardViewMode={setDashboardViewMode}
    />
  );
}

export default function Dashboard() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}