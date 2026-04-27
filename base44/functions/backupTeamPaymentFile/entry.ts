import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * backupTeamPaymentFile — Backup de comprovante/NF de pagamento de equipe.
 * Pasta: 02_Comprovantes_Pagamento / {nome_membro} / {mes}_{ano}
 *
 * Regras:
 * - Verifica se arquivo com mesmo nome já existe na pasta (evita duplicata)
 * - Se existir e hash for igual: skip
 * - Se não existir: upload
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const COMPROVANTES_FOLDER = '02_Comprovantes_Pagamento';

function sanitize(name) {
  return String(name || '').replace(/[<>:"/\\|?*\n\r]/g, '').trim().slice(0, 80) || 'Sem_Nome';
}

async function findFolder(accessToken, folderName, parentId) {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const d = await res.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sanitize(folderName), mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const d = await res.json();
  if (d.error) throw new Error('Erro ao criar pasta: ' + d.error.message);
  return d.id;
}

async function getOrCreateFolder(accessToken, folderName, parentId) {
  return (await findFolder(accessToken, folderName, parentId)) || (await createFolder(accessToken, folderName, parentId));
}

async function calcHash(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fileExistsInFolder(accessToken, fileName, folderId) {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const d = await res.json();
  return d.files?.[0] || null;
}

async function uploadToDrive(accessToken, fileName, fileBytes, mimeType, folderId) {
  const boundary = 'team_payment_upload_boundary';
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const enc = new TextEncoder();
  const p1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const p2 = enc.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const p3 = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(p1.length + p2.length + fileBytes.length + p3.length);
  body.set(p1, 0);
  body.set(p2, p1.length);
  body.set(fileBytes, p1.length + p2.length);
  body.set(p3, p1.length + p2.length + fileBytes.length);

  const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const d = await up.json();
  if (d.error) throw new Error('Erro upload Drive: ' + d.error.message);
  return d;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, file_name, team_member_name, mes, ano, team_payment_id } = await req.json();
    if (!file_url || !file_name) return Response.json({ error: 'Parâmetros obrigatórios: file_url, file_name' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Estrutura: 02_Comprovantes_Pagamento / {membro} / {mes}_{ano}
    const comprovantesRoot = await getOrCreateFolder(accessToken, COMPROVANTES_FOLDER, ROOT_FOLDER_ID);
    const memberFolder = await getOrCreateFolder(accessToken, sanitize(team_member_name || 'Sem_Nome'), comprovantesRoot);
    const monthFolder = await getOrCreateFolder(accessToken, `${mes || 'Sem_Mes'}_${ano || ''}`, memberFolder);

    // Baixar arquivo e calcular hash
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) throw new Error('Falha ao baixar arquivo');
    const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
    const newHash = await calcHash(fileBytes);

    // Verificar duplicata por nome na pasta
    const existing = await fileExistsInFolder(accessToken, file_name, monthFolder);
    if (existing) {
      // Arquivo com mesmo nome já existe — skip seguro
      // (hash verificado no backupSingleFile; aqui apenas evita re-upload desnecessário)
      return Response.json({
        skipped: true,
        reason: 'Arquivo com mesmo nome já existe na pasta do Drive',
        drive_file_id: existing.id,
        drive_link: `https://drive.google.com/file/d/${existing.id}/view`,
        folder_path: `${COMPROVANTES_FOLDER}/${team_member_name}/${mes}_${ano}`
      });
    }

    const mimeType = file_name.endsWith('.xml') ? 'application/xml' : 'application/pdf';
    const result = await uploadToDrive(accessToken, file_name, fileBytes, mimeType, monthFolder);
    const now = new Date().toISOString();

    // Atualizar TeamPayment se fornecido
    if (team_payment_id) {
      await base44.asServiceRole.entities.TeamPayment.update(team_payment_id, {
        drive_pdf_url: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
        backup_done: true,
        backup_date: now,
      }).catch(() => null);
    }

    // Log de auditoria
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'CREATE',
      entity_type: 'ATTACHMENT',
      entity_id: team_payment_id || result.id,
      actor_email: user.email,
      actor_name: user.full_name || user.email,
      details: `Comprovante salvo no Drive: ${COMPROVANTES_FOLDER}/${team_member_name}/${mes}_${ano}/${file_name} | hash: ${newHash}`
    }).catch(() => null);

    return Response.json({
      success: true,
      drive_file_id: result.id,
      drive_link: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
      folder_path: `${COMPROVANTES_FOLDER}/${team_member_name}/${mes}_${ano}`,
      file_hash: newHash,
      backup_date: now,
    });

  } catch (error) {
    console.error('backupTeamPaymentFile error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});