import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── OPENAI GPT-4o (único modelo de IA permitido) ──
async function invokeOpenAI({ prompt, fileUrls = [], jsonSchema = null, model = 'gpt-4o', maxTokens = 4096 }: any): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const userContent: any[] = [{ type: 'text', text: prompt }];
  for (const url of fileUrls) { if (url) userContent.push({ type: 'image_url', image_url: { url, detail: 'high' } }); }
  const body: any = {
    model,
    messages: [{ role: 'user', content: userContent.length === 1 ? userContent[0].text : userContent }],
    max_tokens: maxTokens,
    temperature: 0.2,
  };
  if (jsonSchema) body.response_format = { type: 'json_object' };
  let lastErr: any;
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!resp.ok) { const t = await resp.text().catch(() => resp.statusText); throw new Error(`OpenAI ${resp.status}: ${t}`); }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage;
      if (usage) console.log(`[analisarDocs] model=${model} in=${usage.prompt_tokens} out=${usage.completion_tokens}`);
      if (jsonSchema) { try { return JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } }
      return content;
    } catch (e: any) { lastErr = e; if (i === 0) { console.warn('[analisarDocs] retry:', e.message); await new Promise(r => setTimeout(r, 2000)); } }
  }
  throw lastErr;
}

// ── UTILS ──
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');
const safeStr = (v) => String(v || '').trim();
const norm = (v) => safeStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function parseValorBR(v) {
  const raw = String(v || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(',', '.')) || 0;
}

function CONFIANCA(origem) {
  const map = { xml: 99, ia_xml: 95, pdf_texto: 90, ia_pdf: 80, ia_ocr: 65, cadastro: 85, filename: 20, inferencia: 50, complementar: 60 };
  return map[origem] || 40;
}

// ── PARSE DE XML RAW (fallback sem IA) ──
async function parseXmlRaw(url) {
  try {
    const res = await fetch(url);
    const xml = await res.text();
    const tag = (regex) => { const m = xml.match(regex); return (m?.[1] || '').trim(); };
    return {
      nf_emitente_cpf_cnpj: onlyDigits(tag(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i) || tag(/<CPF[^>]*>(\d+)<\/CPF>/i)),
      nf_emitente_nome: tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i),
      nf_numero: onlyDigits(tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i)),
      nf_valor_total: parseValorBR(tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i)),
      nf_valor_liquido: parseValorBR(tag(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i) || tag(/<vLiq[^>]*>([\d.,]+)<\/vLiq>/i) || tag(/<vLiquido[^>]*>([\d.,]+)<\/vLiquido>/i) || tag(/<ValorLiquido[^>]*>([\d.,]+)<\/ValorLiquido>/i)),
      nf_data_emissao: (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i)).slice(0,10),
      nf_chave_acesso: tag(/<chNFe[^>]*>(\d{44})<\/chNFe>/i) || tag(/<ChaveAcesso[^>]*>(\d+)<\/ChaveAcesso>/i),
      competencia: tag(/<Competencia[^>]*>([^<]+)<\/Competencia>/i),
      municipio: tag(/<xMun[^>]*>([^<]+)<\/xMun>/i) || tag(/<Municipio[^>]*>([^<]+)<\/Municipio>/i),
      dados_bancarios: tag(/<banco[^>]*>([^<]+)<\/banco>/i) + ' ' + tag(/<agencia[^>]*>([^<]+)<\/agencia>/i) + ' ' + tag(/<conta[^>]*>([^<]+)<\/conta>/i),
      chave_pix: tag(/<PIX[^>]*>([^<]+)<\/PIX>/i) || tag(/<chavePIX[^>]*>([^<]+)<\/chavePIX>/i),
    };
  } catch { return {}; }
}

function getFileExt(url, name) {
  const n = (name || url || '').toLowerCase();
  if (n.endsWith('.xml')) return 'xml';
  if (n.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpg|jpeg|webp|heic|gif)/.test(n)) return 'imagem';
  return 'outro';
}

// ── CROSS-REFERENCE ENTITIES ──
async function carregarContexto(base44) {
  const svc = base44.asServiceRole;
  const [rubricas, metas, museus, fornecedores] = await Promise.all([
    (async () => { let a=[]; let s=0; while(1){const b=await svc.entities.Rubrica.list('ordem_exibicao',200,s); if(!b||!b.length) break; a.push(...b); s+=200; if(b.length<200) break; } return a.filter(r=>r?.ativo!==false); })(),
    (async () => { const m=await svc.entities.ProjectMeta.list('ordem',100); return (m||[]).filter(x=>x?.ativo!==false); })(),
    (async () => { const m=await svc.entities.Museu.list('nome',50); return m||[]; })(),
    (async () => { const f=await svc.entities.Fornecedor.list('-created_date',200); return f||[]; })(),
  ]);
  return { rubricas, metas, museus, fornecedores };
}

function sugerirMeta(descricao, fornecedor, metas) {
  const texto = norm(`${descricao} ${fornecedor}`);
  if (!texto || !metas.length) return null;
  const ranked = metas.map(m => {
    const t = norm(`${m.nome} ${m.descricao||''}`);
    const words = texto.split(/\s+/).filter(w=>w.length>2);
    const hits = words.filter(w=>t.includes(w)).length;
    return { meta: m, score: hits / Math.max(words.length,1) };
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return ranked[0] ? { nome: ranked[0].meta.nome, score: Math.round(ranked[0].score*100), origem: 'inferencia' } : null;
}

function sugerirCentroCusto(descricao, museuNome, rubrica) {
  const t = norm(`${descricao} ${museuNome||''} ${rubrica?.museu_codigo||''} ${rubrica?.escopo_orcamentario||''}`);
  if (rubrica?.escopo_orcamentario==='NOTURNO') return 'Noturno nos Museus 2026';
  if (rubrica?.museu_codigo==='MIS') return 'MIS';
  if (rubrica?.museu_codigo==='MUMO') return 'MUMO';
  if (rubrica?.museu_codigo==='MHAB') return 'MHAB';
  if (/mis\b/.test(t)) return 'MIS';
  if (/mumo/.test(t)) return 'MUMO';
  if (/mhab|mab/.test(t)) return 'MHAB';
  if (/noturno/.test(t)) return /pampulha/.test(t) ? 'Noturno Pampulha' : 'Noturno nos Museus 2026';
  if (/publica[cç]/.test(t)) return 'Publicações';
  return 'Geral';
}

function sugerirRubrica(descricao, fornecedor, centro, rubricas) {
  if (!descricao || !rubricas.length) return null;
  const texto = norm(`${descricao} ${fornecedor}`);
  
  // Heurísticas
  const hints = [
    { keys: ['lanche','cafe','buffet','alimentacao','coffee','coffeebreak'], grupo: 'lanche' },
    { keys: ['transporte','van','taxi','uber','frete','carreto','motorista'], grupo: 'transporte' },
    { keys: ['designer','video','foto','imprensa','grafica','impressao','social media','rede social','comunicacao'], grupo: 'comunicacao' },
    { keys: ['material','consumo','epi','insumo','escritorio','papel'], grupo: 'material' },
    { keys: ['oficina','palestra','consultoria','facilitador','formacao','acessibilidade'], grupo: 'consultoria' },
    { keys: ['seguranca','limpeza','brigadista','porteiro'], grupo: 'seguranca' },
  ];
  
  const validas = rubricas.filter(r=>{
    const cc = String(centro||'').toUpperCase();
    const rc = String(r.museu_codigo||'').toUpperCase();
    if (cc==='NOTURNO NOS MUSEUS 2026') return r.escopo_orcamentario==='NOTURNO';
    if (['MIS','MUMO','MHAB'].includes(cc)) return rc===cc || rc==='GERAL';
    return true;
  });
  
  for (const hint of hints) {
    if (!hint.keys.some(k=>texto.includes(k))) continue;
    const match = validas.find(r=>norm(r.rubrica||r.nome).includes(hint.grupo));
    if (match) return { id: match.id, nome: match.rubrica||match.nome, score: 85, origem: 'heuristica' };
  }
  
  // Similaridade textual
  const tokens = texto.split(/[^a-z0-9]+/).filter(t=>t.length>=3);
  const ranked = validas.map(r=>{
    const rt = norm(`${r.rubrica||''} ${r.nome||''} ${r.grupo||''} ${r.descricao||''}`).split(/[^a-z0-9]+/).filter(t=>t.length>=3);
    const hits = tokens.filter(t=>rt.includes(t)).length;
    return { r, score: hits/Math.max(tokens.length,1) };
  }).sort((a,b)=>b.score-a.score);
  
  if (ranked[0]?.score>=0.3) return { id: ranked[0].r.id, nome: ranked[0].r.rubrica||ranked[0].r.nome, score: Math.round(ranked[0].score*100), origem: 'similaridade' };
  return null;
}

function sugerirCategoria(descricao) {
  const t = norm(descricao||'');
  if (/design|video|foto|imprensa|grafic|social|comunicacao|redes/.test(t)) return 'Serviços (comunicação: designer, foto, vídeo, imprensa, redes)';
  if (/transporte|van|taxi|uber|frete|carreto/.test(t)) return 'Logística (transporte/vans)';
  if (/lanche|cafe|buffet|alimentacao|coffee/.test(t)) return 'Alimentação (lanche/café/coffeebreak)';
  if (/material|consumo|insumo|escritorio/.test(t)) return 'Materiais de consumo';
  if (/consultoria|formacao|acessibilidade|palestra|oficina/.test(t)) return 'Consultoria / Formação / Acessibilidade';
  if (/seguranca|limpeza|brigadista/.test(t)) return 'Serviços (segurança/limpeza)';
  if (/evento|artista|atracao|show|apresentacao/.test(t)) return 'Serviços (eventos/atrações/artistas)';
  if (/producao|infra|expografia|montagem/.test(t)) return 'Serviços (produção/infraestrutura/expografia)';
  if (/equipe|coordenacao|admin|financeiro|gestao/.test(t)) return 'Serviços (equipe/coordenação)';
  return 'Outros';
}

// ── HANDLER PRINCIPAL ──
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { 
      file_urls = [],        // URLs dos arquivos para analisar
      campos_confirmados = {}, // { campo: true } — campos que o usuário já confirmou
      contexto = {},          // dados existentes do formulário (opcional)
      modo = 'completo',      // 'completo' | 'extrair_apenas' | 'sugerir_apenas'
    } = body;

    // Coletar URLs de várias fontes
    const urls = [];
    const addUrl = (u) => { if (u && typeof u === 'string' && u.startsWith('http')) urls.push(u); };
    for (const u of (Array.isArray(file_urls) ? file_urls : [])) addUrl(u);
    addUrl(contexto.nf_pdf_url);
    addUrl(contexto.nota_fiscal_url);
    addUrl(contexto.arquivo_url);
    addUrl(contexto.file_url);
    addUrl(contexto.documento_url);
    addUrl(contexto.orcamento_url);
    addUrl(contexto.comprovante_url);
    addUrl(contexto.nf_xml_url);
    const uniqueUrls = [...new Set(urls)];

    const resultado = {
      campos: {},        // { campo: { valor, origem, confianca, estado } }
      resumo: { preenchidos: 0, sugeridos: 0, nao_localizados: 0 },
      erros: [],
      duplicidade: null,
    };

    if (!uniqueUrls.length) {
      // Sem arquivos — apenas sugerir com base no contexto textual
      if (modo === 'extrair_apenas') {
        return Response.json({ ...resultado, resumo: { preenchidos:0, sugeridos:0, nao_localizados:0 } });
      }
    }

    // Carregar contexto do sistema
    const ctx = await carregarContexto(base44);

    // ── FASE 1: EXTRAIR DADOS BRUTOS DE CADA ARQUIVO ──
    let dadosXML = {};
    let descricaoGeral = safeStr(contexto.descricao_item || contexto.descricao || '');
    
    for (const url of uniqueUrls) {
      const ext = getFileExt(url, '');
      
      if (ext === 'xml') {
        // Parse XML raw primeiro
        const xmlRaw = await parseXmlRaw(url);
        dadosXML = { ...dadosXML, ...xmlRaw };
        // Se o XML tem CNPJ + NF + valor, usar como fonte primária
        if (xmlRaw.nf_emitente_cpf_cnpj || xmlRaw.nf_numero) {
          const campo = (k, v, o) => { if (v) resultado.campos[k] = { valor: v, origem: o||'xml', confianca: CONFIANCA('xml'), estado: 'preenchido_ia' }; };
          campo('fornecedor_cpf_cnpj', xmlRaw.nf_emitente_cpf_cnpj);
          campo('fornecedor_nome', xmlRaw.nf_emitente_nome);
          campo('nf_numero', xmlRaw.nf_numero);
          campo('nf_valor_total', xmlRaw.nf_valor_total);
          campo('nf_valor_liquido', xmlRaw.nf_valor_liquido);
          campo('nf_data_emissao', xmlRaw.nf_data_emissao);
          campo('nf_chave_acesso', xmlRaw.nf_chave_acesso);
          campo('dados_bancarios', xmlRaw.dados_bancarios?.trim());
          campo('chave_pix', xmlRaw.chave_pix);
          campo('descricao_servico', xmlRaw.competencia);
          if (xmlRaw.competencia) campo('competencia', xmlRaw.competencia);
        }
      }
    }

    // ── FASE 2: ANÁLISE COM IA (se houver PDF ou múltiplos arquivos) ──
    const temPDF = uniqueUrls.some(u => getFileExt(u, '') === 'pdf');
    const temImagem = uniqueUrls.some(u => getFileExt(u, '') === 'imagem');
    
    // Gemini preferencial (visão) via Service Account, fallback OpenAI GPT-4o
    async function invokeVisionLLM({ prompt, fileUrls, jsonSchema = null, maxTokens = 4096, geminiModel = 'gemini-2.5-flash' }) {
      if (Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')) {
        try {
          const res = await base44.functions.invoke('callGemini', { prompt, fileUrls, jsonSchema, maxTokens, model: geminiModel });
          const data = res?.data || res;
          if (data?.ok === false) throw new Error(data?.error || 'Gemini falhou');
          return data?.result ?? data;
        } catch (geminiErr) {
          console.warn('[analisarDocs] Gemini falhou, caindo em OpenAI:', String(geminiErr?.message || geminiErr));
        }
      }
      return invokeOpenAI({ prompt, fileUrls, jsonSchema, model: 'gpt-4o', maxTokens });
    }

    if ((temPDF || temImagem || uniqueUrls.length > 1) && modo !== 'sugerir_apenas') {
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        const ia = await invokeVisionLLM({
          prompt: `Você é um especialista em documentos fiscais e administrativos brasileiros. Analise TODOS os arquivos anexados e extraia CADA campo abaixo.

INSTRUÇÕES CRÍTICAS:
- Leia TODAS as páginas de cada PDF. Não pule nenhuma página.
- Se houver XML e PDF, PREFIRA os dados do XML (é a fonte oficial).
- Se houver COMPROVANTE DE PAGAMENTO / RECIBO, extraia dele o VALOR LÍQUIDO efetivamente pago (campo nf_valor_liquido). Este valor pode ser menor que o valor total da NF devido a retenções.
- Extraia TODOS os campos, mesmo que parcialmente visíveis.
- NÃO DEIXE CAMPOS EM BRANCO se o dado existir no documento.
- Para dados bancários, procure em TODAS as páginas: banco, agência, conta, PIX.
- O CPF/CNPJ do EMITENTE (fornecedor) é OBRIGATÓRIO.
- O valor total é OBRIGATÓRIO.

Dados já extraídos do XML (se houver): ${JSON.stringify(dadosXML)}
Contexto adicional: ${JSON.stringify({ descricao: descricaoGeral, fornecedor: contexto.fornecedor_nome })}
Data atual: ${hoje}

Responda APENAS com JSON válido contendo os campos: tipo_documento, descricao_servico, fornecedor_nome, fornecedor_cpf_cnpj, nf_numero, nf_data_emissao, nf_horario_emissao, nf_valor_total (number), nf_valor_liquido (number), nf_retencoes (number), nf_chave_acesso, competencia, municipio, dados_bancarios, chave_pix, meio_pagamento, observacoes, contrato_numero, museu_identificado, atividade_identificada, projeto_identificado.`,
          fileUrls: uniqueUrls,
          jsonSchema: true,
          model: 'gpt-4o',
          maxTokens: 4096,
        });

        // Mesclar dados do XML (prioridade) com IA
        const merge = (campo, valorIA, valorXML, origemIA) => {
          if (valorXML && !campos_confirmados[campo]) {
            resultado.campos[campo] = { valor: valorXML, origem: 'xml', confianca: CONFIANCA('xml'), estado: 'preenchido_ia' };
          } else if (valorIA && !campos_confirmados[campo] && !resultado.campos[campo]) {
            resultado.campos[campo] = { valor: valorIA, origem: origemIA || 'ia_pdf', confianca: CONFIANCA(origemIA||'ia_pdf'), estado: 'preenchido_ia' };
          }
        };

        merge('descricao_servico', ia.descricao_servico, dadosXML.descricao_servico);
        merge('fornecedor_nome', ia.fornecedor_nome, dadosXML.nf_emitente_nome);
        merge('fornecedor_cpf_cnpj', ia.fornecedor_cpf_cnpj, dadosXML.nf_emitente_cpf_cnpj);
        merge('nf_numero', ia.nf_numero, dadosXML.nf_numero);
        merge('nf_data_emissao', ia.nf_data_emissao, dadosXML.nf_data_emissao);
        merge('nf_valor_total', ia.nf_valor_total, dadosXML.nf_valor_total);
        merge('nf_chave_acesso', ia.nf_chave_acesso, dadosXML.nf_chave_acesso);
        merge('competencia', ia.competencia, dadosXML.competencia);
        merge('dados_bancarios', ia.dados_bancarios, dadosXML.dados_bancarios);
        merge('chave_pix', ia.chave_pix, dadosXML.chave_pix);
        merge('meio_pagamento', ia.meio_pagamento);
        merge('observacoes', ia.observacoes);
        merge('municipio', ia.municipio, dadosXML.municipio);
        merge('contrato_numero', ia.contrato_numero);
        merge('museu_identificado', ia.museu_identificado);
        // Valor líquido: prioridade = XML (vLiquidoNfse) > IA > diferença (total - retenções)
        if (!resultado.campos.nf_valor_liquido && !campos_confirmados.nf_valor_liquido) {
          const liqXML = dadosXML.nf_valor_liquido;
          const liqIA = ia.nf_valor_liquido;
          const retencoes = ia.nf_retencoes || 0;
          const total = dadosXML.nf_valor_total || ia.nf_valor_total || 0;
          if (liqXML) {
            resultado.campos.nf_valor_liquido = { valor: liqXML, origem: 'xml', confianca: CONFIANCA('xml'), estado: 'preenchido_ia' };
          } else if (liqIA) {
            resultado.campos.nf_valor_liquido = { valor: liqIA, origem: 'ia_pdf', confianca: CONFIANCA('ia_pdf'), estado: 'preenchido_ia' };
          } else if (total && retencoes) {
            resultado.campos.nf_valor_liquido = { valor: total - retencoes, origem: 'complementar', confianca: CONFIANCA('complementar'), estado: 'sugerido_ia' };
          }
        }
        if (!resultado.campos.nf_retencoes && ia.nf_retencoes && !campos_confirmados.nf_retencoes) {
          resultado.campos.nf_retencoes = { valor: ia.nf_retencoes, origem: 'ia_pdf', confianca: CONFIANCA('ia_pdf'), estado: 'preenchido_ia' };
        }
      } catch (e) {
        resultado.erros.push(`Análise IA falhou: ${e.message}`);
      }
    }

    // ── FASE 3: CRUZAR COM ENTIDADES E SUGERIR ──
    if (modo !== 'extrair_apenas') {
      const descricao = safeStr(resultado.campos.descricao_servico?.valor || descricaoGeral);
      const fornecedor = safeStr(resultado.campos.fornecedor_nome?.valor || contexto.fornecedor_nome || '');
      const cnpjDados = safeStr(resultado.campos.fornecedor_cpf_cnpj?.valor || '');

      // Buscar fornecedor no cadastro
      if (cnpjDados && ctx.fornecedores.length) {
        const found = ctx.fornecedores.find(f => 
          onlyDigits(f.cpf_cnpj||f.cnpj||f.cpf||'') === onlyDigits(cnpjDados) ||
          norm(f.nome||f.razao_social||'') === norm(fornecedor)
        );
        if (found && !campos_confirmados.fornecedor_cpf_cnpj) {
          resultado.campos.fornecedor_cpf_cnpj = { valor: found.cpf_cnpj||found.cnpj||cnpjDados, origem: 'cadastro', confianca: CONFIANCA('cadastro'), estado: 'preenchido_ia' };
          if (!resultado.campos.fornecedor_nome) {
            resultado.campos.fornecedor_nome = { valor: found.nome||found.razao_social||fornecedor, origem: 'cadastro', confianca: CONFIANCA('cadastro'), estado: 'preenchido_ia' };
          }
          if (!resultado.campos.dados_bancarios && (found.banco||found.dados_bancarios)) {
            resultado.campos.dados_bancarios = { valor: found.dados_bancarios||`${found.banco||''} ${found.agencia||''} ${found.conta||''}`.trim(), origem: 'cadastro', confianca: CONFIANCA('cadastro'), estado: 'preenchido_ia' };
          }
          if (!resultado.campos.chave_pix && found.pix) {
            resultado.campos.chave_pix = { valor: found.pix, origem: 'cadastro', confianca: CONFIANCA('cadastro'), estado: 'preenchido_ia' };
          }
        }
      }

      // Sugerir categoria
      if (!resultado.campos.categoria && !campos_confirmados.categoria) {
        const cat = sugerirCategoria(descricao);
        if (cat) resultado.campos.categoria = { valor: cat, origem: 'inferencia', confianca: CONFIANCA('inferencia'), estado: 'sugerido_ia' };
      }

      // Sugerir centro de custo
      if (!resultado.campos.centro_custo && !campos_confirmados.centro_custo) {
        const museuNome = safeStr(resultado.campos.museu_identificado?.valor || '');
        const cc = sugerirCentroCusto(descricao, museuNome, null);
        resultado.campos.centro_custo = { valor: cc, origem: 'inferencia', confianca: CONFIANCA('inferencia'), estado: 'sugerido_ia' };
      }

      const centroSel = safeStr(resultado.campos.centro_custo?.valor || contexto.centro_custo || '');

      // Sugerir rubrica
      if (!resultado.campos.rubrica && !campos_confirmados.rubrica) {
        const rub = sugerirRubrica(descricao, fornecedor, centroSel, ctx.rubricas);
        if (rub) {
          resultado.campos.rubrica = { valor: { id: rub.id, nome: rub.nome }, origem: rub.origem, confianca: Math.min(rub.score, 90), estado: 'sugerido_ia' };
          // Se rubrica tem museu_codigo, já define centro
          const rFull = ctx.rubricas.find(r=>r.id===rub.id);
          if (rFull?.museu_codigo && rFull.museu_codigo!=='GERAL' && !campos_confirmados.centro_custo) {
            const map = {MIS:'MIS',MUMO:'MUMO',MHAB:'MHAB'};
            if (map[rFull.museu_codigo]) resultado.campos.centro_custo = { valor: map[rFull.museu_codigo], origem: 'rubrica', confianca: 85, estado: 'sugerido_ia' };
          }
          if (rFull?.escopo_orcamentario==='NOTURNO' && !campos_confirmados.centro_custo) {
            resultado.campos.centro_custo = { valor: 'Noturno nos Museus 2026', origem: 'rubrica', confianca: 85, estado: 'sugerido_ia' };
          }
        }
      }

      // Sugerir meta
      if (!resultado.campos.meta && !campos_confirmados.meta) {
        const meta = sugerirMeta(descricao, fornecedor, ctx.metas);
        if (meta) resultado.campos.meta = { valor: meta.nome, origem: meta.origem, confianca: Math.min(meta.score, 85), estado: 'sugerido_ia' };
      }

      // Sugerir tipo_gasto
      if (!resultado.campos.tipo_gasto && !campos_confirmados.tipo_gasto) {
        resultado.campos.tipo_gasto = { valor: 'Serviço', origem: 'inferencia', confianca: 70, estado: 'sugerido_ia' };
      }
    }

    // ── FASE 4: MONTAR RESUMO ──
    let preenchidos = 0, sugeridos = 0, naoLocalizados = 0;
    const camposEsperados = [
      'fornecedor_nome','fornecedor_cpf_cnpj','nf_numero','nf_valor_total',
      'nf_data_emissao','descricao_servico','centro_custo','categoria',
      'tipo_gasto','rubrica','meta','meio_pagamento','dados_bancarios'
    ];
    for (const c of camposEsperados) {
      const campo = resultado.campos[c];
      if (!campo || !campo.valor) naoLocalizados++;
      else if (campo.estado === 'preenchido_ia') preenchidos++;
      else if (campo.estado === 'sugerido_ia') sugeridos++;
      else preenchidos++;
    }
    resultado.resumo = { preenchidos, sugeridos, nao_localizados: Math.max(0, naoLocalizados - sugeridos) };

    return Response.json(resultado);
  } catch (error) {
    console.error('analisarDocumentosUnificado error:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});