import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

import {
  buildNomeOficial,
  isNomeOficial,
  isMachineName,
  parseMachineName,
  parseLegacyName,
  extractNfNumGeneric,
  ensureUniqueName,
  resolveTeamMemberForPR,
} from '../_shared/nfNomeOficial.ts';

/**
 * renomearNFAprovada
 *
 * Renomeia os arquivos de uma PurchaseRequest específica (PDF/XML/Comprovante)
 * no Google Drive para o padrão oficial canônico (buildNomeOficial), de forma
 * idempotente e não-bloqueante.
 *
 * Acionada por automação de entidade quando o status da PurchaseRequest muda
 * para APROVADO_ADMIN. Também aceita chamada manual via functions.invoke ou
 * HTTP com { purchase_request_id }.
 *
 * Comportamento:
 *  - Se o backup no Drive ainda não foi concluído, computa o nome-alvo e
 *    retorna skipped — syncNotaFiscalDriveBackup já usa buildNomeOficial,
 *    então o arquivo nascerá com o nome correto.
 *  - Caso contrário, lista os arquivos da pasta mensal, filtra apenas os que
 *    pertencem a esta PR (por fileId em drive_backup_files ou por parsing do
 *    nome legado com match de nf_numero/sol-id), e renomeia no Drive.
 *  - Atualiza drive_backup_files da PR com os novos nomes.
 */

var FOLDER_MIME = 'application/vnd.google-apps.folder';

function safeStr(v) {
  return String(v == null ? '' : v).trim();
}

function classificarTipo(nome) {
  var lower = String(nome || '').toLowerCase();
  if (lower.endsWith('.xml')) return { tipo: 'XML', ext: 'xml' };
  if (lower.startsWith('comp') || lower.includes('comprovante') || lower.includes('recibo')) {
    return { tipo: 'COMP NF', ext: 'pdf' };
  }
  return { tipo: 'NF', ext: 'pdf' };
}

function arquivoPertencePR(file, pr) {
  var nome = String((file && file.name) || '');
  if (!nome) return false;
  var prId = String((pr && pr.id) || '');
  var idSuffix = prId.slice(-8).toLowerCase();

  if (isMachineName(nome)) {
    if (idSuffix && nome.toLowerCase().indexOf('sol-' + idSuffix) >= 0) return true;
  }

  var prNf = String((pr && pr.nf_numero) || '').trim();
  if (!prNf) return false;

  var nfNum = '';
  var legacy = parseLegacyName(nome);
  if (legacy && legacy.nfNum) nfNum = legacy.nfNum;
  if (!nfNum && isMachineName(nome)) {
    var machine = parseMachineName(nome);
    if (machine && machine.nfNum) nfNum = machine.nfNum;
  }
  if (!nfNum) nfNum = extractNfNumGeneric(nome);

  if (nfNum && nfNum === prNf) return true;

  if (isNomeOficial(nome)) {
    var m = nome.match(/^(?:NF|XML|COMP NF)\s+(\d+)\s+/i);
    if (m && m[1] === prNf) return true;
  }

  return false;
}

async function driveReq(token, url, opts) {
  opts = opts || {};
  return fetch(url, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {}),
  }));
}

async function listAllInFolder(token, folderId) {
  var items = [];
  var pt = null;
  do {
    var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
    var url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,mimeType)&pageSize=1000';
    if (pt) url += '&pageToken=' + encodeURIComponent(pt);
    var r = await driveReq(token, url);
    if (!r.ok) break;
    var d = await r.json();
    if (Array.isArray(d.files)) items = items.concat(d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function renameFile(token, fileId, newName) {
  var r = await driveReq(token, 'https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,name', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  var d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.name;
}

function extractPrId(body) {
  return (
    safeStr(body.purchase_request_id) ||
    safeStr(body.purchaseId) ||
    safeStr(body.entity_id) ||
    safeStr((body.event || {}).entity_id) ||
    safeStr((body.data || {}).id) ||
    safeStr(body.id)
  );
}

Deno.serve(async function (req) {
  var startedAt = Date.now();
  try {
    var base44 = createClientFromRequest(req);
    var body = await req.json().catch(function () { return {}; });

    var dryRun = body.dry_run === true || body.dryRun === true;

    var prId = extractPrId(body);
    if (!prId) {
      return Response.json({ ok: false, error: 'purchase_request_id obrigatório' }, { status: 400 });
    }

    var pr = await base44.asServiceRole.entities.PurchaseRequest.get(prId).catch(function () { return null; });
    if (!pr) {
      return Response.json({ ok: false, error: 'PurchaseRequest não encontrada' }, { status: 404 });
    }

    var token;
    try {
      var conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      token = conn.accessToken;
    } catch (e) {
      return Response.json({ ok: false, error: 'Google Drive não configurado' }, { status: 503 });
    }

    var teamMember = await resolveTeamMemberForPR(base44, pr).catch(function () { return null; });

    var folderId = safeStr(pr.drive_backup_folder_id);
    var backupConcluido = pr.drive_backup_status === 'concluido' && !!folderId;

    if (!backupConcluido) {
      var targetNames = {
        NF: buildNomeOficial(pr, null, 'NF', teamMember),
        XML: buildNomeOficial(pr, null, 'XML', teamMember),
        'COMP NF': buildNomeOficial(pr, null, 'COMP NF', teamMember),
      };
      console.log(
        '[renomearNFAprovada] PR ' + pr.id + ' backup pendente (' + pr.drive_backup_status + '). ' +
          'Nome-alvo preparado para syncNotaFiscalDriveBackup.'
      );
      return Response.json({
        ok: true,
        skipped: true,
        reason: 'backup_pendente',
        purchase_id: pr.id,
        drive_backup_status: pr.drive_backup_status || null,
        target_names: targetNames,
      });
    }

    var items = await listAllInFolder(token, folderId);
    var nomesExistentes = new Set(items.map(function (i) { return i.name; }));

    var prFiles = Array.isArray(pr.drive_backup_files) ? pr.drive_backup_files : [];
    var fileIdsDaPR = new Set(prFiles.map(function (f) { return safeStr(f.fileId); }).filter(Boolean));

    var renamed = [];
    var errors = [];
    var backupFilesAtualizado = prFiles.map(function (f) { return Object.assign({}, f); });

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.mimeType === FOLDER_MIME) continue;

      var porFileId = fileIdsDaPR.has(safeStr(item.id));
      var porNome = arquivoPertencePR(item, pr);
      if (!porFileId && !porNome) continue;

      if (isNomeOficial(item.name)) {
        renamed.push({ fileId: item.id, name: item.name, status: 'ja_padrao' });
        continue;
      }

      var tipoInfo = classificarTipo(item.name);
      var tipo = tipoInfo.tipo;
      var ext = tipoInfo.ext;
      var novoNome = buildNomeOficial(pr, null, tipo, teamMember);
      if (novoNome.toLowerCase().lastIndexOf('.' + ext) !== novoNome.length - (ext.length + 1)) {
        novoNome = novoNome.replace(/\.[^.]+$/, '') + '.' + ext;
      }

      if (novoNome === item.name) {
        renamed.push({ fileId: item.id, name: item.name, status: 'ja_padrao' });
        continue;
      }

      if (nomesExistentes.has(novoNome) && novoNome !== item.name) {
        novoNome = ensureUniqueName(novoNome, nomesExistentes);
      }

      if (dryRun) {
        renamed.push({ fileId: item.id, from: item.name, to: novoNome, status: 'simulado' });
        continue;
      }

      nomesExistentes.add(novoNome);
      nomesExistentes.delete(item.name);

      try {
        await renameFile(token, item.id, novoNome);
        renamed.push({ fileId: item.id, from: item.name, to: novoNome, status: 'renomeado' });
        for (var k = 0; k < backupFilesAtualizado.length; k++) {
          if (safeStr(backupFilesAtualizado[k].fileId) === safeStr(item.id)) {
            backupFilesAtualizado[k] = Object.assign({}, backupFilesAtualizado[k], { name: novoNome });
            break;
          }
        }
      } catch (e) {
        errors.push({ fileId: item.id, name: item.name, erro: (e && e.message) || String(e) });
        nomesExistentes.delete(novoNome);
        nomesExistentes.add(item.name);
      }
    }

    var renomeadosCount = renamed.filter(function (r) { return r.status === 'renomeado'; }).length;
    if (!dryRun && renomeadosCount > 0) {
      await base44.asServiceRole.entities.PurchaseRequest
        .update(pr.id, { drive_backup_files: backupFilesAtualizado })
        .catch(function (err) {
          console.warn('[renomearNFAprovada] Falha ao atualizar drive_backup_files: ' + ((err && err.message) || err));
        });
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      purchase_id: pr.id,
      folder_id: folderId,
      renomeados: renomeadosCount,
      simulados: renamed.filter(function (r) { return r.status === 'simulado'; }).length,
      ja_padrao: renamed.filter(function (r) { return r.status === 'ja_padrao'; }).length,
      erros: errors.length,
      renamed: renamed,
      errors: errors,
      execution_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[renomearNFAprovada] erro:', err);
    return Response.json({ ok: false, error: (err && err.message) || String(err) }, { status: 500 });
  }
});