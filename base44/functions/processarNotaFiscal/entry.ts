import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const BLOCKED_EXTENSIONS = ['exe', 'bat', 'cmd', 'js', 'sh', 'php', 'html'];

type NFStatus = 'lido_com_sucesso' | 'leitura_parcial' | 'leitura_falhou';

type NFExtraida = {
  nf_tipo_documento: 'pdf_nf' | 'xml_nf' | '';
  nf_numero: string;
  nf_valor_total: string;
  nf_data_emissao: string;
  nf_emitente_nome: string;
  nf_emitente_cpf_cnpj: string;
  nf_destinatario_nome: string;
  nf_destinatario_cpf_cnpj: string;
  nf_chave_acesso: string;
  nf_status_leitura: NFStatus;
  nf_nome_original: string;
  nf_nome_renomeado: string;
  nf_dados_extraidos_json: string;
};

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function onlyDigits(value: unknown): string {
  return safeString(value).replace(/\D+/g, '');
}

function normalizeText(value: unknown): string {
  return safeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function formatCurrencyBR(value: unknown): string {
  const raw = safeString(value);
  if (!raw) return '0,00';

  const normalized = raw
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  const num = Number(normalized);
  if (!Number.isFinite(num)) return '0,00';

  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseMoneyToCanonical(value: unknown): string {
  const raw = safeString(value);
  if (!raw) return '';

  const cleaned = raw
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return '';

  return num.toFixed(2);
}

function detectExtension(fileName: string): string {
  const parts = safeString(fileName).split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function mapFuncao(funcao: string): string {
  const raw = normalizeText(funcao);

  const mapa: Record<string, string> = {
    COORDENADOR: 'COORDENADOR GERAL',
    'COORDENADOR GERAL': 'COORDENADOR GERAL',
    ADMINISTRADOR: 'ADMINISTRATIVO',
    ADMINISTRATIVO: 'ADMINISTRATIVO',
    COMUNICADOR: 'COMUNICACAO',
    COMUNICACAO: 'COMUNICACAO',
    EDUCADOR: 'EDUCADOR',
    'CONSULTORIA PROGRAMACAO': 'CONSULTORIA PROGRAMACAO',
    'CONSULTORIA DE PROGRAMACAO': 'CONSULTORIA PROGRAMACAO',
    'PRODUTOR CULTURAL': 'PRODUTOR CULTURAL',
  };

  return mapa[raw] || raw || 'OUTRO';
}

function buildRenamedFileName(params: {
  sequencial: number;
  funcao: string;
  nome: string;
  valor: string;
  extension: string;
}) {
  const funcao = mapFuncao(params.funcao);
  const nome = normalizeText(params.nome || 'SEM NOME');
  const valor = formatCurrencyBR(params.valor || '0');
  const ext = params.extension || 'bin';

  return `NF ${params.sequencial} ${funcao} - ${nome} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

function detectIsLikelyNF(fileName: string, content: string): boolean {
  const full = `${safeString(fileName)} ${safeString(content)}`.toUpperCase();

  return (
    full.includes('NOTA FISCAL') ||
    full.includes('NOTA FISCAL ELETRONICA') ||
    full.includes('NF-E') ||
    full.includes('NFE') ||
    full.includes('<NFE') ||
    full.includes('<PROCNFE') ||
    full.includes('CHAVE DE ACESSO')
  );
}

function extractByRegex(content: string, regexes: RegExp[]): string {
  for (const regex of regexes) {
    const match = content.match(regex);
    if (match?.[1]) return safeString(match[1]);
  }
  return '';
}

function normalizeDate(value: string): string {
  const v = safeString(value);
  if (!v) return '';

  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const brMatch = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;

  return v;
}

function xmlTag(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1] ? safeString(match[1]) : '';
}

function parseXMLNF(xml: string) {
  const numero = xmlTag(xml, 'nNF');
  const valor = xmlTag(xml, 'vNF');
  const dataEmissaoRaw = xmlTag(xml, 'dhEmi') || xmlTag(xml, 'dEmi');

  const emitBlockMatch = xml.match(/<emit>([\s\S]*?)<\/emit>/i);
  const destBlockMatch = xml.match(/<dest>([\s\S]*?)<\/dest>/i);

  const emitBlock = emitBlockMatch?.[1] || '';
  const destBlock = destBlockMatch?.[1] || '';

  const emitenteNome = xmlTag(emitBlock, 'xNome');
  const emitenteDoc = xmlTag(emitBlock, 'CNPJ') || xmlTag(emitBlock, 'CPF');

  const destinatarioNome = xmlTag(destBlock, 'xNome');
  const destinatarioDoc = xmlTag(destBlock, 'CNPJ') || xmlTag(destBlock, 'CPF');

  const chave =
    extractByRegex(xml, [
      /Id="NFe(\d{44})"/i,
      /<chNFe>(\d{44})<\/chNFe>/i,
    ]) || '';

  return {
    nf_numero: onlyDigits(numero),
    nf_valor_total: parseMoneyToCanonical(valor),
    nf_data_emissao: normalizeDate(safeString(dataEmissaoRaw).slice(0, 10)),
    nf_emitente_nome: emitenteNome,
    nf_emitente_cpf_cnpj: onlyDigits(emitenteDoc),
    nf_destinatario_nome: destinatarioNome,
    nf_destinatario_cpf_cnpj: onlyDigits(destinatarioDoc),
    nf_chave_acesso: onlyDigits(chave).slice(0, 44),
  };
}

function parsePDFText(text: string) {
  const numero = extractByRegex(text, [
    /(?:N[úu]mero da Nota|N[ºo]|NF[- ]?e|Nota Fiscal(?: Eletr[oô]nica)?)\s*[:#]?\s*(\d{1,12})/i,
    /(?:N[úu]mero)\s*[:#]?\s*(\d{1,12})/i,
  ]);

  const valor = extractByRegex(text, [
    /Valor Total\s*[:R$\s]*([\d\.\,]{1,20})/i,
    /VALOR TOTAL DA NOTA\s*[:R$\s]*([\d\.\,]{1,20})/i,
    /R\$\s*([\d\.\,]{1,20})/i,
  ]);

  const data = extractByRegex(text, [
    /Data de Emiss[aã]o\s*[:\s]*([\d\/-]{8,10})/i,
    /Emiss[aã]o\s*[:\s]*([\d\/-]{8,10})/i,
  ]);

  const emitenteNome = extractByRegex(text, [
    /Emitente\s*[:\s]*([^\n\r]+)/i,
    /Raz[aã]o Social\s*[:\s]*([^\n\r]+)/i,
  ]);

  const emitenteDoc = extractByRegex(text, [
    /CNPJ\s*[:\s]*([\d\.\-\/]{14,18})/i,
    /CPF\s*[:\s]*([\d\.\-]{11,14})/i,
  ]);

  const destinatarioNome = extractByRegex(text, [
    /Destinat[aá]rio\s*[:\s]*([^\n\r]+)/i,
    /Tomador\s*[:\s]*([^\n\r]+)/i,
  ]);

  const destinatarioDoc = extractByRegex(text, [
    /Destinat[aá]rio[\s\S]{0,80}?(?:CNPJ|CPF)\s*[:\s]*([\d\.\-\/]{11,18})/i,
  ]);

  const chave = extractByRegex(text, [
    /Chave de Acesso\s*[:\s]*([\d\s]{44,60})/i,
    /(\d{44})/i,
  ]);

  return {
    nf_numero: onlyDigits(numero),
    nf_valor_total: parseMoneyToCanonical(valor),
    nf_data_emissao: normalizeDate(data),
    nf_emitente_nome: emitenteNome,
    nf_emitente_cpf_cnpj: onlyDigits(emitenteDoc),
    nf_destinatario_nome: destinatarioNome,
    nf_destinatario_cpf_cnpj: onlyDigits(destinatarioDoc),
    nf_chave_acesso: onlyDigits(chave).slice(0, 44),
  };
}

function countFilledFields(data: Record<string, string>): number {
  return Object.values(data).filter((v) => safeString(v) !== '').length;
}

async function countExistingNF(base44: any, reportId: string, ownerEmail: string) {
  try {
    if (reportId) {
      const reportDocs = await base44.asServiceRole.entities.Attachment.filter(
        { report_id: reportId },
        '-created_date',
        500
      );

      return (Array.isArray(reportDocs) ? reportDocs : []).filter((item) =>
        safeString(item?.nf_tipo_documento)
      ).length;
    }

    const userDocs = await base44.asServiceRole.entities.Attachment.filter(
      { created_by: ownerEmail },
      '-created_date',
      500
    );

    return (Array.isArray(userDocs) ? userDocs : []).filter((item) =>
        safeString(item?.nf_tipo_documento)
      ).length;
  } catch {
    return 0;
  }
}

function validateFileExtension(fileName) {
  const parts = String(fileName || '').split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const attachmentId = safeString(body?.attachment_id);

    if (!attachmentId) {
      return Response.json(
        { ok: false, error: 'Parâmetro obrigatório: attachment_id' },
        { status: 400 }
      );
    }

    const attachment = await base44.asServiceRole.entities.Attachment.get(attachmentId);

    if (!attachment) {
      return Response.json(
        { ok: false, error: `Attachment não encontrado: ${attachmentId}` },
        { status: 404 }
      );
    }
    
    // VALIDAR EXTENSÃO
    const fileName = safeString(attachment.file_name || attachment.name);
    if (!validateFileExtension(fileName)) {
      console.warn(`Extensão bloqueada para NF: ${fileName}`);
      return Response.json(
        { ok: false, error: 'Tipo de arquivo não permitido.' },
        { status: 400 }
      );
    }

    const fileUrl = safeString(attachment.file_url);
    const extension = detectExtension(fileName);

    if (!fileUrl) {
      return Response.json(
        { ok: false, error: 'Attachment sem file_url' },
        { status: 400 }
      );
    }

    const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      url: fileUrl,
    });

    const downloadUrl = safeString(signed?.signed_url || fileUrl);

    const response = await fetch(downloadUrl);
     if (!response.ok) {
       throw new Error(`Falha ao baixar arquivo: ${response.status}`);
     }

     // Validar tamanho do arquivo
     const contentLength = response.headers.get('content-length');
     if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_SIZE_BYTES) {
       console.warn(`Arquivo rejeitado por exceder tamanho máximo: ${fileName} (${contentLength} bytes)`);
       await base44.asServiceRole.entities.Attachment.update(attachmentId, {
         nf_tipo_documento: '',
         nf_status_leitura: 'leitura_falhou',
         nf_nome_original: fileName,
         nf_nome_renomeado: fileName,
         nf_dados_extraidos_json: JSON.stringify({
           motivo: 'arquivo_muito_grande',
           tamanho_max_mb: 25,
           processed_at: new Date().toISOString(),
         }),
         nf_pronto_para_email: false,
         nf_pronto_para_backup: false,
       });

       return Response.json({
         ok: false,
         error: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.',
       }, { status: 400 });
     }

     const content = await response.text();
    const isXML = extension === 'xml';
    const isPDF = extension === 'pdf';

    if (!detectIsLikelyNF(fileName, content) && !isXML && !isPDF) {
      await base44.asServiceRole.entities.Attachment.update(attachmentId, {
        nf_tipo_documento: '',
        nf_status_leitura: 'leitura_falhou',
        nf_nome_original: fileName,
        nf_nome_renomeado: fileName,
        nf_dados_extraidos_json: JSON.stringify({
          motivo: 'arquivo_nao_identificado_como_nf',
          processed_at: new Date().toISOString(),
        }),
        nf_pronto_para_email: false,
        nf_pronto_para_backup: false,
      });

      return Response.json({
        ok: true,
        skipped: true,
        message: 'Arquivo não identificado como Nota Fiscal.',
      });
    }

    let parsed = {
      nf_numero: '',
      nf_valor_total: '',
      nf_data_emissao: '',
      nf_emitente_nome: '',
      nf_emitente_cpf_cnpj: '',
      nf_destinatario_nome: '',
      nf_destinatario_cpf_cnpj: '',
      nf_chave_acesso: '',
    };

    let nfTipoDocumento: 'pdf_nf' | 'xml_nf' | '' = '';

    if (isXML) {
      parsed = parseXMLNF(content);
      nfTipoDocumento = 'xml_nf';
    } else if (isPDF) {
      parsed = parsePDFText(content);
      nfTipoDocumento = 'pdf_nf';
    }

    const filled = countFilledFields(parsed);
    let nfStatusLeitura: NFStatus = 'leitura_falhou';

    if (filled >= 6) {
      nfStatusLeitura = 'lido_com_sucesso';
    } else if (filled >= 2) {
      nfStatusLeitura = 'leitura_parcial';
    }

    const reportId = safeString(attachment.report_id);

    const ownerName =
      safeString(attachment.author_name) ||
      safeString(attachment.user_name) ||
      safeString(user.full_name) ||
      safeString(user.name);

    const ownerFuncao =
      safeString(attachment.funcao) ||
      safeString(user.funcao) ||
      safeString(user.role);

    const sequencial = (await countExistingNF(base44, reportId, safeString(user.email))) + 1;

    const renamedFileName = buildRenamedFileName({
      sequencial,
      funcao: ownerFuncao,
      nome: ownerName,
      valor: parsed.nf_valor_total || '0',
      extension,
    });

    const extractedPayload: NFExtraida = {
      nf_tipo_documento: nfTipoDocumento,
      nf_numero: parsed.nf_numero,
      nf_valor_total: parsed.nf_valor_total,
      nf_data_emissao: parsed.nf_data_emissao,
      nf_emitente_nome: parsed.nf_emitente_nome,
      nf_emitente_cpf_cnpj: parsed.nf_emitente_cpf_cnpj,
      nf_destinatario_nome: parsed.nf_destinatario_nome,
      nf_destinatario_cpf_cnpj: parsed.nf_destinatario_cpf_cnpj,
      nf_chave_acesso: parsed.nf_chave_acesso,
      nf_status_leitura: nfStatusLeitura,
      nf_nome_original: fileName,
      nf_nome_renomeado: renamedFileName,
      nf_dados_extraidos_json: JSON.stringify({
        ...parsed,
        source_extension: extension,
        processed_at: new Date().toISOString(),
      }),
    };

    // 1. RENOMEIA E GRAVA METADADOS PRIMEIRO
    await base44.asServiceRole.entities.Attachment.update(attachmentId, {
      ...extractedPayload,

      // Sinais para etapas seguintes
      nf_pronto_para_email: true,
      nf_pronto_para_backup: true,

      // Controle
      backup_done: false,
      backup_date: null,
      drive_file_id: safeString(attachment.drive_file_id || ''),

      // Se existir campo de nome exibido no schema, já atualiza também
      file_name: renamedFileName,
    });

    // 2. A PARTIR DAQUI, QUALQUER OUTRA ETAPA DEVE USAR nf_nome_renomeado
    // Ex.: enviar e-mail / copiar para Drive / backup
    // Não estou chamando outras funções aqui porque isso depende do seu ambiente e do plano.
    // Mas o Attachment já fica preparado com o nome final correto.

    return Response.json({
      ok: true,
      attachment_id: attachmentId,
      renamed_first: true,
      ready_for_email: true,
      ready_for_backup: true,
      ...extractedPayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
});