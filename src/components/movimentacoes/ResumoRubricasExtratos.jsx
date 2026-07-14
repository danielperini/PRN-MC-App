import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { AlertTriangle, CheckCircle2, FileText, Landmark, ArrowRightLeft } from 'lucide-react';
import { agruparMovimentacoesPorMes, resumirRegistrosMensais, ehTransferenciaInterna } from '@/utils/movimentacoesMensais';

const MESES_CURTO = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function num(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Valor efetivo pago de uma PurchaseRequest — sem parsing de string formatada
function purchaseValue(purchase) {
  const raw = purchase?.valor_pago ?? purchase?.valor_aprovado_admin ?? purchase?.valor_aprovado
    ?? purchase?.valor_final ?? purchase?.valor_solicitado ?? purchase?.valor_total
    ?? purchase?.valor ?? purchase?.rubrica_debitada_valor;
  const v = num(raw);
  // Se o campo está como string "R$ 1.234,56", convertemos corretamente
  if (v === 0 && typeof raw === 'string') {
    const cleaned = raw.replace(/[R$\s.]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  }
  return Math.abs(v);
}

function rubricaName(purchase, rubricaById) {
  const id = purchase?.rubrica_id || purchase?.budgetline_id || purchase?.budget_line_id;
  const rubrica = id ? rubricaById.get(String(id)) : null;
  return purchase?.rubrica_nome || purchase?.rubrica || purchase?.budgetline_nome
    || rubrica?.nome || rubrica?.titulo || rubrica?.descricao || 'Sem rubrica vinculada';
}

// Chave fiscal para deduplicação por NF+CNPJ+valor
function fiscalKey(purchase) {
  const nf = String(purchase?.nf_numero || '').trim();
  const cnpj = String(purchase?.fornecedor_cpf_cnpj || purchase?.fornecedor_cnpj || purchase?.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
  const value = purchaseValue(purchase).toFixed(2);
  if (nf && cnpj) return `nf:${nf}:${cnpj}:${value}`;
  const url = purchase?.nota_fiscal_url || purchase?.file_url || purchase?.nf_pdf_url || purchase?.pdf_url;
  if (url) return `url:${url}`;
  return purchase?.id ? `id:${purchase.id}` : null;
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 2,
  }).format(num(value));
}

function formatAxis(value) {
  const amount = num(value);
  if (Math.abs(amount) >= 1_000_000) return `R$ ${(amount / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(amount) >= 1_000) return `R$ ${(amount / 1_000).toFixed(0)} mil`;
  return `R$ ${amount.toFixed(0)}`;
}

function monthKeyFromPurchase(purchase) {
  const raw = purchase?.data_pagamento || purchase?.paid_at || purchase?.nf_data_emissao
    || purchase?.data_emissao || purchase?.created_date;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function ResumoRubricasExtratos({ movimentacoes = [] }) {
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['movimentacoes-resumo-purchase-requests'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 2000),
    staleTime: 1000 * 60 * 2,
  });

  const { data: rubricas = [], isLoading: loadingRubricas } = useQuery({
    queryKey: ['movimentacoes-resumo-rubricas'],
    queryFn: async () => {
      try {
        const result = await base44.functions.invoke('listAllRubricas', {});
        const data = result?.data || result || {};
        return data.rubricas || data.results || data.data?.rubricas || [];
      } catch (_) {
        return await base44.entities.Rubrica.list('ordem_exibicao', 1000);
      }
    },
    staleTime: 1000 * 60 * 10,
  });

  const summary = useMemo(() => {
    const rubricaById = new Map((rubricas || []).filter(Boolean).map(item => [String(item.id), item]));

    // Deduplicar NFs por chave fiscal
    const uniqueFiscal = new Map();
    (purchases || []).forEach(purchase => {
      const status = normalize(purchase?.status).toUpperCase();
      if (!STATUS_APROVADOS.has(status)) return;
      const key = fiscalKey(purchase);
      if (!key || uniqueFiscal.has(key)) return;
      uniqueFiscal.set(key, purchase);
    });

    const approved = Array.from(uniqueFiscal.values());

    // Total aprovado por rubrica
    const byRubrica = new Map();
    approved.forEach(purchase => {
      const name = rubricaName(purchase, rubricaById);
      byRubrica.set(name, num(byRubrica.get(name)) + purchaseValue(purchase));
    });

    const rubricaData = Array.from(byRubrica.entries())
      .map(([rubrica, total]) => ({ rubrica, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // ── Débitos OPERACIONAIS por mês (sem transferências internas) ──────────
    const grupos = agruparMovimentacoesPorMes(movimentacoes);
    const bankDebitsByMonth = new Map();   // operacionais
    const bankTransfByMonth = new Map();   // transferências internas (info)

    grupos.forEach(grupo => {
      const resumo = resumirRegistrosMensais(grupo.registros);
      bankDebitsByMonth.set(grupo.key, resumo.debitos);
      bankTransfByMonth.set(grupo.key, resumo.transferencias_internas_valor);
    });

    // NFs aprovadas por mês
    const approvedByMonth = new Map();
    const withoutRubricaByMonth = new Map();
    approved.forEach(purchase => {
      const key = monthKeyFromPurchase(purchase);
      if (!key) return;
      approvedByMonth.set(key, num(approvedByMonth.get(key)) + purchaseValue(purchase));
      if (rubricaName(purchase, rubricaById) === 'Sem rubrica vinculada') {
        withoutRubricaByMonth.set(key, (withoutRubricaByMonth.get(key) || 0) + 1);
      }
    });

    // Todos os meses com dados (banco OU NF)
    const allKeys = Array.from(new Set([...bankDebitsByMonth.keys(), ...approvedByMonth.keys()])).sort();
    const comparisonData = allKeys.map(key => {
      const [year, month] = key.split('-');
      const mesNum = parseInt(month, 10);
      const extratos = num(bankDebitsByMonth.get(key));
      const notas = num(approvedByMonth.get(key));
      const transf = num(bankTransfByMonth.get(key));
      return {
        key,
        mes: `${MESES_CURTO[mesNum] || month}/${String(year).slice(-2)}`,
        extratos,        // débitos operacionais
        notas,           // NFs aprovadas
        transferencias_internas: transf,
        diferenca: extratos - notas,
        sem_rubrica: withoutRubricaByMonth.get(key) || 0,
      };
    });

    const totalBank = comparisonData.reduce((sum, item) => sum + item.extratos, 0);
    const totalFiscal = comparisonData.reduce((sum, item) => sum + item.notas, 0);
    const totalTransf = comparisonData.reduce((sum, item) => sum + item.transferencias_internas, 0);

    return {
      rubricaData,
      comparisonData,
      totalBank,
      totalFiscal,
      totalTransf,
      difference: totalBank - totalFiscal,
      approvedCount: approved.length,
      withoutRubrica: approved.filter(item => rubricaName(item, rubricaById) === 'Sem rubrica vinculada').length,
    };
  }, [movimentacoes, purchases, rubricas]);

  if (loadingPurchases || loadingRubricas) return null;

  const reconciled = Math.abs(summary.difference) <= 0.01;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Resumo financeiro por rubrica</h2>
          <p className="text-xs text-slate-500">
            Débitos operacionais reais dos extratos vs. notas fiscais aprovadas.
            Transferências internas (Resgate/Aplicação) excluídas dos totais de despesa.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${reconciled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {reconciled ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {reconciled ? 'Conciliação fechada' : 'Diferença a conciliar'}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Landmark className="w-4 h-4 text-slate-600 mb-2" />
          <p className="text-[10px] text-slate-500">Débitos operacionais</p>
          <p className="text-base font-bold text-slate-900">{formatBRL(summary.totalBank)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Sem resgates/aplicações</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <ArrowRightLeft className="w-4 h-4 text-orange-500 mb-2" />
          <p className="text-[10px] text-orange-500">Transferências internas</p>
          <p className="text-base font-bold text-orange-800">{formatBRL(summary.totalTransf)}</p>
          <p className="text-[10px] text-orange-400 mt-0.5">Não contabilizadas como despesa</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <FileText className="w-4 h-4 text-blue-600 mb-2" />
          <p className="text-[10px] text-blue-500">Notas fiscais aprovadas</p>
          <p className="text-base font-bold text-blue-800">{formatBRL(summary.totalFiscal)}</p>
        </div>
        <div className={`rounded-xl border p-3 ${reconciled ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <AlertTriangle className={`w-4 h-4 mb-2 ${reconciled ? 'text-green-600' : 'text-amber-600'}`} />
          <p className="text-[10px] text-slate-500">Diferença a conciliar</p>
          <p className="text-base font-bold text-slate-900">{formatBRL(summary.difference)}</p>
          {summary.withoutRubrica > 0 && (
            <p className="text-[10px] text-amber-600 mt-1">{summary.withoutRubrica} NF sem rubrica</p>
          )}
        </div>
      </div>

      {/* Tabela por mês — todos os meses */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 px-3 font-semibold text-slate-500">Mês</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-500">Débitos operacionais</th>
              <th className="text-right py-2 px-3 font-semibold text-orange-500">Transf. internas ignoradas</th>
              <th className="text-right py-2 px-3 font-semibold text-blue-500">NFs aprovadas</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-500">Diferença</th>
              <th className="text-right py-2 px-3 font-semibold text-amber-500">Sem rubrica</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {summary.comparisonData.map(row => (
              <tr key={row.key} className="hover:bg-slate-50">
                <td className="py-2 px-3 font-medium text-slate-700">{row.mes}</td>
                <td className="py-2 px-3 text-right text-slate-800">{row.extratos > 0 ? formatBRL(row.extratos) : '—'}</td>
                <td className="py-2 px-3 text-right text-orange-600">{row.transferencias_internas > 0 ? formatBRL(row.transferencias_internas) : '—'}</td>
                <td className="py-2 px-3 text-right text-blue-700">{row.notas > 0 ? formatBRL(row.notas) : '—'}</td>
                <td className={`py-2 px-3 text-right font-semibold ${Math.abs(row.diferenca) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                  {Math.abs(row.diferenca) < 0.01 ? '✓' : formatBRL(row.diferenca)}
                </td>
                <td className="py-2 px-3 text-right text-amber-600">{row.sem_rubrica || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-3">Total aprovado por rubrica</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.rubricaData} layout="vertical" margin={{ left: 20, right: 25 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={formatAxis} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="rubrica" width={150} tick={{ fontSize: 10 }} />
                <Tooltip formatter={value => formatBRL(value)} />
                <Bar dataKey="total" name="Aprovado" fill="#334155" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-600 mb-3">Débitos operacionais × notas fiscais aprovadas</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.comparisonData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={formatAxis} tick={{ fontSize: 10 }} />
                <Tooltip formatter={value => formatBRL(value)} />
                <Legend />
                <Bar dataKey="extratos" name="Débitos operacionais" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="notas" name="Notas aprovadas" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}