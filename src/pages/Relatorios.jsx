import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  FileText, Plus, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, Download, X, Search, SlidersHorizontal, Paperclip
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];
const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-600',    cardBg: 'bg-white',             icon: Clock },
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700',    cardBg: 'bg-blue-50/40',        icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700',  cardBg: 'bg-amber-50/40',       icon: Eye },
  RETURNED:  { label: 'Devolvido',  color: 'bg-red-100 text-red-700',      cardBg: 'bg-red-50/40',         icon: AlertCircle },
  APPROVED:  { label: 'Aprovado',   color: 'bg-emerald-100 text-emerald-700', cardBg: 'bg-emerald-50/40',  icon: CheckCircle },
  ARCHIVED:  { label: 'Arquivado',  color: 'bg-purple-100 text-purple-700', cardBg: 'bg-purple-50/30',     icon: Archive },
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
          (a.nome || a.titulo || ''), a.classificacao||'', a.publico_estimado||0,
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
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ mes: '', museu: '', equipe: '', status: '', classificacao: '' });
  const [showFilters, setShowFilters] = useState(false);

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

  const { data: allAttachments = [] } = useQuery({
    queryKey: ['all-attachments-list'],
    queryFn: () => base44.entities.Attachment.list('-created_date', 500),
    enabled: !!currentUser,
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
    if (search) {
      const q = search.toLowerCase();
      const matchName = r.author_name?.toLowerCase().includes(q);
      const matchMuseu = r.museu?.toLowerCase().includes(q);
      const matchMes = r.mes_referencia?.toLowerCase().includes(q);
      const matchEquipe = r.equipe?.toLowerCase().includes(q);
      const matchAtiv = (r.atividades || []).some(a => (a.nome || a.titulo || '').toLowerCase().includes(q));
      if (!matchName && !matchMuseu && !matchMes && !matchEquipe && !matchAtiv) return false;
    }
    return true;
  });

  const hasFilters = Object.values(filters).some(Boolean) || !!search;
  const setFilter = (k, v) => setFilters(p => ({ ...p, [k]: v }));
  const clearFilters = () => { setFilters({ mes: '', museu: '', equipe: '', status: '', classificacao: '' }); setSearch(''); };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">Gestão de Relatórios Museus Centro</h1>
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

        {/* Search + Filter bar */}
        <div className="mb-5 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por profissional, museu, mês, atividade..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-10 border-gray-200"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              className={`gap-2 h-10 ${showFilters ? 'border-black bg-gray-50' : 'border-gray-200'}`}
              onClick={() => setShowFilters(p => !p)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {Object.values(filters).some(Boolean) && (
                <span className="w-4 h-4 rounded-full bg-black text-white text-[10px] flex items-center justify-center">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              )}
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="text-gray-400 gap-1 h-10" onClick={clearFilters}>
                <X className="w-3 h-3" /> Limpar
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 p-4 bg-gray-50 border border-gray-100 rounded-xl">
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
            </div>
          )}
        </div>

        {/* Cards grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full text-center py-20 text-gray-400">Carregando relatórios...</div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum relatório encontrado</p>
              {hasFilters && <p className="text-xs text-gray-400 mt-1">Tente ajustar os filtros ou a busca</p>}
            </div>
          ) : (
            filtered.map(report => {
              const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
              const StatusIcon = cfg.icon;
              const nMeta = (report.atividades || []).filter(a => a.classificacao === 'META').length;
              const nRot  = (report.atividades || []).filter(a => a.classificacao === 'ROTINA').length;
              const nExt  = (report.atividades || []).filter(a => a.classificacao === 'EXTRA').length;
              const totalAtiv = (report.atividades || []).length;
              const attachments = allAttachments.filter(att => att.report_id === report.id);
              const nAttachments = attachments.length;
              return (
                <Link key={report.id} to={createPageUrl(`ReportEditor?id=${report.id}`)} className="block group">
                  <div className={`h-full p-5 rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all ${cfg.cardBg}`}>
                    {/* Status badge */}
                    <div className="flex items-center justify-between mb-4">
                      <Badge className={`${cfg.color} font-normal gap-1`}>
                        <StatusIcon className="w-3 h-3" />{cfg.label}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>

                    {/* Main info */}
                    <h3 className="font-semibold text-black text-base leading-tight">
                      {report.mes_referencia} {report.ano}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 truncate">{report.author_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{report.museu}{report.equipe ? ` · ${report.equipe}` : ''}</p>

                    {/* Activity pills */}
                     {totalAtiv > 0 && (
                       <div className="flex gap-1.5 mt-4 flex-wrap">
                         {nMeta > 0 && (
                           <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{nMeta} Meta{nMeta > 1 ? 's' : ''}</span>
                         )}
                         {nRot > 0 && (
                           <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">{nRot} Rotina{nRot > 1 ? 's' : ''}</span>
                         )}
                         {nExt > 0 && (
                           <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{nExt} Extra{nExt > 1 ? 's' : ''}</span>
                         )}
                       </div>
                     )}

                     {/* Attachments indicator */}
                     {nAttachments > 0 && (
                       <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
                         <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                         <span>{nAttachments} arquivo{nAttachments > 1 ? 's' : ''}</span>
                       </div>
                     )}

                    {/* Return comment warning */}
                    {report.return_comment && report.status === 'RETURNED' && (
                      <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5 leading-relaxed line-clamp-2">
                        {report.return_comment}
                      </p>
                    )}
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