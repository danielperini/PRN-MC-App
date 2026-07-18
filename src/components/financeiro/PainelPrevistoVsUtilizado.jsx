import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const fmtBRL = (v) => {
  if (!v && v !== 0) return 'R$ 0';
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return `R$ ${v.toFixed(2)}`;
};

function BarraProgresso({ pct, saldo }) {
  const cor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : pct >= 50 ? 'bg-blue-500' : 'bg-green-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full transition-all ${cor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function LinhaRubrica({ r }) {
  // usa aliases canônicos (mesma lógica do useDashboardMetrics)
  const previsto = Number(r?.valor_rubrica ?? r?.valor_total ?? r?.valor_previsto ?? r?.valor ?? 0);
  const utilizado = Number(r?.valor_utilizado ?? r?.valor_executado ?? r?.utilizado ?? r?.realizado ?? 0);
  const saldo = previsto - utilizado;
  const pct = previsto > 0 ? (utilizado / previsto) * 100 : 0;
  const alertaExtrapolou = saldo < 0;
  const alertaAlto = pct >= 80 && saldo >= 0;

  return (
    <div className={`px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${alertaExtrapolou ? 'bg-red-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{r.rubrica || r.nome || 'Sem nome'}</p>
          <p className="text-xs text-gray-400 truncate">{r.grupo || '—'}</p>
          <BarraProgresso pct={pct} saldo={saldo} />
        </div>
        <div className="flex-shrink-0 text-right space-y-0.5">
          <div className="flex items-center gap-2 justify-end">
            {alertaExtrapolou && <Badge variant="destructive" className="text-xs px-1.5 py-0">Excedido</Badge>}
            {alertaAlto && !alertaExtrapolou && <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-400 text-amber-700">Atenção</Badge>}
          </div>
          <p className="text-xs text-gray-500">{fmtBRL(previsto)} previsto</p>
          <p className="text-xs text-gray-600">{fmtBRL(utilizado)} utilizado</p>
          <p className={`text-xs font-semibold ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {fmtBRL(saldo)} saldo
          </p>
          <p className="text-xs text-gray-400">{pct.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}

const CORES_BARRAS = { previsto: '#d1d5db', utilizado: '#111827' };

export default function PainelPrevistoVsUtilizado({ rubricas = [] }) {
  const [aditivo, setAditivo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState('saldo_asc');
  const [expandido, setExpandido] = useState(true);
  const [limite, setLimite] = useState(15);

  const rubricasFiltradas = useMemo(() => {
    let lista = rubricas.filter(r => {
      const origem = (r.origem_recurso || '').trim();
      if (aditivo === '3') return origem === '3º ADITIVO' || origem === '3º Aditivo';
      if (aditivo === '4') return origem === '4º ADITIVO' || origem === '4º Aditivo';
      // "todos" = apenas 3º e 4º aditivo (excluir repasses anteriores)
      return origem === '3º ADITIVO' || origem === '3º Aditivo' || origem === '4º ADITIVO' || origem === '4º Aditivo';
    });

    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(r =>
        (r.rubrica || r.nome || '').toLowerCase().includes(q) ||
        (r.grupo || '').toLowerCase().includes(q) ||
        (r.centro_custo || '').toLowerCase().includes(q)
      );
    }

    lista = lista.map(r => {
      const previsto = Number(r?.valor_rubrica ?? r?.valor_total ?? r?.valor_previsto ?? r?.valor ?? 0);
      const utilizado = Number(r?.valor_utilizado ?? r?.valor_executado ?? r?.utilizado ?? r?.realizado ?? 0);
      return { ...r, _previsto: previsto, _utilizado: utilizado, _saldo: previsto - utilizado, _pct: previsto > 0 ? (utilizado / previsto) * 100 : 0 };
    });

    if (ordenacao === 'saldo_asc') lista.sort((a, b) => a._saldo - b._saldo);
    else if (ordenacao === 'saldo_desc') lista.sort((a, b) => b._saldo - a._saldo);
    else if (ordenacao === 'pct_desc') lista.sort((a, b) => b._pct - a._pct);
    else if (ordenacao === 'previsto_desc') lista.sort((a, b) => b._previsto - a._previsto);

    return lista;
  }, [rubricas, aditivo, busca, ordenacao]);

  // Dados para o gráfico de barras — top 12 por previsto
  const dadosGrafico = useMemo(() => {
    return [...rubricasFiltradas]
      .sort((a, b) => b._previsto - a._previsto)
      .slice(0, 12)
      .map(r => ({
        nome: (r.rubrica || r.nome || '').slice(0, 22) + ((r.rubrica || r.nome || '').length > 22 ? '…' : ''),
        Previsto: r._previsto,
        Utilizado: r._utilizado,
        _saldo: r._saldo,
      }));
  }, [rubricasFiltradas]);

  // Totalizadores do filtro atual
  const totais = useMemo(() => {
    const previsto = rubricasFiltradas.reduce((s, r) => s + r._previsto, 0);
    const utilizado = rubricasFiltradas.reduce((s, r) => s + r._utilizado, 0);
    return { previsto, utilizado, saldo: previsto - utilizado };
  }, [rubricasFiltradas]);

  const excedidas = rubricasFiltradas.filter(r => r._saldo < 0).length;
  const atencao = rubricasFiltradas.filter(r => r._pct >= 80 && r._saldo >= 0).length;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const prev = payload.find(p => p.dataKey === 'Previsto')?.value || 0;
    const util = payload.find(p => p.dataKey === 'Utilizado')?.value || 0;
    const saldo = prev - util;
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        <p className="text-gray-500">Previsto: {fmtBRL(prev)}</p>
        <p className="text-gray-700">Utilizado: {fmtBRL(util)}</p>
        <p className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>Saldo: {fmtBRL(saldo)}</p>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden mb-8">
      {/* Header */}
      <div
        className="px-6 py-4 border-b border-gray-100 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpandido(v => !v)}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-black">Previsto vs. Utilizado por Rubrica</h2>
          <div className="flex gap-1.5">
            {excedidas > 0 && (
              <Badge variant="destructive" className="text-xs">{excedidas} excedida{excedidas > 1 ? 's' : ''}</Badge>
            )}
            {atencao > 0 && (
              <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">{atencao} em atenção</Badge>
            )}
          </div>
        </div>
        <button className="text-gray-400 hover:text-gray-600">
          {expandido ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {expandido && (
        <>
          {/* Totalizadores */}
          <div className="grid grid-cols-3 divide-x divide-gray-100 bg-gray-50">
            <div className="px-6 py-3 text-center">
              <p className="text-xs text-gray-500">Total Previsto</p>
              <p className="text-lg font-bold text-black">{fmtBRL(totais.previsto)}</p>
            </div>
            <div className="px-6 py-3 text-center">
              <p className="text-xs text-gray-500">Total Utilizado</p>
              <p className="text-lg font-bold text-gray-700">{fmtBRL(totais.utilizado)}</p>
            </div>
            <div className="px-6 py-3 text-center">
              <p className="text-xs text-gray-500">Saldo Disponível</p>
              <p className={`text-lg font-bold ${totais.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmtBRL(totais.saldo)}
              </p>
            </div>
          </div>

          {/* Gráfico de barras */}
          {dadosGrafico.length > 0 && (
            <div className="px-6 pt-5 pb-2">
              <p className="text-xs text-gray-500 mb-3">Top {dadosGrafico.length} rubricas por valor previsto</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosGrafico} barGap={2} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtBRL(v)} width={75} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Previsto" fill={CORES_BARRAS.previsto} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Utilizado" fill={CORES_BARRAS.utilizado} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1 justify-center">
                <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm inline-block bg-gray-300" />Previsto</span>
                <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm inline-block bg-gray-900" />Utilizado</span>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="px-6 py-3 border-t border-gray-100 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input placeholder="Buscar rubrica ou grupo..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={aditivo} onValueChange={setAditivo}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Aditivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os aditivos</SelectItem>
                <SelectItem value="3">3º Aditivo</SelectItem>
                <SelectItem value="4">4º Aditivo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ordenacao} onValueChange={setOrdenacao}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saldo_asc">Menor saldo primeiro</SelectItem>
                <SelectItem value="saldo_desc">Maior saldo primeiro</SelectItem>
                <SelectItem value="pct_desc">Mais utilizado (%)</SelectItem>
                <SelectItem value="previsto_desc">Maior previsto</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-gray-400">{rubricasFiltradas.length} rubricas</span>
          </div>

          {/* Lista de rubricas */}
          <div className="divide-y divide-gray-50">
            {rubricasFiltradas.slice(0, limite).map(r => (
              <LinhaRubrica key={r.id} r={r} />
            ))}
            {rubricasFiltradas.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Nenhuma rubrica encontrada.</p>
            )}
          </div>

          {rubricasFiltradas.length > limite && (
            <div className="px-6 py-3 border-t border-gray-100 text-center">
              <button
                className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
                onClick={() => setLimite(l => l + 20)}
              >
                Ver mais {Math.min(20, rubricasFiltradas.length - limite)} rubricas
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}