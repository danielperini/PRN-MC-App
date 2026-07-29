import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Activity, Target } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

const REPORT_STATUS = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700' },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700' },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-800' },
  ARCHIVED: { label: 'Arquivado', color: 'bg-gray-100 text-gray-500' },
};

const CLASSIF_COLORS = {
  META: 'bg-purple-100 text-purple-800',
  ROTINA: 'bg-sky-100 text-sky-700',
  EXTRA: 'bg-orange-100 text-orange-700',
};

function ReportStatusBadge({ status }) {
  const cfg = REPORT_STATUS[status] || { label: status || '—', color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

function ClassifBadge({ classif }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CLASSIF_COLORS[classif] || 'bg-gray-100 text-gray-500'}`}>{classif || '—'}</span>;
}

export default function RelatoriosAtividadesTab({ targetEmail, memberName }) {
  // 1. Busca relatórios do usuário
  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['relatorios-sala', targetEmail],
    queryFn: () => base44.entities.Report.filter({ created_by_id: targetEmail }, '-updated_date', 50),
    enabled: !!targetEmail,
    staleTime: 120000,
  });

  // 2. Busca atividades em batch por report_ids
  const [activities, setActivities] = useState([]);
  const [loadingActs, setLoadingActs] = useState(false);

  useEffect(() => {
    if (!reports.length) { setActivities([]); return; }
    let active = true;
    async function loadActivities() {
      setLoadingActs(true);
      const ids = reports.map(r => r.id);
      const chunks = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
      const all = [];
      for (const chunk of chunks) {
        for (const rid of chunk) {
          try {
            const acts = await base44.entities.Activity.filter({ report_id: rid }, '-created_date', 50);
            all.push(...acts);
          } catch { /* skip */ }
        }
      }
      if (active) setActivities(all);
      if (active) setLoadingActs(false);
    }
    loadActivities();
    return () => { active = false; };
  }, [reports.map(r => r.id).join(',')]);

  // 3. Resumo por meta
  const metaMap = {};
  activities.filter(a => a.classificacao === 'META').forEach(a => {
    const k = a.meta_codigo || 'sem_codigo';
    if (!metaMap[k]) metaMap[k] = { codigo: k, count: 0, publico: 0 };
    metaMap[k].count++;
    metaMap[k].publico += Number(a.publico_total || 0);
  });
  const metaResumo = Object.values(metaMap).sort((a, b) => b.count - a.count);

  return (
    <Tabs defaultValue="relatorios" className="space-y-4">
      <TabsList className="flex-wrap gap-1">
        <TabsTrigger value="relatorios" className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Relatórios {reports.length > 0 && `(${reports.length})`}
        </TabsTrigger>
        <TabsTrigger value="atividades" className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Atividades {activities.length > 0 && `(${activities.length})`}
        </TabsTrigger>
        <TabsTrigger value="metas" className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> Resumo de Metas {metaResumo.length > 0 && `(${metaResumo.length})`}
        </TabsTrigger>
      </TabsList>

      {/* ABA RELATÓRIOS */}
      <TabsContent value="relatorios">
        {loadingReports ? (
          <p className="text-sm text-muted-foreground py-4">Carregando relatórios...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nenhum relatório encontrado.</p>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-white hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-800 capitalize">{r.mes_referencia || '—'} {r.ano}</span>
                    {r.museu && <span className="text-xs text-gray-500">{r.museu}</span>}
                    <ReportStatusBadge status={r.status} />
                  </div>
                  {r.numero_protocolo && (
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{r.numero_protocolo}</p>
                  )}
                </div>
                <Link
                  to={`/ReportEditor?id=${r.id}`}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline flex-shrink-0"
                >
                  <ExternalLink className="w-3 h-3" /> Ver
                </Link>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ABA ATIVIDADES */}
      <TabsContent value="atividades">
        {loadingActs ? (
          <p className="text-sm text-muted-foreground py-4">Carregando atividades...</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nenhuma atividade encontrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Título</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Data</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-700">Classificação</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Público</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Meta</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a, i) => (
                  <tr key={a.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate font-medium">{a.titulo || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{fmtDate(a.data_realizacao || a.data_inicio)}</td>
                    <td className="px-3 py-2 text-center"><ClassifBadge classif={a.classificacao} /></td>
                    <td className="px-3 py-2 text-right text-gray-700">{Number(a.publico_total || 0).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{a.meta_codigo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* ABA RESUMO DE METAS */}
      <TabsContent value="metas">
        {metaResumo.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nenhuma atividade classificada como META encontrada.</p>
        ) : (
          <div className="space-y-2">
            {metaResumo.map(m => (
              <div key={m.codigo} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-purple-200 bg-purple-50">
                <div>
                  <span className="font-semibold text-purple-800 text-sm">{m.codigo === 'sem_codigo' ? 'Sem código' : m.codigo}</span>
                  <p className="text-xs text-purple-600 mt-0.5">{m.count} atividade{m.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-purple-900">{m.publico.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-purple-500">público total</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}