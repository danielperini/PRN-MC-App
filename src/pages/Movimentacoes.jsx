import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, RefreshCw, Loader2, ExternalLink,
  ArrowUpRight, ArrowDownLeft, FileText, Banknote,
  Wallet, Search, X, CalendarDays, ChevronDown, ChevronUp, FolderSync
} from 'lucide-react';

import FluxoCaixaMensal from '@/components/dashboard/FluxoCaixaMensal';

const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTO = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

// ── Indicador de tipo de lançamento ──
function TipoChip({ tipo }) {
  if (tipo === 'credito') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
      <ArrowUpRight className="w-2.5 h-2.5" /> Crédito
    </span>
  );
  if (tipo === 'debito') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
      <ArrowDownLeft className="w-2.5 h-2.5" /> Débito
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">
      <TrendingUp className="w-2.5 h-2.5" /> Rendimento
    </span>
  );
}

// ── Card mensal horizontal ──
function CardMes({ registros, selecionado, onSelecionar }) {
  const conta = registros.filter(r => r.tipo === 'extrato_conta');
  const rend = registros.filter(r => r.tipo === 'extrato_rendimento');
  const creditos = conta.reduce((s, r) => s + (r.total_creditos || 0), 0);
  const debitos = conta.reduce((s, r) => s + (r.total_debitos || 0), 0);
  const rendimento = rend.reduce((s, r) => s + (r.total_rendimento || 0), 0);
  const saldo = conta.reduce((s, r) => s + (r.saldo_final || 0), 0) || (creditos - debitos);
  const { mes_num, ano } = registros[0];
  const mesLabel = MESES_CURTO[mes_num] || '?';
  const positivo = saldo >= 0;

  return (
    <button
      onClick={onSelecionar}
      className={`flex-shrink-0 w-40 rounded-2xl border p-3.5 text-left transition-all ${
        selecionado
          ? 'border-slate-800 bg-slate-900 text-white shadow-lg scale-[1.02]'
          : 'border-gray-200 bg-white hover:border-gray-400 hover:shadow-md'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${selecionado ? 'text-slate-400' : 'text-gray-400'}`}>{mesLabel}</p>
          <p className={`text-sm font-bold leading-tight ${selecionado ? 'text-white' : 'text-black'}`}>{ano}</p>
        </div>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
          selecionado ? 'bg-white/15' : positivo ? 'bg-green-100' : 'bg-red-100'
        }`}>
          {positivo
            ? <ArrowUpRight className={`w-3 h-3 ${selecionado ? 'text-green-300' : 'text-green-600'}`} />
            : <ArrowDownLeft className={`w-3 h-3 ${selecionado ? 'text-red-300' : 'text-red-500'}`} />
          }
        </div>
      </div>

      <div className="space-y-1.5">
        {creditos > 0 && (
          <div>
            <p className={`text-[9px] uppercase tracking-wide ${selecionado ? 'text-slate-400' : 'text-gray-400'}`}>Créditos</p>
            <p className={`text-xs font-bold ${selecionado ? 'text-green-300' : 'text-green-700'}`}>{fmtBRL(creditos)}</p>
          </div>
        )}
        {debitos > 0 && (
          <div>
            <p className={`text-[9px] uppercase tracking-wide ${selecionado ? 'text-slate-400' : 'text-gray-400'}`}>Débitos</p>
            <p className={`text-xs font-bold ${selecionado ? 'text-red-300' : 'text-red-600'}`}>{fmtBRL(debitos)}</p>
          </div>
        )}
        {rendimento > 0 && (
          <div>
            <p className={`text-[9px] uppercase tracking-wide ${selecionado ? 'text-slate-400' : 'text-gray-400'}`}>Rendimento</p>
            <p className={`text-xs font-bold ${selecionado ? 'text-blue-300' : 'text-blue-700'}`}>{fmtBRL(rendimento)}</p>
          </div>
        )}
      </div>

      {saldo !== 0 && (
        <div className={`mt-3 pt-2 border-t ${selecionado ? 'border-white/10' : 'border-gray-100'}`}>
          <p className={`text-[9px] uppercase tracking-wide ${selecionado ? 'text-slate-400' : 'text-gray-400'}`}>Saldo</p>
          <p className={`text-sm font-bold ${selecionado ? 'text-white' : positivo ? 'text-slate-800' : 'text-red-600'}`}>
            {fmtBRL(Math.abs(saldo))}
          </p>
        </div>
      )}
    </button>
  );
}

// ── Barra crédito × débito ──
function BarraFluxo({ creditos, debitos }) {
  const total = creditos + debitos;
  if (!total) return null;
  const pct = Math.round((creditos / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
        <span className="text-green-600 font-medium">Créditos {pct}%</span>
        <span className="text-red-500 font-medium">Débitos {100 - pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-red-100 overflow-hidden">
        <div className="h-full bg-green-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Tabela de lançamentos ──
function TabelaLancamentos({ registros, busca }) {
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [verMais, setVerMais] = useState(false);

  const todos = useMemo(() => {
    const lista = [];
    registros.forEach(r => {
      (r.lancamentos || []).forEach(l => lista.push({ ...l, banco: r.banco, extrato_tipo: r.tipo }));
    });
    return lista.sort((a, b) => (a.data && b.data ? b.data.localeCompare(a.data) : 0));
  }, [registros]);

  const filtrados = todos.filter(l => {
    if (tipoFiltro !== 'todos' && l.tipo !== tipoFiltro) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return (l.descricao || '').toLowerCase().includes(b) || (l.banco || '').toLowerCase().includes(b);
    }
    return true;
  });

  const exibidos = verMais ? filtrados : filtrados.slice(0, 25);

  if (todos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
        <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Nenhum lançamento registrado neste período</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filtros por tipo */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'todos', label: 'Todos', count: todos.length },
          { key: 'credito', label: 'Créditos', count: todos.filter(l => l.tipo === 'credito').length },
          { key: 'debito', label: 'Débitos', count: todos.filter(l => l.tipo === 'debito').length },
          { key: 'rendimento', label: 'Rendimentos', count: todos.filter(l => l.tipo === 'rendimento').length },
        ].filter(f => f.count > 0 || f.key === 'todos').map(f => (
          <button
            key={f.key}
            onClick={() => { setTipoFiltro(f.key); setVerMais(false); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
              tipoFiltro === f.key
                ? 'border-slate-800 bg-slate-900 text-white'
                : 'border-gray-200 text-gray-500 hover:border-gray-400 bg-white'
            }`}
          >
            {f.label}
            {f.count > 0 && <span className={`ml-1.5 text-[10px] ${tipoFiltro === f.key ? 'opacity-60' : 'text-gray-400'}`}>{f.count}</span>}
          </button>
        ))}
        {filtrados.length !== todos.length && (
          <span className="text-xs text-gray-400 ml-auto">{filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell w-28">Tipo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Valor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 hidden sm:table-cell">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {exibidos.map((l, i) => (
              <tr key={i} className={`transition-colors hover:bg-gray-50 ${
                l.tipo === 'credito' || l.tipo === 'rendimento'
                  ? 'border-l-2 border-l-green-400'
                  : 'border-l-2 border-l-red-400'
              }`}>
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs font-mono">{l.data || '—'}</td>
                <td className="px-4 py-3 text-gray-700 max-w-xs">
                  <span className="line-clamp-1 text-sm">{l.descricao || '—'}</span>
                  {l.banco && <span className="block text-[10px] text-gray-400 mt-0.5">{l.banco}</span>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <TipoChip tipo={l.tipo} />
                </td>
                <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${
                  l.tipo === 'credito' || l.tipo === 'rendimento' ? 'text-green-700' : 'text-red-600'
                }`}>
                  <span className="text-xs mr-0.5 opacity-70">{l.tipo === 'debito' ? '−' : '+'}</span>
                  {fmtBRL(Math.abs(l.valor || 0))}
                </td>
                <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell text-sm whitespace-nowrap">
                  {l.saldo != null ? fmtBRL(l.saldo) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtrados.length > 25 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-center">
            <button
              onClick={() => setVerMais(v => !v)}
              className="text-xs text-gray-500 hover:text-black flex items-center gap-1.5 mx-auto font-medium"
            >
              {verMais
                ? <><ChevronUp className="w-3.5 h-3.5" /> Ver menos</>
                : <><ChevronDown className="w-3.5 h-3.5" /> Ver todos ({filtrados.length - 25} restantes)</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Painel de detalhe do mês ──
function DetalheMes({ registros, busca }) {
  const conta = registros.filter(r => r.tipo === 'extrato_conta');
  const rend = registros.filter(r => r.tipo === 'extrato_rendimento');
  const creditos = conta.reduce((s, r) => s + (r.total_creditos || 0), 0);
  const debitos = conta.reduce((s, r) => s + (r.total_debitos || 0), 0);
  const rendimento = rend.reduce((s, r) => s + (r.total_rendimento || 0), 0);
  const saldoFinal = conta.reduce((s, r) => s + (r.saldo_final || 0), 0) || (creditos - debitos);
  const { mes, mes_num, ano } = registros[0];

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-black">{MESES_NOME[mes_num] || mes} de {ano}</h2>
          <p className="text-xs text-gray-400">{registros.length} documento{registros.length !== 1 ? 's' : ''} importado{registros.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Cards de KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Créditos', value: creditos, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', sub: 'text-green-500', icon: <ArrowUpRight className="w-4 h-4 text-green-600" /> },
          { label: 'Débitos', value: debitos, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', sub: 'text-red-400', icon: <ArrowDownLeft className="w-4 h-4 text-red-500" /> },
          { label: 'Rendimentos', value: rendimento, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', sub: 'text-blue-400', icon: <TrendingUp className="w-4 h-4 text-blue-600" /> },
          { label: 'Saldo Final', value: saldoFinal, bg: saldoFinal >= 0 ? 'bg-slate-50' : 'bg-orange-50', border: saldoFinal >= 0 ? 'border-slate-200' : 'border-orange-200', text: saldoFinal >= 0 ? 'text-slate-800' : 'text-orange-700', sub: 'text-gray-400', icon: <Wallet className="w-4 h-4 text-gray-500" /> },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
            <div className="flex items-center justify-between mb-2">
              {c.icon}
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${c.sub}`}>{c.label}</span>
            </div>
            <p className={`text-base font-bold ${c.text}`}>{fmtBRL(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Barra de proporção */}
      {creditos > 0 && debitos > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">Proporção créditos × débitos</p>
          <BarraFluxo creditos={creditos} debitos={debitos} />
          <div className="flex justify-between text-sm font-bold mt-2">
            <span className="text-green-700">{fmtBRL(creditos)}</span>
            <span className="text-red-600">{fmtBRL(debitos)}</span>
          </div>
        </div>
      )}

      {/* Documentos fonte */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documentos do mês</p>
        {registros.map((r, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.tipo === 'extrato_rendimento' ? 'bg-blue-100' : 'bg-slate-100'}`}>
                {r.tipo === 'extrato_rendimento'
                  ? <TrendingUp className="w-4 h-4 text-blue-600" />
                  : <Banknote className="w-4 h-4 text-slate-600" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-black truncate">{r.banco || r.drive_file_name || 'Documento'}</p>
                <p className="text-[11px] text-gray-400">
                  {r.tipo === 'extrato_rendimento' ? 'Extrato de Rendimento' : 'Extrato de Conta'}{r.conta ? ` · Conta ${r.conta}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {r.tipo === 'extrato_rendimento' && r.total_rendimento > 0 && (
                <span className="text-sm font-bold text-blue-700">{fmtBRL(r.total_rendimento)}</span>
              )}
              {r.tipo === 'extrato_conta' && r.saldo_final > 0 && (
                <span className="text-sm font-bold text-slate-800">{fmtBRL(r.saldo_final)}</span>
              )}
              {r.drive_file_url && (
                <a href={r.drive_file_url} target="_blank" rel="noreferrer"
                  className="text-[11px] flex items-center gap-1 text-blue-600 hover:underline border border-blue-200 rounded-lg px-2.5 py-1.5 bg-blue-50 font-medium">
                  <ExternalLink className="w-3 h-3" /> PDF
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tabela de lançamentos */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lançamentos detalhados</p>
        <TabelaLancamentos registros={registros} busca={busca} />
      </div>
    </div>
  );
}

// ── Componente principal ──
function MovimentacoesInner() {
  const [sincronizando, setSincronizando] = useState(false);
  const [sincronizandoDocs, setSincronizandoDocs] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(null);
  const [busca, setBusca] = useState('');
  const { data: movimentacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-bancarias'],
    queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 500),
    staleTime: 1000 * 60 * 5,
  });

  const grupos = useMemo(() => {
    const map = {};
    movimentacoes.forEach(r => {
      const key = `${r.ano}-${String(r.mes_num || 0).padStart(2, '0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, registros]) => ({ key, registros }));
  }, [movimentacoes]);

  useEffect(() => {
    if (grupos.length > 0 && !mesSelecionado) setMesSelecionado(grupos[0].key);
  }, [grupos]);

  const totaisGerais = useMemo(() => ({
    creditos: movimentacoes.filter(r => r.tipo === 'extrato_conta').reduce((s, r) => s + (r.total_creditos || 0), 0),
    debitos: movimentacoes.filter(r => r.tipo === 'extrato_conta').reduce((s, r) => s + (r.total_debitos || 0), 0),
    rendimento: movimentacoes.filter(r => r.tipo === 'extrato_rendimento').reduce((s, r) => s + (r.total_rendimento || 0), 0),
  }), [movimentacoes]);

  const registrosMes = useMemo(() => grupos.find(g => g.key === mesSelecionado)?.registros || [], [grupos, mesSelecionado]);

  async function handleSincronizarDocs() {
    setSincronizandoDocs(true);
    toast.info('Sincronizando NFs e contratos do Drive (lote de 5)…');
    try {
      const res = await base44.functions.invoke('sincronizarDocumentosDrive', { maxPorLote: 5 });
      const d = res.data;
      if (!d?.success) {
        if (d?.code === 'DRIVE_NOT_CONNECTED') {
          toast.error('Google Drive não conectado.', { duration: 8000 });
        } else {
          throw new Error(d?.error || 'Erro desconhecido');
        }
        return;
      }
      const { criados = 0, novos_no_drive = 0, restantes = 0, erros = 0 } = d.resumo || {};
      if (novos_no_drive === 0) {
        toast.success('Todos os documentos já estão importados.');
      } else {
        toast.success(
          `${criados} documento${criados !== 1 ? 's' : ''} importado${criados !== 1 ? 's' : ''}` +
          (restantes > 0 ? ` · ${restantes} restante${restantes !== 1 ? 's' : ''} — clique novamente` : '') +
          (erros > 0 ? ` · ${erros} erro${erros !== 1 ? 's' : ''}` : ''),
          { duration: restantes > 0 ? 8000 : 4000 }
        );
      }
    } catch (e) {
      toast.error('Erro: ' + (e?.message || String(e)), { duration: 6000 });
    } finally {
      setSincronizandoDocs(false);
    }
  }

  async function handleSincronizar() {
    setSincronizando(true);
    toast.info('Processando extratos do Drive (lote de 3 por vez)…');
    try {
      const res = await base44.functions.invoke('lerExtratosBancariosDrive', {});
      const d = res.data;
      if (!d?.success) {
        if (d?.code === 'DRIVE_NOT_CONNECTED') {
          toast.error('Google Drive não conectado. Peça ao administrador para reconectar o Drive.', { duration: 8000 });
        } else {
          throw new Error(d?.error || 'Erro desconhecido');
        }
        return;
      }
      const { novos_criados = 0, pdfs_encontrados = 0, restantes = 0, erros = 0 } = d.resumo || {};
      if (pdfs_encontrados === 0) {
        toast.info('Nenhum PDF encontrado na pasta de extratos do Drive.');
      } else if (novos_criados === 0 && restantes === 0) {
        toast.success('Todos os extratos já estão importados.');
      } else {
        toast.success(
          `${novos_criados} extrato${novos_criados !== 1 ? 's' : ''} importado${novos_criados !== 1 ? 's' : ''}` +
          (restantes > 0 ? ` · Clique novamente para processar ${restantes} restante${restantes !== 1 ? 's' : ''}` : '') +
          (erros > 0 ? ` · ${erros} erro${erros !== 1 ? 's' : ''}` : ''),
          { duration: restantes > 0 ? 8000 : 4000 }
        );
      }
      await refetch();
    } catch (e) {
      toast.error('Erro ao sincronizar: ' + (e?.message || String(e)), { duration: 6000 });
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 shadow-sm">
              <Banknote className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Movimentações Bancárias</h1>
              <p className="text-sm text-gray-400">Extratos e rendimentos lidos automaticamente do Google Drive</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleSincronizarDocs}
              disabled={sincronizandoDocs}
              variant="outline"
              className="gap-2 rounded-xl shrink-0 border-slate-300"
            >
              {sincronizandoDocs
                ? <><Loader2 className="w-4 h-4 animate-spin" />Importando…</>
                : <><FolderSync className="w-4 h-4" />NFs e Contratos</>
              }
            </Button>
            <Button
              onClick={handleSincronizar}
              disabled={sincronizando}
              className="gap-2 bg-slate-900 text-white hover:bg-slate-700 rounded-xl shrink-0"
            >
              {sincronizando
                ? <><Loader2 className="w-4 h-4 animate-spin" />Lendo…</>
                : <><RefreshCw className="w-4 h-4" />Extratos Drive</>
              }
            </Button>
          </div>
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Carregando movimentações…</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && movimentacoes.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-gray-400" />
            </div>
            <p className="font-semibold text-gray-500">Nenhum extrato importado ainda</p>
            <p className="text-sm text-gray-400 mt-1 mb-5">Clique em "Sincronizar Drive" para ler os PDFs da pasta.</p>
            <Button onClick={handleSincronizar} disabled={sincronizando} className="bg-slate-900 text-white hover:bg-slate-700 gap-2 rounded-xl">
              {sincronizando ? <><Loader2 className="w-4 h-4 animate-spin" />Lendo…</> : <><RefreshCw className="w-4 h-4" />Sincronizar agora</>}
            </Button>
          </div>
        )}

        {!isLoading && movimentacoes.length > 0 && (
          <>
            {/* ── Cards KPI consolidados ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-green-200 bg-white p-5 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-[11px] text-green-500 uppercase font-bold tracking-wide">Total créditos</p>
                  <p className="text-xl font-bold text-green-700">{fmtBRL(totaisGerais.creditos)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Período completo · {grupos.length} mese{grupos.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-red-200 bg-white p-5 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[11px] text-red-400 uppercase font-bold tracking-wide">Total débitos</p>
                  <p className="text-xl font-bold text-red-600">{fmtBRL(totaisGerais.debitos)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Período completo · {movimentacoes.length} extrato{movimentacoes.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-white p-5 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-[11px] text-blue-500 uppercase font-bold tracking-wide">Total rendimentos</p>
                  <p className="text-xl font-bold text-blue-700">{fmtBRL(totaisGerais.rendimento)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Aplicações e rendimentos</p>
                </div>
              </div>
            </div>

            {/* ── Fluxo de caixa mensal (gráfico) ── */}
            <FluxoCaixaMensal />

            {/* ── Cards mensais em scroll horizontal ── */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> Selecione o mês
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {grupos.map(({ key, registros }) => (
                  <CardMes
                    key={key}
                    registros={registros}
                    selecionado={mesSelecionado === key}
                    onSelecionar={() => setMesSelecionado(key)}
                  />
                ))}
              </div>
            </div>

            {/* ── Busca global ── */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar lançamento, banco, descrição…"
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white shadow-sm"
              />
              {busca && (
                <button onClick={() => setBusca('')} className="absolute right-3.5 top-3 text-gray-400 hover:text-black">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* ── Detalhe do mês selecionado ── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              {registrosMes.length > 0 ? (
                <DetalheMes registros={registrosMes} busca={busca} />
              ) : (
                <div className="py-16 text-center">
                  <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400">Selecione um mês acima para ver os detalhes</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Movimentacoes() {
  return <MovimentacoesInner />;
}