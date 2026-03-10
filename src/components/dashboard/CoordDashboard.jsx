import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid
} from 'recharts';
import {
  FileText, Users, Eye, Target, AlertCircle, CheckCircle,
  Send, Clock, Archive, ChevronRight, TrendingUp, Building2, Download,
  Filter, X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import PendingApprovalsPanel from './PendingApprovalsPanel';
import FrasesParticipantes from './FrasesParticipantes';

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
  const [filterShowMore, setFilterShowMore] = useState(false);
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [filterMuseu, setFilterMuseu] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterTipoAtiv, setFilterTipoAtiv] = useState('');

  // Filtrar relatórios por data
  const reportsFiltrados = useMemo(() => {
    return reports.filter(r => {
      if (!filterDataInicio && !filterDataFim) return true;
      const ano = r.ano || 2026;
      const mesNum = MESES_ORDER.indexOf((r.mes_referencia || '').trim()) + 1;
      const dataReport = new Date(ano, mesNum - 1, 1);
      if (filterDataInicio && new Date(filterDataInicio) > dataReport) return false;
      if (filterDataFim && new Date(filterDataFim) < dataReport) return false;
      return true;
    });
  }, [reports, filterDataInicio, filterDataFim]);

  // Apenas relatórios APROVADOS contam para atividades e público
  const reportsFiltradosAprovados = useMemo(() => reportsFiltrados.filter(r => r.status === 'APPROVED'), [reportsFiltrados]);

  // Filtrar atividades (somente de relatórios aprovados)
  const allAtivRaw = useMemo(() => reportsFiltradosAprovados.flatMap(r => r.atividades || []), [reportsFiltradosAprovados]);
  const allAtiv = useMemo(() => {
    let ativs = deduplicarAtividades(allAtivRaw);
    if (filterMuseu) ativs = ativs.filter(a => a.museu === filterMuseu);
    if (filterClasse) ativs = ativs.filter(a => a.classificacao === filterClasse);
    if (filterTipoAtiv) ativs = ativs.filter(a => a.tipo_atividade === filterTipoAtiv);
    return ativs;
  }, [allAtivRaw, filterMuseu, filterClasse, filterTipoAtiv]);

  const duplicatas = allAtivRaw.length - allAtiv.length;

  // KPIs
  const totalRelatorios = reportsFiltrados.length;
  const pendentes = reportsFiltrados.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status)).length;
  const aprovados = reportsFiltrados.filter(r => r.status === 'APPROVED').length;
  const totalAtiv = allAtiv.length;
  const publicoTotal = allAtiv.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
  const metas = allAtiv.filter(a => a.classificacao === 'META').length;
  const rotinas = allAtiv.filter(a => a.classificacao === 'ROTINA').length;
  const extras = allAtiv.filter(a => a.classificacao === 'EXTRA').length;

  // Por museu
  const porMuseu = useMemo(() => {
    const map = {};
    reportsFiltrados.forEach(r => {
      const m = r.museu || 'Outros';
      if (!map[m]) map[m] = { museu: m, relatorios: 0, atividades: 0, publico: 0 };
      map[m].relatorios++;
      const ativs = (r.atividades || []).filter(a => {
        if (filterMuseu && a.museu !== filterMuseu) return false;
        if (filterClasse && a.classificacao !== filterClasse) return false;
        if (filterTipoAtiv && a.tipo_atividade !== filterTipoAtiv) return false;
        return true;
      });
      map[m].atividades += ativs.length;
      map[m].publico += ativs.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
    });
    return Object.values(map).sort((a, b) => b.relatorios - a.relatorios);
  }, [reportsFiltrados, filterMuseu, filterClasse, filterTipoAtiv]);

  // Por mês (atividades + público)
  const porMes = useMemo(() => {
    const map = {};
    reportsFiltrados.forEach(r => {
      const mes = r.mes_referencia;
      if (!mes) return;
      if (!map[mes]) map[mes] = { mes: mes.substring(0, 3), atividades: 0, publico: 0 };
      const ativs = (r.atividades || []).filter(a => {
        if (filterMuseu && a.museu !== filterMuseu) return false;
        if (filterClasse && a.classificacao !== filterClasse) return false;
        if (filterTipoAtiv && a.tipo_atividade !== filterTipoAtiv) return false;
        return true;
      });
      map[mes].atividades += ativs.length;
      map[mes].publico += ativs.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
    });
    return MESES_ORDER.filter(m => map[m]).map(m => map[m]);
  }, [reportsFiltrados, filterMuseu, filterClasse, filterTipoAtiv]);

  // Status distribuição
  const statusData = useMemo(() => {
    const map = {};
    reportsFiltrados.forEach(r => {
      map[r.status] = (map[r.status] || 0) + 1;
    });
    return Object.entries(map).map(([status, value]) => ({
      name: STATUS_CONFIG[status]?.label || status,
      value,
      fill: STATUS_CONFIG[status]?.color || '#ccc',
    }));
  }, [reportsFiltrados]);

  // Classificação atividades
  const classifData = [
    { name: 'META', value: metas },
    { name: 'ROTINA', value: rotinas },
    { name: 'EXTRA', value: extras },
  ].filter(d => d.value > 0);

  // Atividades por tipo
  const atividadesPorTipo = useMemo(() => {
    const map = {};
    allAtiv.forEach(a => {
      const tipo = a.tipo_atividade || 'Outro';
      map[tipo] = (map[tipo] || 0) + 1;
    });
    return Object.entries(map)
      .map(([tipo, value]) => ({ tipo, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [allAtiv]);

  // Extrair museus e tipos únicos para filtros
  const museusUnicos = useMemo(() => {
    const set = new Set(reportsFiltrados.map(r => r.museu).filter(Boolean));
    return Array.from(set).sort();
  }, [reportsFiltrados]);

  const tiposUnicos = useMemo(() => {
    const set = new Set(allAtivRaw.map(a => a.tipo_atividade).filter(Boolean));
    return Array.from(set).sort();
  }, [allAtivRaw]);

  // Recentes pendentes
  const pendentesList = reportsFiltrados
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

  const temFiltrosAtivos = filterDataInicio || filterDataFim || filterMuseu || filterClasse || filterTipoAtiv;

  const limparFiltros = () => {
    setFilterDataInicio('');
    setFilterDataFim('');
    setFilterMuseu('');
    setFilterClasse('');
    setFilterTipoAtiv('');
    setFilterShowMore(false);
  };

  return (
    <div className="space-y-8">
      {/* Painel de Aprovações Pendentes */}
      <PendingApprovalsPanel />

      {/* Frases de Participantes */}
      <FrasesParticipantes reports={reports} />

      {/* Filtros */}
      <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-black flex items-center gap-2">
            <Filter className="w-4 h-4" />Filtros de Análise
          </h3>
          {temFiltrosAtivos && (
            <Button size="sm" variant="outline" onClick={limparFiltros} className="h-8 gap-1.5">
              <X className="w-3 h-3" />Limpar Filtros
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
           <div className="space-y-1">
             <label className="text-xs font-medium text-gray-600">Data Inicial</label>
             <Input type="date" value={filterDataInicio} onChange={e => setFilterDataInicio(e.target.value)} className="text-sm" />
           </div>
           <div className="space-y-1">
             <label className="text-xs font-medium text-gray-600">Data Final</label>
             <Input type="date" value={filterDataFim} onChange={e => setFilterDataFim(e.target.value)} className="text-sm" />
           </div>
           <div className="space-y-1">
             <label className="text-xs font-medium text-gray-600">Museu</label>
             <Select value={filterMuseu || ''} onValueChange={v => setFilterMuseu(v || '')}>
               <SelectTrigger className="text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
               <SelectContent>
                 <SelectItem value={null}>Todos</SelectItem>
                 {museusUnicos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
               </SelectContent>
             </Select>
           </div>
           <div className="space-y-1">
             <label className="text-xs font-medium text-gray-600">Classificação</label>
             <Select value={filterClasse || ''} onValueChange={v => setFilterClasse(v || '')}>
               <SelectTrigger className="text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
               <SelectContent>
                 <SelectItem value={null}>Todas</SelectItem>
                 <SelectItem value="META">META</SelectItem>
                 <SelectItem value="ROTINA">ROTINA</SelectItem>
                 <SelectItem value="EXTRA">EXTRA</SelectItem>
               </SelectContent>
             </Select>
           </div>
           {filterShowMore && (
             <div className="space-y-1">
               <label className="text-xs font-medium text-gray-600">Tipo de Atividade</label>
               <Select value={filterTipoAtiv || ''} onValueChange={v => setFilterTipoAtiv(v || '')}>
                 <SelectTrigger className="text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value={null}>Todos</SelectItem>
                   {tiposUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                 </SelectContent>
               </Select>
             </div>
           )}
         </div>

        {!filterShowMore && tiposUnicos.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setFilterShowMore(true)} className="text-xs text-gray-500">
            + Mais Filtros
          </Button>
        )}
      </div>

      {/* Aviso de duplicatas */}
       {duplicatas > 0 && (
         <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
           ⚠ {duplicatas} atividade(s) duplicada(s) detectadas e removidas da contagem
         </p>
       )}

      {/* KPI Cards with larger fonts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total de Relatórios', value: totalRelatorios, icon: FileText },
          { label: 'Pendentes de Revisão', value: pendentes, icon: AlertCircle, highlight: pendentes > 0 },
          { label: 'Aprovados', value: aprovados, icon: CheckCircle },
          { label: 'Total de Atividades', value: totalAtiv, icon: Target },
          { label: 'Público Total', value: publicoTotal.toLocaleString('pt-BR'), icon: Users },
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

      <div className="grid md:grid-cols-4 gap-6">
        {/* Status dos Relatórios */}
        {statusData.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Status dos Relatórios</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
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

        {/* Atividades por Tipo */}
        {atividadesPorTipo.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Atividades Mais Frequentes</h3>
            <div className="space-y-2">
              {atividadesPorTipo.map((item, i) => {
                const maxVal = atividadesPorTipo[0]?.value || 1;
                return (
                  <div key={item.tipo}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700 truncate">{item.tipo}</span>
                      <span className="text-gray-500 ml-2">{item.value}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all" 
                        style={{ width: `${(item.value / maxVal) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Por Museu */}
        {porMuseu.length > 0 && (
          <div className="border border-gray-100 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-black mb-4">Comparativo por Museu</h3>
            <div className="space-y-3">
              {porMuseu.map(m => (
                <div key={m.museu} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-sm text-black truncate">{m.museu}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 pl-5">
                    <span>{m.relatorios} rel.</span>
                    <span>{m.atividades} ativ.</span>
                    <span>{m.publico.toLocaleString('pt-BR')} púb.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tendências Públicos por Mês (Linha) */}
      {porMes.length > 2 && (
        <div className="border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-black mb-4">Tendência de Público Estimado</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip 
                formatter={v => [v.toLocaleString('pt-BR'), 'Público']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Line type="monotone" dataKey="publico" stroke="#000000" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

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

      {/* Exportar Relatório */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={exportarRelatorioGeral}>
          <Download className="w-4 h-4" />Exportar Relatório Geral (CSV)
        </Button>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`p-5 border rounded-xl transition-all shadow-sm ${highlight ? 'border-black bg-black text-white shadow-md' : 'border-gray-100 bg-white hover:shadow-md'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${highlight ? 'text-white' : 'text-gray-400'}`} />
        <span className={`text-xs font-medium ${highlight ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
      </div>
      <p className={`text-3xl font-bold leading-tight ${highlight ? 'text-white' : 'text-black'}`}>{value}</p>
    </div>
  );
}