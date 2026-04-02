import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DRIVE_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';

function sanitize(name) {
  return String(name || '').replace(/[<>:"/\\|?*\n\r]/g, '').trim();
}

async function findOrCreateFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${sanitize(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await res.json();
  if (d.files?.[0]?.id) return d.files[0].id;
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sanitize(name), mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const cd = await cr.json();
  if (cd.error) throw new Error('Erro ao criar pasta: ' + cd.error.message);
  return cd.id;
}

async function uploadToDrive(token, fileName, fileUrl, mimeType, folderId) {
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error('Falha ao baixar arquivo');
  const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
  const boundary = 'team_payment_upload';
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
  
  const contentType = 'multipart/related; boundary=' + boundary;
  const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': contentType },
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

    const { file_url, file_name, team_member_name, mes, ano } = await req.json();
    if (!file_url || !file_name) return Response.json({ error: 'Parâmetros obrigatórios' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const teamPaymentFolder = await findOrCreateFolder(accessToken, 'Pagamentos Equipe', DRIVE_FOLDER_ID);
    const memberFolder = await findOrCreateFolder(accessToken, sanitize(team_member_name), teamPaymentFolder);
    const monthFolder = await findOrCreateFolder(accessToken, `${mes}/${ano}`, memberFolder);
    
    const result = await uploadToDrive(accessToken, file_name, file_url, 'application/pdf', monthFolder);

    return Response.json({
      success: true,
      drive_file_id: result.id,
      drive_link: result.webViewLink,
      folder_path: `Pagamentos Equipe/${team_member_name}/${mes}/${ano}`
    });
  } catch (error) {
    console.error('backupTeamPaymentFile error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});