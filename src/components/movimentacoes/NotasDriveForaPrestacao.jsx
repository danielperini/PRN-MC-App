import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, RefreshCw, Search, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const TARGET = 44350.03;
const TOLERANCE = 0.01;

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const digits = (value) => String(value || '').replace(/\D/g, '');

function amount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.abs(value) : 0;
  const text = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '');
  const parsed = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

const payload = (item) => item?.data || item || {};
const ai = (item) => payload(item)?.resultado_ia || item?.resultado_ia || {};
function invoiceValue(item) { const d = payload(item); const r = ai(item); return amount(d.nf_valor_liquido ?? d.nf_valor_total ?? d.valor_liquido ?? d.valor_total ?? d.valor ?? item?.nf_valor_total ?? r.nf_valor_liquido ?? r.nf_valor_total); }
function invoiceNumber(item) { const d = payload(item); const r = ai(item); return digits(d.nf_numero || d.numero_nota || d.numero_nf || item?.nf_numero || r.nf_numero); }
function supplierDoc(item) { const d = payload(item); const r = ai(item); return digits(d.nf_emitente_cpf_cnpj || d.fornecedor_cpf_cnpj || d.cnpj_fornecedor || item?.fornecedor_cpf_cnpj || r.nf_emitente_cpf_cnpj); }
function supplierName(item) { const d = payload(item); const r = ai(item); return d.nf_emitente_nome || d.fornecedor_nome || item?.fornecedor_nome || r.nf_emitente_nome || 'Fornecedor não identificado'; }
function invoiceDate(item) { const d = payload(item); const r = ai(item); return d.nf_data_emissao || d.data_emissao || item?.nf_data_emissao || r.nf_data_emissao || item?.created_date || ''; }
function accessKey(item) { const d = payload(item); const r = ai(item); return digits(d.nf_chave_acesso || d.chave_acesso || item?.nf_chave_acesso || r.nf_chave_acesso); }

function monthKey(value) {
  const text = String(value || '');
  const iso = text.match(/(20\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  return br ? `${br[3]}-${String(br[2]).padStart(2, '0')}` : 'sem-mes';
}

function monthLabel(key) {
  if (key === 'sem-mes') return 'Sem mês identificado';
  const [year, month] = key.split('-');
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(Number(year), Number(month) - 1, 1));
}

function fiscalKey(item) {
  const key = accessKey(item);
  if (key.length >= 44) return `chave:${key}`;
  const nf = invoiceNumber(item);
  const doc = supplierDoc(item);
  const value = invoiceValue(item).toFixed(2);
  if (nf && doc) return `nf:${nf}:${doc}`;
  if (nf && value !== '0.00') return `nf-valor:${nf}:${value}`;
  const d = payload(item);
  const url = d.arquivo_original_url || d.nota_fiscal_url || d.nf_pdf_url || item?.arquivo_original_url || item?.nota_fiscal_url;
  return url ? `url:${url}` : `id:${item?.id}`;
}

function reactKey(item, index, prefix) {
  return `${prefix}:${fiscalKey(item)}:${item?.id || item?._id || index}`;
}

function isInvoice(item) {
  const d = payload(item);
  const r = ai(item);
  const name = normalize(d.file_name_final || d.file_name_original || item?.file_name_final || item?.file_name_original);
  const type = normalize(d.tipo_detectado || item?.tipo_detectado || r.tipo_documento);
  if (['extrato', 'rendimento', 'comprovante', 'recibo', 'devolucao', 'estorno', 'contrato', 'aditivo', 'orcamento'].some((term) => name.includes(term))) return false;
  return type.includes('nota') || type.includes('nf') || !!invoiceNumber(item) || accessKey(item).length >= 44 || /\bnf\b/.test(name);
}

function pdfUrl(item) { const d = payload(item); const r = ai(item); return d.arquivo_original_url || d.nota_fiscal_url || d.nf_pdf_url || item?.arquivo_original_url || item?.nota_fiscal_url || r.drive_pdf_url || r.arquivos_fiscais?.pdf || ''; }
const fmt = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
function isInternal(launch) { const text = normalize([launch?.descricao, launch?.historico, launch?.categoria, launch?.categoria_fluxo].filter(Boolean).join(' ')); return launch?.transferencia_interna === true || /\bresg(ate| aut| automat)?\b/.test(text) || /\baplic(acao| automat| financeira)?\b/.test(text) || text.includes('transferencia entre contas'); }
function isDebit(launch) { if (isInternal(launch)) return false; const type = normalize(launch?.tipo || launch?.tipo_sugerido); const text = normalize([launch?.descricao, launch?.historico].filter(Boolean).join(' ')); return type.includes('deb') || ['deb pix', 'envio ted', 'envio tev', 'envio transf', 'pag boleto', 'pagamento', 'tarifa'].some((term) => text.includes(term)); }

function bankRows(records = []) {
  return records
    .flatMap((record) => (record?.lancamentos || []).map((launch, index) => ({
      id: `${record.id || record.drive_file_id}-${index}`,
      date: launch.data || '',
      month: monthKey(launch.data || `${record.ano || ''}-${String(record.mes_num || '').padStart(2, '0')}`),
      description: launch.descricao || launch.historico || 'Lançamento sem descrição',
      value: amount(launch.valor),
      launch,
    })))
    .filter((row) => row.value > 0 && isDebit(row.launch));
}

function findMatch(invoice, rows, used) {
  const value = invoiceValue(invoice);
  const month = monthKey(invoiceDate(invoice));
  const tokens = normalize(supplierName(invoice)).split(' ').filter((token) => token.length >= 4);
  const ranked = rows
    .filter((row) => !used.has(row.id) && Math.abs(row.value - value) <= TOLERANCE)
    .map((row) => ({ row, score: (row.month === month ? 3 : 0) + tokens.filter((token) => normalize(row.description).includes(token)).length * 2 }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  return { ...ranked[0].row, ambiguous: ranked.length > 1 && ranked[0].score === ranked[1].score };
}

export default function NotasDriveForaPrestacao() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [driveFolderId, setDriveFolderId] = useState(() => localStorage.getItem('auditoria:notas-drive-folder-id') || '');

  const { data: intakes = [], isLoading: l1 } = useQuery({ queryKey: ['notas-drive-conciliacao-prestacao'], queryFn: () => base44.entities.DocumentIntake.list('-created_date', 5000), staleTime: 120000 });
  const { data: purchases = [], isLoading: l2 } = useQuery({ queryKey: ['purchase-requests-conciliacao-drive'], queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 5000), staleTime: 120000 });
  const { data: bank = [], isLoading: l3 } = useQuery({ queryKey: ['movimentacoes-conciliacao-notas'], queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 5000), staleTime: 120000 });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!driveFolderId.trim()) throw new Error('Informe o ID da pasta do Google Drive.');
      localStorage.setItem('auditoria:notas-drive-folder-id', driveFolderId.trim());
      const response = await base44.functions.invoke('syncNotasFiscaisDrive', { folder_id: driveFolderId.trim() });
      const result = response?.data || response || {};
      if (result.success === false || result.ok === false) throw new Error(result.error || 'Falha ao sincronizar notas fiscais.');
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['notas-drive-conciliacao-prestacao'] });
      toast.success(`${result.importadas || 0} nota(s) importadas e ${result.existentes || 0} já existentes.`);
    },
    onError: (error) => toast.error(`Sincronização do Drive: ${error?.message || error}`),
  });

  const summary = useMemo(() => {
    const accounted = new Set(purchases.map(fiscalKey));
    const unique = new Map();
    intakes.filter(isInvoice).forEach((item) => {
      const status = normalize(item?.status_processamento);
      if (status.includes('arquivado') || status.includes('rejeitado')) return;
      const key = fiscalKey(item);
      const current = unique.get(key);
      if (!current || String(item?.updated_date || '') > String(current?.updated_date || '')) unique.set(key, item);
    });
    const missing = [...unique.entries()].filter(([key]) => !accounted.has(key)).map(([, item]) => item).sort((a, b) => invoiceValue(b) - invoiceValue(a));
    const rows = bankRows(bank);
    const used = new Set();
    const reconciled = purchases.filter((item) => invoiceValue(item) > 0).map((invoice) => {
      const match = findMatch(invoice, rows, used);
      if (match && !match.ambiguous) used.add(match.id);
      return { invoice, match, status: !match ? 'sem_lancamento' : match.ambiguous ? 'ambiguo' : 'conciliado' };
    });
    const byMonth = new Map();
    missing.forEach((item) => {
      const key = monthKey(invoiceDate(item));
      if (!byMonth.has(key)) byMonth.set(key, { key, label: monthLabel(key), count: 0, total: 0 });
      const row = byMonth.get(key);
      row.count += 1;
      row.total += invoiceValue(item);
    });
    const total = missing.reduce((sum, item) => sum + invoiceValue(item), 0);
    const exactBankTarget = rows.filter((row) => Math.abs(row.value - TARGET) <= TOLERANCE);
    const exactInvoiceTarget = [...missing, ...purchases].filter((item) => Math.abs(invoiceValue(item) - TARGET) <= TOLERANCE);
    return { missing, reconciled, unmatchedBank: rows.filter((row) => !used.has(row.id)), byMonth: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)), total, aggregateMatchesTarget: Math.abs(total - TARGET) <= TOLERANCE, exactBankTarget, exactInvoiceTarget };
  }, [intakes, purchases, bank]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    const value = amount(search);
    if (!term) return summary.reconciled;
    return summary.reconciled.filter(({ invoice, match }) => (value > 0 && (Math.abs(invoiceValue(invoice) - value) <= TOLERANCE || Math.abs(Number(match?.value || 0) - value) <= TOLERANCE)) || normalize([supplierName(invoice), invoiceNumber(invoice), match?.description].join(' ')).includes(term));
  }, [summary.reconciled, search]);

  if (l1 || l2 || l3) return null;

  return (
    <section className="space-y-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-base font-bold"><AlertTriangle className="h-5 w-5 text-amber-600" /> Reconciliação de notas, Drive e extratos</h2><p className="mt-1 text-xs text-slate-500">A competência bancária vem da data de cada lançamento, nunca do mês da pasta de importação.</p></div>
        <div className={`rounded-xl border px-4 py-2 text-right ${summary.aggregateMatchesTarget ? 'border-red-400 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-[10px] uppercase text-slate-500">Total agregado de notas faltantes</p><p className="font-bold">{fmt(summary.total)}</p>{summary.aggregateMatchesTarget && <p className="text-[10px] font-bold text-red-700">R$ 44.350,03 é soma agregada, não uma nota individual</p>}</div>
      </div>

      <div className={`rounded-xl border p-4 text-sm ${summary.exactBankTarget.length || summary.exactInvoiceTarget.length ? 'border-red-300 bg-red-50' : 'border-blue-200 bg-blue-50'}`}><p className="font-bold">Diagnóstico de R$ 44.350,03</p><p className="mt-1 text-xs">{summary.exactBankTarget.length ? `${summary.exactBankTarget.length} lançamento(s) bancário(s) individual(is) encontrado(s).` : 'Nenhum lançamento bancário individual de R$ 44.350,03 foi encontrado.'} {summary.exactInvoiceTarget.length ? `${summary.exactInvoiceTarget.length} nota(s) individual(is) com esse valor foram encontradas.` : 'Nenhuma nota individual com esse valor foi encontrada.'}</p></div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar fornecedor, NF ou valor" /></div><Input value={driveFolderId} onChange={(event) => setDriveFolderId(event.target.value)} placeholder="ID da pasta de notas fiscais no Google Drive" /><Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-2"><RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} /> Sincronizar Drive</Button></div>

      <div><h3 className="mb-2 text-sm font-bold">Meses com notas faltantes</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{summary.byMonth.map((row) => <div key={row.key} className="rounded-lg border bg-slate-50 p-3"><p className="text-xs capitalize text-slate-600">{row.label}</p><p className="font-bold">{row.count} nota(s)</p><p className="text-xs text-red-700">{fmt(row.total)}</p></div>)}{!summary.byMonth.length && <p className="text-xs text-green-700">Nenhuma nota faltante.</p>}</div></div>

      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Banco</th><th className="px-3 py-2 text-right">Valor banco</th><th className="px-3 py-2 text-left">Nota / fornecedor</th><th className="px-3 py-2 text-right">Valor NF</th><th className="px-3 py-2 text-center">Status</th></tr></thead><tbody className="divide-y">{filtered.map(({ invoice, match, status }, index) => <tr key={reactKey(invoice, index, 'conciliada')}><td className="px-3 py-2">{match ? `${match.date || 'Sem data'} · ${match.description}` : 'Nenhum lançamento do mesmo valor'}</td><td className="px-3 py-2 text-right">{match ? fmt(match.value) : '—'}</td><td className="px-3 py-2"><p className="font-semibold">NF {invoiceNumber(invoice) || 'sem número'} · {supplierName(invoice)}</p><p className="text-[10px] capitalize text-slate-500">{monthLabel(monthKey(invoiceDate(invoice)))}</p></td><td className="px-3 py-2 text-right font-bold">{fmt(invoiceValue(invoice))}</td><td className="px-3 py-2 text-center">{status === 'conciliado' ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3 w-3" /> Conciliado</span> : status === 'ambiguo' ? <span className="text-amber-700">Revisar duplicidade de valor</span> : <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-3 w-3" /> Sem associação</span>}</td></tr>)}</tbody></table></div>

      <div><h3 className="mb-2 text-sm font-bold">Notas no Drive fora da prestação</h3>{!summary.missing.length ? <p className="rounded-xl bg-green-50 p-3 text-xs font-semibold text-green-700">Nenhuma nota ficou sem vínculo.</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Mês correto</th><th className="px-3 py-2 text-left">Nota</th><th className="px-3 py-2 text-left">Fornecedor</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-right">Arquivo</th></tr></thead><tbody className="divide-y">{summary.missing.map((item, index) => { const url = pdfUrl(item); return <tr key={reactKey(item, index, 'faltante')}><td className="px-3 py-2 capitalize">{monthLabel(monthKey(invoiceDate(item)))}</td><td className="px-3 py-2 font-semibold">{invoiceNumber(item) || 'Sem número'}</td><td className="px-3 py-2">{supplierName(item)}</td><td className="px-3 py-2 text-right font-bold">{fmt(invoiceValue(item))}</td><td className="px-3 py-2 text-right">{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700"><ExternalLink className="h-3 w-3" /> Abrir</a> : <span className="inline-flex items-center gap-1 text-slate-400"><FileText className="h-3 w-3" /> Sem link</span>}</td></tr>; })}</tbody></table></div>}</div>
    </section>
  );
}
