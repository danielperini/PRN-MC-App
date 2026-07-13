import { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, RefreshCw, Loader2, ExternalLink,
  ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp,
  FileText, Banknote, Wallet, BarChart2, Search, X
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';

const MESES_NOME = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

// ── Barra de progresso crédito/débito ──
function BarraFluxo({ creditos, debitos }) {
  const total = creditos + debitos;
  if (!total) return null;
  const pctCred = Math.round((creditos / total) * 100);
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
        <span>Créditos {pctCred}%</span>
        <span>Débitos {100 - pctCred}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-red-100 overflow-hidden">
        <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pctCred}%` }} />
      </div>
    </div>
  );
}

// ── Card de resumo mensal (visual compacto) ──
function CardMesCompacto({ registros, selecionado, onSelecionar }) {
  const extratoConta = registros.filter(r => r.tipo === 'extrato_conta');
  const extratoRend = registros.filter(r => r.tipo === 'extrato_rendimento');
  const creditos = extratoConta.reduce((s, r) => s + (r.total_creditos || 0), 0);
  const debitos = extratoConta.reduce((s, r) => s + (r.total_debitos || 0), 0);
  const rendimento = extratoRend.reduce((s, r) => s + (r.total_rendimento || 0), 0);
  const saldoFinal = extratoConta.reduce((s, r) => s + (r.saldo_final || 0), 0);
  const saldo = saldoFinal || (creditos - debitos);
  const { mes, mes_num, ano } = registros[0];
  const mesLabel = MESES_NOME[mes_num] || mes || '?';

  return (
    <button
      onClick={onSelecionar}
      className={`rounded-2xl border p-4 text-left transition-all w-full ${
        selecionado
          ? 'border-black bg-black text-white shadow-lg'
          : 'border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${selecionado ? 'text-gray-300' : 'text-gray-400'}`}>{mesLabel}</p>
          <p className={`text-base font-bold ${selecionado ? 'text-white' : 'text-black'}`}>{ano}</p>
        </div>
        <div className={`text-[10px] px-2 py-0.5 rounded-full ${selecionado ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
          {registros.length} doc{registros.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="space-y-1.5">
        {creditos > 0 && (
          <div className="flex justify-between items-center">
            <span className={`text-[10px] flex items-center gap-0.5 ${selecionado ? 'text-green-300' : 'text-green-600'}`}>
              <ArrowUpRight className="w-3 h-3" /> Créditos
            </span>
            <span className={`text-xs font-semibold ${selecionado ? 'text-green-300' : 'text-green-700'}`}>{fmtBRL(creditos)}</span>
          </div>
        )}
        {debitos > 0 && (
          <div className="flex justify-between items-center">
            <span className={`text-[10px] flex items-center gap-0.5 ${selecionado ? 'text-red-300' : 'text-red-500'}`}>
              <ArrowDownLeft className="w-3 h-3" /> Débitos
            </span>
            <span className={`text-xs font-semibold ${selecionado ? 'text-red-300' : 'text-red-600'}`}>{fmtBRL(debitos)}</span>
          </div>
        )}
        {rendimento > 0 && (
          <div className="flex justify-between items-center">
            <span className={`text-[10px] flex items-center gap-0.5 ${selecionado ? 'text-blue-300' : 'text-blue-500'}`}>
              <TrendingUp className="w-3 h-3" /> Rendimento
            </span>
            <span className={`text-xs font-semibold ${selecionado ? 'text-blue-300' : 'text-blue-700'}`}>{fmtBRL(rendimento)}</span>
          </div>
        )}
      </div>

      {(creditos > 0 || debitos > 0) && !selecionado && <BarraFluxo creditos={creditos} debitos={debitos} />}

      {saldo !== 0 && (
        <div className={`mt-3 pt-2.5 border-t ${selecionado ? 'border-white/20' : 'border-gray-100'}`}>
          <div className="flex justify-between items-center">
            <span className={`text-[10px] ${selecionado ? 'text-gray-300' : 'text-gray-400'}`}>Saldo final</span>
            <span className={`text-sm font-bold ${selecionado ? 'text-white' : saldo >= 0 ? 'text-black' : 'text-red-600'}`}>{fmtBRL(Math.abs(saldo))}</span>
          </div>
        </div>
      )}
    </button>
  );
}

// ── Tabela de lançamentos ──
function TabelaLancamentos({ registros, busca }) {
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [verMais, setVerMais] = useState(false);

  const todosLancamentos = useMemo(() => {
    const lista = [];
    registros.forEach(r => {
      (r.lancamentos || []).forEach(l => {
        lista.push({ ...l, banco: r.banco, extrato_tipo: r.tipo });
      });
    });
    return lista.sort((a, b) => {
      if (a.data && b.data) return b.data.localeCompare(a.data);
      return 0;
    });
  }, [registros]);

  const filtrados = todosLancamentos.filter(l => {
    if (tipoFiltro !== 'todos' && l.tipo !== tipoFiltro) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return (l.descricao || '').toLowerCase().includes(b) ||
             (l.banco || '').toLowerCase().includes(b);
    }
    return true;
  });

  const exibidos = verMais ? filtrados : filtrados.slice(0, 20);

  if (todosLancamentos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
        <p className="text-xs text-gray-400">Nenhum lançamento registrado neste período</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {['todos', 'credito', 'debito', 'rendimento'].map(t => (
          <button
            key={t}
            onClick={() => setTipoFiltro(t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              tipoFiltro === t
                ? 'border-black bg-black text-white'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {t === 'todos' ? 'Todos' : t === 'credito' ? '↑ Créditos' : t === 'debito' ? '↓ Débitos' : '📈 Rendimentos'}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{filtrados.length} lançamento{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500 w-24">Data</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Descrição</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500 hidden md:table-cell w-32">Banco</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500 w-32">Valor</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500 w-32 hidden sm:table-cell">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {exibidos.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap font-mono">{l.data || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700 max-w-xs">
                  <span className="line-clamp-1">{l.descricao || '—'}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-400 hidden md:table-cell">{l.banco || '—'}</td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${
                  l.tipo === 'credito' || l.tipo === 'rendimento' ? 'text-green-700' : 'text-red-600'
                }`}>
                  <span className="mr-0.5">{l.tipo === 'debito' ? '−' : '+'}</span>
                  {fmtBRL(Math.abs(l.valor || 0))}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-400 hidden sm:table-cell whitespace-nowrap">
                  {l.saldo != null ? fmtBRL(l.saldo) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtrados.length > 20 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-center">
            <button
              onClick={() => setVerMais(v => !v)}
              className="text-xs text-gray-500 hover:text-black flex items-center gap-1 mx-auto"
            >
              {verMais ? <><ChevronUp className="w-3.5 h-3.5" /> Ver menos</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver todos ({filtrados.length - 20} restantes)</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detalhe do mês selecionado ──
function DetalheMes({ registros, busca }) {
  const extratoConta = registros.filter(r => r.tipo === 'extrato_conta');
  const extratoRend = registros.filter(r => r.tipo === 'extrato_rendimento');

  const creditos = extratoConta.reduce((s, r) => s + (r.total_creditos || 0), 0);
  const debitos = extratoConta.reduce((s, r) => s + (r.total_debitos || 0), 0);
  const rendimento = extratoRend.reduce((s, r) => s + (r.total_rendimento || 0), 0);
  const saldoFinal = extratoConta.reduce((s, r) => s + (r.saldo_final || 0), 0);
  const { mes, mes_num, ano } = registros[0];

  return (
    <div className="space-y-5">
      {/* Cabeçalho do mês */}
      <div>
        <h2 className="text-xl font-bold text-black">
          {MESES_NOME[mes_num] || mes} de {ano}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">{registros.length} documento{registros.length !== 1 ? 's' : ''} importado{registros.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total créditos', value: creditos, color: 'border-green-200 bg-green-50', text: 'text-green-700', icon: <ArrowUpRight className="w-4 h-4 text-green-600" /> },
          { label: 'Total débitos', value: debitos, color: 'border-red-200 bg-red-50', text: 'text-red-600', icon: <ArrowDownLeft className="w-4 h-4 text-red-500" /> },
          { label: 'Rendimentos', value: rendimento, color: 'border-blue-200 bg-blue-50', text: 'text-blue-700', icon: <TrendingUp className="w-4 h-4 text-blue-600" /> },
          { label: 'Saldo final', value: saldoFinal || (creditos - debitos), color: 'border-gray-200 bg-white', text: 'text-black', icon: <Wallet className="w-4 h-4 text-gray-600" /> },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl border ${c.color} p-3`}>
            <div className="flex items-center justify-between mb-1">
              {c.icon}
              <span className="text-[10px] text-gray-400">{c.label}</span>
            </div>
            <p className={`text-base font-bold ${c.text}`}>{fmtBRL(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Barra de fluxo */}
      {creditos > 0 && debitos > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">Proporção créditos × débitos</p>
          <BarraFluxo creditos={creditos} debitos={debitos} />
          <div className="flex justify-between text-xs font-semibold mt-2">
            <span className="text-green-700">{fmtBRL(creditos)}</span>
            <span className="text-red-600">{fmtBRL(debitos)}</span>
          </div>
        </div>
      )}

      {/* Documentos deste mês */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documentos</p>
        {registros.map((r, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${r.tipo === 'extrato_rendimento' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                {r.tipo === 'extrato_rendimento'
                  ? <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                  : <Banknote className="w-3.5 h-3.5 text-gray-600" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-black truncate">{r.banco || r.drive_file_name || 'Documento'}</p>
                <p className="text-[10px] text-gray-400">
                  {r.tipo === 'extrato_rendimento' ? 'Extrato de Rendimento' : 'Extrato Conta'}{r.conta ? ` · ${r.conta}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {r.tipo === 'extrato_rendimento' && r.total_rendimento > 0 && (
                <span className="text-sm font-semibold text-blue-700">{fmtBRL(r.total_rendimento)}</span>
              )}
              {r.tipo === 'extrato_conta' && r.saldo_final > 0 && (
                <span className="text-sm font-semibold text-black">{fmtBRL(r.saldo_final)}</span>
              )}
              {r.drive_file_url && (
                <a href={r.drive_file_url} target="_blank" rel="noreferrer"
                  className="text-[10px] flex items-center gap-0.5 text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1 bg-blue-50">
                  <ExternalLink className="w-3 h-3" />PDF
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tabela de lançamentos */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lançamentos</p>
        <TabelaLancamentos registros={registros} busca={busca} />
      </div>
    </div>
  );
}

function MovimentacoesInner() {
  const [sincronizando, setSincronizando] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(null);
  const [busca, setBusca] = useState('');

  const autoSyncDone = useRef(false);

  const { data: movimentacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-bancarias'],
    queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 500),
    staleTime: 1000 * 60 * 5,
  });

  // Auto-sincroniza ao entrar na página (uma vez por sessão)
  useEffect(() => {
    if (isLoading) return;
    if (autoSyncDone.current) return;
    autoSyncDone.current = true;
    handleSincronizarSilencioso();
  }, [isLoading]);

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

  // Auto-selecionar o mais recente quando carregar
  useEffect(() => {
    if (grupos.length > 0 && !mesSelecionado) {
      setMesSelecionado(grupos[0].key);
    }
  }, [grupos]);

  const totaisGerais = useMemo(() => {
    const creditos = movimentacoes.filter(r => r.tipo === 'extrato_conta').reduce((s, r) => s + (r.total_creditos || 0), 0);
    const debitos = movimentacoes.filter(r => r.tipo === 'extrato_conta').reduce((s, r) => s + (r.total_debitos || 0), 0);
    const rendimento = movimentacoes.filter(r => r.tipo === 'extrato_rendimento').reduce((s, r) => s + (r.total_rendimento || 0), 0);
    return { creditos, debitos, rendimento };
  }, [movimentacoes]);

  const registrosMesSelecionado = useMemo(() => {
    const grupo = grupos.find(g => g.key === mesSelecionado);
    return grupo?.registros || [];
  }, [grupos, mesSelecionado]);

  // Sincronização silenciosa (sem toast de início, sem bloquear UI)
  async function handleSincronizarSilencioso() {
    try {
      const res = await base44.functions.invoke('lerExtratosBancariosDrive', {});
      const d = res.data;
      if (d?.success) {
        const { novos_criados = 0 } = d.resumo || {};
        if (novos_criados > 0) {
          await refetch();
          toast.success(`${novos_criados} extrato${novos_criados !== 1 ? 's' : ''} novo${novos_criados !== 1 ? 's' : ''} importado${novos_criados !== 1 ? 's' : ''}`);
        }
      }
    } catch {
      // Silencioso — erros de auto-sync não interrompem o usuário
    }
  }

  async function handleSincronizar() {
    setSincronizando(true);
    toast.info('Lendo extratos bancários do Drive com IA… pode levar 1–2 minutos.');
    try {
      const res = await base44.functions.invoke('lerExtratosBancariosDrive', {});
      const d = res.data;
      if (!d?.success) {
        if (d?.code === 'DRIVE_NOT_CONNECTED') {
          toast.error('Google Drive não conectado. Peça ao administrador para conectar o Drive nas configurações da plataforma.', { duration: 8000 });
        } else {
          throw new Error(d?.error || 'Erro desconhecido');
        }
        return;
      }
      const { novos_criados = 0, atualizados = 0, erros = 0, pdfs_encontrados = 0 } = d.resumo || {};
      if (pdfs_encontrados === 0) {
        toast.warning('Nenhum PDF encontrado na pasta de extratos do Drive.');
      } else {
        toast.success(`Concluído: ${novos_criados} novos · ${atualizados} atualizados · ${pdfs_encontrados} PDFs analisados${erros > 0 ? ` · ${erros} erros` : ''}`);
      }
      await refetch();
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        toast.error('Sessão expirada. Recarregue a página e tente novamente.', { duration: 6000 });
      } else {
        toast.error('Erro ao sincronizar: ' + msg, { duration: 6000 });
      }
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-black">Movimentações Bancárias</h1>
              <p className="text-sm text-gray-400">Extratos e rendimentos lidos automaticamente do Google Drive</p>
            </div>
          </div>
          <Button
            onClick={handleSincronizar}
            disabled={sincronizando}
            className="gap-2 bg-black text-white hover:bg-gray-800 rounded-xl shrink-0"
          >
            {sincronizando
              ? <><Loader2 className="w-4 h-4 animate-spin" />Lendo…</>
              : <><RefreshCw className="w-4 h-4" />Sincronizar Drive</>
            }
          </Button>
        </div>

        {isLoading && (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Carregando movimentações…</p>
          </div>
        )}

        {!isLoading && movimentacoes.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-400">Nenhum extrato importado ainda</p>
            <p className="text-xs text-gray-300 mt-1">Clique em "Sincronizar Drive" para ler os PDFs da pasta.</p>
            <Button onClick={handleSincronizar} disabled={sincronizando} className="mt-4 bg-black text-white hover:bg-gray-800 gap-2">
              {sincronizando ? <><Loader2 className="w-4 h-4 animate-spin" />Lendo…</> : <><RefreshCw className="w-4 h-4" />Sincronizar agora</>}
            </Button>
          </div>
        )}

        {!isLoading && movimentacoes.length > 0 && (
          <>
            {/* Totais consolidados */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green-200 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-4 h-4 text-green-700" />
                </div>
                <div>
                  <p className="text-[10px] text-green-500 uppercase font-semibold tracking-wide">Total créditos</p>
                  <p className="text-lg font-bold text-green-700">{fmtBRL(totaisGerais.creditos)}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-200 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-4 h-4 text-red-700" />
                </div>
                <div>
                  <p className="text-[10px] text-red-400 uppercase font-semibold tracking-wide">Total débitos</p>
                  <p className="text-lg font-bold text-red-600">{fmtBRL(totaisGerais.debitos)}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-200 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-blue-700" />
                </div>
                <div>
                  <p className="text-[10px] text-blue-500 uppercase font-semibold tracking-wide">Total rendimentos</p>
                  <p className="text-lg font-bold text-blue-700">{fmtBRL(totaisGerais.rendimento)}</p>
                </div>
              </div>
            </div>

            {/* Busca global */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar lançamento, banco, descrição…"
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black bg-white"
              />
              {busca && (
                <button onClick={() => setBusca('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-black">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Layout grid: cards mensais à esquerda + detalhe à direita */}
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">

              {/* Coluna: cards mensais */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" /> Por mês
                </p>
                {grupos.map(({ key, registros }) => (
                  <CardMesCompacto
                    key={key}
                    registros={registros}
                    selecionado={mesSelecionado === key}
                    onSelecionar={() => setMesSelecionado(key)}
                  />
                ))}
              </div>

              {/* Coluna: detalhe do mês selecionado */}
              <div className="min-w-0">
                {registrosMesSelecionado.length > 0 ? (
                  <DetalheMes registros={registrosMesSelecionado} busca={busca} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                    <BarChart2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Selecione um mês para ver os detalhes</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Movimentacoes() {
  return (
    <RequireAuth>
      <MovimentacoesInner />
    </RequireAuth>
  );
}