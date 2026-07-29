import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileText, Users, Calendar, Building2, TrendingUp } from 'lucide-react';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v || 0));
}

function StatusBadge({ status }) {
  const map = {
    APPROVED: { label: 'Aprovado', cls: 'bg-green-100 text-green-700' },
    SUBMITTED: { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' },
    IN_REVIEW: { label: 'Em revisão', cls: 'bg-yellow-100 text-yellow-700' },
    ARCHIVED: { label: 'Arquivado', cls: 'bg-slate-100 text-slate-600' },
    DRAFT: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-500' },
  };
  const s = map[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-500' };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${s.cls}`}>{s.label}</span>;
}

// ─── Painel: Relatórios ───────────────────────────────────────────────────────
function PainelRelatorios({ reports = [] }) {
  if (reports.length === 0) return <p className="text-sm text-slate-400 text-center py-6">Nenhum relatório encontrado.</p>;
  return (
    <div className="space-y-2">
      {reports.map(r => (
        <div key={r.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50 flex items-start gap-3">
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800 truncate">{r.author_name || '—'}</span>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {r.museu || '—'} · {r.mes_referencia || '—'} {r.ano || ''}
            </p>
            {r.numero_protocolo && (
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">{r.numero_protocolo}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-bold text-slate-700">{Array.isArray(r.atividades) ? r.atividades.length : 0} ativ.</p>
            {r.publico_geral_declarado > 0 && (
              <p className="text-[11px] text-slate-400">{Number(r.publico_geral_declarado).toLocaleString('pt-BR')} público</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Painel: Museu (público + atividades) ─────────────────────────────────────
function PainelMuseu({ museu, reports = [] }) {
  const museuReports = reports.filter(r => {
    const m = String(r.museu || '').toUpperCase();
    if (museu === 'MHAB') return m.includes('MHAB') || m.includes('MAB');
    if (museu === 'MIS') return m.includes('MIS');
    if (museu === 'MUMO') return m.includes('MUMO');
    return false;
  });

  const totalPublicoGeral = museuReports.reduce((s, r) => s + Number(r.publico_geral_declarado || 0), 0);
  const totalAtividades = museuReports.reduce((s, r) => s + (Array.isArray(r.atividades) ? r.atividades.length : 0), 0);
  const totalParticipantes = museuReports.reduce((s, r) => {
    const atividades = Array.isArray(r.atividades) ? r.atividades : [];
    return s + atividades.reduce((sa, a) => sa + Number(a.publico_total || a.publico_estimado || 0), 0);
  }, 0);
  const mediaAtividade = totalAtividades > 0 ? Math.round(totalParticipantes / totalAtividades) : 0;

  return (
    <div className="space-y-4">
      {/* Resumo numérico */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
          <p className="text-2xl font-black text-slate-800">{totalPublicoGeral.toLocaleString('pt-BR')}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Público geral declarado</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
          <p className="text-2xl font-black text-slate-800">{totalParticipantes.toLocaleString('pt-BR')}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Participantes em atividades</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
          <p className="text-2xl font-black text-slate-800">{mediaAtividade.toLocaleString('pt-BR')}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Média/atividade</p>
        </div>
      </div>

      {/* Público Geral por relatório */}
      {totalPublicoGeral > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Público geral declarado por relatório</p>
          <div className="space-y-1.5">
            {museuReports.filter(r => r.publico_geral_declarado > 0).map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1.5">
                <span className="text-slate-700 font-medium truncate max-w-[60%]">{r.author_name} · {r.mes_referencia} {r.ano}</span>
                <span className="font-bold text-slate-800">{Number(r.publico_geral_declarado).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Atividades por relatório */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Atividades por profissional</p>
        <div className="space-y-2">
          {museuReports.map(r => {
            const atividades = Array.isArray(r.atividades) ? r.atividades : [];
            const participantes = atividades.reduce((s, a) => s + Number(a.publico_total || a.publico_estimado || 0), 0);
            return (
              <div key={r.id} className="border border-slate-100 rounded-lg p-2.5 bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 truncate">{r.author_name || '—'}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-500">
                  <span>{r.mes_referencia} {r.ano}</span>
                  <span className="font-semibold text-slate-700">{atividades.length} ativ.</span>
                  <span>{participantes.toLocaleString('pt-BR')} participantes</span>
                </div>
              </div>
            );
          })}
          {museuReports.length === 0 && <p className="text-xs text-slate-400">Nenhum relatório para este museu.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Painel: Execução Orçamentária ───────────────────────────────────────────
function PainelOrcamento({ rubricas = [] }) {
  const navigate = useNavigate();
  const grupos = {};
  for (const r of rubricas) {
    const g = r.grupo || 'Geral';
    if (!grupos[g]) grupos[g] = { previsto: 0, utilizado: 0, rubricas: [] };
    grupos[g].previsto += Number(r.valor_rubrica || r.valor_total || 0);
    grupos[g].utilizado += Number(r.valor_utilizado || 0);
    grupos[g].rubricas.push(r);
  }

  const linhas = Object.entries(grupos).map(([nome, data]) => ({
    nome,
    previsto: data.previsto,
    utilizado: data.utilizado,
    pct: data.previsto > 0 ? Math.min(100, Math.round((data.utilizado / data.previsto) * 100)) : 0,
    rubricas: data.rubricas,
  })).sort((a, b) => b.utilizado - a.utilizado);

  return (
    <div className="space-y-3">
      {linhas.map(l => (
        <div key={l.nome} className="border border-slate-100 rounded-xl p-3 bg-slate-50">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-700 leading-snug">{l.nome}</span>
            <span className={`text-xs font-bold flex-shrink-0 ${l.pct >= 80 ? 'text-red-600' : l.pct >= 50 ? 'text-amber-600' : 'text-green-600'}`}>{l.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 mb-2">
            <div
              className={`h-1.5 rounded-full transition-all ${l.pct >= 80 ? 'bg-red-500' : l.pct >= 50 ? 'bg-amber-400' : 'bg-green-500'}`}
              style={{ width: `${l.pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{fmtBRL(l.utilizado)} utilizados</span>
            <span>de {fmtBRL(l.previsto)}</span>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => navigate('/Compras')}
        className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Ver no Compras
      </button>
    </div>
  );
}

// ─── Painel: Noturno + Meta 20 ───────────────────────────────────────────────
function PainelNoturnoMeta20({ relatorios = [], tipo }) {
  const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

  function classificar(a) {
    const cod = (a.meta_codigo || a.meta_id || '').toLowerCase();
    const nome = (a.titulo || a.nome || a.descricao || '').toLowerCase();
    if ((cod.includes('11') && !cod.includes('11b') && !cod.includes('pampulha')) || nome.includes('noturno centro')) return 'noturno';
    if (cod.includes('11b') || nome.includes('noturno') || cod.includes('16') || nome.includes('diária') || nome.includes('diaria')) return null;
    if (cod.includes('20') || cod.includes('10') || nome.includes('mostra')) return 'meta20';
    const class_ = (a.classificacao || '').toLowerCase();
    if (class_ === 'meta' || class_ === 'cultural' || class_ === 'educativa') return 'meta20';
    return null;
  }

  const relComAtividades = relatorios.map(r => {
    const atividades = (Array.isArray(r.atividades) ? r.atividades : []).filter(a => classificar(a) === tipo);
    return { ...r, atividadesFiltradas: atividades };
  }).filter(r => r.atividadesFiltradas.length > 0);

  const porMuseu = MUSEUS.map(m => {
    const total = relComAtividades
      .filter(r => String(r.museu || '').toUpperCase().includes(m))
      .reduce((s, r) => s + r.atividadesFiltradas.length, 0);
    return { museu: m, total };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {porMuseu.map(m => (
          <div key={m.museu} className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
            <p className="text-xs font-semibold text-slate-500 mb-1">{m.museu}</p>
            <p className="text-2xl font-black text-slate-800">{m.total}</p>
          </div>
        ))}
      </div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Relatórios com esta classificação</p>
      <div className="space-y-2">
        {relComAtividades.map(r => (
          <div key={r.id} className="border border-slate-100 rounded-lg p-2.5 bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 truncate">{r.author_name} — {r.museu}</span>
              <span className="text-xs font-bold text-slate-700">{r.atividadesFiltradas.length} ativ.</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{r.mes_referencia} {r.ano}</p>
          </div>
        ))}
        {relComAtividades.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Nenhum relatório encontrado.</p>}
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function DrillDownSheet({ open, onClose, config }) {
  if (!config) return null;
  const { title, value, sourceBadges = [], type, reports = [], rubricas = [], museu, relatorios = [], tipoNoturno } = config;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[600px] overflow-y-auto p-0">
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4">
          <SheetHeader>
            <SheetTitle className="text-base font-bold text-slate-900">{title}</SheetTitle>
          </SheetHeader>
          {value !== undefined && (
            <p className="text-3xl font-black text-slate-800 mt-1">{value}</p>
          )}
          {sourceBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {sourceBadges.map(b => (
                <span key={b} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {b === 'Relatórios' && <FileText className="w-3 h-3" />}
                  {b === 'Rubricas' && <TrendingUp className="w-3 h-3" />}
                  {b === 'Atividades' && <Calendar className="w-3 h-3" />}
                  {b === 'Compras' && <TrendingUp className="w-3 h-3" />}
                  {b === 'Museus' && <Building2 className="w-3 h-3" />}
                  {b === 'Público' && <Users className="w-3 h-3" />}
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Origem dos dados</p>

          {type === 'relatorios' && <PainelRelatorios reports={reports} />}
          {type === 'museu' && <PainelMuseu museu={museu} reports={reports} />}
          {type === 'orcamento' && <PainelOrcamento rubricas={rubricas} />}
          {type === 'noturno_meta20' && <PainelNoturnoMeta20 relatorios={relatorios} tipo={tipoNoturno} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}