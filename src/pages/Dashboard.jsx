import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SyncOrchestrator from '@/services/SyncOrchestrator';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import LoadingPage from '@/components/common/LoadingPage';
import { prefetchCriticalAppData } from '@/lib/prefetchAppData';
import { RotateCw, LayoutDashboard, User, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';

import CoordDashboard from '../components/dashboard/CoordDashboard';
import ComplianceStats from '../components/dashboard/ComplianceStats';
import BudgetByGroupCards from '../components/dashboard/BudgetByGroupCards';
import NewsCarousel from '../components/dashboard/NewsCarousel';
import ExecutiveIndicators from '../components/dashboard/ExecutiveIndicators';
import MetasAditivoSection from '../components/dashboard/MetasAditivoSection';
import ResumoAtividadesPorMeta from '../components/dashboard/ResumoAtividadesPorMeta';
import MetasCumprimentoPorMuseu from '../components/dashboard/MetasCumprimentoPorMuseu';
import CumprimentoMetasFisicas from '../components/dashboard/CumprimentoMetasFisicas';
import ResumoConsolidadoNoturnoMeta20 from '../components/dashboard/ResumoConsolidadoNoturnoMeta20';

import DashboardProfissional from './DashboardProfissional.jsx';
import DashboardPatrocinador from './DashboardPatrocinador';
import GaleriaTickerCarousel from '../components/dashboard/GaleriaTickerCarousel';
import DiariamenteNosMuseus from '../components/dashboard/DiariamenteNosMuseus';
import { consumeDashboardPriorityRefresh } from '@/utils/dashboardRefresh';
import WelcomeSplash from '@/components/dashboard/WelcomeSplash';

import { usePullToRefresh } from '../hooks/usePullToRefresh';
import useMetasPeriodoFiltro from '@/hooks/useMetasPeriodoFiltro';

import { CACHE_KEYS } from '@/utils/constants';
import { cacheService } from '@/lib/cacheService';

const DASHBOARD_VIEW_KEY = CACHE_KEYS.DASHBOARD_VIEW_MODE;

function DashboardViewSelector({ value, onChange }) {
  const options = [
    { key: 'coordenador', label: 'Coordenador', icon: LayoutDashboard },
    { key: 'profissional', label: 'Profissional', icon: User },
    { key: 'observador', label: 'Observador', icon: Eye },
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
  handleHardRefresh,
  filtroMetas,
}) {
  return (
    <div ref={containerRef} className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">
              Painel Coordenação
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
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleHardRefresh}
              disabled={isRefreshing}
            >
              Atualização Forçada
            </Button>
          </div>
        </div>

        <GaleriaTickerCarousel />
        <NewsCarousel />
        <DiariamenteNosMuseus />

        <ComplianceStats currentMonth={currentMonth} currentYear={currentYear} />
        <BudgetByGroupCards rubricas={rubricas} />

        <CoordDashboard
          reports={isCoordenador ? allReports : myReports}
          isLoading={loadingAll}
        />

        <ExecutiveIndicators
          reports={isCoordenador ? allReports : myReports}
          rubricas={rubricas}
        />

        <MetasCumprimentoPorMuseu rubricas={rubricas} />

        <MetasAditivoSection rubricas={rubricas} filtro={filtroMetas} />

        <ResumoConsolidadoNoturnoMeta20 dataInicio={filtroMetas?.dataInicio} dataFim={filtroMetas?.dataFim} />

        <CumprimentoMetasFisicas dataInicio={filtroMetas?.dataInicio} dataFim={filtroMetas?.dataFim} />

        <ResumoAtividadesPorMeta />
      </div>
    </div>
  );
}

function DashboardInner() {
  const { user: currentUser, isLoading: userLoading, isCoordenador } = useCurrentUser();
  const queryClient = useQueryClient();

  const SPLASH_KEY = 'museus_centro_splash_shown';
  const [showSplash, setShowSplash] = React.useState(() => {
    try { return !sessionStorage.getItem(SPLASH_KEY); } catch { return false; }
  });

  const handleSplashDone = React.useCallback(() => {
    try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch {}
    setShowSplash(false);
  }, []);

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const [dashboardViewMode, setDashboardViewModeState] = React.useState(() => {
    return cacheService.getDashboardViewMode() || 'coordenador';
  });

  const setDashboardViewMode = React.useCallback((mode) => {
    setDashboardViewModeState(mode);
    cacheService.saveDashboardViewMode(mode);
  }, []);

  React.useEffect(() => {
    if (!isCoordenador) {
      cacheService.clearDashboardViewMode();
    }
  }, [isCoordenador]);

  React.useEffect(() => {
    prefetchCriticalAppData(queryClient, currentUser);
  }, [queryClient, currentUser?.email]);

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
    'Dezembro',
  ];

  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  const {
    data: allReports = [],
    isLoading: loadingAll,
    isFetching: fetchingAll,
    refetch: refetchAll,
  } = useQuery({
    queryKey: ['all-reports'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Report.list('-created_date', 200);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!currentUser?.email && isCoordenador,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const {
    data: myReports = [],
    isLoading: loadingMy,
    isFetching: fetchingMy,
    refetch: refetchMy,
  } = useQuery({
    queryKey: ['my-reports', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];

      try {
        const data = await base44.entities.Report.filter(
          { created_by: currentUser.email },
          '-created_date'
        );

        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!currentUser?.email && !userLoading,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const {
    data: rubricas = [],
    isLoading: loadingRubricas,
    isFetching: fetchingRubricas,
    refetch: refetchRubricas,
  } = useQuery({
    queryKey: ['dashboard-rubricas'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Rubrica.list('rubrica', 1000);
        return Array.isArray(data) ? data.filter((r) => r.ativo !== false) : [];
      } catch {
        return [];
      }
    },
    enabled: !!currentUser?.email,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const refetchDashboardData = React.useCallback(async () => {
    await Promise.all([
      refetchMy(),
      refetchRubricas(),
      isCoordenador ? refetchAll() : Promise.resolve(),
    ]);
  }, [refetchMy, refetchRubricas, refetchAll, isCoordenador]);

  React.useEffect(() => {
    if (!currentUser?.email) return undefined;

    let dailyTimer = null;
    let isUnmounted = false;

    const scheduleDailyUpdate = () => {
      if (dailyTimer) clearTimeout(dailyTimer);

      const nowDate = new Date();
      const nextUpdate = new Date();

      nextUpdate.setHours(23, 59, 0, 0);

      if (nowDate >= nextUpdate) {
        nextUpdate.setDate(nextUpdate.getDate() + 1);
      }

      const timeout = nextUpdate.getTime() - nowDate.getTime();

      dailyTimer = setTimeout(async () => {
        if (isUnmounted) return;

        await refetchDashboardData();

        try {
          localStorage.setItem(CACHE_KEYS.DASHBOARD_UPDATE, Date.now().toString());
        } catch {}

        scheduleDailyUpdate();
      }, timeout);
    };

    const handleDashboardUpdate = () => {
      refetchDashboardData();
    };

    const handleStorageUpdate = (event) => {
      if (event.key === CACHE_KEYS.DASHBOARD_UPDATE) {
        refetchDashboardData();
      }
    };

    const clearReportPreviewCaches = () => {
      const keys = [
        'relatorio_fisico_financeiro_html',
        'relatorio_fisico_financeiro_meta',
        'relatorio_fisico_financeiro_dados_html',
        'relatorio_fisico_financeiro_dados_meta',
        'relatorio_fisico_financeiro_galeria_html',
        'relatorio_fisico_financeiro_galeria_meta',
        'relatorio_fisico_financeiro_html_saved_at',
        'relatorio_fisico_financeiro_dados_html_saved_at',
        'relatorio_fisico_financeiro_galeria_html_saved_at',
        'relatorio_fisico_financeiro_selected_chapters',
        'relatorio_fisico_financeiro_all_chapters',
        'relatorio_fisico_financeiro_export_mode',
        'relatorio_fisico_financeiro_export_volume',
      ];
      keys.forEach((key) => {
        try { sessionStorage.removeItem(key); } catch {}
        try { localStorage.removeItem(key); } catch {}
      });
    };

    const clearDashboardCaches = () => {
      const keys = [
        'dashboard-update',
        CACHE_KEYS.NEWS_HIGHLIGHT_CACHE_V2,
        CACHE_KEYS.NEWS_HIGHLIGHT_CACHE_V3,
        CACHE_KEYS.RELATORIOS_LIST,
      ];
      keys.forEach((key) => {
        try { localStorage.removeItem(key); } catch {}
      });
    };

    const hardRefreshHandler = async () => {
      clearReportPreviewCaches();
      clearDashboardCaches();
      SyncOrchestrator.emit(SyncOrchestrator.EVENTS.DASHBOARD_UPDATE);
      await refetchDashboardData();
      try {
        localStorage.setItem(CACHE_KEYS.DASHBOARD_UPDATE, Date.now().toString());
      } catch {}
      return { ok: true, refreshedAt: new Date().toISOString() };
    };

    window.museusCentroHardRefresh = hardRefreshHandler;

    let unsubReport = null;
    let unsubActivity = null;

    try {
      unsubReport = base44.entities.Report.subscribe(() => {
        refetchDashboardData();

        try {
          localStorage.setItem(CACHE_KEYS.DASHBOARD_UPDATE, Date.now().toString());
        } catch {}
      });
    } catch {}

    try {
      unsubActivity = base44.entities.Activity.subscribe(() => {
        refetchDashboardData();

        try {
          localStorage.setItem(CACHE_KEYS.DASHBOARD_UPDATE, Date.now().toString());
        } catch {}
      });
    } catch {}

    window.addEventListener('dashboard:update', handleDashboardUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    scheduleDailyUpdate();

    return () => {
      isUnmounted = true;

      if (dailyTimer) {
        clearTimeout(dailyTimer);
      }

      if (typeof unsubReport === 'function') {
        unsubReport();
      }

      if (typeof unsubActivity === 'function') {
        unsubActivity();
      }

      window.removeEventListener('dashboard:update', handleDashboardUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
      try {
        if (window.museusCentroHardRefresh === hardRefreshHandler) {
          delete window.museusCentroHardRefresh;
        }
      } catch {}
    };
  }, [currentUser?.email, refetchDashboardData]);

  React.useEffect(() => {
    if (!currentUser?.email) return;
    const pendingRefresh = consumeDashboardPriorityRefresh();
    if (!pendingRefresh) return;
    refetchDashboardData();
  }, [currentUser?.email, refetchDashboardData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      await refetchDashboardData();

      try {
        localStorage.setItem(CACHE_KEYS.DASHBOARD_UPDATE, Date.now().toString());
      } catch {}

      SyncOrchestrator.emit('dashboard:refreshed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleHardRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (typeof window.museusCentroHardRefresh === 'function') {
        await window.museusCentroHardRefresh();
      } else {
        await refetchDashboardData();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const { containerRef } = usePullToRefresh(handleRefresh);

  const filtroMetas = useMetasPeriodoFiltro();

  const isInitialPageLoading =
    userLoading ||
    (!!currentUser?.email &&
      (loadingMy ||
        loadingRubricas ||
        (isCoordenador && loadingAll)));

  const isPageFetching =
    fetchingMy ||
    fetchingRubricas ||
    (isCoordenador && fetchingAll);

  if (showSplash) {
    return <WelcomeSplash userName={currentUser?.full_name} onDone={handleSplashDone} />;
  }

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando todas as informações do painel. Aguarde alguns instantes."
      />
    );
  }

  if (!userLoading && currentUser && !isCoordenador) {
    return <DashboardProfissional />;
  }

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
              <p className="text-xs text-muted-foreground mt-1">
                Última sincronização: {new Date().toLocaleString('pt-BR')}
              </p>
            </div>

            <DashboardViewSelector
              value={dashboardViewMode}
              onChange={setDashboardViewMode}
            />
          </div>

          {isPageFetching ? (
            <LoadingPage
              fullHeight={false}
              message="Atualizando informações..."
              description="Estamos sincronizando os dados mais recentes do painel."
            />
          ) : null}

          <GaleriaTickerCarousel />
          <NewsCarousel />
          <DiariamenteNosMuseus />
          <MetasAditivoSection rubricas={rubricas} filtro={filtroMetas} />
          <ResumoConsolidadoNoturnoMeta20 dataInicio={filtroMetas.dataInicio} dataFim={filtroMetas.dataFim} />
          <CumprimentoMetasFisicas dataInicio={filtroMetas.dataInicio} dataFim={filtroMetas.dataFim} />
          <ResumoAtividadesPorMeta />
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
      handleHardRefresh={handleHardRefresh}
      filtroMetas={filtroMetas}
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