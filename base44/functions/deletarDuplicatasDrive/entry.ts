import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function listFiles(accessToken, parentId) {
  let files = [];
  let pageToken = null;
  do {
    let url = `https://www.googleapis.com/drive/v3/files?q='${parentId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,createdTime)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function trashFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  });
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const folderId = payload.folderId || '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
    const dryRun = payload.dryRun !== false;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Lista raiz
    const rootFiles = await listFiles(accessToken, folderId);
    const subfolders = rootFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const rootOnlyFiles = rootFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    const allFolders = [{ folderId, folderName: 'ROOT', files: rootOnlyFiles }];
    for (const sf of subfolders) {
      const sfFiles = await listFiles(accessToken, sf.id);
      allFolders.push({ folderId: sf.id, folderName: sf.name, files: sfFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder') });
    }

    let totalTrashed = 0;
    const report = [];

    for (const { folderId: fid, folderName, files } of allFolders) {
      // Agrupa por nome exato (case-insensitive)
      const byName = {};
      for (const f of files) {
        const key = f.name.toLowerCase().trim();
        if (!byName[key]) byName[key] = [];
        byName[key].push(f);
      }

      const deleted = [];
      for (const [, group] of Object.entries(byName)) {
        if (group.length > 1) {
          const sorted = group.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
          const toRemove = sorted.slice(1); // mantém o mais antigo
          for (const rem of toRemove) {
            if (!dryRun) await trashFile(accessToken, rem.id);
            deleted.push(rem.name);
            totalTrashed++;
          }
        }
      }

      if (deleted.length > 0) {
        report.push({ folder: folderName, deleted });
      }
    }

    return Response.json({ dryRun, totalTrashed, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});