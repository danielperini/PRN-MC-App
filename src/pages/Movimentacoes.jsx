import { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, RefreshCw, Loader2, ExternalLink,
  ArrowUpRight, ArrowDownLeft, FileText, Banknote,
  Wallet, Search, X, CalendarDays, ChevronDown, ChevronUp, FolderSync,
  Upload, CheckCircle2, AlertCircle } from
'lucide-react';

import FluxoCaixaMensal from '@/components/dashboard/FluxoCaixaMensal';
import { agruparMovimentacoesPorMes, resumirGruposMensais, ehTransferenciaInterna } from '@/utils/movimentacoesMensais';

const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTO = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function TipoChip({ tipo, lancamento }) {
  if (lancamento && ehTransferenciaInterna(lancamento)) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
      Transf. interna
    </span>);

  if (tipo === 'credito') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
      <ArrowUpRight className="w-2.5 h-2.5" /> Crédito
    </span>);

  if (tipo === 'debito') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
      <ArrowDownLeft className="w-2.5 h-2.5" /> Débito
    </span>);

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">
      <TrendingUp className="w-2.5 h-2.5" /> Rendimento
    </span>);
}

function BarraFluxo({ creditos, debitos }) {
  const total = creditos + debitos;
  if (!total) return null;
  const pctC = Math.round(creditos / total * 100);
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
      <div className="bg-green-400 transition-all" style={{ width: `${pctC}%` }} />
      <div className="bg-red-400 flex-1" />
    </div>);

}

function CardMes({ registros, selecionado, onSelecionar }) {
  const conta = registros.filter((r) => r.tipo === 'extrato_conta');
  const rend = registros.filter((r) => r.tipo === 'extrato_rendimento');
  const creditos = conta.reduce((s, r) => s + (r.total_creditos || 0), 0);
  const debitos = conta.reduce((s, r) => s + (r.total_debitos || 0), 0);
  const rendimento = rend.reduce((s, r) => s + (r.total_rendimento || 0), 0) +
  conta.reduce((s, r) => s + (r.total_rendimento || 0), 0);
  const { mes, mes_num, ano } = registros[0];

  return (
    <button type="button" onClick={onSelecionar}
    className={`min-w-[190px] rounded-2xl border-2 p-4 text-left transition-all shadow-sm ${selecionado ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 bg-white hover:border-gray-400'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className={`text-lg font-bold ${selecionado ? 'text-white' : 'text-black'}`}>{MESES_CURTO[mes_num] || mes}</p>
          <p className={`text-xs ${selecionado ? 'text-slate-400' : 'text-gray-400'}`}>{ano}</p>
        </div>
        <CalendarDays className={`w-5 h-5 ${selecionado ? 'text-slate-400' : 'text-gray-300'}`} />
      </div>
      {creditos > 0 && <><p className={`text-[10px] uppercase font-semibold ${selecionado ? 'text-green-400' : 'text-green-600'}`}>Créditos</p><p className="text-sm font-bold">{fmtBRL(creditos)}</p></>}
      {debitos > 0 && <><p className={`text-[10px] uppercase font-semibold mt-2 ${selecionado ? 'text-red-400' : 'text-red-500'}`}>Débitos</p><p className="text-sm font-bold">{fmtBRL(debitos)}</p></>}
      {rendimento > 0 && <><p className={`text-[10px] uppercase font-semibold mt-2 ${selecionado ? 'text-blue-400' : 'text-blue-600'}`}>Rendimento</p><p className="text-sm font-bold">{fmtBRL(rendimento)}</p></>}
    </button>);

}

function TabelaLancamentos({ registros, busca }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const todos = registros.flatMap((r) => (r.lancamentos || []).map((l) => ({ ...l, _banco: r.banco, _arquivo: r.drive_file_name })));
  const filtrados = busca ?
  todos.filter((l) => [l.descricao, l.data, l._banco, l._arquivo].some((v) => String(v || '').toLowerCase().includes(busca.toLowerCase()))) :
  todos;
  const exibidos = mostrarTodos ? filtrados : filtrados.slice(0, 25);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Data</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Descrição</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Tipo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Valor</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {exibidos.map((l, i) =>
            <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{l.data || '—'}</td>
                <td className="px-4 py-3 text-black"><p className="font-medium">{l.descricao || '—'}</p><p className="text-[10px] text-gray-400">{l._banco}</p></td>
                <td className="px-4 py-3"><TipoChip tipo={l.tipo} lancamento={l} /></td>
                <td className={`px-4 py-3 text-right font-bold ${l.tipo === 'debito' ? 'text-red-600' : l.tipo === 'credito' ? 'text-green-700' : 'text-blue-700'}`}>{fmtBRL(l.valor)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{l.saldo != null ? fmtBRL(l.saldo) : '—'}</td>
              </tr>
            )}
            {exibidos.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-gray-400">Nenhum lançamento encontrado</td></tr>}
          </tbody>
        </table>
      </div>
      {filtrados.length > 25 &&
      <div className="border-t border-gray-100 p-3 text-center">
          <button onClick={() => setMostrarTodos((v) => !v)} className="text-xs font-semibold text-slate-600 hover:text-black inline-flex items-center gap-1">
            {mostrarTodos ? <><ChevronUp className="w-3.5 h-3.5" /> Mostrar menos</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver todos ({filtrados.length - 25} restantes)</>}
          </button>
        </div>
      }
    </div>);

}

function DetalheMes({ registros, busca }) {
  const conta = registros.filter((r) => r.tipo === 'extrato_conta');
  const rend = registros.filter((r) => r.tipo === 'extrato_rendimento');
  const creditos = conta.reduce((s, r) => s + (r.total_creditos || 0), 0);
  const debitos = conta.reduce((s, r) => s + (r.total_debitos || 0), 0);
  const rendimento = rend.reduce((s, r) => s + (r.total_rendimento || 0), 0) +
  conta.reduce((s, r) => s + (r.total_rendimento || 0), 0);
  const saldosPorConta = new Map();
  [...conta].sort((a, b) => String(a.processado_em || '').localeCompare(String(b.processado_em || ''))).forEach((r, index) => {
    if (r.saldo_final != null) saldosPorConta.set(String(r.conta || r.banco || index), Number(r.saldo_final || 0));
  });
  const saldoFinal = Array.from(saldosPorConta.values()).reduce((s, v) => s + v, 0) || creditos - debitos;
  const { mes, mes_num, ano } = registros[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5 text-white" /></div>
        <div><h2 className="text-lg font-bold text-black">{MESES_NOME[mes_num] || mes} de {ano}</h2><p className="text-xs text-gray-400">{registros.length} documento{registros.length !== 1 ? 's' : ''} importado{registros.length !== 1 ? 's' : ''}</p></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
        { label: 'Créditos', value: creditos, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', sub: 'text-green-500', icon: <ArrowUpRight className="w-4 h-4 text-green-600" /> },
        { label: 'Débitos', value: debitos, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', sub: 'text-red-400', icon: <ArrowDownLeft className="w-4 h-4 text-red-500" /> },
        { label: 'Rendimentos', value: rendimento, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', sub: 'text-blue-400', icon: <TrendingUp className="w-4 h-4 text-blue-600" /> },
        { label: 'Saldo Final', value: saldoFinal, bg: saldoFinal >= 0 ? 'bg-slate-50' : 'bg-orange-50', border: saldoFinal >= 0 ? 'border-slate-200' : 'border-orange-200', text: saldoFinal >= 0 ? 'text-slate-800' : 'text-orange-700', sub: 'text-gray-400', icon: <Wallet className="w-4 h-4 text-gray-500" /> }].
        map((c, i) => <div key={i} className={`rounded-xl border ${c.border} ${c.bg} p-4`}><div className="flex items-center justify-between mb-2">{c.icon}<span className={`text-[10px] font-semibold uppercase tracking-wide ${c.sub}`}>{c.label}</span></div><p className={`text-base font-bold ${c.text}`}>{fmtBRL(c.value)}</p></div>)}
      </div>
      {creditos > 0 && debitos > 0 && <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-semibold text-gray-500 mb-3">Proporção créditos × débitos</p><BarraFluxo creditos={creditos} debitos={debitos} /><div className="flex justify-between text-sm font-bold mt-2"><span className="text-green-700">{fmtBRL(creditos)}</span><span className="text-red-600">{fmtBRL(debitos)}</span></div></div>}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide hidden">Documentos do mês</p>
        {registros.map((r, i) => <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3 hidden"><div className="flex items-center gap-3 min-w-0"><div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.tipo === 'extrato_rendimento' ? 'bg-blue-100' : 'bg-slate-100'}`}>{r.tipo === 'extrato_rendimento' ? <TrendingUp className="w-4 h-4 text-blue-600" /> : <Banknote className="w-4 h-4 text-slate-600" />}</div><div className="min-w-0"><p className="text-sm font-semibold text-black truncate">{r.banco || r.drive_file_name || 'Documento'}</p><p className="text-[11px] text-gray-400">{r.tipo === 'extrato_rendimento' ? 'Extrato de Rendimento' : 'Extrato de Conta'}{r.conta ? ` · Conta ${r.conta}` : ''}</p></div></div><div className="flex items-center gap-3 shrink-0">{r.tipo === 'extrato_rendimento' && r.total_rendimento > 0 && <span className="text-sm font-bold text-blue-700">{fmtBRL(r.total_rendimento)}</span>}{r.tipo === 'extrato_conta' && r.saldo_final > 0 && <span className="text-sm font-bold text-slate-800">{fmtBRL(r.saldo_final)}</span>}{r.drive_file_url && <a href={r.drive_file_url} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 text-blue-600 hover:underline border border-blue-200 rounded-lg px-2.5 py-1.5 bg-blue-50 font-medium"><ExternalLink className="w-3 h-3" /> PDF</a>}</div></div>)}
      </div>
      <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 hidden">Lançamentos detalhados</p><TabelaLancamentos registros={registros} busca={busca} /></div>
    </div>);

}

function UploadExtrato({ onConcluido }) {
  const [dragging, setDragging] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  async function processarArquivo(file) {
    if (!file || file.type !== 'application/pdf') {toast.error('Apenas arquivos PDF são aceitos.');return;}
    setProcessando(true);setResultado(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke('processarExtratoPDF', { file_url, file_name: file.name });
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro ao processar');
      setResultado({ ok: true, banco: d.banco, mes: d.mes, ano: d.ano, lancamentos: d.lancamentos, resumo: d.resumo_ia });
      toast.success(`Extrato importado: ${d.banco} — ${d.mes}/${d.ano} (${d.lancamentos} lançamentos)`);
      if (onConcluido) onConcluido();
    } catch (e) {
      setResultado({ ok: false, erro: e?.message || String(e) });
      toast.error('Erro ao processar: ' + (e?.message || String(e)));
    } finally {setProcessando(false);}
  }

  function handleDrop(e) {e.preventDefault();setDragging(false);const file = e.dataTransfer.files[0];if (file) processarArquivo(file);}

  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-5 space-y-3 transition-colors" onDragOver={(e) => {e.preventDefault();setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={handleDrop} style={{ borderColor: dragging ? '#64748b' : undefined, background: dragging ? '#f8fafc' : undefined }}>
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Upload className="w-4 h-4 text-slate-600" /></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800">Carregar extrato PDF</p><p className="text-[11px] text-gray-400">Extrato de conta corrente ou investimento — analisado automaticamente pela IA</p></div><input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => {const f = e.target.files?.[0];if (f) processarArquivo(f);e.target.value = '';}} /><Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={processando} className="rounded-xl shrink-0 border-slate-300 gap-1.5">{processando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analisando…</> : <><Upload className="w-3.5 h-3.5" />Selecionar PDF</>}</Button></div>
      {resultado && <div className={`rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm ${resultado.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>{resultado.ok ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}<div>{resultado.ok ? <><span className="font-semibold text-green-800">{resultado.banco}</span> · {resultado.mes}/{resultado.ano} · {resultado.lancamentos} lançamentos{resultado.resumo && <span className="block text-[11px] text-green-600 mt-0.5">{resultado.resumo}</span>}</> : <span className="text-red-700">{resultado.erro}</span>}</div></div>}
    </div>);

}

function MovimentacoesInner() {
  const [sincronizando, setSincronizando] = useState(false);
  const [sincronizandoDocs, setSincronizandoDocs] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(null);
  const [busca, setBusca] = useState('');
  const { data: movimentacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-bancarias'],
    queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 2000),
    staleTime: 1000 * 60 * 2
  });

  const grupos = useMemo(() => agruparMovimentacoesPorMes(movimentacoes), [movimentacoes]);

  useEffect(() => {
    if (grupos.length > 0 && !grupos.some((g) => g.key === mesSelecionado)) setMesSelecionado(grupos[0].key);
  }, [grupos, mesSelecionado]);

  const totaisGerais = useMemo(() => resumirGruposMensais(grupos), [grupos]);

  const registrosMes = useMemo(() => grupos.find((g) => g.key === mesSelecionado)?.registros || [], [grupos, mesSelecionado]);

  async function handleSincronizarDocs() {
    setSincronizandoDocs(true);toast.info('Sincronizando NFs e contratos do Drive (lote de 5)…');
    try {
      const res = await base44.functions.invoke('sincronizarDocumentosDrive', { maxPorLote: 5 });const d = res.data;
      if (!d?.success) {if (d?.code === 'DRIVE_NOT_CONNECTED') toast.error('Google Drive não conectado.', { duration: 8000 });else throw new Error(d?.error || 'Erro desconhecido');return;}
      const { criados = 0, novos_no_drive = 0, restantes = 0, erros = 0 } = d.resumo || {};
      if (novos_no_drive === 0) toast.success('Todos os documentos já estão importados.');else
      toast.success(`${criados} documento${criados !== 1 ? 's' : ''} importado${criados !== 1 ? 's' : ''}${restantes > 0 ? ` · ${restantes} restante${restantes !== 1 ? 's' : ''} — clique novamente` : ''}${erros > 0 ? ` · ${erros} erro${erros !== 1 ? 's' : ''}` : ''}`, { duration: restantes > 0 ? 8000 : 4000 });
    } catch (e) {toast.error('Erro: ' + (e?.message || String(e)), { duration: 6000 });} finally
    {setSincronizandoDocs(false);}
  }

  async function handleSincronizar() {
    setSincronizando(true);toast.info('Processando extratos do Drive (lote de 3 por vez)…');
    try {
      const res = await base44.functions.invoke('lerExtratosBancariosDrive', {});const d = res.data;
      if (!d?.success) {if (d?.code === 'DRIVE_NOT_CONNECTED') toast.error('Google Drive não conectado. Peça ao administrador para reconectar o Drive.', { duration: 8000 });else throw new Error(d?.error || 'Erro desconhecido');return;}
      const { novos_criados = 0, pdfs_encontrados = 0, restantes = 0, erros = 0 } = d.resumo || {};
      if (pdfs_encontrados === 0) toast.info('Nenhum PDF encontrado nas pastas mensais de extratos do Drive.');else
      if (novos_criados === 0 && restantes === 0) toast.success('Todos os extratos já estão importados.');else
      toast.success(`${novos_criados} extrato${novos_criados !== 1 ? 's' : ''} importado${novos_criados !== 1 ? 's' : ''}${restantes > 0 ? ` · Clique novamente para processar ${restantes} restante${restantes !== 1 ? 's' : ''}` : ''}${erros > 0 ? ` · ${erros} erro${erros !== 1 ? 's' : ''}` : ''}`, { duration: restantes > 0 ? 8000 : 4000 });
      await refetch();
    } catch (e) {toast.error('Erro ao sincronizar: ' + (e?.message || String(e)), { duration: 6000 });} finally
    {setSincronizando(false);}
  }

  return (
    <div className="min-h-screen bg-gray-50/50"><div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 shadow-sm"><Banknote className="w-5 h-5 text-white" /></div><div><h1 className="text-xl font-bold text-slate-900">Movimentações Bancárias</h1><p className="text-sm text-gray-400">Extratos e rendimentos lidos automaticamente do Google Drive</p></div></div><div className="flex gap-2 flex-wrap items-center"><div className="flex flex-col items-end gap-1"><div className="flex gap-2"><Button onClick={handleSincronizarDocs} disabled={sincronizandoDocs} variant="outline" className="gap-2 rounded-xl shrink-0 border-slate-300">{sincronizandoDocs ? <><Loader2 className="w-4 h-4 animate-spin" />Importando…</> : <><FolderSync className="w-4 h-4" />NFs e Contratos</>}</Button><Button onClick={handleSincronizar} disabled={sincronizando} className="gap-2 bg-slate-900 text-white hover:bg-slate-700 rounded-xl shrink-0">{sincronizando ? <><Loader2 className="w-4 h-4 animate-spin" />Lendo…</> : <><RefreshCw className="w-4 h-4" />Extratos Drive</>}</Button></div><p className="text-[10px] text-gray-400 text-right"><span className="mr-3">↑ Importar NFs e contratos do Drive</span><span>↑ Ler extratos bancários do Drive</span></p></div></div></div>
      <UploadExtrato onConcluido={() => refetch()} />
      {isLoading && <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-300 mx-auto mb-3" /><p className="text-sm text-gray-400">Carregando movimentações…</p></div>}
      {!isLoading && movimentacoes.length === 0 && <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center"><div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><FileText className="w-7 h-7 text-gray-400" /></div><p className="font-semibold text-gray-500">Nenhum extrato importado ainda</p><p className="text-sm text-gray-400 mt-1 mb-5">Clique em "Sincronizar Drive" para ler os PDFs das pastas mensais.</p><Button onClick={handleSincronizar} disabled={sincronizando} className="bg-slate-900 text-white hover:bg-slate-700 gap-2 rounded-xl">{sincronizando ? <><Loader2 className="w-4 h-4 animate-spin" />Lendo…</> : <><RefreshCw className="w-4 h-4" />Sincronizar agora</>}</Button></div>}
      {!isLoading && movimentacoes.length > 0 && <><div className="grid grid-cols-1 sm:grid-cols-4 gap-3"><div className="rounded-2xl border border-green-200 bg-white p-5 flex items-center gap-4 shadow-sm"><div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0"><ArrowUpRight className="w-5 h-5 text-green-600" /></div><div><p className="text-[11px] text-green-500 uppercase font-bold tracking-wide">Total créditos</p><p className="text-xl font-bold text-green-700">{fmtBRL(totaisGerais.creditos)}</p><p className="text-[10px] text-gray-400 mt-0.5">{grupos.length} mese{grupos.length !== 1 ? 's' : ''}</p></div></div><div className="rounded-2xl border border-red-200 bg-white p-5 flex items-center gap-4 shadow-sm"><div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><ArrowDownLeft className="w-5 h-5 text-red-500" /></div><div><p className="text-[11px] text-red-400 uppercase font-bold tracking-wide">Débitos operacionais</p><p className="text-xl font-bold text-red-600">{fmtBRL(totaisGerais.debitos)}</p><p className="text-[10px] text-gray-400 mt-0.5">Sem resgates/aplicações</p></div></div><div className="rounded-2xl border border-orange-200 bg-white p-5 flex items-center gap-4 shadow-sm"><div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0"><Wallet className="w-5 h-5 text-orange-500" /></div><div><p className="text-[11px] text-orange-500 uppercase font-bold tracking-wide">Transf. internas</p><p className="text-xl font-bold text-orange-600">{fmtBRL(totaisGerais.transferencias_internas)}</p><p className="text-[10px] text-gray-400 mt-0.5">Resgate/Aplicação — não contabilizado</p></div></div><div className="rounded-2xl border border-blue-200 bg-white p-5 flex items-center gap-4 shadow-sm"><div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-blue-600" /></div><div><p className="text-[11px] text-blue-500 uppercase font-bold tracking-wide">Total rendimentos</p><p className="text-xl font-bold text-blue-700">{fmtBRL(totaisGerais.rendimento)}</p><p className="text-[10px] text-gray-400 mt-0.5">{totaisGerais.rendimento > 0 ? 'Rendimento de aplicações' : 'Nenhum rendimento importado'}</p></div></div></div><FluxoCaixaMensal /><div><p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Selecione o mês</p><div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">{grupos.map(({ key, registros }) => <CardMes key={key} registros={registros} selecionado={mesSelecionado === key} onSelecionar={() => setMesSelecionado(key)} />)}</div></div><div className="relative"><Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" /><input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lançamento, banco, descrição…" className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white shadow-sm" />{busca && <button onClick={() => setBusca('')} className="absolute right-3.5 top-3 text-gray-400 hover:text-black"><X className="w-4 h-4" /></button>}</div><div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">{registrosMes.length > 0 ? <DetalheMes registros={registrosMes} busca={busca} /> : <div className="py-16 text-center"><CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-400">Selecione um mês acima para ver os detalhes</p></div>}</div></>}
    </div></div>);

}

export default function Movimentacoes() {
  return <MovimentacoesInner />;
}