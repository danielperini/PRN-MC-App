import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * processarSalaDeEspera
 *
 * Orquestrador backend ÚNICO do pipeline "Sala de Espera".
 * Centraliza TODA entrada de documentos (Drive, Gmail, upload → DocumentIntake).
 * O pipeline de IA preenche 100% dos campos obrigatórios ANTES de encaminhar
 * qualquer arquivo para os destinos finais (banco/Drive).
 *
 * Campos obrigatórios por tipo (pipeline deve preencher TODOS):
 *   NF (PDF/XML): tipo_detectado, nf_emitente_nome, nf_emitente_cpf_cnpj,
 *                 nf_numero, nf_valor_total, nf_data_emissao (>=2026),
 *                 centro_custo, fornecedor_nome, fornecedor_cpf_cnpj, municipio
 *   FOTO_ATIVIDADE: tipo_detectado, legenda_sugerida, centro_custo
 *   CONTRATO: tipo_detectado, contrato_numero, fornecedor/ team_member vinculado
 *   DOC_ADMIN/RECIBO: tipo_detectado, descricao
 *
 * Fluxo por execução:
 *   1. Buscar DocumentIntake pendentes (não ocultos, ativos)
 *   2. Para cada um: verificar campos obrigatórios preenchidos
 *   3. Se faltam campos E há arquivo → IA extrai TODOS os campos faltantes de uma vez
 *   4. Para NF: valida/corrige data emissão via IA (>= 2026, ignora datas de abertura)
 *   5. Se 100% preenchido: APROVADO + ocultar_entrada_unica (encaminha, NÃO acumula)
 *      - NF: garante pasta mensal MM-YYYY no Drive
 *   6. Se ainda faltam após 2 tentativas IA: marca REJEITADO para revisão manual
 */

const ROOT_NOTAS_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BATCH_SIZE = 10;
const MAX_TENTATIVAS_IA = 1;
const IA_TIMEOUT_MS = 35000;
const DEADLINE_MS = 85000; // prazo global de execução segura
const MESES_PT = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeStr(v) { return String(v || '').trim(); }
function safeNum(v) { const n = Number(v); return isNaN(n) ? null : n; }

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
  return { ano: d.getFullYear(), mesIdx: d.getMonth(), mesNome: MESES_PT[d.getMonth()] };
}

// Verifica quais campos obrigatórios estão preenchidos por tipo
function camposObrigatorios(intake) {
  const tipo = safeStr(intake.tipo_detectado);
  if (!tipo || tipo === 'PENDENTE') return { ok: false, faltando: ['tipo_detectado'] };

  if (tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML') {
    const faltando = [];
    if (!safeStr(intake.nf_emitente_nome)) faltando.push('nf_emitente_nome');
    if (!safeStr(intake.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj)) faltando.push('fornecedor_cpf_cnpj');
    if (!safeStr(intake.nf_numero)) faltando.push('nf_numero');
    if (!safeNum(intake.nf_valor_total)) faltando.push('nf_valor_total');
    const dataInfo = parseDataEmissao(intake.nf_data_emissao);
    if (!dataInfo || dataInfo.ano < 2026) faltando.push('nf_data_emissao');
    if (!safeStr(intake.centro_custo)) faltando.push('centro_custo');
    if (!safeStr(intake.fornecedor_nome)) faltando.push('fornecedor_nome');
    if (!safeStr(intake.municipio)) faltando.push('municipio');
    return { ok: faltando.length === 0, faltando };
  }

  if (tipo === 'FOTO_ATIVIDADE') {
    const faltando = [];
    if (!safeStr(intake.legenda_sugerida)) faltando.push('legenda_sugerida');
    if (!safeStr(intake.centro_custo)) faltando.push('centro_custo');
    return { ok: faltando.length === 0, faltando };
  }

  if (tipo === 'CONTRATO') {
    const faltando = [];
    if (!safeStr(intake.contrato_numero)) faltando.push('contrato_numero');
    if (!safeStr(intake.contrato_fornecedor_id || intake.contrato_team_member_id || intake.fornecedor_id_vinculado)) faltando.push('vinculo_fornecedor');
    return { ok: faltando.length === 0, faltando };
  }

  // DOC_ADMIN, RECIBO, OUTRO — apenas tipo
  return { ok: true, faltando: [] };
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function getToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  return accessToken;
}

async function driveGet(token, url) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`);
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

async function getOrCreate(token, name, parentId, cache) {
  const key = `${parentId}/${name}`;
  if (cache[key] !== undefined) return cache[key];
  const id = (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
  cache[key] = id;
  return id;
}

// ── Parser XML determinístico (NF-e / NFS-e) ───────────────────────────────────

function getXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function normalizeCurrency(val) {
  if (!val) return null;
  const clean = String(val).replace(/[^\d,\.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseXmlNF(xmlText) {
  try {
    // Remove prefixos de namespace (ex: <ns3:nNF> → <nNF>) para matching robusto
    const xml = String(xmlText || '').replace(/<\/?(\w+):/g, '<');

    // Numero da NF — NF-e (nNF) e NFS-e (NumeroNfse, Numero, nRPS)
    const numero = getXmlTag(xml, 'nNF')
      || getXmlTag(xml, 'nRPS')
      || getXmlTag(xml, 'NumeroNfse')
      || getXmlTag(xml, 'Numero')
      || getXmlTag(xml, 'NumeroRps');

    // Data de emissão
    const dataRaw = getXmlTag(xml, 'dhEmi')
      || getXmlTag(xml, 'dEmi')
      || getXmlTag(xml, 'dtEmissao')
      || getXmlTag(xml, 'DataEmissao')
      || getXmlTag(xml, 'DataEmissaoRps');
    const data_emissao = dataRaw ? dataRaw.substring(0, 10) : null;

    // Valor total — normaliza formato BR (1.234,56 → 1234.56)
    const valorRaw = getXmlTag(xml, 'vNF')
      || getXmlTag(xml, 'vLiquidoNfse')
      || getXmlTag(xml, 'Valor')
      || getXmlTag(xml, 'ValorServicos')
      || getXmlTag(xml, 'ValorLiquidoNfse')
      || getXmlTag(xml, 'vLiq');
    // Converte formato brasileiro: "2.100,00" → 2100.00
    let valor_total = null;
    if (valorRaw) {
      const cleaned = String(valorRaw).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
      const n = parseFloat(cleaned);
      valor_total = isNaN(n) ? null : n;
    }

    // Emitente — CNPJ/CPF pode aparecer em Emit/Prestador
    const emit_cnpj = getXmlTag(xml, 'CNPJ') || getXmlTag(xml, 'CpfCnpjPrestador');
    const emit_cpf = getXmlTag(xml, 'CPF') || getXmlTag(xml, 'CpfPrestador');
    const emitente_cpf_cnpj = emit_cnpj || emit_cpf;
    const emitente_nome = getXmlTag(xml, 'xNome')
      || getXmlTag(xml, 'RazaoSocial')
      || getXmlTag(xml, 'xFant')
      || getXmlTag(xml, 'NomeRazaoSocial')
      || getXmlTag(xml, 'Nome');

    // Município — procura em tags diretas E aninhadas (Endereco/xMun, xMunicipio)
    const municipio = getXmlTag(xml, 'xMun')
      || getXmlTag(xml, 'xMunicipio')
      || getXmlTag(xml, 'Municipio')
      || getXmlTag(xml, 'Cidade')
      || getXmlTag(xml, 'CidadePrestador')
      || (xml.match(/<Endereco[^>]*>[\s\S]*?<Municipio>([^<]*)<\/Municipio>/i)?.[1] || null)
      || (xml.match(/<Endereco[^>]*>[\s\S]*?<Cidade>([^<]*)<\/Cidade>/i)?.[1] || null);

    return {
      numero_nf: numero ? String(numero).replace(/[^\d]/g, '') : null,
      valor_total,
      data_emissao,
      emitente_nome,
      emitente_cpf_cnpj: emitente_cpf_cnpj ? String(emitente_cpf_cnpj).replace(/\D/g, '') : null,
      municipio: municipio ? String(municipio) : null,
      status_leitura: (numero && emitente_cpf_cnpj && valor_total != null) ? 'lido_com_sucesso' : 'leitura_parcial',
    };
  } catch {
    return { status_leitura: 'leitura_falhou' };
  }
}

// Busca e lê o conteúdo XML (Drive URL ou storage Base44)
async function fetchXmlContent(token, url) {
  if (!url) return null;
  try {
    let fetchUrl = url;
    if (url.includes('drive.google.com')) {
      const id = extrairDriveId(url);
      if (id) fetchUrl = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
    }
    const headers = {};
    if (fetchUrl.includes('googleapis.com')) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(fetchUrl, { headers });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

// Infere centro de custo a partir do nome do arquivo
function inferirCentroCustoFromName(fileName) {
  if (!fileName) return null;
  const n = fileName.toUpperCase();
  if (/\bMIS\b/.test(n) && !/MUMO/.test(n)) return 'MIS';
  if (/MUMO|MOstra/i.test(n) && /MUMO/i.test(n)) return 'MUMO';
  if (/MHAB|MAB/.test(n)) return 'MHAB';
  if (/NOTURNO/i.test(n)) return 'Noturno nos Museus 2026';
  if (/PUBLI/i.test(n)) return 'Publicações';
  if (/MUSEUS CENTRO|MUSEUS CEN/i.test(n) && !/MIS|MUMO|MHAB/.test(n)) return 'Geral';
  return null;
}

// Busca fornecedor por CNPJ no banco para preencher fornecedor_nome e centro_custo históricos
async function buscarFornecedorByCnpj(base44, cnpj) {
  if (!cnpj) return null;
  try {
    const docs = cnpj.length === 14
      ? await base44.asServiceRole.entities.Fornecedor.filter({ cnpj }).catch(() => [])
      : await base44.asServiceRole.entities.Fornecedor.filter({ cpf: cnpj }).catch(() => []);
    return docs?.[0] || null;
  } catch {
    return null;
  }
}

// Extrai campos do nome padronizado do arquivo (NF XX ... R$ YY,YY ... mes ano)
function extrairDoNomeArquivo(fileName) {
  if (!fileName) return {};
  const out = {};
  const name = String(fileName).replace(/\.[^.]+$/, ''); // remove extensão

  // NF número: "XML 73 ...", "NF 73 ...", "XML 9429 ..." — primeiro número após XML/NF
  const nfNumMatch = name.match(/^(?:XML|NF)\s+(\d+)/i) || name.match(/\bNF\s*(\d+)/i);
  if (nfNumMatch) out.nf_numero = String(nfNumMatch[1]);

  // Valor: "R$ 2.100,00" → 2100.00
  const valorMatch = name.match(/R\$\s*([\d.,]+)/i);
  if (valorMatch) {
    const cleaned = valorMatch[1].replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    if (!isNaN(n)) out.nf_valor_total = n;
  }

  // Mês/ano: "abril 26", "junho 26", "07-2026" → data_emissao YYYY-MM-DD
  const MESES_NOME = { janeiro:'01', fevereiro:'02', marco:'03', abril:'04', maio:'05', junho:'06', julho:'07', agosto:'08', setembro:'09', outubro:'10', novembro:'11', dezembro:'12' };
  const mesAnoMatch = name.match(/(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{2})\b/i);
  if (mesAnoMatch) {
    const mesKey = mesAnoMatch[1].toLowerCase();
    const ano = `20${mesAnoMatch[2]}`;
    out.nf_data_emissao = `${ano}-${MESES_NOME[mesKey] || '01'}-01`;
  }
  const mesAnoNumMatch = name.match(/(\d{2})-(\d{4})/);
  if (!out.nf_data_emissao && mesAnoNumMatch) {
    out.nf_data_emissao = `${mesAnoNumMatch[2]}-${mesAnoNumMatch[1]}-01`;
  }

  // Fornecedor_nome: primeiro segmento (após split por " - ") que NÃO é
  // data, "MUSEUS CENTRO/CEN", "Daniel Perini", "Perini Projetos", não começa com NF/XML/R$
  const segments = name.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  const SKIP = /^(NF|XML|R\$|Daniel Perini|Perini Projetos|MUSEUS CEN|Mes |mes )/i;
  const DATE_RE = /^\d{2}-\d{4}$/;
  for (const seg of segments) {
    if (DATE_RE.test(seg)) continue;
    if (SKIP.test(seg)) continue;
    if (seg.length < 5) continue; // muito curto, provavelmente não é nome
    // Ignorar segmentos que são apenas descrições de função ("Assessor de Imprensa mes 19 ao")
    if (/mes\s+\d/i.test(seg) && seg.length < 40) continue;
    out.fornecedor_nome = seg;
    break;
  }

  // Centro_custo: via palavras-chave de museu no nome
  const cc = inferirCentroCustoFromName(name);
  if (cc) out.centro_custo = cc;

  return out;
}

// Preenche campos faltantes de XML de forma determinística (SEM IA — instantâneo)
async function preencherCamposXmlDeterministico(base44, token, intake, faltando) {
  const xmlUrl = intake.nf_xml_url || intake.arquivo_original_url;
  const xmlText = await fetchXmlContent(token, xmlUrl);
  if (!xmlText) return { ok: false, motivo: 'sem_xml_acessivel' };

  const parsed = parseXmlNF(xmlText);
  if (parsed.status_leitura === 'leitura_falhou') return { ok: false, motivo: 'xml_parse_falhou' };

  const updates = {};
  if (faltando.includes('nf_numero') && parsed.numero_nf) updates.nf_numero = parsed.numero_nf;
  if (faltando.includes('nf_valor_total') && parsed.valor_total != null) updates.nf_valor_total = parsed.valor_total;
  if (faltando.includes('nf_data_emissao') && parsed.data_emissao) {
    const d = parseDataEmissao(parsed.data_emissao);
    if (d && d.ano >= 2026) updates.nf_data_emissao = parsed.data_emissao;
  }
  if (faltando.includes('nf_emitente_nome') && parsed.emitente_nome) updates.nf_emitente_nome = parsed.emitente_nome;
  if (faltando.includes('fornecedor_cpf_cnpj') && parsed.emitente_cpf_cnpj) {
    const doc = String(parsed.emitente_cpf_cnpj).replace(/\D/g, '');
    if (doc.length === 11 || doc.length === 14) {
      updates.fornecedor_cpf_cnpj = doc;
      updates.nf_emitente_cpf_cnpj = doc;
    }
  }
  if (faltando.includes('municipio') && parsed.municipio) updates.municipio = parsed.municipio;

  // fornecedor_nome: se tem emitente_nome, usar como fornecedor_nome
  if (faltando.includes('fornecedor_nome') && parsed.emitente_nome) {
    updates.fornecedor_nome = parsed.emitente_nome;
  }

  // Buscar fornecedor por CNPJ uma única vez e reusar para centro_custo, nome e municipio
  let fornecedor = null;
  if (parsed.emitente_cpf_cnpj) {
    fornecedor = await buscarFornecedorByCnpj(base44, parsed.emitente_cpf_cnpj);
  }

  // centro_custo: via histórico do fornecedor, senão via nome do arquivo
  if (faltando.includes('centro_custo')) {
    if (fornecedor?.centro_custo) {
      updates.centro_custo = fornecedor.centro_custo;
    } else if (fornecedor?.museu_vinculado) {
      updates.centro_custo = fornecedor.museu_vinculado;
    }
    if (!updates.centro_custo) {
      const fromName = inferirCentroCustoFromName(intake.file_name_final || intake.file_name_original);
      if (fromName) updates.centro_custo = fromName;
    }
  }

  // fornecedor_nome: do XML emitente, senão do cadastro de fornecedor
  if (faltando.includes('fornecedor_nome')) {
    if (parsed.emitente_nome) {
      updates.fornecedor_nome = parsed.emitente_nome;
    } else if (fornecedor?.nome || fornecedor?.razao_social) {
      updates.fornecedor_nome = fornecedor.nome || fornecedor.razao_social;
    }
  }

  // municipio: do XML, senão do cadastro de fornecedor, senão default BH (projeto é em Belo Horizonte)
  if (faltando.includes('municipio')) {
    if (parsed.municipio) {
      updates.municipio = parsed.municipio;
    } else if (fornecedor?.municipio) {
      updates.municipio = fornecedor.municipio;
    } else {
      updates.municipio = 'Belo Horizonte'; // default do projeto Museus Centro
    }
  }

  // Fallback final: extrair campos faltantes do NOME do arquivo (padronizado pelo sistema)
  const fromName = extrairDoNomeArquivo(intake.file_name_final || intake.file_name_original);
  if (fromName.nf_numero && faltando.includes('nf_numero') && !updates.nf_numero) updates.nf_numero = fromName.nf_numero;
  if (fromName.nf_valor_total != null && faltando.includes('nf_valor_total') && !updates.nf_valor_total) updates.nf_valor_total = fromName.nf_valor_total;
  if (fromName.nf_data_emissao && faltando.includes('nf_data_emissao') && !updates.nf_data_emissao) {
    const d = parseDataEmissao(fromName.nf_data_emissao);
    if (d && d.ano >= 2026) updates.nf_data_emissao = fromName.nf_data_emissao;
  }

  if (Object.keys(updates).length === 0) return { ok: false, motivo: 'xml_sem_campos_uteis' };

  await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates).catch(() => null);
  return { ok: true, motivo: 'xml_deterministico', updates };
}

// ── IA: preencher TODOS os campos faltantes de uma NF ─────────────────────────

function extrairDriveId(url) {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

async function resolverUrlPdf(url) {
  if (!url) return null;
  if (url.includes('drive.google.com')) {
    const id = extrairDriveId(url);
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return url;
}

// Fallback: baixa PDF do Drive e re-upload para storage Base44 (URL estável p/ IA)
async function reUploadDrivePdf(base44, token, driveUrl, fileName) {
  const fileId = extrairDriveId(driveUrl);
  if (!fileId) return null;
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (blob.size === 0) return null;
    const file = new File([blob], fileName || `nf_${fileId}.pdf`, { type: blob.type || 'application/pdf' });
    const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    return up?.file_url || null;
  } catch (e) {
    console.error('reUploadDrivePdf erro:', e.message);
    return null;
  }
}

async function preencherCamposFaltantesIA(base44, token, intake, faltando) {
  const pdfUrl = await resolverUrlPdf(intake.nf_pdf_url || intake.arquivo_original_url);
  if (!pdfUrl) return { ok: false, motivo: 'sem_arquivo' };

  const camposPedidos = faltando.join(', ');
  const prompt = `Você é um extrator de NOTA FISCAL (NFS-e / NF-e). Analise o documento anexo e extraia EXATAMENTE os campos solicitados que estão faltando ou inválidos.

REGRAS CRÍTICAS:
- Data de emissão: apenas datas >= 2026 (campo "Data de Emissão" / "Data/Hora Emissão" / "Emitida em"). IGNORE datas de abertura de empresa, contratos, convênios, vencimento ou pagamento.
- CNPJ/CPF: apenas dígitos (14 ou 11).
- Valor total: valor NUMÉRICO da nota (sem R$, sem texto). Use ponto decimal.
- Centro de custo: um dos: MUMO, MIS, MHAB, Noturno nos Museus 2026, Noturno 2026, Noturno Pampulha, Publicações, Geral.

Retorne JSON com APENAS os campos solicitados: ${camposPedidos}
Se um campo não existir no documento, retorne null para ele.`;

  const schema = {
    type: 'object',
    properties: {
      nf_emitente_nome: { type: 'string' },
      fornecedor_cpf_cnpj: { type: 'string' },
      nf_numero: { type: 'string' },
      nf_valor_total: { type: 'number' },
      nf_data_emissao: { type: 'string' },
      centro_custo: { type: 'string' },
      fornecedor_nome: { type: 'string' },
      municipio: { type: 'string' },
    },
  };

  const runIA = async (url) => base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    prompt,
    file_urls: [url],
    response_json_schema: schema,
  });

  try {
    let ia = null;
    try {
      ia = await Promise.race([
        runIA(pdfUrl),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia')), IA_TIMEOUT_MS)),
      ]);
    } catch (eFirst) {
      // Fallback: re-upload para URL estável (Drive uc? URLs instáveis p/ IA)
      const reUrl = await reUploadDrivePdf(base44, token, intake.nf_pdf_url || intake.arquivo_original_url, intake.file_name_final || intake.file_name_original);
      if (!reUrl) throw eFirst;
      ia = await Promise.race([
        runIA(reUrl),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia_fallback')), IA_TIMEOUT_MS)),
      ]);
    }

    const updates = {};
    if (ia?.nf_emitente_nome) updates.nf_emitente_nome = safeStr(ia.nf_emitente_nome);
    if (ia?.fornecedor_cpf_cnpj) {
      const doc = safeStr(ia.fornecedor_cpf_cnpj).replace(/\D/g, '');
      if (doc.length === 11 || doc.length === 14) {
        updates.fornecedor_cpf_cnpj = doc;
        updates.nf_emitente_cpf_cnpj = doc;
      }
    }
    if (ia?.nf_numero) updates.nf_numero = safeStr(ia.nf_numero);
    if (ia?.nf_valor_total != null) {
      const v = safeNum(ia.nf_valor_total);
      if (v !== null) updates.nf_valor_total = v;
    }
    if (ia?.nf_data_emissao) {
      const d = parseDataEmissao(ia.nf_data_emissao);
      if (d && d.ano >= 2026) updates.nf_data_emissao = ia.nf_data_emissao;
    }
    if (ia?.centro_custo) updates.centro_custo = safeStr(ia.centro_custo);
    if (ia?.fornecedor_nome) updates.fornecedor_nome = safeStr(ia.fornecedor_nome);
    if (ia?.municipio) updates.municipio = safeStr(ia.municipio);

    if (Object.keys(updates).length === 0) return { ok: false, motivo: 'ia_vazia' };

    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates).catch(() => null);
    return { ok: true, motivo: 'preenchido', updates };
  } catch (e) {
    return { ok: false, motivo: `erro_ia:${e.message}` };
  }
}

// ── Processar um intake ──────────────────────────────────────────────────────

async function processarIntake(base44, token, intake, folderCache, tentativasMap) {
  const log = { id: intake.id, tipo: intake.tipo_detectado, fileName: intake.file_name_final || intake.file_name_original, status: '', detalhes: [] };

  // 1. Verificar campos obrigatórios
  let check = camposObrigatorios(intake);

  // 2. Se faltam campos e tem arquivo → Tentar XML determinístico PRIMEIRO (instantâneo), depois IA
  let tentativa = tentativasMap.get(intake.id) || 0;
  while (!check.ok && tentativa < MAX_TENTATIVAS_IA && (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML')) {
    tentativa++;
    tentativasMap.set(intake.id, tentativa);
    log.detalhes.push(`Validação tentativa ${tentativa}: faltando [${check.faltando.join(',')}]`);

    // 2a. XML: parser determinístico (sem IA — instantâneo)
    if (intake.tipo_detectado === 'NOTA_FISCAL_XML') {
      const xmlResult = await preencherCamposXmlDeterministico(base44, token, intake, check.faltando);
      if (xmlResult.ok) {
        log.detalhes.push(`XML determinístico OK: ${Object.keys(xmlResult.updates).join(',')}`);
        Object.assign(intake, xmlResult.updates);
        check = camposObrigatorios(intake);
        if (check.ok) break; // XML resolveu tudo!
      } else {
        log.detalhes.push(`XML determinístico falhou: ${xmlResult.motivo}`);
      }
      // XML parcial: NÃO chama IA (lenta p/ XML) — deixa pendente p/ revisão manual
      break;
    }

    // 2b. PDF: IA como única estratégia
    if (intake.tipo_detectado === 'NOTA_FISCAL_PDF' && !check.ok) {
      const iaResult = await preencherCamposFaltantesIA(base44, token, intake, check.faltando);
      if (!iaResult.ok) {
        log.detalhes.push(`IA falhou: ${iaResult.motivo}`);
        break;
      }
      Object.assign(intake, iaResult.updates);
      check = camposObrigatorios(intake);
    }
  }

  // 2c. Fallback final: extrair campos faltantes do NOME padronizado do arquivo
  if (!check.ok && (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML')) {
    const fromName = extrairDoNomeArquivo(intake.file_name_final || intake.file_name_original);
    const nameUpdates = {};
    if (fromName.nf_numero && check.faltando.includes('nf_numero') && !intake.nf_numero) nameUpdates.nf_numero = fromName.nf_numero;
    if (fromName.nf_valor_total != null && check.faltando.includes('nf_valor_total') && !intake.nf_valor_total) nameUpdates.nf_valor_total = fromName.nf_valor_total;
    if (fromName.nf_data_emissao && check.faltando.includes('nf_data_emissao') && !intake.nf_data_emissao) {
      const d = parseDataEmissao(fromName.nf_data_emissao);
      if (d && d.ano >= 2026) nameUpdates.nf_data_emissao = fromName.nf_data_emissao;
    }
    if (fromName.fornecedor_nome) {
      if (check.faltando.includes('fornecedor_nome') && !intake.fornecedor_nome) nameUpdates.fornecedor_nome = fromName.fornecedor_nome;
      if (check.faltando.includes('nf_emitente_nome') && !intake.nf_emitente_nome) nameUpdates.nf_emitente_nome = fromName.fornecedor_nome;
    }
    if (fromName.centro_custo && check.faltando.includes('centro_custo') && !intake.centro_custo) nameUpdates.centro_custo = fromName.centro_custo;
    if (check.faltando.includes('municipio') && !intake.municipio) nameUpdates.municipio = 'Belo Horizonte';
    if (check.faltando.includes('fornecedor_cpf_cnpj') && !intake.fornecedor_cpf_cnpj) {
      // tentar lookup por fornecedor_nome
      let forn = null;
      if (fromName.fornecedor_nome) {
        forn = await base44.asServiceRole.entities.Fornecedor.filter({ nome: fromName.fornecedor_nome }).catch(() => []);
        forn = forn?.[0] || null;
      }
      if (forn?.cnpj) nameUpdates.fornecedor_cpf_cnpj = forn.cnpj;
      else if (forn?.cpf) nameUpdates.fornecedor_cpf_cnpj = forn.cpf;
      else if (forn?.cpf_cnpj) nameUpdates.fornecedor_cpf_cnpj = forn.cpf_cnpj;
    }
    if (Object.keys(nameUpdates).length > 0) {
      Object.assign(intake, nameUpdates);
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, nameUpdates).catch(() => null);
      log.detalhes.push(`Nome arquivo OK: ${Object.keys(nameUpdates).join(',')}`);
      check = camposObrigatorios(intake);
    }
  }

  // 3. Para foto sem legenda: uma tentativa de IA (lightweight, sem arquivo)
  if (!check.ok && intake.tipo_detectado === 'FOTO_ATIVIDADE') {
    // legenda sugerida pode vir do processarEntradaUnicaLote; apenas aguarda
    log.detalhes.push('Foto aguardando legenda da IA de análise');
  }

  // 4. Se ainda faltam dados essenciais após tentativas
  if (!check.ok) {
    // PDFs que esgotaram IA → REJEITADO p/ revisão manual
    if (tentativa >= MAX_TENTATIVAS_IA && intake.tipo_detectado === 'NOTA_FISCAL_PDF') {
      try {
        await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'REJEITADO',
          ocultar_entrada_unica: true,
        });
        log.status = 'rejeitado_dados_incompletos';
        log.detalhes.push(`Marcado REJEITADO após ${tentativa} tentativa(s) IA. Campos faltantes: [${check.faltando.join(',')}]`);
      } catch (e) {
        log.status = 'erro_update';
        log.detalhes.push(`Erro ao rejeitar: ${e.message}`);
      }
    } else {
      // XMLs (parser parcial) ou outros → pendente_dados (mantém na fila, sem REJEITADO)
      log.status = 'pendente_dados';
      log.detalhes.push(`Pendência: ${check.faltando.join(',')}`);
    }
    return log;
  }

  // 5. 100% preenchido → LIBERAR (encaminhar, não acumular)
  const updates = {
    status_processamento: 'APROVADO',
    revisado_pelo_usuario: true,
    ocultar_entrada_unica: true,
  };

  // 6. NF aprovada: garantir pasta mensal MM-YYYY no Drive para auditoria
  if ((intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML') && intake.nf_data_emissao) {
    const dataInfo = parseDataEmissao(intake.nf_data_emissao);
    if (dataInfo) {
      try {
        const mesFmt = String(dataInfo.mesIdx + 1).padStart(2, '0');
        const nomePasta = `${mesFmt}-${dataInfo.ano}`;
        const folderId = await getOrCreate(token, nomePasta, ROOT_NOTAS_FOLDER_ID, folderCache);
        log.detalhes.push(`Pasta mensal ${nomePasta} confirmada: ${folderId}`);
      } catch (e) {
        log.detalhes.push(`AVISO pasta mensal: ${e.message}`);
      }
    }
  }

  try {
    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates);
    log.status = 'liberado';
    log.detalhes.push('100% campos preenchidos → APROVADO + ocultar_entrada_unica');
  } catch (e) {
    log.status = 'erro_update';
    log.detalhes.push(`Erro ao liberar: ${e.message}`);
  }

  return log;
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const isCron = req.headers.get('x-base44-trigger') === 'cron';

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const resetRejeitados = body.resetRejeitados === true;
    const apenasNFs = body.apenasNFs === true;
    const limite = typeof body.limite === 'number' ? body.limite : 40;

    // 0. Modo reset: re-avaliação — REJEITADOS voltam para AGUARDANDO_REVISAO
    if (resetRejeitados) {
      const tipoFilter = apenasNFs
        ? { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'] }
        : { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML', 'FOTO_ATIVIDADE', 'CONTRATO', 'DOCUMENTO_ADMINISTRATIVO', 'RECIBO_PDF', 'OUTRO'] };
      const rejeitados = await base44.asServiceRole.entities.DocumentIntake.filter(
        { status_processamento: 'REJEITADO', status_registro: 'ATIVO', tipo_detectado: tipoFilter },
        '-updated_date', 500, 0
      ).catch(() => []);
      let resetados = 0;
      const ids = (rejeitados || []).map((i) => i.id);
      if (ids.length > 0) {
        await base44.asServiceRole.entities.DocumentIntake.updateMany(
          { _id: { $in: ids } },
          { $set: { status_processamento: 'AGUARDANDO_REVISAO', ocultar_entrada_unica: false } }
        ).catch(() => null);
        resetados = ids.length;
      }
      return Response.json({
        ok: true,
        reset: true,
        resetados,
        rejeitados_encontrados: (rejeitados || []).length,
        mensagem: `${resetados} intakes REJEITADOS voltaram para AGUARDANDO_REVISAO para re-avaliação`,
      });
    }

    // 1. Buscar intakes pendentes (não ocultos, ativos)
    let pendentes = await base44.asServiceRole.entities.DocumentIntake.filter(
      {
        status_processamento: { $in: ['ENVIADO', 'AGUARDANDO_REVISAO', 'ANALISANDO_IA'] },
        ocultar_entrada_unica: { $ne: true },
        status_registro: 'ATIVO',
        ...(apenasNFs ? { tipo_detectado: { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'] } } : {}),
      },
      '-updated_date', Math.min(limite, 200), 0
    ).catch(() => []);

    if (dryRun) {
      const amostra = (pendentes || []).slice(0, 25).map((i) => {
        const c = camposObrigatorios(i);
        return {
          id: i.id,
          tipo: i.tipo_detectado,
          fileName: i.file_name_final || i.file_name_original,
          camposPreenchidos: c.ok,
          faltando: c.faltando,
          status: i.status_processamento,
        };
      });
      const completos = amostra.filter((a) => a.camposPreenchidos).length;
      const faltam = amostra.length - completos;
      return Response.json({
        ok: true,
        dry_run: true,
        pendentes_total: (pendentes || []).length,
        ja_100pct: completos,
        precisam_ia: faltam,
        amostra,
      });
    }

    // 2. Obter token Drive
    const token = await getToken(base44);
    const folderCache = {};
    const tentativasMap = new Map();
    const deadline = startTime + DEADLINE_MS;
    let paradosPorDeadline = 0;

    // 3. Processar em lotes (interrompe antes do prazo global p/ não estourar execução)
    //    PRIORIZA XMLs (processamento determinístico instantâneo) antes dos PDFs (IA lenta)
    const resultados = { liberado: 0, pendente_dados: 0, rejeitado_dados_incompletos: 0, erro_update: 0, erro: 0 };
    const logs = [];
    const todos = (pendentes || []).slice(0, limite);
    const intakesParaProcessar = [
      ...todos.filter((i) => i.tipo_detectado === 'NOTA_FISCAL_XML'),
      ...todos.filter((i) => i.tipo_detectado === 'NOTA_FISCAL_PDF'),
      ...todos.filter((i) => i.tipo_detectado !== 'NOTA_FISCAL_XML' && i.tipo_detectado !== 'NOTA_FISCAL_PDF'),
    ];

    for (let i = 0; i < intakesParaProcessar.length; i += BATCH_SIZE) {
      if (Date.now() > deadline - 15000) { paradosPorDeadline = intakesParaProcessar.length - i; break; } // sobra 15s p/ resposta
      const lote = intakesParaProcessar.slice(i, i + BATCH_SIZE);
      for (const intake of lote) {
        if (Date.now() > deadline - 15000) { paradosPorDeadline = intakesParaProcessar.length - i; break; }
        try {
          const logItem = await processarIntake(base44, token, intake, folderCache, tentativasMap);
          logs.push(logItem);
          resultados[logItem.status] = (resultados[logItem.status] || 0) + 1;
        } catch (e) {
          console.error(`Erro intake ${intake.id}:`, e.message);
          logs.push({ id: intake.id, status: 'erro', detalhes: [e.message] });
          resultados.erro++;
        }
      }
    }

    // 4. Log de execução
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      status: resultados.liberado > 0 ? 'success' : (resultados.erro > 0 ? 'failure' : 'concluido'),
      total_files: intakesParaProcessar.length,
      files_copied: resultados.liberado,
      error_message: resultados.erro > 0 ? `${resultados.erro} erros` : '',
      execution_time_ms: Date.now() - startTime,
      triggered_by: isCron ? 'scheduled' : 'manual',
      details: `Sala de Espera: ${resultados.liberado} liberados (100% preenchidos), ${resultados.pendente_dados || 0} pendentes IA, ${resultados.rejeitado_dados_incompletos || 0} rejeitados, ${paradosPorDeadline} adiados (deadline)`,
    }).catch(() => null);

    return Response.json({
      ok: true,
      pendentes_total: intakesParaProcessar.length,
      processados: logs.length,
      adiados_deadline: paradosPorDeadline,
      resultados,
      execution_ms: Date.now() - startTime,
      processado_em: new Date().toISOString(),
      logs: logs.slice(-100),
    });
  } catch (error) {
    console.error('processarSalaDeEspera error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});