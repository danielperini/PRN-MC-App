import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  Table2,
} from 'lucide-react';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

const ORCAMENTO_REFERENCIA = [
  { grupo: 'Equipe e gestão', rubrica: 'Coordenador Geral', total: 70000, valoresReferencia: [7000, 7000, 7000] },
  { grupo: 'Equipe e gestão', rubrica: 'Assistente de Coordenação e Produção', total: 50000, valoresReferencia: [5000, 5000, 5000] },
  { grupo: 'Equipe e gestão', rubrica: 'Coordenador de Comunicação', total: 60000, valoresReferencia: [6000, 6000, 6000] },
  { grupo: 'Equipe e gestão', rubrica: 'Analista Administrativo-Financeira', total: 50000, valoresReferencia: [5000, 5000, 5000] },
  { grupo: 'Equipe e gestão', rubrica: 'Assistente Administrativo', total: 40000, valoresReferencia: [4000, 4000, 4000] },
  { grupo: 'Equipe e gestão', rubrica: 'Produção MIS', total: 37800, centroEsperado: 'MIS', valoresReferencia: [4200, 4200, 4200] },
  { grupo: 'Equipe e gestão', rubrica: 'Produção MUMO', total: 37800, centroEsperado: 'MUMO', valoresReferencia: [4200, 4200, 4200] },
  { grupo: 'Equipe e gestão', rubrica: 'Produção MHAB', total: 37800, centroEsperado: 'MHAB', valoresReferencia: [4200, 4200, 4200] },
  { grupo: 'Equipe e gestão', rubrica: 'Assessor de Imprensa', total: 27000, valoresReferencia: [3000, 3000, 3000] },
  { grupo: 'Equipe e gestão', rubrica: 'Designer', total: 26000, valoresReferencia: [2600, 2600, 2600], observacao: 'Há rubrica duplicada na planilha de referência. Validar vínculo por NF/fornecedor.' },
  { grupo: 'Equipe e gestão', rubrica: 'Designer', total: 26000, valoresReferencia: [2600, 2600, 2600], observacao: 'Há rubrica duplicada na planilha de referência. Validar vínculo por NF/fornecedor.' },
  { grupo: 'Manutenção e operação', rubrica: 'Educador MIS', total: 46000, centroEsperado: 'MIS', valoresReferencia: [4600, 4600, 4600] },
  { grupo: 'Manutenção e operação', rubrica: 'Educador MUMO', total: 46000, centroEsperado: 'MUMO', valoresReferencia: [4600, 4600, 4600] },
  { grupo: 'Manutenção e operação', rubrica: 'Educador MHAB', total: 46000, centroEsperado: 'MHAB', valoresReferencia: [4600, 4600, 4600] },
  { grupo: 'Consultorias', rubrica: 'Consultoria de programação', total: 30000, valoresReferencia: [6000, 6000] },
  { grupo: 'Equipe e gestão', rubrica: 'Rede Social / Marketing Cultural', total: 22500, valoresReferencia: [2500, 2500] },
  { grupo: 'Equipe e gestão', rubrica: 'Fotógrafo', total: 27000, valoresReferencia: [3000, 3000] },
  { grupo: 'Manutenção e operação', rubrica: 'Manutenção MIS', total: 13500, centroEsperado: 'MIS', valoresReferencia: [800] },
  { grupo: 'Manutenção e operação', rubrica: 'Manutenção MUMO', total: 13500, centroEsperado: 'MUMO', valoresReferencia: [299] },
  { grupo: 'Manutenção e operação', rubrica: 'Manutenção MHAB', total: 18000, centroEsperado: 'MHAB' },
  { grupo: 'Mostras e exposições', rubrica: 'Mostra de baixa complexidade MIS', total: 4000, centroEsperado: 'MIS' },
  { grupo: 'Mostras e exposições', rubrica: 'Mostra de média complexidade MHAB', total: 7000, centroEsperado: 'MHAB' },
  { grupo: 'Mostras e exposições', rubrica: 'Peça em destaque MHAB', total: 1000, centroEsperado: 'MHAB' },
  { grupo: 'Diárias e deslocamentos', rubrica: 'Diárias de Educador - MIS', total: 2100, centroEsperado: 'MIS' },
  { grupo: 'Mostras e exposições', rubrica: 'Exposição MUMO', total: 210000, centroEsperado: 'MUMO' },
  { grupo: 'Diárias e deslocamentos', rubrica: 'Diárias de Educador - MUMO', total: 2100, centroEsperado: 'MUMO' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Produção (Ed. 2026)', total: 6000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Assistente de Produção (Ed. 2026)', total: 4000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Diárias e deslocamentos', rubrica: 'Diárias de Educador - MHAB', total: 2100, centroEsperado: 'MHAB' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'ID / designer (Ed. 2026)', total: 7000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Sinalização (Ed. 2026)', total: 11250, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Monitores (Ed. 2026)', total: 3000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Kit de Iluminação (Ed. 2026)', total: 12000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Segurança (Ed. 2026)', total: 3000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Limpeza (Ed. 2026)', total: 2700, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Vans (Ed. 2026)', total: 30400, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Alimentação, material e ações', rubrica: 'Lanches - MIS', total: 3000, centroEsperado: 'MIS' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Vídeo e Fotografia (Ed. 2026)', total: 20000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Alimentação, material e ações', rubrica: 'Lanches - MUMO', total: 3000, centroEsperado: 'MUMO' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Infraestrutura MIS/MUMO/MHAB (Ed. 2026)', total: 12000, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Alimentação, material e ações', rubrica: 'Lanches - MHAB', total: 3000, centroEsperado: 'MHAB' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Apresentações culturais – 3 museus PBH (Ed. 2026)', total: 7500, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Infraestrutura 3 museus PBH (Ed. 2026)', total: 7500, centroEsperado: 'Noturno nos Museus 2026' },
  { grupo: 'Diárias e publicações', rubrica: 'Designer MHAB', total: 7000, centroEsperado: 'MHAB' },
  { grupo: 'Diárias e publicações', rubrica: 'Fotógrafo MHAB', total: 5675, centroEsperado: 'MHAB' },
  { grupo: 'Diárias e publicações', rubrica: 'Pesquisa e texto MHAB (2ª publicação)', total: 3000, centroEsperado: 'MHAB' },
  { grupo: 'Diárias e publicações', rubrica: 'Revisão MHAB', total: 1375, centroEsperado: 'MHAB' },
  { grupo: 'Alimentação, material e ações', rubrica: 'Alimentação Cartão - MIS', total: 3000, centroEsperado: 'MIS', valoresReferencia: [1000.63] },
  { grupo: 'Diárias e publicações', rubrica: 'Tradução MHAB', total: 2200, centroEsperado: 'MHAB' },
  { grupo: 'Alimentação, material e ações', rubrica: 'Alimentação Cartão - MUMO', total: 3000, centroEsperado: 'MUMO', valoresReferencia: [1000.63] },
  { grupo: 'Diárias e publicações', rubrica: 'Impressão MHAB', total: 21000, centroEsperado: 'MHAB' },
  { grupo: 'Alimentação, material e ações', rubrica: 'Alimentação Cartão - MHAB', total: 3000, centroEsperado: 'MHAB', valoresReferencia: [1000.63] },
  { grupo: 'Alimentação, material e ações', rubrica: 'Material MIS', total: 8000, centroEsperado: 'MIS', valoresReferencia: [1409.9, 854.8, 1291.28] },
  { grupo: 'Alimentação, material e ações', rubrica: 'Material MUMO', total: 8000, centroEsperado: 'MUMO', valoresReferencia: [396, 457.42] },
  { grupo: 'Alimentação, material e ações', rubrica: 'Material MHAB', total: 8000, centroEsperado: 'MHAB', valoresReferencia: [457.43] },
  { grupo: 'Alimentação, material e ações', rubrica: 'Fornecimento de som e iluminação', total: 7500 },
  { grupo: 'Consultorias', rubrica: 'Consultorias de temas transversais diversos', total: 5000 },
  { grupo: 'Consultorias', rubrica: 'Formação sobre Ambiente Seguro, Diversidade e Inclusão', total: 2500, valoresReferencia: [2500] },
  { grupo: 'Despesas gerais', rubrica: 'Transporte', total: 4000, valoresReferencia: [800] },
  { grupo: 'Despesas gerais', rubrica: 'Material de escritório', total: 2700, valoresReferencia: [75, 2625] },
  { grupo: 'Despesas gerais', rubrica: 'Energia elétrica', total: 4500, valoresReferencia: [450, 450, 450, 450] },
  { grupo: 'Despesas gerais', rubrica: 'Assessoria Jurídica', total: 17000, valoresReferencia: [1700, 1700, 1700] },
  { grupo: 'Despesas gerais', rubrica: 'Contador', total: 10000, valoresReferencia: [2000, 1000] },
  { grupo: 'Ações educativas e culturais', rubrica: 'Ações Educativas - MIS', total: 30000, centroEsperado: 'MIS', valoresReferencia: [4000] },
  { grupo: 'Ações educativas e culturais', rubrica: 'Ações Educativas - MUMO', total: 30000, centroEsperado: 'MUMO', valoresReferencia: [3000, 3000] },
  { grupo: 'Ações educativas e culturais', rubrica: 'Ações Educativas - MHAB', total: 30000, centroEsperado: 'MHAB', valoresReferencia: [3000, 3540] },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Apresentações – MIS / MUMO / MHAB / 3 museus PBH (Ed. 2026)', total: 15000, centroEsperado: 'Noturno nos Museus 2026' },
];

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNumber(value));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\(mes[^)]*\)/gi, '')
    .replace(/\(ed\.\s*2026\)/gi, '')
    .replace(/2ª/g, '2a')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCentro(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (raw === 'mis' || raw.includes('imagem e som')) return 'MIS';
  if (raw === 'mhab' || raw.includes('abilio barreto')) return 'MHAB';
  if (raw === 'mumo' || raw.includes('moda')) return 'MUMO';
  if (raw.includes('noturno')) return 'Noturno nos Museus 2026';
  if (raw.includes('publica')) return 'Publicações';
  if (raw.includes('geral') || raw.includes('atuacao geral')) return 'Geral';
  if (raw.includes('rateado')) return 'Rateado';
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getRubricaName(item) {
  return item?.rubrica || item?.nome || item?.rubrica_nome || item?.titulo || item?.descricao || '';
}

function getPurchaseValue(purchase) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    toNumber(purchase?.nf_valor_total) ||
    toNumber(purchase?.valor_total) ||
    toNumber(purchase?.valor) ||
    toNumber(purchase?.rubrica_debitada_valor) ||
    0
  );
}

function getPurchaseRubricaName(purchase, rubricaById) {
  const fromEntity = purchase?.rubrica_id ? getRubricaName(rubricaById[purchase.rubrica_id]) : '';
  return purchase?.rubrica_nome || purchase?.rubrica || purchase?.linha_orcamentaria_nome || fromEntity || '';
}

function getMeta(purchase) {
  return purchase?.meta_id || purchase?.meta || purchase?.meta_nome || purchase?.meta_3_aditivo || '';
}

function getFornecedor(purchase) {
  return purchase?.fornecedor_nome || purchase?.nf_emitente_nome || purchase?.emitente_nome || purchase?.prestador_nome || '';
}

function getDescricao(purchase) {
  return purchase?.descricao_item || purchase?.descricao || purchase?.objeto || purchase?.servico_descricao || purchase?.observacoes || '';
}

function getNFNumero(item) {
  return String(item?.nf_numero || item?.numero_nf || item?.nota_fiscal_numero || item?.numero_nota || '').trim();
}

function getCnpj(item) {
  return String(
    item?.fornecedor_cpf_cnpj ||
    item?.fornecedor_cnpj ||
    item?.nf_emitente_cpf_cnpj ||
    item?.emitente_cnpj ||
    item?.cnpj ||
    ''
  ).replace(/\D/g, '');
}

function getFileUrl(item) {
  return (
    item?.file_url ||
    item?.arquivo_url ||
    item?.documento_url ||
    item?.nota_fiscal_url ||
    item?.nf_pdf_url ||
    item?.pdf_url ||
    item?.attachment_url ||
    item?.url ||
    ''
  );
}

function getFileName(item) {
  return String(item?.file_name || item?.filename || item?.nome_arquivo || item?.name || getFileUrl(item) || '').toLowerCase();
}

function isXml(item) {
  const name = getFileName(item);
  const tipo = normalizeText(item?.tipo || item?.type || item?.mime_type || item?.nf_tipo_documento || item?.classification || item?.categoria);
  return name.endsWith('.xml') || tipo.includes('xml');
}

function isPdf(item) {
  const name = getFileName(item);
  const tipo = normalizeText(item?.tipo || item?.type || item?.mime_type || item?.nf_tipo_documento || item?.classification || item?.categoria);
  return name.endsWith('.pdf') || tipo.includes('pdf');
}

function makeFiscalKey(item) {
  const nf = getNFNumero(item);
  const cnpj = getCnpj(item);
  const valor = getPurchaseValue(item) || toNumber(item?.nf_valor_total) || toNumber(item?.valor_total) || toNumber(item?.valor);
  if (nf && cnpj) return `${nf}|${cnpj}|${Math.round(valor * 100)}`;
  if (nf) return `NF:${nf}|${Math.round(valor * 100)}`;
  const url = getFileUrl(item);
  if (url) return `URL:${url}`;
  return '';
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function bestRubricaMatch(text, centro, referencias = ORCAMENTO_REFERENCIA) {
  const haystack = normalizeText(`${text} ${centro}`);
  if (!haystack) return null;

  let best = null;
  let bestScore = 0;

  referencias.forEach((ref) => {
    const nome = normalizeText(ref.rubrica);
    const grupo = normalizeText(ref.grupo);
    const centroRef = normalizeCentro(ref.centroEsperado);
    let score = 0;

    nome.split(' ').filter((w) => w.length > 2).forEach((word) => {
      if (haystack.includes(word)) score += 3;
    });

    grupo.split(' ').filter((w) => w.length > 4).forEach((word) => {
      if (haystack.includes(word)) score += 1;
    });

    if (centroRef && centroRef === normalizeCentro(centro)) score += 4;
    if (normalizeText(ref.rubrica).includes('mis') && normalizeCentro(centro) === 'MIS') score += 3;
    if (normalizeText(ref.rubrica).includes('mumo') && normalizeCentro(centro) === 'MUMO') score += 3;
    if (normalizeText(ref.rubrica).includes('mhab') && normalizeCentro(centro) === 'MHAB') score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = ref;
    }
  });

  return bestScore >= 5 ? best : null;
}

function expectedMetaForReference(ref) {
  const grupo = normalizeText(ref?.grupo);
  const rubrica = normalizeText(ref?.rubrica);
  if (grupo.includes('noturno')) return 'Noturno nos Museus 2026';
  if (grupo.includes('acoes educativas') || rubrica.includes('educativas')) return 'Ações educativas e culturais';
  if (grupo.includes('mostras') || rubrica.includes('exposicao') || rubrica.includes('mostra')) return 'Mostras e exposições';
  if (grupo.includes('publicacoes') || rubrica.includes('publicacao') || rubrica.includes('impressao')) return 'Publicações MHAB';
  if (grupo.includes('consultorias')) return 'Consultorias';
  if (grupo.includes('equipe')) return 'Equipe e gestão';
  if (grupo.includes('manutencao')) return 'Manutenção e operação';
  if (grupo.includes('alimentacao') || rubrica.includes('material') || rubrica.includes('lanche')) return 'Alimentação, material e ações';
  if (grupo.includes('despesas gerais')) return 'Despesas gerais';
  return ref?.grupo || '';
}

function statusLabel(status) {
  const normalized = normalizeStatus(status);
  if (STATUS_APROVADOS.has(normalized)) return 'Aprovado';
  if (normalized === 'SOLICITADO') return 'Solicitado';
  if (normalized === 'DEVOLVIDO') return 'Devolvido';
  if (normalized === 'RECUSADO') return 'Recusado';
  if (normalized === 'CANCELADO') return 'Cancelado';
  return status || 'Sem status';
}

function badgeClass(severity) {
  if (severity === 'critica') return 'bg-red-50 text-red-700 border-red-200';
  if (severity === 'atencao') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function safeList(result) {
  return Array.isArray(result) ? result : [];
}

async function safeEntityList(entityName, order = '-created_date', limit = 1000) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.list) return [];
    return safeList(await entity.list(order, limit));
  } catch (error) {
    console.warn(`Falha ao carregar ${entityName}:`, error);
    return [];
  }
}

export default function AuditoriaSolicitacoes() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [data, setData] = useState({
    purchases: [],
    rubricas: [],
    intakes: [],
    attachments: [],
    teamPayments: [],
  });

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      let user = null;
      try {
        user = await base44.auth.me();
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      }

      const [purchases, rubricas, intakes, attachments, teamPayments] = await Promise.all([
        safeEntityList('PurchaseRequest', '-created_date', 1000),
        safeEntityList('Rubrica', 'ordem_exibicao', 1000),
        safeEntityList('DocumentIntake', '-created_date', 1000),
        safeEntityList('Attachment', '-created_date', 1000),
        safeEntityList('TeamPayment', '-created_date', 1000),
      ]);

      setData({ purchases, rubricas, intakes, attachments, teamPayments });
    } catch (err) {
      console.error('Erro na auditoria:', err);
      setError(err?.message || 'Erro ao carregar dados para auditoria.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const audit = useMemo(() => {
    const rubricaById = {};
    const rubricasByNormName = new Map();
    const attachmentsByPurchase = new Map();
    const docsByFiscalKey = new Map();
    const intakesByFiscalKey = new Map();

    data.rubricas.forEach((r) => {
      if (r?.id) rubricaById[r.id] = r;
      const key = normalizeText(getRubricaName(r));
      if (key && !rubricasByNormName.has(key)) rubricasByNormName.set(key, r);
    });

    data.attachments.forEach((att) => {
      const purchaseId = att?.purchase_id || att?.purchase_request_id || att?.purchaseRequestId || att?.solicitacao_id;
      if (purchaseId) {
        if (!attachmentsByPurchase.has(purchaseId)) attachmentsByPurchase.set(purchaseId, []);
        attachmentsByPurchase.get(purchaseId).push(att);
      }
      const fiscalKey = makeFiscalKey(att);
      if (fiscalKey) {
        if (!docsByFiscalKey.has(fiscalKey)) docsByFiscalKey.set(fiscalKey, []);
        docsByFiscalKey.get(fiscalKey).push(att);
      }
    });

    data.intakes.forEach((intake) => {
      const fiscalKey = makeFiscalKey(intake);
      if (fiscalKey) {
        if (!intakesByFiscalKey.has(fiscalKey)) intakesByFiscalKey.set(fiscalKey, []);
        intakesByFiscalKey.get(fiscalKey).push(intake);
      }
    });

    const linhasSolicitacoes = data.purchases.map((purchase) => {
      const status = normalizeStatus(purchase.status);
      const aprovado = STATUS_APROVADOS.has(status);
      const valor = getPurchaseValue(purchase);
      const rubricaAtual = getPurchaseRubricaName(purchase, rubricaById);
      const centroAtual = normalizeCentro(purchase?.centro_custo || purchase?.centro || purchase?.museu || purchase?.centro_custo_nome);
      const descricao = getDescricao(purchase);
      const fornecedor = getFornecedor(purchase);
      const metaAtual = getMeta(purchase);
      const fiscalKey = makeFiscalKey(purchase);
      const linkedAttachments = attachmentsByPurchase.get(purchase.id) || [];
      const fiscalAttachments = fiscalKey ? docsByFiscalKey.get(fiscalKey) || [] : [];
      const fiscalIntakes = fiscalKey ? intakesByFiscalKey.get(fiscalKey) || [] : [];
      const allDocs = [...linkedAttachments, ...fiscalAttachments, ...fiscalIntakes];
      const hasDirectFile = !!getFileUrl(purchase);
      const hasPdf = hasDirectFile || allDocs.some(isPdf);
      const hasXml = allDocs.some(isXml) || !!purchase?.xml_url || !!purchase?.nf_xml_url;
      const suggested = bestRubricaMatch(`${descricao} ${fornecedor} ${rubricaAtual}`, centroAtual);
      const rubricaAtualNorm = normalizeText(rubricaAtual);
      const suggestedNorm = normalizeText(suggested?.rubrica);
      const metaEsperada = suggested ? expectedMetaForReference(suggested) : '';
      const issues = [];
      let severity = 'ok';

      if (!purchase?.rubrica_id && !rubricaAtual) issues.push('Sem rubrica vinculada');
      if (!centroAtual) issues.push('Sem centro de custo');
      if (!metaAtual) issues.push('Sem meta vinculada');
      if (!hasPdf) issues.push('Sem documento PDF/NF correspondente');
      if (!hasXml && hasPdf) issues.push('Sem XML vinculado ou comprovante complementar');
      if (suggested && rubricaAtualNorm && suggestedNorm && !rubricaAtualNorm.includes(suggestedNorm) && !suggestedNorm.includes(rubricaAtualNorm)) {
        issues.push(`Rubrica possivelmente incorreta. Sugerida: ${suggested.grupo} — ${suggested.rubrica}`);
      }
      if (suggested?.centroEsperado && centroAtual && normalizeCentro(suggested.centroEsperado) !== centroAtual) {
        issues.push(`Centro possivelmente incorreto. Esperado: ${suggested.centroEsperado}`);
      }
      if (metaEsperada && metaAtual && !normalizeText(metaAtual).includes(normalizeText(metaEsperada))) {
        issues.push(`Meta possivelmente incorreta. Sugerida: ${metaEsperada}`);
      }
      if (aprovado && !purchase?.rubrica_debitada_em && !purchase?.financeiro_lancado_em) {
        issues.push('Aprovada sem marcador de débito financeiro');
      }
      if (aprovado && valor <= 0) issues.push('Aprovada com valor zerado ou inválido');

      if (issues.some((issue) => issue.includes('Sem rubrica') || issue.includes('Sem documento') || issue.includes('Aprovada sem marcador'))) {
        severity = 'critica';
      } else if (issues.length > 0) {
        severity = 'atencao';
      }

      return {
        id: purchase.id,
        nf: getNFNumero(purchase),
        fornecedor,
        descricao,
        status,
        statusLabel: statusLabel(purchase.status),
        valor,
        centroAtual,
        rubricaAtual,
        metaAtual,
        rubricaSugerida: suggested ? `${suggested.grupo} — ${suggested.rubrica}` : '',
        metaSugerida: metaEsperada,
        centroSugerido: suggested?.centroEsperado || '',
        hasPdf,
        hasXml,
        docsCount: allDocs.length + (hasDirectFile ? 1 : 0),
        issues,
        severity,
        precisaRefazer: severity === 'critica',
        precisaAlterar: severity === 'atencao' || severity === 'critica',
      };
    });

    const duplicateMap = new Map();
    linhasSolicitacoes.forEach((linha) => {
      const key = `${linha.nf}|${normalizeText(linha.fornecedor)}|${Math.round(linha.valor * 100)}`;
      if (linha.nf && linha.valor > 0) {
        if (!duplicateMap.has(key)) duplicateMap.set(key, []);
        duplicateMap.get(key).push(linha.id);
      }
    });

    const linhasComDuplicidade = linhasSolicitacoes.map((linha) => {
      const key = `${linha.nf}|${normalizeText(linha.fornecedor)}|${Math.round(linha.valor * 100)}`;
      const duplicados = duplicateMap.get(key) || [];
      if (duplicados.length <= 1) return linha;
      return {
        ...linha,
        severity: 'critica',
        precisaRefazer: true,
        precisaAlterar: true,
        issues: [...linha.issues, `Possível duplicidade fiscal: ${duplicados.length} solicitações com mesma NF/fornecedor/valor`],
      };
    });

    const linhasRubricas = ORCAMENTO_REFERENCIA.map((ref, index) => {
      const refNorm = normalizeText(ref.rubrica);
      const rubricaApp = data.rubricas.find((r) => {
        const name = normalizeText(getRubricaName(r));
        return name === refNorm || name.includes(refNorm) || refNorm.includes(name);
      });
      const comprasVinculadas = linhasComDuplicidade.filter((linha) => {
        const atual = normalizeText(linha.rubricaAtual);
        const sugerida = normalizeText(linha.rubricaSugerida);
        return atual.includes(refNorm) || refNorm.includes(atual) || sugerida.includes(refNorm);
      });
      const aprovado = comprasVinculadas
        .filter((linha) => STATUS_APROVADOS.has(linha.status))
        .reduce((acc, linha) => acc + linha.valor, 0);
      const valorApp = toNumber(rubricaApp?.valor_total || rubricaApp?.valor_rubrica || rubricaApp?.total || rubricaApp?.orcamento_total);
      const utilizadoApp = toNumber(rubricaApp?.valor_utilizado || rubricaApp?.utilizado || rubricaApp?.realizado);
      const problemas = [];

      if (!rubricaApp) problemas.push('Rubrica não localizada no app');
      if (rubricaApp && Math.abs(valorApp - ref.total) > 1) problemas.push(`Valor total divergente no app: ${fmtBRL(valorApp)}`);
      if (Math.abs(utilizadoApp - aprovado) > 1 && comprasVinculadas.length > 0) problemas.push(`Utilizado da rubrica difere das solicitações aprovadas: app ${fmtBRL(utilizadoApp)} × solicitações ${fmtBRL(aprovado)}`);
      if (ref.observacao) problemas.push(ref.observacao);

      const severity = problemas.some((p) => p.includes('não localizada') || p.includes('divergente')) ? 'critica' : problemas.length ? 'atencao' : 'ok';

      return {
        index,
        grupo: ref.grupo,
        rubrica: ref.rubrica,
        centroEsperado: ref.centroEsperado || '',
        totalReferencia: ref.total,
        totalApp: valorApp,
        utilizadoApp,
        aprovadoSolicitacoes: aprovado,
        solicitacoes: comprasVinculadas.length,
        problemas,
        severity,
      };
    });

    const pagamentosEquipeSemSolicitacao = data.teamPayments.filter((payment) => {
      const paymentValue = toNumber(payment?.valor || payment?.valor_total || payment?.valor_pago);
      const paymentName = normalizeText(payment?.profissional_nome || payment?.nome || payment?.fornecedor_nome || payment?.descricao || '');
      return !data.purchases.some((purchase) => {
        const purchaseValue = getPurchaseValue(purchase);
        const purchaseText = normalizeText(`${getFornecedor(purchase)} ${getDescricao(purchase)}`);
        return Math.abs(purchaseValue - paymentValue) <= 1 && paymentName && purchaseText.includes(paymentName.split(' ')[0]);
      });
    });

    const totalCriticas = linhasComDuplicidade.filter((linha) => linha.severity === 'critica').length;
    const totalAtencao = linhasComDuplicidade.filter((linha) => linha.severity === 'atencao').length;
    const totalOk = linhasComDuplicidade.filter((linha) => linha.severity === 'ok').length;
    const semDocumento = linhasComDuplicidade.filter((linha) => !linha.hasPdf).length;
    const semXml = linhasComDuplicidade.filter((linha) => linha.hasPdf && !linha.hasXml).length;
    const rubricasCriticas = linhasRubricas.filter((linha) => linha.severity === 'critica').length;

    return {
      solicitacoes: linhasComDuplicidade,
      rubricas: linhasRubricas,
      pagamentosEquipeSemSolicitacao,
      resumo: {
        totalSolicitacoes: linhasComDuplicidade.length,
        totalCriticas,
        totalAtencao,
        totalOk,
        semDocumento,
        semXml,
        rubricasCriticas,
        teamPaymentsOrfaos: pagamentosEquipeSemSolicitacao.length,
      },
    };
  }, [data]);

  const solicitacoesFiltradas = useMemo(() => {
    const q = normalizeText(search);
    return audit.solicitacoes.filter((linha) => {
      const matchFiltro =
        filtro === 'todos' ||
        (filtro === 'critica' && linha.severity === 'critica') ||
        (filtro === 'atencao' && linha.severity === 'atencao') ||
        (filtro === 'sem_documento' && !linha.hasPdf) ||
        (filtro === 'sem_xml' && linha.hasPdf && !linha.hasXml) ||
        (filtro === 'alterar' && linha.precisaAlterar);

      const matchSearch = !q || normalizeText(`${linha.nf} ${linha.fornecedor} ${linha.descricao} ${linha.rubricaAtual} ${linha.rubricaSugerida} ${linha.metaAtual}`).includes(q);
      return matchFiltro && matchSearch;
    });
  }, [audit.solicitacoes, filtro, search]);

  const rubricasComProblema = useMemo(() => {
    return audit.rubricas.filter((linha) => linha.severity !== 'ok');
  }, [audit.rubricas]);

  function exportarSolicitacoes() {
    downloadCsv('auditoria-solicitacoes.csv', [
      ['Status auditoria', 'Precisa refazer', 'Precisa alterar', 'NF', 'Fornecedor', 'Descrição', 'Status app', 'Valor', 'Centro atual', 'Centro sugerido', 'Rubrica atual', 'Rubrica sugerida', 'Meta atual', 'Meta sugerida', 'PDF', 'XML', 'Problemas'],
      ...solicitacoesFiltradas.map((linha) => [
        linha.severity,
        linha.precisaRefazer ? 'SIM' : 'NÃO',
        linha.precisaAlterar ? 'SIM' : 'NÃO',
        linha.nf,
        linha.fornecedor,
        linha.descricao,
        linha.statusLabel,
        linha.valor,
        linha.centroAtual,
        linha.centroSugerido,
        linha.rubricaAtual,
        linha.rubricaSugerida,
        linha.metaAtual,
        linha.metaSugerida,
        linha.hasPdf ? 'SIM' : 'NÃO',
        linha.hasXml ? 'SIM' : 'NÃO',
        linha.issues.join(' | '),
      ]),
    ]);
  }

  function exportarRubricas() {
    downloadCsv('auditoria-rubricas.csv', [
      ['Status auditoria', 'Grupo', 'Rubrica', 'Centro esperado', 'Total referência', 'Total app', 'Utilizado app', 'Aprovado em solicitações', 'Qtd solicitações', 'Problemas'],
      ...audit.rubricas.map((linha) => [
        linha.severity,
        linha.grupo,
        linha.rubrica,
        linha.centroEsperado,
        linha.totalReferencia,
        linha.totalApp,
        linha.utilizadoApp,
        linha.aprovadoSolicitacoes,
        linha.solicitacoes,
        linha.problemas.join(' | '),
      ]),
    ]);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <FileSearch className="h-4 w-4" />
              Auditoria interna
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Auditoria de Solicitações, Rubricas e Documentos</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Ferramenta somente leitura para cruzar orçamento de referência do 3º Aditivo com PurchaseRequest, Rubrica, DocumentIntake, Attachment e TeamPayment.
            </p>
            {currentUser?.email && <p className="mt-1 text-xs text-slate-400">Usuário: {currentUser.email}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={exportarSolicitacoes}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Exportar solicitações
            </button>
            <button
              type="button"
              onClick={exportarRubricas}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600"
            >
              <Table2 className="h-4 w-4" />
              Exportar rubricas
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ResumoCard label="Solicitações" value={audit.resumo.totalSolicitacoes} icon={Table2} />
        <ResumoCard label="Críticas" value={audit.resumo.totalCriticas} icon={ShieldAlert} tone="red" />
        <ResumoCard label="Atenção" value={audit.resumo.totalAtencao} icon={AlertTriangle} tone="amber" />
        <ResumoCard label="Sem PDF/NF" value={audit.resumo.semDocumento} icon={FileSearch} tone="red" />
        <ResumoCard label="Sem XML" value={audit.resumo.semXml} icon={AlertTriangle} tone="amber" />
        <ResumoCard label="OK" value={audit.resumo.totalOk} icon={CheckCircle2} tone="green" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por NF, fornecedor, rubrica, meta..."
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <select
            value={filtro}
            onChange={(event) => setFiltro(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="todos">Todas</option>
            <option value="critica">Críticas</option>
            <option value="atencao">Atenção</option>
            <option value="alterar">Precisa alterar/refazer</option>
            <option value="sem_documento">Sem documento PDF/NF</option>
            <option value="sem_xml">Sem XML</option>
          </select>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Solicitações que precisam de correção</h2>
          <p className="text-sm text-slate-500">Indica o que refazer, alterar em rubrica/meta/centro ou quando não há documento correspondente.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Auditoria</th>
                <th className="px-3 py-3">NF</th>
                <th className="px-3 py-3">Fornecedor / descrição</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3">Centro atual</th>
                <th className="px-3 py-3">Rubrica atual</th>
                <th className="px-3 py-3">Meta atual</th>
                <th className="px-3 py-3">Correção sugerida</th>
                <th className="px-3 py-3">Docs</th>
                <th className="px-3 py-3">Problemas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-500">Carregando dados da auditoria...</td>
                </tr>
              ) : solicitacoesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-slate-500">Nenhuma solicitação encontrada para o filtro atual.</td>
                </tr>
              ) : (
                solicitacoesFiltradas.map((linha) => (
                  <tr key={linha.id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(linha.severity)}`}>
                        {linha.severity === 'critica' ? 'Refazer' : linha.severity === 'atencao' ? 'Alterar' : 'OK'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800">{linha.nf || '—'}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{linha.fornecedor || '—'}</p>
                      <p className="mt-1 line-clamp-2 max-w-xs text-xs text-slate-500">{linha.descricao || '—'}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{linha.statusLabel}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-900">{fmtBRL(linha.valor)}</td>
                    <td className="px-3 py-3 text-slate-600">{linha.centroAtual || '—'}</td>
                    <td className="px-3 py-3 max-w-[220px] text-slate-700">{linha.rubricaAtual || '—'}</td>
                    <td className="px-3 py-3 max-w-[180px] text-slate-600">{linha.metaAtual || '—'}</td>
                    <td className="px-3 py-3 max-w-[280px]">
                      <p className="text-xs font-medium text-slate-800">{linha.rubricaSugerida || '—'}</p>
                      {(linha.centroSugerido || linha.metaSugerida) && (
                        <p className="mt-1 text-xs text-slate-500">
                          {linha.centroSugerido ? `Centro: ${linha.centroSugerido}` : ''}
                          {linha.centroSugerido && linha.metaSugerida ? ' · ' : ''}
                          {linha.metaSugerida ? `Meta: ${linha.metaSugerida}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1 text-xs">
                        <span className={linha.hasPdf ? 'text-emerald-700' : 'text-red-700'}>PDF/NF: {linha.hasPdf ? 'sim' : 'não'}</span>
                        <span className={linha.hasXml ? 'text-emerald-700' : 'text-amber-700'}>XML: {linha.hasXml ? 'sim' : 'não'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-md">
                      {linha.issues.length === 0 ? (
                        <span className="text-xs text-emerald-700">Sem inconsistência detectada</span>
                      ) : (
                        <ul className="space-y-1 text-xs text-slate-600">
                          {linha.issues.map((issue, index) => (
                            <li key={`${linha.id}-${index}`}>• {issue}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Rubricas divergentes ou ausentes</h2>
          <p className="text-sm text-slate-500">Compara a tabela de referência com as rubricas existentes e os valores aprovados nas solicitações.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Grupo</th>
                <th className="px-3 py-3">Rubrica</th>
                <th className="px-3 py-3 text-right">Referência</th>
                <th className="px-3 py-3 text-right">App</th>
                <th className="px-3 py-3 text-right">Utilizado app</th>
                <th className="px-3 py-3 text-right">Aprovado solicitações</th>
                <th className="px-3 py-3">Problemas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Carregando rubricas...</td>
                </tr>
              ) : rubricasComProblema.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Nenhuma divergência de rubrica detectada.</td>
                </tr>
              ) : (
                rubricasComProblema.map((linha) => (
                  <tr key={`${linha.grupo}-${linha.rubrica}-${linha.index}`} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(linha.severity)}`}>
                        {linha.severity === 'critica' ? 'Crítica' : 'Atenção'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{linha.grupo}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{linha.rubrica}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtBRL(linha.totalReferencia)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{linha.totalApp ? fmtBRL(linha.totalApp) : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtBRL(linha.utilizadoApp)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtBRL(linha.aprovadoSolicitacoes)}</td>
                    <td className="px-3 py-3 max-w-md text-xs text-slate-600">
                      {linha.problemas.map((problema, index) => <p key={index}>• {problema}</p>)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {audit.resumo.teamPaymentsOrfaos > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <h2 className="font-semibold">Pagamentos de equipe sem solicitação correspondente</h2>
          <p className="mt-1">
            Foram encontrados {audit.resumo.teamPaymentsOrfaos} registros em TeamPayment sem correspondência clara em PurchaseRequest. Esses casos devem ser migrados/refeitos como solicitação formal com NF/documento e rubrica vinculada.
          </p>
        </section>
      )}
    </div>
  );
}

function ResumoCard({ label, value, icon: Icon, tone = 'slate' }) {
  const toneClasses = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${toneClasses[tone] || toneClasses.slate}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
          <p className="mt-2 text-2xl font-bold">{Number(value || 0).toLocaleString('pt-BR')}</p>
        </div>
        <Icon className="h-5 w-5 opacity-70" />
      </div>
    </div>
  );
}
