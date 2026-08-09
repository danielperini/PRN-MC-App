//recuperarPdfsInvalidos082026/entry.ts
//
// Recuperacao dos 47 PDFs invalidos (HTML/XML disfarçados) que permaneceram na
// pasta 08-2026 marcados com flag auditoria_pdf_integridade=html|xml.
//
// Estrategia (caso Vans / spec do usuario):
//   - HTML-as-PDF: o conteudo HTML e o wrapper do Drive Viewer e contem
//     `file/d/<idOriginal>` apontando para o PDF real. Localizar o original,
//     validar mimeType=application/pdf e parent da pasta mensal correta,
//     e MOVER o arquivo invalido para a mesma pasta mensal do original.
//   - XML-as-PDF: conteudo e XML fiscal valido. Parsear <dhEmi>/<dEmi> para
//     determinar o mes destino, renomear extensao .pdf -> .xml e mover.
//   - Sem original localizavel: mover para pasta raiz "Revisao-PDFs-08-2026"
//     e marcar REVIEW_REQUIRED.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ROOT_NOTAS_FISCAIS_ID = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const ORIGEM_PADRAO_08 = '1zLdKkd0CSyCGjZgjchmRooJl6MgdVvi7';
const PROPS_INTEGRITY = 'auditoria_pdf_integridade';
const PROPS_KEY = 'auditoria_pdf_emissao';
const PROPS_RECOVERY = 'auditoria_pdf_recuperacao';

function pad2(n) { return String(n).padStart(2, '0'); }

function parseDataEmissao(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}[Tt]/.test(s)) d = new Date(s);
  else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.substring(0, 10) + 'T12:00:00Z');
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (m) {
      const hh = m[4] ? Number(m[4]) : 12;
      const mi = m[5] ? Number(m[5]) : 0;
      const ss = m[6] ? Number(m[6]) : 0;
      d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hh, mi, ss));
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  return { ano: d.getUTCFullYear(), mes: pad2(d.getUTCMonth() + 1), dataIso: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` };
}

function unescapeXml(s) {
  if (!s) return s;
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function extractTag(xml, tags) {
  for (const tag of tags) {
    const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([^<]+)</' + tag + '>', 'i');
    const m = xml.match(re);
    if (m && m[1] && m[1].trim()) return unescapeXml(m[1].trim());
  }
  return null;
}

function parseXmlFiscal(xml) {
  const dhRaw = extractTag(xml, ['dhEmi', 'dEmi', 'dhSaida', 'dSaida', 'dhCont']);
  const info = parseDataEmissao(dhRaw);
  const num = extractTag(xml, ['nNF', 'nNFe', 'nNFS', 'nNfse', 'NNFS', 'NumeroNfse', 'Numero', 'numeroNfse', 'nRPS', 'numero']);
  let chave = extractTag(xml, ['chNFe', 'chaveAcesso', 'chave', 'CodVerificacao', 'codigoVerificacao']);
  if (chave) {
    const digits = String(chave).replace(/\D/g, '');
    if (digits.length === 44) chave = digits;
  }
  const cnpj = String(extractTag(xml, ['CNPJ', 'Cnpj', 'cnpj']) || '').replace(/\D/g, '') || null;
  const cpf = String(extractTag(xml, ['CPF', 'Cpf', 'cpf']) || '').replace(/\D/g, '') || null;
  const xNome = extractTag(xml, ['xNome', 'XNome', 'RazaoSocial', 'razaoSocial', 'razao_social']);
  const vRaw = extractTag(xml, ['vNF', 'vServ', 'vLCP', 'vTPrest', 'ValorServicos', 'valorServico', 'vTotNF', 'vLiq']);
  let valor = null;
  if (vRaw) { const s = String(vRaw).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'); const n = Number(s); if (Number.isFinite(n)) valor = n; }
  return { numero_nf: num, chave, cnpj_emit: cnpj, cpf_emit: cpf, emitente: xNome, valor, data_info: info };
}

async function getToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  return conn?.accessToken || conn?.access_token || conn?.token;
}

async function listFiles(token, folderId) {
  const items = [];
  let pt = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,md5Checksum,parents,appProperties),nextPageToken&pageSize=1000&supportsAllDrives=true`;
    if (pt) url += '&pageToken=' + encodeURIComponent(pt);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('listFiles ' + r.status);
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function listFoldersRoot(token, rootId, cache) {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'"+rootId+"' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'")}&fields=files(id,name)&pageSize=200&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!r.ok) return;
  const d = await r.json();
  for (const f of d.files || []) cache.set(f.name, f.id);
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent("name='" + String(name).replace(/'/g, "\\'") + "' and '" + parentId + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.files && d.files[0] ? d.files[0].id : null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error('createFolder "' + name + '": ' + d.error.message);
  return d.id;
}

async function getOrCreate(token, name, parentId, cache) {
  if (cache.has(name)) return cache.get(name);
  let id = await findFolder(token, name, parentId);
  if (!id) id = await createFolder(token, name, parentId);
  cache.set(name, id);
  return id;
}

async function getFileInfo(token, fileId) {
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,md5Checksum,trashed&supportsAllDrives=true`,
      { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function moveFile(token, fileId, addId, removeId) {
  const params = new URLSearchParams();
  params.set('addParents', addId);
  if (removeId && removeId !== addId) params.set('removeParents', removeId);
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}&supportsAllDrives=true`;
  const r = await fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } });
  return r.ok;
}

async function renameFile(token, fileId, newName) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  return r.ok;
}

async function setAppProps(token, fileId, props) {
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: props }),
    });
    return r.ok;
  } catch { return false; }
}

async function downloadText(token, fileId, maxBytes) {
  const headers = { Authorization: 'Bearer ' + token };
  if (maxBytes) headers.Range = `bytes=0-${maxBytes - 1}`;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers, signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error('download ' + r.status);
  return await r.text();
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  console.log('[recuperarPdfs08] handler iniciado t0=' + t0);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const COORD_GERAL = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
    if (user && user.role !== 'admin' && !COORD_GERAL.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const sourceFolderId = String(body.folderId || ORIGEM_PADRAO_08).trim();
    const rootFolderId = String(body.rootFolderId || ROOT_NOTAS_FISCAIS_ID).trim();

    let token;
    try { token = await getToken(base44); } catch (e) {
      return Response.json({ ok: false, error: 'Token Drive: ' + e.message }, { status: 503 });
    }

    const folderCache = new Map();
    await listFoldersRoot(token, rootFolderId, folderCache);

    let revisaoFolderId = null;

    const allFiles = await listFiles(token, sourceFolderId);
    const invalidos = allFiles.filter(f =>
      /\.pdf$/i.test(f.name) &&
      (f.appProperties?.[PROPS_INTEGRITY] === 'html' || f.appProperties?.[PROPS_INTEGRITY] === 'xml')
    );

    const results = [];
    let recuperados = 0, movidos = 0, reviewRequired = 0, erros = 0;
    const porStatus = {};

    for (const inv of invalidos) {
      const driveId = inv.id;
      const nomeAnterior = inv.name;
      const parentAnterior = (inv.parents && inv.parents[0]) || sourceFolderId;
      const integ = inv.appProperties?.[PROPS_INTEGRITY];

      let content;
      try { content = await downloadText(token, driveId, 65536); }
      catch (e) {
        results.push({ arquivo: nomeAnterior, status: 'ERROR', motivo: 'download falhou: ' + e.message, drive_file_id: driveId });
        erros++; porStatus.ERROR = (porStatus.ERROR || 0) + 1; continue;
      }

      // === XML-as-PDF ===
      if (integ === 'xml') {
        const fx = parseXmlFiscal(content);
        if (!fx.data_info) {
          results.push({ arquivo: nomeAnterior, status: 'REVIEW_REQUIRED', motivo: 'XML sem data emissao', drive_file_id: driveId });
          reviewRequired++; porStatus.REVIEW_REQUIRED = (porStatus.REVIEW_REQUIRED || 0) + 1; continue;
        }
        const mesDest = `${fx.data_info.mes}-${fx.data_info.ano}`;
        let targetId;
        try { targetId = await getOrCreate(token, mesDest, rootFolderId, folderCache); }
        catch (e) { results.push({ arquivo: nomeAnterior, status: 'ERROR', motivo: 'pasta destino: ' + e.message, drive_file_id: driveId }); erros++; porStatus.ERROR = (porStatus.ERROR || 0) + 1; continue; }

        const novoNome = nomeAnterior.replace(/\.pdf$/i, '.xml');
        if (!dryRun) {
          await renameFile(token, driveId, novoNome);
          const moveOk = await moveFile(token, driveId, targetId, parentAnterior);
          if (!moveOk) { results.push({ arquivo: nomeAnterior, status: 'ERROR', motivo: 'MOVE falhou', drive_file_id: driveId }); erros++; porStatus.ERROR = (porStatus.ERROR || 0) + 1; continue; }
          await setAppProps(token, driveId, {
            [PROPS_INTEGRITY]: 'CORRECT',
            [PROPS_RECOVERY]: 'xml_recovered:' + mesDest,
            [PROPS_KEY]: 'ok:' + mesDest,
          });
        }
        results.push({
          arquivo: nomeAnterior, status: 'SOURCE_RECOVERED', mes_destino: mesDest,
          novo_nome: novoNome, numero_nf: fx.numero_nf, cnpj_cpf: fx.cnpj_emit || fx.cpf_emit,
          emitente: fx.emitente, valor: fx.valor, data_emissao_iso: fx.data_info.dataIso,
          motivo: dryRun ? 'dry-run: renomearia e moveria para ' + mesDest : 'renomeado para .xml e movido para ' + mesDest,
          drive_file_id: driveId, parent_anterior: parentAnterior, parent_posterior: dryRun ? null : targetId,
        });
        recuperados++; movidos++;
        porStatus.SOURCE_RECOVERED = (porStatus.SOURCE_RECOVERED || 0) + 1;
        continue;
      }

      // === HTML-as-PDF ===
      const fileD = [...content.matchAll(/file\/d\/([a-zA-Z0-9_-]{20,})/g)].map(m => m[1]);
      const origId = fileD[0] || null;

      const moveParaRevisao = async (motivo, recoveryTag) => {
        if (!revisaoFolderId) revisaoFolderId = await getOrCreate(token, 'Revisao-PDFs-08-2026', rootFolderId, folderCache);
        if (!dryRun) {
          const moveOk = await moveFile(token, driveId, revisaoFolderId, parentAnterior);
          if (!moveOk) { results.push({ arquivo: nomeAnterior, status: 'ERROR', motivo: 'MOVE revisao falhou', drive_file_id: driveId }); erros++; porStatus.ERROR = (porStatus.ERROR || 0) + 1; return false; }
          await setAppProps(token, driveId, { [PROPS_INTEGRITY]: 'html', [PROPS_RECOVERY]: recoveryTag });
        }
        results.push({ arquivo: nomeAnterior, status: 'REVIEW_REQUIRED', motivo, drive_file_id: driveId });
        reviewRequired++; porStatus.REVIEW_REQUIRED = (porStatus.REVIEW_REQUIRED || 0) + 1;
        return true;
      };

      if (!origId) {
        const ok = await moveParaRevisao(dryRun ? 'dry-run: moveria para Revisao' : 'sem embed - movido para revisao', 'review:no_embed');
        if (!ok) continue;
        continue;
      }

      if (origId === driveId) {
        const ok = await moveParaRevisao('auto-referencia', 'review:self_ref');
        if (!ok) continue;
        continue;
      }

      // Busca original (aceita ate trashed desde que mimeType=application/pdf,
      // pois usamos apenas o parent do original para determinar a pasta mes destino)
      const orig = await getFileInfo(token, origId);
      if (!orig || orig.mimeType !== 'application/pdf') {
        const motivo = !orig ? 'original nao encontrado (404)' : 'original nao e PDF (mime=' + orig.mimeType + ')';
        const ok = await moveParaRevisao(motivo, 'review:orig_' + (!orig ? 'naoencontrado' : 'mime_' + orig.mimeType));
        if (!ok) continue;
        continue;
      }

      // Determina pasta mes destino pelo parent do original
      const origParent = (orig.parents && orig.parents[0]) || null;
      let mesDest = null, targetId = null;
      if (origParent) {
        for (const [nome, fid] of folderCache.entries()) {
          if (fid === origParent) { mesDest = nome; targetId = origParent; break; }
        }
        if (!mesDest) {
          const fi = await getFileInfo(token, origParent);
          if (fi?.name && /^\d{2}-\d{4}$/.test(fi.name)) { mesDest = fi.name; targetId = origParent; }
        }
      }

      if (!mesDest) {
        const ok = await moveParaRevisao('original em pasta nao mensal', 'review:no_target');
        if (!ok) continue;
        results[results.length - 1].embedded_id = origId;
        results[results.length - 1].orig_name = orig.name;
        continue;
      }

      if (!dryRun) {
        const moveOk = await moveFile(token, driveId, targetId, parentAnterior);
        if (!moveOk) { results.push({ arquivo: nomeAnterior, status: 'ERROR', motivo: 'MOVE falhou', drive_file_id: driveId }); erros++; porStatus.ERROR = (porStatus.ERROR || 0) + 1; continue; }
        await setAppProps(token, driveId, {
          [PROPS_INTEGRITY]: 'CORRECT',
          [PROPS_RECOVERY]: 'html_recovered_via_ref:' + origId,
          [PROPS_KEY]: 'ok:' + mesDest,
        });
      }
      results.push({
        arquivo: nomeAnterior, status: 'SOURCE_RECOVERED', mes_destino: mesDest,
        embedded_id: origId, orig_name: orig.name, orig_md5: orig.md5Checksum,
        motivo: dryRun ? 'dry-run: moveria para ' + mesDest + ' (mesmo parent do original)' : 'movido para ' + mesDest + ' (parent do original recuperado)',
        drive_file_id: driveId, parent_anterior: parentAnterior, parent_posterior: dryRun ? null : targetId,
      });
      recuperados++; movidos++;
      porStatus.SOURCE_RECOVERED = (porStatus.SOURCE_RECOVERED || 0) + 1;
    }

    try {
      if (!dryRun) {
        await base44.asServiceRole.entities.BackupLog.create({
          backup_type: 'auditoria_entrada_unica',
          entity_type: 'RECUPERACAO_PDF_08_2026',
          status: 'concluido',
          total_files: invalidos.length,
          files_copied: movidos,
          details: `invalidos=${invalidos.length} recuperados=${recuperados} revisao=${reviewRequired} erros=${erros}`,
          triggered_by: 'manual',
          processed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - t0,
        });
      }
    } catch (e) { console.warn('[recuperarPdfs08] BackupLog:', e.message); }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      source_folder_id: sourceFolderId,
      folder_origem: '08-2026',
      stats: {
        invalidos_analisados: invalidos.length,
        recuperados_via_referencia: recuperados,
        movidos,
        review_required: reviewRequired,
        erros,
        por_status: porStatus,
      },
      detalhes: results,
      elapsed_ms: Date.now() - t0,
    });
  } catch (error) {
    console.error('[recuperarPdfs08] erro:', error && error.message);
    return Response.json({ ok: false, error: (error && error.message) || 'Erro interno' }, { status: 500 });
  }
});