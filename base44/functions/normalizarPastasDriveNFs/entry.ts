import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ================================================================
// normalizarPastasDriveNFs — Normalização + merge + backup + processamento
// da pasta raiz de NFs (notasfiscais-App).
//
// Pasta ORIGEM:  13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T  (notasfiscais-App)
// Pasta BACKUP:  1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp  (backup principal)
//
// mode='normalizar_completo' (FASE 1+2+3, uso único manual por coord. geral):
//   1. Varre subpastas da pasta origem, detecta mês/ano pelo nome
//      (aceita: 'Julho 2026', '2026-07', '2026-07 - Julho', 'Julho', '07-2026'...)
//   2. Cria/confirma pasta canônica 'Mês Ano' (ex: 'Julho 2026')
//   3. Move arquivos das pastas alternativas → canônica (Drive files.update addParents/removeParents)
//   4. Remove pastas duplicadas vazias
//   5. Para cada arquivo consolidado:
//      - XML: parseia, cria/atualiza PurchaseRequest, sugere rubrica/meta via IA,
//        aprova automaticamente (APROVADO_COORD) se sem duplicata
//      - PDF sem XML: cria DocumentIntake AGUARDANDO_REVISAO
//   6. Copia cada arquivo para pasta de backup (Mês Ano) com nome padronizado
//
// mode='incremental' (FASE 4, agendado diário):
//   1. Varre apenas arquivos modifiedTime > now-25h na pasta origem
//   2. Para cada: copia para backup + processa (XML→PR+approve; PDF→intake)
//   3. Não reorganiza pastas (já normalizado previamente)
//
// Budget: 55s. Lotes de 15 arquivos.
// ================================================================

const PASTA_ORIGEM_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const PASTA_BACKUP_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BUDGET_MS = 55000;
const BATCH_SIZE = 15;

const META_IDS = ['MC3A-20','MC3A-21','MC3A-22','MC3A-23','MC3A-24','MC3A-25','MC3A-EXTRA'];
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_LOWER = MESES_PT.map(m => m.toLowerCase());

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
      tag(/<CPF[^>]*>(\d+)<\/CPF>/i) || (tEmit.match(/<CPF[^>]*>(\d+)<\/CPF>/i)?.[1] || '')
    ),
    nf_emitente_nome: tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || (tEmit.match(/<xName[^>]*>([^<]+)<\/xName>/i)?.[1] || '') || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i),
    nf_numero: onlyDigits(tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i)),
    nf_valor_total: parseMoneyBR(tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i) || tag(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i)),
    nf_data_emissao: (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i) || (compLote?.[1] || '').slice(0, 10)),
    nf_chave_acesso: onlyDigits(tag(/<chNFe[^>]*>(\d{44})<\/chNFe>/i) || tag(/<ChaveAcesso[^>]*>(\d+)<\/ChaveAcesso>/i)).slice(0, 44),
    descricao_servico: tag(/<xServ[^>]*>([^<]+)<\/xServ>/i) || tag(/<Discriminacao[^>]*>([^<]+)<\/Discriminacao>/i),
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

// Detecta mês/ano a partir do nome de uma pasta
// Retorna { mesIdx (0-11), ano, nomeCanonical: 'Julho 2026' } ou null
function detectarMesAno(nomePasta) {
  const s = safeStr(nomePasta);
  if (!s) return null;

  // Padrao ISO: '2026-07' ou '2026-07 - Julho' ou '2026-07_Julho'
  const iso = s.match(/(\d{4})[-_/](\d{2})/);
  if (iso) {
    const ano = Number(iso[1]);
    const mesIdx = Number(iso[2]) - 1;
    if (mesIdx >= 0 && mesIdx <= 11 && ano >= 2020 && ano <= 2030) {
      return { mesIdx, ano, nomeCanonical: `${MESES_PT[mesIdx]} ${ano}` };
    }
  }

  // Padrao invertido: '07-2026'
  const inv = s.match(/(\d{2})[-_/](\d{4})/);
  if (inv) {
    const mesIdx = Number(inv[1]) - 1;
    const ano = Number(inv[2]);
    if (mesIdx >= 0 && mesIdx <= 11 && ano >= 2020 && ano <= 2030) {
      return { mesIdx, ano, nomeCanonical: `${MESES_PT[mesIdx]} ${ano}` };
    }
  }

  // Nome do mês em PT-BR
  const lower = s.toLowerCase();
  for (let i = 0; i < MESES_LOWER.length; i++) {
    if (lower.includes(MESES_LOWER[i])) {
      // ano: busca 4 dígitos
      const anoMatch = s.match(/(\d{4})/);
      const ano = anoMatch ? Number(anoMatch[1]) : new Date().getFullYear();
      if (ano >= 2020 && ano <= 2030) {
        return { mesIdx: i, ano, nomeCanonical: `${MESES_PT[i]} ${ano}` };
      }
    }
  }

  return null;
}

// Nome canônico da pasta no backup — 'Julho 2026'
function nomePastaCanonical(mesIdx, ano) {
  return `${MESES_PT[mesIdx]} ${ano}`;
}

// ─── Drive helpers ────────────────────────────────────────────
async function listFolder(token, folderId, modifiedSince) {
  const out = [];
  let page = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)');
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (page) url += `&pageToken=${page}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Drive HTTP ${r.status}`);
    const d = await r.json().catch(() => ({}));
    out.push(...(d.files || []));
    page = d.nextPageToken || '';
  } while (page);
  if (modifiedSince) {
    return out.filter(f => new Date(f.modifiedTime || 0).getTime() > modifiedSince);
  }
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

// Encontra pasta por nome no pai; cria se não existir
async function getOrCreateFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.ok) {
    const d = await r.json();
    if (d.files?.length > 0) return d.files[0];
  }
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  return await cr.json();
}

// Move arquivo entre pastas (addParents/removeParents)
async function moveFile(token, fileId, addParentId, removeParentId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true` +
    `&addParents=${encodeURIComponent(addParentId)}` +
    (removeParentId ? `&removeParents=${encodeURIComponent(removeParentId)}` : '');
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Move HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
  return await r.json();
}

// Copia arquivo para nova pasta com nome padronizado (mesma conta Drive — usa files.copy)
async function copyFile(token, fileId, newName, destParentId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName, parents: [destParentId] }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Copy HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
  return await r.json();
}

// Verifica se arquivo com mesmo nome já existe na pasta destino
async function fileExistsInFolder(token, fileName, folderId) {
  const q = encodeURIComponent(`name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0] || null;
}

// Encontra subpasta FILHA DIRETA de parentId com nome exato (mimeType folder).
// Retorna o file object folder ou null.
async function findChildFolderByName(token, nameExact, parentId) {
  const safeName = nameExact.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.files?.[0] || null;
}

// Mandar pasta para LIXEIRA (não delete permanente) — apenas a passada.
// Não toca em nenhuma outra pasta. Retorna { id, name, already_trashed } ou null.
async function trashChildFolderByName(token, nameExact, parentId) {
  const folder = await findChildFolderByName(token, nameExact, parentId);
  if (!folder?.id) return null;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folder.id}?fields=id,name,trashed&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    }
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Trash HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
  return await r.json();
}

// Renomeia uma pasta (PATCH no campo name). Drive não permite colisão de
// nomes dentro da mesma pasta-pai, então chame após garantir que não há
// outra pasta com o mesmo nome-vivo (use `findChildFolderByName`).
async function renameFolder(token, folderId, newName) {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    }
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Rename HTTP ${r.status}: ${txt.slice(0, 120)}`);
  }
  return await r.json();
}

// Nome ISO alvo: '2026-07 - Julho'
function nomePastaISO(mesIdx, ano) {
  const mm = String(mesIdx + 1).padStart(2, '0');
  return `${ano}-${mm} - ${MESES_PT[mesIdx]}`;
}

async function deleteFolderIfEmpty(token, folderId) {
  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const d = await r.json();
    if ((d.files || []).length > 0) return false;
    await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch { return false; }
}

// ─── Nome padronizado para backup (baseado em nfNomeOficial) ──
function sanitizeName(v, max = 60) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max)
    .trim();
}
function formatValorName(v) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function buildBackupName(tipo, parsed, ext) {
  const prefixo = tipo === 'XML' ? 'XML' : 'NF';
  const num = sanitizeName(parsed.nf_numero || 'SN', 10).replace(/^0+(\d)/, '$1');
  const fornecedor = sanitizeName(parsed.nf_emitente_nome || 'FORNECEDOR', 60);
  const valor = formatValorName(parsed.nf_valor_total || 0);
  return `${prefixo} ${num} ${sanitizeName('Despesa', 30)} - ${fornecedor} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

// ─── Sugestão de rubrica/meta via IA (inline de auditSincPastaNFs) ──
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
      'Responda JSON com chave estrita {"rubrica_id": string|null, "meta_id": string|null, "centro_custo": string|null}. ' +
      'rubrica_id deve ser o id de uma rubrica do "rubricas_menu" se houver match; se não houver confiança, retorne null.' },
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
    const content = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content || '{}');
    return {
      rubrica_id: safeStr(parsed.rubrica_id) || '',
      meta_id: safeStr(parsed.meta_id) || '',
      centro_custo: safeStr(parsed.centro_custo) || '',
    };
  } catch { return {}; }
}

// ─── Detecção de duplicata no banco ─────────────────────────────
async function findDuplicata(db, nfNumero, cnpj, valor) {
  if (!nfNumero || (!cnpj && !valor)) return null;
  let allPR = [];
  try {
    allPR = await db.PurchaseRequest.list('-created_date', 2000);
  } catch { return null; }
  return allPR.find((p) => {
    if (safeStr(p.nf_numero) !== safeStr(nfNumero)) return false;
    if (cnpj && safeStr(p.nf_emitente_cpf_cnpj || p.fornecedor_cnpj) === cnpj) return true;
    if (valor && Math.abs(Number(p.nf_valor_total || p.valor_solicitado || 0) - Number(valor)) < 0.01) return true;
    return false;
  }) || null;
}

// ─── Handler principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;
  const db = srv.entities;
  const body = await req.json().catch(() => ({}));
  const mode = safeStr(body.mode || 'normalizar_completo');
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

  // Carrega rubricas para sugestão de IA
  let rubricas = [];
  try { rubricas = await db.Rubrica.list('ordem_exibicao', 500); } catch {}

  // ═════════════════════════════════════════════════════════════
  // MODE: normalizar_completo
  // ═════════════════════════════════════════════════════════════
  if (mode === 'normalizar_completo') {
    const deadline = start + BUDGET_MS;
    const relatorio = {
      pastas_analisadas: [],
      pastas_canonicas: [],
      pastas_removidas: [],
      arquivos_movidos: 0,
      backups_feitos: 0,
      prs_criados: 0,
      prs_aprovados: 0,
      intakes_criados: 0,
      erros: [],
      processados: [],
    };

    // 1. Lista subpastas da pasta origem
    let subpastas = [];
    let arquivosRaiz = [];
    try {
      const children = await listFolder(driveToken, PASTA_ORIGEM_ID);
      subpastas = children.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
      arquivosRaiz = children.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');
      relatorio.pastas_analisadas = subpastas.map((s) => s.name);
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro listar origem: ' + String(e?.message || e) });
    }

    // 2. Para cada subpasta: detectar mês/ano, consolidar na canônica
    const canonicalCache = new Map(); // nomeCanonical -> folderId (em ORIGEM)
    async function garantirCanonical(mesIdx, ano) {
      const nome = nomePastaCanonical(mesIdx, ano);
      if (canonicalCache.has(nome)) return canonicalCache.get(nome);
      const folder = await getOrCreateFolder(driveToken, nome, PASTA_ORIGEM_ID);
      canonicalCache.set(nome, folder.id);
      relatorio.pastas_canonicas.push(nome);
      return folder.id;
    }

    for (const sub of subpastas) {
      if (Date.now() > deadline) { relatorio.erros.push('Tempo limite atingido durante normalização'); break; }
      const det = detectarMesAno(sub.name);
      const nomeCanonical = det ? det.nomeCanonical : sub.name;
      const isAlreadyCanonical = sub.name === nomeCanonical && det !== null;

      let canonicalId;
      try {
        if (det) {
          canonicalId = await garantirCanonical(det.mesIdx, det.ano);
        } else {
          // Pasta com nome não reconhecido — mantém como está (não move)
          relatorio.erros.push(`Pasta não reconhecida: "${sub.name}"`);
          continue;
        }
      } catch (e) {
        relatorio.erros.push(`Erro criar pasta canônica para "${sub.name}": ${String(e?.message || e)}`);
        continue;
      }

      if (isAlreadyCanonical && sub.id === canonicalId) {
        // já é a canônica — apenas processa arquivos
      } else {
        // Move arquivos da subpasta alternativa → canônica
        let files;
        try { files = await listFolder(driveToken, sub.id); }
        catch (e) { relatorio.erros.push(`Erro listar "${sub.name}": ${String(e?.message || e)}`); continue; }

        for (const f of files) {
          if (Date.now() > deadline) break;
          try {
            await moveFile(driveToken, f.id, canonicalId, sub.id);
            relatorio.arquivos_movidos++;
          } catch (e) {
            relatorio.erros.push(`Erro mover ${f.name}: ${String(e?.message || e)}`);
          }
        }

        // Remove pasta alternativa se vazia
        try {
          const removed = await deleteFolderIfEmpty(driveToken, sub.id);
          if (removed) relatorio.pastas_removidas.push(sub.name);
        } catch (e) {
          relatorio.erros.push(`Erro remover pasta "${sub.name}": ${String(e?.message || e)}`);
        }
      }
    }

    // 3. Processa arquivos: coleta todos de todas as pastas canônicas + raiz
    const todasCanonicalIds = new Set(canonicalCache.values());
    const arquivosParaProcessar = [];
    for (const cId of todasCanonicalIds) {
      try {
        const fs = await listFolder(driveToken, cId);
        for (const f of fs) arquivosParaProcessar.push({ ...f, _parent: cId, _mesInfo: Array.from(canonicalCache.entries()).find(([k, v]) => v === cId)?.[0] });
      } catch (e) {
        relatorio.erros.push(`Erro listar pasta canônica: ${String(e?.message || e)}`);
      }
    }
    // Arquivos soltos na raiz origem — move para canônica do mês atual (fallback) e processa
    for (const f of arquivosRaiz) {
      const det = { mesIdx: new Date().getMonth(), ano: new Date().getFullYear() };
      const cId = await garantirCanonical(det.mesIdx, det.ano);
      try {
        await moveFile(driveToken, f.id, cId, PASTA_ORIGEM_ID);
        relatorio.arquivos_movidos++;
        arquivosParaProcessar.push({ ...f, _parent: cId, _mesInfo: nomePastaCanonical(det.mesIdx, det.ano) });
      } catch (e) {
        relatorio.erros.push(`Erro mover raiz ${f.name}: ${String(e?.message || e)}`);
      }
    }

    // 4. Processa em lotes: backup + create PR/intake + approve
    for (let i = 0; i < arquivosParaProcessar.length && Date.now() < deadline; i += BATCH_SIZE) {
      const batch = arquivosParaProcessar.slice(i, i + BATCH_SIZE);
      for (const f of batch) {
        if (Date.now() > deadline) { relatorio.erros.push('Tempo limite no processamento'); break; }
        const ext = String(f.name || '').toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
        try {
          if (isXml(f)) {
            // XML: parseia + cria/atualiza PR
            const bytes = await downloadFile(driveToken, f.id);
            const xml = new TextDecoder('utf-8').decode(bytes);
            const parsed = parseXmlRaw(xml);
            const nf = safeStr(parsed.nf_numero);
            const valor = Number(parsed.nf_valor_total || 0);

            if (!nf || valor <= 0) {
              relatorio.erros.push(`XML inválido: ${f.name}`);
              continue;
            }

            const duplicata = await findDuplicata(db, nf, parsed.nf_emitente_cpf_cnpj, valor);
            let pr = duplicata;

            const descBase = safeStr(parsed.descricao_servico).slice(0, 300) || `NF ${nf} - ${safeStr(parsed.nf_emitente_nome)}`;
            const sug = await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);

            if (!pr) {
              // Cria novo PR
              pr = await db.PurchaseRequest.create({
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
                nota_fiscal_url: `https://drive.google.com/file/d/${f.id}/view`,
                rubrica_id: sug.rubrica_id || '',
                rubrica_nome: (rubricas.find((r) => r.id === sug.rubrica_id)?.rubrica) || '',
                meta_id: sug.meta_id || '',
                centro_custo: sug.centro_custo || '',
                status: 'RASCUNHO',
                origem: 'normalizarPastasDriveNFs',
                tipo_origem: 'drive_xml',
                natureza_despesa: '339039',
                meio_pagamento: 'PIX',
              });
              relatorio.prs_criados++;
            } else {
              // Atualiza campos faltantes
              const updates = {};
              if (!pr.nota_fiscal_url) updates.nota_fiscal_url = `https://drive.google.com/file/d/${f.id}/view`;
              if (!pr.nf_data_emissao) updates.nf_data_emissao = parsed.nf_data_emissao;
              if (!pr.nf_chave_acesso) updates.nf_chave_acesso = parsed.nf_chave_acesso;
              if (!pr.rubrica_id && sug.rubrica_id) { updates.rubrica_id = sug.rubrica_id; updates.rubrica_nome = (rubricas.find((r) => r.id === sug.rubrica_id)?.rubrica) || ''; }
              if (!pr.meta_id && sug.meta_id) updates.meta_id = sug.meta_id;
              if (!pr.centro_custo && sug.centro_custo) updates.centro_custo = sug.centro_custo;
              if (Object.keys(updates).length > 0) {
                await db.PurchaseRequest.update(pr.id, updates);
              }
            }

            // Aprova automaticamente via purchaseActions (apenas se não for duplicata já aprovada)
            if (pr.status !== 'APROVADO_COORD' && pr.status !== 'APROVADO_ADMIN' && pr.status !== 'PAGO') {
              if (pr.rubrica_id) {
                try {
                  const apRes = await srv.functions.invoke('purchaseActions', {
                    action: 'aprovar',
                    purchaseId: pr.id,
                    aprovadorEmail: 'sistema@normalizarPastasDriveNFs',
                    aprovadorNome: 'Sistema — Normalização Drive',
                    novaRubricaId: pr.rubrica_id,
                  });
                  const ap = apRes?.data || apRes || {};
                  if (ap?.success) {
                    relatorio.prs_aprovados++;
                  } else if (ap?.blocked_by_duplicate) {
                    relatorio.erros.push(`Aprovação bloqueada (duplicata) NF ${nf}`);
                  } else {
                    relatorio.erros.push(`Aprovar NF ${nf}: ${ap?.error || 'falha'}`);
                  }
                } catch (e) {
                  relatorio.erros.push(`Erro aprovar NF ${nf}: ${String(e?.message || e)}`);
                }
              } else {
                relatorio.erros.push(`NF ${nf} sem rubrica — não aprovada automaticamente`);
              }
            }
          } else if (isPdf(f)) {
            // PDF sem XML: cria DocumentIntake AGUARDANDO_REVISAO
            try {
              await db.DocumentIntake.create({
                user_email: 'sistema@normalizarPastasDriveNFs',
                arquivo_original_url: `https://drive.google.com/file/d/${f.id}/view`,
                file_name_original: f.name,
                mime_type: 'application/pdf',
                tipo_detectado: 'NOTA_FISCAL_PDF',
                status_processamento: 'AGUARDANDO_REVISAO',
                origem: 'normalizarPastasDriveNFs_pdf_sem_xml',
              });
              relatorio.intakes_criados++;
            } catch (e) {
              relatorio.erros.push(`Intake PDF ${f.name}: ${String(e?.message || e)}`);
            }
          } else {
            continue; // ignora não-XML/PDF
          }

          // Backup: copia para PASTA_BACKUP_ID na subpasta Mês Ano
          const mesInfo = f._mesInfo || (() => {
            const det = detectarMesAno(f.name) || { mesIdx: new Date().getMonth(), ano: new Date().getFullYear() };
            return nomePastaCanonical(det.mesIdx, det.ano);
          })();
          let parsedForName = {};
          if (isXml(f)) {
            try {
              const bytes = await downloadFile(driveToken, f.id);
              parsedForName = parseXmlRaw(new TextDecoder('utf-8').decode(bytes));
            } catch {}
          }
          const ext = isXml(f) ? 'xml' : 'pdf';
          const tipo = isXml(f) ? 'XML' : 'NF';
          const backupName = isXml(f)
            ? buildBackupName(tipo, parsedForName, ext)
            : f.name; // PDF sem dados → mantém nome original

          try {
            const destFolder = await getOrCreateFolder(driveToken, mesInfo, PASTA_BACKUP_ID);
            const existing = await fileExistsInFolder(driveToken, backupName, destFolder.id);
            if (!existing) {
              await copyFile(driveToken, f.id, backupName, destFolder.id);
              relatorio.backups_feitos++;
            }
          } catch (e) {
            relatorio.erros.push(`Backup ${f.name}: ${String(e?.message || e)}`);
          }

          relatorio.processados.push({ name: f.name, mes: mesInfo, tipo: isXml(f) ? 'xml' : 'pdf' });
        } catch (e) {
          relatorio.erros.push(`Processar ${f.name}: ${String(e?.message || e)}`);
        }
      }
    }

    // Registra BackupLog
    try {
      await db.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal',
        entity_type: 'normalizarPastasDriveNFs_completo',
        status: relatorio.erros.length > 0 && relatorio.backups_feitos === 0 ? 'failure' : 'concluido',
        processed_at: new Date().toISOString(),
        total_files: arquivosParaProcessar.length,
        files_copied: relatorio.backups_feitos,
        execution_time_ms: Date.now() - start,
        details: JSON.stringify({
          pastas_removidas: relatorio.pastas_removidas.length,
          arquivos_movidos: relatorio.arquivos_movidos,
          prs_criados: relatorio.prs_criados,
          prs_aprovados: relatorio.prs_aprovados,
          intakes_criados: relatorio.intakes_criados,
        }),
        triggered_by: isCron ? 'scheduled' : 'manual',
      });
    } catch {}

    return Response.json({
      ok: true,
      mode,
      pastas_analisadas: relatorio.pastas_analisadas,
      pastas_canonicas: relatorio.pastas_canonicas,
      pastas_removidas: relatorio.pastas_removidas,
      arquivos_movidos: relatorio.arquivos_movidos,
      backups_feitos: relatorio.backups_feitos,
      prs_criados: relatorio.prs_criados,
      prs_aprovados: relatorio.prs_aprovados,
      intakes_criados: relatorio.intakes_criados,
      erros: relatorio.erros,
      processados: relatorio.processados.slice(0, 100),
      elapsed_ms: Date.now() - start,
    });
  }

  // ═════════════════════════════════════════════════════════════
  // MODE: processar_backup — processa arquivos já normalizados (após normalizar_completo)
  // ═════════════════════════════════════════════════════════════
  if (mode === 'processar_backup') {
    const deadline = start + BUDGET_MS;
    const relatorio = { backups_feitos: 0, prs_criados: 0, prs_aprovados: 0, intakes_criados: 0, erros: [], processados: [] };

    let subpastas = [];
    try {
      const children = await listFolder(driveToken, PASTA_ORIGEM_ID);
      subpastas = children.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro listar origem: ' + String(e?.message || e) });
    }

    const arquivosParaProcessar = [];
    for (const sub of subpastas) {
      if (Date.now() > deadline) break;
      try {
        const fs = await listFolder(driveToken, sub.id);
        for (const f of fs) arquivosParaProcessar.push({ ...f, _pastaName: sub.name });
      } catch (e) {
        relatorio.erros.push(`Erro listar "${sub.name}": ${String(e?.message || e)}`);
      }
    }

    for (let i = 0; i < arquivosParaProcessar.length && Date.now() < deadline; i += BATCH_SIZE) {
      const batch = arquivosParaProcessar.slice(i, i + BATCH_SIZE);
      for (const f of batch) {
        if (Date.now() > deadline) { relatorio.erros.push('Tempo limite'); break; }
        try {
          const ext = isXml(f) ? 'xml' : isPdf(f) ? 'pdf' : '';
          if (!ext) continue;
          let parsed = {};
          if (isXml(f)) {
            try {
              const bytes = await downloadFile(driveToken, f.id);
              const xml = new TextDecoder('utf-8').decode(bytes);
              parsed = parseXmlRaw(xml);
              const nf = safeStr(parsed.nf_numero);
              const valor = Number(parsed.nf_valor_total || 0);
              if (!nf || valor <= 0) { relatorio.erros.push(`XML inválido: ${f.name}`); continue; }

              const duplicata = await findDuplicata(db, nf, parsed.nf_emitente_cpf_cnpj, valor);
              let pr = duplicata;
              const descBase = safeStr(parsed.descricao_servico).slice(0, 300) || `NF ${nf} - ${safeStr(parsed.nf_emitente_nome)}`;
              const sug = pr ? {} : await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);

              if (!pr) {
                pr = await db.PurchaseRequest.create({
                  descricao_item: descBase, valor_solicitado: valor, valor_total: valor, nf_valor_total: valor,
                  fornecedor_nome: parsed.nf_emitente_nome, nf_emitente_nome: parsed.nf_emitente_nome,
                  nf_emitente_cpf_cnpj: parsed.nf_emitente_cpf_cnpj, nf_numero: nf,
                  nf_data_emissao: parsed.nf_data_emissao, nf_chave_acesso: parsed.nf_chave_acesso,
                  nota_fiscal_url: `https://drive.google.com/file/d/${f.id}/view`,
                  rubrica_id: sug.rubrica_id || '', rubrica_nome: (rubricas.find((r) => r.id === sug.rubrica_id)?.rubrica) || '',
                  meta_id: sug.meta_id || '', centro_custo: sug.centro_custo || '',
                  status: 'RASCUNHO', origem: 'normalizarPastasDriveNFs_processar', tipo_origem: 'drive_xml',
                  natureza_despesa: '339039', meio_pagamento: 'PIX',
                });
                relatorio.prs_criados++;
              }

              if (pr && pr.status !== 'APROVADO_COORD' && pr.status !== 'PAGO' && pr.rubrica_id) {
                try {
                  const apRes = await srv.functions.invoke('purchaseActions', {
                    action: 'aprovar', purchaseId: pr.id,
                    aprovadorEmail: 'sistema@normalizarPastasDriveNFs', aprovadorNome: 'Sistema — Normalização Drive',
                    novaRubricaId: pr.rubrica_id,
                  });
                  const ap = apRes?.data || apRes || {};
                  if (ap?.success) relatorio.prs_aprovados++;
                  else if (ap?.blocked_by_duplicate) relatorio.erros.push(`Duplicata NF ${nf}`);
                } catch (e) { relatorio.erros.push(`Aprovar NF ${nf}: ${String(e?.message || e)}`); }
              } else if (pr && !pr.rubrica_id) {
                const sug2 = await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);
                if (sug2.rubrica_id) {
                  await db.PurchaseRequest.update(pr.id, { rubrica_id: sug2.rubrica_id, rubrica_nome: (rubricas.find((r) => r.id === sug2.rubrica_id)?.rubrica) || '', meta_id: pr.meta_id || sug2.meta_id, centro_custo: pr.centro_custo || sug2.centro_custo });
                  try {
                    const apRes = await srv.functions.invoke('purchaseActions', { action: 'aprovar', purchaseId: pr.id, aprovadorEmail: 'sistema@normalizarPastasDriveNFs', aprovadorNome: 'Sistema', novaRubricaId: sug2.rubrica_id });
                    if (apRes?.data?.success || apRes?.success) relatorio.prs_aprovados++;
                  } catch (e) { relatorio.erros.push(`Aprovar NF ${nf}: ${String(e?.message || e)}`); }
                } else {
                  relatorio.erros.push(`NF ${nf} sem rubrica sugerida — não aprovada`);
                }
              }
            } catch (e) { relatorio.erros.push(`XML ${f.name}: ${String(e?.message || e)}`); continue; }
          } else if (isPdf(f)) {
            try {
              await db.DocumentIntake.create({
                user_email: 'sistema@normalizarPastasDriveNFs',
                arquivo_original_url: `https://drive.google.com/file/d/${f.id}/view`,
                file_name_original: f.name, mime_type: 'application/pdf',
                tipo_detectado: 'NOTA_FISCAL_PDF', status_processamento: 'AGUARDANDO_REVISAO',
                origem: 'normalizarPastasDriveNFs_pdf_sem_xml',
              });
              relatorio.intakes_criados++;
            } catch (e) { relatorio.erros.push(`Intake ${f.name}: ${String(e?.message || e)}`); }
          }

          // Backup
          const det = detectarMesAno(f._pastaName) || { mesIdx: new Date().getMonth(), ano: new Date().getFullYear() };
          const mesInfo = nomePastaCanonical(det.mesIdx, det.ano);
          const backupName = isXml(f) ? buildBackupName('XML', parsed, 'xml') : f.name;
          try {
            const destFolder = await getOrCreateFolder(driveToken, mesInfo, PASTA_BACKUP_ID);
            const existing = await fileExistsInFolder(driveToken, backupName, destFolder.id);
            if (!existing) { await copyFile(driveToken, f.id, backupName, destFolder.id); relatorio.backups_feitos++; }
          } catch (e) { relatorio.erros.push(`Backup ${f.name}: ${String(e?.message || e)}`); }
          relatorio.processados.push({ name: f.name, mes: mesInfo, tipo: isXml(f) ? 'xml' : 'pdf' });
        } catch (e) { relatorio.erros.push(`Processar ${f.name}: ${String(e?.message || e)}`); }
      }
    }

    try {
      await db.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal', entity_type: 'normalizarPastasDriveNFs_processar',
        status: relatorio.erros.length > 0 && relatorio.backups_feitos === 0 ? 'failure' : 'concluido',
        processed_at: new Date().toISOString(),
        total_files: arquivosParaProcessar.length, files_copied: relatorio.backups_feitos,
        execution_time_ms: Date.now() - start,
        details: JSON.stringify({ prs_criados: relatorio.prs_criados, prs_aprovados: relatorio.prs_aprovados, intakes_criados: relatorio.intakes_criados }),
        triggered_by: isCron ? 'scheduled' : 'manual',
      });
    } catch {}

    return Response.json({
      ok: true, mode, total_arquivos: arquivosParaProcessar.length,
      backups_feitos: relatorio.backups_feitos, prs_criados: relatorio.prs_criados,
      prs_aprovados: relatorio.prs_aprovados, intakes_criados: relatorio.intakes_criados,
      erros: relatorio.erros, processados: relatorio.processados.slice(0, 100), elapsed_ms: Date.now() - start,
    });
  }

  // ═════════════════════════════════════════════════════════════
  // MODE: incremental
  // ═════════════════════════════════════════════════════════════
  if (mode === 'incremental') {
    const deadline = start + BUDGET_MS;
    const cutoff = Date.now() - 25 * 60 * 60 * 1000; // últimas 25h
    // incremental: apenas LÊ da origem. Nunca cria/move/renomeia/exclui arquivos
    // ou pastas da ORIGEM (PASTA_ORIGEM_ID). Escreve/cria apenas no BACKUP.
    const relatorio = { backups_feitos: 0, prs_criados: 0, prs_aprovados: 0, intakes_criados: 0, pastas_backup_removidas: [], erros: [], processados: [] };

    // — Correção pontual do backup: remover pasta indevida 'Maio 2026' (lixeira) —
    // Não toca em nenhuma outra pasta do backup nem na origem.
    try {
      const trashed = await trashChildFolderByName(driveToken, 'Maio 2026', PASTA_BACKUP_ID);
      if (trashed?.id) relatorio.pastas_backup_removidas.push({ nome: 'Maio 2026', id: trashed.id, trashed: true });
    } catch (e) {
      relatorio.erros.push(`Remover 'Maio 2026' do backup: ${String(e?.message || e)}`);
    }

    // Lista subpastas + arquivos modificados nas últimas 25h (LEITURA da origem)
    let subpastas = [];
    let arquivosRaiz = [];
    try {
      const children = await listFolder(driveToken, PASTA_ORIGEM_ID);
      subpastas = children.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
      arquivosRaiz = children.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder' && new Date(f.modifiedTime || 0).getTime() > cutoff);
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro listar origem: ' + String(e?.message || e) });
    }

    const arquivosParaProcessar = [];
    for (const sub of subpastas) {
      if (Date.now() > deadline) break;
      try {
        const fs = await listFolder(driveToken, sub.id, cutoff);
        for (const f of fs) arquivosParaProcessar.push({ ...f, _parent: sub.id, _pastaName: sub.name });
      } catch (e) {
        relatorio.erros.push(`Erro listar "${sub.name}": ${String(e?.message || e)}`);
      }
    }
    for (const f of arquivosRaiz) {
      arquivosParaProcessar.push({ ...f, _parent: PASTA_ORIGEM_ID, _pastaName: '' });
    }

    for (let i = 0; i < arquivosParaProcessar.length && Date.now() < deadline; i += BATCH_SIZE) {
      const batch = arquivosParaProcessar.slice(i, i + BATCH_SIZE);
      for (const f of batch) {
        if (Date.now() > deadline) break;
        try {
          if (isXml(f)) {
            const bytes = await downloadFile(driveToken, f.id);
            const xml = new TextDecoder('utf-8').decode(bytes);
            const parsed = parseXmlRaw(xml);
            const nf = safeStr(parsed.nf_numero);
            const valor = Number(parsed.nf_valor_total || 0);
            if (!nf || valor <= 0) { relatorio.erros.push(`XML inválido: ${f.name}`); continue; }

            const duplicata = await findDuplicata(db, nf, parsed.nf_emitente_cpf_cnpj, valor);
            let pr = duplicata;
            const descBase = safeStr(parsed.descricao_servico).slice(0, 300) || `NF ${nf} - ${safeStr(parsed.nf_emitente_nome)}`;
            const sug = await sugerirRubricaMeta(descBase, parsed.nf_emitente_nome, rubricas);

            if (!pr) {
              pr = await db.PurchaseRequest.create({
                descricao_item: descBase, valor_solicitado: valor, valor_total: valor, nf_valor_total: valor,
                fornecedor_nome: parsed.nf_emitente_nome, nf_emitente_nome: parsed.nf_emitente_nome,
                nf_emitente_cpf_cnpj: parsed.nf_emitente_cpf_cnpj, nf_numero: nf,
                nf_data_emissao: parsed.nf_data_emissao, nf_chave_acesso: parsed.nf_chave_acesso,
                nota_fiscal_url: `https://drive.google.com/file/d/${f.id}/view`,
                rubrica_id: sug.rubrica_id || '', rubrica_nome: (rubricas.find((r) => r.id === sug.rubrica_id)?.rubrica) || '',
                meta_id: sug.meta_id || '', centro_custo: sug.centro_custo || '',
                status: 'RASCUNHO', origem: 'normalizarPastasDriveNFs_incremental', tipo_origem: 'drive_xml',
                natureza_despesa: '339039', meio_pagamento: 'PIX',
              });
              relatorio.prs_criados++;
            }

            if (pr && pr.status !== 'APROVADO_COORD' && pr.status !== 'PAGO' && pr.rubrica_id) {
              try {
                const apRes = await srv.functions.invoke('purchaseActions', {
                  action: 'aprovar', purchaseId: pr.id,
                  aprovadorEmail: 'sistema@normalizarPastasDriveNFs', aprovadorNome: 'Sistema — Sync Diário',
                  novaRubricaId: pr.rubrica_id,
                });
                const ap = apRes?.data || apRes || {};
                if (ap?.success) relatorio.prs_aprovados++;
                else if (ap?.blocked_by_duplicate) relatorio.erros.push(`Duplicata NF ${nf}`);
              } catch (e) { relatorio.erros.push(`Aprovar NF ${nf}: ${String(e?.message || e)}`); }
            }
          } else if (isPdf(f)) {
            try {
              await db.DocumentIntake.create({
                user_email: 'sistema@normalizarPastasDriveNFs',
                arquivo_original_url: `https://drive.google.com/file/d/${f.id}/view`,
                file_name_original: f.name, mime_type: 'application/pdf',
                tipo_detectado: 'NOTA_FISCAL_PDF', status_processamento: 'AGUARDANDO_REVISAO',
                origem: 'normalizarPastasDriveNFs_incremental',
              });
              relatorio.intakes_criados++;
            } catch (e) { relatorio.erros.push(`Intake ${f.name}: ${String(e?.message || e)}`); }
          } else { continue; }

          // Backup
          const det = detectarMesAno(f._pastaName) || { mesIdx: new Date().getMonth(), ano: new Date().getFullYear() };
          const mesInfo = nomePastaCanonical(det.mesIdx, det.ano);
          let parsedForName = {};
          if (isXml(f)) {
            try {
              const bytes = await downloadFile(driveToken, f.id);
              parsedForName = parseXmlRaw(new TextDecoder('utf-8').decode(bytes));
            } catch {}
          }
          const backupName = isXml(f) ? buildBackupName('XML', parsedForName, 'xml') : f.name;
          try {
            const destFolder = await getOrCreateFolder(driveToken, mesInfo, PASTA_BACKUP_ID);
            const existing = await fileExistsInFolder(driveToken, backupName, destFolder.id);
            if (!existing) { await copyFile(driveToken, f.id, backupName, destFolder.id); relatorio.backups_feitos++; }
          } catch (e) { relatorio.erros.push(`Backup ${f.name}: ${String(e?.message || e)}`); }

          relatorio.processados.push({ name: f.name, mes: mesInfo, tipo: isXml(f) ? 'xml' : 'pdf' });
        } catch (e) {
          relatorio.erros.push(`Processar ${f.name}: ${String(e?.message || e)}`);
        }
      }
    }

    try {
      await db.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal', entity_type: 'normalizarPastasDriveNFs_incremental',
        status: relatorio.erros.length > 0 && relatorio.backups_feitos === 0 ? 'failure' : 'concluido',
        processed_at: new Date().toISOString(),
        total_files: arquivosParaProcessar.length, files_copied: relatorio.backups_feitos,
        execution_time_ms: Date.now() - start,
        details: JSON.stringify({ prs_criados: relatorio.prs_criados, prs_aprovados: relatorio.prs_aprovados, intakes_criados: relatorio.intakes_criados, pastas_backup_removidas: relatorio.pastas_backup_removidas }),
        triggered_by: isCron ? 'scheduled' : 'manual',
      });
    } catch {}

    return Response.json({
      ok: true, mode, arquivos_modificados: arquivosParaProcessar.length,
      backups_feitos: relatorio.backups_feitos, prs_criados: relatorio.prs_criados,
      prs_aprovados: relatorio.prs_aprovados, intakes_criados: relatorio.intakes_criados,
      pastas_backup_removidas: relatorio.pastas_backup_removidas,
      erros: relatorio.erros, processados: relatorio.processados.slice(0, 100),
      elapsed_ms: Date.now() - start,
    });
  }

  // ═════════════════════════════════════════════════════════════
  // MODE: normalizar_iso — Normaliza a ORIGEM (notasfiscais-App) renomeando
  // subpastas mensais para o formato canônico ISO 'YYYY-MM - Mês'
  // (ex.: '2026-07 - Julho'). Quando o alvo já existe em ORIGEM, move os
  // arquivos da pasta duplicada para o alvo e manda a duplicada vazia para
  // lixeira. NÃO processa arquivos (só renomeia/consolida pastas). NÃO
  // toca no backup.
  //══════════════════════════════════════════════════════════════
  if (mode === 'normalizar_iso') {
    const deadline = start + BUDGET_MS;
    const relatorio = {
      pastas_analisadas: [],
      pastas_renomeadas: [],
      pastas_consolidadas: [],
      arquivos_movidos: 0,
      pastas_removidas: [],
      erros: [],
    };

    let subpastas = [];
    try {
      const children = await listFolder(driveToken, PASTA_ORIGEM_ID);
      subpastas = children.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
      relatorio.pastas_analisadas = subpastas.map((s) => s.name);
    } catch (e) {
      return Response.json({ ok: false, error: 'Erro listar origem: ' + String(e?.message || e) });
    }

    // Mapa: nomeISO -> folderId (alvo consolidado, criado ou existente)
    const isoTargetCache = new Map();

    for (const sub of subpastas) {
      if (Date.now() > deadline) { relatorio.erros.push('Tempo limite'); break; }
      const det = detectarMesAno(sub.name);
      if (!det) {
        relatorio.erros.push(`Pasta não reconhecida: "${sub.name}"`);
        continue;
      }
      const nomeISO = nomePastaISO(det.mesIdx, det.ano);

      // Se já tem o nome ISO → é o alvo. Registra no cache e pula.
      if (sub.name === nomeISO) {
        isoTargetCache.set(nomeISO, sub.id);
        continue;
      }

      // Determina o alvo: já existe ISO? Caso contrário cria.
      let targetId;
      try {
        if (isoTargetCache.has(nomeISO)) {
          targetId = isoTargetCache.get(nomeISO);
        } else {
          const existing = await findChildFolderByName(driveToken, nomeISO, PASTA_ORIGEM_ID);
          if (existing?.id) {
            targetId = existing.id;
            isoTargetCache.set(nomeISO, targetId);
          } else {
            // Cria alvo com o nome ISO
            const created = await getOrCreateFolder(driveToken, nomeISO, PASTA_ORIGEM_ID);
            targetId = created.id;
            isoTargetCache.set(nomeISO, targetId);
            relatorio.pastas_renomeadas.push({ de: sub.name, para: nomeISO, id_criado: targetId });
          }
        }
      } catch (e) {
        relatorio.erros.push(`Erro garantir alvo ISO "${nomeISO}": ${String(e?.message || e)}`);
        continue;
      }

      // targetId é o mesmo da subpasta? só renomeia.
      if (targetId === sub.id) continue;

      // Move todos os arquivos da subpasta duplicada → alvo ISO
      let files;
      try { files = await listFolder(driveToken, sub.id); }
      catch (e) { relatorio.erros.push(`Erro listar "${sub.name}": ${String(e?.message || e)}`); continue; }

      for (const f of files) {
        if (Date.now() > deadline) { relatorio.erros.push('Tempo limite movendo'); break; }
        try {
          await moveFile(driveToken, f.id, targetId, sub.id);
          relatorio.arquivos_movidos++;
        } catch (e) {
          relatorio.erros.push(`Erro mover ${f.name} de "${sub.name}": ${String(e?.message || e)}`);
        }
      }

      relatorio.pastas_consolidadas.push({ de: sub.name, para: nomeISO, arquivos: files.length });

      // Lixeira a pasta duplicada agora vazia
      try {
        const trashed = await trashChildFolderByName(driveToken, sub.name, PASTA_ORIGEM_ID);
        if (trashed?.id) relatorio.pastas_removidas.push({ nome: sub.name, id: trashed.id });
      } catch (e) {
        relatorio.erros.push(`Erro tralizar "${sub.name}": ${String(e?.message || e)}`);
      }
    }

    try {
      await db.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal', entity_type: 'normalizarPastasDriveNFs_iso',
        status: relatorio.erros.length > 0 ? 'failure' : 'concluido',
        processed_at: new Date().toISOString(),
        total_files: relatorio.arquivos_movidos, files_copied: 0,
        execution_time_ms: Date.now() - start,
        details: JSON.stringify({
          pastas_renomeadas: relatorio.pastas_renomeadas.length,
          pastas_consolidadas: relatorio.pastas_consolidadas.length,
          arquivos_movidos: relatorio.arquivos_movidos,
          pastas_removidas: relatorio.pastas_removidas.length,
        }),
        triggered_by: isCron ? 'scheduled' : 'manual',
      });
    } catch {}

    return Response.json({
      ok: true, mode,
      pastas_analisadas: relatorio.pastas_analisadas,
      pastas_renomeadas: relatorio.pastas_renomeadas,
      pastas_consolidadas: relatorio.pastas_consolidadas,
      arquivos_movidos: relatorio.arquivos_movidos,
      pastas_removidas: relatorio.pastas_removidas,
      erros: relatorio.erros,
      elapsed_ms: Date.now() - start,
    });
  }

  // ═════════════════════════════════════════════════════════════
  // MODE: corrigir_backup — apenas remove a pasta indevida 'Maio 2026'
  // do backup. NÃO toca na origem nem em outras pastas do backup.
  //══════════════════════════════════════════════════════════════
  if (mode === 'corrigir_backup') {
    const pastas_backup_removidas = [];
    const erros = [];
    try {
      const trashed = await trashChildFolderByName(driveToken, 'Maio 2026', PASTA_BACKUP_ID);
      if (trashed?.id) pastas_backup_removidas.push({ nome: 'Maio 2026', id: trashed.id, trashed: true });
    } catch (e) {
      erros.push(`Remover 'Maio 2026' do backup: ${String(e?.message || e)}`);
    }

    try {
      await db.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal', entity_type: 'normalizarPastasDriveNFs_corrigir_backup',
        status: erros.length > 0 ? 'failure' : 'concluido',
        processed_at: new Date().toISOString(),
        total_files: 0, files_copied: 0,
        execution_time_ms: Date.now() - start,
        details: JSON.stringify({ pastas_backup_removidas }),
        triggered_by: isCron ? 'scheduled' : 'manual',
      });
    } catch {}

    return Response.json({
      ok: erros.length === 0, mode,
      pastas_backup_removidas,
      erros,
      elapsed_ms: Date.now() - start,
    });
  }

  return Response.json({ ok: false, error: 'mode inválido: ' + mode });
});