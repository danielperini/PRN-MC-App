import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import {
  Building2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Filter, Download, RefreshCw, CircleDot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ── Utilitários ──
function toNum(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(toNum(v));
}

function fmtPct(v) { return `${toNum(v).toFixed(1)}%`; }

function normText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

// ── Classificação de centro de custo ──
const MUSEUS_FISICOS = ['MHAB', 'MIS', 'MUMO'];

function normalizarCentro(cc) {
  const raw = String(cc || '').trim().toUpperCase();
  if (!raw) return 'Geral';
  if (raw === 'MIS BH' || raw === 'MIS') return 'MIS';
  if (raw === 'MHAB' || raw === 'MAB') return 'MHAB';
  if (raw === 'MUMO' || raw === 'MUMU') return 'MUMO';
  const low = raw.toLowerCase();
  if (low.includes('noturno') && (low.includes('pampulha') || low.includes('4'))) return 'Noturno Pampulha';
  if (low.includes('noturno')) return 'Noturno 2026';
  if (raw.includes('GERAL') || raw.includes('TRANSVERSAL')) return 'Geral';
  if (raw.includes('COORDENA')) return 'Coordenação';
  if (raw.includes('COMUNICA')) return 'Comunicação';
  if (raw.includes('EDUCA')) return 'Educação';
  if (raw.includes('PRODU')) return 'Produção';
  if (raw.includes('ADMIN') || raw.includes('FINANC')) return 'Administrativo';
  if (raw.includes('PUBLICA')) return 'Publicações';
  return 'Outros';
}

// Cores por centro de custo
const CORES = {
  MHAB: '#6366f1',
  MIS: '#f59e0b',
  MUMO: '#10b981',
  'Noturno 2026': '#8b5cf6',
  'Noturno Pampulha': '#ec4899',
  Geral: '#64748b',
  Coordenação: '#0ea5e9',
  Comunicação: '#f97316',
  Educação: '#14b8a6',
  Produção: '#ef4444',
  Administrativo: '#84cc16',
  Publicações: '#a78bfa',
  Outros: '#94a3b8',
};

function getStatusRubrica(pct) {
  if (pct >= 100) return { label: 'Esgotada', color: 'bg-red-100 text-red-700 border-red-200' };
  if (pct >= 85) return { label: 'Crítico', color: 'bg-orange-100 text-orange-700 border-orange-200' };
  if (pct >= 60) return { label: 'Atenção', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  return { label: 'Normal', color: 'bg-green-100 text-green-700 border-green-200' };
}

// ── Barra de progresso ──
function ProgressBar({ pct, color = '#6366f1' }) {
  const clamped = Math.min(pct, 100);
  const overflow = pct > 100;
  return (
    <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: overflow ? '#ef4444' : color }}
      />
    </div>
  );
}

// ── Card de museu ──
function MuseuCard({ museu, dados, cor, onClick, ativo }) {
  const pct = dados.previsto > 0 ? (dados.utilizado / dados.previsto) * 100 : 0;
  const status = getStatusRubrica(pct);
  const saldo = dados.previsto - dados.utilizado;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 transition-all hover:shadow-md ${
        ativo ? 'border-black shadow-md ring-2 ring-black ring-offset-1' : 'border-gray-200 bg-white hover:border-gray-400'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-sm font-bold text-black">{museu}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] border ${status.color}`}>{status.label}</Badge>
      </div>

      <div className="space-y-1 mb-3">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Utilizado</span>
          <span className="font-semibold text-black">{fmtPct(pct)}</span>
        </div>
        <ProgressBar pct={pct} color={cor} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-400">Meta (previsto)</p>
          <p className="font-semibold text-gray-700">{fmtBRL(dados.previsto)}</p>
        </div>
        <div>
          <p className="text-gray-400">Utilizado</p>
          <p className="font-semibold text-blue-700">{fmtBRL(dados.utilizado)}</p>
        </div>
        <div>
          <p className="text-gray-400">Saldo</p>
          <p className={`font-semibold ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtBRL(saldo)}</p>
        </div>
        <div>
          <p className="text-gray-400">Rubricas</p>
          <p className="font-semibold text-gray-700">{dados.rubricas.length}</p>
        </div>
      </div>
    </button>
  );
}

// ── Linha de rubrica expandida ──
function RubricaRow({ r, cor }) {
  const pct = r.previsto > 0 ? (r.utilizado / r.previsto) * 100 : 0;
  const status = getStatusRubrica(pct);
  const saldo = r.previsto - r.utilizado;

  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-xs font-medium text-gray-800 leading-snug">{r.nome}</p>
        {r.grupo && <p className="text-[11px] text-gray-400 mt-0.5">{r.grupo}</p>}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-xs font-semibold text-gray-700">{fmtBRL(r.previsto)}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-[80px]">
            <ProgressBar pct={pct} color={pct >= 85 ? '#ef4444' : cor} />
          </div>
          <span className="text-xs font-bold text-gray-700 w-10 text-right">{fmtPct(pct)}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-xs font-semibold text-blue-700">{fmtBRL(r.utilizado)}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-xs font-semibold ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtBRL(saldo)}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant="outline" className={`text-[10px] border ${status.color}`}>{status.label}</Badge>
      </td>
    </tr>
  );
}

// ── Tooltip do gráfico ──
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs space-y-1">
      <p className="font-bold text-gray-800 mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold text-gray-800">{fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Página principal ──
export default function AuditoriaMensalRubricas() {
  const [museuAtivo, setMuseuAtivo] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('todos'); // todos | critico | atencao | normal
  const [mesReferencia, setMesReferencia] = useState('');

  const { data: rubricas = [], isLoading: loadR, refetch } = useQuery({
    queryKey: ['rubricas-auditoria'],
    queryFn: () => base44.entities.Rubrica.list('-created_date', 500),
    staleTime: 60_000,
  });

  const { data: purchases = [], isLoading: loadP } = useQuery({
    queryKey: ['purchases-auditoria', mesReferencia],
    queryFn: () => {
      if (mesReferencia) {
        return base44.entities.PurchaseRequest.filter({ status: { $in: ['APROVADO_ADMIN','APROVADO_COORD','PAGO'] } }, '-created_date', 1000);
      }
      return base44.entities.PurchaseRequest.filter({ status: { $in: ['APROVADO_ADMIN','APROVADO_COORD','PAGO'] } }, '-created_date', 1000);
    },
    staleTime: 60_000,
  });

  // Agrupar rubricas por centro de custo
  const dadosPorMuseu = useMemo(() => {
    const map = {};
    const seen = new Set();

    rubricas.forEach(r => {
      if (seen.has(r.id)) return;
      seen.add(r.id);

      const centro = normalizarCentro(r.centro_custo || r.museu_codigo);
      if (!map[centro]) map[centro] = { rubricas: [], previsto: 0, utilizado: 0 };

      const previsto = toNum(r.valor_rubrica || r.valor_total);
      const utilizado = toNum(r.valor_utilizado);

      map[centro].rubricas.push({
        id: r.id,
        nome: r.rubrica || r.nome || '—',
        grupo: r.grupo || '',
        previsto,
        utilizado,
        saldo: previsto - utilizado,
      });

      map[centro].previsto += previsto;
      map[centro].utilizado += utilizado;
    });

    return map;
  }, [rubricas]);

  // Gastos reais por centro de custo (purchases pagas/aprovadas)
  const gastosPorMuseu = useMemo(() => {
    const map = {};
    purchases.forEach(p => {
      const centro = normalizarCentro(p.centro_custo);
      const val = toNum(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado);
      map[centro] = (map[centro] || 0) + val;
    });
    return map;
  }, [purchases]);

  // Lista de museus ordenada por % de utilização
  const museusList = useMemo(() => {
    return Object.entries(dadosPorMuseu)
      .map(([museu, dados]) => ({ museu, ...dados }))
      .filter(m => m.previsto > 0)
      .sort((a, b) => (b.utilizado / b.previsto) - (a.utilizado / a.previsto));
  }, [dadosPorMuseu]);

  // Filtro de status
  const museusFiltrados = useMemo(() => {
    if (filtroStatus === 'todos') return museusList;
    return museusList.filter(m => {
      const pct = m.previsto > 0 ? (m.utilizado / m.previsto) * 100 : 0;
      if (filtroStatus === 'critico') return pct >= 85;
      if (filtroStatus === 'atencao') return pct >= 60 && pct < 85;
      if (filtroStatus === 'normal') return pct < 60;
      return true;
    });
  }, [museusList, filtroStatus]);

  // Dados do museu selecionado
  const dadosAtivo = museuAtivo ? dadosPorMuseu[museuAtivo] : null;
  const corAtivo = museuAtivo ? (CORES[museuAtivo] || '#6366f1') : '#6366f1';

  // Dados para gráfico de barras comparativo
  const dadosGrafico = museusList.slice(0, 10).map(m => ({
    nome: m.museu.length > 8 ? m.museu.slice(0, 8) + '…' : m.museu,
    nomeCompleto: m.museu,
    Previsto: m.previsto,
    Utilizado: m.utilizado,
    Saldo: Math.max(m.previsto - m.utilizado, 0),
  }));

  // Totais globais
  const totalPrevisto = museusList.reduce((s, m) => s + m.previsto, 0);
  const totalUtilizado = museusList.reduce((s, m) => s + m.utilizado, 0);
  const totalSaldo = totalPrevisto - totalUtilizado;
  const pctGlobal = totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0;

  const alertas = museusList.filter(m => {
    const pct = m.previsto > 0 ? (m.utilizado / m.previsto) * 100 : 0;
    return pct >= 85;
  });

  const isLoading = loadR || loadP;

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-2">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-black">Auditoria de Gastos vs. Metas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Comparativo mensal de rubricas por centro de custo / museu</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={mesReferencia}
            onChange={e => setMesReferencia(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Todos os meses</option>
            {MESES.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>

          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'critico', label: '⚠ Crítico' },
              { key: 'atencao', label: '● Atenção' },
              { key: 'normal', label: '✓ Normal' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFiltroStatus(f.key)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filtroStatus === f.key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-1.5 rounded-xl"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs globais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Previsto', value: fmtBRL(totalPrevisto), sub: 'orçamento total', icon: <CircleDot className="w-4 h-4 text-gray-400" /> },
          { label: 'Total Utilizado', value: fmtBRL(totalUtilizado), sub: fmtPct(pctGlobal) + ' do orçamento', icon: <TrendingUp className="w-4 h-4 text-blue-500" /> },
          { label: 'Saldo Disponível', value: fmtBRL(totalSaldo), sub: totalSaldo < 0 ? 'Orçamento excedido!' : 'disponível', icon: totalSaldo < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" /> },
          { label: 'Alertas', value: alertas.length, sub: `centro${alertas.length !== 1 ? 's' : ''} ≥ 85%`, icon: <AlertTriangle className="w-4 h-4 text-orange-400" /> },
        ].map((kpi, i) => (
          <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">{kpi.label}</p>
              {kpi.icon}
            </div>
            <p className="text-xl font-bold text-black">{kpi.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Gráfico comparativo */}
      {dadosGrafico.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-black mb-4">Comparativo Previsto × Utilizado por Centro de Custo</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dadosGrafico} barSize={16} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Previsto" name="Meta (Previsto)" fill="#e2e8f0" radius={[3, 3, 0, 0]}>
                {dadosGrafico.map((entry, i) => (
                  <Cell key={i} fill={`${CORES[entry.nomeCompleto] || '#94a3b8'}33`} />
                ))}
              </Bar>
              <Bar dataKey="Utilizado" name="Utilizado" fill="#6366f1" radius={[3, 3, 0, 0]}>
                {dadosGrafico.map((entry, i) => (
                  <Cell key={i} fill={CORES[entry.nomeCompleto] || '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Cards de museus */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-black">
            {museusFiltrados.length} centro{museusFiltrados.length !== 1 ? 's' : ''} de custo
          </h2>
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 animate-pulse h-28" />
              ))
            ) : museusFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 p-8 text-center">
                <p className="text-sm text-gray-400">Nenhum centro neste filtro</p>
              </div>
            ) : (
              museusFiltrados.map(m => (
                <MuseuCard
                  key={m.museu}
                  museu={m.museu}
                  dados={m}
                  cor={CORES[m.museu] || '#94a3b8'}
                  onClick={() => setMuseuAtivo(prev => prev === m.museu ? null : m.museu)}
                  ativo={museuAtivo === m.museu}
                />
              ))
            )}
          </div>
        </div>

        {/* Detalhe do museu selecionado */}
        <div className="lg:col-span-2">
          {museuAtivo && dadosAtivo ? (
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
                style={{ borderTop: `3px solid ${corAtivo}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corAtivo }} />
                  <div>
                    <h2 className="text-sm font-bold text-black">{museuAtivo}</h2>
                    <p className="text-xs text-gray-500">
                      {fmtBRL(dadosAtivo.utilizado)} utilizados de {fmtBRL(dadosAtivo.previsto)} —
                      {' '}<strong>{fmtPct(dadosAtivo.previsto > 0 ? (dadosAtivo.utilizado / dadosAtivo.previsto) * 100 : 0)}</strong>
                    </p>
                  </div>
                </div>
                <button onClick={() => setMuseuAtivo(null)} className="text-gray-300 hover:text-gray-600">
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              {/* Barra global do museu */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <ProgressBar
                  pct={dadosAtivo.previsto > 0 ? (dadosAtivo.utilizado / dadosAtivo.previsto) * 100 : 0}
                  color={corAtivo}
                />
              </div>

              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Rubrica</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-28">Meta</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-48">Execução</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-28">Utilizado</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 w-28">Saldo</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosAtivo.rubricas
                      .slice()
                      .sort((a, b) => {
                        const pa = a.previsto > 0 ? a.utilizado / a.previsto : 0;
                        const pb = b.previsto > 0 ? b.utilizado / b.previsto : 0;
                        return pb - pa;
                      })
                      .map(r => (
                        <RubricaRow key={r.id} r={r} cor={corAtivo} />
                      ))
                    }
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-3 text-xs font-bold text-gray-700">TOTAL</td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-gray-700">{fmtBRL(dadosAtivo.previsto)}</td>
                      <td className="px-4 py-3">
                        <ProgressBar
                          pct={dadosAtivo.previsto > 0 ? (dadosAtivo.utilizado / dadosAtivo.previsto) * 100 : 0}
                          color={corAtivo}
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-blue-700">{fmtBRL(dadosAtivo.utilizado)}</td>
                      <td className={`px-4 py-3 text-right text-xs font-bold ${dadosAtivo.utilizado > dadosAtivo.previsto ? 'text-red-600' : 'text-green-700'}`}>
                        {fmtBRL(dadosAtivo.previsto - dadosAtivo.utilizado)}
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 h-full min-h-[320px] flex flex-col items-center justify-center gap-3 p-8">
              <Building2 className="w-10 h-10 text-gray-300" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-500">Selecione um centro de custo</p>
                <p className="text-xs text-gray-400 mt-1">Clique em qualquer card à esquerda para ver o detalhamento das rubricas</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Alertas de rubricas críticas */}
      {alertas.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-orange-800">
              {alertas.length} centro{alertas.length !== 1 ? 's' : ''} com execução ≥ 85%
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertas.map(m => {
              const pct = m.previsto > 0 ? (m.utilizado / m.previsto) * 100 : 0;
              return (
                <button
                  key={m.museu}
                  onClick={() => setMuseuAtivo(m.museu)}
                  className="flex items-center gap-2 rounded-xl border border-orange-300 bg-white px-3 py-2 text-xs hover:border-orange-500 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES[m.museu] || '#f97316' }} />
                  <span className="font-semibold text-gray-800">{m.museu}</span>
                  <span className="text-orange-600 font-bold">{fmtPct(pct)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}