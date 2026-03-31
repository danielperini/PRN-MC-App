/**
 * nfParser.js — Utilitário de leitura inteligente de Nota Fiscal
 * Suporta XML NF-e (determinístico) e PDF NF (IA como fallback)
 */

import { base44 } from '@/api/base44Client';

// ──────────────────────────────────────────────────────────
// Detecção
// ──────────────────────────────────────────────────────────

export function isNFFile(file) {
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  if (type === 'text/xml' || name.endsWith('.xml')) return true;
  if (type === 'application/pdf' || name.endsWith('.pdf')) return true;
  return false;
}

export function getNFFileType(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.xml') || file.type === 'text/xml') return 'xml_nf';
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf_nf';
  return null;
}

// ──────────────────────────────────────────────────────────
// Normalização
// ──────────────────────────────────────────────────────────

export function normalizeText(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function normalizeCurrency(val) {
  if (!val) return null;
  const clean = String(val).replace(/[^\d,\.]/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

export function formatCurrencyBR(val) {
  if (val == null) return '';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ──────────────────────────────────────────────────────────
// Mapeamento de função → label padronizado
// ──────────────────────────────────────────────────────────

const FUNCAO_MAP = {
  coordenador: 'COORDENADOR GERAL',
  coordenadora: 'COORDENADOR GERAL',
  administrador: 'ADMINISTRATIVO',
  administradora: 'ADMINISTRATIVO',
  comunicador: 'COMUNICACAO',
  comunicadora: 'COMUNICACAO',
  educador: 'EDUCADOR',
  educadora: 'EDUCADOR',
  produtor: 'PRODUCAO',
  produtora: 'PRODUCAO',
  designer: 'DESIGNER',
  fotografo: 'FOTOGRAFO',
  videomaker: 'VIDEOMAKER',
  mediador: 'EDUCADOR',
  mediadora: 'EDUCADOR',
};

export function mapFuncaoLabel(funcao) {
  if (!funcao) return 'SERVICO';
  const key = normalizeText(funcao).toLowerCase().split(' ')[0];
  return FUNCAO_MAP[key] || normalizeText(funcao);
}

// ──────────────────────────────────────────────────────────
// Renomeação
// ──────────────────────────────────────────────────────────

export function buildNFFilename({ sequencial, funcaoLabel, nome, valor, ext }) {
  const seq = sequencial || 1;
  const fn = funcaoLabel || 'SERVICO';
  const nm = normalizeText(nome || 'PRESTADOR');
  const vl = valor != null ? formatCurrencyBR(valor) : '0,00';
  const ex = (ext || 'pdf').replace(/^\./, '');
  return `NF ${seq} ${fn} - ${nm} - MUSEUS CENTRO - R$ ${vl}.${ex}`;
}

// ──────────────────────────────────────────────────────────
// Parser XML NF-e determinístico
// ──────────────────────────────────────────────────────────

function getXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

export function parseXmlNF(xmlText) {
  try {
    const xml = xmlText;
    const numero = getXmlTag(xml, 'nNF') || getXmlTag(xml, 'nRPS');
    const chave = getXmlTag(xml, 'chNFe') || getXmlTag(xml, 'Id');
    const dataRaw = getXmlTag(xml, 'dhEmi') || getXmlTag(xml, 'dEmi') || getXmlTag(xml, 'dtEmissao');
    const data_emissao = dataRaw ? dataRaw.substring(0, 10) : null;
    const valor_total = normalizeCurrency(
      getXmlTag(xml, 'vNF') || getXmlTag(xml, 'vLiquidoNfse') || getXmlTag(xml, 'Valor')
    );

    // Emitente — NF-e padrão
    const emit_cnpj = getXmlTag(xml, 'CNPJ') || getXmlTag(xml, 'CpfCnpjPrestador');
    const emit_cpf = getXmlTag(xml, 'CPF');
    const emit_nome = getXmlTag(xml, 'xNome') || getXmlTag(xml, 'RazaoSocial') || getXmlTag(xml, 'xFant');
    const emitente_cpf_cnpj = emit_cnpj || emit_cpf;

    // Destinatário
    const dest_section = xml.match(/<dest>([\s\S]*?)<\/dest>/i)?.[1] || '';
    const dest_cnpj = getXmlTag(dest_section, 'CNPJ');
    const dest_cpf = getXmlTag(dest_section, 'CPF');
    const dest_nome = getXmlTag(dest_section, 'xNome');

    const status_leitura = (numero && (emit_cnpj || emit_cpf) && valor_total != null)
      ? 'lido_com_sucesso'
      : (numero || valor_total != null)
        ? 'leitura_parcial'
        : 'leitura_falhou';

    return {
      tipo_documento: 'xml_nf',
      numero_nf: numero,
      valor_total,
      data_emissao,
      emitente_nome: emit_nome,
      emitente_cpf_cnpj,
      destinatario_nome: dest_nome,
      destinatario_cpf_cnpj: dest_cnpj || dest_cpf || null,
      chave_acesso: chave,
      status_leitura,
    };
  } catch {
    return { tipo_documento: 'xml_nf', status_leitura: 'leitura_falhou' };
  }
}

// ──────────────────────────────────────────────────────────
// Parser PDF via IA
// ──────────────────────────────────────────────────────────

export async function parsePdfNFWithAI(fileUrl) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um leitor especializado em Notas Fiscais brasileiras (NF-e, NFS-e, RPS).
Analise o PDF e extraia EXATAMENTE os campos abaixo. Se não encontrar, retorne null.
Retorne SOMENTE o JSON, sem texto adicional.

Campos:
- numero_nf: string (número da NF, ex: "000123")
- valor_total: number (valor total em reais, ex: 7000.00)
- data_emissao: string (formato YYYY-MM-DD)
- emitente_nome: string (nome ou razão social de quem emite)
- emitente_cpf_cnpj: string (apenas dígitos)
- destinatario_nome: string (tomador/destinatário)
- destinatario_cpf_cnpj: string (apenas dígitos, se existir)
- chave_acesso: string (44 dígitos, se existir)`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          numero_nf: { type: 'string' },
          valor_total: { type: 'number' },
          data_emissao: { type: 'string' },
          emitente_nome: { type: 'string' },
          emitente_cpf_cnpj: { type: 'string' },
          destinatario_nome: { type: 'string' },
          destinatario_cpf_cnpj: { type: 'string' },
          chave_acesso: { type: 'string' },
        },
      },
    });

    const status_leitura = (result?.numero_nf && result?.emitente_cpf_cnpj && result?.valor_total != null)
      ? 'lido_com_sucesso'
      : (result?.numero_nf || result?.valor_total != null)
        ? 'leitura_parcial'
        : 'leitura_falhou';

    return {
      tipo_documento: 'pdf_nf',
      numero_nf: result?.numero_nf || null,
      valor_total: result?.valor_total ?? null,
      data_emissao: result?.data_emissao || null,
      emitente_nome: result?.emitente_nome || null,
      emitente_cpf_cnpj: result?.emitente_cpf_cnpj || null,
      destinatario_nome: result?.destinatario_nome || null,
      destinatario_cpf_cnpj: result?.destinatario_cpf_cnpj || null,
      chave_acesso: result?.chave_acesso || null,
      status_leitura,
    };
  } catch {
    return { tipo_documento: 'pdf_nf', status_leitura: 'leitura_falhou' };
  }
}

// ──────────────────────────────────────────────────────────
// Orquestrador principal
// ──────────────────────────────────────────────────────────

export async function processNFFile({ file, fileUrl, sequencial, userFuncao, userName }) {
  const tipo = getNFFileType(file);
  if (!tipo) return null; // não é NF conhecida

  let nfData = null;

  if (tipo === 'xml_nf') {
    try {
      const text = await file.text();
      nfData = parseXmlNF(text);
    } catch {
      nfData = { tipo_documento: 'xml_nf', status_leitura: 'leitura_falhou' };
    }
  } else if (tipo === 'pdf_nf') {
    nfData = await parsePdfNFWithAI(fileUrl);
  }

  if (!nfData) return null;

  const ext = file.name.split('.').pop() || tipo === 'xml_nf' ? 'xml' : 'pdf';
  const funcaoLabel = mapFuncaoLabel(userFuncao);
  const nome = nfData.emitente_nome || userName || 'PRESTADOR';
  const nome_renomeado = buildNFFilename({
    sequencial,
    funcaoLabel,
    nome,
    valor: nfData.valor_total,
    ext,
  });

  return {
    ...nfData,
    nome_original: file.name,
    nome_renomeado,
  };
}