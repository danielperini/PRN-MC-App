import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, RotateCw, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function DataSyncAuditPanel() {
  const [loading, setLoading] = useState(false);
  const [syncing, setsyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [syncMetrics, setSyncMetrics] = useState(null);

  useEffect(() => {
    loadAuditData();
  }, []);

  async function loadAuditData() {
    try {
      setLoading(true);
      const logs = await base44.entities.AuditLog.filter(
        { action: 'SYNC_DASHBOARD_DATA' },
        '-created_date',
        20
      );
      setAuditLogs(logs || []);
      if (logs && logs.length > 0) {
        setLastSync(new Date(logs[0].created_date));
      }
    } catch (error) {
      console.warn('Auditoria do dashboard indisponível no carregamento inicial.', error);
    } finally {
      setLoading(false);
    }
  }

  async function triggerSync() {
    try {
      setsyncing(true);
      const response = await base44.functions.invoke('syncDashboardDataFromReports', {});
      setSyncMetrics(response.data);
      await loadAuditData();
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
    } finally {
      setsyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-2 border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RotateCw className="w-5 h-5" />
              Sincronização de Dados do Dashboard
            </CardTitle>
            <Button 
              onClick={triggerSync} 
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4" />
                  Sincronizar Agora
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastSync && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900">Última sincronização</p>
                <p className="text-xs text-green-700">
                  {lastSync.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          )}

          <Tabs defaultValue="metrics" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="metrics">Métricas</TabsTrigger>
              <TabsTrigger value="audit">Auditoria</TabsTrigger>
            </TabsList>

            <TabsContent value="metrics" className="space-y-3">
              {syncMetrics ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-600 font-medium">Relatórios Processados</p>
                      <p className="text-lg font-bold text-blue-900">{syncMetrics.total_approved_reports}</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-600 font-medium">Únicos (Dedup)</p>
                      <p className="text-lg font-bold text-purple-900">{syncMetrics.total_unique_reports}</p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                      <p className="text-xs text-amber-600 font-medium">Museus Consolidados</p>
                      <p className="text-lg font-bold text-amber-900">{syncMetrics.museums}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-600 font-medium">% Execução</p>
                      <p className="text-lg font-bold text-slate-900">{syncMetrics.budget_summary.execution_percentage}%</p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-slate-700">Resumo Orçamentário</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Previsto</p>
                        <p className="font-bold">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(syncMetrics.budget_summary.total_budget)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Utilizado</p>
                        <p className="font-bold">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(syncMetrics.budget_summary.total_used)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Saldo</p>
                        <p className="font-bold">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(syncMetrics.budget_summary.total_balance)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {syncMetrics.consolidated_by_museum && (
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium text-slate-700">Por Museu</p>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {Object.entries(syncMetrics.consolidated_by_museum).map(([museu, periodos]) => (
                          <div key={museu} className="bg-slate-50 p-2 rounded text-xs">
                            <p className="font-bold text-slate-900">{museu}</p>
                            <p className="text-slate-600">
                              {Object.keys(periodos).length} período(s) | 
                              {Object.values(periodos).reduce((sum, p) => sum + (p.atividades_mes || 0), 0)} atividades
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <p>Execute uma sincronização para ver as métricas</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="audit" className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Nenhuma sincronização registrada</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{log.actor_name}</p>
                          <p className="text-slate-600">{log.details}</p>
                          <p className="text-slate-500 mt-1">
                            {new Date(log.created_date).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
