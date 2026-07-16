import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const TOTAL_PREVISTO_3_ADITIVO = 1320000;
const TOTAL_PREVISTO_4_ADITIVO = 81719.85;
const TOTAL_PREVISTO_OFICIAL = TOTAL_PREVISTO_3_ADITIVO + TOTAL_PREVISTO_4_ADITIVO;
const TOLERANCIA_CENTAVOS = 0.01;

function fmtBRL(v) {
  if (!v && v !== 0) return 'R$ 0';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function toNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function valorPrevistoRubrica(rubrica) {
  return toNum(rubrica?.valor_rubrica ?? rubrica?.valor_total);
}

function chaveSemanticaRubrica(rubrica) {
  const nome = normalizarTexto(rubrica?.rubrica || rubrica?.nome);
  const grupo = normalizarTexto(rubrica?.grupo);
  const natureza = normalizarTexto(rubrica?.natureza_despesa || rubrica?.nome_natureza);
  const valor = valorPrevistoRubrica(rubrica).toFixed(2);
  return nome ? `${grupo}|${nome}|${natureza}|${valor}` : '';
}

function agrupar(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key) continue;
    const grupo = map.get(key) || [];
    grupo.push(item);
    map.set(key, grupo);
  }
  return [...map.entries()].filter(([, registros]) => registros.length > 1);
}

function getCorBarra(pct) {
  if (pct >= 100) return '#ef4444';
  if (pct >= 80) return '#f97316';
  if (pct >= 50) return '#eab308';
  return '#22c55e';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-900 mb-1 max-w-[220px] break-words">{label}</p>
      <p className="text-gray-500">Total previsto: <span className="font-medium text-gray-800">{fmtBRL(d?.total)}</span></p>
      <p className="text-gray-500">Utilizado: <span className="font-medium text-gray-800">{fmtBRL(d?.utilizado)}</span></p>
      <p className="text-gray-500">Saldo: <span className="font-medium text-gray-800">{fmtBRL(d?.saldo)}</span></p>
      <p className="text-gray-500">Execução: <span className="font-semibold" style={{ color: getCorBarra(d?.pct) }}>{d?.pct?.toFixed(1)}%</span></p>
    </div>
  );
};

export default function RubricasConsumoDashboard({ rubricas }) {
  const [grupoBusca, setGrupoBusca] = useState('');
  const [somenteAtivas, setSomenteAtivas] = useState(true);
  const [mostrarAuditoria, setMostrarAuditoria] = useState(false);

  const auditoria = useMemo(() => {
    const todas = Array.isArray(rubricas) ? rubricas : [];
    const ativas = todas.filter((r) => r?.ativo !== false);
    const comId = ativas.filter((r) => r?.id);

    const repetidasPorId = agrupar(comId, (r) => String(r.id));
    const idsUnicos = new Map();
    for (const rubrica of comId) {
      if (!idsUnicos.has(String(rubrica.id))) idsUnicos.set(String(rubrica.id), rubrica);
    }

    const rubricasUnicasPorId = [...idsUnicos.values()];
    const repetidasSemanticas = agrupar(rubricasUnicasPorId, chaveSemanticaRubrica);
    const somaBruta = ativas.reduce((soma, r) => soma + valorPrevistoRubrica(r), 0);
    const somaPorIdUnico = rubricasUnicasPorId.reduce((soma, r) => soma + valorPrevistoRubrica(r), 0);
    const diferencaOficial = somaPorIdUnico - TOTAL_PREVISTO_OFICIAL;

    return {
      totalRegistros: ativas.length,
      totalIdsUnicos: rubricasUnicasPorId.length,
      semId: ativas.filter((r) => !r?.id),
      repetidasPorId,
      repetidasSemanticas,
      somaBruta,
      somaPorIdUnico,
      diferencaOficial,
      possuiErroSoma: Math.abs(diferencaOficial) > TOLERANCIA_CENTAVOS,
    };
  }, [rubricas]);

  const dados = useMemo(() => {
    const vistos = new Set();
    return (rubricas || [])
      .filter(r => {
        if (!r?.id || vistos.has(r.id)) return false;
        vistos.add(r.id);
        if (somenteAtivas && r.ativo === false) return false;
        if (grupoBusca && !String(r.grupo || r.rubrica || '').toLowerCase().includes(grupoBusca.toLowerCase())) return false;
        return true;
      })
      .map(r => {
        const total = valorPrevistoRubrica(r);
        const utilizado = toNum(r.valor_utilizado);
        const saldo = total - utilizado;
        const pct = total > 0 ? (utilizado / total) * 100 : 0;
        return {
          id: r.id,
          nome: r.rubrica || r.nome || 'Sem nome',
          grupo: r.grupo || '',
          total,
          utilizado,
          saldo,
          pct,
          cor: getCorBarra(pct),
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [rubricas, grupoBusca, somenteAtivas]);

  const totais = useMemo(() => {
    const calculado = dados.reduce((acc, d) => ({ total: acc.total + d.total, utilizado: acc.utilizado + d.utilizado }), { total: 0, utilizado: 0 });
    const usarBaseOficial = !grupoBusca && somenteAtivas;
    const total = usarBaseOficial ? TOTAL_PREVISTO_OFICIAL : calculado.total;
    return {
      total,
      utilizado: calculado.utilizado,
      saldo: total - calculado.utilizado,
      pct: total > 0 ? (calculado.utilizado / total) * 100 : 0,
    };
  }, [dados, grupoBusca, somenteAtivas]);

  const chunks = useMemo(() => {
    const result = [];
    for (let i = 0; i < dados.length; i += 15) result.push(dados.slice(i, i + 15));
    return result;
  }, [dados]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        <span className="font-semibold">Base contratual oficial:</span> {fmtBRL(TOTAL_PREVISTO_OFICIAL)}
        <span className="ml-2">3º aditivo {fmtBRL(TOTAL_PREVISTO_3_ADITIVO)} + 4º aditivo {fmtBRL(TOTAL_PREVISTO_4_ADITIVO)}.</span>
        {auditoria.possuiErroSoma && (
          <span className="ml-2 font-semibold text-amber-700">
            A soma das rubricas únicas está {auditoria.diferencaOficial > 0 ? 'acima' : 'abaixo'} da base oficial em {fmtBRL(Math.abs(auditoria.diferencaOficial))}.
          </span>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">Auditoria de soma e repetições</p>
            <p className="mt-1 text-gray-500">Somente leitura. Nenhuma rubrica ou ajuste manual é alterado.</p>
          </div>
          <button
            type="button"
            onClick={() => setMostrarAuditoria((valor) => !valor)}
            className="rounded-lg border border-gray-200 px-3 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            {mostrarAuditoria ? 'Ocultar memória' : 'Ver memória de auditoria'}
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-gray-500">Soma bruta:</span><p className="font-semibold">{fmtBRL(auditoria.somaBruta)}</p></div>
          <div><span className="text-gray-500">Soma por ID único:</span><p className="font-semibold">{fmtBRL(auditoria.somaPorIdUnico)}</p></div>
          <div><span className="text-gray-500">IDs repetidos:</span><p className="font-semibold">{auditoria.repetidasPorId.length}</p></div>
          <div><span className="text-gray-500">Possíveis repetições:</span><p className="font-semibold">{auditoria.repetidasSemanticas.length}</p></div>
        </div>

        {mostrarAuditoria && (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
            {auditoria.semId.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                {auditoria.semId.length} rubrica(s) ativa(s) sem ID não entram na soma deduplicada. Nenhum registro foi modificado.
              </div>
            )}

            <div>
              <p className="font-semibold text-gray-800">Registros repetidos pelo mesmo ID</p>
              {auditoria.repetidasPorId.length === 0 ? (
                <p className="mt-1 text-gray-500">Nenhuma repetição de ID encontrada.</p>
              ) : auditoria.repetidasPorId.map(([id, registros]) => (
                <div key={id} className="mt-2 rounded-lg border border-red-100 bg-red-50 p-3 text-red-900">
                  <p><strong>ID:</strong> {id} — {registros.length} ocorrências</p>
                  <p>{registros.map((r) => r.rubrica || r.nome || 'Sem nome').join(' | ')}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="font-semibold text-gray-800">Possíveis rubricas repetidas com IDs diferentes</p>
              <p className="mt-1 text-gray-500">Critério: mesmo grupo, nome, natureza e valor previsto. A indicação é apenas para conferência manual.</p>
              {auditoria.repetidasSemanticas.length === 0 ? (
                <p className="mt-2 text-gray-500">Nenhuma repetição exata encontrada por esse critério.</p>
              ) : auditoria.repetidasSemanticas.map(([chave, registros]) => (
                <div key={chave} className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-900">
                  <p className="font-medium">{registros[0]?.rubrica || registros[0]?.nome || 'Sem nome'} — {fmtBRL(valorPrevistoRubrica(registros[0]))}</p>
                  <p className="mt-1">IDs: {registros.map((r) => r.id).join(', ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Previsto', value: fmtBRL(totais.total), color: 'text-gray-900' },
          { label: 'Total Utilizado', value: fmtBRL(totais.utilizado), color: 'text-orange-600' },
          { label: 'Saldo Disponível', value: fmtBRL(totais.saldo), color: totais.saldo < 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Execução Geral', value: `${totais.pct.toFixed(1)}%`, color: totais.pct >= 80 ? 'text-red-600' : 'text-blue-700' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700">Nível de execução:</span>
        {[
          { cor: '#22c55e', label: '< 50%' },
          { cor: '#eab308', label: '50–79%' },
          { cor: '#f97316', label: '80–99%' },
          { cor: '#ef4444', label: '≥ 100%' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: l.cor }} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar rubrica ou grupo..."
          value={grupoBusca}
          onChange={e => setGrupoBusca(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 w-64"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={somenteAtivas} onChange={e => setSomenteAtivas(e.target.checked)} className="rounded" />
          Somente rubricas ativas
        </label>
        <span className="text-xs text-gray-400">{dados.length} rubricas</span>
      </div>

      {dados.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-gray-400 text-sm">
          Nenhuma rubrica encontrada.
        </div>
      )}

      {chunks.map((chunk, ci) => (
        <div key={ci} className="rounded-xl border border-gray-200 bg-white p-4">
          {chunks.length > 1 && <p className="text-xs text-gray-400 mb-3">Grupo {ci + 1} de {chunks.length}</p>}
          <ResponsiveContainer width="100%" height={chunk.length * 36 + 40}>
            <BarChart data={chunk} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={v => fmtBRL(v)} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nome" width={180} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Total Previsto" fill="#e5e7eb" radius={[0, 4, 4, 0]} />
              <Bar dataKey="utilizado" name="Utilizado" radius={[0, 4, 4, 0]}>
                {chunk.map((entry) => <Cell key={entry.id} fill={entry.cor} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
