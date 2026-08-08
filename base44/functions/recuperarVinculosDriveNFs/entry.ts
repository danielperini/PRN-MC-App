// Recupera vínculos de DocumentIntake (NFs PDF/XML) cujos links do Google Drive
// estão quebrados (404 — arquivo não existe mais no ID atual). Para cada link
// quebrado, busca o arquivo pelo nome no Drive e atualiza arquivo_original_url,
// nf_pdf_url/nf_xml_url com o novo ID encontrado.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
// Pasta externa — PRD: varrer DIRECTAMENTE via listAllInFolder() para recuperação de vínculos 404
const RECOVERY_PARENT_FOLDER_ID = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';

function extrairDriveId(url) {
  if (!url) return null;
  const s = String(url);
  const m =
    s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    s.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    s.match(/^([a-zA-Z0-9_-]{20,})$/) ||
    s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function safeStr(v) {
  return v == null ? '' : String(v);
}

async function getToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  return conn?.accessToken || conn?.access_token || conn?.token || conn;
}

// Lista todos os arquivos em uma pasta específica do Drive (paginação completa).
// Não recursivo — apenas a pasta informada (subpastas ignoradas).
async function listAllInFolder(token, folderId) {
  const items = [];
  let pt = null;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,parents,trashed)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    });
    if (pt) params.set('pageToken', pt);
    let r;
    try {
      r = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      break;
    }
    if (!r.ok) {
      // Fallback p/ corpora=user (Drive compartilhado pode exigir)
      const p2 = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id,name,parents,trashed)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pt) p2.set('pageToken', pt);
      try {
        r = await fetch(`${DRIVE_API}/files?${p2.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        break;
      }
      if (!r.ok) break;
    }
    const d = await r.json().catch(() => ({ files: [] }));
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

// Pré-carrega os arquivos da pasta de recuperação para lookup por nome.
// Retorna um Map<name, file[]> permitindo colisões de nome sensíveis.
async function scanRecoveryFolder(token) {
  try {
    const files = await listAllInFolder(token, RECOVERY_PARENT_FOLDER_ID);
    const map = new Map();
    for (const f of files || []) {
      if (!f.name) continue;
      if (!map.has(f.name)) map.set(f.name, []);
      map.get(f.name).push(f);
    }
    return { map, total: files.length };
  } catch (e) {
    console.warn('[recuperarVinculos] scanRecoveryFolder erro:', e.message);
    return { map: new Map(), total: 0 };
  }
}

// Verifica se o arquivo existe no Drive. Retorna { ok, name, parents, status }.
async function verificarArquivo(token, fileId) {
  try {
    const r = await fetch(
      `${DRIVE_API}/files/${fileId}?fields=id,name,parents,trashed&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, status: r.status, error: d.error?.message || '' };
    }
    const d = await r.json();
    return {
      ok: true,
      status: 200,
      name: d.name,
      parents: d.parents || [],
      trashed: !!d.trashed,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

// Busca arquivo por nome no Drive (todos os drives, opcionalmente incluindo lixo).
// Estratégia: 1) match exato (name = '...'); 2) contains com substring única + filtro JS
async function buscarPorNome(token, nomeArquivo, incluirLixo) {
  if (!nomeArquivo) return [];
  const nomeEsc = nomeArquivo.replace(/'/g, "\\'");
  const trashedClause = incluirLixo ? '' : ' and trashed = false';

  // 1. Match exato
  const paramsExact = new URLSearchParams({
    q: `name = '${nomeEsc}'${trashedClause}`,
    fields: 'files(id,name,parents,trashed)',
    pageSize: '10',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  });
  try {
    const r = await fetch(`${DRIVE_API}/files?${paramsExact.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const d = await r.json();
      if (d.files && d.files.length) return d.files;
    }
  } catch { /* fallback p/ contains */ }

  // 2. Contains — substring do nome que ainda é único o suficiente (40 chars)
  // Usa substring do MUSEUS CENTRO + parte do fornecedor p/ máxima seletividade.
  const substr = nomeArquivo.length > 40 ? nomeArquivo.substring(0, 40) : nomeArquivo;
  const substrEsc = substr.replace(/'/g, "\\'");
  const paramsContains = new URLSearchParams({
    q: `name contains '${substrEsc}'${trashedClause}`,
    fields: 'files(id,name,parents,trashed)',
    pageSize: '50',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  });
  try {
    const r2 = await fetch(`${DRIVE_API}/files?${paramsContains.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r2.ok) {
      // fallback corpora=user
      const params2 = new URLSearchParams({
        q: `name contains '${substrEsc}'${trashedClause}`,
        fields: 'files(id,name,parents,trashed)',
        pageSize: '50',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      const r3 = await fetch(`${DRIVE_API}/files?${params2.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r3.ok) return [];
      const d3 = await r3.json();
      // Filtra: nome DEVE ser igual ao buscado (substring pode trazer aproximações)
      return (d3.files || []).filter((f) => f.name === nomeArquivo);
    }
    const d2 = await r2.json();
    return (d2.files || []).filter((f) => f.name === nomeArquivo);
  } catch {
    return [];
  }
}

async function processarLote(base44, token, limite, apenasQuebrados) {
  // NOVO (PRD): pré-carrega pasta externa p/ lookup direto por nome
  const { map: recoveryByName, total: recoveryTotal } = await scanRecoveryFolder(token);
  const intakes = await base44.asServiceRole.entities.DocumentIntake.filter(
    {
      tipo_detectado: { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'] },
      status_registro: 'ATIVO',
      $or: [
        { status_processamento: 'AGUARDANDO_REVISAO' },
        { status_processamento: 'ENVIADO_APROVACAO' },
        { status_processamento: 'APROVADO' },
      ],
    },
    '-updated_date',
    limite,
    0,
  );

  const stats = {
    verificados: 0,
    links_ok: 0,
    links_quebrados: 0,
    recuperados: 0,
    nao_encontrados: 0,
    erros: 0,
  };
  const recuperacoes = [];
  const naoEncontrados = [];

  for (const intake of intakes || []) {
    stats.verificados++;
    const url = intake.nf_pdf_url || intake.nf_xml_url || intake.arquivo_original_url;
    const fileId = extrairDriveId(url);
    if (!fileId) {
      stats.erros++;
      continue;
    }

    const ver = await verificarArquivo(token, fileId);
    if (ver.ok) {
      stats.links_ok++;
      if (apenasQuebrados) continue;
      // Mesmo ok, segue para garantir integridade (noop)
      continue;
    }

    stats.links_quebrados++;
    const nomeBusca = safeStr(intake.file_name_final) || safeStr(intake.file_name_original);
    if (!nomeBusca) {
      stats.nao_encontrados++;
      naoEncontrados.push({ id: intake.id, motivo: 'sem_nome_para_busca' });
      continue;
    }

    let candidatos = await buscarPorNome(token, nomeBusca, false);
    if (!candidatos.length &&
      safeStr(intake.file_name_original) &&
      intake.file_name_original !== nomeBusca) {
      const cOrig = await buscarPorNome(token, intake.file_name_original, false);
      candidatos = cOrig;
    }

    // NOVO (PRD): fallback à pasta externa — match por nome exato (final ou original)
    if (!candidatos.length) {
      const folderMatchFinal = recoveryByName.get(nomeBusca);
      if (folderMatchFinal && folderMatchFinal.length) candidatos = folderMatchFinal.slice();
      if (!candidatos.length && safeStr(intake.file_name_original)) {
        const folderMatchOrig = recoveryByName.get(intake.file_name_original);
        if (folderMatchOrig && folderMatchOrig.length) candidatos = folderMatchOrig.slice();
      }
    }

    if (!candidatos.length) {
      stats.nao_encontrados++;
      naoEncontrados.push({
        id: intake.id,
        nome_busca: nomeBusca,
        motivo: 'nao_encontrado_no_drive',
      });
      continue;
    }

    const novo = candidatos.find((c) => !c.trashed) || candidatos[0];
    if (!novo) {
      stats.nao_encontrados++;
      continue;
    }

    const novaUrl = `https://drive.google.com/file/d/${novo.id}/view`;
    const updates = {};
    if (intake.tipo_detectado === 'NOTA_FISCAL_PDF') {
      updates.nf_pdf_url = novaUrl;
    } else if (intake.tipo_detectado === 'NOTA_FISCAL_XML') {
      updates.nf_xml_url = novaUrl;
    }
    updates.arquivo_original_url = novaUrl;
    if (!safeStr(intake.file_name_final) && novo.name) {
      updates.file_name_final = novo.name;
    }

    try {
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates);
      stats.recuperados++;
      recuperacoes.push({
        id: intake.id,
        nome: nomeBusca,
        oldId: fileId,
        newId: novo.id,
        novaUrl,
      });
    } catch (e) {
      stats.erros++;
      naoEncontrados.push({ id: intake.id, motivo: `update_erro:${e.message}` });
    }
  }

  return {
    stats,
    recuperacoes,
    nao_encontrados: naoEncontrados,
    total_analisado: (intakes || []).length,
    recovery_folder_scanned: recoveryTotal,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Math.max(Number(body.limite || 50), 1), 200);
    const apenasQuebrados = body.apenasQuebrados !== false;

    let token;
    try {
      token = await getToken(base44);
    } catch (e) {
      return Response.json(
        { ok: false, error: `Token Drive indisponível: ${e.message}` },
        { status: 503 },
      );
    }
    if (!token) {
      return Response.json(
        { ok: false, error: 'sem_token_googledrive' },
        { status: 500 },
      );
    }

    const resultado = await processarLote(base44, token, limite, apenasQuebrados);
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    return Response.json(
      { ok: false, error: e.message, stack: e.stack },
      { status: 500 },
    );
  }
});