import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FileText, FileCode, File,
  Search, Trash2, ExternalLink, Download, Link2, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { deletePurchaseRequest } from '@/lib/deleteIntegrado';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function toNumber(v) {
  const n = Number(String(v || '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

// Extensões e MIME types de imagem — EXCLUIR da gestão documental
const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.svg', '.heic', '.heif']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/heic']);

function isImagem(doc) {
  const mime = String(doc?.file_type || doc?.mime_type || '').toLowerCase();
  if (IMAGE_MIMES.has(mime)) return true;
  const name = normalizeText(doc?.file_name || doc?.nf_nome_original || '');
  return [...IMAGE_EXTS].some((ext) => name.endsWith(ext));
}

function getTipo(doc) {
  const mime = String(doc?.file_type || doc?.mime_type || '').toLowerCase();
  const name = normalizeText(doc?.file_name || doc?.nf_nome_original || '');
  const nfTipo = normalizeText(doc?.nf_tipo_documento || '');

  if (nfTipo === 'xml_nf' || mime.includes('xml') || name.endsWith('.xml')) return 'XML';
  if (nfTipo === 'pdf_nf' || mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'DOC';
  return 'DOC';
}

function getCategoria(doc) {
  if (doc?.nf_numero || doc?.nf_emitente_nome || doc?.nf_valor_total) return 'Nota Fiscal';
  const desc = normalizeText(doc?.description || doc?.file_name || '');
  if (desc.includes('contrato')) return 'Contrato';
  if (desc.includes('nota') || desc.includes('nf') || desc.includes('nfe')) return 'Nota Fiscal';
  return 'Documento';
}

function getFileName(doc) {
  return doc?.file_name || doc?.nf_nome_renomeado || doc?.nf_nome_original || 'Documento';
}

function getFileUrl(doc) {
  return doc?.file_url || '';
}

function getFornecedor(doc) {
  return doc?.nf_emitente_nome || doc?.fornecedor_nome || doc?.description || '—';
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function isXmlVinculado(doc) {
  // XML que já tem vínculo com um PDF (possui nf_xml_intake_id gravado no PDF correspondente
  // ou tem campo nf_pdf_intake_id / nf_pdf_url diretamente no XML)
  return getTipo(doc) === 'XML' && (
    doc?.nf_pdf_intake_id || doc?.nf_xml_vinculado_a || doc?.nf_pdf_url
  );
}

function filtrarEDeduplicar(docs) {
  const map = new Map();

  (docs || []).forEach((doc) => {
    if (!doc?.id) return;
    if (doc?.status_registro === 'DELETADO') return;
    if (isImagem(doc)) return; // ← exclui fotos/imagens
    // XMLs já vinculados a um PDF somem da lista
    if (isXmlVinculado(doc)) return;

    const key = getFileUrl(doc) || doc.id;
    if (!map.has(key)) map.set(key, doc);
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)
  );
}

const TIPO_CONFIG = {
  PDF: { label: 'PDF', color: 'bg-red-50 text-red-700',  Icon: FileText },
  XML: { label: 'XML', color: 'bg-blue-50 text-blue-700', Icon: FileCode },
  DOC: { label: 'DOC', color: 'bg-indigo-50 text-indigo-700', Icon: File },
};

const CATEG_COLOR = {
  'Nota Fiscal': 'bg-amber-50 text-amber-700',
  'Contrato':    'bg-purple-50 text-purple-700',
  'Documento':   'bg-gray-100 text-gray-600',
};

// ─── Modal de vínculo XML → PDF ──────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function GestaoDocumental() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [vincularXml, setVincularXml] = useState(null); // doc XML aguardando vínculo

  const { data: todosDocumentos = [], isLoading } = useQuery({
    queryKey: ['gestao-documental'],
    queryFn: async () => base44.entities.Attachment.list('-created_date', 500)
  });

  const documentos = useMemo(() => filtrarEDeduplicar(todosDocumentos), [todosDocumentos]);

  // PDFs disponíveis para receber vínculo com um XML (qualquer PDF, vinculados ou não)
  const pdfsDisponiveis = useMemo(() =>
    (todosDocumentos || []).filter((d) => {
      if (d?.status_registro === 'DELETADO') return false;
      if (isImagem(d)) return false;
      return getTipo(d) === 'PDF';
    }).sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
  , [todosDocumentos]);

  async function handleVincularXml(pdfDoc) {
    if (!vincularXml || !pdfDoc) return;
    try {
      // Atualiza o PDF: marca que tem um XML vinculado
      await base44.entities.Attachment.update(pdfDoc.id, {
        nf_xml_intake_id: vincularXml.id,
        nf_xml_url: getFileUrl(vincularXml),
      });
      // Atualiza o XML: marca que está vinculado a esse PDF (e some da lista)
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
      normalizeText(doc?.nf_numero || '').includes(s)
    );
  }, [documentos, search]);

  async function handleDelete(doc) {
    if (!window.confirm('Remover documento e solicitações vinculadas?')) return;
    try {
      // Se houver PurchaseRequest vinculada via report_id, deletar integrado
      if (doc.report_id) {
        const pr = await base44.entities.PurchaseRequest.get(doc.report_id).catch(() => null);
        if (pr) {
          await deletePurchaseRequest(pr);
        }
      }
      // Soft delete do attachment
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
    <div className="rounded-xl border border-gray-200 bg-white">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-800">Documentos</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {filtrados.length}
          </span>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Buscar arquivo, fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando documentos...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-200" />
          <p className="text-sm text-gray-400">Nenhum documento encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[35%]" />
              <col className="w-[8%]"  />
              <col className="w-[14%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]"  />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-2.5">Nome do arquivo</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Categoria</th>
                <th className="px-3 py-2.5">Fornecedor / Descrição</th>
                <th className="px-3 py-2.5">Data de envio</th>
                <th className="px-3 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((doc, i) => {
                const tipo    = getTipo(doc);
                const categ   = getCategoria(doc);
                const tipoConf = TIPO_CONFIG[tipo] || TIPO_CONFIG.DOC;
                const TipoIcon = tipoConf.Icon;
                const fileUrl  = getFileUrl(doc);

                return (
                  <tr
                    key={doc.id}
                    className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                  >
                    {/* Nome */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <TipoIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span className="truncate text-gray-800 font-medium" title={getFileName(doc)}>
                          {getFileName(doc)}
                        </span>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${tipoConf.color}`}>
                        {tipoConf.label}
                      </span>
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${CATEG_COLOR[categ] || 'bg-gray-100 text-gray-600'}`}>
                        {categ}
                      </span>
                    </td>

                    {/* Fornecedor */}
                    <td className="px-3 py-2.5 text-gray-600 truncate" title={getFornecedor(doc)}>
                      {getFornecedor(doc)}
                    </td>

                    {/* Data */}
                    <td className="px-3 py-2.5 text-gray-500 tabular-nums">
                      {fmtDate(doc.created_date)}
                    </td>

                    {/* Ações */}
                    <td className="px-3 py-2.5">
                     <div className="flex items-center justify-center gap-1">
                       {fileUrl && (
                         <>
                           <a
                             href={fileUrl}
                             target="_blank"
                             rel="noopener noreferrer"
                             title="Ver"
                             className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-700"
                           >
                             <ExternalLink className="h-3.5 w-3.5" />
                           </a>
                           <a
                             href={fileUrl}
                             download
                             title="Baixar"
                             className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                           >
                             <Download className="h-3.5 w-3.5" />
                           </a>
                         </>
                       )}
                       {/* Botão Vincular para XMLs sem vínculo */}
                       {tipo === 'XML' && !doc?.nf_pdf_intake_id && !doc?.nf_pdf_url && (
                         <button
                           onClick={() => setVincularXml(doc)}
                           title="Vincular ao PDF"
                           className="rounded p-1 text-blue-400 hover:bg-blue-50 hover:text-blue-700"
                         >
                           <Link2 className="h-3.5 w-3.5" />
                         </button>
                       )}
                       <button
                         onClick={() => handleDelete(doc)}
                         title="Deletar"
                         className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
                       >
                         <Trash2 className="h-3.5 w-3.5" />
                       </button>
                     </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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