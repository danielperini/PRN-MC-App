import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncContratoDrive — Sincroniza contratos/pagamentos de equipe para o Google Drive.
 *
 * Estrutura:
 *   ROOT/2026/05 - Maio/Contratos/
 *     Prestadores/
 *     Fornecedores/
 *
 * Renomeação:
 *   CONTRATO - {nome} - {funcao} - {competencia}.pdf
 *
 * Acionado por automação de entidade TeamPayment (create/update)
 * ou chamado manualmente com { team_payment_id }.
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const CACHE_PREFIX = 'contrato_drive_folder__';
const MAX_SIZE = 25 * 1024 * 1024;

const MESES_NUM = {
  'Janeiro': '01', 'Fevereiro': '02', 'Março': '03', 'Abril': '04',
  'Maio': '05', 'Junho': '06', 'Julho': '07', 'Agosto': '08',
  'Setembro': '09', 'Outubro': '10', 'Novembro': '11', 'Dezembro': '12'
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function sanitize(v, max = 60) {
  return String(v || '').trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, max) || 'Desconhecido';
}

function getMesPasta(mes, ano) {
  const num = MESES_NUM[mes] || '00';
  return `${num} - ${mes}`;
}

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function listFolders(accessToken, parentId) {
  const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.files || [];
}

async function createFolder(accessToken, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Criar pasta "${name}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(base44, accessToken, name, parentId) {
  const cacheKey = `${CACHE_PREFIX}${parentId}__${name}`;
  const cached = await base44.asServiceRole.entities.AuditLog.filter({ details: cacheKey }).catch(() => []);
  if (cached?.length > 0 && cached[0].entity_id?.length > 10) return cached[0].entity_id;

  const children = await listFolders(accessToken, parentId);
  const existing = children.find(f => f.name === name);
  const folderId = existing ? existing.id : await createFolder(accessToken, name, parentId);

  await base44.asServiceRole.entities.AuditLog.create({
    action: 'CREATE', entity_type: 'ATTACHMENT', entity_id: folderId,
    actor_email: 'system', actor_name: 'Contrato Drive Sync', details: cacheKey,
  }).catch(() => null);

  return folderId;
}

async function uploadFile(accessToken, blob, name, folderId) {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' }));
  fd.append('file', blob, name);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd
  });
  const data = await res.json();
  if (data.error) throw new Error('Upload: ' + data.error.message);
  return data.id;
}

async function patchFile(accessToken, fileId, blob, name) {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name })], { type: 'application/json' }));
  fd.append('file', blob, name);
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` }, body: fd
  });
  const data = await res.json();
  if (data.error) throw new Error('Patch: ' + data.error.message);
  return data.id;
}

async function syncUrl(base44, accessToken, url, driveFileId, newName, folderId) {
  if (!url) return null;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const sizeH = resp.headers.get('content-length');
  if (sizeH && parseInt(sizeH, 10) > MAX_SIZE) return null;
  const blob = await resp.blob();
  const buffer = await blob.arrayBuffer();
  const hash = await sha256Hex(new Uint8Array(buffer));

  let fileId, action;
  if (driveFileId) {
    fileId = await patchFile(accessToken, driveFileId, blob, newName);
    action = 'atualizado';
  } else {
    fileId = await uploadFile(accessToken, blob, newName, folderId);
    action = 'enviado';
  }
  return { fileId, action, hash };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const teamPaymentId = body?.team_payment_id || body?.data?.id || body?.event?.entity_id;
    if (!teamPaymentId) return Response.json({ error: 'team_payment_id obrigatório' }, { status: 400 });

    const tp = await base44.asServiceRole.entities.TeamPayment.get(teamPaymentId).catch(() => null);
    if (!tp) return Response.json({ error: 'TeamPayment não encontrado' }, { status: 404 });

    // Só sincronizar aprovados/pagos
    const statusOk = new Set(['APROVADO', 'APROVADO_ADMIN', 'PAGO', 'approved', 'paid']);
    if (!statusOk.has(String(tp.status || '').toUpperCase()) && !statusOk.has(String(tp.status || ''))) {
      return Response.json({ skipped: true, reason: 'nao_aprovado', status: tp.status });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const now = new Date();
    const mes = tp.mes_referencia || MESES[now.getMonth()];
    const ano = tp.ano || now.getFullYear();
    const nome = sanitize(tp.membro_nome || tp.nome || tp.prestador_nome || 'SemNome', 40);
    const funcao = sanitize(tp.funcao || tp.cargo || 'Prestador', 30);
    const competencia = `${mes} ${ano}`;

    const anoFolder = await getOrCreateFolder(base44, accessToken, String(ano), ROOT_FOLDER_ID);
    const mesFolder = await getOrCreateFolder(base44, accessToken, getMesPasta(mes, ano), anoFolder);
    const contrFolder = await getOrCreateFolder(base44, accessToken, 'Contratos', mesFolder);
    const subcat = tp.tipo === 'fornecedor' ? 'Fornecedores' : 'Prestadores';
    const targetFolder = await getOrCreateFolder(base44, accessToken, subcat, contrFolder);

    const results = [];
    const newName = `CONTRATO - ${nome} - ${funcao} - ${competencia}.pdf`;

    // URL do arquivo do contrato
    const fileUrl = tp.arquivo_url || tp.contrato_url || tp.file_url || tp.nota_fiscal_url;
    if (fileUrl) {
      const r = await syncUrl(base44, accessToken, fileUrl, tp.drive_file_id || null, newName, targetFolder);
      if (r) {
        await base44.asServiceRole.entities.TeamPayment.update(teamPaymentId, {
          drive_file_id: r.fileId,
          backup_done: true,
          last_synced_at: new Date().toISOString(),
        }).catch(() => null);
        results.push({ nome: newName, action: r.action, drive_file_id: r.fileId });
      }
    }

    // NF vinculada
    if (tp.nota_fiscal_url && tp.nota_fiscal_url !== fileUrl) {
      const nfName = `NF - ${nome} - ${funcao} - ${competencia}.pdf`;
      const r = await syncUrl(base44, accessToken, tp.nota_fiscal_url, null, nfName, targetFolder);
      if (r) results.push({ nome: nfName, action: r.action, drive_file_id: r.fileId });
    }

    return Response.json({
      success: true,
      team_payment_id: teamPaymentId,
      nome,
      competencia,
      pasta: `${ano}/${getMesPasta(mes, ano)}/Contratos/${subcat}`,
      results,
    });

  } catch (error) {
    console.error('Erro syncContratoDrive:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});