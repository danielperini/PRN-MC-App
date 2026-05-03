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
      console.error('Erro ao carregar auditoria:', error);
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
        























        
        <CardContent className="space-y-4">
          {lastSync &&
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900">Última sincronização</p>
                <p className="text-xs text-green-700">
                  {lastSync.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          }

          











































































































          
        </CardContent>
      </Card>
    </div>);

}