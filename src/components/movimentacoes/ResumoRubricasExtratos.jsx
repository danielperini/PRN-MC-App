import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { AlertTriangle, CheckCircle2, FileText, Landmark } from 'lucide-react';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function number(value) {
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

function purchaseValue(purchase) {
  return number(purchase?.valor_pago)
    || number(purchase?.valor_aprovado_admin)
    || number(purchase?.valor_aprovado)
    || number(purchase?.valor_final)
    || number(purchase?.valor_solicitado)
    || number(purchase?.valor_total)
    || number(purchase?.valor)
    || number(purchase?.rubrica_debitada_valor)
    || 0;
}

function rubricaId(purchase) {
  return purchase?.rubrica_id
    || purchase?.budgetline_id
    || purchase?.budget_line_id
    || purchase?.linha_orcamentaria_id
    || purchase?.rubrica?.id
    || null;
}

function rubricaName(purchase, rubricaById) {
  const id = rubricaId(purchase);
  const rubrica = id ? rubricaById.get(String(id)) : null;
  return purchase?.rubrica_nome
    || purchase?.rubrica
    || purchase?.budgetline_nome
    || purchase?.linha_orcamentaria_nome
    || rubrica?.nome
    || rubrica?.titulo
    || rubrica?.descricao
    || 'Sem rubrica vinculada';
}

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
  }).format(number(value));
}

function formatAxis(value) {
  const amount = number(value);
  if (Math.abs(amount) >= 1_000_000) return `R$ ${(amount / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(amount) >= 1_000) return `R$ ${(amount / 1_000).toFixed(0)} mil`;
  return `R$ ${amount.toFixed(0)}`;
}

function monthKeyFromPurchase(purchase) {
  const raw = purchase?.data_pagamento || purchase?.paid_at || purchase?.nf_data_emissao || purchase?.data_emissao || purchase?.created_date;
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
    const uniqueFiscal = new Map();

    (purchases || []).forEach(purchase => {
      const status = normalize(purchase?.status).toUpperCase();
      if (!STATUS_APROVADOS.has(status)) return;
      const key = fiscalKey(purchase);
      if (!key || uniqueFiscal.has(key)) return;
      uniqueFiscal.set(key, purchase);
    });

    const approved = Array.from(uniqueFiscal.values());
    const byRubrica = new Map();
    approved.forEach(purchase => {
      const name = rubricaName(purchase, rubricaById);
      byRubrica.set(name, number(byRubrica.get(name)) + purchaseValue(purchase));
    });

    const rubricaData = Array.from(byRubrica.entries())
      .map(([rubrica, total]) => ({ rubrica, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const bankDebitsByMonth = new Map();
    movimentacoes
      .filter(record => record?.tipo === 'extrato_conta')
      .forEach(record => {
        const key = `${record.ano}-${String(record.mes_num || 0).padStart(2, '0')}`;
        bankDebitsByMonth.set(key, number(bankDebitsByMonth.get(key)) + number(record.total_debitos));
      });

    const approvedByMonth = new Map();
    approved.forEach(purchase => {
      const key = monthKeyFromPurchase(purchase);
      if (!key) return;
      approvedByMonth.set(key, number(approvedByMonth.get(key)) + purchaseValue(purchase));
    });

    const monthKeys = Array.from(new Set([...bankDebitsByMonth.keys(), ...approvedByMonth.keys()])).sort();
    const comparisonData = monthKeys.slice(-12).map(key => {
      const [year, month] = key.split('-');
      const extratos = number(bankDebitsByMonth.get(key));
      const notas = number(approvedByMonth.get(key));
      return {
        key,
        mes: `${month}/${String(year).slice(-2)}`,
        extratos,
        notas,
        diferenca: extratos - notas,
      };
    });

    const totalBank = comparisonData.reduce((sum, item) => sum + item.extratos, 0);
    const totalFiscal = comparisonData.reduce((sum, item) => sum + item.notas, 0);

    return {
      rubricaData,
      comparisonData,
      totalBank,
      totalFiscal,
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
          <p className="text-xs text-slate-500">Comparação entre débitos dos extratos e notas fiscais aprovadas, sem duplicar documentos.</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${reconciled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {reconciled ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {reconciled ? 'Conciliação fechada' : 'Diferença a conciliar'}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Landmark className="w-4 h-4 text-slate-600 mb-2" />
          <p className="text-[10px] text-slate-500">Débitos nos extratos</p>
          <p className="text-base font-bold text-slate-900">{formatBRL(summary.totalBank)}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <FileText className="w-4 h-4 text-blue-600 mb-2" />
          <p className="text-[10px] text-blue-500">Notas fiscais aprovadas</p>
          <p className="text-base font-bold text-blue-800">{formatBRL(summary.totalFiscal)}</p>
        </div>
        <div className={`rounded-xl border p-3 ${summary.difference === 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <AlertTriangle className={`w-4 h-4 mb-2 ${summary.difference === 0 ? 'text-green-600' : 'text-amber-600'}`} />
          <p className="text-[10px] text-slate-500">Diferença</p>
          <p className="text-base font-bold text-slate-900">{formatBRL(summary.difference)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <FileText className="w-4 h-4 text-slate-600 mb-2" />
          <p className="text-[10px] text-slate-500">Documentos fiscais únicos</p>
          <p className="text-base font-bold text-slate-900">{summary.approvedCount}</p>
          {summary.withoutRubrica > 0 && <p className="text-[10px] text-amber-600 mt-1">{summary.withoutRubrica} sem rubrica</p>}
        </div>
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
          <p className="text-xs font-semibold text-slate-600 mb-3">Extratos x notas fiscais aprovadas</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.comparisonData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={formatAxis} tick={{ fontSize: 10 }} />
                <Tooltip formatter={value => formatBRL(value)} />
                <Legend />
                <Bar dataKey="extratos" name="Débitos dos extratos" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="notas" name="Notas aprovadas" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
