import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ExternalLink,
  FolderSync,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';

import FluxoCaixaMensal from '@/components/dashboard/FluxoCaixaMensal';
import {
  agruparMovimentacoesPorMes,
  ehTransferenciaInterna,
  resumirGruposMensais,
  resumirRegistrosMensais,
} from '@/utils/movimentacoesMensais';

const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function fmtBRL(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0));
}

function origemDrive(registro) {
  return Boolean(
    registro?.drive_file_id
    || registro?.drive_file_url
    || registro?.origem === 'DRIVE'
    || registro?.origem === 'DRIVE_SYNC'
  );
}

function normalizarTipo(lancamento) {
  const tipo = String(lancamento?.tipo || '').toLowerCase();
  if (tipo.includes('cred') || tipo.includes('entrada')) return 'credito';
  if (tipo.includes('deb') || tipo.includes('saida') || tipo.includes('pagamento')) return 'debito';
  if (tipo.includes('rend')) return 'rendimento';
  return tipo;
}

function TipoChip({ lancamento }) {
  if (ehTransferenciaInterna(lancamento)) {
    return <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Transferência interna</span>;
  }
  const tipo = normalizarTipo(lancamento);
  if (tipo === 'credito') return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Crédito</span>;
  if (tipo === 'debito') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Débito operacional</span>;
  return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Rendimento</span>;
}

function TabelaLancamentos({ registros, busca, internos = false }) {
  const linhas = useMemo(() => registros.flatMap((registro) => (
    registro.lancamentos || []
  ).map((lancamento, indice) => ({
    ...lancamento,
    _indice: indice,
    _banco: registro.banco,
    _arquivo: registro.drive_file_name,
    _url: registro.drive_file_url,
    _interno: ehTransferenciaInterna(lancamento),
  }))).filter((lancamento) => internos ? lancamento._interno : !lancamento._interno), [registros, internos]);

  const filtradas = useMemo(() => {
    if (!busca) return linhas;
    const termo = busca.toLowerCase();
    return linhas.filter((linha) => [linha.descricao, linha.data, linha._banco, linha._arquivo]
      .some((valor) => String(valor || '').toLowerCase().includes(termo)));
  }, [linhas, busca]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Classificação</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Valor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtradas.map((linha, indice) => (
              <tr key={`${linha._arquivo}-${linha.data}-${linha._indice}-${indice}`} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-gray-500">{linha.data || '—'}</td>
                <td className="px-4 py-3 text-black">
                  <p className="font-medium">{linha.descricao || '—'}</p>
                  <p className="text-[10px] text-gray-400">{linha._banco || linha._arquivo || 'Google Drive'}</p>
                </td>
                <td className="px-4 py-3"><TipoChip lancamento={linha} /></td>
                <td className={`px-4 py-3 text-right font-bold ${linha._interno ? 'text-orange-700' : normalizarTipo(linha) === 'debito' ? 'text-red-600' : normalizarTipo(linha) === 'credito' ? 'text-green-700' : 'text-blue-700'}`}>
                  {fmtBRL(linha.valor)}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{linha.saldo != null ? fmtBRL(linha.saldo) : '—'}</td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={5} className="py-10 text-center text-gray-400">Nenhum lançamento encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentosDrive({ registros }) {
  const documentos = useMemo(() => {
    const mapa = new Map();
    registros.forEach((registro) => {
      const chave = registro.drive_file_id || registro.drive_file_url || registro.id;
      if (!chave || mapa.has(chave)) return;
      mapa.set(chave, registro);
    });
    return Array.from(mapa.values());
  }, [registros]);

  return (
    <div className="space-y-2">
      {documentos.map((registro) => (
        <div key={registro.drive_file_id || registro.drive_file_url || registro.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{registro.drive_file_name || 'Extrato do Google Drive'}</p>
            <p className="text-[11px] text-slate-500">{registro.tipo === 'extrato_rendimento' ? 'Extrato de rendimento/investimento' : 'Extrato de conta corrente'}</p>
          </div>
          {registro.drive_file_url && (
            <a href={registro.drive_file_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Movimentacoes() {
  const [mesSelecionado, setMesSelecionado] = useState('');
  const [busca, setBusca] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [sincronizandoDocs, setSincronizandoDocs] = useState(false);
  const [mostrarInternas, setMostrarInternas] = useState(false);

  const { data: todasMovimentacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-bancarias'],
    queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 2000),
    staleTime: 1000 * 60 * 2,
  });

  const movimentacoesDrive = useMemo(() => todasMovimentacoes.filter(origemDrive), [todasMovimentacoes]);
  const grupos = useMemo(() => agruparMovimentacoesPorMes(movimentacoesDrive), [movimentacoesDrive]);
  const totaisGerais = useMemo(() => resumirGruposMensais(grupos), [grupos]);

  useEffect(() => {
    if (!grupos.length) {
      setMesSelecionado('');
      return;
    }
    if (!grupos.some((grupo) => grupo.key === mesSelecionado)) setMesSelecionado(grupos[0].key);
  }, [grupos, mesSelecionado]);

  const grupoSelecionado = useMemo(() => grupos.find((grupo) => grupo.key === mesSelecionado) || null, [grupos, mesSelecionado]);
  const registrosMes = grupoSelecionado?.registros || [];
  const resumoMes = useMemo(() => resumirRegistrosMensais(registrosMes), [registrosMes]);

  async function sincronizarExtratos() {
    setSincronizando(true);
    try {
      const resposta = await base44.functions.invoke('lerExtratosBancariosDrive', {});
      const dados = resposta.data;
      if (!dados?.success) throw new Error(dados?.error || 'Falha ao ler extratos do Google Drive.');
      await refetch();
      toast.success('Extratos do Google Drive atualizados sem duplicar registros.');
    } catch (erro) {
      toast.error(`Erro ao sincronizar extratos: ${erro?.message || erro}`);
    } finally {
      setSincronizando(false);
    }
  }

  async function sincronizarDocumentos() {
    setSincronizandoDocs(true);
    try {
      const resposta = await base44.functions.invoke('sincronizarDocumentosDrive', { maxPorLote: 5 });
      const dados = resposta.data;
      if (!dados?.success) throw new Error(dados?.error || 'Falha ao sincronizar documentos.');
      toast.success('Notas fiscais e contratos do Google Drive atualizados.');
    } catch (erro) {
      toast.error(`Erro ao sincronizar documentos: ${erro?.message || erro}`);
    } finally {
      setSincronizandoDocs(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 shadow-sm">
              <Banknote className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Movimentações Bancárias</h1>
              <p className="text-sm text-gray-400">Fonte canônica: extratos de conta e rendimento do Google Drive</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={sincronizarDocumentos} disabled={sincronizandoDocs} className="gap-2 rounded-xl border-slate-300">
              {sincronizandoDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSync className="h-4 w-4" />}
              NFs e contratos
            </Button>
            <Button onClick={sincronizarExtratos} disabled={sincronizando} className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700">
              {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Extratos Drive
            </Button>
          </div>
        </div>

        {isLoading && <div className="py-20 text-center text-gray-400"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" />Carregando extratos do Drive…</div>}

        {!isLoading && movimentacoesDrive.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
            <p className="font-semibold text-gray-600">Nenhum extrato do Google Drive encontrado.</p>
            <Button onClick={sincronizarExtratos} disabled={sincronizando} className="mt-4 rounded-xl bg-slate-900 text-white">Ler extratos agora</Button>
          </div>
        )}

        {!isLoading && movimentacoesDrive.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {[
                { label: 'Créditos reais', valor: totaisGerais.creditos, icon: <ArrowUpRight className="h-5 w-5 text-green-600" />, classe: 'border-green-200 text-green-700' },
                { label: 'Débitos operacionais', valor: totaisGerais.debitos, icon: <ArrowDownLeft className="h-5 w-5 text-red-500" />, classe: 'border-red-200 text-red-600' },
                { label: 'Transferências internas', valor: totaisGerais.transferencias_internas, icon: <Wallet className="h-5 w-5 text-orange-500" />, classe: 'border-orange-200 text-orange-700' },
                { label: 'Rendimentos', valor: totaisGerais.rendimento, icon: <TrendingUp className="h-5 w-5 text-blue-600" />, classe: 'border-blue-200 text-blue-700' },
              ].map((item) => (
                <div key={item.label} className={`rounded-2xl border bg-white p-5 shadow-sm ${item.classe}`}>
                  <div className="mb-2 flex items-center justify-between">{item.icon}<span className="text-[10px] font-bold uppercase tracking-wide">{item.label}</span></div>
                  <p className="text-xl font-bold">{fmtBRL(item.valor)}</p>
                </div>
              ))}
            </div>

            <FluxoCaixaMensal />

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:items-end">
                <div>
                  <label htmlFor="mes-extrato" className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                    <CalendarDays className="h-3.5 w-3.5" /> Extrato mensal
                  </label>
                  <select
                    id="mes-extrato"
                    value={mesSelecionado}
                    onChange={(evento) => setMesSelecionado(evento.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
                  >
                    {grupos.map((grupo) => (
                      <option key={grupo.key} value={grupo.key}>{MESES_NOME[grupo.mes_num]} de {grupo.ano}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
                  <input
                    value={busca}
                    onChange={(evento) => setBusca(evento.target.value)}
                    placeholder="Buscar lançamento, banco ou descrição…"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
                  />
                  {busca && <button type="button" onClick={() => setBusca('')} className="absolute right-3.5 top-3 text-gray-400 hover:text-black"><X className="h-4 w-4" /></button>}
                </div>
              </div>
            </section>

            {grupoSelecionado && (
              <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-black">{MESES_NOME[grupoSelecionado.mes_num]} de {grupoSelecionado.ano}</h2>
                    <p className="text-xs text-gray-400">{resumoMes.documentos} documento(s) únicos do Google Drive</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>Saldo da conta: <strong className="text-slate-800">{fmtBRL(resumoMes.saldo_conta)}</strong></p>
                    <p>Saldo investimento: <strong className="text-slate-800">{fmtBRL(resumoMes.saldo_investimento)}</strong></p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: 'Créditos', valor: resumoMes.creditos, classe: 'border-green-200 bg-green-50 text-green-700' },
                    { label: 'Débitos operacionais', valor: resumoMes.debitos, classe: 'border-red-200 bg-red-50 text-red-600' },
                    { label: 'Rendimentos', valor: resumoMes.rendimento, classe: 'border-blue-200 bg-blue-50 text-blue-700' },
                    { label: 'Saldo final consolidado', valor: resumoMes.saldo, classe: resumoMes.saldo >= 0 ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-orange-200 bg-orange-50 text-orange-700' },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-xl border p-4 ${item.classe}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wide">{item.label}</p>
                      <p className="mt-1 text-base font-bold">{fmtBRL(item.valor)}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Arquivos do Google Drive</h3>
                  <DocumentosDrive registros={registrosMes} />
                </div>

                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Pagamentos e movimentações operacionais</h3>
                  <TabelaLancamentos registros={registrosMes} busca={busca} />
                </div>

                {resumoMes.transferencias_internas_qtd > 0 && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                    <button type="button" onClick={() => setMostrarInternas((valor) => !valor)} className="flex w-full items-center justify-between gap-3 text-left">
                      <div>
                        <p className="text-sm font-bold text-orange-800">Movimentações entre conta corrente e aplicação</p>
                        <p className="text-xs text-orange-700">{fmtBRL(resumoMes.transferencias_internas_valor)} preservados para auditoria e excluídos dos débitos operacionais.</p>
                      </div>
                      <span className="text-xs font-semibold text-orange-800">{mostrarInternas ? 'Ocultar' : 'Ver detalhes'}</span>
                    </button>
                    {mostrarInternas && <div className="mt-4"><TabelaLancamentos registros={registrosMes} busca={busca} internos /></div>}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
