import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Sincronização diária espelho: Fotos e Arquivos → Google Drive
 * 
 * Estrutura no Drive:
 *   Fotos/
 *     <NomeAutor>/
 *       foto1.jpg ...
 *   Documentos/
 *     Anexos/
 *       <NomeAutor>/
 *         arquivo1.pdf ...
 * 
 * Regras:
 *  - Novos arquivos do app → sobem para o Drive
 *  - Arquivo já no Drive (mesmo nome na mesma pasta) → substitui se mudou (atualiza conteúdo)
 *  - Arquivo deletado do app (sem drive_file_id no Attachment) → não deleta do Drive automaticamente
 *  - Marca backup_done=true e drive_file_id no Attachment após upload
 */

const FOTOS_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';
const DOCUMENTOS_FOLDER_ID = '1psLJvyj6sNuO7kscJIjrCsINgRBTQq_1';

async function findFolder(accessToken, folderName, parentFolderId) {
  const q = encodeURIComponent(`name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentFolderId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Criar pasta '${folderName}': ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  return (await findFolder(accessToken, folderName, parentFolderId)) || (await createFolder(accessToken, folderName, parentFolderId));
}

// Lista todos os arquivos (não pastas) de uma pasta do Drive
async function listDriveFiles(accessToken, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files || [];
}

// Upload de novo arquivo
async function uploadFile(accessToken, fileName, blob, mimeType, parentFolderId) {
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [parentFolderId] })], { type: 'application/json' }));
  formData.append('file', blob, fileName);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData
  });
  const result = await res.json();
  if (result.error) throw new Error('Upload error: ' + result.error.message);
  return result.id;
}

// Atualiza conteúdo de arquivo existente no Drive
async function updateFileContent(accessToken, driveFileId, blob, mimeType) {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': mimeType || 'application/octet-stream' },
    body: blob
  });
  const result = await res.json();
  if (result.error) throw new Error('Update error: ' + result.error.message);
  return result.id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Suporte a chamada de automação (sem usuário) ou via frontend (com usuário admin)
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Apenas admins podem executar esta função' }, { status: 403 });
      }
    } catch {
      isScheduled = true; // chamada automática sem contexto de usuário
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Buscar todos os Attachments
    const attachments = await base44.asServiceRole.entities.Attachment.list('-created_date', 5000);

    // Buscar todos os Reports para resolver nome do autor
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 2000);
    const reportMap = {};
    for (const r of reports) reportMap[r.id] = r;

    const stats = { uploaded: 0, updated: 0, skipped: 0, errors: 0 };
    const log = [];

    for (const att of attachments) {
      if (!att.file_url || !att.file_name) { stats.skipped++; continue; }

      const isPhoto = /\.(jpg|jpeg|png|gif|webp|bmp|tiff|svg)$/i.test(att.file_name) || /^image\//i.test(att.file_type || '');

      // Resolver nome do autor
      const report = att.report_id ? reportMap[att.report_id] : null;
      const authorName = (report?.author_name || 'Sem_Usuario').replace(/[\/\\:*?"<>|]/g, '_').trim() || 'Sem_Usuario';

      // Determinar pasta destino
      let targetFolderId;
      if (isPhoto) {
        targetFolderId = await getOrCreateFolder(accessToken, authorName, FOTOS_FOLDER_ID);
      } else {
        const anexosFolderId = await getOrCreateFolder(accessToken, 'Anexos', DOCUMENTOS_FOLDER_ID);
        targetFolderId = await getOrCreateFolder(accessToken, authorName, anexosFolderId);
      }

      // Listar arquivos existentes na pasta destino
      const driveFiles = await listDriveFiles(accessToken, targetFolderId);
      const existingByName = {};
      for (const f of driveFiles) existingByName[f.name] = f.id;

      // Download do arquivo do app
      let blob;
      try {
        const fileRes = await fetch(att.file_url);
        if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
        blob = await fileRes.blob();
      } catch (e) {
        stats.errors++;
        log.push(`✗ Erro ao baixar ${att.file_name}: ${e.message}`);
        continue;
      }

      const mimeType = att.file_type || 'application/octet-stream';
      let driveFileId;
      let action;

      try {
        if (existingByName[att.file_name]) {
          // Arquivo já existe: atualizar conteúdo (espelho)
          driveFileId = await updateFileContent(accessToken, existingByName[att.file_name], blob, mimeType);
          stats.updated++;
          action = 'atualizado';
        } else {
          // Arquivo novo: upload
          driveFileId = await uploadFile(accessToken, att.file_name, blob, mimeType, targetFolderId);
          stats.uploaded++;
          action = 'enviado';
        }

        // Marcar backup no banco
        const backupDate = new Date().toISOString();
        await base44.asServiceRole.entities.Attachment.update(att.id, {
          backup_done: true,
          drive_file_id: driveFileId,
          backup_date: backupDate
        });
        log.push(`✓ ${action}: ${isPhoto ? 'Fotos' : 'Documentos/Anexos'}/${authorName}/${att.file_name}`);
      } catch (e) {
        stats.errors++;
        log.push(`✗ Erro ao sincronizar ${att.file_name}: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      message: 'Sincronização diária concluída',
      stats,
      total: attachments.length,
      log: log.slice(0, 200)
    });

  } catch (error) {
    console.error('Erro na sincronização diária:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});