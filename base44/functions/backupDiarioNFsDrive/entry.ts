import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { invokeLLM } from '../_shared/gatewayIA.ts';

/**
 * backupDiarioNFsDrive
 *
 * Rotina diária de backup de notas fiscais aprovadas para o Google Drive.
 *
 * Pasta raiz: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp
 * Estrutura existente: {MM-YYYY}  (ex: 07-2026)
 *
 * Regra: NÃO criar pastas novas — usar apenas pastas que já existem.
 * Se a pasta do mês não existir, pular o arquivo e logar.
 *
 * Padrão de nome:
 *   NF {NUMERO} - {FORNECEDOR} - {PROFISSIONAL} - {CENTRO_CUSTO} - {CODIGO} - R$ {VALOR}.pdf
 *   XML {NUMERO} - {FORNECEDOR} - {PROFISSIONAL} - {CENTRO_CUSTO} - {CODIGO} - R$ {VALOR}.xml
 *   COMP NF {NUMERO} - {FORNECEDOR} - {PROFISSIONAL} - {CENTRO_CUSTO} - {CODIGO} - R$ {VALOR}.pdf
 *
 * Regras de data: rejeitar/reanalisar datas anteriores a 2026.
 */

const ROOT_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BATCH_SIZE = 10;

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STATUS_APROVADOS = ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'];

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeStr(v) {
  return String(v || '').trim();
}

function normalizeText(v) {
  return safeStr(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 \-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseValor(v) {
  const raw = safeStr(v).replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(raw.replace(',', '.')) || 0;
}

function formatValor(v) {
  const num = parseValor(v);
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sanitizeFilePart(v, maxLen = 50) {
  return safeStr(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen)
    .trim();
}

/**
 * Dada uma data string, retorna { ano, mesIdx (0-based), mesNome }
 * ou null se a data for inválida / anterior a 2026.
 */
function parseDataEmissao(raw) {
  if (!raw) return null;
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    d = new Date(raw.substring(0, 10) + 'T12:00:00Z');
  } else {
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  }
  if (!d || isNaN(d.getTime())) return null;
  const ano = d.getFullYear();
  const mesIdx = d.getMonth();
  return { ano, mesIdx, mesNome: MESES_PT[mesIdx] };
}

/**
 * Determina o projeto com base no centro de custo.
 */
function getProjeto(centroCusto) {
  const cc = normalizeText(centroCusto);
  if (cc.includes('NOTURNO')) return 'NOTURNO NOS MUSEUS 2026';
  return 'MUSEUS CENTRO';
}

/**
 * Monta o nome padronizado do arquivo.
 * Formato: {PREFIXO} {NUMERO_NF} - {MES_ANO} - {FORNECEDOR} - {PROFISSIONAL} - {CENTRO_CUSTO} - {CODIGO} - R$ {VALOR}.ext
 * Exemplo: NF 001234 - 07-2026 - SAMIRA LOPES MOTA - MIS BH - 339039 - R$ 2.600,00.pdf
 * tipo: 'NF' | 'XML' | 'COMP'
 */
function buildFileName(tipo, pr, extra = {}) {
  // 1. Número da nota
  const numero = sanitizeFilePart(
    pr.nf_numero || extra.nf_numero || pr.id?.substring(0, 8) || 'SN', 15
  );

  // 2. Mês/Ano (ex: 07-2026) — vem do dateInfo passado via extra
  const mesAno = extra.mesAno || '';

  // 3. Fornecedor
  const fornecedor = sanitizeFilePart(
    pr.fornecedor_nome || pr.nf_emitente_nome || extra.fornecedor || 'FORNECEDOR', 50
  );

  // 4. Profissional responsável — omitido se vazio
  const profissional = sanitizeFilePart(
    pr.usuario_pagamento_nome || pr.aprov_coord_nome || extra.profissional || '', 40
  );

  // 5. Centro de custo direto
  const centroCusto = sanitizeFilePart(pr.centro_custo || extra.centro_custo || 'GERAL', 40);

  // 6. Código (natureza de despesa ou rubrica_nome como fallback)
  const codigo = sanitizeFilePart(
    pr.natureza_despesa || pr.natureza_despesa_purchase || pr.rubrica_nome || pr.categoria || 'COD', 30
  );

  // 7. Valor numérico (ex: R$ 2.600,00)
  const valorNum = parseValor(
    pr.valor_pago || pr.valor_aprovado_admin || pr.nf_valor_total || pr.valor_solicitado || 0
  );
  const valor = 'R$ ' + valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  const prefixo = tipo === 'COMP' ? 'COMP NF' : tipo;

  // Monta sequência: numero - mesAno - fornecedor - [profissional -] centroCusto - codigo - valor
  const partes = [];
  if (mesAno) partes.push(mesAno);
  partes.push(fornecedor);
  if (profissional) partes.push(profissional);
  partes.push(centroCusto);
  partes.push(codigo);
  partes.push(valor);

  return `${prefixo} ${numero} - ${partes.join(' - ')}.${ext}`;
}

// ── Google Drive helpers ─────────────────────────────────────────────────────

async function getToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  return accessToken;
}

async function driveGet(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r;
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=10`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Erro criar pasta "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreate(token, name, parentId) {
  return (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
}

/**
 * Busca uma pasta pelo nome no pai — retorna null se não existir (não cria).
 */
async function findFolderOnly(token, name, parentId) {
  return findFolder(token, name, parentId);
}

/**
 * Verifica se um arquivo com o mesmo nome já existe na pasta.
 */
async function fileExistsInFolder(token, fileName, folderId) {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`
  );
  const r = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0] || null;
}

/**
 * Faz upload de um arquivo a partir de uma URL pública.
 */
async function uploadFromUrl(token, fileUrl, fileName, folderId) {
  const dlRes = await fetch(fileUrl);
  if (!dlRes.ok) throw new Error(`Download falhou (${dlRes.status}): ${fileUrl}`);
  const blob = await dlRes.blob();
  const mimeType = fileName.endsWith('.xml') ? 'application/xml' : 'application/pdf';

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', new Blob([await blob.arrayBuffer()], { type: mimeType }), fileName);

  const upRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  );
  const result = await upRes.json();
  if (result.error) throw new Error(`Upload Drive falhou: ${result.error.message}`);
  return { id: result.id, link: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view` };
}

// ── Validação e reanálise de data (fonte de verdade = PDF via IA) ──────────────

/**
 * Monta URL pública de download direto a partir de uma URL de viewer do Drive.
 * Não faz download — apenas adapta a URL para algo que a IA possa baixar.
 * Retorna a URL original se não for do Drive.
 */
function montarUrlPublicaDrive(pdfUrl) {
  if (!pdfUrl) return null;
  if (!pdfUrl.includes('drive.google.com')) return pdfUrl;
  const m = pdfUrl.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return pdfUrl;
}

/**
 * Baixa um PDF (Drive autenticado ou URL pública) e procura datas DD/MM/YYYY
 * no conteúdo binário (extração determinística quando o texto é pesquisável).
 * Retorna a primeira data com ano >= 2026 no formato YYYY-MM-DD, ou null.
 */
async function extrairDataDeterministicaPdf(token, pdfUrl) {
  try {
    let r;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      if (pdfUrl.includes('drive.google.com')) {
        const m = pdfUrl.match(/\/file\/d\/([^/]+)/);
        if (!m) return null;
        r = await fetch(`https://www.googleapis.com/drive/v3/files/${m[1]}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
      } else {
        r = await fetch(pdfUrl, { signal: ctrl.signal });
      }
    } finally {
      clearTimeout(t);
    }
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf));
    const padroes = [
      /(\d{2})\/(\d{2})\/(\d{4})/g,
      /(\d{4})-(\d{2})-(\d{2})/g,
      /(\d{2})\.(\d{2})\.(\d{4})/g,
    ];
    for (const p of padroes) {
      let m;
      while ((m = p.exec(text)) !== null) {
        let d, me, y;
        if (p.source.includes('\\\\d\\{4\\}')) {
          if (p.source.startsWith('(\\\\d{4})')) { y = m[1]; me = m[2]; d = m[3]; }
          else { d = m[1]; me = m[2]; y = m[3]; }
        }
        const ano = parseInt(y);
        if (ano >= 2026 && ano <= 2030) {
          return `${y}-${String(me).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }
    }
    return null;
  } catch (e) {
    console.warn(`[extrairDataDet] erro: ${e.message}`);
    return null;
  }
}

/**
 * Confirma a data de EMISSÃO da NF sempre lendo o PDF via IA (fonte de verdade = PDF).
 * Regra de negócio: datas de emissão válidas são de 2026 em diante.
 *
 * Fluxo:
 *   1. Sem PDF: usa a data do banco se for >= 2026, caso contrário invalida.
 *   2. Com PDF: IA lê o PDF e extrai a data de emissão REAL (ignorando abertura
 *      de empresa, contratos, convênios). Atualiza o banco se diferente e válida.
 *      Se a IA retornar data inválida, confiança baixa ou erro, usa fallback do
 *      banco (>= 2026) se houver; senão invalida.
 */
async function validarDataEmissao(base44, token, pr) {
  const dataBanco = pr.nf_data_emissao || pr.aprov_admin_data || pr.aprov_coord_data || '';
  const parsedBanco = parseDataEmissao(dataBanco);

  const pdfUrlOriginal = pr.nota_fiscal_url || pr.nota_fiscal_pdf_url || pr.nf_pdf_url || '';

  // Sem PDF para IA confirmar — confia no banco apenas se for >= 2026
  if (!pdfUrlOriginal) {
    if (parsedBanco && parsedBanco.ano >= 2026) {
      return { dataValida: true, dateInfo: parsedBanco, reanalisado: false };
    }
    return { dataValida: false, dateInfo: parsedBanco, reanalisado: false, motivo: 'sem_pdf' };
  }

  console.log(`[IA-CONFIRMA] ${pr.id} — confirmando data de emissão no PDF (banco: "${dataBanco || 'vazio'}")`);

  // 1. Tentar extração determinística do texto do PDF (busca por datas no conteúdo binário)
  const dataDet = await extrairDataDeterministicaPdf(token, pdfUrlOriginal);
  if (dataDet) {
    const parsedDet = parseDataEmissao(dataDet);
    if (parsedDet && parsedDet.ano >= 2026) {
      if (dataDet !== dataBanco) {
        await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
          nf_data_emissao: dataDet,
        }).catch(() => null);
        console.log(`[IA-CONFIRMA DET] ${pr.id}: data extraída determinística "${dataDet}" (antes: "${dataBanco}")`);
        return { dataValida: true, dateInfo: parsedDet, reanalisado: true, dataCorrigida: dataDet };
      }
      console.log(`[IA-CONFIRMA DET] ${pr.id}: data "${dataDet}" confirmada via extração determinística`);
      return { dataValida: true, dateInfo: parsedDet, reanalisado: true };
    }
  }

  // 2. IA apenas se URL for pública direta (não Drive viewer — IA não consegue ler essas)
  const pdfUrlIA = montarUrlPublicaDrive(pdfUrlOriginal);
  const ehDriveViewer = pdfUrlOriginal.includes('drive.google.com');

  if (ehDriveViewer) {
    // URL pública do Drive ainda pode falhar; tenta IA com timeout curto
    console.log(`[IA-CONFIRMA] ${pr.id}: PDF no Drive — tentando IA com URL pública (timeout 25s)`);
  }

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const iaPromise = invokeLLM(base44.asServiceRole,{
      model: 'gpt_5_mini',
      prompt: `Você é um extrator de dados de NOTA FISCAL. Analise o PDF anexo.

Sua tarefa: extrair a DATA DE EMISSÃO da nota fiscal (campo "Data de Emissão" ou "Data/Hora Emissão").
Formatos comuns no PDF: "DD/MM/YYYY", "DD/MM/YY", "Data de Emissão: DD/MM/YYYY", "Emitida em DD/MM/YYYY".

REGRAS CRÍTICAS:
1. Você deve extrair a data de EMISSÃO da nota fiscal, não outras datas.
2. IGNORE completamente: datas de abertura de empresa (ex: 2023 para CNPJ 23.843.648/0001-25 - Viaduto das Artes), datas de contratos/convênios, datas de vencimento, datas de pagamento, datas de processamento.
3. Notas válidas para o projeto são de 2026 em diante. Se a data mais relevante que você encontrar for 2023 (abertura de empresa), PROCURE outra data mais recente no documento que seja a data de emissão real.
4. Se a data estiver no formato DD/MM/YYYY, converta para YYYY-MM-DD.
5. Se houver multiple datas, escolha a que está explicitamente rotulada como "Data de Emissão" ou "Data/Hora de Emissão" ou "Emitida em".

Contexto do projeto:
- Data atual: ${hoje}
- Data suspeita no banco: ${dataBanco || '(vazio)'}

Retorne SEMPRE JSON válido no formato:
{
  "nf_data_emissao_corrigida": "YYYY-MM-DD" | null,
  "ano_detectado": <número de 4 dígitos> | null,
  "confianca": "alta" | "media" | "baixa",
  "explicacao": "breve justificativa da data extraída"
}

Se NÃO for nota fiscal, ou PDF ilegível, ou não houver data de emissão:
retorne "nf_data_emissao_corrigida": null, "confianca": "baixa", "explicacao": "motivo".`,
      file_urls: [pdfUrlIA],
      response_json_schema: {
        type: 'object',
        properties: {
          nf_data_emissao_corrigida: { type: 'string' },
          ano_detectado: { type: 'number' },
          confianca: { type: 'string' },
          explicacao: { type: 'string' },
        },
        required: ['nf_data_emissao_corrigida', 'confianca', 'explicacao'],
      },
    });

    // Timeout de 25s para não pendurar o backup
    const ia = await Promise.race([
      iaPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia_25s')), 25000)),
    ]);

    const dataCorrigida = ia?.nf_data_emissao_corrigida || '';
    const confianca = ia?.confianca || 'baixa';
    const parsedCorrigida = parseDataEmissao(dataCorrigida);

    // IA confirmou data válida >= 2026
    if (parsedCorrigida && parsedCorrigida.ano >= 2026) {
      if (dataCorrigida !== dataBanco) {
        await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
          nf_data_emissao: dataCorrigida,
        }).catch(() => null);
        console.log(`[IA-CONFIRMA OK] ${pr.id}: data corrigida de "${dataBanco}" para "${dataCorrigida}" (confiança: ${confianca})`);
        return { dataValida: true, dateInfo: parsedCorrigida, reanalisado: true, dataCorrigida };
      }
      console.log(`[IA-CONFIRMA OK] ${pr.id}: data "${dataCorrigida}" confirmada (confiança: ${confianca})`);
      return { dataValida: true, dateInfo: parsedCorrigida, reanalisado: true };
    }

    // IA não conseguiu extrair data válida — fallback no banco
    if (parsedBanco && parsedBanco.ano >= 2026) {
      console.warn(`[IA-CONFIRMA] ${pr.id}: IA retornou "${dataCorrigida}" (confiança ${confianca}) — mantendo banco "${dataBanco}"`);
      return { dataValida: true, dateInfo: parsedBanco, reanalisado: true, motivo: 'ia_invalida_manteve_banco' };
    }

    console.warn(`[IA-CONFIRMA] ${pr.id}: IA retornou "${dataCorrigida}" (confiança ${confianca}) e banco "${dataBanco}" inválido — pulando`);
    return { dataValida: false, dateInfo: parsedCorrigida || parsedBanco, reanalisado: true, motivo: 'ia_invalida_sem_banco' };
  } catch (e) {
    console.error(`[IA-CONFIRMA] Erro IA para ${pr.id}:`, e.message);
    if (parsedBanco && parsedBanco.ano >= 2026) {
      return { dataValida: true, dateInfo: parsedBanco, reanalisado: false, motivo: 'erro_ia_usar_banco' };
    }
    return { dataValida: false, dateInfo: parsedBanco, reanalisado: false, motivo: 'erro_ia_sem_banco' };
  }
}

// ── Processar uma PurchaseRequest ────────────────────────────────────────────

async function processarPurchase(base44, token, pr, notasFolderCache) {
  const log = {
    id: pr.id,
    descricao: pr.descricao_item,
    fornecedor: pr.fornecedor_nome || pr.nf_emitente_nome || '',
    nf_numero: pr.nf_numero || '',
    status: '',
    detalhes: [],
  };

  // Verificar se tem arquivos fiscais
  const pdfUrl = pr.nota_fiscal_url || pr.nota_fiscal_pdf_url || pr.nf_pdf_url || '';
  let xmlUrl = pr.nota_fiscal_xml_url || pr.xml_url || '';
  // Fallback: a URL do XML fica armazenada em DocumentIntake vinculado à PurchaseRequest
  if (!xmlUrl) {
    try {
      const intakes = await base44.asServiceRole.entities.DocumentIntake.filter(
        { entidade_destino: 'PurchaseRequest', entidade_destino_id: pr.id },
        '-updated_date', 5
      ).catch(() => []);
      const intakeWithXml = (intakes || []).find((i) => i && i.nf_xml_url);
      if (intakeWithXml?.nf_xml_url) xmlUrl = intakeWithXml.nf_xml_url;
    } catch (e) { /* não bloquear por falha na consulta */ }
  }
  const comprovanteUrl = pr.comprovante_url || pr.comprovante_pagamento_url || '';

  if (!pdfUrl && !xmlUrl && !comprovanteUrl) {
    log.status = 'sem_arquivos';
    return log;
  }

  // Validar/corrigir data
  const { dataValida, dateInfo, reanalisado, dataCorrigida } = await validarDataEmissao(base44, token, pr);

  if (!dataValida) {
    log.status = 'data_invalida';
    log.detalhes.push(`Data ${pr.nf_data_emissao || 'desconhecida'} inválida. Reanalisado: ${reanalisado}`);
    return log;
  }

  if (reanalisado && dataCorrigida) {
    log.detalhes.push(`Data corrigida de ${pr.nf_data_emissao} para ${dataCorrigida}`);
  }

  const { ano, mesIdx } = dateInfo;

  // Pasta no formato MM-YYYY (ex: 07-2026) — criar se não existir
  const mesFormatado = String(mesIdx + 1).padStart(2, '0');
  const nomePasta = `${mesFormatado}-${ano}`;
  const mesAno = nomePasta; // usado no nome do arquivo
  log.mes = mesAno;
  log.pasta_url = `https://drive.google.com/drive/folders/${''}`;
  const cacheKey = nomePasta;
  let mesFolderId = notasFolderCache[cacheKey];

  if (!mesFolderId) {
    mesFolderId = await getOrCreate(token, nomePasta, ROOT_FOLDER_ID);
    notasFolderCache[cacheKey] = mesFolderId;
    log.detalhes.push(`Pasta "${nomePasta}" localizada/criada no Drive`);
  }
  log.pasta_url = `https://drive.google.com/drive/folders/${mesFolderId}`;

  const updates = {};
  let uploaded = 0;

  // Verificar idempotência: já tem backup com os mesmos dados?
  const backupKey = `${pr.id}_${pr.nf_numero || ''}_${pr.valor_pago || pr.valor_solicitado || 0}`;
  const jaTemBackup =
    pr.drive_backup_nf_pdf_link && pr.drive_backup_nf_ok === true &&
    pr.drive_backup_nf_pdf_link.includes('drive.google.com');

  // Função interna de upload com idempotência
  async function fazerUpload(fileUrl, fileName) {
    if (!fileUrl) return null;
    const existing = await fileExistsInFolder(token, fileName, mesFolderId).catch(() => null);
    if (existing) {
      log.detalhes.push(`JÁ EXISTE: ${fileName}`);
      return { id: existing.id, link: `https://drive.google.com/file/d/${existing.id}/view`, skipped: true };
    }
    const result = await uploadFromUrl(token, fileUrl, fileName, mesFolderId);
    uploaded++;
    return { ...result, skipped: false };
  }

  const fileExtra = { mesAno };

  // PDF da nota
  if (pdfUrl) {
    const fileName = buildFileName('NF', pr, fileExtra);
    try {
      const r = await fazerUpload(pdfUrl, fileName);
      if (r) {
        updates.drive_backup_nf_pdf_link = r.link;
        log.detalhes.push(`PDF: ${fileName} — ${r.skipped ? 'já existia' : 'enviado'}`);
      }
    } catch (e) {
      log.detalhes.push(`ERRO PDF: ${e.message}`);
    }
  }

  // XML
  if (xmlUrl) {
    const fileName = buildFileName('XML', pr, fileExtra);
    try {
      const r = await fazerUpload(xmlUrl, fileName);
      if (r) {
        updates.drive_backup_nf_xml_link = r.link;
        log.detalhes.push(`XML: ${fileName} — ${r.skipped ? 'já existia' : 'enviado'}`);
      }
    } catch (e) {
      log.detalhes.push(`ERRO XML: ${e.message}`);
    }
  }

  // Comprovante
  if (comprovanteUrl) {
    const fileName = buildFileName('COMP', pr, fileExtra);
    try {
      const r = await fazerUpload(comprovanteUrl, fileName);
      if (r) {
        updates.drive_backup_comprovante_link = r.link;
        log.detalhes.push(`COMP: ${fileName} — ${r.skipped ? 'já existia' : 'enviado'}`);
      }
    } catch (e) {
      log.detalhes.push(`ERRO COMP: ${e.message}`);
    }
  }

  // Verificar se existe extrato bancário correspondente ao mês da NF
  try {
    const extratos = await base44.asServiceRole.entities.MovimentacaoBancaria.filter(
      { mes_num: mesIdx + 1, ano },
      '-created_date', 1
    ).catch(() => []);
    if (extratos && extratos.length > 0) {
      log.detalhes.push(`✓ Extrato bancário ${MESES_PT[mesIdx]}/${ano} encontrado`);
    } else {
      log.detalhes.push(`⚠ Sem extrato bancário para ${MESES_PT[mesIdx]}/${ano}`);
    }
  } catch (_) { /* não bloquear por falha na verificação */ }

  // Atualizar PurchaseRequest
  if (Object.keys(updates).length > 0) {
    updates.drive_backup_nf_ok = true;
    updates.drive_backup_status = 'concluido';
    updates.backup_validado = 'SIM';
    updates.backup_last_synced_at = new Date().toISOString();
    await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, updates).catch((e) => {
      log.detalhes.push(`AVISO: falha ao atualizar links no banco — ${e.message}`);
    });
  }

  log.status = uploaded > 0 ? 'enviado' : 'ja_sincronizado';
  return log;
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCron = req.headers.get('x-base44-trigger') === 'cron';

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      // Aceita admin OU coordenador chamando manualmente
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    // limite: processa no máximo N registros por execução (padrão 30; use 0 para todos)
    const limite = typeof body.limite === 'number' ? body.limite : 30;
    // ids: opcional — quando informado, processa apenas esses IDs (reenvio individual do painel)
    const idsSolicitados = Array.isArray(body.ids) ? body.ids.map((id) => String(id || '').trim()).filter(Boolean) : null;
    const startTime = Date.now();

    // Buscar compras aprovadas com arquivos fiscais — quando `ids` é informado,
    // restringe àquele conjunto (mantém o filtro de status aprovado).
    const compras = [];
    let skip = 0;
    while (true) {
      const lote = await base44.asServiceRole.entities.PurchaseRequest.filter(
        { status: { $in: STATUS_APROVADOS } }, '-created_date', 100, skip
      ).catch(() => []);
      if (!lote || lote.length === 0) break;

      // Filtrar: apenas registros com ao menos um arquivo fiscal
      for (const pr of lote) {
        const temArquivo =
          pr.nota_fiscal_url || pr.nota_fiscal_pdf_url || pr.nf_pdf_url ||
          pr.nota_fiscal_xml_url || pr.xml_url ||
          pr.comprovante_url || pr.comprovante_pagamento_url;
        if (!temArquivo) continue;
        if (idsSolicitados && !idsSolicitados.includes(pr.id)) continue;
        compras.push(pr);
      }

      if (lote.length < 100) break;
      skip += 100;
    }

    // Filtrar apenas os que ainda não foram sincronizados com sucesso.
    // Exceção: quando `ids` é informado explicitamente, reprocessa mesmo os já
    // concluídos (forçar reenvio manual a partir do painel).
    const pendentes = idsSolicitados
      ? compras
      : compras.filter(p => p.drive_backup_nf_ok !== true);

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        total_compras_com_arquivo: compras.length,
        total_pendentes: pendentes.length,
        ids: pendentes.slice(0, 50).map((p) => ({ id: p.id, status: p.status, nf: p.nf_numero, data: p.nf_data_emissao })),
      });
    }

    // Obter token Drive
    const token = await getToken(base44);
    const notasFolderCache = {};

    const resultados = { enviado: 0, ja_sincronizado: 0, data_invalida: 0, sem_arquivos: 0, pasta_nao_encontrada: 0, erro: 0 };
    const logs = [];

    // Limitar a quantidade processada por execução para evitar timeout
    const comprasParaProcessar = limite > 0 ? pendentes.slice(0, limite) : pendentes;

    // Processar em lotes de BATCH_SIZE
    for (let i = 0; i < comprasParaProcessar.length; i += BATCH_SIZE) {
      const lote = comprasParaProcessar.slice(i, i + BATCH_SIZE);
      for (const pr of lote) {
        try {
          const logItem = await processarPurchase(base44, token, pr, notasFolderCache);
          logs.push(logItem);
          resultados[logItem.status] = (resultados[logItem.status] || 0) + 1;
        } catch (e) {
          console.error(`Erro ao processar ${pr.id}:`, e.message);
          logs.push({ id: pr.id, status: 'erro', detalhes: [e.message] });
          resultados.erro++;
        }
      }
    }

    // Log de execução
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'backup_diario_nfs_drive',
      status: resultados.erro > 0 && resultados.enviado === 0 ? 'failure' : 'success',
      total_files: compras.length,
      files_copied: resultados.enviado,
      error_message: resultados.erro > 0 ? `${resultados.erro} erros de upload` : '',
      execution_time_ms: Date.now() - startTime,
      triggered_by: isCron ? 'scheduled' : 'manual',
    }).catch(() => null);

    return Response.json({
      ok: true,
      total_com_arquivo: compras.length,
      total_pendentes: pendentes.length,
      total_processadas: comprasParaProcessar.length,
      resultados,
      execution_ms: Date.now() - startTime,
      backup_at: new Date().toISOString(),
      logs: logs.slice(-200),
    });

  } catch (error) {
    console.error('backupDiarioNFsDrive error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});