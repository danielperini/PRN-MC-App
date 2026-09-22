import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function present(photo, ...keys) {
  for (const key of keys) {
    const value = photo?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

async function syncReport(report) {
  const raw = asObject(report.raw_data);
  const photos = Array.isArray(raw.fotos) ? raw.fotos : [];
  if (!photos.length) return { created: 0, updated: 0, skipped: 0 };

  const existingRows = (await pool.query(
    'SELECT id,base44_id,drive_file_id,file_url FROM report_photos WHERE report_id::text = ANY($1::text[])',
    [[String(report.id), String(report.base44_id || '')].filter(Boolean)],
  )).rows;
  const byId = new Map(existingRows.filter((row) => row.base44_id).map((row) => [String(row.base44_id), row]));
  const bySource = new Map();
  existingRows.forEach((row) => {
    if (row.drive_file_id) bySource.set(`drive:${row.drive_file_id}`, row);
    if (row.file_url) bySource.set(`url:${row.file_url}`, row);
  });

  const totals = { created: 0, updated: 0, skipped: 0 };
  for (const [ordem, photo] of photos.entries()) {
    const fileUrl = String(present(photo, 'url', 'file_url')).trim();
    if (!fileUrl) {
      totals.skipped += 1;
      continue;
    }
    const driveFileId = String(present(photo, 'drive_file_id')).trim();
    const existing = byId.get(String(photo?.id || photo?.base44_id || ''))
      || (driveFileId ? bySource.get(`drive:${driveFileId}`) : null)
      || bySource.get(`url:${fileUrl}`);
    const base44Id = String(existing?.base44_id || photo?.base44_id || photo?.id || crypto.randomUUID());
    const fileName = String(present(photo, 'fileName', 'file_name', 'name') || `foto-${ordem + 1}`).slice(0, 500);
    const caption = String(present(photo, 'caption', 'legenda')).slice(0, 4000);
    const museum = String(present(photo, 'museum', 'museu') || report.museu || '').slice(0, 300);
    const activityId = String(present(photo, 'activityId', 'activity_id') || '') || null;
    const rawData = { ...photo, id: base44Id, url: fileUrl, fileName, caption, activityId, synced_from_report: String(report.id) };

    await pool.query(`INSERT INTO report_photos
      (base44_id,report_id,activity_id,drive_file_id,file_name,file_url,legenda,caption,author,museu,mes_referencia,ano,ordem,galeria_oculta,fonte_ia,drive_backup_status,raw_data,created_date,updated_date)
      VALUES ($1,$2,$3,NULLIF($4,''),$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,'upload_manual','pendente',$14::jsonb,NOW(),NOW())
      ON CONFLICT (base44_id) DO UPDATE SET
        report_id=EXCLUDED.report_id,activity_id=EXCLUDED.activity_id,file_name=EXCLUDED.file_name,file_url=EXCLUDED.file_url,
        legenda=EXCLUDED.legenda,caption=EXCLUDED.caption,author=EXCLUDED.author,museu=EXCLUDED.museu,
        mes_referencia=EXCLUDED.mes_referencia,ano=EXCLUDED.ano,ordem=EXCLUDED.ordem,galeria_oculta=EXCLUDED.galeria_oculta,
        drive_file_id=COALESCE(NULLIF(EXCLUDED.drive_file_id,''),report_photos.drive_file_id),
        drive_backup_status=CASE WHEN report_photos.drive_backup_status='concluido' THEN 'concluido' ELSE 'pendente' END,
        raw_data=EXCLUDED.raw_data,updated_date=NOW()`, [
      base44Id, String(report.id), activityId, driveFileId, fileName, fileUrl, caption,
      String(present(photo, 'author', 'created_by') || report.author_name || ''), museum,
      String(report.mes_referencia || ''), Number(report.ano || report.ano_referencia || 0) || null,
      Number.isFinite(Number(photo?.ordem)) ? Number(photo.ordem) : ordem,
      Boolean(photo?.galeria_oculta), JSON.stringify(rawData),
    ]);
    if (existing) totals.updated += 1;
    else totals.created += 1;
  }
  return totals;
}

try {
  const reports = (await pool.query(`SELECT id,base44_id,author_name,museu,mes_referencia,ano,raw_data
    FROM reports WHERE jsonb_typeof(raw_data->'fotos')='array'`)).rows;
  const totals = { reports: reports.length, created: 0, updated: 0, skipped: 0, errors: 0 };
  for (const report of reports) {
    try {
      const result = await syncReport(report);
      totals.created += result.created;
      totals.updated += result.updated;
      totals.skipped += result.skipped;
    } catch (error) {
      totals.errors += 1;
      console.error('SYNC_REPORT_GALLERY_FAILED', report.id, error.message);
    }
  }
  console.log(JSON.stringify(totals));
} finally {
  await pool.end();
}
