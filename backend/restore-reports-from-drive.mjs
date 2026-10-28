import pg from 'pg';
import { google } from 'googleapis';

// Idempotent restoration of report backup links. It never creates a report from
// a PDF filename: records are only updated when their canonical database id
// already exists, preventing duplicate or fabricated reports.
const apply = process.argv.includes('--apply');
const approvedFolderId = process.argv.find(a => a.startsWith('--approved-folder-id='))?.slice(21)
  || process.env.GOOGLE_DRIVE_APPROVED_REPORTS_FOLDER_ID || '1VJADgTZEE1_DPRDYVZQjrGtAKNaqvsFA';
const pool = new pg.Pool({ host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor', password: process.env.POSTGRES_PASSWORD || '' });
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();

async function main() {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) throw new Error('Google Drive não configurado');
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth });
  const files = [];
  const walk = async parent => {
    let token;
    do {
      const r = await drive.files.list({ q: `'${parent}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)', pageSize: 1000, pageToken: token, supportsAllDrives: true, includeItemsFromAllDrives: true });
      for (const f of r.data.files || []) { if (f.mimeType === 'application/vnd.google-apps.folder') await walk(f.id); else files.push(f); }
      token = r.data.nextPageToken;
    } while (token);
  };
  await walk(approvedFolderId);
  const candidates = files.filter(f => /\.pdf$/i.test(f.name) && /(?:^|_)ID-(\d+)(?:\.pdf|_)/i.test(f.name));
  const db = await pool.connect();
  const summary = { mode: apply ? 'apply' : 'dry_run', driveFiles: candidates.length, linked: 0, alreadyLinked: 0, missingDatabaseReports: [], failed: 0 };
  try {
    for (const file of candidates) {
      const id = file.name.match(/(?:^|_)ID-(\d+)(?:\.pdf|_)/i)?.[1];
      if (!id) continue;
      const found = (await db.query('SELECT id,status,drive_backup_relatorio_id FROM reports WHERE id::text=$1 LIMIT 1', [id])).rows[0];
      if (!found) { summary.missingDatabaseReports.push({ id, file: file.name }); continue; }
      if (found.drive_backup_relatorio_id === file.id) { summary.alreadyLinked++; continue; }
      if (apply) await db.query(`UPDATE reports SET drive_backup_relatorio_id=$1, drive_backup_relatorio_url=$2, drive_backup_status='concluido', drive_backup_at=NOW(), updated_date=NOW() WHERE id=$3`, [file.id, file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`, id]);
      summary.linked++;
    }
  } finally { db.release(); await pool.end(); }
  console.log('REPORT_DRIVE_RESTORE', JSON.stringify(summary));
}
main().catch(err => { console.error('REPORT_DRIVE_RESTORE_ERROR', clean(err.message)); process.exitCode = 1; });
