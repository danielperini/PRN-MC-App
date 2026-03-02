import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  FileText, Plus, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, Download, X, Search, SlidersHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];
const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-700',   icon: Clock },
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700',   icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-yellow-100 text-yellow-700', icon: Eye },
  RETURNED:  { label: 'Devolvido',  color: 'bg-red-100 text-red-700',     icon: AlertCircle },
  APPROVED:  { label: 'Aprovado',   color: 'bg-green-100 text-green-700', icon: CheckCircle },
  ARCHIVED:  { label: 'Arquivado',  color: 'bg-purple-100 text-purple-700', icon: Archive },
};

function exportCSV(reports) {
  const rows = [];
  const header = [
    'ID','Profissional','Museu','Equipe','Mês','Ano','Status',
    'Atividade','Classificação','Público Estimado','Equipe Responsável',
    'Acessibilidade','Parceria'
  ];
  rows.push(header.join(';'));

  reports.forEach(r => {
    const atividades = r.atividades || [];
    if (atividades.length === 0) {
      rows.push([r.id, r.author_name, r.museu, r.equipe||'', r.mes_referencia, r.ano, r.status,
        '','','','','',''].join(';'));
    } else {
      atividades.forEach(a => {
        rows.push([
          r.id, r.author_name, r.museu, r.equipe||'', r.mes_referencia, r.ano, r.status,
          a.titulo||'', a.classificacao||'', a.publico_estimado||0,
          a.equipe_responsavel||'', a.acessibilidade||'', a.parceria||''
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'));
      });
    }
  });

  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorios_museus_centro_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosInner() {
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const [filters, setFilters] = useState({ mes: '', museu: '', equipe: '', status: '', classificacao: '' });

  const { data: allReports = [], isLoading: loadingAll } = useQuery({
    queryKey: ['all-reports-list'],
    queryFn: () => base44.entities.Report.list('-created_date', 200),
    enabled: !!currentUser && isCoordenador,
    staleTime: 30_000,
  });

  const { data: myReports = [], isLoading: loadingMy } = useQuery({
    queryKey: ['my-reports-list', currentUser?.email],
    queryFn: () => base44.entities.Report.filter({ created_by: currentUser?.email }, '-created_date'),
    enabled: !!currentUser?.email && !isCoordenador,
    staleTime: 30_000,
  });

  const isLoading = isCoordenador ? loadingAll : loadingMy;
  const baseReports = isCoordenador ? allReports : myReports;

  const filtered = baseReports.filter(r => {
    if (filters.mes && r.mes_referencia !== filters.mes) return false;
    if (filters.museu && r.museu !== filters.museu) return false;
    if (filters.equipe && r.equipe !== filters.equipe) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.classificacao) {
      const hasClass = (r.atividades || []).some(a => a.classificacao === filters.classificacao);
      if (!hasClass) return false;
    }
    return true;
  });

  const hasFilters = Object.values(filters).some(Boolean);
  const setFilter = (k, v) => setFilters(p => ({ ...p, [k]: v }));
  const clearFilters = () => setFilters({ mes: '', museu: '', equipe: '', status: '', classificacao: '' });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">Relatórios</h1>
            <p className="text-gray-500 mt-1">
              {filtered.length} de {baseReports.length} relatório(s)
            </p>
          </div>
          <div className="flex gap-2">
            {isCoordenador && (
              <Button
                variant="outline"
                className="border-black gap-2"
                onClick={() => exportCSV(filtered)}
              >
                <Download className="w-4 h-4" />
                Exportar CSV
              </Button>
            )}
            <Link to={createPageUrl('ReportEditor')}>
              <Button className="bg-black hover:bg-gray-800 text-white gap-2">
                <Plus className="w-4 h-4" />
                Novo Relatório
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6 p-4 border border-[#E5E5E5] rounded-xl">
          <FilterSel placeholder="Mês" value={filters.mes} onChange={v => setFilter('mes', v)}
            options={MESES.map(m => ({ value: m, label: m }))} />
          <FilterSel placeholder="Museu" value={filters.museu} onChange={v => setFilter('museu', v)}
            options={MUSEUS.map(m => ({ value: m, label: m }))} />
          <FilterSel placeholder="Equipe" value={filters.equipe} onChange={v => setFilter('equipe', v)}
            options={EQUIPES.map(e => ({ value: e, label: e }))} />
          <FilterSel placeholder="Status" value={filters.status} onChange={v => setFilter('status', v)}
            options={Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))} />
          <FilterSel placeholder="Classificação" value={filters.classificacao} onChange={v => setFilter('classificacao', v)}
            options={['META','ROTINA','EXTRA'].map(c => ({ value: c, label: c }))} />
          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-gray-400 gap-1" onClick={clearFilters}>
              <X className="w-3 h-3" /> Limpar
            </Button>
          )}
        </div>

        {/* List */}
        <div className="space-y-3">
          {(isLoading) ? (
            <div className="text-center py-20 text-gray-400">Carregando relatórios...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum relatório encontrado</p>
            </div>
          ) : (
            filtered.map(report => {
              const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
              const StatusIcon = cfg.icon;
              return (
                <Link key={report.id} to={createPageUrl(`ReportEditor?id=${report.id}`)} className="block">
                  <div className="p-5 border border-[#E5E5E5] rounded-xl shadow-sm hover:border-gray-300 transition-all group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-50 border border-[#E5E5E5] rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-black">{report.mes_referencia} {report.ano}</span>
                            <Badge className={`${cfg.color} font-normal`}>
                              <StatusIcon className="w-3 h-3 mr-1" />{cfg.label}
                            </Badge>
                            {(report.atividades || []).some(a => a.classificacao) && (
                              <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                                {(report.atividades || []).filter(a => a.classificacao === 'META').length}M·{(report.atividades||[]).filter(a=>a.classificacao==='ROTINA').length}R·{(report.atividades||[]).filter(a=>a.classificacao==='EXTRA').length}E
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {report.museu} • {report.author_name}{report.equipe && ` • ${report.equipe}`}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function Relatorios() {
  return <RequireAuth><RelatoriosInner /></RequireAuth>;
}

function FilterSel({ placeholder, value, onChange, options }) {
  return (
    <Select value={value || 'all'} onValueChange={v => onChange(v === 'all' ? '' : v)}>
      <SelectTrigger className="h-8 text-sm min-w-[120px] border-gray-200">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">— {placeholder} —</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}