import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * backupSingleFile — Backup de um Attachment para o Google Drive.
 *
 * Lógica:
 * 1. Busca o Attachment pelo ID
 * 2. Se backup_done + drive_file_id + hash não mudou → skip
 * 3. Calcula SHA-256 do arquivo
 * 4. Se hash mudou e tem drive_file_id → PATCH (atualiza conteúdo)
 * 5. Se não tem drive_file_id → upload na pasta correta por tipo
 *
 * Estrutura de pastas (root: 1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7):
 *   01_Notas_Fiscais / PDF  (nf_tipo_documento === 'pdf_nf' ou mime=pdf + tem nf_numero)
 *   01_Notas_Fiscais / XML  (nf_tipo_documento === 'xml_nf')
 *   03_Fotos_Atividades / {museu}  (imagens)
 *   07_Documentos_Administrativos  (demais)
 *
 * Usa cache de IDs de pasta via AuditLog (details = cache_key).
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const CACHE_KEY_PREFIX = 'drive_folder_id__';

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(v) {
  return String(v || 'Sem_Nome').trim().replace(/[\/\\:*?"<>|]/g, '_').slice(0, 80) || 'Sem_Nome';
}

async function sha256Hex(data) {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createFolder(accessToken, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${name}": ${data.error.message}`);
  return data.id;
}

async function listChildren(accessToken, parentId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.files || [];
}

async function getOrCreateCached(base44, accessToken, name, parentId) {
  const cacheKey = `${CACHE_KEY_PREFIX}${parentId}__${name}`;

  // Tenta cache via AuditLog
  const cached = await base44.asServiceRole.entities.AuditLog
    .filter({ details: cacheKey })
    .catch(() => []);

  if (cached?.length > 0 && cached[0].entity_id?.length > 10) {
    return cached[0].entity_id;
  }

  // Verifica se já existe no Drive
  const children = await listChildren(accessToken, parentId);
  const existing = children.find(f => f.name === name);
  const folderId = existing ? existing.id : await createFolder(accessToken, name, parentId);

  // Salva cache
  await base44.asServiceRole.entities.AuditLog.create({
    action: 'CREATE',
    entity_type: 'ATTACHMENT',
    entity_id: folderId,
    actor_email: 'system',
    actor_name: 'Backup System',
    details: cacheKey,
  }).catch(() => null);

  return folderId;
}

async function uploadFile(accessToken, blob, name, folderId) {
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' }));
  formData.append('file', blob, name);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
  );
  const data = await res.json();
  if (data.error) throw new Error('Erro no upload: ' + data.error.message);
  return data.id;
}

async function patchFile(accessToken, fileId, blob, name) {
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name })], { type: 'application/json' }));
  formData.append('file', blob, name);
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
  );
  const data = await res.json();
  if (data.error) throw new Error('Erro no PATCH: ' + data.error.message);
  return data.id;
}

// ── Roteamento de pasta por tipo de arquivo ───────────────────────────────────

async function resolveTargetFolder(base44, accessToken, attachment) {
  const isNfXml = attachment.nf_tipo_documento === 'xml_nf';
  const isNfPdf = attachment.nf_tipo_documento === 'pdf_nf' || (attachment.nf_numero && /\.pdf$/i.test(attachment.file_name || ''));
  const isPhoto = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.file_name || '') || /^image\//i.test(attachment.file_type || '');

  if (isNfXml) {
    const nfRoot = await getOrCreateCached(base44, accessToken, '01_Notas_Fiscais', ROOT_FOLDER_ID);
    return await getOrCreateCached(base44, accessToken, 'XML', nfRoot);
  }

  if (isNfPdf) {
    const nfRoot = await getOrCreateCached(base44, accessToken, '01_Notas_Fiscais', ROOT_FOLDER_ID);
    return await getOrCreateCached(base44, accessToken, 'PDF', nfRoot);
  }

  if (isPhoto) {
    const fotosRoot = await getOrCreateCached(base44, accessToken, '03_Fotos_Atividades', ROOT_FOLDER_ID);
    // Tenta determinar museu pelo relatório
    let museu = 'Geral';
    if (attachment.report_id) {
      const report = await base44.asServiceRole.entities.Report.get(attachment.report_id).catch(() => null);
      if (report?.museu) museu = sanitize(report.museu);
    }
    return await getOrCreateCached(base44, accessToken, museu, fotosRoot);
  }

  // Documentos administrativos genéricos
  return await getOrCreateCached(base44, accessToken, '07_Documentos_Administrativos', ROOT_FOLDER_ID);
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const attachment_id =
      body?.attachment_id ||
      body?.entity_id ||
      body?.event?.entity_id ||
      body?.data?.entity_id ||
      null;

    if (!attachment_id) {
      return Response.json({ error: 'attachment_id obrigatório' }, { status: 400 });
    }

    const attachment = await base44.asServiceRole.entities.Attachment.get(attachment_id);
    if (!attachment) return Response.json({ error: 'Attachment não encontrado' }, { status: 404 });
    if (!attachment.file_url) return Response.json({ error: 'Arquivo sem URL' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Baixa o arquivo
    const fileResponse = await fetch(attachment.file_url);
    if (!fileResponse.ok) return Response.json({ error: 'Erro ao baixar arquivo' }, { status: 400 });
    const fileBlob = await fileResponse.blob();
    const fileBuffer = await fileBlob.arrayBuffer();
    const newHash = await sha256Hex(new Uint8Array(fileBuffer));

    // Hash igual ao anterior → skip
    if (attachment.backup_done && attachment.drive_file_id && attachment.file_hash === newHash) {
      return Response.json({
        skipped: true,
        reason: 'Conteúdo sem alteração',
        attachment_id,
        drive_file_id: attachment.drive_file_id,
        file_hash: newHash,
      });
    }

    const now = new Date().toISOString();
    let driveFileId;
    let action;

    if (attachment.drive_file_id && attachment.backup_done) {
      // PATCH — atualiza conteúdo no Drive
      driveFileId = await patchFile(accessToken, attachment.drive_file_id, fileBlob, attachment.file_name);
      action = 'patched';
    } else {
      // Novo upload na pasta correta
      const targetFolderId = await resolveTargetFolder(base44, accessToken, attachment);
      driveFileId = await uploadFile(accessToken, fileBlob, attachment.file_name, targetFolderId);
      action = 'uploaded';
    }

    await base44.asServiceRole.entities.Attachment.update(attachment_id, {
      backup_done: true,
      drive_file_id: driveFileId,
      backup_date: now,
      file_hash: newHash,
      last_synced_at: now,
    });

    return Response.json({
      success: true,
      action,
      attachment_id,
      drive_file_id: driveFileId,
      drive_link: `https://drive.google.com/file/d/${driveFileId}/view`,
      file_hash: newHash,
      backup_date: now,
    });

  } catch (error) {
    console.error('Erro no backupSingleFile:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});