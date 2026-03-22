import React from 'react';
import { AlertTriangle, Users } from 'lucide-react';

function toNumber(v){ return Number(v)||0 }

function getPurchaseValue(p){
  return (
    toNumber(p.valor_pago) ||
    toNumber(p.valor_aprovado) ||
    toNumber(p.valor_solicitado)
  );
}

export default function OrcamentoDashboard({ budgetLines = [], purchases = [] }) {

  /* ================= BASE ================= */

  const totalInicial = budgetLines.reduce((acc,l)=>acc + toNumber(l.saldo_inicial),0);
  const totalComprometido = budgetLines.reduce((acc,l)=>acc + toNumber(l.saldo_comprometido),0);
  const totalDisponivel = totalInicial - totalComprometido;

  const pctUsado = totalInicial > 0 ? (totalComprometido / totalInicial) * 100 : 0;

  /* ================= EXECUÇÃO REAL ================= */

  const totalPago = purchases
    .filter(p => p.status === 'PAGO')
    .reduce((acc,p)=> acc + getPurchaseValue(p),0);

  const totalAprovado = purchases
    .filter(p => p.status === 'APROVADO_COORD' || p.status === 'APROVADO_ADMIN' || p.status === 'PAGO')
    .reduce((acc,p)=> acc + getPurchaseValue(p),0);

  const pctExecucao = totalInicial > 0 ? (totalPago / totalInicial) * 100 : 0;

  /* ================= EQUIPE ================= */

  const teamPurchases = purchases.filter(p =>
    p.origem === 'TEAM_PAYMENT' || p.team_payment_id
  );

  const totalEquipe = teamPurchases.reduce((acc,p)=>acc + getPurchaseValue(p),0);
  const totalCompras = purchases.reduce((acc,p)=>acc + getPurchaseValue(p),0);
  const pctEquipe = totalCompras > 0 ? (totalEquipe / totalCompras) * 100 : 0;

  /* ================= RISCO ================= */

  const riscoCompras = purchases.filter(p => {

    const semRubrica = !p.rubrica_id && !p.budgetline_id && !p.budget_line_id;

    const nfInvalida = p.nf_valida === false;

    const divergenciaValor =
      p.nf_valor_extraido &&
      Math.abs(p.nf_valor_extraido - p.valor_solicitado) > 1;

    return semRubrica || nfInvalida || divergenciaValor;
  });

  /* ================= NATUREZA ================= */

  const porNatureza = budgetLines.reduce((acc,l)=>{
    const key = l.natureza_nome || l.natureza_codigo || 'Outros';

    if(!acc[key]) acc[key] = { nome:key, previsto:0, comprometido:0 };

    acc[key].previsto += toNumber(l.saldo_inicial);
    acc[key].comprometido += toNumber(l.saldo_comprometido);

    return acc;
  },{});

  const fmt = (v)=>`R$ ${toNumber(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;

  return (
    <div className="space-y-8">

      {/* KPI PRINCIPAL */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

        <div className="p-5 border rounded-xl">
          <p className="text-xs text-gray-500">Saldo Inicial</p>
          <p className="text-xl font-bold">{fmt(totalInicial)}</p>
        </div>

        <div className="p-5 border rounded-xl">
          <p className="text-xs text-gray-500">Comprometido</p>
          <p className="text-xl font-bold text-amber-600">{fmt(totalComprometido)}</p>
        </div>

        <div className="p-5 border rounded-xl">
          <p className="text-xs text-gray-500">Disponível</p>
          <p className={`text-xl font-bold ${totalDisponivel < totalInicial*0.1 ? 'text-red-600':'text-green-600'}`}>
            {fmt(totalDisponivel)}
          </p>
        </div>

        <div className="p-5 border rounded-xl">
          <p className="text-xs text-gray-500">Pago</p>
          <p className="text-xl font-bold text-green-700">{fmt(totalPago)}</p>
        </div>

        <div className="p-5 border rounded-xl">
          <p className="text-xs text-gray-500">Execução</p>
          <p className="text-xl font-bold">{pctExecucao.toFixed(1)}%</p>
        </div>

      </div>

      {/* EQUIPE + RISCO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="p-5 border rounded-xl bg-purple-50">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-purple-700"/>
            <span className="text-xs text-purple-700">Equipe</span>
          </div>
          <p className="text-xl font-bold text-purple-800">{fmt(totalEquipe)}</p>
          <p className="text-xs text-purple-600">{pctEquipe.toFixed(1)}% do total</p>
        </div>

        <div className="p-5 border rounded-xl bg-red-50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600"/>
            <span className="text-xs text-red-600">Risco</span>
          </div>
          <p className="text-xl font-bold text-red-700">{riscoCompras.length}</p>
          <p className="text-xs text-red-600">compras com inconsistência</p>
        </div>

      </div>

      {/* BARRA */}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${
            pctUsado>90?'bg-red-500':
            pctUsado>70?'bg-amber-500':
            'bg-green-500'
          }`}
          style={{width:`${Math.min(pctUsado,100)}%`}}
        />
      </div>

      {/* NATUREZA */}
      <div>
        <h3 className="text-sm font-semibold mb-4">Por Natureza</h3>
        <div className="space-y-2">
          {Object.values(porNatureza).map(n=>{
            const pct = n.previsto>0 ? (n.comprometido/n.previsto)*100 : 0;

            return (
              <div key={n.nome} className="p-3 border rounded-lg">
                <div className="flex justify-between text-xs">
                  <span>{n.nome}</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>

                <div className="h-1 bg-gray-100 mt-1">
                  <div
                    className="h-full bg-blue-500"
                    style={{width:`${pct}%`}}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TABELA */}
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descrição</th>
            <th>Previsto</th>
            <th>Comprometido</th>
            <th>Saldo</th>
          </tr>
        </thead>

        <tbody>
          {budgetLines.map(l=>{
            const saldo = toNumber(l.saldo_inicial) - toNumber(l.saldo_comprometido);

            return (
              <tr key={l.id}>
                <td>{l.codigo}</td>
                <td>{l.descricao}</td>
                <td>{fmt(l.saldo_inicial)}</td>
                <td>{fmt(l.saldo_comprometido)}</td>
                <td className={saldo<0?'text-red-600':'text-green-600'}>
                  {fmt(saldo)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

    </div>
  );
}
