// ================================================================
// lerNotaFiscalGPTCore — Módulo compartilhado
// Lógica central de leitura integral de NFs com OpenAI (gpt-4o)
// usando Structured Outputs (strict JSON Schema) e PDF via Files API.
//
// Exportado: `analisarNotaFiscal(base44, options)` — não-grava, devolve
// laudo estruturado. Reutilizado por `lerNotaFiscalGPT/entry.ts`
// (chamada via HTTP admin/UI) e `organizarNFsComIA/entry.ts`
// (chamada direta, sem custo de cross-function HTTP).
// ================================================================

const OPENAI_MODEL = 'gpt-4o-2024-08-06';
const TOMADOR_BENEFAVIADO_NOME = 'Viaduto das Artes';
const TOMADOR_BENEFAVIADO_CNPJ = '23843648000125';
const CENTROS_PERMITIDOS = ['MIS', 'MUMO', 'MHAB', 'GERAL', 'NOTURNO_2026', 'NOTURNO_PAMPULHA', 'PUBLICACOES'];

// ─── Utilidades ──────────────────────────────────────────────
const onlyDigits = (v) => String(v ?? '').replace(/\D+/g, '');
const safeStr = (v) => String(v ?? '').trim();

function parseMoneyBR(v) {
  const raw = safeStr(v).replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function isISODate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(safeStr(d)); }

function isValidCnpj(cnpj) {
  const c = onlyDigits(cnpj);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const calc = (slice, weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(c[slice + i] || 0) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  return Number(c[12]) === calc(0, w1) && Number(c[13]) === calc(0, w2);
}

async function fetchText(url, opts = {}) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(45_000), ...opts });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// ─── Parse XML determinístico ─────────────────────────────────
function parseXmlRaw(xml) {
  const tag = (re) => { const m = xml.match(re); return (m?.[1] || '').trim(); };
  const block = (name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i')); return m?.[1] || ''; };
  const tEmit = block('emit');
  const tDest = block('dest');
  const compLote = block('InfNfse').match(/<Competencia[^>]*>([^<]+)<\/Competencia>/i);
  return {
    nf_emitente_cpf_cnpj: onlyDigits(tag(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i) || tEmit.match(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i)?.[1] || tag(/<CPF[^>]*>(\d+)<\/CPF>/i) || tEmit.match(/<CPF[^>]*>(\d+)<\/CPF>/i)?.[1]),
    nf_emitente_nome: tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tEmit.match(/<xNome[^>]*>([^<]+)<\/xNome>/i)?.[1] || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i),
    nf_numero: onlyDigits(tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i)),
    nf_serie: tag(/<serie[^>]*>([^<]+)<\/serie>/i) || tag(/<Serie[^>]*>([^<]+)<\/Serie>/i) || '',
    nf_valor_total: parseMoneyBR(tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i) || tag(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i)),
    nf_valor_liquido: parseMoneyBR(tag(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i) || tag(/<vLiq[^>]*>([\d.,]+)<\/vLiq>/i) || tag(/<vLiquido[^>]*>([\d.,]+)<\/vLiquido>/i) || tag(/<ValorLiquido[^>]*>([\d.,]+)<\/ValorLiquido>/i)),
    iss: parseMoneyBR(tag(/<vISSQN[^>]*>([\d.,]+)<\/vISSQN>/i) || tag(/<ValorIss[^>]*>([\d.,]+)<\/ValorIss>/i)),
    inss: parseMoneyBR(tag(/<vRetINSS[^>]*>([\d.,]+)<\/vRetINSS>/i) || tag(/<ValorInss[^>]*>([\d.,]+)<\/ValorInss>/i)),
    irrf: parseMoneyBR(tag(/<vRetIR[^>]*>([\d.,]+)<\/vRetIR>/i) || tag(/<vIRRF[^>]*>([\d.,]+)<\/vIRRF>/i) || tag(/<ValorIr[^>]*>([\d.,]+)<\/ValorIr>/i)),
    csll: parseMoneyBR(tag(/<vRetCSLL[^>]*>([\d.,]+)<\/vRetCSLL>/i) || tag(/<ValorCsll[^>]*>([\d.,]+)<\/ValorCsll>/i)),
    cofins: parseMoneyBR(tag(/<vRetCOFINS[^>]*>([\d.,]+)<\/vRetCOFINS>/i) || tag(/<ValorCofins[^>]*>([\d.,]+)<\/ValorCofins>/i)),
    pis: parseMoneyBR(tag(/<vRetPIS[^>]*>([\d.,]+)<\/vRetPIS>/i) || tag(/<ValorPis[^>]*>([\d.,]+)<\/ValorPis>/i)),
    nf_data_emissao: (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i) || (compLote?.[1] || '').slice(0, 10)),
    competencia: tag(/<Competencia[^>]*>([^<]+)<\/Competencia>/i).slice(0, 7),
    nf_chave_acesso: onlyDigits(tag(/<chNFe[^>]*>(\d{44})<\/chNFe>/i) || tag(/<ChaveAcesso[^>]*>(\d+)<\/ChaveAcesso>/i)).slice(0, 44),
    tomador_nome: tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tDest.match(/<xNome[^>]*>([^<]+)<\/xNome>/i)?.[1] || tag(/<TomadorServico[^>]*>([^<]+)/i) || block('Tomador').match(/<RazaoSocial[^>]*>([^<]+)/i)?.[1],
    tomador_cnpj: onlyDigits(tDest.match(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i)?.[1] || tag(/<CNPJTomador[^>]*>(\d+)<\/CNPJTomador>/i) || ''),
    municipio: tag(/<xMun[^>]*>([^<]+)<\/xMun>/i) || tag(/<Municipio[^>]*>([^<]+)<\/Municipio>/i) || block('Endereco').match(/<Municipio[^>]*>([^<]+)<\/Municipio>/i)?.[1],
    codigo_servico: tag(/<cServico[^>]*>([^<]+)<\/cServico>/i) || tag(/<CodigoServico[^>]*>([^<]+)/i),
    cnae: tag(/<cNaTribut[^>]*>(\d+)<\/cNaTribut>/i) || tag(/<CNAE[^>]*>([^<]+)/i),
    descricao_servico: tag(/<xServ[^>]*>([^<]+)<\/xServ>/i) || tag(/<Discriminacao[^>]*>([^<]+)<\/Discriminacao>/i),
  };
}

// ─── Download (direto ou via conector Google Drive) ───────────
async function resolverDownload(base44, url) {
  if (!url || typeof url !== 'string') throw new Error('URL inválida');
  const u = url.trim();
  const gdMatch = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i) || u.match(/drive\.google\.com\/\?id=([^&]+)/i) || u.match(/docs\.google\.com\/file\/d\/([^/]+)/i);
  if (gdMatch) {
    const fileId = gdMatch[1];
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      if (conn?.access_token) {
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${conn.access_token}` },
          signal: AbortSignal.timeout(60_000),
        });
        if (resp.ok) return new Uint8Array(await resp.arrayBuffer());
      }
    } catch (e) {
      console.warn('[lerNF] Drive OAuth falhou, tentando download público:', e.message);
    }
    const publicResp = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
    if (!publicResp.ok) throw new Error(`Não foi possível baixar o arquivo do Drive (${publicResp.status}).`);
    return new Uint8Array(await publicResp.arrayBuffer());
  }
  const resp = await fetch(u, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  if (!resp.ok) throw new Error(`Download falhou (${resp.status}).`);
  return new Uint8Array(await resp.arrayBuffer());
}

// ─── OpenAI Files API ─────────────────────────────────────────
async function uploadToOpenAIFiles(bytes, filename, mime) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const fd = new FormData();
  fd.append('purpose', 'user_data');
  fd.append('file', new Blob([bytes], { type: mime || 'application/octet-stream' }), filename || 'documento.bin');
  const resp = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`OpenAI Files API ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  if (!data?.id) throw new Error('Upload Files API não retornou id');
  return data.id;
}

// ─── Chat Completions com Structured Outputs strict ───────────
async function invokeGPTStructured({ systemPrompt, userParts, schema, maxTokens = 8000, model = OPENAI_MODEL }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts.length ? userParts : [{ type: 'text', text: 'Analise o context fornecido.' }] },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'nf_analysis', strict: true, schema } },
    max_tokens: maxTokens,
    temperature: 0.1,
    top_p: 1,
  };
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(150_000),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => resp.statusText);
        throw new Error(`OpenAI ${resp.status}: ${t}`);
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage;
      if (usage) console.log(`[lerNF] gpt model=${model} prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`);
      try { return JSON.parse(content); }
      catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
    } catch (e) {
      lastErr = e;
      console.warn(`[lerNF] tentativa ${i + 1} falhou:`, e.message);
      if (i === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

// ─── JSON Schema strict (Structured Outputs) ──────────────────
export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tipo_documento: { type: 'string', enum: ['NF_PDF', 'NFSE_PDF', 'DANFE_PDF', 'NF_XML', 'COMPROVANTE', 'RECIBO_FISCAL', 'ORCAMENTO', 'PROPOSTA', 'EXTRATO', 'DOCUMENTO_ADMINISTRATIVO', 'NAO_IDENTIFICADO'] },
    documento_fiscal_valido: { type: 'boolean' },
    criar_solicitacao_financeira: { type: 'boolean' },
    numero_nota: { type: ['string', 'null'] },
    serie: { type: ['string', 'null'] },
    chave_acesso: { type: ['string', 'null'] },
    data_emissao: { type: ['string', 'null'] },
    data_competencia: { type: ['string', 'null'] },
    data_vencimento: { type: ['string', 'null'] },
    fornecedor_nome: { type: ['string', 'null'] },
    fornecedor_cnpj: { type: ['string', 'null'] },
    fornecedor_cpf: { type: ['string', 'null'] },
    fornecedor_inscricao_municipal: { type: ['string', 'null'] },
    tomador_nome: { type: ['string', 'null'] },
    tomador_cnpj: { type: ['string', 'null'] },
    tomador_valido: { type: 'boolean' },
    descricao_original: { type: ['string', 'null'] },
    descricao_normalizada: { type: ['string', 'null'] },
    valor_servicos: { type: ['number', 'null'] },
    valor_produtos: { type: ['number', 'null'] },
    valor_total: { type: ['number', 'null'] },
    valor_liquido: { type: ['number', 'null'] },
    iss: { type: ['number', 'null'] },
    inss: { type: ['number', 'null'] },
    irrf: { type: ['number', 'null'] },
    csll: { type: ['number', 'null'] },
    cofins: { type: ['number', 'null'] },
    pis: { type: ['number', 'null'] },
    outras_retencoes: { type: ['number', 'null'] },
    municipio_emissao: { type: ['string', 'null'] },
    codigo_servico_municipal: { type: ['string', 'null'] },
    cnae: { type: ['string', 'null'] },
    nota_cancelada: { type: 'boolean' },
    motivo_cancelamento: { type: ['string', 'null'] },
    projeto: { type: ['string', 'null'] },
    centro_custo: { type: ['string', 'null'] },
    meta_id: { type: ['string', 'null'] },
    meta_numero: { type: ['number', 'null'] },
    meta_nome: { type: ['string', 'null'] },
    meta_confianca: { type: ['number', 'null'] },
    rubrica_id: { type: ['string', 'null'] },
    rubrica_nome: { type: ['string', 'null'] },
    codigo_rubrica: { type: ['string', 'null'] },
    natureza_despesa: { type: ['string', 'null'] },
    aditivo: { type: ['string', 'null'] },
    compra_id: { type: ['string', 'null'] },
    duplicado: { type: 'boolean' },
    documento_principal_id: { type: ['string', 'null'] },
    acao_recomendada: { type: ['string', 'null'] },
    score: { type: 'number' },
    status_revisao: { type: 'string', enum: ['AGUARDANDO_REVISAO', 'REVISAR', 'BLOQUEADO', 'PRE_APROVADO'] },
    campos_incertos: { type: 'array', items: { type: 'string' } },
    alertas: { type: 'array', items: { type: 'string' } },
    evidencias: {
      type: 'object',
      additionalProperties: false,
      properties: {
        numero_nota: { type: ['string', 'null'] },
        data_emissao: { type: ['string', 'null'] },
        valor_total: { type: ['string', 'null'] },
        fornecedor_nome: { type: ['string', 'null'] },
        tomador_cnpj: { type: ['string', 'null'] },
        rubrica_nome: { type: ['string', 'null'] },
        meta_nome: { type: ['string', 'null'] },
        centro_custo: { type: ['string', 'null'] },
      },
      required: ['numero_nota', 'data_emissao', 'valor_total', 'fornecedor_nome', 'tomador_cnpj', 'rubrica_nome', 'meta_nome', 'centro_custo'],
    },
    rubrica_candidatas_incertas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rubrica_id: { type: ['string', 'null'] },
          rubrica_nome: { type: ['string', 'null'] },
          motivo: { type: ['string', 'null'] },
        },
        required: ['rubrica_id', 'rubrica_nome', 'motivo'],
      },
    },
  },
  required: [
    'tipo_documento', 'documento_fiscal_valido', 'criar_solicitacao_financeira', 'numero_nota', 'serie', 'chave_acesso',
    'data_emissao', 'data_competencia', 'data_vencimento', 'fornecedor_nome', 'fornecedor_cnpj', 'fornecedor_cpf',
    'fornecedor_inscricao_municipal', 'tomador_nome', 'tomador_cnpj', 'tomador_valido', 'descricao_original',
    'descricao_normalizada', 'valor_servicos', 'valor_produtos', 'valor_total', 'valor_liquido', 'iss', 'inss',
    'irrf', 'csll', 'cofins', 'pis', 'outras_retencoes', 'municipio_emissao', 'codigo_servico_municipal', 'cnae',
    'nota_cancelada', 'motivo_cancelamento', 'projeto', 'centro_custo', 'meta_id', 'meta_numero', 'meta_nome',
    'meta_confianca', 'rubrica_id', 'rubrica_nome', 'codigo_rubrica', 'natureza_despesa', 'aditivo', 'compra_id',
    'duplicado', 'documento_principal_id', 'acao_recomendada', 'score', 'status_revisao', 'campos_incertos',
    'alertas', 'evidencias', 'rubrica_candidatas_incertas',
  ],
};

// ─── Prompt de sistema ───────────────────────────────────────
function buildSystemPrompt(ctx) {
  return `Você é um analisador fiscal especializado na prestação de contas de Organização da Sociedade Civil. Sua função é ler integralmente notas fiscais brasileiras (NF-e, NFS-e, DANFE, recibo fiscal válido) e comprovantes de pagamento, classificá-las e relacioná-las EXCLUSIVAMENTE a compras, metas, rubricas e centros de custo oficiais fornecidos pelo sistema.

REGRAS ABSOLUTAS:
1. Nunca invente dados. Em caso de dúvida, retorne null no campo correspondente e gere alerta apropriado.
2. NUNCA use data de abertura, fundação, constituição, ingresso no CNPJ, cadastro municipal, nascimento, criação do PDF, upload, pagamento, vencimento, impressão, certificado digital, rodapé sem rótulo ou data do NOME DO ARQUIVO como data de emissão. Use somente a data rotulada no documento como "Data de Emissão", "Data da Emissão", "Emitida em", "Data de geração da NFS-e", "Data e hora de emissão" ou "Data de autorização". Prioridade: (1) data de emissão da NF/NFS-e; (2) data de autorização fiscal (apenas se não houver data de emissão); (3) data de geração fiscal (apenas se equivaler à emissão).
3. Hierarquia de fontes (prioridade decrescente): 1) XML fiscal vinculado; 2) QR Code/chave de acesso e campos estruturados do PDF fiscal; 3) conteúdo textual/visual do PDF; 4) compra previamente vinculada; 5) cadastro oficial de rubricas e metas; 6) nome do arquivo (AINDA APENAS indício auxiliar). Nunca substitua dados claros do XML/PDF por indícios do nome do arquivo.
4. Não crie Meta, rubrica, código, natureza ou centro de custo inexistentes. Use SOMENTE IDs, nomes, códigos e naturezas presentes nas listas oficiais (metasAtivas, rubricasAtivas, comprasCandidatas, centrosCustoPermitidos). Quando houver conflito ou incerteza entre duas rubricas igualmente prováveis, retorne rubrica_id null, liste em rubrica_candidatas_incertas e marque REVISAR.
5. Comprovante de pagamento NÃO é nota fiscal. tipo_documento="COMPROVANTE", criar_solicitacao_financeira=false. Não crie nova nota a partir de comprovante. Não use o valor do comprovante como valor_total da nota.
6. Se o arquivo for XML ou comprovante da MESMA nota já representada por outro PDF, marque duplicado=true, acao_recomendada="VINCULAR_COMO_COMPROVANTE" e documento_principal_id (quando souber). Não cria segunda nota.
7. Nota cancelada (palavras CANCELADA / NOTA CANCELADA / NFS-e CANCELADA): nota_cancelada=true, status_revisao="BLOQUEADO", criar_solicitacao_financeira=false, alerta "Nota fiscal cancelada."
8. Orçamento, proposta, extrato bancário e documento administrativo NÃO iniciam solicitação financeira (criar_solicitacao_financeira=false).
9. Valores: valor_total = total fiscal da nota; valor_liquido = valor após retenções (se informado); valores do comprovante NUNCA como valor_total.
10. Datas em YYYY-MM-DD. CNPJ/CPF somente dígitos. Tomador esperado: "Viaduto das Artes", CNPJ 23843648000125. Aceita variantes textuais, mas valide o CNPJ. Se tomador ausente ou diferente: tomador_valido=false e status_revisao="REVISAR".
11. Centro de custo: somente ${CENTROS_PERMITIDOS.join(', ')}. Prioridade: compra vinculada > rubrica oficial > descrição > projeto > nome do arquivo. Quando a descrição menciona mais de um museu, use "GERAL".
12. Score 0-10: +2 número identificado; +2 data de emissão fiscal rotulada; +2 fornecedor + CNPJ/CPF; +1 tomador validado; +1 valor total; +1 rubrica; +1 meta. Penalidades: -3 conflito XML/PDF; -2 conflito conteúdo/arquivo; -2 duas rubricas prováveis; -3 tomador incorreto; -4 nota cancelada; -2 data não comprovada.
13. status_revisao: "PRE_APROVADO" se score>=9 E nota_cancelada=false E tomador_valido=true E sem campos_incertos; "AGUARDANDO_REVISAO" se score entre 7 e 8; "REVISAR" se score<=6 ou algum campo incerto; "BLOQUEADO" se nota_cancelada=true OU duplicado confirmado com nota fiscal (não comprovante).
14. evidencias: para cada campo crítico, informe o trecho literal do documento (com rótulo fiscal quando houver) que sustenta o valor. Se o campo estiver nulo, a evidência correspondente deve ser null.

CONTEXTO DO SISTEMA (use SOMENTE estes IDs ao associar):
- tomadorEsperado: ${JSON.stringify({ nome: TOMADOR_BENEFAVIADO_NOME, cnpj: TOMADOR_BENEFAVIADO_CNPJ })}
- centrosCustoPermitidos: ${JSON.stringify(CENTROS_PERMITIDOS)}
- metasAtivas: ${JSON.stringify(ctx.metasAtivas)}
- rubricasAtivas: ${JSON.stringify(ctx.rubricasAtivas)}
- comprasCandidatas: ${JSON.stringify(ctx.comprasCandidatas)}
- documentosPossivelmenteDuplicados: ${JSON.stringify(ctx.duplicados)}
- dadosXMLRaw: ${JSON.stringify(ctx.dadosXMLRaw)}
- contextoIntake: ${JSON.stringify(ctx.contextoIntake)}

Responda APENAS com JSON aderente ao schema fornecido. Não inclua texto fora do JSON.`;
}

// ─── Carregamento de contexto ─────────────────────────────────
async function carregarContexto(base44, intake) {
  const svc = base44.asServiceRole;
  const rubricas = await (async () => {
    let a = []; let skip = 0;
    while (true) {
      const b = await svc.entities.Rubrica.list('ordem_exibicao', 200, skip);
      if (!b || !b.length) break;
      a = a.concat(b);
      skip += 200;
      if (b.length < 200) break;
    }
    return a.filter((r) => r && r.ativo !== false);
  })();
  const rubricasRelevantes = rubricas.map((r) => ({
    id: r.id,
    nome: r.rubrica || r.nome || r.item_rubrica,
    codigo: r.codigo || r.numero_natureza || null,
    natureza_despesa: r.natureza_despesa || null,
    grupo: r.grupo || null,
    centrocusto: r.centro_custo || r.museu_codigo || null,
    escopo_orcamentario: r.escopo_orcamentario || null,
    meta_manual_ids: r.meta_manual_ids || [],
    valor_total: r.valor_rubrica || r.valor_total || 0,
  }));
  const metas = await (async () => {
    let a = []; let skip = 0;
    while (true) {
      const b = await svc.entities.ProjectMeta.list('ordem', 200, skip);
      if (!b || !b.length) break;
      a = a.concat(b);
      skip += 200;
      if (b.length < 200) break;
    }
    return a.filter((m) => m && m.ativo !== false);
  })();
  const metasRelevantes = metas.map((m) => ({
    id: m.id,
    nome: m.nome,
    descricao_curta: (m.descricao || '').slice(0, 140),
    ordem: m.ordem,
  }));
  const cnpj = onlyDigits(intake?.fornecedor_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || '');
  const filtroCompra = cnpj ? { fornecedor_cnpj: cnpj } : {};
  let compras = [];
  try { compras = await svc.entities.PurchaseRequest.filter(filtroCompra, '-created_date', 80); }
  catch (e) { console.warn('[lerNF] Filtro PurchaseRequest falhou:', e.message); }
  if (!compras || !compras.length) {
    try { compras = await svc.entities.PurchaseRequest.filter({}, '-created_date', 80); } catch {}
  }
  const comprasCandidatas = (compras || []).map((p) => ({
    id: p.id,
    descricao_item: (p.descricao_item || '').slice(0, 200),
    fornecedor_nome: p.fornecedor_nome || null,
    fornecedor_cnpj: p.fornecedor_cnpj || null,
    valor_solicitado: p.valor_solicitado || null,
    valor_aprovado_admin: p.valor_aprovado_admin || null,
    nf_numero: p.nf_numero || null,
    nf_data_emissao: p.nf_data_emissao || null,
    centro_custo: p.centro_custo || null,
    meta_id: p.meta_id || null,
    rubrica_id: p.rubrica_id || null,
    rubrica_nome: p.rubrica_nome || null,
    natureza_despesa: p.natureza_despesa || null,
    status: p.status || null,
  }));
  let duplicados = [];
  if (intake?.nf_numero || cnpj || intake?.file_name_original) {
    try {
      const q = {};
      if (intake?.nf_numero) q.nf_numero = String(intake.nf_numero);
      duplicados = await svc.entities.DocumentIntake.filter(q, '-created_date', 30);
    } catch (e) {
      console.warn('[lerNF] Busca de duplicados falhou:', e.message);
      duplicados = [];
    }
  }
  const duplicadosRelevantes = (duplicados || [])
    .filter((d) => d && d.id !== intake?.id)
    .map((d) => ({
      id: d.id,
      file_name_original: d.file_name_original || null,
      nf_numero: d.nf_numero || null,
      nf_pdf_url: d.nf_pdf_url || null,
      nf_xml_url: d.nf_xml_url || null,
      fornecedor_cpf_cnpj: d.fornecedor_cpf_cnpj || d.nf_emitente_cpf_cnpj || null,
    }));
  return {
    rubricasAtivas: rubricasRelevantes,
    metasAtivas: metasRelevantes,
    comprasCandidatas: comprasCandidatas.slice(0, 40),
    duplicados: duplicadosRelevantes,
    _contadores: { rubricas: rubricas.length, metas: metas.length, compras: comprasCandidatas.length, duplicados: duplicadosRelevantes.length },
  };
}

// ─── Validação determinística pós-IA ───────────────────────────
function validarResultado(ia, ctx) {
  const alertas = Array.isArray(ia.alertas) ? [...ia.alertas] : [];
  const campos_incertos = Array.isArray(ia.campos_incertos) ? [...ia.campos_incertos] : [];
  let score = Number(ia.score) || 0;
  let status_revisao = ia.status_revisao || 'AGUARDANDO_REVISAO';
  const acao_recomendada = ia.acao_recomendada || null;
  if (ia.fornecedor_cnpj && !isValidCnpj(ia.fornecedor_cnpj)) {
    alertas.push('CNPJ do fornecedor informado pela IA é matematicamente inválido.');
    campos_incertos.push('fornecedor_cnpj');
    score = Math.max(0, score - 1);
  }
  if (ia.fornecedor_cpf && onlyDigits(ia.fornecedor_cpf).length !== 11) {
    alertas.push('CPF do fornecedor fora do padrão (deve ter 11 dígitos).');
    campos_incertos.push('fornecedor_cpf');
  }
  if (ia.data_emissao) {
    if (!isISODate(ia.data_emissao)) {
      alertas.push('Data de emissão fora do padrão YYYY-MM-DD após extração.');
      campos_incertos.push('data_emissao');
      score = Math.max(0, score - 2);
    } else {
      const d = new Date(ia.data_emissao + 'T12:00:00');
      const hoje = new Date();
      if (d > new Date(hoje.getTime() + 86400000)) {
        alertas.push('Data de emissão futura — bloqueada automaticamente, exige revisão.');
        campos_incertos.push('data_emissao');
        status_revisao = 'REVISAR';
      }
    }
  } else if (ia.documento_fiscal_valido) {
    alertas.push('Data de emissão da nota fiscal não identificada com segurança.');
    campos_incertos.push('data_emissao');
    status_revisao = 'REVISAR';
  }
  if (ia.documento_fiscal_valido && ia.valor_total != null && ia.valor_total === 0) {
    alertas.push('Valor total da nota igual a zero — exige revisão manual.');
    campos_incertos.push('valor_total');
  }
  let tomador_valido = ia.tomador_valido === true;
  if (ia.tomador_cnpj) {
    const t = onlyDigits(ia.tomador_cnpj);
    if (t && t !== TOMADOR_BENEFAVIADO_CNPJ) {
      tomador_valido = false;
      alertas.push('Tomador da nota fiscal não corresponde ao Viaduto das Artes (CNPJ 23.843.648/0001-25).');
      campos_incertos.push('tomador_cnpj');
    } else if (t === TOMADOR_BENEFAVIADO_CNPJ) {
      tomador_valido = true;
    }
  } else if (ia.documento_fiscal_valido) {
    alertas.push('Tomador da nota não identificado — valide manualmente contra Viaduto das Artes.');
    campos_incertos.push('tomador_cnpj');
  }
  if (ia.meta_id && !ctx.metasAtivas.some((m) => m.id === ia.meta_id)) {
    alertas.push('Meta ID retornado pela IA não existe no cadastro oficial de metas.');
    campos_incertos.push('meta_id');
    score = Math.max(0, score - 2);
  }
  let rubrica_ok = true;
  if (ia.rubrica_id && !ctx.rubricasAtivas.some((r) => r.id === ia.rubrica_id)) {
    alertas.push('Rubrica ID retornado pela IA não existe no cadastro oficial de rubricas.');
    campos_incertos.push('rubrica_id');
    rubrica_ok = false;
    score = Math.max(0, score - 2);
  }
  if (ia.centro_custo && !CENTROS_PERMITIDOS.includes(String(ia.centro_custo))) {
    alertas.push(`Centro de custo "${ia.centro_custo}" não está entre os valores permitidos ${CENTROS_PERMITIDOS.join(', ')}.`);
    campos_incertos.push('centro_custo');
  }
  if (ia.rubrica_id && ctx.rubricasAtivas) {
    const rub = ctx.rubricasAtivas.find((r) => r.id === ia.rubrica_id);
    if (rub && ia.meta_id && Array.isArray(rub.meta_manual_ids) && rub.meta_manual_ids.length && !rub.meta_manual_ids.includes(ia.meta_id)) {
      alertas.push('Rubrica selecionada não está vinculada manualmente à Meta informada no cadastro de rubricas.');
      campos_incertos.push('rubrica_id');
    }
  }
  if (ia.nota_cancelada) {
    status_revisao = 'BLOQUEADO';
    alertas.push('Nota cancelada identificada — bloqueada para pagamento.');
  }
  if (ia.duplicado && ia.tipo_documento !== 'COMPROVANTE' && ia.documento_principal_id) {
    status_revisao = 'BLOQUEADO';
    alertas.push('Documento fiscal marcado como duplicado de nota já existente — bloqueado, aguardar revisão humana.');
  }
  if (status_revisao !== 'BLOQUEADO') {
    if (campos_incertos.length >= 3) status_revisao = 'REVISAR';
    else if (score >= 9 && !campos_incertos.length && ia.nota_cancelada === false && tomador_valido && ia.documento_fiscal_valido) {
      status_revisao = 'PRE_APROVADO';
    } else if (score >= 7 && status_revisao === 'PRE_APROVADO') {
      status_revisao = 'AGUARDANDO_REVISAO';
    } else if (score < 7) {
      status_revisao = 'REVISAR';
    }
  }
  return {
    ...ia, rubrica_ok, tomador_valido, score, status_revisao, alertas, campos_incertos, acao_recomendada,
    validado_determinismo_em: new Date().toISOString(),
  };
}

// ─── Utilidades de conteúdo multimodal ───────────────────────
function bytesToDataURL(bytes, mime) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime || 'application/octet-stream'};base64,${btoa(binary)}`;
}
function detectFileType(name, mime) {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.xml') || mime === 'application/xml' || mime === 'text/xml') return 'xml';
  if (n.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (/\.(png|jpg|jpeg|webp|gif|heic|bmp|tiff?)$/.test(n) || String(mime || '').startsWith('image/')) return 'image';
  if (/\.(docx?|txt|csv|json?|html?|rtf|odt?)$/.test(n)) return 'document';
  return 'outro';
}

// ─── Laudo determinístico quando há apenas XML ────────────────
export function laudoSomenteXML(xml, ctx, fileName) {
  // Defensivo: se xml for null/undefined (parse falhou), devolve laudo mínimo.
  const x = xml && typeof xml === 'object' ? xml : {};
  const tipoDocumento = (fileName || '').toUpperCase().includes('NFSE') ? 'NFSE_PDF' : 'NF_XML';
  const score = 7;
  const evidencias = {
    numero_nota: x.nf_numero || null,
    data_emissao: x.nf_data_emissao || null,
    valor_total: x.nf_valor_total ? `R$ ${x.nf_valor_total.toFixed(2)}` : null,
    fornecedor_nome: x.nf_emitente_nome || null,
    tomador_cnpj: x.tomador_cnpj || null,
    rubrica_nome: null,
    meta_nome: null,
    centro_custo: null,
  };
  return {
    tipo_documento: tipoDocumento,
    documento_fiscal_valido: !!(x.nf_numero && (x.nf_emitente_cpf_cnpj || x.nf_emitente_nome)),
    criar_solicitacao_financeira: !!(x.nf_numero && x.nf_valor_total > 0),
    numero_nota: x.nf_numero || null,
    serie: x.nf_serie || null,
    chave_acesso: x.nf_chave_acesso || null,
    data_emissao: x.nf_data_emissao || null,
    data_competencia: x.competencia || null,
    data_vencimento: null,
    fornecedor_nome: x.nf_emitente_nome || null,
    fornecedor_cnpj: onlyDigits(x.nf_emitente_cpf_cnpj).length === 14 ? x.nf_emitente_cpf_cnpj : null,
    fornecedor_cpf: onlyDigits(x.nf_emitente_cpf_cnpj).length === 11 ? x.nf_emitente_cpf_cnpj : null,
    fornecedor_inscricao_municipal: null,
    tomador_nome: x.tomador_nome || null,
    tomador_cnpj: x.tomador_cnpj || null,
    tomador_valido: (onlyDigits(x.tomador_cnpj) === TOMADOR_BENEFAVIADO_CNPJ),
    descricao_original: x.descricao_servico || null,
    descricao_normalizada: null,
    valor_servicos: x.nf_valor_total || null,
    valor_produtos: null,
    valor_total: x.nf_valor_total || null,
    valor_liquido: x.nf_valor_liquido || null,
    iss: x.iss || null,
    inss: x.inss || null,
    irrf: x.irrf || null,
    csll: x.csll || null,
    cofins: x.cofins || null,
    pis: x.pis || null,
    outras_retencoes: null,
    municipio_emissao: x.municipio || null,
    codigo_servico_municipal: x.codigo_servico || null,
    cnae: x.cnae || null,
    nota_cancelada: false,
    motivo_cancelamento: null,
    projeto: 'MUSEUS CENTRO',
    centro_custo: null,
    meta_id: null,
    meta_numero: null,
    meta_nome: null,
    meta_confianca: null,
    rubrica_id: null,
    rubrica_nome: null,
    codigo_rubrica: null,
    natureza_despesa: null,
    aditivo: null,
    compra_id: null,
    duplicado: false,
    documento_principal_id: null,
    acao_recomendada: null,
    score,
    status_revisao: 'AGUARDANDO_REVISAO',
    campos_incertos: ['centro_custo', 'rubrica_id', 'meta_id', 'descricao_normalizada'],
    alertas: ['Análise baseada apenas em XML — associação de rubrica/meta requer leitura do PDF ou do contexto da compra.'],
    evidencias,
    rubrica_candidatas_incertas: [],
  };
}

// ─── Função principal (exportada) ────────────────────────────
// Retorna { ok, resultado, contexto_contadores, processado_em, intake_id, error, http_status }
export async function analisarNotaFiscal(base44, options) {
  const { intake_id, file_url, file_name, mime_type, xml_url, contexto = {} } = options;
  let intake = null;
  let fileUrl = file_url;
  let fileName = file_name;
  let mimeType = mime_type;
  let xmlUrl = xml_url;

  if (intake_id) {
    try {
      intake = await base44.asServiceRole.entities.DocumentIntake.get(intake_id);
    } catch (e) {
      return { ok: false, error: 'Intake não encontrado: ' + e.message, http_status: 404 };
    }
    if (!intake) return { ok: false, error: 'Intake não encontrado', http_status: 404 };
    fileUrl = intake.arquivo_original_url || intake.nf_pdf_url || fileUrl;
    fileName = intake.file_name_original || intake.file_name_final || fileName;
    mimeType = intake.mime_type || mimeType;
    xmlUrl = intake.nf_xml_url || xmlUrl;
  }
  if (!fileUrl && !xmlUrl && !contexto?.xml_text) {
    return { ok: false, error: 'file_url ou intake_id é obrigatório.', http_status: 400 };
  }

  const ctx = await carregarContexto(base44, intake);

  let dadosXMLRaw = null;
  if (xmlUrl) {
    try {
      const xmlText = await fetchText(xmlUrl).catch(() => null);
      if (xmlText && xmlText.includes('<')) dadosXMLRaw = parseXmlRaw(xmlText);
    } catch (e) { console.warn('[lerNF] XML parse falhou:', e.message); }
  }
  if (!dadosXMLRaw && contexto.xml_text && contexto.xml_text.includes('<')) {
    dadosXMLRaw = parseXmlRaw(contexto.xml_text);
  }

  const tipoArq = detectFileType(fileName, mimeType);
  const userParts = [];
  if (dadosXMLRaw) {
    userParts.push({ type: 'text', text: `XML fiscal pré-extraído (fonte primária, priorizar sobre qualquer PDF): ${JSON.stringify(dadosXMLRaw)}` });
  }
  if (intake) {
    const contextoResumido = {
      file_name_original: intake.file_name_original,
      file_name_final: intake.file_name_final,
      nf_numero: intake.nf_numero || null,
      nf_emitente_cpf_cnpj: intake.nf_emitente_cpf_cnpj || null,
      fornecedor_cpf_cnpj: intake.fornecedor_cpf_cnpj || null,
      fornecedor_id: intake.fornecedor_id || null,
      fornecedor_nome: intake.fornecedor_nome || null,
      centro_custo: intake.centro_custo || null,
      municipio: intake.municipio || null,
      rubrica_id_sugerida: intake.rubrica_id_sugerida || null,
      rubrica_nome_sugerida: intake.rubrica_nome_sugerida || null,
    };
    userParts.push({ type: 'text', text: `contextoIntake: ${JSON.stringify(contextoResumido)}` });
  }
  if (contexto.descricao_item) {
    userParts.push({ type: 'text', text: `Descrição fornecida pelo usuário: ${contexto.descricao_item}` });
  }

  let ia;
  if (tipoArq === 'xml' || (!fileUrl && dadosXMLRaw)) {
    ia = laudoSomenteXML(dadosXMLRaw, ctx, fileName);
  } else if (tipoArq === 'pdf' || tipoArq === 'image' || tipoArq === 'document') {
    let bytes;
    try {
      bytes = await resolverDownload(base44, fileUrl);
    } catch (e) {
      if (dadosXMLRaw) {
        ia = laudoSomenteXML(dadosXMLRaw, ctx, fileName);
      } else {
        return { ok: false, error: 'Falha no download: ' + e.message, http_status: 502 };
      }
    }
    if (bytes && !ia) {
      if (bytes.length > 25 * 1024 * 1024) {
        return { ok: false, error: 'Arquivo excede 25MB.', http_status: 413 };
      }
      if (tipoArq === 'pdf') {
        try {
          const fileId = await uploadToOpenAIFiles(bytes, fileName || 'nf.pdf', 'application/pdf');
          userParts.push({ type: 'file', file: { file_id: fileId } });
        } catch (e) {
          return { ok: false, error: 'Falha upload Files API: ' + e.message, http_status: 502 };
        }
      } else if (tipoArq === 'image') {
        userParts.push({ type: 'image_url', image_url: { url: bytesToDataURL(bytes, mimeType || 'image/jpeg'), detail: 'high' } });
      } else {
        try {
          const texto = new TextDecoder('utf-8').decode(bytes).slice(0, 30000);
          userParts.push({ type: 'text', text: `Conteúdo textual extraído do arquivo: ${texto}` });
        } catch {
          return { ok: false, error: 'Tipo de arquivo não suportado para análise.', http_status: 415 };
        }
      }
      const systemPrompt = buildSystemPrompt({
        ...ctx,
        dadosXMLRaw,
        contextoIntake: { file_name: fileName, mime_type: mimeType },
      });
      try {
        ia = await invokeGPTStructured({ systemPrompt, userParts, schema: RESPONSE_SCHEMA });
      } catch (e) {
        if (dadosXMLRaw) {
          ia = laudoSomenteXML(dadosXMLRaw, { ...ctx, dadosXMLRaw, contextoIntake: { file_name: fileName, mime_type: mimeType } }, fileName);
          ia.alertas = (ia.alertas || []).concat(`Análise via IA falhou (${e.message}); resultado baseado apenas em XML estruturado.`);
        } else {
          return { ok: false, error: 'Falha na análise GPT: ' + e.message, http_status: 502 };
        }
      }
    }
  } else {
    if (dadosXMLRaw) {
      ia = laudoSomenteXML(dadosXMLRaw, ctx, fileName);
    } else {
      return { ok: false, error: 'Não há arquivo nem XML válidos para análise.', http_status: 400 };
    }
  }

  const contextoFinal = {
    ...ctx,
    dadosXMLRaw,
    contextoIntake: { file_name: fileName, mime_type: mimeType, ...contexto },
  };
  const validado = validarResultado(ia, contextoFinal);

  try {
    await base44.asServiceRole.entities.AIUsageLog.create({
      task_type: 'ler_nota_fiscal_gpt',
      model_used: OPENAI_MODEL,
      user_email: options.user_email || 'service_role',
      feature: options.feature || 'leitura_profunda_nf',
      duration_ms: 0,
      error: validado.alertas && validado.alertas.length ? validado.alertas.join('; ').slice(0, 500) : null,
    });
  } catch (e) { console.warn('[lerNF] Falha ao gravar AIUsageLog:', e.message); }

  return {
    ok: true,
    resultado: validado,
    contexto_contadores: ctx._contadores,
    processado_em: new Date().toISOString(),
    intake_id: intake?.id || null,
  };
}

export const constants = {
  OPENAI_MODEL,
  TOMADOR_BENEFAVIADO_NOME,
  TOMADOR_BENEFAVIADO_CNPJ,
  CENTROS_PERMITIDOS,
};