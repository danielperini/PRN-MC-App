import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  FileText,
  FileCode,
  File,
  ExternalLink,
  Download,
  Trash2,
  Link2,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'svg', 'heic', 'heif'];

function getFileName(doc) {
  return doc?.file_name || doc?.nf_nome_renomeado || doc?.nf_nome_original || 'Documento';
}

function getFileUrl(doc) {
  return doc?.file_url || doc?.nf_pdf_url || doc?.nf_xml_url || doc?.comprovante_url || '';
}

function getExtension(doc) {
  const name = getFileName(doc).toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match?.[1] || '';
}

function isImagem(doc) {
  const mime = String(doc?.file_type || doc?.mime_type || '').toLowerCase();
  return mime.startsWith('image/') || IMAGE_EXTENSIONS.includes(getExtension(doc));
}

function isRecibo(doc) {
  const text = normalizeText([
    doc?.file_name,
    doc?.nf_nome_original,
    doc?.description,
    doc?.categoria,
    doc?.tipo,
    doc?.nf_tipo_documento,
  ].filter(Boolean).join(' '));

  return ['recibo', 'comprovante', 'pagamento', 'boleto', 'pix'].some((term) => text.includes(term));
}

function getTipo(doc) {
  const mime = String(doc?.file_type || doc?.mime_type || '').toLowerCase();
  const ext = getExtension(doc);
  const nfTipo = normalizeText(doc?.nf_tipo_documento);

  if (nfTipo === 'xml_nf' || mime.includes('xml') || ext === 'xml') return 'XML';
  if (isRecibo(doc)) return 'RECIBO';
  if (nfTipo === 'pdf_nf' || mime.includes('pdf') || ext === 'pdf') return 'PDF';
  return 'DOC';
}

function getFornecedor(doc) {
  return doc?.nf_emitente_nome || doc?.fornecedor_nome || doc?.description || 'Fornecedor não identificado';
}

function getDocDate(doc) {
  return doc?.nf_data_emissao || doc?.competencia || doc?.created_date || doc?.updated_date || '';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function getMonthKey(doc) {
  const date = new Date(getDocDate(doc));
  if (Number.isNaN(date.getTime())) return 'sem-data';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key) {
  if (key === 'sem-data') return 'Sem data';
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getPurchaseIds(doc) {
  return [
    doc?.purchase_id,
    doc?.purchase_request_id,
    doc?.purchaseRequestId,
    doc?.solicitacao_id,
    doc?.report_id,
  ].filter(Boolean).map(String);
}

function getPairIds(doc) {
  return [
    doc?.nf_pdf_intake_id,
    doc?.nf_xml_intake_id,
    doc?.nf_xml_vinculado_a,
    doc?.nf_pdf_vinculado_a,
    doc?.documento_pai_id,
    doc?.pair_id,
    doc?.par_id,
    doc?.intake_pair_id,
    doc?.entrada_unica_pair_id,
    doc?.comprovante_pdf_id,
    doc?.recibo_pdf_id,
    doc?.pdf_recibo_id,
    doc?.intake_id,
    ...getPurchaseIds(doc),
  ].filter(Boolean).map(String);
}

function getBaseFileKey(doc) {
  return normalizeKey(
    getFileName(doc)
      .replace(/\.[^.]+$/, '')
      .replace(/\([0-9]+\)/g, '')
      .replace(/\b(pdf|xml|recibo|comprovante|pagamento|boleto|pix|nfe|nfse|nf|nota|fiscal|museus|centro|servico|serviço|sem|num|fornecedor)\b/gi, '')
  );
}

function getFiscalKey(doc) {
  const nf = normalizeKey(doc?.nf_numero || doc?.numero_nf || doc?.nota_numero || '');
  const cnpj = normalizeKey(doc?.nf_emitente_cpf_cnpj || doc?.fornecedor_cpf_cnpj || doc?.fornecedor_cnpj || '');
  const fornecedor = normalizeKey(doc?.nf_emitente_nome || doc?.fornecedor_nome || '');
  const valor = toNumber(doc?.nf_valor_total || doc?.valor_total || doc?.valor || 0);

  if (nf && nf !== 'semnum' && cnpj) return `nf:${nf}:cnpj:${cnpj}`;
  if (nf && nf !== 'semnum' && fornecedor) return `nf:${nf}:fornecedor:${fornecedor}`;
  if (nf && nf !== 'semnum' && valor) return `nf:${nf}:valor:${valor}`;
  if (nf && nf !== 'semnum') return `nf:${nf}`;

  const base = getBaseFileKey(doc);
  if (base.length >= 8) return `base:${base}`;

  const url = normalizeText(getFileUrl(doc));
  if (url) return `url:${url}`;

  return `id:${doc?.id}`;
}

function getLogicalDocumentKey(doc) {
  const tipo = getTipo(doc);
  const url = normalizeText(getFileUrl(doc));
  const fiscal = getFiscalKey(doc);

  if (url) return `${tipo}:url:${url}`;
  return `${tipo}:${fiscal}`;
}

function getPairKey(doc) {
  const purchaseIds = getPurchaseIds(doc);
  if (purchaseIds.length) return `purchase:${purchaseIds.sort().join('|')}`;

  const pairIds = getPairIds(doc);
  if (pairIds.length) return `pair:${pairIds.sort().join('|')}`;

  const fiscal = getFiscalKey(doc);
  if (!fiscal.startsWith('id:')) return fiscal;

  const url = normalizeText(getFileUrl(doc));
  if (url) return `url:${url}`;

  return `single:${doc?.id}`;
}

function preferDoc(a, b) {
  const score = (doc) =>
    (getPairIds(doc).length ? 20 : 0) +
    (getPurchaseIds(doc).length ? 10 : 0) +
    (getFileUrl(doc) ? 3 : 0) +
    (doc?.nf_numero ? 1 : 0);

  const diff = score(b) - score(a);
  if (diff !== 0) return diff;
  return new Date(getDocDate(b) || 0) - new Date(getDocDate(a) || 0);
}

function dedupeDocs(docs) {
  const map = new Map();

  docs.forEach((doc) => {
    const key = getLogicalDocumentKey(doc);
    if (!map.has(key)) {
      map.set(key, doc);
      return;
    }

    map.set(key, [map.get(key), doc].sort(preferDoc)[0]);
  });

  return Array.from(map.values());
}

function buildGroups(docs) {
  const valid = (docs || [])
    .filter((doc) => doc?.id)
    .filter((doc) => doc?.status_registro !== 'DELETADO')
    .filter((doc) => !isImagem(doc));

  const byPair = new Map();

  valid.forEach((doc) => {
    const key = getPairKey(doc);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(doc);
  });

  const rows = Array.from(byPair.entries()).map(([key, rowDocs]) => {
    const docsDeduped = dedupeDocs(rowDocs).sort((a, b) => {
      const order = { PDF: 1, XML: 2, RECIBO: 3, DOC: 4 };
      return (order[getTipo(a)] || 9) - (order[getTipo(b)] || 9);
    });

    const primary = docsDeduped.find((doc) => getTipo(doc) === 'PDF') || docsDeduped[0];
    const tipos = new Set(docsDeduped.map(getTipo));
    const nf = primary?.nf_numero || primary?.numero_nf || primary?.nota_numero;
    const fornecedor = getFornecedor(primary);

    return {
      key,
      docs: docsDeduped,
      monthKey: getMonthKey(primary),
      date: getDocDate(primary),
      tipo: tipos.has('PDF') && tipos.has('XML') ? 'XML + PDF' : tipos.has('PDF') && tipos.has('RECIBO') ? 'Recibo + PDF' : 'Sem par',
      title: nf && fornecedor ? `NF ${nf} — ${fornecedor}` : nf ? `NF ${nf}` : getFileName(primary),
      fornecedor,
      categoria: nf || primary?.nf_emitente_nome || primary?.nf_valor_total ? 'Nota Fiscal' : isRecibo(primary) ? 'Recibo/Comprovante' : 'Documento',
    };
  });

  const byMonth = new Map();
  rows.forEach((row) => {
    if (!byMonth.has(row.monthKey)) byMonth.set(row.monthKey, []);
    byMonth.get(row.monthKey).push(row);
  });

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, items]) => ({
      monthKey,
      label: getMonthLabel(monthKey),
      rows: items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    }));
}

function findDuplicateCount(docs) {
  const map = new Map();
  (docs || []).forEach((doc) => {
    if (!doc?.id || doc?.status_registro === 'DELETADO' || isImagem(doc)) return;
    const key = getLogicalDocumentKey(doc);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(doc);
  });

  return Array.from(map.values()).reduce((acc, group) => acc + Math.max(0, group.length - 1), 0);
}

const TIPO_CONFIG = {
  PDF: { label: 'PDF', color: 'bg-red-50 text-red-700', Icon: FileText },
  XML: { label: 'XML', color: 'bg-blue-50 text-blue-700', Icon: FileCode },
  RECIBO: { label: 'RECIBO', color: 'bg-green-50 text-green-700', Icon: FileText },
  DOC: { label: 'DOC', color: 'bg-indigo-50 text-indigo-700', Icon: File },
};

function DocumentoLink({ doc }) {
  const tipo = getTipo(doc);
  const config = TIPO_CONFIG[tipo] || TIPO_CONFIG.DOC;
  const Icon = config.Icon;
  const url = getFileUrl(doc);

  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${config.color}`}>{config.label}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-700" title={getFileName(doc)}>
        {getFileName(doc)}
      </span>
      {url && (
        <span className="flex flex-shrink-0 items-center gap-0.5">
          <a href={url} target="_blank" rel="noopener noreferrer" title="Ver" className="rounded p-0.5 text-gray-400 hover:text-blue-700">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a href={url} download title="Baixar" className="rounded p-0.5 text-gray-400 hover:text-gray-700">
            <Download className="h-3.5 w-3.5" />
          </a>
        </span>
      )}
    </span>
  );
}

export default function GestaoDocumentalClean() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const { data: documentosRaw = [], isLoading } = useQuery({
    queryKey: ['gestao-documental'],
    queryFn: async () => base44.entities.Attachment.list('-created_date', 1000),
  });

  const documentosBase = useMemo(() => {
    return (documentosRaw || [])
      .filter((doc) => doc?.id)
      .filter((doc) => doc?.status_registro !== 'DELETADO')
      .filter((doc) => !isImagem(doc));
  }, [documentosRaw]);

  const duplicateKeys = useMemo(() => {
    const map = new Map();
    documentosBase.forEach((doc) => {
      const key = getLogicalDocumentKey(doc);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(doc.id);
    });
    return new Set(Array.from(map.values()).filter((ids) => ids.length > 1).flat());
  }, [documentosBase]);

  const filtrados = useMemo(() => {
    const query = normalizeText(search);
    const base = showDuplicatesOnly ? documentosBase.filter((doc) => duplicateKeys.has(doc.id)) : documentosBase;

    if (!query) return base;

    return base.filter((doc) => {
      return normalizeText([
        getFileName(doc),
        getFornecedor(doc),
        doc?.nf_numero,
        doc?.numero_nf,
        getTipo(doc),
        doc?.description,
      ].filter(Boolean).join(' ')).includes(query);
    });
  }, [documentosBase, duplicateKeys, search, showDuplicatesOnly]);

  const grupos = useMemo(() => buildGroups(filtrados), [filtrados]);
  const duplicateCount = useMemo(() => findDuplicateCount(documentosBase), [documentosBase]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['gestao-documental'] });
    await queryClient.invalidateQueries({ queryKey: ['attachments-compras'] });
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Remover ${getFileName(doc)}?`)) return;

    try {
      try {
        await base44.entities.Attachment.delete(doc.id);
      } catch {
        await base44.entities.Attachment.update(doc.id, { status_registro: 'DELETADO' });
      }
      toast.success('Documento removido.');
      await refresh();
    } catch (error) {
      toast.error(`Erro ao remover: ${error.message}`);
    }
  }

  async function handleDeleteDuplicates() {
    const grouped = new Map();
    documentosBase.forEach((doc) => {
      const key = getLogicalDocumentKey(doc);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(doc);
    });

    const duplicates = Array.from(grouped.values()).flatMap((group) => {
      if (group.length <= 1) return [];
      const ordered = [...group].sort(preferDoc);
      return ordered.slice(1);
    });

    if (duplicates.length === 0) {
      toast.info('Nenhuma entrada repetida encontrada.');
      return;
    }

    if (!window.confirm(`Remover ${duplicates.length} entradas repetidas, mantendo apenas a melhor versão?`)) return;

    try {
      for (const doc of duplicates) {
        try {
          await base44.entities.Attachment.delete(doc.id);
        } catch {
          await base44.entities.Attachment.update(doc.id, { status_registro: 'DELETADO' });
        }
      }
      toast.success(`${duplicates.length} entradas repetidas removidas.`);
      await refresh();
    } catch (error) {
      toast.error(`Erro ao remover repetidos: ${error.message}`);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-800">Documentos</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{filtrados.length}</span>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500">
            {duplicateCount} repetidos
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={showDuplicatesOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowDuplicatesOnly((value) => !value)}
            className="gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            {showDuplicatesOnly ? 'Ver todos' : 'Pesquisar repetidos'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeleteDuplicates}
            className="gap-1.5 text-red-700 hover:text-red-800"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Apagar repetidos
          </Button>

          <div className="relative w-72 max-w-full">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="Buscar arquivo, fornecedor, NF..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando documentos...</div>
      ) : grupos.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-200" />
          <p className="text-sm text-gray-400">Nenhum documento encontrado</p>
        </div>
      ) : (
        <div className="p-4">
          {grupos.map((grupo) => (
            <section key={grupo.monthKey} className="mb-8 last:mb-0">
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-gray-100 pb-2">
                <div>
                  <h3 className="text-base font-semibold capitalize text-black">{grupo.label}</h3>
                  <p className="text-xs text-gray-500">{grupo.rows.length} linhas consolidadas</p>
                </div>
              </div>

              <div className="w-full overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full table-fixed border-collapse text-xs">
                  <colgroup>
                    <col className="w-[90px]" />
                    <col className="w-[24%]" />
                    <col className="w-[18%]" />
                    <col className="w-[82px]" />
                    <col />
                    <col className="w-[96px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-2 py-2 font-medium text-gray-600">Tipo</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Referência</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Fornecedor</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Data</th>
                      <th className="px-2 py-2 font-medium text-gray-600">Arquivos vinculados</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-600">Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {grupo.rows.map((row, index) => (
                      <tr key={`${grupo.monthKey}-${row.key}`} className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="px-2 py-2 align-top">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.tipo === 'Sem par' ? 'border border-gray-200 bg-white text-gray-700' : 'bg-black text-white'}`}>
                            {row.tipo}
                          </span>
                        </td>

                        <td className="px-2 py-2 align-top">
                          <p className="truncate font-medium text-gray-900" title={row.title}>{row.title}</p>
                          <p className="truncate text-[11px] text-gray-400">{row.categoria}</p>
                        </td>

                        <td className="px-2 py-2 align-top text-gray-600">
                          <p className="truncate" title={row.fornecedor}>{row.fornecedor}</p>
                        </td>

                        <td className="px-2 py-2 align-top text-[11px] tabular-nums text-gray-500">{formatDate(row.date)}</td>

                        <td className="px-2 py-2 align-top">
                          <div className="grid min-w-0 grid-cols-1 gap-1 lg:grid-cols-2">
                            {row.docs.map((doc) => <DocumentoLink key={doc.id} doc={doc} />)}
                          </div>
                        </td>

                        <td className="px-2 py-2 align-top">
                          <div className="flex items-center justify-center gap-1">
                            <Link2 className="h-3.5 w-3.5 text-gray-300" />
                            {row.docs.map((doc) => (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => handleDelete(doc)}
                                title={`Deletar ${getFileName(doc)}`}
                                className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ))}
                          </div>
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
