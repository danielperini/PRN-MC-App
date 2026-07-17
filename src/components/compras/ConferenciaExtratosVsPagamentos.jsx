import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function normalizeVal(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(p) {
  return normalizeVal(p?.valor_pago) || normalizeVal(p?.valor_aprovado_admin) || normalizeVal(p?.valor_aprovado) || normalizeVal(p?.valor_solicitado) || 0;
}

// Tenta parear um pagamento a um lançamento de extrato por valor ± 1 centavo
function matchByValue(val, lancamentos) {
  return lancamentos.find(l => l.tipo === 'debito' && Math.abs(normalizeVal(l.valor) - val) < 0.02);
}

export default function ConferenciaExtratosVsPagamentos() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [extratoTotal, setExtratoTotal] = useState(0);
  const [pagamentosTotal, setPagamentosTotal] = useState(0);
  const [extratos, setExtratos] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [purchases, movs] = await Promise.all([
        base44.entities.PurchaseRequest.filter({ status: 'PAGO' }),
        base44.entities.MovimentacaoBancaria.list('-ano', 200),
      ]);

      const pagos = (purchases || []).filter(p => p.pago || p.status === 'PAGO');
      const allLancamentos = (movs || []).flatMap(m =>
        (m.lancamentos || []).map(l => ({ ...l, mes: m.mes, ano: m.ano, banco: m.banco }))
      );
      const debitos = allLancamentos.filter(l => l.tipo === 'debito');

      const totalPag = pagos.reduce((s, p) => s + getPurchaseValue(p), 0);
      const totalExt = debitos.reduce((s, l) => s + normalizeVal(l.valor), 0);

      // Parear cada pagamento com um débito do extrato
      const usados = new Set();
      const result = pagos.map(p => {
        const val = getPurchaseValue(p);
        const match = debitos.find(l => {
          const key = `${l.data}|${l.valor}|${l.descricao}`;
          return !usados.has(key) && Math.abs(normalizeVal(l.valor) - val) < 0.02;
        });
        if (match) {
          const key = `${match.data}|${match.valor}|${match.descricao}`;
          usados.add(key);
        }
        return {
          id: p.id,
          fornecedor: p.fornecedor_nome || p.nf_emitente_nome || p.descricao_item || '—',
          nf: p.nf_numero || '—',
          valor: val,
          centro: p.centro_custo || '—',
          data_pag: p.data_pagamento_efetivo || p.data_pagamento || p.updated_date,
          encontrado: !!match,
          extrato_data: match?.data || null,
          extrato_desc: match?.descricao || null,
          extrato_mes: match ? `${match.mes}/${match.ano}` : null,
        };
      });

      result.sort((a, b) => (a.encontrado === b.encontrado ? 0 : a.encontrado ? 1 : -1));

      setRows(result);
      setPagamentosTotal(totalPag);
      setExtratoTotal(totalExt);
      setExtratos(movs || []);
      setLoading(false);
    }
    load();
  }, []);

  const naoEncontrados = rows.filter(r => !r.encontrado);
  const encontrados = rows.filter(r => r.encontrado);

  if (loading) return <div className="py-8 text-center text-sm text-gray-500">Carregando conferência...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Conferência: Pagamentos × Extratos Bancários</h3>
        <p className="text-xs text-gray-500">
          Cruza todas as solicitações com status PAGO com os débitos importados nos extratos bancários, pareando por valor.
        </p>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Pagamentos registrados</p>
          <p className="text-lg font-bold text-gray-900">{rows.length}</p>
          <p className="text-xs text-gray-400">{fmtBRL(pagamentosTotal)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Total débitos no extrato</p>
          <p className="text-lg font-bold text-gray-900">{extratos.length} meses</p>
          <p className="text-xs text-gray-400">{fmtBRL(extratoTotal)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">Pareados ✓</p>
          <p className="text-lg font-bold text-emerald-800">{encontrados.length}</p>
          <p className="text-xs text-emerald-600">{fmtBRL(encontrados.reduce((s,r)=>s+r.valor,0))}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">Sem par no extrato ⚠️</p>
          <p className="text-lg font-bold text-amber-800">{naoEncontrados.length}</p>
          <p className="text-xs text-amber-600">{fmtBRL(naoEncontrados.reduce((s,r)=>s+r.valor,0))}</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Fornecedor / NF</th>
              <th className="px-3 py-2 text-left">Centro</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-left">Extrato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.id} className={r.encontrado ? 'bg-white' : 'bg-amber-50'}>
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-800 truncate max-w-[200px]">{r.fornecedor}</p>
                  {r.nf !== '—' && <p className="text-xs text-gray-400">NF {r.nf}</p>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.centro}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-800">{fmtBRL(r.valor)}</td>
                <td className="px-3 py-2 text-center">
                  {r.encontrado
                    ? <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">✓ Encontrado</span>
                    : <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">⚠ Sem par</span>
                  }
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {r.encontrado
                    ? <><span className="font-medium">{r.extrato_mes}</span> · {r.extrato_data} · <span className="truncate">{r.extrato_desc}</span></>
                    : <span className="text-gray-400 italic">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">
            Nenhum pagamento registrado com status PAGO.
          </div>
        )}
      </div>
    </div>
  );
}