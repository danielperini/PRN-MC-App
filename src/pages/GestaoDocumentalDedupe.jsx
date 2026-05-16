import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, FileCode, File, Search, Trash2, ExternalLink, Download, Copy, Pencil, Link2, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const IMG = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic'];
const TYPE = {
  PDF: { Icon: FileText, cls: 'bg-red-50 text-red-700' },
  XML: { Icon: FileCode, cls: 'bg-blue-50 text-blue-700' },
  RECIBO: { Icon: FileText, cls: 'bg-green-50 text-green-700' },
  DOC: { Icon: File, cls: 'bg-gray-50 text-gray-700' },
};

function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function key(v) { return norm(v).replace(/[^a-z0-9]/g, ''); }
function source(doc) { return doc?.__source || 'Attachment'; }
function uid(doc) { return doc?.id ? `${source(doc)}:${doc.id}` : ''; }
function name(d) { return d?.file_name || d?.file_name_final || d?.file_name_original || d?.nf_nome_renomeado || d?.nf_nome_original || 'Documento'; }
function url(d) { return d?.file_url || d?.url || d?.arquivo_original_url || d?.nf_pdf_url || d?.nf_xml_url || d?.comprovante_url || ''; }
function ext(d) { return (name(d).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase(); }

function tipo(d) {
  const m = String(d?.file_type || d?.mime_type || '').toLowerCase();
  const e = ext(d);
  const t = norm(d?.nf_tipo_documento || d?.tipo_detectado || d?.resultado_ia?.tipo_documento || '');
  const all = norm([name(d), d?.description, d?.categoria, d?.tipo, d?.tipo_detectado, d?.resultado_ia?.tipo_documento, d?.resultado_ia?.categoria_sugerida, d?.resultado_ia?.descricao_servico].filter(Boolean).join(' '));
  if (t === 'xml_nf' || t === 'nota_fiscal_xml' || m.includes('xml') || e === 'xml') return 'XML';
  if (t === 'recibo_pdf' || all.includes('recibo') || all.includes('comprovante') || all.includes('pagamento') || all.includes('boleto') || all.includes('pix')) return 'RECIBO';
  if (t === 'pdf_nf' || t === 'nota_fiscal_pdf' || m.includes('pdf') || e === 'pdf') return 'PDF';
  return 'DOC';
}

function isImg(d) { return String(d?.file_type || d?.mime_type || '').toLowerCase().startsWith('image/') || IMG.includes(ext(d)); }
function fornecedor(d) { return d?.nf_emitente_nome || d?.fornecedor_nome || d?.resultado_ia?.nf_emitente_nome || d?.resultado_ia?.fornecedor_nome || d?.description || 'Fornecedor não identificado'; }
function nfNumero(d) { return d?.nf_numero || d?.resultado_ia?.nf_numero || d?.numero_nf || d?.nota_numero || ''; }
function valorDoc(d) { return d?.nf_valor_total || d?.resultado_ia?.nf_valor_total || d?.valor_total || d?.valor || ''; }
function dataDoc(d) { return d?.nf_data_emissao || d?.resultado_ia?.nf_data_emissao || d?.resultado_ia?.data_emissao || d?.competencia || d?.created_date || d?.updated_date || ''; }
function dataFmt(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
function monthKey(d) { const dt = new Date(dataDoc(d) || d?.created_date || d?.updated_date || ''); return Number.isNaN(dt.getTime()) ? 'sem-data' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(k) { if (k === 'sem-data') return 'Sem data'; const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
function groupByMonth(docs) { const map = new Map(); (docs || []).forEach((doc) => { const k = monthKey(doc); if (!map.has(k)) map.set(k, []); map.get(k).push(doc); }); return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([k, items]) => ({ key: k, label: monthLabel(k), items })); }

function baseArquivo(d) { return key(name(d).replace(/\.[^.]+$/i, '').replace(/\s*\(\d+\)\s*$/i, '').replace(/\b(pdf|xml|nf|nota|fiscal|arquivo)\b/gi, '')); }
function ids(d) { return [d?.purchase_id, d?.purchase_request_id, d?.purchaseRequestId, d?.solicitacao_id, d?.report_id, d?.nf_pdf_intake_id, d?.nf_xml_intake_id, d?.nf_xml_vinculado_a, d?.nf_pdf_vinculado_a, d?.documento_pai_id, d?.grupo_documental_id, d?.pair_id, d?.par_id, d?.intake_pair_id, d?.entrada_unica_pair_id, d?.comprovante_pdf_id, d?.recibo_pdf_id, d?.pdf_recibo_id, d?.intake_id, d?.document_intake_id, d?.documento_intake_id, d?.vinculado_a_intake_id].filter(Boolean).map(String); }
function getPairId(d) { return d?.grupo_documental_id || d?.pair_id || d?.par_id || d?.intake_pair_id || d?.entrada_unica_pair_id || ''; }
function isLinked(d) { return ids(d).length > 0 || d?.grupo_status === 'COMPLETO'; }
function pairIdPorNome(pdf, xml) { const b = baseArquivo(pdf) || baseArquivo(xml); if (b) return `PAR-${b}`; return [uid(pdf), uid(xml)].filter(Boolean).sort().join('__'); }
function sequencialPorPairId(pairId) { let hash = 0; const str = String(pairId || ''); for (let i = 0; i < str.length; i += 1) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; } const n = Math.abs(hash % 999999) + 1; return `SOL-${String(n).padStart(6, '0')}`; }

function pairStatus(d, byPairId = new Map()) {
  const t = tipo(d);
  const pairId = getPairId(d);
  const pairDocs = pairId ? (byPairId.get(pairId) || []) : [];
  const hasPdf = pairDocs.some((doc) => tipo(doc) === 'PDF') || t === 'PDF';
  const hasXml = pairDocs.some((doc) => tipo(doc) === 'XML') || t === 'XML';
  const hasRecibo = pairDocs.some((doc) => tipo(doc) === 'RECIBO') || t === 'RECIBO';
  if (hasPdf && hasXml) return 'Com XML';
  if (hasPdf && hasRecibo) return 'Com Recibo';
  if (t === 'PDF') {
    if (d?.nf_xml_intake_id || d?.nf_xml_url) return 'Com XML';
    if (d?.recibo_pdf_id || d?.comprovante_pdf_id || d?.comprovante_url) return 'Com Recibo';
    if (d?.arquivo_complementar_dispensado) return 'Sem complemento';
    return 'Sem par';
  }
  if (isLinked(d)) return 'Vinculado';
  return 'Sem par';
}

function docKey(d) { return `${tipo(d)}:${nfNumero(d)}:${fornecedor(d)}:${valorDoc(d)}:${name(d)}`.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function countDup(raw) { const m = new Map(); (raw || []).filter((d) => d?.id && d?.status_registro !== 'DELETADO' && !isImg(d)).forEach((d) => { const k = docKey(d); m.set(k, (m.get(k) || 0) + 1); }); return Array.from(m.values()).reduce((a, n) => a + Math.max(0, n - 1), 0); }

function DocTypeBadge({ doc }) { const t = tipo(doc); const cfg = TYPE[t] || TYPE.DOC; const Icon = cfg.Icon; return <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold ${cfg.cls}`}><Icon className="h-3 w-3" />{t}</span>; }
function optionLabel(doc) { const origem = source(doc) === 'DocumentIntake' ? ' — Entrada Única' : ' — Anexo'; const nf = nfNumero(doc) ? ` — NF ${nfNumero(doc)}` : ''; const vinculado = isLinked(doc) ? ' — já vinculado' : ''; return `${tipo(doc)}${nf} — ${name(doc)}${origem}${vinculado}`; }

function DocumentSelect({ label, value, onChange, docs, allowedTypes }) {
  const options = docs.filter((doc) => allowedTypes.includes(tipo(doc))).sort((a, b) => name(a).localeCompare(name(b), 'pt-BR'));
  return <div className="space-y-1"><label className="text-xs font-medium text-gray-600">{label}</label><select value={value || ''} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:border-gray-400"><option value="">Não vincular</option>{options.map((doc) => <option key={uid(doc)} value={uid(doc)}>{optionLabel(doc)}</option>)}</select><p className="text-[10px] text-gray-400">{options.length} arquivo(s) disponível(is)</p></div>;
}

function EditarVinculosDialog({ doc, docs, form, setForm, saving, onSave, onClose }) {
  if (!doc) return null;
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><Pencil className="h-4 w-4" />Editar vínculos do documento</DialogTitle></DialogHeader><div className="space-y-4"><div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"><p className="text-sm font-medium text-gray-900 line-clamp-2">{name(doc)}</p><p className="text-xs text-gray-500 mt-0.5">{fornecedor(doc)}</p></div><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><DocumentSelect label="PDF da Nota Fiscal" value={form.pdfId} onChange={(v) => setForm((prev) => ({ ...prev, pdfId: v }))} docs={docs} allowedTypes={['PDF']} /><DocumentSelect label="XML da Nota Fiscal" value={form.xmlId} onChange={(v) => setForm((prev) => ({ ...prev, xmlId: v }))} docs={docs} allowedTypes={['XML']} /><DocumentSelect label="Recibo / Comprovante" value={form.reciboId} onChange={(v) => setForm((prev) => ({ ...prev, reciboId: v }))} docs={docs} allowedTypes={['RECIBO', 'DOC']} /></div><div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">As listas mostram todos os PDFs, XMLs e recibos/comprovantes disponíveis. Ao salvar, o sistema grava o par documental selecionado.</div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="button" onClick={onSave} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar vínculos'}</Button></div></div></DialogContent></Dialog>;
}

async function updateDoc(doc, payload) { if (!doc?.id) return; if (source(doc) === 'DocumentIntake') { await base44.entities.DocumentIntake.update(doc.id, payload); return; } await base44.entities.Attachment.update(doc.id, payload); }
async function deleteDoc(doc) { if (!doc?.id) return; if (source(doc) === 'DocumentIntake') { await base44.entities.DocumentIntake.update(doc.id, { status_registro: 'DELETADO' }); return; } try { await base44.entities.Attachment.delete(doc.id); } catch { await base44.entities.Attachment.update(doc.id, { status_registro: 'DELETADO' }); } }

function normalizeIntake(doc) { return { ...doc, __source: 'DocumentIntake', file_name: doc.file_name_final || doc.file_name_original, file_url: doc.arquivo_original_url, nf_numero: doc.nf_numero || doc.resultado_ia?.nf_numero, nf_valor_total: doc.nf_valor_total || doc.resultado_ia?.nf_valor_total, nf_data_emissao: doc.nf_data_emissao || doc.resultado_ia?.nf_data_emissao || doc.resultado_ia?.data_emissao, nf_emitente_nome: doc.nf_emitente_nome || doc.resultado_ia?.nf_emitente_nome, nf_emitente_cpf_cnpj: doc.nf_emitente_cpf_cnpj || doc.resultado_ia?.nf_emitente_cpf_cnpj, nf_tipo_documento: doc.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : doc.tipo_detectado === 'RECIBO_PDF' ? 'recibo_pdf' : doc.tipo_detectado === 'NOTA_FISCAL_PDF' ? 'pdf_nf' : doc.nf_tipo_documento }; }

async function autoParearPdfXmlPorNome(docs) {
  const ativos = (docs || []).filter((d) => d?.id && d?.status_registro !== 'DELETADO' && !isImg(d));
  const porBase = new Map();
  for (const doc of ativos) { const b = baseArquivo(doc); if (!b || b.length < 8) continue; if (!porBase.has(b)) porBase.set(b, []); porBase.get(b).push(doc); }
  const atualizados = new Map(ativos.map((d) => [uid(d), { ...d }]));
  const updates = [];
  for (const grupo of porBase.values()) {
    const pdfs = grupo.filter((d) => tipo(d) === 'PDF'); const xmls = grupo.filter((d) => tipo(d) === 'XML');
    if (!pdfs.length || !xmls.length) continue;
    for (const pdf of pdfs) {
      if (getPairId(pdf) || pdf.nf_xml_intake_id || pdf.nf_xml_url) continue;
      const xml = xmls.find((x) => !getPairId(x) || getPairId(x) === getPairId(pdf)); if (!xml) continue;
      const pairId = pairIdPorNome(pdf, xml); const sequencial = sequencialPorPairId(pairId);
      const comum = { pair_id: pairId, grupo_documental_id: pairId, grupo_status: 'COMPLETO', solicitacao_sequencial: sequencial, numero_solicitacao: sequencial, arquivo_complementar_status: 'VINCULADO' };
      const pdfPayload = { ...comum, nf_xml_intake_id: xml.id, nf_xml_url: url(xml), arquivo_complementar_tipo: 'XML', arquivo_complementar_dispensado: false };
      const xmlPayload = { ...comum, nf_pdf_intake_id: pdf.id, nf_pdf_url: url(pdf), nf_xml_vinculado_a: pdf.id, vinculado_a_intake_id: pdf.id, ocultar_entrada_unica: source(xml) === 'DocumentIntake' ? true : xml.ocultar_entrada_unica };
      updates.push(updateDoc(pdf, pdfPayload).catch(() => null)); updates.push(updateDoc(xml, xmlPayload).catch(() => null));
      atualizados.set(uid(pdf), { ...atualizados.get(uid(pdf)), ...pdfPayload }); atualizados.set(uid(xml), { ...atualizados.get(uid(xml)), ...xmlPayload });
    }
  }
  if (updates.length) await Promise.all(updates);
  return Array.from(atualizados.values());
}

export default function GestaoDocumentalDedupe() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [onlyDup, setOnlyDup] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editForm, setEditForm] = useState({ pdfId: '', xmlId: '', reciboId: '' });
  const [savingLinks, setSavingLinks] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data = [], isLoading } = useQuery({ queryKey: ['gestao-documental'], queryFn: async () => { const [attachments, intakes] = await Promise.all([base44.entities.Attachment.list('-created_date', 5000).catch(() => []), base44.entities.DocumentIntake.list('-created_date', 5000).catch(() => [])]); const docs = [...(attachments || []).map((doc) => ({ ...doc, __source: 'Attachment' })), ...(intakes || []).map(normalizeIntake)]; return autoParearPdfXmlPorNome(docs); } });

  const valid = useMemo(() => (data || []).filter((d) => d?.id && d?.status_registro !== 'DELETADO' && !isImg(d)).sort((a, b) => new Date(dataDoc(b) || b.created_date || 0) - new Date(dataDoc(a) || a.created_date || 0)), [data]);
  const byPairId = useMemo(() => { const map = new Map(); valid.forEach((doc) => { const p = getPairId(doc); if (!p) return; if (!map.has(p)) map.set(p, []); map.get(p).push(doc); }); return map; }, [valid]);
  const docsById = useMemo(() => new Map(valid.map((doc) => [uid(doc), doc])), [valid]);
  const dupIds = useMemo(() => { const m = new Map(); valid.forEach((d) => { const k = docKey(d); if (!m.has(k)) m.set(k, []); m.get(k).push(uid(d)); }); return new Set(Array.from(m.values()).filter((items) => items.length > 1).flat()); }, [valid]);
  const filtered = useMemo(() => { const q = norm(search); const sourceDocs = onlyDup ? valid.filter((d) => dupIds.has(uid(d))) : valid; if (!q) return sourceDocs; return sourceDocs.filter((d) => norm([name(d), fornecedor(d), nfNumero(d), tipo(d), pairStatus(d, byPairId), d?.numero_solicitacao, d?.solicitacao_sequencial, d?.description].filter(Boolean).join(' ')).includes(q)); }, [valid, dupIds, search, onlyDup, byPairId]);
  const dupCount = useMemo(() => countDup(valid), [valid]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const monthlyPageGroups = useMemo(() => groupByMonth(pageItems), [pageItems]);

  async function refresh() { await queryClient.invalidateQueries({ queryKey: ['gestao-documental'] }); await queryClient.invalidateQueries({ queryKey: ['attachments-compras'] }); }
  function findDocByEntityId(entityId, targetType = null) { if (!entityId) return null; return valid.find((doc) => String(doc.id) === String(entityId) && (!targetType || tipo(doc) === targetType)) || null; }
  function findPairDoc(doc, targetType) { const p = getPairId(doc); if (p) { const match = (byPairId.get(p) || []).find((item) => tipo(item) === targetType && uid(item) !== uid(doc)); if (match) return match; } if (targetType === 'PDF') return findDocByEntityId(doc.nf_pdf_intake_id || doc.documento_pai_id || doc.vinculado_a_intake_id, 'PDF'); if (targetType === 'XML') return findDocByEntityId(doc.nf_xml_intake_id, 'XML'); if (targetType === 'RECIBO') return findDocByEntityId(doc.recibo_pdf_id || doc.comprovante_pdf_id, 'RECIBO'); return null; }
  function openEdit(doc) { const t = tipo(doc); const pdf = t === 'PDF' ? doc : findPairDoc(doc, 'PDF'); const xml = t === 'XML' ? doc : findPairDoc(doc, 'XML'); const recibo = t === 'RECIBO' || t === 'DOC' ? doc : findPairDoc(doc, 'RECIBO'); setEditingDoc(doc); setEditForm({ pdfId: pdf ? uid(pdf) : '', xmlId: xml ? uid(xml) : '', reciboId: recibo ? uid(recibo) : '' }); }

  async function saveLinks() {
    if (!editingDoc) return;
    const pdf = editForm.pdfId ? docsById.get(String(editForm.pdfId)) : null; const xml = editForm.xmlId ? docsById.get(String(editForm.xmlId)) : null; const recibo = editForm.reciboId ? docsById.get(String(editForm.reciboId)) : null;
    if (!pdf && !xml && !recibo) { toast.warning('Selecione ao menos um documento para vincular.'); return; }
    setSavingLinks(true);
    try {
      const pdfUrl = pdf ? url(pdf) : ''; const xmlUrl = xml ? url(xml) : ''; const reciboUrl = recibo ? url(recibo) : '';
      const pairId = [uid(pdf), uid(xml), uid(recibo)].filter(Boolean).sort().join('__') || uid(editingDoc); const sequencial = sequencialPorPairId(pairId);
      const pdfId = pdf?.id || ''; const xmlId = xml?.id || ''; const reciboId = recibo?.id || ''; const updates = [];
      if (pdf) updates.push(updateDoc(pdf, { pair_id: pairId, grupo_documental_id: pairId, grupo_status: (xml || recibo) ? 'COMPLETO' : pdf.grupo_status, solicitacao_sequencial: sequencial, numero_solicitacao: sequencial, nf_pdf_intake_id: pdfId, nf_pdf_url: pdfUrl, nf_xml_intake_id: xmlId || '', nf_xml_url: xmlUrl || '', recibo_pdf_id: reciboId || '', comprovante_pdf_id: reciboId || '', comprovante_url: reciboUrl || '', arquivo_complementar_status: (xml || recibo) ? 'VINCULADO' : pdf.arquivo_complementar_status, arquivo_complementar_tipo: xml ? 'XML' : recibo ? 'RECIBO' : pdf.arquivo_complementar_tipo }));
      if (xml) updates.push(updateDoc(xml, { pair_id: pairId, grupo_documental_id: pairId, grupo_status: 'COMPLETO', solicitacao_sequencial: sequencial, numero_solicitacao: sequencial, nf_pdf_intake_id: pdfId, nf_pdf_url: pdfUrl, nf_xml_vinculado_a: pdfId, vinculado_a_intake_id: pdfId, ocultar_entrada_unica: source(xml) === 'DocumentIntake' ? true : xml.ocultar_entrada_unica, arquivo_complementar_status: 'VINCULADO' }));
      if (recibo) updates.push(updateDoc(recibo, { pair_id: pairId, grupo_documental_id: pairId, grupo_status: 'COMPLETO', solicitacao_sequencial: sequencial, numero_solicitacao: sequencial, documento_pai_id: pdfId, pdf_recibo_id: pdfId, nf_pdf_intake_id: pdfId, nf_pdf_url: pdfUrl, vinculado_a_intake_id: pdfId, ocultar_entrada_unica: source(recibo) === 'DocumentIntake' ? true : recibo.ocultar_entrada_unica, arquivo_complementar_status: 'VINCULADO' }));
      await Promise.all(updates); toast.success('Vínculos atualizados com sucesso.'); setEditingDoc(null); await refresh();
    } catch (error) { toast.error(`Erro ao salvar vínculos: ${error.message}`); } finally { setSavingLinks(false); }
  }

  async function remove(doc) { if (!window.confirm(`Remover ${name(doc)}?`)) return; try { await deleteDoc(doc); toast.success('Documento removido.'); await refresh(); } catch (e) { toast.error(`Erro ao remover: ${e.message}`); } }
  async function removeDup() { const m = new Map(); valid.forEach((d) => { const k = docKey(d); if (!m.has(k)) m.set(k, []); m.get(k).push(d); }); const duplicates = Array.from(m.values()).flatMap((list) => list.length > 1 ? [...list].slice(1) : []); if (!duplicates.length) return toast.info('Nenhuma entrada repetida encontrada.'); if (!window.confirm(`Remover ${duplicates.length} entradas repetidas?`)) return; let removed = 0; for (const d of duplicates) { try { await deleteDoc(d); removed += 1; } catch (e) { console.warn('Erro ao remover duplicado:', e.message); } await new Promise((res) => setTimeout(res, 300)); } toast.success(`${removed} entradas repetidas removidas.`); await refresh(); }

  function renderRow(doc, i) {
    const href = url(doc); const status = pairStatus(doc, byPairId); const seq = doc.numero_solicitacao || doc.solicitacao_sequencial || '';
    return <tr key={uid(doc)} className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}><td className="px-2 py-2 align-middle"><span className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${status === 'Sem par' ? 'border border-gray-200 bg-white text-gray-700' : 'bg-black text-white'}`}>{status}</span>{seq && <p className="mt-1 truncate text-[10px] text-gray-400">{seq}</p>}</td><td className="px-2 py-2 align-middle"><DocTypeBadge doc={doc} /></td><td className="px-2 py-2 align-middle"><p className="truncate font-medium text-gray-900" title={name(doc)}>{name(doc)}</p><p className="truncate text-[11px] text-gray-400">{nfNumero(doc) ? `NF ${nfNumero(doc)}` : 'Sem NF identificada'}{valorDoc(doc) ? ` · R$ ${valorDoc(doc)}` : ''}</p></td><td className="px-2 py-2 align-middle text-gray-600"><p className="truncate" title={fornecedor(doc)}>{fornecedor(doc)}</p></td><td className="px-2 py-2 align-middle text-[11px] tabular-nums text-gray-500">{dataFmt(dataDoc(doc))}</td><td className="px-2 py-2 align-middle text-[11px] text-gray-500">{source(doc) === 'DocumentIntake' ? 'Entrada Única' : 'Anexo'}</td><td className="px-2 py-2 align-middle"><div className="flex items-center justify-center gap-1"><button type="button" onClick={() => openEdit(doc)} title="Editar vínculos" className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-black"><Pencil className="h-3.5 w-3.5" /></button><Link2 className="h-3.5 w-3.5 text-gray-300" />{href && <a href={href} target="_blank" rel="noopener noreferrer" title="Abrir arquivo" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-700"><ExternalLink className="h-3.5 w-3.5" /></a>}{href && <a href={href} download title="Baixar arquivo" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"><Download className="h-3.5 w-3.5" /></a>}<button type="button" onClick={() => remove(doc)} title={`Deletar ${name(doc)}`} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div></td></tr>;
  }

  return <div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-3 py-3"><div className="flex flex-wrap items-center gap-2"><FileText className="h-4 w-4 text-gray-500" /><span className="font-semibold text-gray-800">Documentos</span><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{filtered.length}</span><span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500">{dupCount} repetidos</span></div><div className="flex flex-wrap items-center gap-2"><select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"><option value={10}>10 por página</option><option value={20}>20 por página</option></select><Button type="button" variant={onlyDup ? 'default' : 'outline'} size="sm" onClick={() => { setOnlyDup((v) => !v); setPage(1); }} className="h-8 gap-1.5 px-2 text-xs"><Copy className="h-3.5 w-3.5" />{onlyDup ? 'Ver todos' : 'Repetidos'}</Button><Button type="button" variant="outline" size="sm" onClick={removeDup} className="h-8 gap-1.5 px-2 text-xs text-red-700 hover:text-red-800"><Trash2 className="h-3.5 w-3.5" />Apagar</Button><div className="relative w-64 max-w-full"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" /><Input className="h-8 pl-8 text-xs" placeholder="Buscar documento..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div></div></div>{isLoading ? <div className="py-10 text-center text-sm text-gray-400">Carregando documentos...</div> : <div className="p-3 space-y-6">{monthlyPageGroups.map((group) => <section key={group.key} className="space-y-2"><div className="flex items-end justify-between border-b border-gray-100 pb-2"><div><h3 className="text-sm font-semibold capitalize text-black">{group.label}</h3><p className="text-xs text-gray-500">{group.items.length} documento(s) nesta página</p></div></div><div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full min-w-[900px] table-fixed border-collapse text-xs"><colgroup><col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[32%]" /><col className="w-[18%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[13%]" /></colgroup><thead><tr className="border-b border-gray-200 bg-gray-50 text-left"><th className="px-2 py-2 font-medium text-gray-600">Vínculo</th><th className="px-2 py-2 font-medium text-gray-600">Tipo</th><th className="px-2 py-2 font-medium text-gray-600">Arquivo</th><th className="px-2 py-2 font-medium text-gray-600">Fornecedor</th><th className="px-2 py-2 font-medium text-gray-600">Data</th><th className="px-2 py-2 font-medium text-gray-600">Origem</th><th className="px-2 py-2 text-center font-medium text-gray-600">Ações</th></tr></thead><tbody>{group.items.map((doc, i) => renderRow(doc, i))}</tbody></table></div></section>)}{!pageItems.length && <div className="py-10 text-center text-sm text-gray-400">Nenhum documento encontrado.</div>}<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"><span>Mostrando {filtered.length ? start + 1 : 0}–{Math.min(start + pageSize, filtered.length)} de {filtered.length} arquivo(s)</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8 gap-1 text-xs"><ChevronLeft className="h-3.5 w-3.5" />Anterior</Button><span>Página {safePage} de {totalPages}</span><Button type="button" variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-8 gap-1 text-xs">Próxima<ChevronRight className="h-3.5 w-3.5" /></Button></div></div></div>}<EditarVinculosDialog doc={editingDoc} docs={valid} form={editForm} setForm={setEditForm} saving={savingLinks} onSave={saveLinks} onClose={() => setEditingDoc(null)} /></div>;
}
