import pg from 'pg';
import { google } from 'googleapis';

const apply = process.argv.includes('--apply');
const pool = new pg.Pool({ host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432), database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor', password: process.env.POSTGRES_PASSWORD || '' });
const rootId = process.env.GOOGLE_DRIVE_PHOTO_BACKUP_ROOT_ID || '1Lf3PB53WXV0ZwGgtr6etsrzp9Jyv465B';
const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const clean = v => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._ -]+/g, '').replace(/\s+/g, '_').slice(0, 100) || 'sem_nome';
const json = v => { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch { return {}; } };
const date = v => String(v || '').match(/^(20\d{2})[-:](0[1-9]|1[0-2])[-:]([0-2]\d|3[01])/)?.[0]?.replaceAll(':','-') || '';
const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET); auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth });
async function folders() { return (await drive.files.list({ q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id,name)', pageSize: 1000 })).data.files || []; }
const stats = { mode: apply ? 'apply' : 'dry_run', scanned: 0, renamed: 0, moved: 0, missing: 0, skipped: 0 };
try {
  const rows = (await pool.query(`SELECT id,drive_file_id,file_name,raw_data,report_id,mes_referencia,ano FROM report_photos WHERE duplicada_de IS NULL AND drive_file_id IS NOT NULL ORDER BY id`)).rows;
  const known = await folders(); const byName = new Map(known.map(f => [f.name, f]));
  for (const p of rows) {
    stats.scanned++; const raw = json(p.raw_data); const capture = date(raw.data_foto || raw.data_atividade || p.created_date);
    const key = capture ? capture.slice(0,7) : `${p.ano}-${String(months.indexOf(p.mes_referencia)+1).padStart(2,'0')}`;
    const [year, month] = key.split('-'); const folderName = `${key} - ${months[Number(month)-1] || month}`;
    let target = byName.get(folderName);
    if (!target && apply) { target = (await drive.files.create({ requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }, fields: 'id,name' })).data; byName.set(folderName, target); }
    if (!target) { stats.skipped++; continue; }
    try {
      const file = (await drive.files.get({ fileId: p.drive_file_id, fields: 'id,name,parents,trashed' })).data;
      if (file.trashed) { stats.missing++; continue; }
      const desired = `Foto_${p.id}_${clean(p.file_name)}`;
      const oldMonthly = (file.parents || []).find(parent => known.some(f => f.id === parent));
      if (file.name !== desired) { stats.renamed++; if (apply) await drive.files.update({ fileId: file.id, requestBody: { name: desired }, fields: 'id,name' }); }
      if (!(file.parents || []).includes(target.id)) { stats.moved++; if (apply) await drive.files.update({ fileId: file.id, addParents: target.id, removeParents: oldMonthly || undefined, fields: 'id,parents' }); }
    } catch { stats.missing++; }
  }
  console.log('REPORT_PHOTO_BACKUP_REPAIR', JSON.stringify(stats));
} finally { await pool.end(); }
