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
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
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
                ? 'bg-black text-white hover:bg-black hover:text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-black'
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
      className="min-h-screen bg-white"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-black">
              Dashboard
            </h1>

            <p className="text-xs font-bold text-gray-500 mt-1">
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

function DashboardInner() {
  return null;
}

export default function Dashboard() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
