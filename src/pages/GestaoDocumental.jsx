import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import LoadingPage from '@/components/common/LoadingPage';
import {
  FileText,
  FileCode,
  File,
  Search,
  Trash2,
  ExternalLink,
  Download,
  Link2,
  CheckCircle2,
  Pencil,
  Copy,
  Save,
  Cloud,
  CloudOff,
  Loader2,
  RotateCcw
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
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeLoose(v) {
  return normalizeText(v).replace(/[^a-z0-9]/g, '');
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

  const raw = String(v || '').trim();

  if (!raw) return 0;

  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(normalized);

  return Number.isNaN(n) ? 0 : n;
}

const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
  '.svg',
  '.heic',
  '.heif'
]);

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
  'image/heic'
]);

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
  return doc?.file_url || doc?.nf_pdf_url || doc?.nf_xml_url || doc?.comprovante_url || '';
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
  return doc?.nf_data_emissao ||
    doc?.competencia ||
    doc?.created_date ||
    doc?.updated_date ||
    new Date().toISOString();
}

function fmtDate(v) {
  if (!v) return '—';

  const d = new Date(v);

  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

function getMonthKey(doc) {
  const d = new Date(getDocDate(doc));

  if (Number.isNaN(d.getTime())) return 'sem-data';

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey) {
  if (monthKey === 'sem-data') return 'Sem data';

  const [year, month] = monthKey.split('-').map(Number);

  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

function getLinkedPurchaseIds(doc) {
  return [
    doc?.purchase_id,
    doc?.purchase_request_id,
    doc?.purchaseRequestId,
    doc?.solicitacao_id,
    doc?.report_id
  ].filter(Boolean).map(String);
}

function getExplicitPairIds(doc) {
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
    doc?.purchase_id,
    doc?.purchase_request_id,
    doc?.purchaseRequestId,
    doc?.solicitacao_id,
    doc?.intake_id
  ].filter(Boolean).map(String);
}

function getBaseFileKey(doc) {
  return normalizeLoose(
    getFileName(doc)
      .replace(/\.[^.]+$/, '')
      .replace(/\([0-9]+\)/g, '')
      .replace(/\b(pdf|xml|recibo|comprovante|pagamento|boleto|pix|nfe|nfse|nf|nota|fiscal|museus|centro|servico|serviço)\b/gi, '')
  );
}

function getFallbackFiscalKey(doc) {
  const nf = normalizeLoose(doc?.nf_numero || doc?.numero_nf || doc?.nota_numero || '');
  const cnpj = normalizeLoose(doc?.nf_emitente_cpf_cnpj || doc?.fornecedor_cpf_cnpj || doc?.fornecedor_cnpj || '');
  const fornecedor = normalizeLoose(doc?.nf_emitente_nome || doc?.fornecedor_nome || '');
  const valor = toNumber(doc?.nf_valor_total || doc?.valor_total || doc?.valor || 0);

  if (nf && cnpj) return `nf-${nf}-${cnpj}`;
  if (nf && fornecedor) return `nf-${nf}-${fornecedor}`;
  if (nf && valor) return `nf-${nf}-${valor}`;
  if (nf) return `nf-${nf}`;

  const base = getBaseFileKey(doc);

  if (base && base.length >= 6) return `base-${base}`;

  return `avulso-${doc.id}`;
}

function getDuplicateKey(doc) {
  const url = normalizeText(getFileUrl(doc));

  if (url) return `url:${url}`;

  return `${getTipo(doc)}:${getFallbackFiscalKey(doc)}:${getBaseFileKey(doc)}`;
}

function findDuplicateGroups(docs) {
  const map = new Map();

  (docs || []).forEach((doc) => {
    const key = getDuplicateKey(doc);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(doc);
  });

  return Array.from(map.values())
    .filter((items) => items.length > 1)
    .map((items) =>
      [...items].sort(
        (a, b) => new Date(getDocDate(a) || 0) - new Date(getDocDate(b) || 0)
      )
    );
}

function scoreDoc(doc) {
  return (
    (getExplicitPairIds(doc).length ? 10 : 0) +
    (getLinkedPurchaseIds(doc).length ? 5 : 0) +
    (getFileUrl(doc) ? 2 : 0) +
    (doc?.nf_numero ? 1 : 0)
  );
}

function preferBestDoc(items) {
  return [...(items || [])].sort((a, b) => {
    const diff = scoreDoc(b) - scoreDoc(a);

    if (diff !== 0) return diff;

    return new Date(getDocDate(b) || 0) - new Date(getDocDate(a) || 0);
  })[0];
}

function uniqueBy(items, getKey) {
  const map = new Map();

  (items || []).forEach((item) => {
    const key = getKey(item);

    if (!map.has(key)) {
      map.set(key, item);
      return;
    }

    map.set(key, preferBestDoc([map.get(key), item]));
  });

  return Array.from(map.values());
}

function isXmlVinculado(doc) {
  return getTipo(doc) === 'XML' && !!(
    doc?.nf_pdf_intake_id ||
    doc?.nf_xml_vinculado_a ||
    doc?.nf_pdf_url
  );
}

function isReciboVinculado(doc) {
  return getTipo(doc) === 'RECIBO' && !!(
    doc?.pdf_recibo_id ||
    doc?.comprovante_pdf_id ||
    doc?.documento_pai_id ||
    doc?.nf_pdf_url
  );
}

function isDocumentoVinculado(doc) {
  if (getTipo(doc) === 'XML') return isXmlVinculado(doc);
  if (getTipo(doc) === 'RECIBO') return isReciboVinculado(doc);

  return !!(
    doc?.nf_xml_intake_id ||
    doc?.nf_xml_url ||
    doc?.recibo_pdf_id ||
    doc?.comprovante_url ||
    doc?.documento_pai_id ||
    doc?.pair_id ||
    doc?.par_id
  );
}

function filtrarEDeduplicar(docs) {
  const grouped = new Map();

  (docs || []).forEach((doc) => {
    if (!doc?.id) return;
    if (doc?.status_registro === 'DELETADO') return;
    if (isImagem(doc)) return;

    const key = getDuplicateKey(doc);

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(doc);
  });

  return Array.from(grouped.values())
    .map((items) => preferBestDoc(items))
    .sort((a, b) => new Date(getDocDate(b) || 0) - new Date(getDocDate(a) || 0));
}

function getPairTitle(docs) {
  const primary =
    docs.find((d) => getTipo(d) === 'PDF') ||
    docs.find((d) => getTipo(d) === 'RECIBO') ||
    docs[0];

  const nf = primary?.nf_numero || primary?.numero_nf || primary?.nota_numero;
  const fornecedor = getFornecedor(primary);

  if (nf && fornecedor && fornecedor !== '—') return `NF ${nf} — ${fornecedor}`;
  if (nf) return `NF ${nf}`;

  return getFileName(primary);
}

function getPairType(docs) {
  const tipos = new Set(docs.map(getTipo));

  if (tipos.has('PDF') && tipos.has('XML')) return 'XML + PDF';
  if (tipos.has('PDF') && tipos.has('RECIBO')) return 'Recibo + PDF';

  return 'Sem par';
}

function getPairDocKey(doc) {
  return `${getTipo(doc)}:${getDuplicateKey(doc)}`;
}

function connectComponents(nodes, edges) {
  const parent = new Map();

  nodes.forEach((n) => parent.set(n, n));

  const find = (x) => {
    const p = parent.get(x);

    if (p === x) return x;

    const root = find(p);

    parent.set(x, root);

    return root;
  };

  const union = (a, b) => {
    if (!parent.has(a) || !parent.has(b)) return;

    const ra = find(a);
    const rb = find(b);

    if (ra !== rb) {
      parent.set(rb, ra);
    }
  };

  edges.forEach(([a, b]) => union(a, b));

  const groups = new Map();

  nodes.forEach((n) => {
    const root = find(n);

    if (!groups.has(root)) {
      groups.set(root, []);
    }

    groups.get(root).push(n);
  });

  return Array.from(groups.values());
}

function buildDocumentGroups(docs) {
  const docsById = new Map((docs || []).map((doc) => [String(doc.id), doc]));
  const edges = [];
  const groupedByFiscal = new Map();
  const groupedByPurchase = new Map();

  (docs || []).forEach((doc) => {
    const docId = String(doc.id);

    getExplicitPairIds(doc).forEach((linkedId) => {
      if (docsById.has(linkedId)) {
        edges.push([docId, linkedId]);
      }
    });

    getLinkedPurchaseIds(doc).forEach((purchaseId) => {
      if (!groupedByPurchase.has(purchaseId)) {
        groupedByPurchase.set(purchaseId, []);
      }

      groupedByPurchase.get(purchaseId).push(docId);
    });

    const fiscalKey = getFallbackFiscalKey(doc);

    if (!groupedByFiscal.has(fiscalKey)) {
      groupedByFiscal.set(fiscalKey, []);
    }

    groupedByFiscal.get(fiscalKey).push(docId);
  });

  [...groupedByFiscal.values(), ...groupedByPurchase.values()].forEach((ids) => {
    if (ids.length > 1) {
      ids.slice(1).forEach((id) => edges.push([ids[0], id]));
    }
  });

  const components = connectComponents((docs || []).map((doc) => String(doc.id)), edges);

  const pairs = components.map((ids) => {
    const pairDocs = uniqueBy(
      ids
        .map((id) => docsById.get(id))
        .filter(Boolean),
      getPairDocKey
    ).sort((a, b) => {
      const order = {
        PDF: 1,
        XML: 2,
        RECIBO: 3,
        DOC: 4
      };

      return (order[getTipo(a)] || 9) - (order[getTipo(b)] || 9);
    });

    return {
      key: pairDocs.map((doc) => doc.id).sort().join('-'),
      docs: pairDocs,
      title: getPairTitle(pairDocs),
      type: getPairType(pairDocs),
      date: getDocDate(pairDocs[0]),
      fornecedor: getFornecedor(pairDocs[0]),
      categoria: getCategoria(pairDocs[0]),
      purchaseIds: Array.from(new Set(pairDocs.flatMap(getLinkedPurchaseIds))),
      monthKey: getMonthKey(pairDocs[0]),
      hasPdf: pairDocs.some((doc) => getTipo(doc) === 'PDF'),
      hasXml: pairDocs.some((doc) => getTipo(doc) === 'XML'),
      hasRecibo: pairDocs.some((doc) => getTipo(doc) === 'RECIBO')
    };
  });

  const byMonth = new Map();

  pairs.forEach((pair) => {
    if (!byMonth.has(pair.monthKey)) {
      byMonth.set(pair.monthKey, []);
    }

    byMonth.get(pair.monthKey).push(pair);
  });

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthPairs]) => ({
      monthKey,
      label: getMonthLabel(monthKey),
      pairs: monthPairs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
      totalDocs: monthPairs.reduce((acc, pair) => acc + pair.docs.length, 0)
    }));
}

const TIPO_CONFIG = {
  PDF: { label: 'PDF', color: 'bg-red-50 text-red-700', Icon: FileText },
  XML: { label: 'XML', color: 'bg-blue-50 text-blue-700', Icon: FileCode },
  RECIBO: { label: 'RECIBO', color: 'bg-green-50 text-green-700', Icon: FileText },
  DOC: { label: 'DOC', color: 'bg-indigo-50 text-indigo-700', Icon: File }
};

const PAIR_COLOR = {
  'XML + PDF': 'bg-black text-white',
  'Recibo + PDF': 'bg-gray-900 text-white',
  'Sem par': 'bg-white text-gray-700 border border-gray-200'
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
              <p className="text-sm text-slate-600 font-medium">
                Escolha o PDF desta nota fiscal:
              </p>

              {pdfsDisponiveis.map((pdf) => {
                const emitente = pdf?.nf_emitente_nome || pdf?.description || '';

                const valor = pdf?.nf_valor_total
                  ? `R$ ${Number(pdf.nf_valor_total).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2
                    })}`
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
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {getFileName(pdf)}
                      </p>

                      <p className="text-xs text-slate-500">
                        {[emitente, valor].filter(Boolean).join(' · ')}
                        {vinculado && (
                          <span className="ml-2 text-amber-600">(já tem XML)</span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditarSolicitacaoModal({ purchase, onChange, onSave, onClose, saving }) {
  if (!purchase) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Editar dados da solicitação vinculada
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Descrição
            </label>
            <Input
              value={purchase.descricao_item || ''}
              onChange={(e) => onChange({ ...purchase, descricao_item: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Fornecedor
            </label>
            <Input
              value={purchase.fornecedor_nome || ''}
              onChange={(e) => onChange({ ...purchase, fornecedor_nome: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Centro de custo
            </label>
            <Input
              value={purchase.centro_custo || ''}
              onChange={(e) => onChange({ ...purchase, centro_custo: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              NF número
            </label>
            <Input
              value={purchase.nf_numero || ''}
              onChange={(e) => onChange({ ...purchase, nf_numero: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Valor solicitado
            </label>
            <Input
              value={purchase.valor_solicitado ?? purchase.valor_total ?? purchase.valor ?? ''}
              onChange={(e) => onChange({ ...purchase, valor_solicitado: e.target.value })}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Observações
            </label>
            <Input
              value={purchase.observacoes || ''}
              onChange={(e) => onChange({ ...purchase, observacoes: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>

          <Button onClick={onSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentoLink({ doc }) {
  const tipo = getTipo(doc);
  const tipoConf = TIPO_CONFIG[tipo] || TIPO_CONFIG.DOC;
  const TipoIcon = tipoConf.Icon;
  const fileUrl = getFileUrl(doc);

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1">
      <TipoIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />

      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tipoConf.color}`}>
        {tipoConf.label}
      </span>

      <span
        className="max-w-[220px] truncate text-xs font-medium text-gray-700"
        title={getFileName(doc)}
      >
        {getFileName(doc)}
      </span>

      {fileUrl && (
        <>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver"
            className="rounded p-0.5 text-gray-400 hover:text-blue-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <a
            href={fileUrl}
            download
            title="Baixar"
            className="rounded p-0.5 text-gray-400 hover:text-gray-700"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </>
      )}
    </span>
  );
}

export default function GestaoDocumental() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [vincularXml, setVincularXml] = useState(null);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [selectedAssociationByPair, setSelectedAssociationByPair] = useState({});
  const [syncingIds, setSyncingIds] = useState(new Set());

  const {
    data: todosDocumentos = [],
    isLoading,
    isError,
    isFetching
  } = useQuery({
    queryKey: ['gestao-documental'],
    queryFn: async () => {
      const data = await base44.entities.Attachment.list('-created_date', 500);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const documentosBase = useMemo(
    () =>
      (todosDocumentos || []).filter(
        (doc) => doc?.id && doc?.status_registro !== 'DELETADO' && !isImagem(doc)
      ),
    [todosDocumentos]
  );

  const documentos = useMemo(
    () => filtrarEDeduplicar(todosDocumentos),
    [todosDocumentos]
  );

  const duplicateGroups = useMemo(
    () => findDuplicateGroups(documentosBase),
    [documentosBase]
  );

  const duplicateIds = useMemo(
    () => new Set(duplicateGroups.flatMap((group) => group.map((doc) => doc.id))),
    [duplicateGroups]
  );

  const pdfsDisponiveis = useMemo(
    () =>
      documentosBase
        .filter((d) => getTipo(d) === 'PDF')
        .sort((a, b) => new Date(getDocDate(b) || 0) - new Date(getDocDate(a) || 0)),
    [documentosBase]
  );

  const arquivosDesvinculados = useMemo(() => {
    const docs = documentosBase.filter(
      (doc) => ['XML', 'RECIBO'].includes(getTipo(doc)) && !isDocumentoVinculado(doc)
    );

    return uniqueBy(docs, getDuplicateKey)
      .sort((a, b) => new Date(getDocDate(b) || 0) - new Date(getDocDate(a) || 0));
  }, [documentosBase]);

  const filtrados = useMemo(() => {
    const s = normalizeText(search);

    const base = showDuplicatesOnly
      ? documentosBase.filter((doc) => duplicateIds.has(doc.id))
      : documentos;

    if (!s) return base;

    return base.filter((doc) =>
      normalizeText(getFileName(doc)).includes(s) ||
      normalizeText(getFornecedor(doc)).includes(s) ||
      normalizeText(doc?.nf_numero || '').includes(s) ||
      normalizeText(getTipo(doc)).includes(s) ||
      normalizeText(getCategoria(doc)).includes(s)
    );
  }, [documentos, documentosBase, search, showDuplicatesOnly, duplicateIds]);

  const gruposMensais = useMemo(
    () => buildDocumentGroups(filtrados),
    [filtrados]
  );

  async function refreshDocumentos() {
    await queryClient.invalidateQueries({ queryKey: ['gestao-documental'] });
    await queryClient.invalidateQueries({ queryKey: ['attachments-compras'] });
  }

  async function handleVincularXml(pdfDoc) {
    if (!vincularXml || !pdfDoc) return;

    try {
      await base44.entities.Attachment.update(pdfDoc.id, {
        nf_xml_intake_id: vincularXml.id,
        nf_xml_url: getFileUrl(vincularXml)
      });

      await base44.entities.Attachment.update(vincularXml.id, {
        nf_pdf_intake_id: pdfDoc.id,
        nf_pdf_url: getFileUrl(pdfDoc),
        nf_xml_vinculado_a: pdfDoc.id
      });

      toast.success('XML vinculado ao PDF com sucesso.');
      setVincularXml(null);
      await refreshDocumentos();
    } catch (e) {
      toast.error('Erro ao vincular: ' + e.message);
    }
  }

  async function handleAssociarArquivo(pair) {
    const targetId = selectedAssociationByPair[pair.key];
    const selectedDoc = arquivosDesvinculados.find((doc) => doc.id === targetId);
    const pdfDoc = pair.docs.find((doc) => getTipo(doc) === 'PDF');

    if (!selectedDoc || !pdfDoc) {
      toast.warning('Selecione um XML ou recibo desvinculado.');
      return;
    }

    try {
      const tipo = getTipo(selectedDoc);
      const selectedUrl = getFileUrl(selectedDoc);
      const pdfUrl = getFileUrl(pdfDoc);

      if (tipo === 'XML') {
        await base44.entities.Attachment.update(pdfDoc.id, {
          nf_xml_intake_id: selectedDoc.id,
          nf_xml_url: selectedUrl
        });

        await base44.entities.Attachment.update(selectedDoc.id, {
          nf_pdf_intake_id: pdfDoc.id,
          nf_pdf_url: pdfUrl,
          nf_xml_vinculado_a: pdfDoc.id
        });
      } else {
        await base44.entities.Attachment.update(pdfDoc.id, {
          recibo_pdf_id: selectedDoc.id,
          comprovante_url: selectedUrl
        });

        await base44.entities.Attachment.update(selectedDoc.id, {
          pdf_recibo_id: pdfDoc.id,
          documento_pai_id: pdfDoc.id,
          nf_pdf_url: pdfUrl
        });
      }

      toast.success(`${tipo} associado ao PDF.`);
      setSelectedAssociationByPair((prev) => ({ ...prev, [pair.key]: '' }));
      await refreshDocumentos();
    } catch (e) {
      toast.error('Erro ao associar: ' + e.message);
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm('Remover documento e solicitações vinculadas?')) return;

    try {
      if (doc.report_id) {
        const pr = await base44.entities.PurchaseRequest.get(doc.report_id).catch(() => null);
        if (pr) await deletePurchaseRequest(pr);
      }

      try {
        await base44.entities.Attachment.delete(doc.id);
      } catch {
        await base44.entities.Attachment.update(doc.id, {
          status_registro: 'DELETADO'
        });
      }

      toast.success('Documento removido.');
      await refreshDocumentos();
    } catch (e) {
      toast.error('Erro ao deletar: ' + e.message);
    }
  }

  async function handleDeleteDuplicates() {
    const docsParaApagar = duplicateGroups.flatMap((group) => group.slice(1));

    if (docsParaApagar.length === 0) {
      toast.info('Nenhum arquivo repetido encontrado.');
      return;
    }

    if (!window.confirm(`Apagar ${docsParaApagar.length} arquivos repetidos mantendo sempre o primeiro registro?`)) return;

    try {
      for (const doc of docsParaApagar) {
        try {
          await base44.entities.Attachment.delete(doc.id);
        } catch {
          await base44.entities.Attachment.update(doc.id, {
            status_registro: 'DELETADO'
          });
        }
      }

      toast.success(`${docsParaApagar.length} arquivos repetidos apagados.`);
      await refreshDocumentos();
    } catch (e) {
      toast.error('Erro ao apagar repetidos: ' + e.message);
    }
  }

  async function openEditPurchase(pair) {
    const purchaseId = pair?.purchaseIds?.[0];

    if (!purchaseId) {
      toast.warning('Esta linha não possui solicitação vinculada.');
      return;
    }

    try {
      const purchase = await base44.entities.PurchaseRequest.get(purchaseId);
      setEditingPurchase(purchase);
    } catch (e) {
      toast.error('Não foi possível abrir a solicitação vinculada: ' + e.message);
    }
  }

  async function handleSyncDoc(doc) {
    if (!doc?.id) return;

    setSyncingIds((prev) => new Set([...prev, doc.id]));

    try {
      const payload = doc.purchase_request_id
        ? {
            purchase_id: doc.purchase_request_id,
            attachment_id: doc.id
          }
        : {
            attachment_id: doc.id
          };

      await base44.functions.invoke('syncComprasDocsToDrive', payload);

      toast.success('Arquivo enviado ao Drive.');
      await refreshDocumentos();
    } catch (e) {
      toast.error('Erro ao sincronizar: ' + e.message);
    } finally {
      setSyncingIds((prev) => {
        const s = new Set(prev);
        s.delete(doc.id);
        return s;
      });
    }
  }

  async function handleSavePurchase() {
    if (!editingPurchase?.id) return;

    setSavingPurchase(true);

    try {
      await base44.entities.PurchaseRequest.update(editingPurchase.id, {
        descricao_item: editingPurchase.descricao_item || '',
        fornecedor_nome: editingPurchase.fornecedor_nome || '',
        centro_custo: editingPurchase.centro_custo || '',
        nf_numero: editingPurchase.nf_numero || '',
        valor_solicitado: toNumber(editingPurchase.valor_solicitado),
        observacoes: editingPurchase.observacoes || ''
      });

      toast.success('Solicitação vinculada atualizada.');
      setEditingPurchase(null);
      await refreshDocumentos();
      await queryClient.invalidateQueries({ queryKey: ['purchases'] });
    } catch (e) {
      toast.error('Erro ao salvar solicitação: ' + e.message);
    } finally {
      setSavingPurchase(false);
    }
  }

  if (isLoading) {
    return (
      <LoadingPage
        fullHeight={false}
        message="Carregando página..."
        description="Estamos carregando documentos, vínculos, pares PDF/XML, recibos e backups. Aguarde alguns instantes."
      />
    );
  }

  if (isError) {
    return (
      <LoadingPage
        fullHeight={false}
        error
        errorTitle="Não foi possível carregar os documentos"
        errorDescription="Atualize a página ou tente novamente em alguns instantes."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />

          <span className="font-semibold text-gray-800">Documentos</span>

          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {filtrados.length}
          </span>

          <span className="hidden rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500 sm:inline-flex">
            {gruposMensais.reduce((acc, g) => acc + g.pairs.length, 0)} pares/listas
          </span>

          <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
            {duplicateGroups.reduce((acc, group) => acc + group.length - 1, 0)} repetidos
          </span>

          <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
            {arquivosDesvinculados.length} XML/recibos desvinculados
          </span>

          {isFetching && !isLoading && (
            <span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs text-blue-600">
              Atualizando...
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={showDuplicatesOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowDuplicatesOnly((v) => !v)}
            className="gap-1.5 hidden"
          >
            <Copy className="h-3.5 w-3.5" />
            {showDuplicatesOnly ? 'Ver todos' : 'Pesquisar repetidos'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeleteDuplicates}
            className="gap-1.5 text-red-700 hover:text-red-800 hidden"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Apagar repetidos
          </Button>

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
      </div>

      {filtrados.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-200" />
          <p className="text-sm text-gray-400">Nenhum documento encontrado</p>
        </div>
      ) : (
        <div className="p-4">
          {gruposMensais.map((grupo) => (
            <section key={grupo.monthKey} className="mb-8 last:mb-0">
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-gray-100 pb-2">
                <div>
                  <h3 className="text-base font-semibold capitalize text-black">
                    {grupo.label}
                  </h3>

                  <p className="text-xs text-gray-500">
                    {grupo.totalDocs} documentos em {grupo.pairs.length} linhas
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full min-w-[1180px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-3 py-2.5 font-medium text-gray-600">Tipo</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600">Referência</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600">Fornecedor</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600">Data</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600">Arquivos vinculados</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">Drive</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {grupo.pairs.map((pair, idx) => {
                      const precisaAssociar = pair.hasPdf && !pair.hasXml && !pair.hasRecibo;

                      return (
                        <tr
                          key={`${grupo.monthKey}-${pair.key}`}
                          className={`border-b border-gray-100 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                          }`}
                        >
                          <td className="px-3 py-2.5 align-top">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAIR_COLOR[pair.type] || PAIR_COLOR['Sem par']}`}>
                              {pair.type}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <p
                              className="max-w-[260px] truncate font-medium text-gray-900"
                              title={pair.title}
                            >
                              {pair.title}
                            </p>
                            <p className="text-xs text-gray-400">{pair.categoria}</p>
                          </td>

                          <td className="px-3 py-2.5 align-top text-gray-600">
                            <p
                              className="max-w-[180px] truncate"
                              title={pair.fornecedor}
                            >
                              {pair.fornecedor}
                            </p>
                          </td>

                          <td className="px-3 py-2.5 align-top text-xs tabular-nums text-gray-500">
                            {fmtDate(pair.date)}
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <div className="flex flex-wrap gap-2">
                              {pair.docs.map((doc) => (
                                <DocumentoLink key={doc.id} doc={doc} />
                              ))}
                            </div>
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <div className="flex flex-col items-center gap-1.5">
                              {pair.docs.map((doc) => {
                                const syncing = syncingIds.has(doc.id);
                                const hasBackup = doc?.backup_done && doc?.drive_file_id;
                                const driveLink = hasBackup
                                  ? `https://drive.google.com/file/d/${doc.drive_file_id}/view`
                                  : null;

                                return (
                                  <div key={doc.id} className="flex items-center gap-1">
                                    {syncing ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                    ) : hasBackup ? (
                                      <a
                                        href={driveLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Ver no Drive"
                                        className="flex items-center gap-0.5 text-green-600 hover:text-green-800"
                                      >
                                        <Cloud className="h-3.5 w-3.5" />
                                      </a>
                                    ) : (
                                      <CloudOff
                                        className="h-3.5 w-3.5 text-gray-300"
                                        title="Sem backup no Drive"
                                      />
                                    )}

                                    <button
                                      onClick={() => handleSyncDoc(doc)}
                                      disabled={syncing}
                                      title="Sincronizar com Drive"
                                      className="rounded p-0.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <div className="flex flex-col items-stretch gap-2">
                              {precisaAssociar && (
                                <div className="flex min-w-[320px] items-center gap-2">
                                  <select
                                    value={selectedAssociationByPair[pair.key] || ''}
                                    onChange={(e) =>
                                      setSelectedAssociationByPair((prev) => ({
                                        ...prev,
                                        [pair.key]: e.target.value
                                      }))
                                    }
                                    className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
                                  >
                                    <option value="">XML/recibo desvinculado...</option>
                                    {arquivosDesvinculados.map((doc) => (
                                      <option key={doc.id} value={doc.id}>
                                        {getTipo(doc)} — {getFileName(doc)}
                                      </option>
                                    ))}
                                  </select>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAssociarArquivo(pair)}
                                    className="h-8 gap-1.5 whitespace-nowrap text-xs"
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                    Associar XML/Recibo
                                  </Button>
                                </div>
                              )}

                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => openEditPurchase(pair)}
                                  title="Editar solicitação vinculada"
                                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-black"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>

                                {pair.docs.map((doc) => {
                                  const tipo = getTipo(doc);

                                  return (
                                    <React.Fragment key={doc.id}>
                                      {tipo === 'XML' && !isXmlVinculado(doc) && (
                                        <button
                                          onClick={() => setVincularXml(doc)}
                                          title="Vincular XML ao PDF"
                                          className="rounded p-1 text-blue-400 hover:bg-blue-50 hover:text-blue-700"
                                        >
                                          <Link2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}

                                      {tipo === 'XML' && isXmlVinculado(doc) && (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                      )}

                                      {tipo === 'RECIBO' && isReciboVinculado(doc) && (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                      )}

                                      <button
                                        onClick={() => handleDelete(doc)}
                                        title={`Deletar ${getFileName(doc)}`}
                                        className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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

      {editingPurchase && (
        <EditarSolicitacaoModal
          purchase={editingPurchase}
          onChange={setEditingPurchase}
          onSave={handleSavePurchase}
          onClose={() => setEditingPurchase(null)}
          saving={savingPurchase}
        />
      )}
    </div>
  );
}
