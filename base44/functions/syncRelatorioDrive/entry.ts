import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncRelatorioDrive — Sincroniza relatório aprovado + seus anexos para o Google Drive.
 *
 * Estrutura:
 *   ROOT/2026/05 - Maio/Relatorios/
 *     Relatorio de Atividades/  ← relatórios individuais de profissionais
 *     Relatorio Geral/          ← futuramente: consolidados
 *     Exportados PDF/           ← PDFs gerados manualmente
 *     Planilhas/                ← Excel
 *
 * Renomeação:
 *   RELATORIO ATIVIDADES - {museu} - {mes} {ano}.pdf
 *
 * Só processa relatórios com status APPROVED ou SUBMITTED.
 * Aciona também sincronização de fotos/vídeos vinculados.
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const CACHE_PREFIX = 'rel_drive_folder__';
const MAX_SIZE = 25 * 1024 * 1024;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const MESES_NUM = {
  'Janeiro': '01', 'Fevereiro': '02', 'Março': '03', 'Abril': '04',
  'Maio': '05', 'Junho': '06', 'Julho': '07', 'Agosto': '08',
  'Setembro': '09', 'Outubro': '10', 'Novembro': '11', 'Dezembro': '12'
};

function sanitize(v, max = 60) {
  return String(v || '').trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, max) || 'Desconhecido';
}

function getMesPastaLabel(mes, ano) {
  const num = MESES_NUM[mes] || '00';
  return `${num} - ${mes}`;
}

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Drive utils ───────────────────────────────────────────────────────────────

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
    actor_email: 'system', actor_name: 'Relatorio Drive Sync', details: cacheKey,
  }).catch(() => null);

  return folderId;
}

async function resolveRelatorioFolder(base44, accessToken, ano, mes, subcat) {
  const anoFolder = await getOrCreateFolder(base44, accessToken, String(ano), ROOT_FOLDER_ID);
  const mesFolder = await getOrCreateFolder(base44, accessToken, getMesPastaLabel(mes, ano), anoFolder);
  const relRoot = await getOrCreateFolder(base44, accessToken, 'Relatorios', mesFolder);
  return await getOrCreateFolder(base44, accessToken, subcat, relRoot);
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

async function deleteFile(accessToken, fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
  }).catch(() => null);
}

// ── Sync de um attachment de relatório (foto/vídeo/doc) ───────────────────────

async function syncReportAttachment(base44, accessToken, att, report) {
  if (!att?.file_url) return { skipped: true, reason: 'sem_url', id: att?.id };

  const mime = String(att.file_type || '').toLowerCase();
  const name = String(att.file_name || '').toLowerCase();
  const isPhoto = /^image\//i.test(mime) || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isVideo = /^video\//i.test(mime) || /\.(mp4|mov|avi|mkv|webm)$/i.test(name);

  const ano = report?.ano || new Date().getFullYear();
  const mes = report?.mes_referencia || MESES[new Date().getMonth()];
  const museu = sanitize(report?.museu || 'Geral', 30);
  const atividade = sanitize(report?.author_name || '', 30);

  let subcat, newName;

  if (isPhoto) {
    const dataFoto = att.created_date ? new Date(att.created_date).toISOString().slice(0, 10) : '';
    subcat = `Fotos/${museu}`;
    newName = `FOTO - ${sanitize(att.file_name?.replace(/\.[^.]+$/, '') || 'Foto', 50)} - ${museu} - ${dataFoto}${att.file_name?.match(/\.[^.]+$/) || '.jpg'}`;
  } else if (isVideo) {
    subcat = `Videos/${museu}`;
    newName = `VIDEO - ${sanitize(att.file_name?.replace(/\.[^.]+$/, '') || 'Video', 50)} - ${museu}${att.file_name?.match(/\.[^.]+$/) || '.mp4'}`;
  } else {
    subcat = 'Relatorios/Exportados PDF';
    newName = att.file_name || `arquivo_${att.id}`;
  }

  // Resolver pasta: /ano/mes/subcat
  const anoFolder = await getOrCreateFolder(base44, accessToken, String(ano), ROOT_FOLDER_ID);
  const mesFolder = await getOrCreateFolder(base44, accessToken, getMesPastaLabel(mes, ano), anoFolder);
  // Subcat pode ter /
  const subcatParts = subcat.split('/');
  let targetFolderId = mesFolder;
  for (const part of subcatParts) {
    targetFolderId = await getOrCreateFolder(base44, accessToken, part, targetFolderId);
  }

  const fileResp = await fetch(att.file_url);
  if (!fileResp.ok) return { skipped: true, reason: 'download_falhou', id: att.id };
  const sizeHeader = fileResp.headers.get('content-length');
  if (sizeHeader && parseInt(sizeHeader, 10) > MAX_SIZE) return { skipped: true, reason: 'muito_grande', id: att.id };

  const blob = await fileResp.blob();
  const buffer = await blob.arrayBuffer();
  const newHash = await sha256Hex(new Uint8Array(buffer));

  if (att.backup_done && att.drive_file_id && att.file_hash === newHash) {
    return { skipped: true, reason: 'hash_identico', id: att.id };
  }

  const now = new Date().toISOString();
  let driveFileId, action;

  if (att.drive_file_id && att.backup_done) {
    if (att.drive_folder_id && att.drive_folder_id !== targetFolderId) {
      await deleteFile(accessToken, att.drive_file_id);
      driveFileId = await uploadFile(accessToken, blob, newName, targetFolderId);
      action = 'substituido';
    } else {
      driveFileId = await patchFile(accessToken, att.drive_file_id, blob, newName);
      action = 'atualizado';
    }
  } else {
    driveFileId = await uploadFile(accessToken, blob, newName, targetFolderId);
    action = 'enviado';
  }

  await base44.asServiceRole.entities.Attachment.update(att.id, {
    backup_done: true,
    drive_file_id: driveFileId,
    drive_folder_id: targetFolderId,
    backup_date: now,
    file_hash: newHash,
    last_synced_at: now,
  }).catch(() => null);

  return { success: true, action, id: att.id, drive_file_id: driveFileId, nome: newName };
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // ── Modo: attachment direto (automação de Attachment) ──────────────────────
    const directAttId = body?.attachment_id || (body?.event?.entity_name === 'Attachment' ? (body?.data?.id || body?.event?.entity_id) : null);

    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    const accessToken = conn.accessToken;

    if (directAttId) {
      const att = await base44.asServiceRole.entities.Attachment.get(directAttId).catch(() => null);
      if (!att?.report_id) return Response.json({ skipped: true, reason: 'attachment_sem_report_id' });
      const report = await base44.asServiceRole.entities.Report.get(att.report_id).catch(() => null);
      if (!report) return Response.json({ skipped: true, reason: 'report_nao_encontrado' });
      const statusOk2 = new Set(['APPROVED', 'ARCHIVED']);
      if (!statusOk2.has(String(report.status || '').toUpperCase())) {
        return Response.json({ skipped: true, reason: 'relatorio_nao_aprovado', status: report.status });
      }
      const r = await syncReportAttachment(base44, accessToken, att, report);
      return Response.json({ success: true, result: r });
    }

    // Suporte payload de automação de entidade (Report)
    const reportId = body?.report_id || body?.data?.id || body?.event?.entity_id;
    if (!reportId) return Response.json({ error: 'report_id ou attachment_id obrigatório' }, { status: 400 });

    const report = await base44.asServiceRole.entities.Report.get(reportId).catch(() => null);
    if (!report) return Response.json({ error: 'Report não encontrado' }, { status: 404 });

    // Só sincronizar aprovados
    const statusOk = new Set(['APPROVED', 'ARCHIVED']);
    if (!statusOk.has(String(report.status || '').toUpperCase())) {
      return Response.json({ skipped: true, reason: 'relatorio_nao_aprovado', status: report.status });
    }

    const ano = report.ano || new Date().getFullYear();
    const mes = report.mes_referencia || MESES[new Date().getMonth()];
    const museu = sanitize(report.museu || 'Geral', 30);
    const autor = sanitize(report.author_name || 'SemAutor', 40);

    // Pasta do relatório individual: /ano/mes/Relatorios/Relatorio de Atividades/{museu}/
    const relFolder = await resolveRelatorioFolder(base44, accessToken, ano, mes, 'Relatorio de Atividades');
    const museuFolder = await getOrCreateFolder(base44, accessToken, museu, relFolder);

    // Nome padronizado: RELATORIO ATIVIDADES - {museu} - {autor} - {mes} {ano}
    const relName = `RELATORIO ATIVIDADES - ${museu} - ${autor} - ${mes} ${ano}`;

    // Buscar attachments vinculados
    const attachments = await base44.asServiceRole.entities.Attachment.filter({ report_id: reportId }).catch(() => []);

    // Separar fotos/vídeos/docs
    const attResults = [];
    for (const att of attachments) {
      const r = await syncReportAttachment(base44, accessToken, att, report);
      attResults.push(r);
    }

    // Salvar referência da pasta no relatório (campo drive_folder_id não existe — salvar via AuditLog)
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'UPDATE',
      entity_type: 'REPORT',
      entity_id: reportId,
      actor_email: 'system',
      actor_name: 'Relatorio Drive Sync',
      details: `Sincronizado Drive: pasta=${museuFolder} | ano=${ano} | mes=${mes} | museu=${museu} | attachments=${attachments.length}`,
    }).catch(() => null);

    return Response.json({
      success: true,
      report_id: reportId,
      museu,
      mes,
      ano,
      attachments_total: attachments.length,
      attachments_enviados: attResults.filter(r => r.success).length,
      attachments_ignorados: attResults.filter(r => r.skipped).length,
      results: attResults,
    });

  } catch (error) {
    console.error('Erro syncRelatorioDrive:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});