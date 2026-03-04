import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import MetaCard from '@/components/monitoring/MetaCard';
import MetaForm from '@/components/monitoring/MetaForm';
import ActivitiesTable from '@/components/monitoring/ActivitiesTable';

export default function MonitoringPanel() {
  const queryClient = useQueryClient();

  const { data: metas = [] } = useQuery({
    queryKey: ['project-metas'],
    queryFn: () => base44.entities.ProjectMeta.list(),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['meta-activities'],
    queryFn: () => base44.entities.MetaActivity.list('-created_date', 100),
    refetchInterval: 30000,
  });

  // Calcular progresso por meta
  const metasProgress = useMemo(() => {
    const progress = {};
    metas.forEach(meta => {
      const count = activities.filter(a => a.meta_id === meta.id && a.status === 'realizada').length;
      progress[meta.id] = { completed: count, total: meta.meta_total };
    });
    return progress;
  }, [metas, activities]);

  // Calcular execução geral do projeto
  const overallProgress = useMemo(() => {
    let totalCompleted = 0;
    let totalExpected = 0;
    Object.values(metasProgress).forEach(({ completed, total }) => {
      totalCompleted += completed;
      totalExpected += total;
    });
    return totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
  }, [metasProgress]);

  const handleActivityAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['meta-activities'] });
  };

  const exportReport = () => {
    const rows = [
      ['RELATÓRIO DE ACOMPANHAMENTO DE METAS - MUSEUS CENTRO'],
      [],
      ['EXECUÇÃO GERAL DO PROJETO', `${overallProgress}%`],
      [],
    ];

    metas.forEach(meta => {
      const progress = metasProgress[meta.id] || { completed: 0, total: 0 };
      const percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
      rows.push([meta.nome, progress.completed, progress.total, `${percentage}%`]);
    });

    rows.push([]);
    rows.push(['TOTAL DE ATIVIDADES REGISTRADAS', activities.length]);
    rows.push(['Atividades Realizadas', activities.filter(a => a.status === 'realizada').length]);
    rows.push(['Atividades em Andamento', activities.filter(a => a.status === 'em andamento').length]);
    rows.push(['Atividades Planejadas', activities.filter(a => a.status === 'planejada').length]);

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-metas-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Painel de Monitoramento de Metas</h1>
            <p className="text-gray-600 text-sm mt-1">Acompanhe a execução das metas do projeto Museus Centro</p>
          </div>
          <Button onClick={exportReport} className="bg-black hover:bg-gray-800 text-white gap-2">
            <Download className="w-4 h-4" />
            Exportar Relatório
          </Button>
        </div>

        {/* Card de execução geral */}
        <Card className="p-6 bg-white border-gray-200">
          <div className="text-center">
            <p className="text-gray-600 mb-2">Percentual de Execução do Projeto</p>
            <p className="text-5xl font-bold text-black">{overallProgress}%</p>
            <div className="mt-4 bg-gray-100 rounded-full h-3">
              <div
                className="bg-black h-3 rounded-full transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Cards de metas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metas.map(meta => {
            const progress = metasProgress[meta.id] || { completed: 0, total: 0 };
            return (
              <MetaCard
                key={meta.id}
                title={meta.nome}
                completed={progress.completed}
                total={progress.total}
              />
            );
          })}

          {/* Card Total de Atividades */}
          <Card className="p-4 bg-white border-gray-200">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Total de Atividades</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Registradas no sistema</p>
              <p className="text-3xl font-bold text-gray-900">{activities.length}</p>
              <div className="text-xs text-gray-600 mt-3 space-y-1">
                <p>✓ Realizadas: {activities.filter(a => a.status === 'realizada').length}</p>
                <p>→ Em andamento: {activities.filter(a => a.status === 'em andamento').length}</p>
                <p>○ Planejadas: {activities.filter(a => a.status === 'planejada').length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Formulário de registro */}
        <MetaForm metas={metas} onActivityAdded={handleActivityAdded} />

        {/* Tabela de atividades */}
        <ActivitiesTable activities={activities} metas={metas} />
      </div>
    </div>
  );
}