import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Activity, Users, Target, FileText, ChevronRight } from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import ExecutiveIndicators from '@/components/dashboard/ExecutiveIndicators';
import MetasAditivoSection from '@/components/dashboard/MetasAditivoSection';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).includes('T') ? v : v + 'T00:00:00');
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('pt-BR');
}

function KpiCard({ label, value, icon: Icon }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

// ─── Badge de status de relatório ─────────────────────────────────────────────

const REPORT_STATUS = {
  DRAFT:      { label: 'Rascunho',    cls: 'bg-gray-100 text-gray-600' },
  SUBMITTED:  { label: 'Enviado',     cls: 'bg-blue-100 text-blue-700' },
  IN_REVIEW:  { label: 'Em revisão',  cls: 'bg-amber-100 text-amber-700' },
  RETURNED:   { label: 'Devolvido',   cls: 'bg-red-100 text-red-700' },
  APPROVED:   { label: 'Aprovado',    cls: 'bg-green-100 text-green-700' },
  ARCHIVED:   { label: 'Arquivado',   cls: 'bg-gray-100 text-gray-500' },
};

function ReportStatusBadge({ status }) {
  const cfg = REPORT_STATUS[String(status || '').toUpperCase()] || { label: status || '—', cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── Badge de classificação de atividade ──────────────────────────────────────

const CLASS_CONFIG = {
  META:   { label: 'Meta',   cls: 'bg-purple-100 text-purple-700' },
  ROTINA: { label: 'Rotina', cls: 'bg-sky-100 text-sky-700' },
  EXTRA:  { label: 'Extra',  cls: 'bg-orange-100 text-orange-700' },
};

function ClassBadge({ classificacao }) {
  const cfg = CLASS_CONFIG[String(classificacao || '').toUpperCase()] || { label: classificacao || '—', cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── Sub-tab: Relatórios ─────────────────────────────────────────────────────

function RelatoriosTab({ reports, loading }) {
  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Carregando relatórios...</div>;
  if (reports.length === 0) return <div className="py-8 text-center text-sm text-gray-400">Nenhum relatório encontrado.</div>;
  return (
    <div className="space-y-2">
      {reports.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900 truncate">
              {r.mes_referencia ? `${r.mes_referencia}/${r.ano || ''}` : r.autor_name || 'Relatório'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{r.museu || ''}</p>
          </div>
          <ReportStatusBadge status={r.status} />
          <Link
            to={`/ReportEditor?id=${r.id}`}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0"
          >
            Ver <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ))}
    </div>
  );
}

// ─── Sub-tab: Atividades ─────────────────────────────────────────────────────

function AtividadesTab({ activities, loading }) {
  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Carregando atividades...</div>;
  if (activities.length === 0) return <div className="py-8 text-center text-sm text-gray-400">Nenhuma atividade encontrada.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="text-left py-2 pr-3">Título</th>
            <th className="text-left py-2 pr-3">Data</th>
            <th className="text-left py-2 pr-3">Classificação</th>
            <th className="text-right py-2 pr-3">Público</th>
            <th className="text-left py-2">Meta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {activities.map((a, i) => (
            <tr key={a.id || i} className="hover:bg-gray-50/50">
              <td className="py-2 pr-3 text-gray-800 max-w-[200px] truncate font-medium">{a.titulo || '—'}</td>
              <td className="py-2 pr-3 text-gray-500">{fmtDate(a.data_realizacao || a.data_inicio)}</td>
              <td className="py-2 pr-3"><ClassBadge classificacao={a.classificacao} /></td>
              <td className="py-2 pr-3 text-right text-gray-700">{(a.publico_total || a.publico_estimado || 0).toLocaleString('pt-BR')}</td>
              <td className="py-2">
                {a.meta_codigo && (
                  <span className="text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5">{a.meta_codigo}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sub-tab: Resumo de Metas ─────────────────────────────────────────────────

function ResumoMetasTab({ activities, loading }) {
  const resumo = useMemo(() => {
    const map = {};
    for (const a of activities) {
      if (String(a.classificacao || '').toUpperCase() !== 'META') continue;
      const key = a.meta_codigo || a.meta_id || 'Sem código';
      if (!map[key]) map[key] = { codigo: key, count: 0, publico: 0, status: [] };
      map[key].count++;
      map[key].publico += Number(a.publico_total || a.publico_estimado || 0);
      if (a.status_meta) map[key].status.push(a.status_meta);
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [activities]);

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>;
  if (resumo.length === 0) return <div className="py-8 text-center text-sm text-gray-400">Nenhuma atividade de meta registrada.</div>;

  return (
    <div className="space-y-2">
      {resumo.map(m => {
        const statusPredominante = m.status.length > 0
          ? m.status.sort((a, b) => m.status.filter(s => s === b).length - m.status.filter(s => s === a).length)[0]
          : null;
        return (
          <div key={m.codigo} className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-xl">
            <span className="font-mono text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-1 flex-shrink-0">{m.codigo}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-800">{m.count} atividade(s)</span>
                <span className="text-xs text-gray-500">{m.publico.toLocaleString('pt-BR')} participantes</span>
              </div>
            </div>
            {statusPredominante && (
              <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{statusPredominante}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AtividadesMetasTab({ targetEmail, userMuseum, targetName }) {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: userReports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['user-reports-meusdados', targetEmail],
    queryFn: () => base44.entities.Report.filter({ created_by: targetEmail }, '-created_date', 50),
    enabled: !!targetEmail,
    staleTime: 120000,
  });

  // Busca activities vinculadas aos reports encontrados
  const reportIds = useMemo(() => userReports.map(r => r.id).filter(Boolean), [userReports]);

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['user-activities-meusdados', targetEmail, reportIds.join(',')],
    queryFn: async () => {
      if (reportIds.length === 0) return [];
      const chunks = [];
      for (let i = 0; i < reportIds.length; i += 10) chunks.push(reportIds.slice(i, i + 10));
      const results = await Promise.all(
        chunks.map(chunk =>
          Promise.all(chunk.map(id => base44.entities.Activity.filter({ report_id: id }).catch(() => [])))
        )
      );
      return results.flat(2).filter(Boolean);
    },
    enabled: reportIds.length > 0,
    staleTime: 120000,
  });

  const metrics = useDashboardMetrics(userReports, []);
  const totalAtividades = useMemo(() => activities.length || userReports.reduce((sum, r) => sum + (r.atividades?.length || 0), 0), [activities, userReports]);
  const metasComAtividade = useMemo(() => {
    const metas = new Set();
    for (const a of activities) {
      if ((a.meta_codigo || a.meta_id) && String(a.classificacao || '').toUpperCase() === 'META') {
        metas.add(a.meta_codigo || a.meta_id);
      }
    }
    return metas.size;
  }, [activities]);

  const loading = loadingReports || loadingActivities;
  const tabs = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'relatorios', label: `Relatórios (${userReports.length})` },
    { key: 'atividades', label: `Atividades (${activities.length})` },
    { key: 'metas', label: 'Resumo de Metas' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Atividades" value={totalAtividades.toLocaleString('pt-BR')} icon={Activity} />
        <KpiCard label="Público" value={metrics.totalPublico.toLocaleString('pt-BR')} icon={Users} />
        <KpiCard label="Metas c/ Atividades" value={metasComAtividade.toLocaleString('pt-BR')} icon={Target} />
        <KpiCard label="Relatórios" value={userReports.length.toLocaleString('pt-BR')} icon={FileText} />
      </div>

      {/* Sub-navegação */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da sub-tab ativa */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <ExecutiveIndicators reports={userReports} rubricas={[]} />
          <MetasAditivoSection museuFiltro={userMuseum} />
        </div>
      )}
      {activeTab === 'relatorios' && <RelatoriosTab reports={userReports} loading={loadingReports} />}
      {activeTab === 'atividades' && <AtividadesTab activities={activities} loading={loading} />}
      {activeTab === 'metas' && <ResumoMetasTab activities={activities} loading={loading} />}
    </div>
  );
}