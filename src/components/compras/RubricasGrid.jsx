import React, { useMemo, useState } from 'react';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getValorCompra(c) {
  return (
    toNumber(c?.valor_pago) ||
    toNumber(c?.valor_aprovado_admin) ||
    toNumber(c?.valor_aprovado) ||
    toNumber(c?.valor_final) ||
    toNumber(c?.valor_solicitado) ||
    0
  );
}

export default function RubricasGrid({
  rubricas = [],
  purchases = [],
}) {
  const [search, setSearch] = useState('');

  // 🔹 mapa de utilizado por rubrica
  const utilizadoPorRubrica = useMemo(() => {
    const mapa = {};

    for (const compra of purchases) {
      const status = String(compra?.status || '').toUpperCase();

      if (
        status !== 'APROVADO_COORD' &&
        status !== 'APROVADO_ADMIN' &&
        status !== 'PAGO'
      ) continue;

      const rubricaId = compra?.rubrica_id;
      if (!rubricaId) continue;

      const valor = getValorCompra(compra);

      mapa[rubricaId] = (mapa[rubricaId] || 0) + valor;
    }

    return mapa;
  }, [purchases]);

  const filtradas = useMemo(() => {
    return rubricas.filter(r => {
      const texto = `${r?.rubrica || ''} ${r?.grupo || ''}`.toLowerCase();
      return texto.includes(search.toLowerCase());
    });
  }, [rubricas, search]);

  const totais = useMemo(() => {
    let previsto = 0;
    let utilizado = 0;

    for (const r of filtradas) {
      const val = toNumber(r?.valor_rubrica);
      const util = utilizadoPorRubrica[r.id] || 0;

      previsto += val;
      utilizado += util;
    }

    return {
      previsto,
      utilizado,
      saldo: previsto - utilizado,
    };
  }, [filtradas, utilizadoPorRubrica]);

  return (
    <div className="space-y-4">

      {/* BUSCA */}
      <input
        placeholder="Buscar rubrica..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded p-2"
      />

      {/* TABELA */}
      <div className="overflow-auto border rounded">
        <table className="w-full text-sm">

          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Grupo</th>
              <th className="p-2">Rubrica</th>
              <th className="p-2">Valor</th>
              <th className="p-2">Utilizado</th>
              <th className="p-2">Saldo</th>
              <th className="p-2">%</th>
            </tr>
          </thead>

          <tbody>
            {filtradas.map((r) => {
              const valor = toNumber(r?.valor_rubrica);
              const utilizado = utilizadoPorRubrica[r.id] || 0;
              const saldo = valor - utilizado;
              const perc = valor > 0 ? (utilizado / valor) * 100 : 0;

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r?.grupo}</td>
                  <td className="p-2">{r?.rubrica}</td>
                  <td className="p-2">R$ {moeda(valor)}</td>
                  <td className="p-2 text-blue-700">
                    R$ {moeda(utilizado)}
                  </td>
                  <td className="p-2 text-green-700">
                    R$ {moeda(saldo)}
                  </td>
                  <td className="p-2">
                    {perc.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* RODAPÉ */}
          <tfoot className="bg-gray-50 font-bold">
            <tr>
              <td colSpan={2} className="p-2">TOTAL</td>
              <td className="p-2">R$ {moeda(totais.previsto)}</td>
              <td className="p-2">R$ {moeda(totais.utilizado)}</td>
              <td className="p-2">R$ {moeda(totais.saldo)}</td>
              <td></td>
            </tr>
          </tfoot>

        </table>
      </div>
    </div>
  );
}
