import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ================================================================
// normalizarPastasDriveNFs — Normalização + backup + processamento
// de NFs da pasta de ORIGEM do Drive.
//
// Pasta ORIGEM (raiz): 13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T
// Pasta BACKUP/destino: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp
//
// Modes:
//   1. 'diagnosticar_pastas': Lista subpastas, detecta duplicatas/mal-nomeadas.
//   2. 'normalizar_completo': FASE 1+2+3 — merge pastas, backup, processa NFs. (manual, uso único)
//   3. 'incremental': FASE 4 — sync diário de arquivos modificados nas últimas 25h. (agendado)
// ================================================================

const ORIGEM_FOLDER_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const BACKUP_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BUDGET_MS = 55000;
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

// ─── Nome padronizado (simplificado de nfNomeOficial) ───────
function sanitizeNome(v, max = 60) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max)
    .trim();
}

function buildStandardName(parsed, tipo) {
  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  const num = onlyDigits(parsed.nf_numero) || 'SN';
  const desc = sanitizeNome(parsed.descricao_servico || parsed.nf_emitente_nome || 'Despesa', 30) || 'Despesa';
  const forn = sanitizeNome(parsed.nf_emitente_nome || 'FORNECEDOR', 60) || 'FORNECEDOR';
  const valor = (Number(parsed.nf_valor_total) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${tipo} ${num} ${desc} - ${forn} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

// ─── Detecção de Mês/Ano pelo nome da pasta ─────────────────
const MESES_PT = [
  { nome: 'Janeiro', re: /janeiro|jan/i, num: 1 },
  { nome: 'Fevereiro', re: /fevereiro|fev/i, num: 2 },
  { nome: 'Marco', re: /mar[cç]o|mar\b/i, num: 3 },
  { nome: 'Abril', re: /abril|abr/i, num: 4 },
  { nome: 'Maio', re: /maio|mai/i, num: 5 },
  { nome: 'Junho', re: /junho|jun/i, num: 6 },
  { nome: 'Julho', re: /julho|jul/i, num: 7 },
  { nome: 'Agosto', re: /agosto|ago/i, num: 8 },
  { nome: 'Setembro', re: /setembro|set/i, num: 9 },
  { nome: 'Outubro', re: /outubro|out/i, num: 10 },
  { nome: 'Novembro', re: /novembro|nov/i, num: 11 },
  { nome: 'Dezembro', re: /dezembro|dez/i, num: 12 },
];

function detectarMesAno(nomePasta) {
  const nome = safeStr(nomePasta);
  if (!nome) return null;
  // Formato ISO: "2026-07" ou "2026-07 - Julho"
  const isoMatch = nome.match(/(\d{4})-(\d{2})/);
  if (isoMatch) {
    const ano = Number(isoMatch[1]);
    const mes = Number(isoMatch[2]);
    if (mes >= 1 && mes <= 12) return `${MESES_PT[mes - 1].nome} ${ano}`;
  }
  // Formato por nome de mês: "Julho 2026", "Julho", "07 - Julho"
  for (const m of MESES_PT) {
    if (m.re.test(nome)) {
      const anoMatch = nome.match(/(\d{4})/);
      const ano = anoMatch ? Number(anoMatch[1]) : new Date().getFullYear();
      return `${m.nome} ${ano}`;
    }
  }
  return null;
}

function isCanonicalName(nome) {
  // Nome canônico: "Julho 2026" (Mês Ano sem hífens/ISO)
  return MESES_PT.some((m) => new RegExp(`^${m.nome}\\s+\\d{4}$`, 'i').test(safeStr(nome)));
}

// ─── Drive API helpers ──────────────────────────────────────
async function listFolder(token, folderId, extraQuery = '') {
  const out = [];
  let page = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false${extraQuery}`);
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

async function listRecentlyModified(token, folderId, cutoffISO) {
  return listFolder(token, folderId, ` and modifiedTime > '${cutoffISO}'`);
}

async function getOrCreateFolder(token, nome, parentId) {
  // Busca pasta existente
  const q = encodeURIComponent(`'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${nome.replace(/'/g, "\\'")}'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.ok) {
    const d = await r.json().catch(() => ({}));
    if (d.files?.length > 0) return d.files[0];
  }
  // Cria nova pasta
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!cr.ok) throw new Error(`createFolder HTTP ${cr.status}`);
  return await cr.json();
}

async function moveFile(token, fileId, addParentId, removeParentId) {
  const params = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,name,parents' });
  if (addParentId) params.set('addParents', addParentId);
  if (removeParentId) params.set('removeParents', removeParentId);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) throw new Error(`moveFile HTTP ${r.status}`);
  return await r.json();
}

async function copyFile(token, fileId, newName, destFolderId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName, parents: [destFolderId] }),
  });
  if (!r.ok) throw new Error(`copyFile HTTP ${r.status}`);
  return await r.json();
}

async function deleteFileOrFolder(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

async function downloadFile(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Download HTTP ${r.status}`);
  return await r.arrayBuffer();
}

async function listFileNamesInFolder(token, folderId) {
  const files = await listFolder(token, folderId);
  return new Set(files.map((f) => f.name));
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
    .map((r) => ({ id: r.id, nome: r.rubrica || r.nome, cod: r.codigo || '', centro: r.centro_custo || '', grupo: r.grupo || '' }));

  const prompt = [
    { role: 'system', content:
      'Você mapeia nota fiscal para rubrica orçamentária + meta do projeto (Museus Centro / Viaduto das Artes). ' +
      `meta_id deve ser um de: ${META_IDS.join(', ')}. ` +
      'centro_custo deve ser um de: MUMO, MIS, MHAB, Noturno nos Museus 2026, Noturno Pampulha, Publicações, Geral. ' +
      'Responda JSON com chave estrita {"rubrica_id": string|null, "meta_id": string|null, "centro_custo": string|null}.'
    },
    { role: 'user', content: JSON.stringify({ descricao: desc, fornecedor: forn, rubricas_menu: menuAtivo }) },
  ];

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' }, messages: prompt }),
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    return {
      rubrica_id: safeStr(parsed.rubrica_id) || '',
      meta_id: safeStr(parsed.meta_id) || '',
      centro_custo: safeStr(parsed.centro_custo) || '',
    };
  } catch { return {}; }
}

// ─── Detecção de duplicata no banco ──────────────────────────
function findDuplicata(parsed, allPR) {
  const nf = safeStr(parsed.nf_numero);
  const cnpj = safeStr(parsed.nf_emitente_cpf_cnpj);
  const valor = Number(parsed.nf_valor_total || 0);
  if (!nf) return null;
  return (allPR || []).find((p) =>
    safeStr(p.nf_numero) === nf &&
    (cnpj ? safeStr(p.nf_emitente_cpf_cnpj || p.fornecedor_cnpj || p.fornecedor_cpf_cnpj) === cnpj : true) &&
    (valor ? Number(p.nf_valor_total || p.valor_total || 0) === valor : true)
  ) || null;
}

// ─── Handler principal ───────────────────────────────────────
Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;
  const db = srv.entities;
  const body = await req.json().catch(() => ({}));
  const mode = safeStr(body.mode || 'diagnosticar_pastas');
  const isCron = req.headers.get('x-base44-trigger') === 'cron' || body.cron === '1' || body.cron === true;

  // Autenticação
  if (!isCron) {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    if (String(user.role || '').toUpperCase() !== 'ADMIN') {
      return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral' }, { status: 403 });
    }
  }

  // Token Google Drive
  let driveToken = null;
  try {
    const conn = await srv.connectors.getConnection('googledrive');
    driveToken = conn?.accessToken || null;
  } catch (e) {
    return Response.json({ ok: false, error: 'Google Drive não conectado', detalhe: String(e?.message || e) }, { status: 401 });
  }
  if (!driveToken) return Response.json({ ok: false, error: 'Google Drive não conectado' }, { status: 401 });

  // Carrega rubricas e PRs existentes (cache para todo o processo)
  let rubricas = [];
  let allPR = [];
  try {
    rubricas = await db.Rubrica.list('ordem_exibicao', 500);
  } catch {}
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

  // ══════════════ MODE: diagnosticar_pastas ══════════════
  if (mode === 'diagnosticar_pastas') {
    try {
      const subpastas = (await listFolder(driveToken, ORIGEM_FOLDER_ID))
        .filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
      const analise = subpastas.map((sp) => {
        const canonico = detectarMesAno(sp.name);
        return {
          id: sp.id,
          nome: sp.name,
          mes_ano_detectado: canonico,
          ja_canonico: canonico ? isCanonicalName(sp.name) : false,
        };
      });
      const duplicatas = analise.filter((a) => a.mes_ano_detectado && !a.ja_canonico);
      return Response.json({
        ok: true,
        mode: 'diagnosticar_pastas',
        total_subpastas: subpastas.length,
        pastas_canonicas: analise.filter((a) => a.ja_canonico).length,
        pastas_duplicatas: duplicatas.length,
        duplicatas: duplicatas,
        pastas_sem_deteccao: analise.filter((a) => !a.mes_ano_detectado).map((a) => ({ id: a.id, nome: a.nome })),
      });
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro diagnosticar: ' + String(e?.message || e) });
    }
  }

  // ══════════════ MODE: normalizar_completo (FASE 1+2+3) ══════════════
  if (mode === 'normalizar_completo') {
    const deadline = start + BUDGET_MS;
    const log = { pastas_renomeadas: 0, arquivos_movidos: 0, backups_feitos: 0, intakes_criados: 0, prs_criados: 0, prs_aprovados: 0, erros: [] };

    // FASE 1: Normalizar pastas — mover arquivos de alias para canônica
    const subpastas = (await listFolder(driveToken, ORIGEM_FOLDER_ID))
      .filter((f) => f.mimeType === 'application/vnd.google-apps.folder');

    const pastaMap = new Map(); // mes_ano → { id, arquivos: [], alias: [] }

    for (const sp of subpastas) {
      if (Date.now() > deadline - 15000) break;
      const mesAno = detectarMesAno(sp.name);
      if (!mesAno) {
        log.erros.push(`Pasta '${sp.name}': mês/ano não detectado, ignorada`);
        continue;
      }
      const jaCanonico = isCanonicalName(sp.name);
      let entry = pastaMap.get(mesAno);
      if (!entry) {
        // Cria ou encontra a pasta canônica na origem
        try {
          const canonica = await getOrCreateFolder(driveToken, mesAno, ORIGEM_FOLDER_ID);
          entry = { id: canonica.id, nome: mesAno, arquivos: [], alias: [] };
          pastaMap.set(mesAno, entry);
        } catch (e) {
          log.erros.push(`Erro ao criar pasta canônica '${mesAno}': ${String(e?.message || e)}`);
          continue;
        }
      }
      if (jaCanonico && entry.id === sp.id) {
        // Própria canônica — apenas lista arquivos
      } else {
        entry.alias.push({ id: sp.id, nome: sp.name });
      }
      // Lista arquivos da subpasta
      try {
        const files = await listFolder(driveToken, sp.id);
        entry.arquivos.push(...files.map((f) => ({ ...f, pasta_origem_id: sp.id, pasta_origem_nome: sp.name })));
      } catch (e) {
        log.erros.push(`Erro ao listar pasta '${sp.name}': ${String(e?.message || e)}`);
      }
    }

    // Move arquivos das alias para a canônica
    for (const [mesAno, entry] of pastaMap) {
      if (Date.now() > deadline - 12000) break;
      for (const alias of entry.alias) {
        const arquivosDaAlias = entry.arquivos.filter((a) => a.pasta_origem_id === alias.id);
        for (const arq of arquivosDaAlias) {
          if (Date.now() > deadline - 10000) break;
          try {
            // Verifica se já existe na canônica (evita duplicar)
            const nomesExistentes = await listFileNamesInFolder(driveToken, entry.id);
            const nomeFinal = nomesExistentes.has(arq.name) ? `${arq.name.replace(/\.[^.]+$/, '')} (2)${arq.name.match(/\.[^.]+$/)?.[0] || ''}` : arq.name;
            await moveFile(driveToken, arq.id, entry.id, alias.id);
            log.arquivos_movidos++;
          } catch (e) {
            log.erros.push(`Erro ao mover '${arq.name}' de '${alias.nome}': ${String(e?.message || e)}`);
          }
        }
        // Remove a pasta alias se vazia
        try {
          const restantes = await listFolder(driveToken, alias.id);
          if (restantes.length === 0) {
            await deleteFileOrFolder(driveToken, alias.id);
            log.pastas_renomeadas++;
          }
        } catch (e) {
          log.erros.push(`Erro ao remover pasta vazia '${alias.nome}': ${String(e?.message || e)}`);
        }
      }
    }

    // FASE 2+3: Backup + Processamento de cada arquivo consolidado
    // Cria/find pasta de backup raiz mensal no destino
    const backupFolderCache = new Map();
    async function getBackupMes(mesAno) {
      if (backupFolderCache.has(mesAno)) return backupFolderCache.get(mesAno);
      try {
        const f = await getOrCreateFolder(driveToken, mesAno, BACKUP_FOLDER_ID);
        backupFolderCache.set(mesAno, f);
        return f;
      } catch (e) {
        log.erros.push(`Erro ao criar pasta backup '${mesAno}': ${String(e?.message || e)}`);
        return null;
      }
    }

    for (const [mesAno, entry] of pastaMap) {
      if (Date.now() > deadline - 8000) break;
      const arquivos = entry.arquivos;
      for (let i = 0; i < arquivos.length; i += 15) {
        if (Date.now() > deadline - 5000) break;
        const batch = arquivos.slice(i, i + 15);
        for (const arq of batch) {
          if (Date.now() > deadline - 3000) break;
          try {
            // Garante que arquivo está na canônica (se veio de alias, já foi movido)
            // Se já era canônica, pasta_origem_id === entry.id
            const isArquivoXml = isXml(arq);
            const isArquivoPdf = isPdf(arq);

            if (isArquivoXml) {
              // Processa XML
              const bytes = await downloadFile(driveToken, arq.id);
              const xml = new TextDecoder('utf-8').decode(bytes);
              const parsed = parseXmlRaw(xml);

              // Backup com nome padronizado
              const backupPasta = await getBackupMes(mesAno);
              if (backupPasta) {
                const nomeStd = buildStandardName(parsed, 'XML');
                const nomesExistentes = await listFileNamesInFolder(driveToken, backupPasta.id);
                if (!nomesExistentes.has(nomeStd)) {
                  await copyFile(driveToken, arq.id, nomeStd, backupPasta.id);
                  log.backups_feitos++;
                }
              }

              // Cria/atualiza PR
              const nf = safeStr(parsed.nf_numero);
              const valor = Number(parsed.nf_valor_total || 0);
              if (!nf) { log.erros.push(`XML sem número NF: ${arq.name}`); continue; }

              const dup = findDuplicata(parsed, allPR);
              if (dup) continue; // já existe

              const isPago = parsed.nf_data_emissao ? Date.parse(safeStr(parsed.nf_data_emissao)) < DATA_CORTE_PAGO_MS : false;
              const descBase = safeStr(parsed.descricao_servico).slice(0, 300) || `NF ${nf} - ${safeStr(parsed.nf_emitente_nome)}`;
              const sug = await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);
              const novo = {
                descricao_item: descBase,
                valor_solicitado: valor, valor_total: valor, nf_valor_total: valor,
                fornecedor_nome: parsed.nf_emitente_nome, nf_emitente_nome: parsed.nf_emitente_nome,
                nf_emitente_cpf_cnpj: parsed.nf_emitente_cpf_cnpj, nf_numero: nf,
                nf_data_emissao: parsed.nf_data_emissao, nf_chave_acesso: parsed.nf_chave_acesso,
                rubrica_id: sug.rubrica_id || '', meta_id: sug.meta_id || '', centro_custo: sug.centro_custo || '',
                status: 'APROVADO_COORD', pago: isPago,
                data_pagamento_efetivo: isPago ? parsed.nf_data_emissao : null,
                status_pagamento: isPago ? 'pago' : 'pendente',
                origem: 'normalizarPastasDriveNFs', tipo_origem: 'drive_xml',
                natureza_despesa: '339039', meio_pagamento: 'PIX',
                aprov_coord_nome: 'Sistema (normalizarPastasDriveNFs)', aprov_coord_data: new Date().toISOString().slice(0, 10),
              };
              try {
                const created = await db.PurchaseRequest.create(novo);
                log.prs_criados++; log.prs_aprovados++;
                numeroMap.set(nf, [...(numeroMap.get(nf) || []), created]);
                allPR.push(created);
              } catch (e) {
                log.erros.push(`Erro ao criar PR NF ${nf}: ${String(e?.message || e)}`);
              }
            } else if (isArquivoPdf) {
              // Backup com nome original
              const backupPasta = await getBackupMes(mesAno);
              if (backupPasta) {
                const nomesExistentes = await listFileNamesInFolder(driveToken, backupPasta.id);
                if (!nomesExistentes.has(arq.name)) {
                  await copyFile(driveToken, arq.id, arq.name, backupPasta.id);
                  log.backups_feitos++;
                }
              }
              // Cria DocumentIntake para revisão humana
              try {
                await db.DocumentIntake.create({
                  user_email: 'sistema@normalizarPastasDriveNFs',
                  arquivo_original_url: `https://drive.google.com/file/d/${arq.id}/view`,
                  file_name_original: arq.name, mime_type: 'application/pdf',
                  tipo_detectado: 'NOTA_FISCAL_PDF', status_processamento: 'AGUARDANDO_REVISAO',
                  origem: 'normalizarPastasDriveNFs',
                  erros_validacao: ['PDF sem XML correspondente — revisão humana obrigatória'],
                });
                log.intakes_criados++;
              } catch (e) {
                log.erros.push(`Erro ao criar intake PDF '${arq.name}': ${String(e?.message || e)}`);
              }
            }
          } catch (e) {
            log.erros.push(`Erro geral '${arq.name}': ${String(e?.message || e)}`);
          }
        }
      }
    }

    return Response.json({
      ok: true, mode: 'normalizar_completo',
      ...log,
      elapsed_ms: Date.now() - start,
    });
  }

  // ══════════════ MODE: incremental (FASE 4 — diário) ══════════════
  if (mode === 'incremental') {
    const deadline = start + BUDGET_MS;
    const log = { arquivos_modificados: 0, backups_feitos: 0, intakes_criados: 0, prs_criados: 0, prs_aprovados: 0, erros: [] };
    const cutoffISO = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    try {
      // Lista subpastas da origem
      const subpastas = (await listFolder(driveToken, ORIGEM_FOLDER_ID))
        .filter((f) => f.mimeType === 'application/vnd.google-apps.folder');

      // Processa arquivos recentes em cada subpasta + nos arquivos diretos da raiz
      const backupFolderCache = new Map();
      async function getBackupMes(mesAno) {
        if (backupFolderCache.has(mesAno)) return backupFolderCache.get(mesAno);
        try {
          const f = await getOrCreateFolder(driveToken, mesAno, BACKUP_FOLDER_ID);
          backupFolderCache.set(mesAno, f);
          return f;
        } catch { return null; }
      }

      // Arquivos diretos na raiz
      const arquivosRaiz = await listRecentlyModified(driveToken, ORIGEM_FOLDER_ID, cutoffISO);
      const todosArquivos = [...arquivosRaiz.map((f) => ({ ...f, mes_ano: detectarMesAno('') || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }))];

      for (const sp of subpastas) {
        if (Date.now() > deadline - 12000) break;
        const mesAno = detectarMesAno(sp.name);
        if (!mesAno) continue;
        try {
          const recentes = await listRecentlyModified(driveToken, sp.id, cutoffISO);
          for (const f of recentes) todosArquivos.push({ ...f, mes_ano: mesAno, pasta_id: sp.id });
        } catch (e) {
          log.erros.push(`Erro ao listar recentes '${sp.name}': ${String(e?.message || e)}`);
        }
      }

      log.arquivos_modificados = todosArquivos.length;

      // Processa em lotes
      for (let i = 0; i < todosArquivos.length; i += 15) {
        if (Date.now() > deadline - 5000) break;
        const batch = todosArquivos.slice(i, i + 15);
        for (const arq of batch) {
          if (Date.now() > deadline - 3000) break;
          try {
            if (isXml(arq)) {
              const bytes = await downloadFile(driveToken, arq.id);
              const xml = new TextDecoder('utf-8').decode(bytes);
              const parsed = parseXmlRaw(xml);
              const backupPasta = await getBackupMes(arq.mes_ano);
              if (backupPasta) {
                const nomeStd = buildStandardName(parsed, 'XML');
                const nomesExistentes = await listFileNamesInFolder(driveToken, backupPasta.id);
                if (!nomesExistentes.has(nomeStd)) {
                  await copyFile(driveToken, arq.id, nomeStd, backupPasta.id);
                  log.backups_feitos++;
                }
              }
              const nf = safeStr(parsed.nf_numero);
              if (!nf) continue;
              const dup = findDuplicata(parsed, allPR);
              if (dup) continue;
              const isPago = parsed.nf_data_emissao ? Date.parse(safeStr(parsed.nf_data_emissao)) < DATA_CORTE_PAGO_MS : false;
              const descBase = safeStr(parsed.descricao_servico).slice(0, 300) || `NF ${nf} - ${safeStr(parsed.nf_emitente_nome)}`;
              const sug = await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);
              const created = await db.PurchaseRequest.create({
                descricao_item: descBase, valor_solicitado: Number(parsed.nf_valor_total || 0), valor_total: Number(parsed.nf_valor_total || 0), nf_valor_total: Number(parsed.nf_valor_total || 0),
                fornecedor_nome: parsed.nf_emitente_nome, nf_emitente_nome: parsed.nf_emitente_nome, nf_emitente_cpf_cnpj: parsed.nf_emitente_cpf_cnpj,
                nf_numero: nf, nf_data_emissao: parsed.nf_data_emissao, nf_chave_acesso: parsed.nf_chave_acesso,
                rubrica_id: sug.rubrica_id || '', meta_id: sug.meta_id || '', centro_custo: sug.centro_custo || '',
                status: 'APROVADO_COORD', pago: isPago, data_pagamento_efetivo: isPago ? parsed.nf_data_emissao : null,
                status_pagamento: isPago ? 'pago' : 'pendente', origem: 'normalizarPastasDriveNFs', tipo_origem: 'drive_xml_incremental',
                natureza_despesa: '339039', meio_pagamento: 'PIX',
                aprov_coord_nome: 'Sistema (sync diário)', aprov_coord_data: new Date().toISOString().slice(0, 10),
              });
              log.prs_criados++; log.prs_aprovados++;
              numeroMap.set(nf, [...(numeroMap.get(nf) || []), created]); allPR.push(created);
            } else if (isPdf(arq)) {
              const backupPasta = await getBackupMes(arq.mes_ano);
              if (backupPasta) {
                const nomesExistentes = await listFileNamesInFolder(driveToken, backupPasta.id);
                if (!nomesExistentes.has(arq.name)) {
                  await copyFile(driveToken, arq.id, arq.name, backupPasta.id);
                  log.backups_feitos++;
                }
              }
              await db.DocumentIntake.create({
                user_email: 'sistema@normalizarPastasDriveNFs',
                arquivo_original_url: `https://drive.google.com/file/d/${arq.id}/view`,
                file_name_original: arq.name, mime_type: 'application/pdf',
                tipo_detectado: 'NOTA_FISCAL_PDF', status_processamento: 'AGUARDANDO_REVISAO',
                origem: 'normalizarPastasDriveNFs_incremental',
                erros_validacao: ['PDF sem XML correspondente — revisão humana obrigatória'],
              });
              log.intakes_criados++;
            }
          } catch (e) {
            log.erros.push(`Erro incremental '${arq.name}': ${String(e?.message || e)}`);
          }
        }
      }

      // Registra BackupLog
      try {
        await db.BackupLog.create({
          backup_type: 'drive_nf_sync_mensal',
          status: log.erros.length > 0 ? 'concluido' : 'success',
          total_files: log.arquivos_modificados, files_copied: log.backups_feitos,
          processed_at: new Date().toISOString(),
          details: `Incremental: ${log.prs_criados} PRs criados, ${log.intakes_criados} intakes, ${log.backups_feitos} backups`,
          triggered_by: isCron ? 'scheduled' : 'manual',
          error_message: log.erros.length > 0 ? log.erros.slice(0, 5).join('; ') : '',
        });
      } catch {}

      return Response.json({ ok: true, mode: 'incremental', ...log, elapsed_ms: Date.now() - start });
    } catch (e) {
      try {
        await db.BackupLog.create({
          backup_type: 'drive_nf_sync_mensal', status: 'failure',
          error_message: String(e?.message || e), processed_at: new Date().toISOString(), triggered_by: isCron ? 'scheduled' : 'manual',
        });
      } catch {}
      return Response.json({ ok: false, error: 'Erro incremental: ' + String(e?.message || e) });
    }
  }

  return Response.json({ ok: false, error: 'mode inválido: ' + mode });
});