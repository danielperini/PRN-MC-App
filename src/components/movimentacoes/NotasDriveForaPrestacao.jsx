import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ExternalLink, FileText } from 'lucide-react';

const ALVO_CONCILIACAO = 44350.03;

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function numberBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '');
  const parsed = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
  return Number.isFinite(parsed) ? parsed : 0;
}
function data(item) { return item?.data || item || {}; }
function result(item) { const d = data(item); return d?.resultado_ia || item?.resultado_ia || {}; }
function valueOf(item) {
  const d = data(item); const ia = result(item);
  return Math.abs(numberBR(d.nf_valor_liquido ?? d.nf_valor_total ?? d.valor_liquido ?? d.valor_total ?? d.valor ?? item?.nf_valor_total ?? ia.nf_valor_liquido ?? ia.nf_valor_total));
}
function invoiceNumber(item) {
  const d = data(item); const ia = result(item);
  return digits(d.nf_numero || d.numero_nota || d.numero_nf || item?.nf_numero || ia.nf_numero);
}
function supplierDocument(item) {
  const d = data(item); const ia = result(item);
  return digits(d.nf_emitente_cpf_cnpj || d.fornecedor_cpf_cnpj || d.cnpj_fornecedor || item?.fornecedor_cpf_cnpj || ia.nf_emitente_cpf_cnpj);
}
function accessKey(item) {
  const d = data(item); const ia = result(item);
  return digits(d.nf_chave_acesso || d.chave_acesso || item?.nf_chave_acesso || ia.nf_chave_acesso);
}
function fiscalKey(item) {
  const key = accessKey(item);
  if (key.length >= 44) return `chave:${key}`;
  const nf = invoiceNumber(item); const cnpj = supplierDocument(item); const value = valueOf(item).toFixed(2);
  if (nf && cnpj) return `nf:${nf}:${cnpj}`;
  if (nf && value !== '0.00') return `nf-valor:${nf}:${value}`;
  const d = data(item);
  const url = d.arquivo_original_url || d.nota_fiscal_url || d.nf_pdf_url || item?.arquivo_original_url || item?.nota_fiscal_url;
  return url ? `url:${url}` : `id:${item?.id}`;
}
function isInvoice(item) {
  const d = data(item); const ia = result(item);
  const name = normalize(d.file_name_final || d.file_name_original || item?.file_name_final || item?.file_name_original);
  const type = normalize(d.tipo_detectado || item?.tipo_detectado || ia.tipo_documento);
  if (['extrato', 'rendimento', 'comprovante', 'recibo', 'devolucao', 'estorno', 'contrato', 'aditivo', 'orcamento'].some(term => name.includes(term))) return false;
  return type.includes('nota') || type.includes('nf') || !!invoiceNumber(item) || accessKey(item).length >= 44 || /\bnf\b/.test(name);
}
function supplierName(item) {
  const d = data(item); const ia = result(item);
  return d.nf_emitente_nome || d.fornecedor_nome || item?.fornecedor_nome || ia.nf_emitente_nome || 'Fornecedor não identificado';
}
function pdfUrl(item) {
  const d = data(item); const ia = result(item);
  return d.arquivo_original_url || d.nota_fiscal_url || d.nf_pdf_url || item?.arquivo_original_url || item?.nota_fiscal_url || ia.drive_pdf_url || ia.arquivos_fiscais?.pdf || '';
}
function fmt(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)); }

export default function NotasDriveForaPrestacao() {
  const { data: intakes = [], isLoading: loadingIntakes } = useQuery({
    queryKey: ['notas-drive-conciliacao-prestacao'],
    queryFn: () => base44.entities.DocumentIntake.list('-created_date', 5000),
    staleTime: 120000,
  });
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['purchase-requests-conciliacao-drive'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 5000),
    staleTime: 120000,
  });

  const summary = useMemo(() => {
    const accounted = new Set((purchases || []).map(fiscalKey));
    const uniqueDrive = new Map();
    (intakes || []).filter(isInvoice).forEach(item => {
      const status = normalize(item?.status_processamento);
      if (status.includes('arquivado') || status.includes('rejeitado')) return;
      const key = fiscalKey(item);
      const current = uniqueDrive.get(key);
      if (!current || String(item?.updated_date || '') > String(current?.updated_date || '')) uniqueDrive.set(key, item);
    });
    const missing = [...uniqueDrive.entries()].filter(([key]) => !accounted.has(key)).map(([, item]) => item).sort((a, b) => valueOf(b) - valueOf(a));
    const total = missing.reduce((sum, item) => sum + valueOf(item), 0);
    return { missing, total, matchesTarget: Math.abs(total - ALVO_CONCILIACAO) <= 0.01 };
  }, [intakes, purchases]);

  if (loadingIntakes || loadingPurchases) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><AlertTriangle className="h-5 w-5 text-amber-600" /> Notas no Drive fora da prestação de contas</h2>
          <p className="mt-1 text-xs text-slate-500">Comparação determinística por chave de acesso ou NF + CNPJ, sem duplicar PDF/XML.</p>
        </div>
        <div className={`rounded-xl border px-4 py-2 text-right ${summary.matchesTarget ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Total localizado</p>
          <p className="font-bold text-slate-900">{fmt(summary.total)}</p>
          {summary.matchesTarget && <p className="text-[10px] font-semibold text-red-700">Confere com R$ 44.350,03</p>}
        </div>
      </div>

      {summary.missing.length === 0 ? (
        <p className="rounded-xl bg-green-50 p-3 text-xs font-semibold text-green-700">Nenhuma nota fiscal do Drive ficou sem vínculo com a prestação de contas.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Nota</th><th className="px-3 py-2 text-left">Fornecedor</th><th className="px-3 py-2 text-right">Valor líquido</th><th className="px-3 py-2 text-right">Arquivo</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {summary.missing.map(item => {
                const url = pdfUrl(item);
                return <tr key={fiscalKey(item)}><td className="px-3 py-2 font-semibold">{invoiceNumber(item) || 'Sem número'}</td><td className="px-3 py-2">{supplierName(item)}</td><td className="px-3 py-2 text-right font-bold">{fmt(valueOf(item))}</td><td className="px-3 py-2 text-right">{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700"><ExternalLink className="h-3 w-3" /> Abrir</a> : <span className="inline-flex items-center gap-1 text-slate-400"><FileText className="h-3 w-3" /> Sem link</span>}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
