import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, Zap, TrendingUp, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function DocumentMonitoringDashboard() {
  const [stats, setStats] = useState({
    total: 0,
    by_status: {},
    processing_queue: 0,
    approved_today: 0,
    errors_today: 0,
    avg_processing_time: 0,
    duplicate_detections: 0,
    permission_denials: 0
  });

  const [timeline, setTimeline] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const docs = await base44.asServiceRole.entities.DocumentIntake.list();
        const audits = await base44.asServiceRole.entities.AuditLog.filter({
          entity_type: 'DOCUMENT_INTAKE'
        });

        const today = new Date().toISOString().split('T')[0];
        const todayAudits = audits.filter(a => a.created_date?.startsWith(today));

        // Contar por status
        const byStatus = {};
        docs.forEach(d => {
          byStatus[d.status] = (byStatus[d.status] || 0) + 1;
        });

        // Processar timeline (últimas 24 horas)
        const timelineData = {};
        for (let i = 0; i < 24; i++) {
          const hour = i.toString().padStart(2, '0');
          timelineData[hour] = 0;
        }

        todayAudits.forEach(a => {
          const hour = a.created_date?.split('T')[1]?.substring(0, 2);
          if (hour) timelineData[hour]++;
        });

        const timelineArray = Object.entries(timelineData).map(([hour, count]) => ({
          hour: `${hour}:00`,
          operations: count
        }));

        // Calcular tempo médio de processamento
        const processedDocs = docs.filter(d => d.last_idempotent_timestamp);
        const avgTime = processedDocs.length > 0
          ? processedDocs.reduce((sum, d) => {
              const created = new Date(d.created_date);
              const processed = new Date(d.last_idempotent_timestamp);
              return sum + (processed - created);
            }, 0) / processedDocs.length / 1000 / 60 // minutos
          : 0;

        // Contar detectores de duplicata
        const duplicateDetections = todayAudits.filter(a => 
          a.details?.includes('duplicata') || a.details?.includes('duplicate')
        ).length;

        // Contar negações de permissão
        const permissionDenials = todayAudits.filter(a =>
          a.action === 'PERMISSION_DENIED'
        ).length;

        setStats({
          total: docs.length,
          by_status: byStatus,
          processing_queue: byStatus['processing'] || 0,
          approved_today: todayAudits.filter(a => a.action === 'DOCUMENT_APPROVE').length,
          errors_today: todayAudits.filter(a => a.action === 'DOCUMENT_REJECT').length,
          avg_processing_time: Math.round(avgTime),
          duplicate_detections: duplicateDetections,
          permission_denials: permissionDenials
        });

        setTimeline(timelineArray);
        setDocuments(docs.slice(0, 10).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
        setLoading(false);
      } catch (error) {
        console.warn('Métricas documentais indisponíveis no dashboard. Mantendo valores padrão.', error);
        setLoading(false);
      }
    };

    loadMetrics();
    const interval = setInterval(loadMetrics, 30000); // Atualiza a cada 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const statusColors = {
    processing: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    draft: 'bg-gray-100 text-gray-800',
    pendente: 'bg-yellow-100 text-yellow-800',
    deleted: 'bg-slate-100 text-slate-800'
  };

  return (
    <div className="space-y-6 p-6 bg-slate-50 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documentos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Total de Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-slate-500 mt-1">Processados e pendentes</p>
          </CardContent>
        </Card>

        {/* Fila de Processamento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Em Processamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.processing_queue}</div>
            <p className="text-xs text-slate-500 mt-1">Aguardando IA</p>
          </CardContent>
        </Card>

        {/* Aprovados Hoje */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Aprovados Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.approved_today}</div>
            <p className="text-xs text-slate-500 mt-1">Últimas 24h</p>
          </CardContent>
        </Card>

        {/* Tempo Médio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Tempo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.avg_processing_time}m</div>
            <p className="text-xs text-slate-500 mt-1">Processamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas de Segurança */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              Duplicatas Detectadas (Hoje)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.duplicate_detections}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              Acessos Negados (Hoje)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.permission_denials}</div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline de Operações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline de Operações (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="operations" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Distribuição por Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(stats.by_status).map(([status, count]) => (
              <div key={status} className="text-center">
                <Badge className={statusColors[status] || 'bg-gray-100'}>
                  {count}
                </Badge>
                <p className="text-xs text-slate-600 mt-2 capitalize">{status}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Documentos Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-white border rounded text-sm">
                <div className="flex-1">
                  <p className="font-medium text-slate-800 truncate">{doc.file_name_original}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(doc.created_date).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Badge className={statusColors[doc.status] || 'bg-gray-100'}>
                  {doc.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
