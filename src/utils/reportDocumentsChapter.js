const CONTRACT_HINTS = ['contrato', 'contract', 'termo', 'acordo'];
const FISCAL_HINTS = [
  'nota fiscal',
  'nf',
  'xml',
  'recibo',
  'comprovante',
  'danfe',
  'nfe',
  'fiscal',
];

function toText(value) {
  return String(value ?? '').trim();
}

function normalizeText(value) {
  return toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(
    String(value ?? '')
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.')
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateTimestamp(value) {
  const raw = toText(value);
  if (!raw) return 0;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  }

  const d = new Date(raw);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function isUrlLike(value) {
  const text = toText(value);
  return /^https?:\/\//i.test(text) || text.startsWith('/');
}

function fileNameFromUrl(url) {
  const raw = toText(url).split('?')[0].split('#')[0];
  const last = raw.split('/').pop() || '';
  if (!last) return '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function collectRecordTexts(record = {}) {
  return normalizeText([
    record?.tipo_documento,
    record?.tipo_detectado,
    record?.categoria,
    record?.mime_type,
    record?.file_name,
    record?.filename,
    record?.nome_arquivo,
    record?.description,
    record?.descricao,
    record?.nome,
    record?.titulo,
    record?.label,
  ].filter(Boolean).join(' '));
}

function collectUrls(record = {}) {
  const urls = [];
  const explicit = [
    record?.arquivo_original_url,
    record?.file_url,
    record?.url,
    record?.download_url,
    record?.public_url,
    record?.nota_fiscal_url,
    record?.xml_url,
    record?.recibo_url,
    record?.comprovante_url,
    record?.contrato_url,
    record?.contrato_pdf_url,
    record?.pdf_url,
  ];

  explicit.forEach((value) => {
    if (isUrlLike(value)) urls.push(toText(value));
  });

  const nested = [
    ...safeArray(record?.attachments),
    ...safeArray(record?.anexos),
    ...safeArray(record?.files),
    ...safeArray(record?.documentos),
  ];

  nested.forEach((item) => {
    if (isUrlLike(item)) {
      urls.push(toText(item));
      return;
    }

    if (item && typeof item === 'object') {
      [
        item?.arquivo_original_url,
        item?.file_url,
        item?.url,
        item?.download_url,
        item?.public_url,
        item?.nota_fiscal_url,
        item?.xml_url,
        item?.recibo_url,
        item?.comprovante_url,
        item?.contrato_url,
        item?.contrato_pdf_url,
      ].forEach((value) => {
        if (isUrlLike(value)) urls.push(toText(value));
      });
    }
  });

  return Array.from(new Set(urls));
}

function getDocumentType(record = {}, url = '') {
  const source = collectRecordTexts(record);
  const urlName = normalizeText(fileNameFromUrl(url));
  const combined = `${source} ${urlName}`;

  const hasContractHint = CONTRACT_HINTS.some((hint) => combined.includes(hint));
  const hasFiscalHint = FISCAL_HINTS.some((hint) => combined.includes(hint));
  const isPdf = combined.includes('application/pdf') || combined.includes('.pdf');

  if (hasContractHint && isPdf) return 'contract_pdf';
  if (hasFiscalHint) return 'fiscal_document';
  if (hasContractHint) return 'contract_document';
  return 'other';
}

function getDocName(record = {}, url = '') {
  return (
    toText(record?.nome_arquivo) ||
    toText(record?.file_name) ||
    toText(record?.filename) ||
    fileNameFromUrl(url) ||
    'Arquivo sem nome'
  );
}

function getEntityLabel(sourceName, record = {}) {
  const destination = toText(record?.entidade_destino || record?.entity || record?.origem || '');
  if (destination) return destination;
  if (sourceName === 'compras') return 'PurchaseRequest';
  if (sourceName === 'pagamentosEquipe') return 'TeamPayment';
  if (sourceName === 'documentIntake') return 'DocumentIntake';
  if (sourceName === 'attachments') return 'Attachment';
  return 'Registro do app';
}

function getPersonSupplier(record = {}) {
  return (
    toText(record?.fornecedor_nome) ||
    toText(record?.fornecedor) ||
    toText(record?.supplier_name) ||
    toText(record?.prestador_nome) ||
    toText(record?.team_member_nome) ||
    toText(record?.nome_profissional) ||
    toText(record?.autor) ||
    toText(record?.created_by_name) ||
    '-'
  );
}

function getInvoiceNumber(record = {}, fileName = '') {
  return (
    toText(record?.nf_numero) ||
    toText(record?.numero_nf) ||
    toText(record?.numero_nota_fiscal) ||
    toText(record?.numero_documento_fiscal) ||
    (() => {
      const match = toText(fileName).match(/\b(?:nf|nfe|danfe)[\s-_#:]*([0-9]{3,})\b/i);
      return match?.[1] || '';
    })()
  );
}

function getDocumentDate(record = {}) {
  return (
    toText(record?.data_emissao) ||
    toText(record?.nf_data_emissao) ||
    toText(record?.data_documento) ||
    toText(record?.data_envio) ||
    toText(record?.created_date) ||
    toText(record?.updated_date)
  );
}

function buildDedupKey(item = {}) {
  const parts = [
    toText(item.id),
    toText(item.url),
    toText(item.arquivo_original_url),
    toText(item.file_url),
    toText(item.nota_fiscal_url),
    toText(item.xml_url),
    toText(item.contrato_url),
    `${normalizeText(item.fileName)}::${toText(item.date)}`,
  ].filter(Boolean);
  return parts[0] || parts.join('|');
}

export function buildDocumentsChapterData(contexto = {}) {
  const sourceSets = [
    { sourceName: 'attachments', items: safeArray(contexto?.attachments_raw) },
    { sourceName: 'documentIntake', items: safeArray(contexto?.document_intake_raw) },
    { sourceName: 'compras', items: safeArray(contexto?.compras_raw) },
    { sourceName: 'pagamentosEquipe', items: safeArray(contexto?.pagamentos_equipe_raw) },
  ];

  const rawItems = [];

  sourceSets.forEach(({ sourceName, items }) => {
    items.forEach((record, index) => {
      const urls = collectUrls(record);
      if (urls.length === 0) {
        rawItems.push({
          id: `${sourceName}-${record?.id || record?._id || index}`,
          sourceName,
          sourceRecord: record,
          url: '',
        });
        return;
      }

      urls.forEach((url, urlIndex) => {
        rawItems.push({
          id: `${sourceName}-${record?.id || record?._id || index}-${urlIndex}`,
          sourceName,
          sourceRecord: record,
          url,
        });
      });
    });
  });

  const normalized = rawItems.map((item) => {
    const record = item.sourceRecord || {};
    const url = toText(item.url);
    const fileName = getDocName(record, url);
    const tipoDetectado = toText(record?.tipo_detectado || record?.tipo_documento || record?.categoria || '');
    const detectedType = getDocumentType(record, url);
    const date = getDocumentDate(record);

    return {
      ...item,
      fileName,
      documentType: detectedType,
      tipo: tipoDetectado || (detectedType === 'contract_pdf' ? 'Contrato PDF' : detectedType === 'fiscal_document' ? 'Documento fiscal' : 'Documento'),
      personSupplier: getPersonSupplier(record),
      entityLabel: getEntityLabel(item.sourceName, record),
      entityId: toText(record?.entidade_destino_id || record?.purchase_request_id || record?.team_payment_id || record?.id || record?._id),
      invoiceNumber: getInvoiceNumber(record, fileName),
      value: toNumber(record?.valor_total || record?.valor || record?.valor_nf || record?.amount || record?.total),
      date,
      mimeType: toText(record?.mime_type || ''),
      key: buildDedupKey({
        id: item.id,
        url,
        arquivo_original_url: record?.arquivo_original_url,
        file_url: record?.file_url,
        nota_fiscal_url: record?.nota_fiscal_url,
        xml_url: record?.xml_url,
        contrato_url: record?.contrato_url,
        fileName,
        date,
      }),
    };
  });

  const dedupMap = new Map();
  normalized.forEach((item) => {
    if (!item.key) return;
    if (!dedupMap.has(item.key)) {
      dedupMap.set(item.key, item);
      return;
    }
    const previous = dedupMap.get(item.key);
    if (!previous.url && item.url) dedupMap.set(item.key, item);
  });

  const deduped = Array.from(dedupMap.values());

  const contracts = deduped
    .filter((item) => item.documentType === 'contract_pdf')
    .sort((a, b) =>
      a.personSupplier.localeCompare(b.personSupplier, 'pt-BR') ||
      dateTimestamp(b.date) - dateTimestamp(a.date) ||
      a.fileName.localeCompare(b.fileName, 'pt-BR')
    );

  const fiscalDocuments = deduped
    .filter((item) => item.documentType === 'fiscal_document')
    .sort((a, b) =>
      dateTimestamp(b.date) - dateTimestamp(a.date) ||
      a.personSupplier.localeCompare(b.personSupplier, 'pt-BR') ||
      a.invoiceNumber.localeCompare(b.invoiceNumber, 'pt-BR') ||
      a.fileName.localeCompare(b.fileName, 'pt-BR')
    );

  const limitations = [];
  if (deduped.some((item) => !item.url)) {
    limitations.push('Alguns registros possuem metadados, mas não possuem link disponível para abertura do arquivo.');
  }
  if (deduped.some((item) => !item.entityId)) {
    limitations.push('Parte dos arquivos não possui vínculo completo com solicitação, pagamento ou contrato no momento da consolidação.');
  }

  return {
    contracts,
    fiscalDocuments,
    limitations,
    totalAnalyzed: deduped.length,
  };
}
