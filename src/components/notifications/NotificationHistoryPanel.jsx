import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Mail, 
  RotateCw,
  AlertTriangle,
  Calendar 
} from 'lucide-react';

const STATUS_CONFIG = {
  PENDING: { label: 'Pendente', color: 'bg-amber-100 text-amber-700', icon: Clock },
  SCHEDULED: { label: 'Agendado', color: 'bg-blue-100 text-blue-700', icon: Calendar },
  SENDING: { label: 'Enviando', color: 'bg-indigo-100 text-indigo-700', icon: Mail },
  SENT: { label: 'Enviado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  FAILED: { label: 'Falha', color: 'bg-red-100 text-red-700', icon: XCircle },
  CANCELLED: { label: 'Cancelado', color: 'bg-gray-100 text-gray-700', icon: AlertTriangle },
};

export default function NotificationHistoryPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      // Tentar NotificationLog primeiro, fallback para NotificacaoCompraLog
      let data = [];
      
      try {
        data = await base44.entities.NotificationLog.list('-created_date', 100);
      } catch {
        // Fallback
        data = await base44.entities.NotificacaoCompraLog.list('-disparado_em', 100);
      }

      setLogs(data || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'sent') return log.status === 'SENT' || log.status === 'sucesso';
    if (filter === 'failed') return log.status === 'FAILED' || log.status === 'falha';
    return true;
  });

  function getStatusConfig(status) {
    return STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: Clock };
  }

  function formatDateTime(date) {
    if (!date) return '—';
    try {
      return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return date;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Histórico de Notificações
          </span>
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
            <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="mb-4">
          <TabsList>
            <TabsTrigger value="all" onClick={() => setFilter('all')}>Todos</TabsTrigger>
            <TabsTrigger value="sent" onClick={() => setFilter('sent')}>Enviados</TabsTrigger>
            <TabsTrigger value="failed" onClick={() => setFilter('failed')}>Falhas</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Carregando histórico...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Nenhum registro encontrado.</div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredLogs.map((log, index) => {
              const statusConfig = getStatusConfig(log.status);
              const StatusIcon = statusConfig.icon;

              return (
                <div
                  key={log.id || index}
                  className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={statusConfig.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {log.notification_type || log.type || 'Notificação'}
                        </span>
                      </div>

                      <div className="text-sm text-gray-700 mb-1">
                        <strong>Destinatários:</strong>{' '}
                        {Array.isArray(log.recipients) 
                          ? `${log.recipients.length} destinatário(s)` 
                          : log.recipients || '—'}
                      </div>

                      <div className="text-xs text-gray-500 space-y-1">
                        <div>
                          <strong>Enviado em:</strong> {formatDateTime(log.sent_at || log.disparado_em)}
                        </div>
                        {log.provider && (
                          <div>
                            <strong>Provedor:</strong> {log.provider}
                          </div>
                        )}
                        {log.error_message && (
                          <div className="text-red-600">
                            <strong>Erro:</strong> {log.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}