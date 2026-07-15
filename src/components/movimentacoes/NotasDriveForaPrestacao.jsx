import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ExternalLink, FileText, Search, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ALVO_CONCILIACAO = 44350.03;
const TOLERANCIA = 0.01;

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function numberBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.abs(value) : 0;
  const text = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '');
  const parsed = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}
function data(item) { return item?.data || item || {}; }
function result(item) { const d = data(item); return d?.resultado_ia || item?.resultado_ia || {}; }
function valueOf(item) {
  const d = data(item); const ia = result(item);
  return numberBR(d.nf_valor_liquido ?? d.nf_valor_total ?? d.valor_liquido ?? d.valor_total ?? d.valor ?? item?.nf_valor_total ?? ia.nf_valor_liquido ?? ia.nf_valor_total);
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
function supplierName(item) {
  const d = data(item); const ia = result(item);
  return d.nf_emitente_nome || d.fornecedor_nome || item?.fornecedor_nome || ia.nf_emitente_nome || 'Fornecedor não identificado';
}
function invoiceDate(item) {
  const d = data(item); const ia = result(item);
  return d.nf_data_emissao || d.data_emissao || item?.nf_data_emissao || ia.nf_data_emissao || item?.created_date || '';
}
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
function pdfUrl(item) {
  const d = data(item); const ia = result(item);
  return d.arquivo_original_url || d.nota_fiscal_url || d.nf_pdf_url || item?.arquivo_original_url || item?.nota_fiscal_url || ia.drive_pdf_url || ia.arquivos_fiscais?.pdf || '';
}
function fmt(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)); }
function isInternalBankMovement(launch) {
  const text = normalize([launch?.descricao, launch?.historico, launch?.categoria, launch?.categoria_fluxo].filter(Boolean).join(' '));
  return launch?.transferencia_interna === true || /\bresg(ate| aut| automat)?\b/.test(text) || /\baplic(acao| automat| financeira)?\b/.test(text) || ['transferencia entre contas', 'conta investimento', 'investimento para conta corrente', 'conta corrente para investimento'].some(term => text.includes(term));
}
function isOperationalDebit(launch) {
  if (isInternalBankMovement(launch)) return false;
  const type = normalize(launch?.tipo || launch?.tipo_sugerido);
  const text = normalize([launch?.descricao, launch?.historico].filter(Boolean).join(' '));
  return type.includes('deb') || ['deb pix', 'envio ted', 'envio tev', 'envio transf', 'pag boleto', 'pagamento', 'tarifa'].some(term => text.includes(term));
}
function bankRows(records = []) {
  return records.flatMap(record => (record?.lancamentos || []).map((launch, index) => ({
    id: `${record.id || record.drive_file_id}-${index}`,
    recordId: record.id,
    date: launch.data || '',
    month: monthKey(launch.data || `${record.ano || ''}-${String(record.mes_num || '').padStart(2, '0')}`),
    description: launch.descricao || launch.historico || 'Lançamento sem descrição',
    value: numberBR(launch.valor),
    operational: isOperationalDebit(launch),
    internal: isInternalBankMovement(launch),
  }))).filter(row => row.operational && row.value > 0);
}
function supplierTokens(name) {
  return normalize(name).split(' ').filter(token => token.length >= 4 && !['ltda', 'eireli', 'servicos', 'producoes'].includes(token));
}
function findBankMatch(invoice, rows, used) {
  const value = valueOf(invoice); const month = monthKey(invoiceDate(invoice)); const tokens = supplierTokens(supplierName(invoice));
  const candidates = rows.filter(row => !used.has(row.id) && Math.abs(row.value - value) <= TOLERANCIA);
  const scored = candidates.map(row => {
    const description = normalize(row.description);
    const supplierScore = tokens.filter(token => description.includes(token)).length;
    const monthScore = month !== 'sem-mes' && row.month === month ? 3 : 0;
    return { row, score: supplierScore * 2 + monthScore };
  }).sort((a, b) => b.score - a.score || String(a.row.date).localeCompare(String(b.row.date)));
  if (!scored.length) return null;
  const best = scored[0];
  const ambiguous = scored.length > 1 && best.score === scored[1].score;
  return { ...best.row, ambiguous };
}

export default function NotasDriveForaPrestacao() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [driveFolderId, setDriveFolderId] = useState(() => localStorage.getItem('auditoria:notas-drive-folder-id') || '');

  const { data: intakes = [], isLoading: loadingIntakes } = useQuery({ queryKey: ['notas-drive-conciliacao-prestacao'], queryFn: () => base44.entities.DocumentIntake.list('-created_date', 5000), staleTime: 120000 });
  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({ queryKey: ['purchase-requests-conciliacao-drive'], queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 5000), staleTime: 120000 });
  const { data: bank = [], isLoading: loadingBank } = useQuery({ queryKey: ['movimentacoes-conciliacao-notas'], queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 5000), staleTime: 120000 });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!driveFolderId.trim()) throw new Error('Informe o ID da pasta do Google Drive.');
      localStorage.setItem('auditoria:notas-drive-folder-id', driveFolderId.trim());
      const response = await base44.functions.invoke('syncNotasFiscaisDrive', { folder_id: driveFolderId.trim() });
      const payload = response?.data || response || {};
      if (payload.success === false || payload.ok === false) throw new Error(payload.error || 'Falha ao sincronizar notas fiscais.');
      return payload;
    },
    onSuccess: async payload => {
      await queryClient.invalidateQueries({ queryKey: ['notas-drive-conciliacao-prestacao'] });
      toast.success(`${payload.importadas || 0} nota(s) importadas e ${payload.existentes || 0} já existentes.`);
    },
    onError: error => toast.error(`Sincronização do Drive: ${error?.message || error}`),
  });

  const summary = useMemo(() => {
    const accounted = new Set((purchases || []).map(fiscalKey));
    const uniqueDrive = new Map();
    (intakes || []).filter(isInvoice).forEach(item => {
      const status = normalize(item?.status_processamento);
      if (status.includes('arquivado') || status.includes('rejeitado')) return;
      const key = fiscalKey(item); const current = uniqueDrive.get(key);
      if (!current || String(item?.updated_date || '') > String(current?.updated_date || '')) uniqueDrive.set(key, item);
    });
    const missing = [...uniqueDrive.entries()].filter(([key]) => !accounted.has(key)).map(([, item]) => item).sort((a, b) => valueOf(b) - valueOf(a));
    const bankLaunches = bankRows(bank);
    const usedBank = new Set();
    const reconciled = (purchases || []).filter(item => valueOf(item) > 0).map(invoice => {
      const match = findBankMatch(invoice, bankLaunches, usedBank);
      if (match && !match.ambiguous) usedBank.add(match.id);
      return { invoice, match, status: !match ? 'sem_lancamento' : match.ambiguous ? 'ambiguo' : 'conciliado' };
    });
    const unmatchedBank = bankLaunches.filter(row => !usedBank.has(row.id));
    const missingByMonth = missing.reduce((map, item) => {
      const key = monthKey(invoiceDate(item));
      if (!map.has(key)) map.set(key, { key, label: monthLabel(key), count: 0, total: 0 });
      const row = map.get(key); row.count += 1; row.total += valueOf(item); return map;
    }, new Map());
    const total = missing.reduce((sum, item) => sum + valueOf(item), 0);
    return { missing, total, matchesTarget: Math.abs(total - ALVO_CONCILIACAO) <= TOLERANCIA, reconciled, unmatchedBank, missingByMonth: [...missingByMonth.values()].sort((a, b) => a.key.localeCompare(b.key)) };
  }, [intakes, purchases, bank]);

  const filteredReconciled = useMemo(() => {
    const term = normalize(search); const searchedValue = numberBR(search);
    if (!term) return summary.reconciled;
    return summary.reconciled.filter(({ invoice, match }) => {
      const valueMatch = searchedValue > 0 && (Math.abs(valueOf(invoice) - searchedValue) <= TOLERANCIA || Math.abs(Number(match?.value || 0) - searchedValue) <= TOLERANCIA);
      const text = normalize([supplierName(invoice), invoiceNumber(invoice), match?.description].join(' '));
      return valueMatch || text.includes(term);
    });
  }, [summary.reconciled, search]);

  if (loadingIntakes || loadingPurchases || loadingBank) return null;

  return (
    <section className="space-y-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><AlertTriangle className="h-5 w-5 text-amber-600" /> Reconciliação de notas, Drive e extratos</h2><p className="mt-1 text-xs text-slate-500">Comparação por chave fiscal, fornecedor, valor e competência bancária.</p></div>
        <div className={`rounded-xl border px-4 py-2 text-right ${summary.matchesTarget ? 'border-red-400 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-[10px] uppercase tracking-wide text-slate-500">Notas no Drive fora da prestação</p><p className="font-bold text-slate-900">{fmt(summary.total)}</p>{summary.matchesTarget && <p className="text-[10px] font-bold text-red-700">Discrepância R$ 44.350,03 localizada</p>}</div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por fornecedor, número da NF ou valor (ex.: 44.350,03)" /></div>
        <Input value={driveFolderId} onChange={event => setDriveFolderId(event.target.value)} placeholder="ID da pasta de notas fiscais no Google Drive" />
        <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-2"><RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} /> Sincronizar Drive</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-green-50 p-3"><p className="text-xs text-green-700">Conciliadas</p><p className="text-xl font-bold text-green-800">{summary.reconciled.filter(row => row.status === 'conciliado').length}</p></div>
        <div className="rounded-xl border bg-red-50 p-3"><p className="text-xs text-red-700">Notas sem lançamento bancário</p><p className="text-xl font-bold text-red-800">{summary.reconciled.filter(row => row.status === 'sem_lancamento').length}</p></div>
        <div className="rounded-xl border bg-amber-50 p-3"><p className="text-xs text-amber-700">Lançamentos sem nota associada</p><p className="text-xl font-bold text-amber-800">{summary.unmatchedBank.length}</p></div>
      </div>

      <div><h3 className="mb-2 text-sm font-bold text-slate-900">Meses com notas faltantes na prestação</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{summary.missingByMonth.map(row => <div key={row.key} className="rounded-lg border bg-slate-50 p-3"><p className="text-xs capitalize text-slate-600">{row.label}</p><p className="font-bold text-slate-900">{row.count} nota(s)</p><p className="text-xs text-red-700">{fmt(row.total)}</p></div>)}{summary.missingByMonth.length === 0 && <p className="text-xs text-green-700">Nenhuma nota do Drive está faltando na prestação.</p>}</div></div>

      <div><h3 className="mb-2 text-sm font-bold text-slate-900">Banco × notas fiscais</h3><div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Banco: data e descrição</th><th className="px-3 py-2 text-right">Valor banco</th><th className="px-3 py-2 text-left">Nota / fornecedor</th><th className="px-3 py-2 text-right">Valor NF</th><th className="px-3 py-2 text-center">Status</th></tr></thead><tbody className="divide-y">{filteredReconciled.map(({ invoice, match, status }) => { const target = Math.abs(valueOf(invoice) - ALVO_CONCILIACAO) <= TOLERANCIA; return <tr key={fiscalKey(invoice)} className={target ? 'bg-red-50' : ''}><td className="px-3 py-2">{match ? `${match.date || 'Sem data'} · ${match.description}` : 'Nenhum lançamento do mesmo valor localizado'}</td><td className="px-3 py-2 text-right font-semibold">{match ? fmt(match.value) : '—'}</td><td className="px-3 py-2"><p className="font-semibold">NF {invoiceNumber(invoice) || 'sem número'} · {supplierName(invoice)}</p><p className="text-[10px] text-slate-500">{monthLabel(monthKey(invoiceDate(invoice)))}</p></td><td className={`px-3 py-2 text-right font-bold ${target ? 'text-red-700' : ''}`}>{fmt(valueOf(invoice))}</td><td className="px-3 py-2 text-center">{status === 'conciliado' ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3 w-3" /> Conciliado</span> : status === 'ambiguo' ? <span className="text-amber-700">Revisar: múltiplos lançamentos</span> : <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-3 w-3" /> Sem associação</span>}</td></tr>; })}</tbody></table></div></div>

      <div><h3 className="mb-2 text-sm font-bold text-slate-900">Notas no Drive fora da prestação de contas</h3>{summary.missing.length === 0 ? <p className="rounded-xl bg-green-50 p-3 text-xs font-semibold text-green-700">Nenhuma nota fiscal do Drive ficou sem vínculo.</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Mês</th><th className="px-3 py-2 text-left">Nota</th><th className="px-3 py-2 text-left">Fornecedor</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-right">Arquivo</th></tr></thead><tbody className="divide-y">{summary.missing.map(item => { const url = pdfUrl(item); const target = Math.abs(valueOf(item) - ALVO_CONCILIACAO) <= TOLERANCIA; return <tr key={fiscalKey(item)} className={target ? 'bg-red-50' : ''}><td className="px-3 py-2 capitalize">{monthLabel(monthKey(invoiceDate(item)))}</td><td className="px-3 py-2 font-semibold">{invoiceNumber(item) || 'Sem número'}</td><td className="px-3 py-2">{supplierName(item)}</td><td className={`px-3 py-2 text-right font-bold ${target ? 'text-red-700' : ''}`}>{fmt(valueOf(item))}</td><td className="px-3 py-2 text-right">{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700"><ExternalLink className="h-3 w-3" /> Abrir</a> : <span className="inline-flex items-center gap-1 text-slate-400"><FileText className="h-3 w-3" /> Sem link</span>}</td></tr>; })}</tbody></table></div>}</div>
    </section>
  );
}
