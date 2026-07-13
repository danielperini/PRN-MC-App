import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, RefreshCw, Loader2, ExternalLink,
  CreditCard, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp,
  FileText, Banknote
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function DocumentoDetalhe({ registro }) {
  const [verLancamentos, setVerLancamentos] = useState(false);
  const lancamentos = registro.lancamentos || [];

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${registro.tipo === 'extrato_rendimento' ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-gray-200 text-gray-600'}`}>
            {registro.tipo === 'extrato_rendimento' ? '📈 Rendimento' : '🏦 Extrato Conta'}
          </Badge>
          <span className="text-sm font-medium text-gray-800">{registro.banco}</span>
          {registro.conta && <span className="text-xs text-gray-400">· {registro.conta}</span>}
        </div>
        {registro.drive_file_url && (
          <a href={registro.drive_file_url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0">
            <ExternalLink className="w-3 h-3" /> Abrir PDF
          </a>
        )}
      </div>

      {registro.resumo_ia && (
        <p className="text-xs text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2">{registro.resumo_ia}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {!!registro.saldo_inicial && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Saldo inicial</p>
            <p className="text-sm font-semibold text-gray-700">{fmtBRL(registro.saldo_inicial)}</p>
          </div>
        )}
        {registro.total_creditos > 0 && (
          <div className="rounded-lg border border-green-100 bg-green-50 p-2.5 text-center">
            <p className="text-[10px] text-green-500 flex items-center justify-center gap-0.5">
              <ArrowUpRight className="w-2.5 h-2.5" /> Créditos
            </p>
            <p className="text-sm font-semibold text-green-700">{fmtBRL(registro.total_creditos)}</p>
          </div>
        )}
        {registro.total_debitos > 0 && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-2.5 text-center">
            <p className="text-[10px] text-red-400 flex items-center justify-center gap-0.5">
              <ArrowDownLeft className="w-2.5 h-2.5" /> Débitos
            </p>
            <p className="text-sm font-semibold text-red-600">{fmtBRL(registro.total_debitos)}</p>
          </div>
        )}
        {registro.total_rendimento > 0 && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-center">
            <p className="text-[10px] text-blue-500 flex items-center justify-center gap-0.5">
              <TrendingUp className="w-2.5 h-2.5" /> Rendimento
            </p>
            <p className="text-sm font-semibold text-blue-700">{fmtBRL(registro.total_rendimento)}</p>
          </div>
        )}
        {!!registro.saldo_final && (
          <div className="rounded-lg border border-gray-200 bg-white p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Saldo final</p>
            <p className="text-sm font-bold text-black">{fmtBRL(registro.saldo_final)}</p>
          </div>
        )}
      </div>

      {lancamentos.length > 0 && (
        <div>
          <button
            onClick={() => setVerLancamentos(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-black transition-colors"
          >
            {verLancamentos ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {verLancamentos ? 'Ocultar' : 'Ver'} {lancamentos.length} lançamento{lancamentos.length !== 1 ? 's' : ''}
          </button>

          {verLancamentos && (
            <div className="mt-2 rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Data</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Descrição</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500">Valor</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 hidden sm:table-cell">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lancamentos.map((l, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.data || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{l.descricao || '—'}</td>
                      <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                        l.tipo === 'credito' || l.tipo === 'rendimento' ? 'text-green-700' : 'text-red-600'
                      }`}>
                        {l.tipo === 'debito' ? '-' : '+'}{fmtBRL(Math.abs(l.valor || 0))}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell whitespace-nowrap">
                        {l.saldo != null ? fmtBRL(l.saldo) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardMes({ registros }) {
  const [expandido, setExpandido] = useState(false);
  if (!registros?.length) return null;

  const extratoConta = registros.filter(r => r.tipo === 'extrato_conta');
  const extratoRendimento = registros.filter(r => r.tipo === 'extrato_rendimento');

  const totalCreditos = extratoConta.reduce((s, r) => s + (r.total_creditos || 0), 0);
  const totalDebitos = extratoConta.reduce((s, r) => s + (r.total_debitos || 0), 0);
  const totalRendimento = extratoRendimento.reduce((s, r) => s + (r.total_rendimento || 0), 0);
  const saldoFinal = extratoConta.reduce((s, r) => s + (r.saldo_final || 0), 0);

  const { mes, ano } = registros[0];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpandido(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-black text-base">{mes}/{ano}</h3>
            <p className="text-xs text-gray-400">{registros.length} documento{registros.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {totalCreditos > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400">Créditos</p>
              <p className="text-sm font-semibold text-green-700">{fmtBRL(totalCreditos)}</p>
            </div>
          )}
          {totalDebitos > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400">Débitos</p>
              <p className="text-sm font-semibold text-red-600">{fmtBRL(totalDebitos)}</p>
            </div>
          )}
          {totalRendimento > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400">Rendimento</p>
              <p className="text-sm font-semibold text-blue-700">{fmtBRL(totalRendimento)}</p>
            </div>
          )}
          {saldoFinal > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400">Saldo final</p>
              <p className="text-sm font-bold text-black">{fmtBRL(saldoFinal)}</p>
            </div>
          )}
          {expandido ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Mobile summary */}
      <div className="px-5 pb-3 grid grid-cols-2 gap-2 sm:hidden border-b border-gray-100">
        {totalCreditos > 0 && (
          <div className="rounded-lg bg-green-50 p-2 text-center">
            <p className="text-[10px] text-green-600">Créditos</p>
            <p className="text-sm font-bold text-green-700">{fmtBRL(totalCreditos)}</p>
          </div>
        )}
        {totalDebitos > 0 && (
          <div className="rounded-lg bg-red-50 p-2 text-center">
            <p className="text-[10px] text-red-500">Débitos</p>
            <p className="text-sm font-bold text-red-600">{fmtBRL(totalDebitos)}</p>
          </div>
        )}
        {totalRendimento > 0 && (
          <div className="rounded-lg bg-blue-50 p-2 text-center col-span-2">
            <p className="text-[10px] text-blue-500">Rendimento</p>
            <p className="text-sm font-bold text-blue-700">{fmtBRL(totalRendimento)}</p>
          </div>
        )}
      </div>

      {expandido && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {registros.map((r, idx) => (
            <DocumentoDetalhe key={idx} registro={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardRendimentoTotal({ registros }) {
  const porMes = useMemo(() => {
    const map = {};
    registros.forEach(r => {
      if (r.tipo === 'extrato_rendimento' && r.total_rendimento) {
        const key = `${String(r.mes_num || 0).padStart(2,'0')}/${r.ano}`;
        map[key] = (map[key] || 0) + r.total_rendimento;
      }
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [registros]);

  const totalGeral = porMes.reduce((s, entry) => s + entry[1], 0);
  if (totalGeral === 0) return null;

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white overflow-hidden">
      <div className="px-5 py-4 border-b border-blue-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900">Rendimentos Acumulados</h3>
          <p className="text-xs text-blue-500">Soma de todos os extratos de rendimento</p>
        </div>
        <p className="text-2xl font-bold text-blue-800">{fmtBRL(totalGeral)}</p>
      </div>
      {porMes.length > 1 && (
        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs text-gray-400 font-semibold pb-2">Mês/Ano</th>
                <th className="text-right text-xs text-gray-400 font-semibold pb-2">Rendimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50">
              {porMes.map(([mes, valor]) => (
                <tr key={mes}>
                  <td className="py-1.5 text-gray-700">{mes}</td>
                  <td className="py-1.5 text-right font-semibold text-blue-700">{fmtBRL(valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MovimentacoesInner() {
  const [sincronizando, setSincronizando] = useState(false);

  const { data: movimentacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-bancarias'],
    queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 500),
    staleTime: 1000 * 60 * 5
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

  const totais = useMemo(() => {
    const totalCreditos = movimentacoes.filter(r => r.tipo === 'extrato_conta').reduce((s, r) => s + (r.total_creditos || 0), 0);
    const totalDebitos = movimentacoes.filter(r => r.tipo === 'extrato_conta').reduce((s, r) => s + (r.total_debitos || 0), 0);
    const totalRendimento = movimentacoes.filter(r => r.tipo === 'extrato_rendimento').reduce((s, r) => s + (r.total_rendimento || 0), 0);
    return { totalCreditos, totalDebitos, totalRendimento };
  }, [movimentacoes]);

  async function handleSincronizar() {
    setSincronizando(true);
    toast.info('Lendo extratos bancários do Drive com IA… pode levar 1-2 minutos.');
    try {
      const res = await base44.functions.invoke('lerExtratosBancariosDrive', {});
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      toast.success(`Sincronização concluída: ${d.resumo.novos_criados} novos · ${d.resumo.atualizados} atualizados`);
      await refetch();
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
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
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Lendo…</>
              : <><RefreshCw className="w-4 h-4" /> Sincronizar Drive</>
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
              {sincronizando ? <><Loader2 className="w-4 h-4 animate-spin" /> Lendo…</> : <><RefreshCw className="w-4 h-4" /> Sincronizar agora</>}
            </Button>
          </div>
        )}

        {!isLoading && movimentacoes.length > 0 && (
          <>
            {/* Totais gerais */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
                <ArrowUpRight className="w-6 h-6 text-green-600 mx-auto mb-1" />
                <p className="text-xs text-green-500 mb-1">Total créditos</p>
                <p className="text-xl font-bold text-green-700">{fmtBRL(totais.totalCreditos)}</p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                <ArrowDownLeft className="w-6 h-6 text-red-500 mx-auto mb-1" />
                <p className="text-xs text-red-400 mb-1">Total débitos</p>
                <p className="text-xl font-bold text-red-600">{fmtBRL(totais.totalDebitos)}</p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
                <TrendingUp className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-blue-500 mb-1">Total rendimentos</p>
                <p className="text-xl font-bold text-blue-700">{fmtBRL(totais.totalRendimento)}</p>
              </div>
            </div>

            {/* Rendimentos por mês */}
            <CardRendimentoTotal registros={movimentacoes} />

            {/* Cards por mês */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Extratos por mês</h2>
              {grupos.map(({ key, registros }) => (
                <CardMes key={key} registros={registros} />
              ))}
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