import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  FileText, Users, Eye, Target, AlertCircle, CheckCircle,
  Send, Clock, Archive, ChevronRight, TrendingUp, Building2, Download
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   color: '#e5e7eb', text: '#374151' },
  SUBMITTED: { label: 'Enviado',    color: '#dbeafe', text: '#1d4ed8' },
  IN_REVIEW: { label: 'Em Revisão', color: '#fef9c3', text: '#92400e' },
  RETURNED:  { label: 'Devolvido',  color: '#fee2e2', text: '#b91c1c' },
  APPROVED:  { label: 'Aprovado',   color: '#dcfce7', text: '#15803d' },
  ARCHIVED:  { label: 'Arquivado',  color: '#f3e8ff', text: '#7e22ce' },
};

const MESES_ORDER = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const PIE_COLORS = ['#000000', '#404040', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5'];

// Deduplicar atividades por nome+data_inicio+museu para evitar contagem dupla
function deduplicarAtividades(atividades) {
  const seen = new Set();
  return atividades.filter(a => {
    const key = `${(a.nome || '').trim().toLowerCase()}|${a.data_inicio || ''}|${a.museu || ''}`;
    if (!a.nome && !a.data_inicio) return true; // sem chave, manter
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function CoordDashboard({ reports = [], isLoading }) {
  const allAtivRaw = useMemo(() => reports.flatMap(r => r.atividades || []), [reports]);
  const allAtiv = useMemo(() => deduplicarAtividades(allAtivRaw), [allAtivRaw]);
  const duplicatas = allAtivRaw.length - allAtiv.length;

  // KPIs
  const totalRelatorios = reports.length;
  const pendentes = reports.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status)).length;
  const aprovados = reports.filter(r => r.status === 'APPROVED').length;
  const totalAtiv = allAtiv.length;
  const publicoTotal = allAtiv.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
  const metas = allAtiv.filter(a => a.classificacao === 'META').length;
  const rotinas = allAtiv.filter(a => a.classificacao === 'ROTINA').length;
  const extras = allAtiv.filter(a => a.classificacao === 'EXTRA').length;

  // Por museu
  const porMuseu = useMemo(() => {
    const map = {};
    reports.forEach(r => {
      const m = r.museu || 'Outros';
      if (!map[m]) map[m] = { museu: m, relatorios: 0, atividades: 0, publico: 0 };
      map[m].relatorios++;
      const ativs = r.atividades || [];
      map[m].atividades += ativs.length;
      map[m].publico += ativs.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
    });
    return Object.values(map).sort((a, b) => b.relatorios - a.relatorios);
  }, [reports]);

  // Por mês (atividades + público)
  const porMes = useMemo(() => {
    const map = {};
    reports.forEach(r => {
      const mes = r.mes_referencia;
      if (!mes) return;
      if (!map[mes]) map[mes] = { mes: mes.substring(0, 3), atividades: 0, publico: 0 };
      const ativs = r.atividades || [];
      map[mes].atividades += ativs.length;
      map[mes].publico += ativs.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
    });
    return MESES_ORDER.filter(m => map[m]).map(m => map[m]);
  }, [reports]);

  // Status distribuição
  const statusData = useMemo(() => {
    const map = {};
    reports.forEach(r => {
      map[r.status] = (map[r.status] || 0) + 1;
    });
    return Object.entries(map).map(([status, value]) => ({
      name: STATUS_CONFIG[status]?.label || status,
      value,
      fill: STATUS_CONFIG[status]?.color || '#ccc',
    }));
  }, [reports]);

  // Classificação atividades
  const classifData = [
    { name: 'META', value: metas },
    { name: 'ROTINA', value: rotinas },
    { name: 'EXTRA', value: extras },
  ].filter(d => d.value > 0);

  // Recentes pendentes
  const pendentesList = reports
    .filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status))
    .slice(0, 5);

  const exportarRelatorioGeral = () => {
    const MESES_ABREV = { 'Janeiro':'JAN','Fevereiro':'FEV','Março':'MAR','Abril':'ABR','Maio':'MAI','Junho':'JUN','Julho':'JUL','Agosto':'AGO','Setembro':'SET','Outubro':'OUT','Novembro':'NOV','Dezembro':'DEZ' };
    const rows = [
      ['Protocolo','Profissional','Museu','Mês','Ano','Status','Total Atividades','Público Total','Metas','Rotinas','Extras'],
      ...reports.map(r => {
        const ativs = deduplicarAtividades(r.atividades || []);
        return [
          r.numero_protocolo || '—',
          r.author_name || '',
          r.museu || '',
          r.mes_referencia || '',
          r.ano || '',
          r.status || '',
          ativs.length,
          ativs.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0),
          ativs.filter(a => a.classificacao === 'META').length,
          ativs.filter(a => a.classificacao === 'ROTINA').length,
          ativs.filter(a => a.classificacao === 'EXTRA').length,
        ];
      }),
      [],
      ['RESUMO GERAL'],
      ['Total de Relatórios', totalRelatorios],
      ['Total de Atividades (sem duplicatas)', totalAtiv],
      ['Público Total', publicoTotal],
      ['Metas', metas],
      ['Rotinas', rotinas],
      ['Extras', extras],
      duplicatas > 0 ? [`Atividades duplicadas removidas`, duplicatas] : [],
    ];

    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-geral-museus-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório geral exportado com sucesso!');
  };

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400">Carregando dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header com botão de exportar */}
      <div className="flex items-center justify-between">
        <div>
          {duplicatas > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              ⚠ {duplicatas} atividade(s) duplicada(s) detectadas e removidas da contagem
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportarRelatorioGeral}>
          <Download className="w-4 h-4" />Exportar Relatório Geral (CSV)
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total de Relatórios', value: totalRelatorios, icon: FileText },
          { label: 'Pendentes de Revisão', value: pendentes, icon: AlertCircle, highlight: pendentes > 0 },
          { label: 'Aprovados', value: aprovados, icon: CheckCircle },
          { label: 'Total de Atividades', value: totalAtiv, icon: Target },
          { label: 'Público Total', value: publicoTotal.toLocaleString('pt-BR'), icon: Users },
          { label: 'Taxa de Aprovação', value: totalRelatorios ? `${Math.round((aprovados/totalRelatorios)*100)}%` : '—', icon: TrendingUp },
        ].map(kpi => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Atividades por Mês */}
        {porMes.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Atividades por Mês</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porMes} barSize={20}>
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  formatter={(v, name) => [v, name === 'atividades' ? 'Atividades' : 'Público']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="atividades" fill="#000000" radius={[4,4,0,0]} name="Atividades" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Público por Mês */}
        {porMes.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Público Estimado por Mês</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porMes} barSize={20}>
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  formatter={v => [v.toLocaleString('pt-BR'), 'Público']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="publico" fill="#404040" radius={[4,4,0,0]} name="Público" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Status dos Relatórios */}
        {statusData.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Status dos Relatórios</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Classificação de Atividades */}
        {classifData.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Classificação de Atividades</h3>
            <div className="space-y-3 mt-2">
              {[
                { label: 'META', value: metas, total: totalAtiv, color: 'bg-black' },
                { label: 'ROTINA', value: rotinas, total: totalAtiv, color: 'bg-gray-500' },
                { label: 'EXTRA', value: extras, total: totalAtiv, color: 'bg-gray-300' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{item.label}</span>
                    <span className="text-gray-500">{item.value} ({totalAtiv ? Math.round((item.value/totalAtiv)*100) : 0}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: totalAtiv ? `${(item.value/totalAtiv)*100}%` : '0%' }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
              Total: {totalAtiv} atividades registradas
            </div>
          </div>
        )}

        {/* Por Museu */}
        {porMuseu.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Por Museu</h3>
            <div className="space-y-3">
              {porMuseu.map(m => (
                <div key={m.museu} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-medium text-black">{m.museu}</span>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <span>{m.relatorios} rel.</span>
                    <span className="mx-1">·</span>
                    <span>{m.atividades} ativ.</span>
                    <span className="mx-1">·</span>
                    <span>{m.publico.toLocaleString('pt-BR')} púb.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pendentes de revisão */}
      {pendentesList.length > 0 && (
        <div className="border border-black rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-black flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-black" />
              Aguardando Revisão ({pendentes})
            </h3>
            <Link to={createPageUrl('CoordReview')}>
              <Button size="sm" className="bg-black hover:bg-gray-800 text-white text-xs">
                Ver todos <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {pendentesList.map(r => {
              const cfg = STATUS_CONFIG[r.status];
              return (
                <Link key={r.id} to={createPageUrl(`ReportEditor?id=${r.id}`)} className="block">
                  <div className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    <div>
                      <span className="text-sm font-medium text-black">{r.author_name}</span>
                      <span className="text-xs text-gray-500 ml-2">— {r.mes_referencia} {r.ano} · {r.museu}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg?.color, color: cfg?.text }}>
                      {cfg?.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`p-4 border rounded-xl ${highlight ? 'border-black bg-black text-white' : 'border-gray-100 bg-white'}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${highlight ? 'text-white' : 'text-gray-400'}`} />
        <span className={`text-xs ${highlight ? 'text-gray-300' : 'text-gray-500'}`}>{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${highlight ? 'text-white' : 'text-black'}`}>{value}</p>
    </div>
  );
}