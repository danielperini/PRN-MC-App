import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ================================================================
// auditSincPastaNFs — Audit + sincronização da pasta principal de NFs do Drive.
//
// Pasta alvo: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp
//   1. mode='scan':       Varre a pasta recursivamente (型号 depth=3), baixa XMLs,
//                          extrai campos via parser XML, agrupa por mês de emissão e
//                          cruza com PurchaseRequests no banco (por nf_numero).
//   2. mode='tratar_lote': Recebe file_ids (<=20). Para cada um, baixa+parseia XML,
//                          encontra (por número NF+CNPJ+valor) ou cria PurchaseRequest,
//                          preenche campos faltantes via IA (rubrica/meta/centro_custo),
//                          e marca PAGO+data_pagamento_efetivo se data < '2026-07-14'.
//   3. mode='completar_pagos_anteriores': Percorre todo o banco, marca PAGO as NFs
//                          com nf_data_emissao < '2026-07-14' não marcadas ainda.
// ================================================================

const DRIVE_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BUDGET_MS = 50000;
const MAX_DEPTH = 3;
const DATA_CORTE_PAGO_MS = Date.parse('2026-07-14T00:00:00Z');

const META_IDS = ['MC3A-20','MC3A-21','MC3A-22','MC3A-23','MC3A-24','MC3A-25','MC3A-EXTRA'];
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// ─── Utilidades ─────────────────────────────────────────────
const onlyDigits = (v) => String(v ?? '').replace(/\D+/g, '');
const safeStr = (v) => String(v ?? '').trim();

function parseMoneyBR(v) {
  const raw = safeStr(v).replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseXmlRaw(xml) {
  const tag = (re) => { const m = xml.match(re); return (m?.[1] || '').trim(); };
  const block = (name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i')); return m?.[1] || ''; };
  const tEmit = block('emit');
  const tDest = block('dest');
  const compLote = block('InfNfse').match(/<Competencia[^>]*>([^<]+)<\/Competencia>/i);
  return {
    nf_emitente_cpf_cnpj: onlyDigits(
      tag(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i) || (tEmit.match(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i)?.[1] || '') ||
      tag(/<CPF[^>]*>(\d+)<\/CPF>/i) || (tEmit.match(/<CPF[^>]*>(\d+)<\/CPF>/i)?.[1] || '') ||
      tag(/<Cnpj[^>]*>(\d+)<\/Cnpj>/i) || (tEmit.match(/<Cnpj[^>]*>(\d+)<\/Cnpj>/i)?.[1] || '')
    ),
    nf_emitente_nome: tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || (tEmit.match(/<xName[^>]*>([^<]+)<\/xName>/i)?.[1] || '') || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i),
    nf_numero: onlyDigits(tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i)),
    nf_valor_total: parseMoneyBR(tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i) || tag(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i)),
    nf_data_emissao: (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i) || (compLote?.[1] || '').slice(0, 10)),
    nf_chave_acesso: onlyDigits(tag(/<chNFe[^>]*>(\d{44})<\/chNFe>/i) || tag(/<ChaveAcesso[^>]*>(\d+)<\/ChaveAcesso>/i)).slice(0, 44),
    descricao_servico: tag(/<xServ[^>]*>([^<]+)<\/xServ>/i) || tag(/<Discriminacao[^>]*>([^<]+)<\/Discriminacao>/i),
    municipio: tag(/<xMun[^>]*>([^<]+)<\/xMun>/i) || tag(/<Municipio[^>]*>([^<]+)<\/Municipio>/i) || block('Endereco').match(/<Municipio[^>]*>([^<]+)<\/Municipio>/i)?.[1],
  };
}

function isXml(f) {
  if (['text/xml','application/xml'].includes(f?.mimeType)) return true;
  return String(f?.name || '').toLowerCase().endsWith('.xml');
}
function isPdf(f) {
  if (['application/pdf'].includes(f?.mimeType)) return true;
  return String(f?.name || '').toLowerCase().endsWith('.pdf');
}

async function listFolder(token, folderId) {
  const out = [];
  let page = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? `&pageToken=${page}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Drive HTTP ${r.status}`);
    const d = await r.json().catch(() => ({}));
    out.push(...(d.files || []));
    page = d.nextPageToken || '';
  } while (page);
  return out;
}

async function downloadFile(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Download HTTP ${r.status}`);
  return await r.arrayBuffer();
}

async function getFileMeta(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,modifiedTime&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Meta HTTP ${r.status}`);
  return await r.json();
}

async function scanRecursively(token, folderId, depth, deadline, accumulator) {
  if (depth > MAX_DEPTH) return;
  if (Date.now() > deadline) return;
  let items;
  try {
    items = await listFolder(token, folderId);
  } catch (e) {
    accumulator.errors.push(String(e?.message || e));
    return;
  }
  const files = items.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');
  const folders = items.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
  for (const f of files) {
    accumulator.files.push({ ...f, _path: `depth${depth}` });
  }
  for (const sf of folders.slice(0, 8)) {
    if (Date.now() > deadline) break;
    await scanRecursively(token, sf.id, depth + 1, deadline, accumulator);
  }
}

// ─── Sugestão de rubrica/meta via IA ──────────────────────────
async function sugerirRubricaMeta(descricao, fornecedorNome, rubricas) {
  if (!OPENAI_API_KEY) return {};
  const desc = safeStr(descricao).slice(0, 200);
  const forn = safeStr(fornecedorNome).slice(0, 80);
  if (!desc && !forn) return {};

  const menuAtivo = (rubricas || [])
    .filter((r) => r?.id && (r?.rubrica || r?.nome))
    .slice(0, 200)
    .map((r) => ({
      id: r.id,
      nome: r.rubrica || r.nome,
      cod: r.codigo || '',
      centro: r.centro_custo || '',
      grupo: r.grupo || '',
    }));

  const prompt = [
    {
      role: 'system',
      content:
        'Você mapeia nota fiscal para rubrica orçamentária + meta do projeto (Museus Centro / Viaduto das Artes). ' +
        `meta_id deve ser um de: ${META_IDS.join(', ')}. ` +
        'centro_custo deve ser um de: MUMO, MIS, MHAB, Noturno nos Museus 2026, Noturno Pampulha, Publicações, Geral. ' +
        'Responda JSON com chave estrita {"rubrica_id": string|null, "meta_id": string|null, "centro_custo": string|null}. ' +
        'rubrica_id deve ser o id de uma rubrica do "rubricas_menu" se houver match; se não houver confiança, retorne null.',
    },
    { role: 'user', content: JSON.stringify({ descricao: desc, fornecedor: forn, rubricas_menu: menuAtivo }) },
  ];

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: prompt,
      }),
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content || '{}');
    return {
      rubrica_id: safeStr(parsed.rubrica_id) || '',
      meta_id: safeStr(parsed.meta_id) || '',
      centro_custo: safeStr(parsed.centro_custo) || '',
    };
  } catch {
    return {};
  }
}

// ─── Handler principal ───────────────────────────────────────
Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;
  const db = srv.entities;
  const body = await req.json().catch(() => ({}));
  const mode = safeStr(body.mode || 'scan');
  const isCron = req.headers.get('x-base44-trigger') === 'cron' || body.cron === '1' || body.cron === true;

  if (!isCron) {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    if (String(user.role || '').toUpperCase() !== 'ADMIN') {
      return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral' }, { status: 403 });
    }
  }

  let driveToken = null;
  try {
    const conn = await srv.connectors.getConnection('googledrive');
    driveToken = conn?.accessToken || null;
  } catch (e) {
    return Response.json({ ok: false, error: 'Google Drive não conectado', detalhe: String(e?.message || e) }, { status: 401 });
  }
  if (!driveToken) return Response.json({ ok: false, error: 'Google Drive não conectado' }, { status: 401 });

  // ───────────────────────────── MODE: scan
  if (mode === 'scan') {
    const deadline = start + BUDGET_MS;
    const acc = { files: [], errors: [] };
    try {
      await scanRecursively(driveToken, DRIVE_FOLDER_ID, 0, deadline, acc);
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro scan: ' + String(e?.message || e) });
    }

    if (Date.now() > deadline) {
      return Response.json({
        ok: true,
        mode: 'scan',
        warning: 'Tempo esgotado durante scan; resultados parciais.',
        total_arquivos: acc.files.length,
        por_mes: [],
        erros_scan: acc.errors,
      });
    }

    // Baixa+parseia XMLs extraíndo NFs
    const nfFiles = [];
    const naoXml = [];
    for (const f of acc.files) {
      if (!isXml(f)) {
        if (isPdf(f)) naoXml.push({ id: f.id, name: f.name, modified: f.modifiedTime });
        continue;
      }
      if (Date.now() > deadline - 10000) break; // reserva 10s ao final
      try {
        const bytes = await downloadFile(driveToken, f.id);
        const xml = new TextDecoder('utf-8').decode(bytes);
        const parsed = parseXmlRaw(xml);
        nfFiles.push({
          drive_id: f.id,
          drive_name: f.name,
          drive_modified: f.modifiedTime,
          drive_link: f.webViewLink || '',
          ...parsed,
        });
      } catch (e) {
        naoXml.push({ id: f.id, name: f.name, error: String(e?.message || e) });
      }
    }

    // Agrupa por mês (preferindo data de emissão)
    const porMes = new Map();
    const fallbackMes = new Map();
    for (const nf of nfFiles) {
      const dt = safeStr(nf.nf_data_emissao);
      const key = dt ? dt.slice(0, 7) : (() => {
        const mod = safeStr(nf.drive_modified).slice(0, 7);
        return mod && mod !== 'Invalid' ? mod : 'sem-data';
      })();
      if (!porMes.has(key)) porMes.set(key, []);
      porMes.get(key).push(nf);
    }

    // Cross-check com banco via nf_numero
    let allPR = [];
    try {
      allPR = await db.PurchaseRequest.list('-created_date', 2000);
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro listar banco: ' + String(e?.message || e) });
    }
    const numeroMap = new Map();
    for (const p of allPR) {
      const n = safeStr(p.nf_numero);
      if (!n) continue;
      if (!numeroMap.has(n)) numeroMap.set(n, []);
      numeroMap.get(n).push(p);
    }

    const porMesResumo = Array.from(porMes.entries()).map(([mes, arquivos]) => {
      let noBanco = 0, faltando = 0;
      const faltandoIds = [];
      for (const nf of arquivos) {
        const n = safeStr(nf.nf_numero);
        const pr = n ? numeroMap.get(n) : null;
        if (pr && pr.length > 0) noBanco++;
        else { faltando++; faltandoIds.push(nf.drive_id); }
      }
      return { mes, total: arquivos.length, no_banco: noBanco, faltando, faltando_ids: faltandoIds };
    }).sort((a, b) => a.mes.localeCompare(b.mes));

    const totalPagoStatus = allPR.filter((p) => p.status === 'PAGO' || p.pago === true).length;
    const requerMarcacao = allPR.filter((p) => {
      if (p.status === 'PAGO' || p.pago === true) return false;
      const dt = p?.nf_data_emissao || p?.data_pagamento_efetivo;
      if (!dt) return false;
      try { return Date.parse(dt) < DATA_CORTE_PAGO_MS; } catch { return false; }
    }).length;

    return Response.json({
      ok: true,
      mode: 'scan',
      pasta_id: DRIVE_FOLDER_ID,
      total_arquivos: acc.files.length,
      total_xmls: nfFiles.length,
      total_pdfs: naoXml.length,
      total_no_banco_nfs: allPR.filter((p) => safeStr(p.nf_numero)).length,
      total_pago_status: totalPagoStatus,
      requer_marcar_pago_anteriores: requerMarcacao,
      por_mes: porMesResumo,
      erros_scan: acc.errors,
      elapsed_ms: Date.now() - start,
    });
  }

  // ───────────────────────────── MODE: tratar_lote
  if (mode === 'tratar_lote') {
    const fileIds = Array.isArray(body.file_ids) ? body.file_ids.slice(0, 20) : [];
    if (fileIds.length === 0) return Response.json({ ok: false, error: 'file_ids obrigatório' });

    let rubricas = [];
    try {
      rubricas = await db.Rubrica.list('ordem_exibicao', 500);
    } catch {}

    let allPR = [];
    try {
      allPR = await db.PurchaseRequest.list('-created_date', 2000);
    } catch {}
    const numeroMap = new Map();
    for (const p of allPR) {
      const n = safeStr(p.nf_numero);
      if (!n) continue;
      if (!numeroMap.has(n)) numeroMap.set(n, []);
      numeroMap.get(n).push(p);
    }

    const resultados = [];
    let criados = 0, atualizados = 0, pagosMarcados = 0, erros = 0;

    for (const fId of fileIds) {
      if (Date.now() - start > BUDGET_MS - 5000) {
        resultados.push({ file_id: fId, ok: false, error: 'Tempo limite atingido neste lote' });
        erros++;
        continue;
      }
      try {
        const meta = await getFileMeta(driveToken, fId);
        if (!meta || meta.error) throw new Error('Arquivo não encontrado');

        const isXmlFile = (meta.mimeType || '').includes('xml') || String(meta.name || '').toLowerCase().endsWith('.xml');
        if (!isXmlFile) {
          resultados.push({ file_id: fId, ok: false, error: 'Apenas XMLs suportados no tratamento automated' });
          erros++;
          continue;
        }

        const bytes = await downloadFile(driveToken, fId);
        const xml = new TextDecoder().decode(bytes);
        const parsed = parseXmlRaw(xml);

        const nf = safeStr(parsed.nf_numero);
        if (!nf) {
          resultados.push({ file_id: fId, file_name: meta.name, ok: false, error: 'XML sem número NF extraível' });
          erros++;
          continue;
        }
        const valorNum = Number(parsed.nf_valor_total || 0);
        const descXmlBase = safeStr(parsed.descricao_servico).slice(0, 300);
        // Guarda: XML inválido/incompleto — não cria PR sem dados essenciais
        if (valorNum <= 0 && !descXmlBase) {
          // Tenta refazer parse do texto bruto para vNF/ValorServicos alternativos
          const alt = xml.match(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || xml.match(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i)
            || xml.match(/<ValorLiquidoNfse[^>]*>([\d.,]+)<\/ValorLiquidoNfse>/i) || xml.match(/<vLiq[^>]*>([\d.,]+)<\/vLiq>/i);
          if (alt) parsed.nf_valor_total = parseMoneyBR(alt[1]);
          if (Number(parsed.nf_valor_total || 0) <= 0) {
            resultados.push({ file_id: fId, file_name: meta.name, ok: false, nf_numero: nf, error: 'XML sem valor/descrição extraível (provavelmente NFSe com formato não suportado)' });
            erros++;
            continue;
          }
        }

        const emissor = safeStr(parsed.nf_emitente_cpf_cnpj);
        const valor = Number(parsed.nf_valor_total || 0);
        const existentes = numeroMap.get(nf) || [];

        // Filtra por CNPJ/valor se houver candidatos
        let pr = null;
        for (const c of existentes) {
          if (emissor && safeStr(c.nf_emitente_cpf_cnpj || c.fornecedor_cnpj || c.fornecedor_cpf_cnpj) === emissor) { pr = c; break; }
          if (valor && Number(c.nf_valor_total || c.valor_total || c.valor_solicitado || 0) === valor) { pr = c; break; }
        }
        if (!pr && existentes.length > 0) pr = existentes[0];

        const isPago = parsed.nf_data_emissao ? Date.parse(safeStr(parsed.nf_data_emissao)) < DATA_CORTE_PAGO_MS : false;
        const descBase = safeStr(parsed.descricao_servico).slice(0, 300) || `NF ${nf} - ${safeStr(parsed.nf_emitente_nome)}`;

        if (pr) {
          const updates = {};
          if (!pr.fornecedor_nome) updates.fornecedor_nome = parsed.nf_emitente_nome;
          if (!pr.nf_emitente_nome) updates.nf_emitente_nome = parsed.nf_emitente_nome;
          if (!pr.nf_emitente_cpf_cnpj) updates.nf_emitente_cpf_cnpj = parsed.nf_emitente_cpf_cnpj;
          if (!pr.nf_valor_total && valor) updates.nf_valor_total = valor;
          if (!pr.nf_data_emissao) updates.nf_data_emissao = parsed.nf_data_emissao;
          if (!pr.nf_chave_acesso) updates.nf_chave_acesso = parsed.nf_chave_acesso;
          if (!pr.valor_total && valor) updates.valor_total = valor;
          if (!pr.valor_solicitado && valor) updates.valor_solicitado = valor;
          if (!pr.descricao_item) updates.descricao_item = descBase;

          if (isPago && pr.status !== 'PAGO' && pr.pago !== true) {
            updates.status = 'PAGO';
            updates.pago = true;
            updates.status_pagamento = 'pago';
            updates.data_pagamento_efetivo = parsed.nf_data_emissao;
            pagosMarcados++;
          }

          if (!pr.rubrica_id || !pr.meta_id || !pr.centro_custo) {
            const sug = await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);
            if (sug.rubrica_id && !pr.rubrica_id) {
              updates.rubrica_id = sug.rubrica_id;
              const rb = (rubricas || []).find((r) => r.id === sug.rubrica_id);
              if (rb) updates.rubrica_nome = rb.rubrica || rb.nome;
            }
            if (sug.meta_id && !pr.meta_id) updates.meta_id = sug.meta_id;
            if (sug.centro_custo && !pr.centro_custo) updates.centro_custo = sug.centro_custo;
          }

          if (Object.keys(updates).length > 0) {
            try {
              await db.PurchaseRequest.update(pr.id, updates);
              atualizados++;
              resultados.push({
                file_id: fId, file_name: meta.name, ok: true,
                acao: 'atualizado', nf_numero: nf, pr_id: pr.id,
                emissor: parsed.nf_emitente_nome, valor, data_emissao: parsed.nf_data_emissao,
                marcado_pago: isPago && pr.status !== 'PAGO' && pr.pago !== true,
                rubrica_id: updates.rubrica_id || '', meta_id: updates.meta_id || '',
              });
            } catch (e) {
              erros++;
              resultados.push({ file_id: fId, file_name: meta.name, ok: false, nf_numero: nf, error: 'Update: ' + String(e?.message || e) });
            }
          } else {
            resultados.push({
              file_id: fId, file_name: meta.name, ok: true,
              acao: 'nenhuma_alteracao', nf_numero: nf, pr_id: pr.id,
              emissor: parsed.nf_emitente_nome, valor, data_emissao: parsed.nf_data_emissao,
            });
          }
        } else {
          const sug = await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);
          const novo = {
            descricao_item: descBase,
            valor_solicitado: valor,
            valor_total: valor,
            nf_valor_total: valor,
            fornecedor_nome: parsed.nf_emitente_nome,
            nf_emitente_nome: parsed.nf_emitente_nome,
            nf_emitente_cpf_cnpj: parsed.nf_emitente_cpf_cnpj,
            nf_numero: nf,
            nf_data_emissao: parsed.nf_data_emissao,
            nf_chave_acesso: parsed.nf_chave_acesso,
            rubrica_id: sug.rubrica_id || '',
            meta_id: sug.meta_id || '',
            centro_custo: sug.centro_custo || '',
            status: isPago ? 'PAGO' : 'RASCUNHO',
            pago: isPago,
            data_pagamento_efetivo: isPago ? parsed.nf_data_emissao : null,
            status_pagamento: isPago ? 'pago' : 'pendente',
            origem: 'auditSincPastaNFs',
            tipo_origem: 'drive_xml',
            natureza_despesa: '339039',
            meio_pagamento: 'PIX',
          };
          try {
            const created = await db.PurchaseRequest.create(novo);
            numeroMap.set(nf, [...(numeroMap.get(nf) || []), created]);
            criados++;
            if (isPago) pagosMarcados++;
            resultados.push({
              file_id: fId, file_name: meta.name, ok: true,
              acao: 'criado', nf_numero: nf, pr_id: created?.id,
              emissor: parsed.nf_emitente_nome, valor, data_emissao: parsed.nf_data_emissao,
              marcado_pago: isPago,
              rubrica_id: sug.rubrica_id || '', meta_id: sug.meta_id || '', centro_custo: sug.centro_custo || '',
            });
          } catch (e) {
            erros++;
            resultados.push({ file_id: fId, file_name: meta.name, ok: false, nf_numero: nf, error: 'Create: ' + String(e?.message || e) });
          }
        }
      } catch (e) {
        erros++;
        resultados.push({ file_id: fId, ok: false, error: String(e?.message || e) });
      }
    }

    return Response.json({
      ok: true,
      mode: 'tratar_lote',
      total: fileIds.length,
      criados, atualizados, pagosMarcados, erros,
      resultados,
      elapsed_ms: Date.now() - start,
    });
  }

  // ───────────────────────────── MODE: completar_pagos_anteriores
  if (mode === 'completar_pagos_anteriores') {
    let allPR = [];
    try {
      allPR = await db.PurchaseRequest.list('-created_date', 2000);
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro listar banco: ' + String(e?.message || e) });
    }
    const alvo = allPR.filter((p) => {
      if (p.status === 'PAGO' || p.pago === true) return false;
      const dt = p?.nf_data_emissao || p?.data_pagamento_efetivo;
      if (!dt) return false;
      try { return Date.parse(dt) < DATA_CORTE_PAGO_MS; } catch { return false; }
    });

    let marcados = 0, falhas = 0;
    const amostra = [];
    for (const p of alvo) {
      if (Date.now() - start > BUDGET_MS - 3000) break;
      try {
        await db.PurchaseRequest.update(p.id, {
          status: 'PAGO',
          pago: true,
          status_pagamento: 'pago',
          data_pagamento_efetivo: p.nf_data_emissao || p.data_pagamento_efetivo || null,
        });
        marcados++;
        if (amostra.length < 10) {
          amostra.push({ id: p.id, nf_numero: p.nf_numero, fornecedor: p.nf_emitente_nome || p.fornecedor_nome, data: p.nf_data_emissao });
        }
      } catch (e) {
        falhas++;
      }
    }

    return Response.json({
      ok: true,
      mode: 'completar_pagos_anteriores',
      candidatos: alvo.length,
      marcados, falhas,
      amostra,
      elapsed_ms: Date.now() - start,
    });
  }

  return Response.json({ ok: false, error: 'mode inválido: ' + mode });
});