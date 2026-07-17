import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

function normalizar(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Verifica se um lançamento bancário é transferência interna
function ehInterna(desc) {
  const d = normalizar(desc);
  return ['resgate', 'aplicacao', 'aplic.', 'resgate autom', 'transf inter'].some(k => d.includes(k));
}

// Tentar associar lançamento a uma NF aprovada/paga pelo valor + palavras-chave do fornecedor
function scoreAssociacao(lancamento, nf) {
  const valorBanco = Number(lancamento.valor || 0);
  const valorNF = Number(nf.valor_aprovado_admin || nf.nf_valor_total || nf.valor_solicitado || 0);
  if (Math.abs(valorBanco - valorNF) > 0.05) return 0; // valor não bate

  const descBanco = normalizar(lancamento.descricao || '');
  const fornecedorNF = normalizar(nf.fornecedor_nome || nf.nf_emitente_nome || '');
  if (!fornecedorNF) return 10; // valor bate mas sem fornecedor
  
  // Verifica palavras em comum
  const palavrasBanco = descBanco.split(/\s+/).filter(p => p.length > 3);
  const palavrasNF = fornecedorNF.split(/\s+/).filter(p => p.length > 3);
  const emComum = palavrasBanco.filter(p => palavrasNF.some(q => q.includes(p) || p.includes(q)));
  return emComum.length > 0 ? 100 : 15;
}

export default function PagamentosSemNF({ grupos }) {
  const [busca, setBusca] = useState('');
  const [mostrarConciliados, setMostrarConciliados] = useState(false);
  const [expandidos, setExpandidos] = useState({});

  // Buscar NFs aprovadas/pagas (APROVADO_ADMIN, PAGO)
  const { data: nfsAprovadas = [] } = useQuery({
    queryKey: ['nfs-aprovadas-conciliacao'],
    queryFn: async () => {
      const [aprovadas, pagas] = await Promise.all([
        base44.entities.PurchaseRequest.filter({ status: 'APROVADO_ADMIN' }, '-created_date', 500).catch(() => []),
        base44.entities.PurchaseRequest.filter({ status: 'PAGO' }, '-created_date', 500).catch(() => []),
      ]);
      return [...aprovadas, ...pagas].filter(nf =>
        nf.duplicada_financeira !== true &&
        nf.incluir_no_somatorio !== false
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  // Extrair todos os débitos operacionais de todos os meses
  const todosDebitos = useMemo(() => {
    const lista = [];
    for (const grupo of grupos) {
      for (const registro of (grupo.registros || [])) {
        for (const lanc of (registro.lancamentos || [])) {
          const tipo = String(lanc?.tipo || lanc?.tipo_sugerido || '').toLowerCase();
          const isDebito = tipo.includes('deb') || tipo.includes('saida') || tipo.includes('pagamento');
          const isInterna = ehInterna(lanc.descricao || '');
          if (isDebito && !isInterna && Number(lanc.valor || 0) > 0) {
            lista.push({
              ...lanc,
              _mes: grupo.key,
              _mes_nome: `${grupo.mes_num}/${String(grupo.ano).slice(-2)}`,
              _banco: registro.banco,
            });
          }
        }
      }
    }
    return lista;
  }, [grupos]);

  // Para cada débito, tentar encontrar NF associada
  const debitosComStatus = useMemo(() => {
    // Deduplicar débitos pelo par (data + valor + descricao) para não contar duplicatas bancárias
    const seenDebitos = new Set();
    const debitosUnicos = todosDebitos.filter(d => {
      const chave = `${d.data}|${d.valor}|${String(d.descricao || '').slice(0, 40)}`;
      if (seenDebitos.has(chave)) return false;
      seenDebitos.add(chave);
      return true;
    });

    return debitosUnicos.map(debito => {
      // Encontrar melhor NF associada
      let melhorNF = null;
      let melhorScore = 0;
      for (const nf of nfsAprovadas) {
        const score = scoreAssociacao(debito, nf);
        if (score > melhorScore) {
          melhorScore = score;
          melhorNF = nf;
        }
      }

      // Detectar possíveis NFs duplicadas (mesmo valor, múltiplas NFs)
      const nfsMesmoValor = melhorScore >= 10 ? nfsAprovadas.filter(nf => {
        const v = Number(nf.valor_aprovado_admin || nf.nf_valor_total || nf.valor_solicitado || 0);
        return Math.abs(v - Number(debito.valor || 0)) < 0.05;
      }) : [];

      return {
        debito,
        nfAssociada: melhorScore >= 50 ? melhorNF : null,
        nfParcial: melhorScore >= 10 && melhorScore < 50 ? melhorNF : null,
        nfsDuplicadas: nfsMesmoValor.length > 1 ? nfsMesmoValor : [],
        conciliado: melhorScore >= 50,
        score: melhorScore,
      };
    }).sort((a, b) => {
      // Sem NF primeiro, depois parciais, depois conciliados
      if (a.conciliado !== b.conciliado) return a.conciliado ? 1 : -1;
      return Number(b.debito.valor || 0) - Number(a.debito.valor || 0);
    });
  }, [todosDebitos, nfsAprovadas]);

  const semNF = debitosComStatus.filter(d => !d.conciliado);
  const comNF = debitosComStatus.filter(d => d.conciliado);
  const totalSemNF = semNF.reduce((s, d) => s + Number(d.debito.valor || 0), 0);

  const filtrar = (lista) => {
    if (!busca.trim()) return lista;
    const q = normalizar(busca);
    return lista.filter(d =>
      normalizar(d.debito.descricao).includes(q) ||
      normalizar(d.debito.data).includes(q) ||
      fmtBRL(d.debito.valor).includes(busca) ||
      normalizar(d.nfAssociada?.fornecedor_nome || d.nfAssociada?.nf_emitente_nome || '').includes(q)
    );
  };

  const semNFFiltrados = filtrar(semNF);
  const comNFFiltrados = mostrarConciliados ? filtrar(comNF) : [];

  function toggleExpandido(key) {
    setExpandidos(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-rose-100 bg-rose-50">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-rose-900">Pagamentos sem NF aprovada ou paga</h2>
              <p className="text-xs text-rose-600">Débitos operacionais do extrato que não têm nota fiscal correspondente aprovada no sistema</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-rose-600 font-medium">Total sem NF</p>
            <p className="text-lg font-bold text-rose-800">{fmtBRL(totalSemNF)}</p>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
          <p className="text-xl font-bold text-red-700">{semNF.length}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Sem NF aprovada</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{debitosComStatus.filter(d => d.nfsDuplicadas.length > 1).length}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Possíveis NFs duplicadas</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-center">
          <p className="text-xl font-bold text-green-700">{comNF.length}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Conciliados</p>
        </div>
      </div>

      {/* Busca */}
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por descrição, valor, fornecedor…"
            className="w-full pl-9 pr-9 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Lista: sem NF */}
      <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
        {semNFFiltrados.length === 0 && !busca && (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Todos os pagamentos possuem NF associada.</p>
          </div>
        )}
        {semNFFiltrados.map((item, i) => {
          const key = `${item.debito.data}-${item.debito.valor}-${i}`;
          const expandido = expandidos[key];
          const temDuplicatas = item.nfsDuplicadas.length > 1;

          return (
            <div key={key} className={`px-5 py-3 ${temDuplicatas ? 'bg-amber-50/40' : 'bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-gray-500 shrink-0">{item.debito.data || '—'}</p>
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.debito.descricao || '—'}</p>
                    <span className="text-[10px] text-gray-400 shrink-0">{item.debito._banco || ''}</span>
                  </div>
                  {item.nfParcial && (
                    <p className="text-[10px] text-amber-700 mt-0.5">
                      ⚠ Valor coincide com NF {item.nfParcial.nf_numero || '—'} de {item.nfParcial.fornecedor_nome || item.nfParcial.nf_emitente_nome || '—'} ({item.nfParcial.status}) — verificar fornecedor
                    </p>
                  )}
                  {!item.nfParcial && !item.nfAssociada && (
                    <p className="text-[10px] text-red-500 mt-0.5">Nenhuma NF aprovada/paga com este valor no sistema</p>
                  )}
                  {temDuplicatas && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      ⚠ {item.nfsDuplicadas.length} NFs com o mesmo valor ({fmtBRL(item.debito.valor)}) — possível duplicidade
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-red-600">{fmtBRL(item.debito.valor)}</span>
                  {(item.nfParcial?.id) && (
                    <Link
                      to={`/Compras?id=${item.nfParcial.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> Ver NF
                    </Link>
                  )}
                  {(item.nfParcial || temDuplicatas) && (
                    <button
                      type="button"
                      onClick={() => toggleExpandido(key)}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Detalhes expandidos: NFs com mesmo valor */}
              {expandido && temDuplicatas && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                  <div className="px-3 py-2 text-[10px] font-semibold text-amber-700 border-b border-amber-100">
                    NFs com valor R$ {fmtBRL(item.debito.valor)} — verifique duplicidade
                  </div>
                  {item.nfsDuplicadas.map((nf, j) => (
                    <div key={j} className="px-3 py-2 border-b border-amber-100 last:border-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          NF {nf.nf_numero || '—'} · {nf.fornecedor_nome || nf.nf_emitente_nome || 'Fornecedor não identificado'}
                        </p>
                        <p className="text-[10px] text-gray-500">{nf.status} · {nf.nf_data_emissao || nf.created_date?.slice(0, 10) || '—'} · {nf.centro_custo || '—'}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        nf.status === 'PAGO' ? 'bg-green-100 text-green-700' :
                        nf.status === 'APROVADO_ADMIN' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{nf.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toggle: mostrar conciliados */}
      <div className="border-t border-gray-100 px-5 py-3">
        <button
          type="button"
          onClick={() => setMostrarConciliados(v => !v)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          {mostrarConciliados ? 'Ocultar' : 'Ver'} {comNF.length} pagamentos com NF conciliada
        </button>
        {mostrarConciliados && (
          <div className="mt-3 divide-y divide-gray-50 max-h-64 overflow-y-auto rounded-xl border border-green-100 overflow-hidden">
            {comNFFiltrados.map((item, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{item.debito.data} · {item.debito.descricao}</p>
                  <p className="text-[10px] text-green-700 truncate">
                    ✓ NF {item.nfAssociada?.nf_numero || '—'} · {item.nfAssociada?.fornecedor_nome || item.nfAssociada?.nf_emitente_nome || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-green-700">{fmtBRL(item.debito.valor)}</span>
                  {item.nfAssociada?.id && (
                    <Link
                      to={`/Compras?id=${item.nfAssociada.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> Ver NF
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}