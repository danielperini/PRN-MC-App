import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FileText,
  FileCode,
  File,
  Search,
  Trash2,
  ExternalLink,
  Download,
  Link2,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { deletePurchaseRequest } from '@/lib/deleteIntegrado';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeLoose(v) {
  return normalizeText(v).replace(/[^a-z0-9]/g, '');
}

function toNumber(v) {
  const n = Number(String(v || '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.svg', '.heic', '.heif']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/heic']);

function isImagem(doc) {
  const mime = String(doc?.file_type || doc?.mime_type || '').toLowerCase();
  if (IMAGE_MIMES.has(mime)) return true;
  const name = normalizeText(doc?.file_name || doc?.nf_nome_original || '');
  return [...IMAGE_EXTS].some((ext) => name.endsWith(ext));
}

function getFileName(doc) {
  return doc?.file_name || doc?.nf_nome_renomeado || doc?.nf_nome_original || 'Documento';
}

function getFileUrl(doc) {
  return doc?.file_url || '';
}

function isRecibo(doc) {
  const raw = normalizeText([
    doc?.file_name,
    doc?.nf_nome_original,
    doc?.description,
    doc?.categoria,
    doc?.tipo,
    doc?.nf_tipo_documento
  ].filter(Boolean).join(' '));

  return (
    raw.includes('recibo') ||
    raw.includes('comprovante') ||
    raw.includes('pagamento') ||
    raw.includes('boleto') ||
    raw.includes('pix')
  );
}

function getTipo(doc) {
  const mime = String(doc?.file_type || doc?.mime_type || '').toLowerCase();
  const name = normalizeText(doc?.file_name || doc?.nf_nome_original || '');
  const nfTipo = normalizeText(doc?.nf_tipo_documento || '');

  if (nfTipo === 'xml_nf' || mime.includes('xml') || name.endsWith('.xml')) return 'XML';
  if (isRecibo(doc)) return 'RECIBO';
  if (nfTipo === 'pdf_nf' || mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'DOC';
  return 'DOC';
}

function getCategoria(doc) {
  if (isRecibo(doc)) return 'Recibo/Comprovante';
  if (doc?.nf_numero || doc?.nf_emitente_nome || doc?.nf_valor_total) return 'Nota Fiscal';
  const desc = normalizeText(doc?.description || doc?.file_name || '');
  if (desc.includes('contrato')) return 'Contrato';
  if (desc.includes('nota') || desc.includes('nf') || desc.includes('nfe')) return 'Nota Fiscal';
  return 'Documento';
}

function getFornecedor(doc) {
  return doc?.nf_emitente_nome || doc?.fornecedor_nome || doc?.description || '—';
}

function getDocDate(doc) {
  return doc?.nf_data_emissao || doc?.created_date || doc?.updated_date || new Date().toISOString();
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function getMonthKey(doc) {
  const d = new Date(getDocDate(doc));
  if (isNaN(d)) return 'sem-data';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey) {
  if (monthKey === 'sem-data') return 'Sem data';
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getBaseFileKey(doc) {
  return normalizeLoose(getFileName(doc)
    .replace(/\.[^.]+$/, '')
    .replace(/\b(pdf|xml|recibo|comprovante|pagamento|boleto|pix|nfe|nfse|nf|nota|fiscal)\b/gi, ''));
}

function getFiscalKey(doc) {
  const nf = normalizeLoose(doc?.nf_numero || doc?.numero_nf || doc?.nota_numero || '');
  const cnpj = normalizeLoose(doc?.nf_emitente_cpf_cnpj || doc?.fornecedor_cpf_cnpj || doc?.fornecedor_cnpj || '');
  const valor = toNumber(doc?.nf_valor_total || doc?.valor_total || doc?.valor || 0);

  if (nf && cnpj) return `nf-${nf}-${cnpj}-${valor || ''}`;
  if (nf) return `nf-${nf}-${valor || ''}`;

  const base = getBaseFileKey(doc);
  if (base && base.length >= 6) return `base-${base}`;

  return `avulso-${doc.id}`;
}

function isXmlVinculado(doc) {
  return getTipo(doc) === 'XML' && (
    doc?.nf_pdf_intake_id || doc?.nf_xml_vinculado_a || doc?.nf_pdf_url
  );
}

function filtrarEDeduplicar(docs) {
  const map = new Map();

  (docs || []).forEach((doc) => {
    if (!doc?.id) return;
    if (doc?.status_registro === 'DELETADO') return;
    if (isImagem(doc)) return;

    const key = getFileUrl(doc) || doc.id;
    if (!map.has(key)) map.set(key, doc);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(getDocDate(b) || 0) - new Date(getDocDate(a) || 0)
  );
}

function getPairTitle(docs) {
  const primary = docs.find((d) => getTipo(d) === 'PDF') || docs[0];
  const nf = primary?.nf_numero || primary?.numero_nf || primary?.nota_numero;
  const fornecedor = getFornecedor(primary);

  if (nf && fornecedor && fornecedor !== '—') return `NF ${nf} — ${fornecedor}`;
  if (nf) return `NF ${nf}`;
  return getFileName(primary);
}

function getPairType(docs) {
  const tipos = new Set(docs.map(getTipo));
  if (tipos.has('PDF') && tipos.has('XML')) return 'PDF + XML';
  if (tipos.has('RECIBO') && tipos.has('PDF')) return 'Recibo + PDF';
  if (docs.length > 1) return 'Conjunto';
  return 'Avulso';
}

function buildDocumentGroups(docs) {
  const byMonth = new Map();

  (docs || []).forEach((doc) => {
    const monthKey = getMonthKey(doc);
    const pairKey = getFiscalKey(doc);

    if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
    const monthMap = byMonth.get(monthKey);
    if (!monthMap.has(pairKey)) monthMap.set(pairKey, []);
    monthMap.get(pairKey).push(doc);
  });

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, pairMap]) => {
      const pairs = Array.from(pairMap.entries()).map(([pairKey, pairDocs]) => {
        const docsOrdenados = [...pairDocs].sort((a, b) => {
          const order = { PDF: 1, XML: 2, RECIBO: 3, DOC: 4 };
          return (order[getTipo(a)] || 9) - (order[getTipo(b)] || 9);
        });

        return {
          key: pairKey,
          docs: docsOrdenados,
          title: getPairTitle(docsOrdenados),
          type: getPairType(docsOrdenados),
          date: getDocDate(docsOrdenados[0]),
          fornecedor: getFornecedor(docsOrdenados[0]),
          categoria: getCategoria(docsOrdenados[0]),
        };
      }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      return {
        monthKey,
        label: getMonthLabel(monthKey),
        pairs,
        totalDocs: pairs.reduce((acc, pair) => acc + pair.docs.length, 0),
      };
    });
}

const TIPO_CONFIG = {
  PDF: { label: 'PDF', color: 'bg-red-50 text-red-700', Icon: FileText },
  XML: { label: 'XML', color: 'bg-blue-50 text-blue-700', Icon: FileCode },
  RECIBO: { label: 'RECIBO', color: 'bg-green-50 text-green-700', Icon: FileText },
  DOC: { label: 'DOC', color: 'bg-indigo-50 text-indigo-700', Icon: File },
};

const CATEG_COLOR = {
  'Nota Fiscal': 'bg-amber-50 text-amber-700',
  'Contrato': 'bg-purple-50 text-purple-700',
  'Documento': 'bg-gray-100 text-gray-600',
  'Recibo/Comprovante': 'bg-green-50 text-green-700',
};

const PAIR_COLOR = {
  'PDF + XML': 'bg-black text-white',
  'Recibo + PDF': 'bg-gray-900 text-white',
  'Conjunto': 'bg-gray-100 text-gray-700',
  'Avulso': 'bg-white text-gray-700 border border-gray-200',
};

function VincularXmlModal({ xmlDoc, pdfsDisponiveis, onConfirm, onClose }) {
  const nome = getFileName(xmlDoc);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-600" />
            Vincular XML ao PDF
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
            <span className="font-medium">XML:</span> {nome}
          </div>

          {pdfsDisponiveis.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              Nenhum PDF disponível para vínculo. <br />
              Faça o upload do PDF correspondente antes de vincular.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 font-medium">Escolha o PDF desta nota fiscal:</p>
              {pdfsDisponiveis.map((pdf) => {
                const emitente = pdf?.nf_emitente_nome || pdf?.description || '';
                const valor = pdf?.nf_valor_total
                  ? `R$ ${Number(pdf.nf_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '';
                const vinculado = !!pdf?.nf_xml_intake_id || !!pdf?.nf_xml_url;
                return (
                  <button
                    key={pdf.id}
                    onClick={() => onConfirm(pdf)}
                    className="w-full flex items-start gap-3 text-left border border-slate-200 rounded-lg px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{getFileName(pdf)}</p>
                      <p className="text-xs text-slate-500">
                        {[emitente, valor].filter(Boolean).join(' · ')}
                        {vinculado && <span className="ml-2 text-amber-600">(já tem XML)</span>}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GestaoDocumental() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [vincularXml, setVincularXml] = useState(null);

  const { data: todosDocumentos = [], isLoading } = useQuery({
    queryKey: ['gestao-documental'],
    queryFn: async () => base44.entities.Attachment.list('-created_date', 500)
  });

  const documentos = useMemo(() => filtrarEDeduplicar(todosDocumentos), [todosDocumentos]);

  const pdfsDisponiveis = useMemo(() =>
    (todosDocumentos || []).filter((d) => {
      if (d?.status_registro === 'DELETADO') return false;
      if (isImagem(d)) return false;
      return getTipo(d) === 'PDF';
    }).sort((a, b) => new Date(getDocDate(b) || 0) - new Date(getDocDate(a) || 0))
  , [todosDocumentos]);

  async function handleVincularXml(pdfDoc) {
    if (!vincularXml || !pdfDoc) return;
    try {
      await base44.entities.Attachment.update(pdfDoc.id, {
        nf_xml_intake_id: vincularXml.id,
        nf_xml_url: getFileUrl(vincularXml),
      });
      await base44.entities.Attachment.update(vincularXml.id, {
        nf_pdf_intake_id: pdfDoc.id,
        nf_pdf_url: getFileUrl(pdfDoc),
      });
      toast.success('XML vinculado ao PDF com sucesso.');
      setVincularXml(null);
      queryClient.invalidateQueries({ queryKey: ['gestao-documental'] });
    } catch (e) {
      toast.error('Erro ao vincular: ' + e.message);
    }
  }

  const filtrados = useMemo(() => {
    const s = normalizeText(search);
    if (!s) return documentos;
    return documentos.filter((doc) =>
      normalizeText(getFileName(doc)).includes(s) ||
      normalizeText(getFornecedor(doc)).includes(s) ||
      normalizeText(doc?.nf_numero || '').includes(s) ||
      normalizeText(getTipo(doc)).includes(s) ||
      normalizeText(getCategoria(doc)).includes(s)
    );
  }, [documentos, search]);

  const gruposMensais = useMemo(() => buildDocumentGroups(filtrados), [filtrados]);

  async function handleDelete(doc) {
    if (!window.confirm('Remover documento e solicitações vinculadas?')) return;
    try {
      if (doc.report_id) {
        const pr = await base44.entities.PurchaseRequest.get(doc.report_id).catch(() => null);
        if (pr) {
          await deletePurchaseRequest(pr);
        }
      }
      try {
        await base44.entities.Attachment.delete(doc.id);
      } catch {
        await base44.entities.Attachment.update(doc.id, { status_registro: 'DELETADO' });
      }
      toast.success('Registro deletado e rubrica estornada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['gestao-documental'] });
    } catch (e) {
      toast.error('Erro ao deletar: ' + e.message);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-800">Documentos</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {filtrados.length}
          </span>
          <span className="hidden rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500 sm:inline-flex">
            {gruposMensais.reduce((acc, g) => acc + g.pairs.length, 0)} pares/conjuntos
          </span>
        </div>
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Buscar arquivo, fornecedor, NF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando documentos...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-200" />
          <p className="text-sm text-gray-400">Nenhum documento encontrado</p>
        </div>
      ) : (
        <div className="space-y-6 p-4">
          {gruposMensais.map((grupo) => (
            <section key={grupo.monthKey} className="space-y-3">
              <div className="flex items-end justify-between gap-3 border-b border-gray-100 pb-2">
                <div>
                  <h3 className="text-base font-semibold capitalize text-black">{grupo.label}</h3>
                  <p className="text-xs text-gray-500">
                    {grupo.totalDocs} documentos organizados em {grupo.pairs.length} pares/conjuntos
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {grupo.pairs.map((pair) => (
                  <article key={`${grupo.monthKey}-${pair.key}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAIR_COLOR[pair.type] || PAIR_COLOR.Avulso}`}>
                            {pair.type}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEG_COLOR[pair.categoria] || 'bg-gray-100 text-gray-600'}`}>
                            {pair.categoria}
                          </span>
                        </div>
                        <h4 className="truncate text-sm font-semibold text-gray-900" title={pair.title}>{pair.title}</h4>
                        <p className="mt-0.5 truncate text-xs text-gray-500" title={pair.fornecedor}>{pair.fornecedor}</p>
                      </div>
                      <span className="flex-shrink-0 text-xs tabular-nums text-gray-400">{fmtDate(pair.date)}</span>
                    </div>

                    <div className="space-y-2">
                      {pair.docs.map((doc) => {
                        const tipo = getTipo(doc);
                        const tipoConf = TIPO_CONFIG[tipo] || TIPO_CONFIG.DOC;
                        const TipoIcon = tipoConf.Icon;
                        const fileUrl = getFileUrl(doc);

                        return (
                          <div key={doc.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                            <TipoIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                            <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tipoConf.color}`}>{tipoConf.label}</span>
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700" title={getFileName(doc)}>{getFileName(doc)}</span>
                            <div className="flex flex-shrink-0 items-center gap-1">
                              {fileUrl && (
                                <>
                                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" title="Ver" className="rounded p-1 text-gray-400 hover:bg-white hover:text-blue-700">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                  <a href={fileUrl} download title="Baixar" className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700">
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                </>
                              )}
                              {tipo === 'XML' && !isXmlVinculado(doc) && (
                                <button onClick={() => setVincularXml(doc)} title="Vincular ao PDF" className="rounded p-1 text-blue-400 hover:bg-white hover:text-blue-700">
                                  <Link2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {tipo === 'XML' && isXmlVinculado(doc) && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              )}
                              <button onClick={() => handleDelete(doc)} title="Deletar" className="rounded p-1 text-gray-300 hover:bg-white hover:text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {vincularXml && (
        <VincularXmlModal
          xmlDoc={vincularXml}
          pdfsDisponiveis={pdfsDisponiveis}
          onConfirm={handleVincularXml}
          onClose={() => setVincularXml(null)}
        />
      )}
    </div>
  );
}
