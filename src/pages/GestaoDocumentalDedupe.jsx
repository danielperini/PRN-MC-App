import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileText, FileCode, File, Search, Trash2, ExternalLink, Download, Copy } from 'lucide-react';
import { toast } from 'sonner';

const IMG = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic'];
const TYPE = {
  PDF: { Icon: FileText, cls: 'bg-red-50 text-red-700' },
  XML: { Icon: FileCode, cls: 'bg-blue-50 text-blue-700' },
  RECIBO: { Icon: FileText, cls: 'bg-green-50 text-green-700' },
  DOC: { Icon: File, cls: 'bg-gray-50 text-gray-700' },
};

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function key(v) {
  return norm(v).replace(/[^a-z0-9]/g, '');
}

function num(v) {
  const n = Number(String(v || '').replace(/R\$/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function name(d) {
  return d?.file_name || d?.nf_nome_renomeado || d?.nf_nome_original || 'Documento';
}

function url(d) {
  return d?.file_url || d?.nf_pdf_url || d?.nf_xml_url || d?.comprovante_url || '';
}

function ext(d) {
  return (name(d).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
}

function tipo(d) {
  const m = String(d?.file_type || d?.mime_type || '').toLowerCase();
  const e = ext(d);
  const t = norm(d?.nf_tipo_documento);
  const all = norm([name(d), d?.description, d?.categoria, d?.tipo].filter(Boolean).join(' '));
  if (t === 'xml_nf' || m.includes('xml') || e === 'xml') return 'XML';
  if (all.includes('recibo') || all.includes('comprovante') || all.includes('pagamento') || all.includes('boleto') || all.includes('pix')) return 'RECIBO';
  if (t === 'pdf_nf' || m.includes('pdf') || e === 'pdf') return 'PDF';
  return 'DOC';
}

function isImg(d) {
  return String(d?.file_type || d?.mime_type || '').toLowerCase().startsWith('image/') || IMG.includes(ext(d));
}

function fornecedor(d) {
  return d?.nf_emitente_nome || d?.fornecedor_nome || d?.description || 'Fornecedor não identificado';
}

function dataDoc(d) {
  return d?.nf_data_emissao || d?.competencia || d?.created_date || d?.updated_date || '';
}

function dataFmt(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function mesKey(d) {
  const x = new Date(dataDoc(d));
  return Number.isNaN(x.getTime()) ? 'sem-data' : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

function mesLabel(k) {
  if (k === 'sem-data') return 'Sem data';
  const [a, m] = k.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function ids(d) {
  return [d?.purchase_id, d?.purchase_request_id, d?.purchaseRequestId, d?.solicitacao_id, d?.report_id, d?.nf_pdf_intake_id, d?.nf_xml_intake_id, d?.nf_xml_vinculado_a, d?.nf_pdf_vinculado_a, d?.documento_pai_id, d?.pair_id, d?.par_id, d?.intake_pair_id, d?.entrada_unica_pair_id, d?.comprovante_pdf_id, d?.recibo_pdf_id, d?.pdf_recibo_id, d?.intake_id].filter(Boolean).map(String);
}

function placeholder(d) {
  const n = key(name(d));
  const nf = key(d?.nf_numero || d?.numero_nf || d?.nota_numero || '');
  const f = key(d?.nf_emitente_nome || d?.fornecedor_nome || fornecedor(d));
  const v = num(d?.nf_valor_total || d?.valor_total || d?.valor);
  return n.includes('semnumfornecedormuseuscentro') || ((nf === '' || nf === 'semnum') && f.includes('fornecedor') && v === 0);
}

function baseKey(d) {
  return key(name(d).replace(/\.[^.]+$/, '').replace(/\([0-9]+\)/g, '').replace(/\b(pdf|xml|recibo|comprovante|pagamento|boleto|pix|nfe|nfse|nf|nota|fiscal|museus|centro|servico|serviço|sem|num|fornecedor)\b/gi, ''));
}

function fiscalKey(d) {
  const t = tipo(d);
  if (placeholder(d)) return `placeholder:${t}`;
  const nf = key(d?.nf_numero || d?.numero_nf || d?.nota_numero || '');
  const cnpj = key(d?.nf_emitente_cpf_cnpj || d?.fornecedor_cpf_cnpj || d?.fornecedor_cnpj || '');
  const f = key(d?.nf_emitente_nome || d?.fornecedor_nome || '');
  const v = num(d?.nf_valor_total || d?.valor_total || d?.valor);
  if (nf && nf !== 'semnum' && cnpj) return `nf:${nf}:${cnpj}`;
  if (nf && nf !== 'semnum' && f) return `nf:${nf}:${f}`;
  if (nf && nf !== 'semnum' && v) return `nf:${nf}:${v}`;
  const b = baseKey(d);
  if (b.length >= 6) return `base:${b}`;
  return `id:${d?.id}`;
}

function docKey(d) {
  if (placeholder(d)) return `${tipo(d)}:placeholder:semnum`;
  return `${tipo(d)}:${fiscalKey(d)}`;
}

function rowKey(d) {
  const x = ids(d);
  if (x.length) return `ids:${x.sort().join('|')}`;
  if (placeholder(d)) return `${tipo(d)}:placeholder:semnum`;
  const f = fiscalKey(d);
  if (!f.startsWith('id:')) return f;
  return `single:${d?.id}`;
}

function best(a, b) {
  const s = (d) => (ids(d).length ? 20 : 0) + (url(d) ? 3 : 0) + (d?.nf_numero ? 1 : 0);
  const diff = s(b) - s(a);
  if (diff) return diff;
  return new Date(dataDoc(b) || 0) - new Date(dataDoc(a) || 0);
}

function dedupeDocs(list) {
  const m = new Map();
  list.forEach((d) => {
    const k = docKey(d);
    m.set(k, m.has(k) ? [m.get(k), d].sort(best)[0] : d);
  });
  return Array.from(m.values());
}

function buildRows(raw) {
  const valid = (raw || []).filter((d) => d?.id && d?.status_registro !== 'DELETADO' && !isImg(d));
  const byRow = new Map();
  valid.forEach((d) => {
    const k = rowKey(d);
    if (!byRow.has(k)) byRow.set(k, []);
    byRow.get(k).push(d);
  });

  const rows = Array.from(byRow.entries()).map(([k, list]) => {
    const docs = dedupeDocs(list).sort((a, b) => ({ PDF: 1, XML: 2, RECIBO: 3, DOC: 4 }[tipo(a)] || 9) - ({ PDF: 1, XML: 2, RECIBO: 3, DOC: 4 }[tipo(b)] || 9));
    const primary = docs.find((d) => tipo(d) === 'PDF') || docs[0];
    const types = new Set(docs.map(tipo));
    const nf = primary?.nf_numero || primary?.numero_nf || primary?.nota_numero;
    const forn = fornecedor(primary);
    return {
      key: k,
      docs,
      date: dataDoc(primary),
      month: mesKey(primary),
      ref: nf && forn ? `NF ${nf} — ${forn}` : nf ? `NF ${nf}` : name(primary),
      fornecedor: forn,
      categoria: nf || primary?.nf_emitente_nome || primary?.nf_valor_total ? 'Nota Fiscal' : tipo(primary),
      tipo: types.has('PDF') && types.has('XML') ? 'XML + PDF' : types.has('PDF') && types.has('RECIBO') ? 'Recibo + PDF' : 'Sem par',
    };
  });

  const byMonth = new Map();
  rows.forEach((r) => {
    if (!byMonth.has(r.month)) byMonth.set(r.month, []);
    byMonth.get(r.month).push(r);
  });
  return Array.from(byMonth.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => ({ month, label: mesLabel(month), rows: items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)) }));
}

function countDup(raw) {
  const m = new Map();
  (raw || []).filter((d) => d?.id && d?.status_registro !== 'DELETADO' && !isImg(d)).forEach((d) => {
    const k = docKey(d);
    if (!m.has(k)) m.set(k, 0);
    m.set(k, m.get(k) + 1);
  });
  return Array.from(m.values()).reduce((a, n) => a + Math.max(0, n - 1), 0);
}

function DocLink({ doc }) {
  const t = tipo(doc);
  const cfg = TYPE[t] || TYPE.DOC;
  const Icon = cfg.Icon;
  const href = url(doc);
  return (
    <span className="inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-md border border-gray-100 bg-gray-50 px-1.5">
      <Icon className="h-3 w-3 flex-shrink-0 text-gray-400" />
      <span className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${cfg.cls}`}>{t}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-700" title={name(doc)}>{name(doc)}</span>
      {href && <a href={href} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-gray-400 hover:text-blue-700"><ExternalLink className="h-3 w-3" /></a>}
      {href && <a href={href} download className="flex-shrink-0 text-gray-400 hover:text-gray-700"><Download className="h-3 w-3" /></a>}
    </span>
  );
}

export default function GestaoDocumentalDedupe() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [onlyDup, setOnlyDup] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ['gestao-documental'], queryFn: async () => base44.entities.Attachment.list('-created_date', 1000) });

  const valid = useMemo(() => (data || []).filter((d) => d?.id && d?.status_registro !== 'DELETADO' && !isImg(d)), [data]);
  const dupIds = useMemo(() => {
    const m = new Map();
    valid.forEach((d) => {
      const k = docKey(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d.id);
    });
    return new Set(Array.from(m.values()).filter((ids) => ids.length > 1).flat());
  }, [valid]);
  const filtered = useMemo(() => {
    const q = norm(search);
    const source = onlyDup ? valid.filter((d) => dupIds.has(d.id)) : valid;
    if (!q) return source;
    return source.filter((d) => norm([name(d), fornecedor(d), d?.nf_numero, tipo(d), d?.description].filter(Boolean).join(' ')).includes(q));
  }, [valid, dupIds, search, onlyDup]);
  const groups = useMemo(() => buildRows(filtered), [filtered]);
  const dupCount = useMemo(() => countDup(valid), [valid]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['gestao-documental'] });
    await queryClient.invalidateQueries({ queryKey: ['attachments-compras'] });
  }

  async function remove(doc) {
    if (!window.confirm(`Remover ${name(doc)}?`)) return;
    try {
      try { await base44.entities.Attachment.delete(doc.id); }
      catch { await base44.entities.Attachment.update(doc.id, { status_registro: 'DELETADO' }); }
      toast.success('Documento removido.');
      await refresh();
    } catch (e) { toast.error(`Erro ao remover: ${e.message}`); }
  }

  async function removeDup() {
    const m = new Map();
    valid.forEach((d) => {
      const k = docKey(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    });
    const duplicates = Array.from(m.values()).flatMap((list) => list.length > 1 ? [...list].sort(best).slice(1) : []);
    if (!duplicates.length) return toast.info('Nenhuma entrada repetida encontrada.');
    if (!window.confirm(`Remover ${duplicates.length} entradas repetidas?`)) return;
    for (const d of duplicates) {
      try { await base44.entities.Attachment.delete(d.id); }
      catch { await base44.entities.Attachment.update(d.id, { status_registro: 'DELETADO' }); }
    }
    toast.success(`${duplicates.length} entradas repetidas removidas.`);
    await refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-800">Documentos</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{filtered.length}</span>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500">{dupCount} repetidos</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant={onlyDup ? 'default' : 'outline'} size="sm" onClick={() => setOnlyDup((v) => !v)} className="h-8 gap-1.5 px-2 text-xs"><Copy className="h-3.5 w-3.5" />{onlyDup ? 'Ver todos' : 'Repetidos'}</Button>
          <Button type="button" variant="outline" size="sm" onClick={removeDup} className="h-8 gap-1.5 px-2 text-xs text-red-700 hover:text-red-800"><Trash2 className="h-3.5 w-3.5" />Apagar</Button>
          <div className="relative w-64 max-w-full"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" /><Input className="h-8 pl-8 text-xs" placeholder="Buscar documento..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
      </div>
      {isLoading ? <div className="py-10 text-center text-sm text-gray-400">Carregando documentos...</div> : (
        <div className="p-3">
          {groups.map((g) => (
            <section key={g.month} className="mb-6 last:mb-0">
              <div className="mb-2 flex items-end justify-between border-b border-gray-100 pb-2">
                <div><h3 className="text-sm font-semibold capitalize text-black">{g.label}</h3><p className="text-[11px] text-gray-500">{g.rows.length} linhas consolidadas</p></div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full min-w-[760px] table-fixed border-collapse text-xs">
                  <colgroup>
                    <col className="w-[9%]" />
                    <col className="w-[24%]" />
                    <col className="w-[17%]" />
                    <col className="w-[8%]" />
                    <col className="w-[34%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-2 py-2 font-medium text-gray-600">Tipo</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Referência</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Fornecedor</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Data</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Arquivos</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={r.key} className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <td className="px-2 py-2 align-top">
                          <span className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${r.tipo === 'Sem par' ? 'border border-gray-200 bg-white text-gray-700' : 'bg-black text-white'}`}>{r.tipo}</span>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <p className="line-clamp-2 font-medium leading-snug text-gray-900" title={r.ref}>{r.ref}</p>
                          <p className="truncate text-[11px] text-gray-400">{r.categoria}</p>
                        </td>
                        <td className="px-2 py-2 align-top text-gray-600"><p className="line-clamp-2 leading-snug" title={r.fornecedor}>{r.fornecedor}</p></td>
                        <td className="px-2 py-2 align-top text-[11px] tabular-nums text-gray-500">{dataFmt(r.date)}</td>
                        <td className="px-2 py-2 align-top">
                          <div className="grid min-w-0 grid-cols-1 gap-1 xl:grid-cols-2">{r.docs.map((d) => <DocLink key={d.id} doc={d} />)}</div>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <div className="flex items-center justify-center gap-1">{r.docs.map((d) => <button key={d.id} type="button" onClick={() => remove(d)} title={`Deletar ${name(d)}`} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
