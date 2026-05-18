import React from 'react';
import RequireAuth from '@/components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { useInstitutionalAudit } from '@/hooks/auditoria/useInstitutionalAudit';
import AuditIssueList from '@/components/auditoria/AuditIssueList';
import AuditStatusCard from '@/components/auditoria/AuditStatusCard';
import { RefreshCw, ShieldCheck } from 'lucide-react';

const fmtInt = (value) => Math.round(Number(value || 0)).toLocaleString('pt-BR');
const fmtBRL = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function AuditoriaInstitucionalInner() {
  const { data: metrics, isLoading, refetch, isFetching } = useInstitutionalAudit();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Auditando dados institucionais...</p>
        </div>
      </div>
    );
  }

  const status = metrics?.summary?.status || 'info';
  const score = metrics?.summary?.consistencyScore ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-foreground" />
              <h1 className="text-2xl font-semibold text-foreground">Auditoria Institucional</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Motor central de conciliação de público, atividades, metas, rubricas, programação, fotos e relatórios.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Reauditar
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <AuditStatusCard title="Consistência" value={`${score}%`} helper="pontuação geral" status={status} />
          <AuditStatusCard title="Público oficial" value={fmtInt(metrics?.summary?.officialAudience)} helper="sem duplicidade auditada" status="info" />
          <AuditStatusCard title="Atividades" value={fmtInt(metrics?.summary?.officialActivities)} helper={`${fmtInt(metrics?.activities?.internas)} internas separadas`} status="info" />
          <AuditStatusCard title="Execução" value={fmtBRL(metrics?.summary?.officialUsed)} helper={`${metrics?.financeiro?.percentualExecucao || 0}% do aditivo`} status="info" />
          <AuditStatusCard title="Pendências" value={fmtInt(metrics?.summary?.issueCount)} helper={`${fmtInt(metrics?.summary?.warnings)} alertas`} status={metrics?.summary?.errors ? 'red' : metrics?.summary?.warnings ? 'yellow' : 'green'} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            <AuditIssueList issues={metrics?.issues || []} />
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold text-foreground">Público auditado</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Atividades</span><strong>{fmtInt(metrics?.audience?.publicoAtividades)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Espontâneo</span><strong>{fmtInt(metrics?.audience?.publicoEspontaneo)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Visitas agendadas</span><strong>{fmtInt(metrics?.audience?.visitasAgendadas)}</strong></div>
                <div className="pt-3 border-t border-border flex justify-between gap-3"><span className="text-foreground font-medium">Total</span><strong>{fmtInt(metrics?.audience?.publicoTotal)}</strong></div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold text-foreground">Conciliação financeira</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Total oficial</span><strong>{fmtBRL(metrics?.financeiro?.officialTotal)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Utilizado</span><strong>{fmtBRL(metrics?.financeiro?.totalUtilizado)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Saldo</span><strong>{fmtBRL(metrics?.financeiro?.saldo)}</strong></div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold text-foreground">Rastreabilidade visual</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Fotos únicas</span><strong>{fmtInt(metrics?.gallery?.photos?.length)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Duplicadas</span><strong>{fmtInt(metrics?.gallery?.duplicatePhotos?.length)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Sem vínculo</span><strong>{fmtInt(metrics?.gallery?.orphanPhotos?.length)}</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuditoriaInstitucional() {
  return (
    <RequireAuth>
      <AuditoriaInstitucionalInner />
    </RequireAuth>
  );
}
