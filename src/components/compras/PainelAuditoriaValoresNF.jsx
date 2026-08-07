import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function toNumber(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtData(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('pt-BR');
}

// Valor financeiro registrado: segue a mesma prioridade usada no restante do sistema.
function getValorRegistro(p) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_aprovado_admin) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_solicitado) ||
    0
  );
}

// Tolerância em centavos para considerar divergência (evita ruído de arredondamento).
const TOLERANCIA = 0.01;

export default function PainelAuditoriaValoresNF({ purchases = [] }) {
  const [busca, setBusca] = useState('');
  const [soDivergentes, setSoDivergentes] = useState(true);

  const auditadas = useMemo(() => {
    // Apenas NFs que foram processadas (têm valor da NF informado).
    return (purchases || [])
      .filter((p) => p?.id && toNumber(p?.nf_valor_total) > 0)
      .map((p) => {
        const valorNf = toNumber(p?.nf_valor_total);
        const valorRegistro = getValorRegistro(p);
        const delta = valorNf - valorRegistro;
        const divergente = Math.abs(delta) > TOLERANCIA;
        return {
          id: p.id,
          numero: p.nf_numero || '—',
          emitente: p.nf_emitente_nome || p.fornecedor_nome || '—',
          dataEmissao: p.nf_data_emissao,
          descricao: p.descricao_item || '—',
          centroCusto: p.centro_custo || '—',
          status: p.status || '—',
          valorNf,
          valorRegistro,
          delta,
          divergente,
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [purchases]);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return auditadas.filter((row) => {
      if (soDivergentes && !row.divergente) return false;
      if (!b) return true;
      return (
        String(row.numero).toLowerCase().includes(b) ||
        String(row.emitente).toLowerCase().includes(b) ||
        String(row.descricao).toLowerCase().includes(b) ||
        String(row.centroCusto).toLowerCase().includes(b)
      );
    });
  }, [auditadas, busca, soDivergentes]);

  const stats = useMemo(() => {
    const total = auditadas.length;
    const div = auditadas.filter((r) => r.divergente).length;
    const somaDelta = auditadas.filter((r) => r.divergente).reduce((acc, r) => acc + r.delta, 0);
    return { total, divergentes: div, somaDelta };
  }, [auditadas]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Auditoria de Valores — NF × Registro Financeiro
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Lista todas as notas fiscais processadas e destaca divergências entre o valor da NF e o valor registrado no sistema.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">NFs processadas</p>
          <p className="text-xl font-semibold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">Com divergência</p>
          <p className="text-xl font-semibold text-amber-800">{stats.divergentes}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 col-span-2 md:col-span-1">
          <p className="text-xs text-gray-500">Saldo total das divergências</p>
          <p className={`text-xl font-semibold ${stats.somaDelta >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
            {fmtBRL(Math.abs(stats.somaDelta))} {stats.somaDelta >= 0 ? '(NF maior)' : '(Registro maior)'}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por NF, fornecedor, descrição..."
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Button
          variant={soDivergentes ? 'default' : 'outline'}
          onClick={() => setSoDivergentes((v) => !v)}
          className={soDivergentes ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
        >
          <AlertTriangle className="h-4 w-4 mr-1.5" />
          {soDivergentes ? 'Mostrando só divergentes' : 'Mostrar todas'}
        </Button>
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-400" />
          <p className="font-medium text-gray-500">
            {soDivergentes ? 'Nenhuma divergência encontrada 🎉' : 'Nenhuma NF processada encontrada'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">NF</th>
                <th className="px-3 py-2 text-left font-medium">Fornecedor</th>
                <th className="px-3 py-2 text-left font-medium">Emissão</th>
                <th className="px-3 py-2 text-left font-medium">Descrição</th>
                <th className="px-3 py-2 text-left font-medium">Centro</th>
                <th className="px-3 py-2 text-right font-medium">Valor NF</th>
                <th className="px-3 py-2 text-right font-medium">Valor Registro</th>
                <th className="px-3 py-2 text-right font-medium">Δ</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map((row) => (
                <tr
                  key={row.id}
                  className={row.divergente ? 'bg-amber-50/60' : 'bg-white'}
                >
                  <td className="px-3 py-2 text-gray-900 font-medium">{row.numero}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={row.emitente}>{row.emitente}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtData(row.dataEmissao)}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-xs truncate" title={row.descricao}>{row.descricao}</td>
                  <td className="px-3 py-2 text-gray-600">{row.centroCusto}</td>
                  <td className="px-3 py-2 text-right text-gray-900 font-medium whitespace-nowrap">{fmtBRL(row.valorNf)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmtBRL(row.valorRegistro)}</td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${row.divergente ? 'text-red-600' : 'text-green-600'}`}>
                    {row.delta >= 0 ? '+' : ''}{fmtBRL(row.delta)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.divergente ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3 w-3" />
                        Divergente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        <CheckCircle2 className="h-3 w-3" />
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
        <FileText className="h-3.5 w-3.5" />
        Comparando <strong className="text-gray-500">nf_valor_total</strong> (valor da nota fiscal) com
        <strong className="text-gray-500"> valor_pago / valor_aprovado / valor_solicitado</strong>. Tolerância de R$ 0,01.
      </div>
    </div>
  );
}