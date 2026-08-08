import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Redeploy touch — 2026-08-08
// invokeLLM inlined (evita import de _shared/gatewayIA —_HISTORY_DEPLOY_BREAKER)
async function invokeLLM(client, payload) {
  const res = await client.functions.invoke('invokeGpt', { operation: 'InvokeLLM', payload });
  const data = res?.data ?? res;
  if (data && data.ok === false) throw new Error(data.error || 'invokeGpt falhou (InvokeLLM)');
  return data?.result;
}

// Versão local inline do construtor de nome oficial (evita dependência de _shared)
function buildNomeOficialLocal(intake, tipo) {
  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  const prefix = tipo === 'XML' ? 'XML' : 'NF';
  const sanitize = (v, max = 60) => String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, max).trim();
  const num = sanitize(intake?.nf_numero, 10).replace(/^0+(\d)/, '$1') || 'SN';
  const desc = sanitize(intake?.rubrica_nome_sugerida || intake?.rubrica_nome || 'Despesa', 30) || 'Despesa';
  const nomeExib = sanitize(intake?.fornecedor_nome || intake?.nf_emitente_nome || 'FORNECEDOR', 60) || 'FORNECEDOR';
  const v = Number(intake?.nf_valor_total || 0);
  const valor = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${prefix} ${num} ${desc} - ${nomeExib} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

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
const BATCH_SIZE = 5; // lote fixo de 5 documentos por vez (PRD)
const MAX_TENTATIVAS_IA = 1;
const IA_TIMEOUT_MS = 90000; // 90s por NF — leitura profunda via GPT-4o
const DEADLINE_MS = 270000; // 4.5min global (limite plataforma 5min — sobra buffer p/ resposta)
const MESES_PT = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeStr(v) { return String(v || '').trim(); }
function safeNum(v) { const n = Number(v); return isNaN(n) ? null : n; }

// Verificação obrigatória: TODA nota fiscal do projeto deve mencionar a contratante
// ("Museu Centro" / "Museus Centro" / "Viaduto das Artes") na descrição do serviço.
// NFs sem essa menção são REJEITADAS — proteção contra NFs não relacionadas ao projeto.
function descricaoContemMuseuCentro(intake) {
  const desc = safeStr(intake?.descricao_nota).toLowerCase();
  if (!desc) return false;
  return /(museu\s*centro|museus\s*centro|viaduto\s*das\s*artes)/.test(desc);
}

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
    if (!descricaoContemMuseuCentro(intake)) faltando.push('descricao_nota');
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
- descricao_nota: discriminação do serviço/produto em 1-3 frases (concisa, factual, sem interpretar).
  CRÍTICO: para ser válida, a descricao_nota DEVE mencionar a contratante do projeto:
  "Museu Centro" OU "Museus Centro" OU "Viaduto das Artes" (em qualquer lugar do texto).
  Se o documento não mencionar nenhuma dessas três expressões, retorne null em descricao_nota.

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
      descricao_nota: { type: 'string' },
    },
  };

  const runIA = async (url) => invokeLLM(base44.asServiceRole,{
    model: 'gpt-4o',
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
    // Centro de custo: IA localiza via descrição; se vazio ou variante Noturno → default "Geral" (transversal)
    {
      const cc = ia?.centro_custo ? safeStr(ia.centro_custo) : '';
      const noturnoVariants = ['Noturno nos Museus 2026', 'Noturno 2026', 'Noturno Pampulha', 'Noturno nos Museus BH'];
      const ehNoturno = noturnoVariants.some((n) => cc.toLowerCase().includes(n.toLowerCase()));
      if (!cc || ehNoturno) {
        updates.centro_custo = 'Geral';
      } else {
        updates.centro_custo = cc;
      }
    }
    if (ia?.fornecedor_nome) updates.fornecedor_nome = safeStr(ia.fornecedor_nome);
    if (ia?.municipio) updates.municipio = safeStr(ia.municipio);
    if (ia?.descricao_nota) {
      const desc = safeStr(ia.descricao_nota);
      // Só aceita descricao_nota que mencione a contratante do projeto
      if (/(museu\s*centro|museus\s*centro|viaduto\s*das\s*artes)/i.test(desc)) {
        updates.descricao_nota = desc;
      } else {
        console.warn('[SalaEspera] descricao_nota sem menção à contratante do projeto — descartada');
      }
    }

    if (Object.keys(updates).length === 0) return { ok: false, motivo: 'ia_vazia' };

    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates).catch(() => null);
    return { ok: true, motivo: 'preenchido', updates };
  } catch (e) {
    return { ok: false, motivo: `erro_ia:${e.message}` };
  }
}

// ── Pipeline: linkar XML+PDF órfãos (critérios triplos) ────────────────────────

function matchTriplo(a, b) {
  const na = safeStr(a.nf_numero);
  const nb = safeStr(b.nf_numero);
  if (!na || !nb || na !== nb) return false;
  const ca = safeStr(a.nf_emitente_cpf_cnpj || a.fornecedor_cpf_cnpj).replace(/\D/g, '');
  const cb = safeStr(b.nf_emitente_cpf_cnpj || b.fornecedor_cpf_cnpj).replace(/\D/g, '');
  if (!ca || !cb || ca !== cb) return false;
  const va = Number(a.nf_valor_total);
  const vb = Number(b.nf_valor_total);
  if (!va || !vb) return false;
  const tol = Math.max(va, vb) * 0.05;
  return Math.abs(va - vb) <= tol;
}

// Pré-vincula XML+PDF órfãos da fila por critérios triplos (numero + CNPJ + valor ±5%)
async function linkarXmlPdfOrfaos(base44, token, pendentes) {
  const pdfs = pendentes.filter((i) => i.tipo_detectado === 'NOTA_FISCAL_PDF' && !i.nf_xml_intake_id);
  const xmls = pendentes.filter((i) => i.tipo_detectado === 'NOTA_FISCAL_XML' && !i.nf_pdf_intake_id);
  if (pdfs.length === 0 || xmls.length === 0) return { pares: 0, log: [] };

  const log = [];
  // Pré-popula campos do XML deterministicamente (instantâneo) p/ permitir match triplo
  for (const xml of xmls) {
    const xmlText = await fetchXmlContent(token, xml.arquivo_original_url);
    if (!xmlText) continue;
    const parsed = parseXmlNF(xmlText);
    if (parsed.status_leitura === 'leitura_falhou') continue;
    const updates = {};
    if (parsed.numero_nf && !xml.nf_numero) { xml.nf_numero = parsed.numero_nf; updates.nf_numero = parsed.numero_nf; }
    if (parsed.emitente_cpf_cnpj && !xml.fornecedor_cpf_cnpj) {
      xml.fornecedor_cpf_cnpj = parsed.emitente_cpf_cnpj;
      xml.nf_emitente_cpf_cnpj = parsed.emitente_cpf_cnpj;
      updates.fornecedor_cpf_cnpj = parsed.emitente_cpf_cnpj;
      updates.nf_emitente_cpf_cnpj = parsed.emitente_cpf_cnpj;
    }
    if (parsed.valor_total != null && !xml.nf_valor_total) { xml.nf_valor_total = parsed.valor_total; updates.nf_valor_total = parsed.valor_total; }
    if (parsed.emitente_nome && !xml.nf_emitente_nome) updates.nf_emitente_nome = parsed.emitente_nome;
    if (parsed.data_emissao && !xml.nf_data_emissao) updates.nf_data_emissao = parsed.data_emissao.substring(0, 10);
    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.DocumentIntake.update(xml.id, updates).catch(() => null);
    }
  }

  // Pareamento triplo
  const matchedXmlIds = new Set();
  let pares = 0;
  for (const pdf of pdfs) {
    const cand = xmls.find((x) => !matchedXmlIds.has(x.id) && matchTriplo(pdf, x));
    if (!cand) continue;
    matchedXmlIds.add(cand.id);
    await base44.asServiceRole.entities.DocumentIntake.update(pdf.id, {
      nf_xml_intake_id: cand.id,
      nf_xml_url: cand.arquivo_original_url,
    }).catch(() => null);
    await base44.asServiceRole.entities.DocumentIntake.update(cand.id, {
      nf_pdf_intake_id: pdf.id,
      nf_pdf_url: pdf.arquivo_original_url,
      grupo_status: 'VINCULADO',
      ocultar_entrada_unica: true,
      status_processamento: 'APROVADO',
    }).catch(() => null);
    log.push(`PDF ${pdf.id} ↔ XML ${cand.id} (NF ${safeStr(pdf.nf_numero || cand.nf_numero)})`);
    pares++;
  }
  return { pares, log };
}

// ── Pipeline: dedup contra NFs já aprovadas/pagas (do início ao fim) ──────────

async function verificarDuplicataIntake(base44, intake) {
  const num = safeStr(intake.nf_numero);
  const cnpj = safeStr(intake.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj).replace(/\D/g, '');
  const val = Number(intake.nf_valor_total);
  if (!num || !cnpj || !val) return { duplicata: false };

  // 1. Verifica PurchaseRequest já aprovada/paga com mesmo triplo (tolerância 2%)
  try {
    const existing = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { nf_numero: num, nf_emitente_cpf_cnpj: cnpj, status: { $in: ['APROVADO_ADMIN', 'PAGO'] } },
      '-created_date', 20, 0
    ).catch(() => []);
    for (const pr of (existing || [])) {
      const v = Number(pr.nf_valor_total || 0);
      if (v && Math.abs(v - val) <= Math.max(val, 1) * 0.02) {
        return { duplicata: true, originalId: pr.id, tabela: 'PurchaseRequest' };
      }
    }
  } catch {
    /* ignore */
  }

  // 2. Verifica DocumentIntake já APROVADO recentemente (mesmo triplo)
  try {
    const irmaos = await base44.asServiceRole.entities.DocumentIntake.filter(
      { nf_numero: num, nf_emitente_cpf_cnpj: cnpj, status_processamento: 'APROVADO' },
      '-updated_date', 20, 0
    ).catch(() => []);
    for (const irmao of (irmaos || [])) {
      if (irmao.id === intake.id) continue;
      const v = Number(irmao.nf_valor_total || 0);
      if (v && Math.abs(v - val) <= Math.max(val, 1) * 0.02) {
        return { duplicata: true, originalId: irmao.id, tabela: 'DocumentIntake' };
      }
    }
  } catch {
    /* ignore */
  }

  return { duplicata: false };
}

// ── Pipeline: resolver nome oficial (metadata + histórico + IA leve) ──────────

// Retorna o nome oficial esperado para o arquivo no Drive.
// Estratégia:
//   1. buildNomeOficialLocal a partir dos metadados do intake
//   2. Se campos chave ausentes (degradado): extrai do nome do arquivo original
//   3. Se ainda degradado: busca histórico no banco (DocumentIntake aprovado
//      com mesmo fornecedor_cpf_cnpj que já tem file_name_final válido) e copia
//      nf_numero, fornecedor_nome e nf_valor_total do seu file_name_final
//   4. Se ainda degradado: chama IA leve (invokeGpt) com nome+metadata p/ inferir
async function resolverNomeOficial(base44, intake, tipo) {
  const tipoMarker = tipo === 'XML' ? 'XML' : 'NF';
  let nomeBase = buildNomeOficialLocal(intake, tipo);
  const ehDegradado = (n) => /\bSN\b/.test(n) || /\bFORNECEDOR\b/.test(n) || /R\$ 0,00/.test(n);
  if (!ehDegradado(nomeBase)) return nomeBase;

  // 2. Extrair do nome original do arquivo (padrão NF XXX Despesa - FORN - MUSEUS CENTRO - R$ YY,YY.ext)
  const fromName = extrairDoNomeArquivo(intake.file_name_original) || {};
  const mergedIntake = {
    ...intake,
    nf_numero: safeStr(intake.nf_numero) || fromName.nf_numero || intake.nf_numero,
    nf_valor_total: safeNum(intake.nf_valor_total) ?? fromName.nf_valor_total ?? intake.nf_valor_total,
    nf_data_emissao: safeStr(intake.nf_data_emissao) || fromName.nf_data_emissao || intake.nf_data_emissao,
  };
  let nomeMerged = buildNomeOficialLocal(mergedIntake, tipo);
  if (!ehDegradado(nomeMerged)) return nomeMerged;

  // 3. Histórico: DocumentIntake aprovado, mesmo CNPJ, com file_name_final válido
  const cnpj = safeStr(intake.fornecedor_cpf_cnpj || intake.nf_emitente_cpf_cnpj).replace(/\D/g, '');
  if (cnpj) {
    try {
      const irmaos = await base44.asServiceRole.entities.DocumentIntake.filter(
        { fornecedor_cpf_cnpj: cnpj, status_processamento: 'APROVADO' },
        '-updated_date', 5, 0
      ).catch(() => []);
      for (const irmao of (irmaos || [])) {
        const fname = safeStr(irmao.file_name_final);
        if (!fname.startsWith(tipoMarker)) continue;
        const m = fname.match(/^(?:NF|XML)\s+(\d+)\s+([^-]+?)\s+-\s+([^-]+?)\s+-\s+MUSEUS CENTRO\s+-\s+R\$\s*([\d.,]+)/);
        if (!m) continue;
        const histIntake = {
          ...mergedIntake,
          nf_numero: safeStr(mergedIntake.nf_numero) || m[1],
          rubrica_nome_sugerida: mergedIntake.rubrica_nome_sugerida || m[2].trim(),
          fornecedor_nome: safeStr(mergedIntake.fornecedor_nome) || m[3].trim(),
          nf_valor_total: (safeNum(mergedIntake.nf_valor_total) ?? 0) ||
            parseFloat(m[4].replace(/\./g, '').replace(',', '.')) || mergedIntake.nf_valor_total,
        };
        const nomeHist = buildNomeOficialLocal(histIntake, tipo);
        if (!ehDegradado(nomeHist)) return nomeHist;
      }
    } catch { /* ignore */ }
  }

  // 4. IA leve — inferir nf_numero, fornecedor, valor a partir do nome do arquivo
  try {
    const prompt = `Você é um extrator de metadados de nota fiscal.
A partir do nome original do arquivo abaixo, retorne apenas JSON com:
{"nf_numero": "...", "fornecedor_nome": "...", "nf_valor_total": 0.00}
- nf_numero: dígitos do número da NF (se houver "NF" seguido de número)
- fornecedor_nome: nome do fornecedor após o hífen (se houver)
- nf_valor_total: valor numérico em formato 0.00 (de "R$ X,YY" → X.YY)
- Use null quando não for possível extrair
Nome do arquivo: "${safeStr(intake.file_name_original)}"`;
    const iaResp = await invokeLLM(base44, {
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          nf_numero: { type: 'string' },
          fornecedor_nome: { type: 'string' },
          nf_valor_total: { type: 'number' },
        },
      },
    });
    if (iaResp && typeof iaResp === 'object') {
      const iaIntake = {
        ...mergedIntake,
        nf_numero: safeStr(mergedIntake.nf_numero) || safeStr(iaResp.nf_numero) || mergedIntake.nf_numero,
        fornecedor_nome: safeStr(mergedIntake.fornecedor_nome) || safeStr(iaResp.fornecedor_nome) || mergedIntake.fornecedor_nome,
        nf_valor_total: safeNum(mergedIntake.nf_valor_total) ?? safeNum(iaResp.nf_valor_total) ?? mergedIntake.nf_valor_total,
      };
      const nomeIA = buildNomeOficialLocal(iaIntake, tipo);
      if (!ehDegradado(nomeIA)) return nomeIA;
    }
  } catch { /* ignore — fallback p/ nome degradado */ }

  return nomeBase;
}

// ── Early rename — garante nome canônico no Drive ANTES do processamento ────
// Se file_name_final já está oficial → skip. Se metadata insuficiente → skip (deixa
// p/ resolverNomeOficial no final do pipeline). Se metadata OK → rename via PATCH.
async function garantirNomeOficialEarly(base44, token, intake) {
  if (intake.tipo_detectado !== 'NOTA_FISCAL_PDF' && intake.tipo_detectado !== 'NOTA_FISCAL_XML') {
    return { skip: true, motivo: 'nao_eh_nf' };
  }

  const fNome = safeStr(intake.file_name_final);
  const ehOficial = /^(NF|XML|COMP NF)\s+\d+\s+.+\s+-\s+.+\s+-\s+MUSEUS CENTRO\s+-\s+R\$\s+[\d.,]+\.(pdf|xml)$/i.test(fNome);
  if (ehOficial) return { skip: true, motivo: 'ja_oficial' };

  // Sem metadata mínima — deixa p/ renomearEMoverParaBackup resolver no final do pipeline
  if (!safeStr(intake.nf_numero) || !safeNum(intake.nf_valor_total)) {
    return { skip: true, motivo: 'metadata_insuficiente' };
  }

  const url = intake.nf_pdf_url || intake.nf_xml_url || intake.arquivo_original_url;
  const fileId = extrairDriveId(url);
  if (!fileId) return { skip: true, motivo: 'sem_file_id' };

  const tipo = intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'XML' : 'NF';
  let nomeOficial;
  try {
    nomeOficial = await resolverNomeOficial(base44, intake, tipo);
  } catch (e) {
    return { skip: false, motivo: `resolver_erro:${e.message}` };
  }
  if (!nomeOficial) return { skip: true, motivo: 'nome_invalido' };

  // Idempotência: nome no Drive já é o oficial
  if (fNome === nomeOficial) {
    if (intake.file_name_final !== nomeOficial) {
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
        file_name_final: nomeOficial,
      }).catch(() => null);
      intake.file_name_final = nomeOficial;
    }
    return { skip: true, motivo: 'ja_no_banco' };
  }

  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nomeOficial }),
      },
    );
    if (!r.ok) return { skip: false, motivo: `rename_falhou:${r.status}` };
    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
      file_name_final: nomeOficial,
    }).catch(() => null);
    intake.file_name_final = nomeOficial;
    return { skip: false, motivo: 'renomeado', nome: nomeOficial };
  } catch (e) {
    return { skip: false, motivo: `erro:${e.message}` };
  }
}

// ── Pipeline: renomear NF p/ padrão oficial + mover p/ pasta mensal (backup) ─
// Garante: nome no Drive === nome oficial E arquivo está na pasta mensal MM-YYYY
// Retorna flags driveNameConfirmed / parentalConfirmado para gate da fila de entrada.
async function renomearEMoverParaBackup(token, base44, intake, folderCache) {
  const url = intake.nf_pdf_url || intake.nf_xml_url || intake.arquivo_original_url;
  const fileId = extrairDriveId(url);
  if (!fileId) return { ok: false, motivo: 'sem_file_id_drive', nome: null };

  const tipo = intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'XML' : 'NF';
  const nomeOficial = await resolverNomeOficial(base44, intake, tipo);
  if (!nomeOficial) return { ok: false, motivo: 'nome_invalido', nome: null };

  const dataInfo = parseDataEmissao(intake.nf_data_emissao);
  if (!dataInfo) return { ok: false, motivo: 'sem_data_emissao', nome: nomeOficial };

  const mesFmt = String(dataInfo.mesIdx + 1).padStart(2, '0');
  const nomePasta = `${mesFmt}-${dataInfo.ano}`;
  let folderId;
  try {
    folderId = await getOrCreate(token, nomePasta, ROOT_NOTAS_FOLDER_ID, folderCache);
  } catch (e) {
    return { ok: false, motivo: `pasta_erro:${e.message}`, nome: nomeOficial };
  }
  if (!folderId) return { ok: false, motivo: 'pasta_nao_criada', nome: nomeOficial };

  // 0. Pré-verificação — estado atual do arquivo no Drive (idempotência)
  let nomeDrive = null, parentsDrive = [];
  try {
    const rGet = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!rGet.ok) {
      const dErr = await rGet.json().catch(() => ({}));
      return { ok: false, motivo: `arquivo_inacessivel:${rGet.status}:${dErr.error?.message || ''}`, nome: nomeOficial };
    }
    const dGet = await rGet.json();
    nomeDrive = dGet.name;
    parentsDrive = dGet.parents || [];
  } catch (e) {
    return { ok: false, motivo: `get_erro:${e.message}`, nome: nomeOficial };
  }

  // 1. Renomear no Drive se o nome atual divergir do padrão oficial
  if (nomeDrive !== nomeOficial) {
    try {
      const rRename = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nomeOficial }),
        },
      );
      if (!rRename.ok) {
        const dRename = await rRename.json().catch(() => ({}));
        return { ok: false, motivo: `rename_falhou:${rRename.status}:${dRename.error?.message || ''}`, nome: nomeOficial, driveName: nomeDrive };
      }
    } catch (e) {
      return { ok: false, motivo: `rename_erro:${e.message}`, nome: nomeOficial };
    }
  }

  // 2. Mover para pasta mensal se ainda não estiver lá
  if (!parentsDrive.includes(folderId)) {
    try {
      const moveParams = new URLSearchParams();
      moveParams.set('addParents', folderId);
      const toRemove = (parentsDrive || []).join(',');
      if (toRemove) moveParams.set('removeParents', toRemove);
      const rMove = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?${moveParams.toString()}&supportsAllDrives=true`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } },
      );
      if (!rMove.ok) {
        const dMove = await rMove.json().catch(() => ({}));
        return { ok: false, motivo: `move_falhou:${rMove.status}:${dMove.error?.message || ''}`, nome: nomeOficial };
      }
    } catch (e) {
      return { ok: false, motivo: `move_erro:${e.message}`, nome: nomeOficial };
    }
  }

  // 3. Verificação final — GET p/ confirmar nome + parent contém pasta mensal
  let nomeFinal = null, parentsFinal = [];
  try {
    const rVer = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (rVer.ok) {
      const dVer = await rVer.json();
      nomeFinal = dVer.name;
      parentsFinal = dVer.parents || [];
    }
  } catch { /* ignore */ }

  const driveNameConfirmed = nomeFinal === nomeOficial;
  const parentalConfirmado = Array.isArray(parentsFinal) && parentsFinal.includes(folderId);

  // 4. Persistir nome final no intake (DB) — nomeOficial é a verdade aqui
  if (intake.file_name_final !== nomeOficial) {
    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
      file_name_final: nomeOficial,
    }).catch(() => null);
    intake.file_name_final = nomeOficial;
  }

  return {
    ok: driveNameConfirmed && parentalConfirmado,
    motivo: driveNameConfirmed && parentalConfirmado
      ? 'renomeado_e_movido'
      : `verificacao:${driveNameConfirmed ? 'nome_ok' : 'nome_diff'}:${parentalConfirmado ? 'parent_ok' : 'parent_diff'}`,
    nome: nomeOficial,
    driveNameConfirmed,
    parentalConfirmado,
    pasta: nomePasta,
  };
}

// ── Processar um intake ──────────────────────────────────────────────────────

async function processarIntake(base44, token, intake, folderCache, tentativasMap) {
  const log = { id: intake.id, tipo: intake.tipo_detectado, fileName: intake.file_name_final || intake.file_name_original, status: '', detalhes: [] };

  // 0. Early canonical rename — se metadata disponível, garante nome oficial no Drive ANTES do pipeline
  if (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML') {
    try {
      const early = await garantirNomeOficialEarly(base44, token, intake);
      if (early?.motivo) log.detalhes.push(`EarlyRename: ${early.motivo}${early.nome ? ' → ' + early.nome.slice(0, 60) : ''}`);
    } catch (e) {
      log.detalhes.push(`EarlyRename erro: ${e.message}`);
    }
  }

  // 0. NOVO Stage: Verificar duplicata contra NFs já aprovadas/pagas (do início ao fim do pipeline)
  if (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML') {
    try {
      const dupCheck = await verificarDuplicataIntake(base44, intake);
      if (dupCheck.duplicata) {
        await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'REJEITADO',
          ocultar_entrada_unica: true,
          erros_validacao: [`Duplicata de ${dupCheck.tabela}:${safeStr(dupCheck.originalId).substring(0, 8)}`],
        }).catch(() => null);
        log.status = 'duplicata_rejeitada';
        log.detalhes.push(`Duplicata confirmada de ${dupCheck.tabela}:${dupCheck.originalId}`);
        return log;
      }
    } catch (e) {
      log.detalhes.push(`AVISO dedup: ${e.message}`);
    }
  }

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
  //     Antes de remover da fila: confirmar backup no Drive (rename + move p/ pasta mensal)
  const updates = {
    status_processamento: 'APROVADO',
    revisado_pelo_usuario: true,
    ocultar_entrada_unica: false, // só vira true após verificar backup
  };

  let backupConfirmado = true; // default p/ não-NF (foto/contrato: upload já é o backup)

  // 6. NF (PDF/XML) → renomear p/ padrão oficial + mover p/ pasta mensal de backup
  //     Verificação embutida: driveNameConfirmed (nome) + parentalConfirmado (pasta)
  //     Só libera ocultar_entrada_unica se ambas as flags forem TRUE
  if (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML') {
    try {
      const backupResult = await renomearEMoverParaBackup(token, base44, intake, folderCache);
      log.detalhes.push(`Backup: ${backupResult.motivo}${backupResult.nome ? ' → ' + backupResult.nome : ''}`);
      if (backupResult.nome) intake.file_name_final = backupResult.nome;

      // Verificação automática — confirma arquivo na pasta mensal do Drive
      backupConfirmado = !!(backupResult.ok && backupResult.driveNameConfirmed && backupResult.parentalConfirmado);
      if (!backupConfirmado) {
        log.detalhes.push(`Verificação Drive falhou: nome=${backupResult.driveNameConfirmed ? 'OK' : 'DIFF'}, parent=${backupResult.parentalConfirmado ? 'OK' : 'DIFF'}`);
      } else {
        log.detalhes.push(`Backup Drive confirmado (nome=${backupResult.driveNameConfirmed}, pasta=${backupResult.parentalConfirmado})`);
      }
    } catch (e) {
      log.detalhes.push(`AVISO backup rename/move: ${e.message}`);
      backupConfirmado = false;
    }
  }

  if (backupConfirmado) {
    updates.ocultar_entrada_unica = true;
  } else {
    // Backup não confirmado → mantém visível na fila p/ reprocessamento/revisão
    updates.status_processamento = 'AGUARDANDO_REVISAO';
    log.detalhes.push('NF mantida na fila (backup Drive não confirmado antes de remover)');
  }

  try {
    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates);
    log.status = backupConfirmado ? 'liberado' : 'pendente_backup';
    log.detalhes.push(backupConfirmado
      ? '100% campos preenchidos → APROVADO + backup Drive OK → removido da fila'
      : 'Backup Drive pendente → NF permanece visível na fila de entrada');
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

    // 2b. NOVO Stage: Pré-vincular XML+PDF órfãos da fila (critérios triplos: numero + CNPJ + valor)
    let linkResult = { pares: 0, log: [] };
    try {
      linkResult = await linkarXmlPdfOrfaos(base44, token, pendentes);
      if (linkResult.log.length) console.log('[SalaEspera] Linkar:', linkResult.log.join('; '));
    } catch (e) {
      linkResult.log.push(`Linkar XML+PDF falhou: ${e.message}`);
    }

    // 3. Processar em lotes (interrompe antes do prazo global p/ não estourar execução)
    //    PRIORIZA XMLs (processamento determinístico instantâneo) antes dos PDFs (IA lenta)
    const resultados = { liberado: 0, duplicata_rejeitada: 0, pendente_dados: 0, pendente_backup: 0, rejeitado_dados_incompletos: 0, erro_update: 0, erro: 0 };
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
      details: `Sala de Espera: ${resultados.liberado} liberados (100% preenchidos + backup Drive OK), ${resultados.duplicata_rejeitada || 0} duplicatas rejeitadas, ${linkResult.pares} XML+PDF linkados, ${resultados.pendente_dados || 0} pendentes IA, ${resultados.pendente_backup || 0} pendentes backup Drive, ${resultados.rejeitado_dados_incompletos || 0} rejeitados dados, ${paradosPorDeadline} adiados (deadline)`,
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